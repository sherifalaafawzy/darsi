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
 * A relay with no room accepts the socket and says {type:"error", code:"busy"}; one that is stopping says
 * "tutor-gone" to every phone, settles each call and exits. One learner's failed step ends that learner's call only.
 * Logs are JSON lines (`log`), /health reports the sockets held. Operating notes: TECHNICAL.md.
 */
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { auth, db } from "./admin.js";
import { AgentError, askAgent } from "./agent.js";
import { balance, charge, endCall, GEMINI_KEY, googleToken, hasSuper, loadUnit, minuteCredits, startCall, trackIndex, tutorConfig, tutorReady, vertexModel } from "./tutor.js";
import type { Hold } from "./billingCore.js";
import { originAllowed, parseOrigins, siteOrigins } from "./origins.js";
import { APPROVED } from "./shared/sites.js";
import { hasAccess, readSiteDoc } from "./sitesCore.js";
import { EXPLAIN_TOOL, SEARCH_TOOL, audioCost, down3, instructions, lessonMaterial, pcmToUlaw, searchBoth, ulawToPcm, usageCost, type TutorLang, type Usage } from "./tutorCore.js";

// GEMINI_LIVE_URL and VERTEX_LIVE_URL let the checks use a stand-in.
const LIVE = process.env.GEMINI_LIVE_URL ?? "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
// Only Darsi's own site in production, plus organization sites with "https://*.darsiai.org" (origins.ts); `npm run
// local` passes its address in TUTOR_ORIGINS (L9).
const ORIGINS = parseOrigins(process.env.TUTOR_ORIGINS ?? "https://darsiai.org");
// Any other organization address that may sign people in now (sites/{host}): the list, read every two minutes.
const siteAllowed = siteOrigins(async () => (await db.collection("sites").where("status", "in", [...APPROVED]).get()).docs
  .map((d) => readSiteDoc(d.id, d.data())).filter((s) => s !== null && hasAccess(s)).map((s) => s!.host));
/**
 * One JSON line per event on stdout: Cloud Logging reads `severity` and `message` and keeps the rest as fields to
 * search by (uid, call). `err` becomes `error` and `stack`. Never a token, audio or what anyone said; an error's text
 * is cleaned of anything that looks like a key, in case a URL or header ended up in it.
 */
