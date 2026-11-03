/**
 * The tutor's voice relay (docs/SUPER.md §4), a small WebSocket server on Cloud Run (europe-west1), started with
 * `node lib/relay.js`. The phone talks to it; it talks to Gemini Live on Vertex AI as the service account (or with
 * Darsi's Gemini API key when config/tutor says backend "gemini"), and no credential ever reaches a phone. It checks Super and the credits, gives the tutor the lesson and the course search, and charges each turn
 * at whichever is higher: Google's reported tokens or the audio's own minutes at Google's per-minute prices.
 *
 * Phone → relay: {type:"hello", token, unitId, lessonId, lang, style} first; then binary 8 kHz μ-law microphone audio,
 * {type:"text", text}, or {type:"bye"}.
 * Relay → phone: {type:"ready", left} · binary 8 kHz μ-law tutor audio · {type:"said"|"heard", text} ·
 * {type:"sources", items} · {type:"explainer", pkg} (a Lesson Studio package from the tutor agent, agent.ts) ·
 * {type:"interrupted"} · {type:"turn"} · {type:"credits", used, left} · {type:"out"} ·
 * {type:"error", code}; then it closes.
 */
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { auth } from "./admin.js";
import { askAgent } from "./agent.js";
import { balance, charge, GEMINI_KEY, googleToken, hasSuper, loadUnit, trackIndex, tutorConfig, tutorReady, vertexModel } from "./tutor.js";
import { EXPLAIN_TOOL, SEARCH_TOOL, audioCost, down3, instructions, lessonMaterial, pcmToUlaw, searchBoth, ulawToPcm, usageCost, type TutorLang, type Usage } from "./tutorCore.js";

// GEMINI_LIVE_URL and VERTEX_LIVE_URL let the checks use a stand-in.
const LIVE = process.env.GEMINI_LIVE_URL ?? "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const ORIGINS = (process.env.TUTOR_ORIGINS ?? "https://darsiai.org,http://localhost:5173").split(",");
const IDLE_MS = 90_000;

const server = createServer((req, res) => { res.writeHead(req.url === "/healthz" ? 200 : 404).end(req.url === "/healthz" ? "ok" : ""); });
const wss = new WebSocketServer({ server, path: "/live", maxPayload: 64 * 1024, verifyClient: ({ origin }: { origin?: string }) => !origin || ORIGINS.includes(origin) });