type Severity = "INFO" | "WARNING" | "ERROR";
const scrub = (s: string) => s.replace(/([?&]key=)[^&\s"']+/gi, "$1…").replace(/(Bearer\s+)[\w.~+/=-]+/gi, "$1…");
function log(severity: Severity, message: string, fields: Record<string, unknown> = {}) {
  const { err, ...rest } = fields;
  const e = err === undefined ? {} : err instanceof Error ? { error: scrub(`${err.name}: ${err.message}`), stack: scrub(String(err.stack ?? "")) } : { error: scrub(String(err)) };
  let line: string;
  try { line = JSON.stringify({ severity, message, ...rest, ...e }); } catch { line = JSON.stringify({ severity, message, error: "unloggable fields" }); }
  process.stdout.write(`${line}\n`);
}
const envInt = (name: string, fallback: number) => { const n = Number(process.env[name]); return Number.isInteger(n) && n > 0 ? n : fallback; };
/**
 * The brakes on anyone opening connections they never use (M6). RELAY_MAX_SOCKETS: phones per instance (keep it just
 * under Cloud Run's --concurrency, so the relay answers "busy" itself before Cloud Run queues the request).
 * RELAY_MAX_PENDING_PER_IP: sockets per address that have not finished their hello. Only those count per address: a
 * class behind one school address is one address, and once a socket has signed in with Super and credits its limit is
 * the one voice call per account (startCall's lease).
 */
const MAX_SOCKETS = envInt("RELAY_MAX_SOCKETS", 300), MAX_PENDING_PER_IP = envInt("RELAY_MAX_PENDING_PER_IP", 40);
const pending = new Map<string, number>();
let sockets = 0;
/**
 * The caller's address: the last X-Forwarded-For entry, the one Google's front end adds on Cloud Run (sfm-10). The
 * entries before it are whatever the caller sent, so keying on the first let anyone pass the per-address limit by
 * sending a new one with every socket. (Phones reach the relay on its run.app address, not through Hosting, so the
 * CDN's headers that functions/src/clientIp.ts reads aren't there, and a caller could set them.)
 */
export const ipOf = (req: { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } }) => {
  const h = req.headers["x-forwarded-for"];
  const hops = (Array.isArray(h) ? h.join(",") : String(h ?? "")).split(",").map((s) => s.trim()).filter(Boolean);
  return hops[hops.length - 1] || req.socket.remoteAddress || "?";
};
/** Warm-ups per minute per instance: they read only public courses, but each may build a search index. */
let warms = { at: 0, n: 0 };
const IDLE_MS = 90_000;

/**
 * Charges still being written after a phone hung up (an explainer that came back after it, the call's last turn), and
 * hellos still being checked (one may yet hold credits). Cloud Run stops an instance with SIGTERM and gives it 10
 * seconds: they finish first.
 */
const settling = new Set<Promise<unknown>>();
/** How to end each connection that is open now: a stopping instance ends its calls itself, so each is charged and its credits released. */
const live = new Set<() => void>();
let stopping = false;
/**
 * Stops the instance: no new connections, every call ended (the last charge, then the hold released), and at most 8
 * seconds for those writes. A second signal while this runs does nothing, so nothing is settled twice.
 */
function stop(code: number) {
  if (stopping) return;
  stopping = true;
  log("INFO", "relay: stopping", { sockets, code });
  server.close();
  for (const end of [...live]) end();
  // In turns: a hello that was mid-check when its call ended adds its own release after the first look.
  const idle = (async () => { while (settling.size) await Promise.allSettled([...settling]); })();
  void new Promise<void>((ok) => { const t = setTimeout(ok, 8_000); void idle.then(() => { clearTimeout(t); ok(); }); }).finally(() => process.exit(code));
}
process.on("SIGTERM", () => stop(0));
// A promise nobody caught is one learner's failed step, not a reason to end every call on the instance: logged, and
// the relay keeps running. An exception nobody caught leaves the process in an unknown state: the calls are settled,
// then it exits and Cloud Run starts another.
process.on("unhandledRejection", (e) => log("ERROR", "relay: unhandled rejection", { err: e }));
process.on("uncaughtException", (e) => { log("ERROR", "relay: uncaught exception", { err: e }); stop(1); });

/**
 * GET /warm?u=<unitId>&l=<lang>, sent by the phone when the tutor panel opens: it wakes an instance (Cloud Run scales
 * to zero, and a cold start took 3 s), and warms the settings, Google's token and a public course's search index, so a
 * call that follows starts at once. It reads nothing private and answers nothing.
 * GET /health answers 200 {ok, sockets} for a probe or a dashboard. (Cloud Run reserves /healthz.)
 */
export const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://relay");
  if (url.pathname === "/health") { res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify({ ok: true, sockets })); return; }
  if (url.pathname !== "/warm") { res.writeHead(404).end(); return; }
  res.writeHead(204, { "Cache-Control": "no-store" }).end();
  if (Date.now() - warms.at > 60_000) warms = { at: Date.now(), n: 0 };
  if (++warms.n > 60) return;
  const lang = url.searchParams.get("l") === "ar" ? "ar" : "en";
  void tutorConfig().then((cfg) => (cfg.backend === "vertex" ? googleToken() : null)).catch(() => null);
  void loadUnit(String(url.searchParams.get("u") ?? "").slice(0, 64), null)
    .then((unit) => unit && Promise.all([trackIndex(unit, null, lang), lang === "en" ? null : trackIndex(unit, null, "en")])).catch(() => null);
});
// An Origin header is required (browsers always send one), and it must be Darsi's or an approved organization address
// (L9): any other page is refused at the handshake. Room is checked after it (below), so a full relay can say so.
const wss = new WebSocketServer({
  server, path: "/live", maxPayload: 64 * 1024, perMessageDeflate: false,
  verifyClient: ({ origin }: { origin?: string }, done: (ok: boolean) => void) => {
    if (originAllowed(origin, ORIGINS)) { done(true); return; }
    siteAllowed(origin).then((ok) => done(ok), () => done(false));
  },
});