wss.on("connection", (phone: WebSocket) => {
  const send = (o: unknown) => { if (phone.readyState === WebSocket.OPEN) phone.send(JSON.stringify(o)); };
  const fail = (code: string) => { send({ type: "error", code }); phone.close(); };
  let gem: WebSocket | null = null, uid = "", lastActive = Date.now(), closed = false;
  // agentUsd: explainers from the tutor agent, charged on top of the voice (whose cost is the higher of tokens and minutes).
  let inSec = 0, outSec = 0, tokenUsd = 0, agentUsd = 0, chargedUsd = 0;
  let idle: NodeJS.Timeout | null = null, cap: NodeJS.Timeout | null = null;
  const helloWait = setTimeout(() => fail("no-hello"), 10_000);

  const settle = async (final = false) => {
    if (!uid) return;
    const cost = Math.max(tokenUsd, audioCost(inSec, outSec, cfgLive!)) + agentUsd;
    const due = cost - chargedUsd;
    if (due <= 0) return;
    chargedUsd = cost;
    const r = await charge(uid, due, "voice").catch(() => null);
    if (!r) return;
    send({ type: "credits", used: r.credits, left: r.left });
    if (!r.ok && !final) { send({ type: "out" }); end(); }
  };
  let cfgLive: Awaited<ReturnType<typeof tutorConfig>>["live"] | null = null;
  const end = () => {
    if (closed) return;
    closed = true;
    [helloWait, idle, cap].forEach((t) => t && clearTimeout(t));
    void settle(true);
    gem?.close();
    if (phone.readyState === WebSocket.OPEN) phone.close();
  };
  phone.on("close", end);
  phone.on("error", end);

  phone.on("message", async (data: Buffer, binary: boolean) => {
    lastActive = Date.now();
    if (binary) {
      // Microphone audio, 8 kHz μ-law: the Live API takes 16-bit PCM at any rate it is told.
      if (!gem || gem.readyState !== WebSocket.OPEN) return;
      inSec += data.length / 8000;
      const pcm = ulawToPcm(new Uint8Array(data));
      gem.send(JSON.stringify({ realtimeInput: { audio: { data: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString("base64"), mimeType: "audio/pcm;rate=8000" } } }));
      return;
    }
    let m: { type?: string; token?: string; unitId?: string; lessonId?: string; lang?: string; style?: string; text?: string };
    try { m = JSON.parse(data.toString("utf8")); } catch { return; }
    if (m.type === "text" && gem?.readyState === WebSocket.OPEN && m.text) { gem.send(JSON.stringify({ realtimeInput: { text: String(m.text).slice(0, 1500) } })); return; }
    if (m.type === "bye") { end(); return; }
    if (m.type !== "hello" || uid) return;
    clearTimeout(helloWait);

    const user = await auth.verifyIdToken(String(m.token ?? "")).catch(() => null);
    if (!user) return fail("auth");
    if (!hasSuper(user)) return fail("no-super");
    const cfg = await tutorConfig();
    cfgLive = cfg.live;
    if (!tutorReady(cfg)) return fail("tutor-closed");
    if ((await balance(user.uid)) <= 0) return fail("no-credits");
    const orgId = (user.orgId as string | undefined) ?? null;
    const unit = await loadUnit(String(m.unitId ?? "").slice(0, 64), orgId);
    if (!unit) return fail("no-course");
    uid = user.uid;
    const lang: TutorLang = m.lang === "ar" ? "ar" : "en";
    const lessonId = String(m.lessonId ?? "").slice(0, 80) || null;
    const lesson = unit.lessons.find((l) => l.id === lessonId);
    const ix = await trackIndex(unit, orgId, lang), ixEn = lang === "en" ? null : await trackIndex(unit, orgId, "en");
    const agentOn = cfg.engine === "agent" && !!cfg.agentId;
    let agentSession = "";
    const sys = instructions({ lang, course: unit.title[lang] ?? unit.title.en, lesson: lesson ? (lesson.title[lang] ?? lesson.title.en) : "", material: lessonMaterial(unit, lessonId, lang, 10000), voice: true, style: String(m.style ?? "").slice(0, 60), explain: agentOn });
    /** The explain tool: the tutor agent makes the explainer, the phone plays it, and the voice gets its scenes to talk through. */
    const explain = async (topic: string): Promise<string> => {
      try {
        const r = await askAgent({ cfg, uid, orgId, unit, lessonId, lang, question: topic.slice(0, 600), show: true, sessionId: agentSession || undefined, ix, en: ixEn });
        agentSession = r.sessionId;
        agentUsd += r.usd;
        if (!r.explainer) return "The explainer couldn't be made this time. Explain it in words instead.";
        send({ type: "explainer", pkg: r.explainer });
        return r.explainer.scenes.scenes.map((s, i) => `Scene ${i + 1}: ${(s.narration as Record<string, string>)[lang]}`).join("\n");
      } catch (e) {
        console.error("explain failed", String(e));
        return "The explainer couldn't be made this time. Explain it in words instead.";
      }
    };

    const vertex = cfg.backend === "vertex";
    gem = vertex
      ? new WebSocket(process.env.VERTEX_LIVE_URL ?? `wss://${cfg.liveLocation}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`, { headers: { Authorization: `Bearer ${await googleToken()}` } })
      : new WebSocket(`${LIVE}?key=${encodeURIComponent(GEMINI_KEY.value())}`);
    gem.on("open", () => gem!.send(JSON.stringify({ setup: {
      model: vertex ? vertexModel(cfg.vertexProject, cfg.liveLocation, cfg.liveModel) : `models/${cfg.liveModel}`,
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: cfg.voice } } } },
      systemInstruction: { parts: [{ text: sys }] },
      tools: [{ functionDeclarations: agentOn ? [SEARCH_TOOL, EXPLAIN_TOOL] : [SEARCH_TOOL] }],
      inputAudioTranscription: {}, outputAudioTranscription: {},
      realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 700 } },
    } })));
    gem.on("message", async (raw: Buffer) => {
      let s: { setupComplete?: unknown; serverContent?: { modelTurn?: { parts?: { inlineData?: { data?: string } }[] }; interrupted?: boolean; turnComplete?: boolean; inputTranscription?: { text?: string }; outputTranscription?: { text?: string } }; toolCall?: { functionCalls?: { id: string; name: string; args?: { query?: string } }[] }; usageMetadata?: Usage; goAway?: unknown };
      try { s = JSON.parse(raw.toString("utf8")); } catch { return; }
      if (s.setupComplete) {
        send({ type: "ready", left: await balance(uid) });
        idle = setInterval(() => { if (Date.now() - lastActive > IDLE_MS) end(); }, 15_000);
        cap = setTimeout(() => { send({ type: "error", code: "time" }); end(); }, cfg.maxMinutes * 60_000);
      }
      const sc = s.serverContent;
      for (const p of sc?.modelTurn?.parts ?? []) {
        if (!p.inlineData?.data) continue;
        // The tutor's voice, 24 kHz PCM, sent on as 8 kHz μ-law: about 64 kbit/s while it speaks.
        const b = Buffer.from(p.inlineData.data, "base64");
        const pcm = down3(new Int16Array(b.buffer, b.byteOffset, Math.floor(b.byteLength / 2)));
        outSec += pcm.length / 8000;
        lastActive = Date.now();
        if (phone.readyState === WebSocket.OPEN) phone.send(pcmToUlaw(pcm), { binary: true });
      }
      if (sc?.inputTranscription?.text) send({ type: "heard", text: sc.inputTranscription.text });
      if (sc?.outputTranscription?.text) send({ type: "said", text: sc.outputTranscription.text });
      if (sc?.interrupted) send({ type: "interrupted" });
      if (s.usageMetadata) tokenUsd += usageCost(s.usageMetadata, cfg.live);
      if (sc?.turnComplete) { send({ type: "turn" }); await settle(); }
      for (const fc of s.toolCall?.functionCalls ?? []) {
        if (fc.name === "explain") {
          const result = await explain(String((fc.args as { topic?: string } | undefined)?.topic ?? ""));
          if (gem?.readyState === WebSocket.OPEN) gem.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: fc.id, name: fc.name, response: { result } }] } }));
          continue;
        }
        const hits = fc.name === "search_course" ? searchBoth(ix, ixEn, String(fc.args?.query ?? ""), 3, unit.id) : [];
        send({ type: "sources", items: hits.map((h) => ({ id: h.s.id, unitId: h.s.unitId, lessonId: h.s.lessonId, stepId: h.s.stepId, lesson: h.s.lesson })) });
        gem!.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: fc.id, name: fc.name, response: { result: hits.length ? hits.map((h) => `[${h.s.id}] (${h.s.course}: ${h.s.lesson})\n${h.s.text.slice(0, 2000)}`).join("\n\n") : "Nothing in the learner's courses covers this. It is outside the courses." } }] } }));
      }
      if (s.goAway) { send({ type: "error", code: "time" }); end(); }
    });
    gem.on("close", (code: number, reason: Buffer) => { if (!closed) { console.warn("gemini closed", code, reason.toString().slice(0, 200)); fail("tutor-gone"); } });
    gem.on("error", (e: Error) => { console.error("gemini error", String(e)); fail("tutor-gone"); });
  });
});

server.listen(Number(process.env.PORT ?? 8080), () => console.log(`tutor relay on ${process.env.PORT ?? 8080}`));