let hopsLogged = false;
wss.on("connection", (phone: WebSocket, req: Parameters<typeof ipOf>[0]) => {
  const ip = ipOf(req);
  // Once per instance, how many X-Forwarded-For entries arrive (no addresses): a phone's own connection should have
  // one, which confirms Google's front end adds the last (sfm-10).
  if (!hopsLogged) { hopsLogged = true; log("INFO", "relay: x-forwarded-for entries", { entries: String(req.headers["x-forwarded-for"] ?? "").split(",").filter((s) => s.trim()).length }); }
  // No room: the socket is accepted, told "busy" and closed, so the app can say the tutor is busy (a refused
  // handshake shows a browser nothing but a failed connection). It is never counted and gets three seconds to go.
  const waiting = pending.get(ip) ?? 0;
  const full = stopping ? "stopping" : sockets >= MAX_SOCKETS ? "instance-full" : waiting >= MAX_PENDING_PER_IP ? "address-pending" : null;
  if (full) {
    log("WARNING", "relay: refused", { reason: full, sockets, maxSockets: MAX_SOCKETS, pendingForAddress: waiting, maxPendingPerAddress: MAX_PENDING_PER_IP });
    phone.on("error", () => {});
    phone.send(JSON.stringify({ type: "error", code: "busy" }));
    phone.close();
    setTimeout(() => phone.terminate(), 3_000).unref();
    return;
  }
  sockets++;
  pending.set(ip, waiting + 1);
  // Leaves the per-address count once: when its hello has passed every check, or when it closes, whichever is first.
  let unsigned = true;
  const signedIn = () => { if (!unsigned) return; unsigned = false; const n = (pending.get(ip) ?? 1) - 1; if (n > 0) pending.set(ip, n); else pending.delete(ip); };
  const send = (o: unknown) => { if (phone.readyState === WebSocket.OPEN) phone.send(JSON.stringify(o)); };
  const fail = (code: string) => { send({ type: "error", code }); phone.close(); };
  // callId: for the logs (`call` is emptied when its credits are released). greeting: a hello is being checked.
  let gem: WebSocket | null = null, uid = "", callId = "", greeting = false, lastActive = Date.now(), closed = false;
  // agentUsd: explainers from the tutor agent, charged on top of the voice (whose cost is the higher of tokens and minutes).
  let inSec = 0, outSec = 0, tokenUsd = 0, agentUsd = 0, chargedUsd = 0;
  // The call's place and the credits held for it (startCall, M5); `short`: credits a turn cost beyond the balance.
  let call: { id: string; hold: Hold } | null = null, short = 0;
  let idle: NodeJS.Timeout | null = null, cap: NodeJS.Timeout | null = null;
  const helloWait = setTimeout(() => fail("no-hello"), 10_000);

  const settle = async (final = false) => {
    if (!uid) return;
    const cost = Math.max(tokenUsd, audioCost(inSec, outSec, cfgLive!)) + agentUsd;
    const due = cost - chargedUsd;
    if (due <= 0) return;
    chargedUsd = cost;
    const r = await charge(uid, due, "voice").catch((e) => { log("ERROR", "relay: charge failed", { uid, call: callId, err: e }); return null; });
    // A turn that couldn't be charged ends the call (fail closed): the talking is never free.
    if (!r) { if (!final) { send({ type: "error", code: "tutor-gone" }); end(); } return; }
    short += r.short;
    send({ type: "credits", used: r.credits, left: r.left });
    if (!r.ok && !final) { send({ type: "out" }); end(); }
  };
  /** After the last charge: what a turn couldn't take comes out of the credits held, the rest goes back. */
  const release = async () => {
    if (!call) return;
    const c = call; call = null;
    await endCall(uid, c.id, c.hold, short).catch((e) => log("ERROR", "relay: hold not released", { uid, call: c.id, err: e }));
  };
  let cfgLive: Awaited<ReturnType<typeof tutorConfig>>["live"] | null = null;
  // The explainer being made (one at a time per call), so a hang-up waits for its cost before the last charge (sfm-02).
  let explaining: Promise<void> | null = null;
  const end = () => {
    if (closed) return;
    closed = true;
    clearTimeout(helloWait);
    if (idle) clearInterval(idle);
    if (cap) clearTimeout(cap);
    // The agent's turn runs on after a hang-up and Darsi pays for it: its cost is charged when it comes back, before
    // the credits held for the call are settled and released, so what it cost beyond the balance comes out of the
    // hold. The voice place is kept until then, so hanging up on a drawing and calling again doesn't skip the charge.
    const last = Promise.resolve(explaining).catch(() => {}).then(() => settle(true)).finally(() => release());
    settling.add(last);
    void last.finally(() => settling.delete(last));
    gem?.close();
    if (phone.readyState === WebSocket.OPEN) phone.close();
  };
  phone.on("close", end);
  phone.on("error", end);
  // A stopping instance tells the phone before it ends the call, so the app shows a message, not a silent hang-up.
  const shut = () => { send({ type: "error", code: "tutor-gone" }); end(); };
  live.add(shut);
  phone.once("close", () => { sockets--; signedIn(); live.delete(shut); });

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
    if (m.type !== "hello" || uid || greeting) return;
    greeting = true;
    clearTimeout(helloWait);
    // A stopping instance waits for a hello in flight too: it may hold credits a moment after its call was ended.
    let greeted!: () => void;
    const hello = new Promise<void>((ok) => { greeted = ok; });
    settling.add(hello);
    // Everything from here to the end of the hello is one learner's: a settings or course read that fails ends this
    // call with "tutor-gone", not the process and every other call on the instance with it.
    try {
      // Side by side where they don't depend on each other: every step here is time the learner waits in silence.
      // checkRevoked: a session ended by Auth (a password change, a removal) can't start a call (L9).
      const [user, cfg] = await Promise.all([auth.verifyIdToken(String(m.token ?? ""), true).catch(() => null), tutorConfig()]);
      if (!user) return fail("auth");
      if (!hasSuper(user)) return fail("no-super");
      cfgLive = cfg.live;
      if (!tutorReady(cfg)) return fail("tutor-closed");
      const orgId = (user.orgId as string | undefined) ?? null;
      const [left, unit] = await Promise.all([balance(user.uid), loadUnit(String(m.unitId ?? "").slice(0, 64), orgId)]);
      if (left <= 0) return fail("no-credits");
      if (!unit) return fail("no-course");
      // One call at a time per person, with a minute's credits held while it runs (M5).
      try { call = await startCall(user.uid, "voice", await minuteCredits(cfg), (cfg.maxMinutes + 2) * 60_000); }
      catch (e) { return fail(String((e as Error).message) === "busy" ? "busy" : "no-credits"); }
      // From here on, end() settles and releases this call.
      uid = user.uid; callId = call.id;
      // Signed in, with Super and credits: no longer one of its address's unproven sockets.
      signedIn();
      if (closed) { await release(); return; }
      // Google's token comes before Gemini's session opens: a phone that left while it was fetched must not leave a Live
      // session and its timers running (sfm-11). end() has released the call then.
      const vertex = cfg.backend === "vertex";
      let bearer = "";
      if (vertex) {
        try { bearer = await googleToken(); } catch (e) { log("ERROR", "relay: google token", { uid, call: callId, err: e }); return fail("tutor-gone"); }
        if (closed) return;
      }
      const lang: TutorLang = m.lang === "ar" ? "ar" : "en";
      const lessonId = String(m.lessonId ?? "").slice(0, 80) || null;
      const lesson = unit.lessons.find((l) => l.id === lessonId);
      // The search index is only needed when the tutor first searches, so Gemini's session opens while it builds.
      const indexes = Promise.all([trackIndex(unit, orgId, lang), lang === "en" ? null : trackIndex(unit, orgId, "en")]);
      indexes.catch(() => null); // a failure surfaces at the first search, not as an unhandled rejection
      const agentOn = cfg.engine === "agent" && !!cfg.agentId;
      let agentSession = "";
      const sys = instructions({ lang, course: unit.title[lang] ?? unit.title.en, lesson: lesson ? (lesson.title[lang] ?? lesson.title.en) : "", material: lessonMaterial(unit, lessonId, lang, 10000), voice: true, style: String(m.style ?? "").slice(0, 60), explain: agentOn });
      /** The explain tool. The phone shows the board at once and the tutor says it will draw there; the pictures are made
       * in the background and start when they are ready, and the tutor is then given the scenes to talk through. One
       * at a time per call. Whatever happens to the call, the agent's turn is charged: Darsi pays for it either way. */
      const explain = (topic: string): string => {
        if (closed) return "The call has ended.";
        if (explaining) return "The last drawing is still being made and will appear on the board. Keep talking about it; don't ask for another one yet.";
        send({ type: "board" });
        const say = (text: string) => { if (!closed && gem?.readyState === WebSocket.OPEN) gem.send(JSON.stringify({ realtimeInput: { text } })); };
        explaining = (async () => {
          try {
            const [ix, ixEn] = await indexes;
            const r = await askAgent({ cfg, uid, orgId, unit, lessonId, lang, question: topic.slice(0, 600), show: true, sessionId: agentSession || undefined, ix, en: ixEn });
            agentSession = r.sessionId;
            agentUsd += r.usd;
            if (!closed) {
              if (!r.explainer) say("The pictures could not be drawn. Explain the topic in words now.");
              else {
                send({ type: "explainer", pkg: r.explainer });
                const script = r.explainer.scenes.scenes.map((s, i) => `Scene ${i + 1}: ${(s.narration as Record<string, string>)[lang]}`).join("\n");
                say(`The board is playing. Talk through these scenes now, in order, in the learner's language:\n${script}`);
              }
            }
          } catch (e) {
            // A failed or timed-out explainer still cost what the agent measured, and what surely ran (AgentError).
            if (e instanceof AgentError) agentUsd += e.usd;
            log("ERROR", "relay: explain failed", { uid, call: callId, err: e });
            say("The pictures could not be drawn. Explain the topic in words now.");
          }
          // On a call that is still going this charges now; after a hang-up, end() charges it once this is done.
          if (!closed) await settle();
        })().finally(() => { explaining = null; });
        return "Say one short sentence, in the learner's language, that you will show this on the board. Then stop. Do not explain the topic yet.";
      };

      gem = vertex
        ? new WebSocket(process.env.VERTEX_LIVE_URL ?? `wss://${cfg.liveLocation}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`, { headers: { Authorization: `Bearer ${bearer}` } })
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
          // The phone left while the session was being set up: close it rather than start timers no end() would stop.
          if (closed) { gem?.close(); return; }
          send({ type: "ready", left });
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
            const result = explain(String((fc.args as { topic?: string } | undefined)?.topic ?? ""));
            if (gem?.readyState === WebSocket.OPEN) gem.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: fc.id, name: fc.name, response: { result } }] } }));
            continue;
          }
          const [ix, ixEn] = await indexes.catch(() => [null, null] as const);
          const hits = fc.name === "search_course" && ix ? searchBoth(ix, ixEn, String(fc.args?.query ?? ""), 3, unit.id) : [];
          send({ type: "sources", items: hits.map((h) => ({ id: h.s.id, unitId: h.s.unitId, lessonId: h.s.lessonId, stepId: h.s.stepId, lesson: h.s.lesson })) });
          gem!.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: fc.id, name: fc.name, response: { result: hits.length ? hits.map((h) => `[${h.s.id}] (${h.s.course}: ${h.s.lesson})\n${h.s.text.slice(0, 2000)}`).join("\n\n") : "Nothing in the learner's courses covers this. It is outside the courses." } }] } }));
        }
        if (s.goAway) { send({ type: "error", code: "time" }); end(); }
      });
      gem.on("close", (code: number, reason: Buffer) => { if (!closed) { log("WARNING", "relay: gemini closed", { uid, call: callId, code, reason: reason.toString().slice(0, 200) }); fail("tutor-gone"); } });
      gem.on("error", (e: Error) => { log("ERROR", "relay: gemini error", { uid, call: callId, err: e }); fail("tutor-gone"); });
    } catch (e) {
      log("ERROR", "relay: hello failed", { uid, call: callId, err: e });
      const gone = closed;
      fail("tutor-gone");
      // A call that had started is settled and its credits released now, not when the socket has finished closing.
      end();
      // The phone had left before the call started, so end() ran with nothing to release: release it here.
      if (gone) await release();
    } finally { settling.delete(hello); greeted(); }
  });
});

server.listen(Number(process.env.PORT ?? 8080), () => log("INFO", "relay: listening", { port: Number(process.env.PORT ?? 8080), maxSockets: MAX_SOCKETS, maxPendingPerAddress: MAX_PENDING_PER_IP }));
