/**
 * The gateway to the tutor agent on Vertex AI Agent Runtime (agent/, ADK Python): opens a session per tutor panel with
 * the rules and the lesson, runs each question as a turn, turns an explainer into a checked Lesson Studio package, and
 * answers the agent's course searches (tutorSearch). Who may ask and the credits are checked before any of this
 * (tutor.ts): Agent Runtime doesn't see Darsi's users, only the uid as a session key.
 */
import { logger } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { agentMessage, parseEvents, readTurn, repairMessage, turnCost, type AgentReply, type AgentTurn } from "./agentCore.js";
import { toPackage, type ExplainerPackage } from "./explainer.js";
import { googleToken, loadUnit, PROJECT, trackIndex, tutorConfig, type TutorConfig } from "./tutor.js";
import { instructions, lessonMaterial, searchBoth, type Index, type TutorLang, type TutorUnit } from "./tutorCore.js";

const engineUrl = (cfg: TutorConfig) =>
  `${process.env.AGENT_BASE ?? `https://${cfg.agentLocation}-aiplatform.googleapis.com`}/v1/projects/${PROJECT}/locations/${cfg.agentLocation}/reasoningEngines/${cfg.agentId}`;
/** Where the agent's search_course tool asks (and the audience of its ID token). */
export const searchUrl = () => process.env.TUTOR_SEARCH_URL ?? `https://europe-west1-${PROJECT}.cloudfunctions.net/tutorSearch`;

async function post(url: string, body: unknown, ms: number): Promise<Response> {
  const r = await fetch(url, { method: "POST", signal: AbortSignal.timeout(ms), headers: { "Content-Type": "application/json", Authorization: `Bearer ${await googleToken()}` }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Agent Runtime ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
  return r;
}

async function newSession(cfg: TutorConfig, uid: string, state: Record<string, unknown>): Promise<string> {
  const j = (await (await post(`${engineUrl(cfg)}:query`, { class_method: "async_create_session", input: { user_id: uid, state } }, 20_000)).json()) as { output?: { id?: string } };
  if (!j.output?.id) throw new Error("Agent Runtime gave no session id");
  return j.output.id;
}

// How long a turn may take before the question goes the direct way. An answer is one 3.8 Flash call, usually 3–5 s, but
// that model now and then takes 30 s to start (measured 2026-11-03), and the direct answer takes about a second.
// An explainer takes 20–30 s. tutorAsk's own limit (180 s) leaves room for a repair turn and the direct answer.
export const ANSWER_MS = 12_000, EXPLAINER_MS = 75_000;

async function runTurn(cfg: TutorConfig, uid: string, sessionId: string, message: string, ms: number): Promise<AgentTurn & { seconds: number }> {
  const t0 = Date.now();
  const r = await post(`${engineUrl(cfg)}:streamQuery?alt=sse`, { class_method: "async_stream_query", input: { user_id: uid, session_id: sessionId, message } }, ms);
  return { ...readTurn(parseEvents(await r.text())), seconds: (Date.now() - t0) / 1000 };
}

export interface AgentAnswer { reply: AgentReply; explainer: ExplainerPackage | null; sessionId: string; usd: number }

type SessionFor = { cfg: TutorConfig; uid: string; orgId: string | null; unit: TutorUnit; lessonId: string | null; lang: TutorLang; style?: string };
/** A new agent session with the tutor's rules and the lesson (tutorAsk opens one when the panel opens, so the first question doesn't wait). */
export function openSession(o: SessionFor): Promise<string> {
  const material = lessonMaterial(o.unit, o.lessonId, o.lang, 10000);
  const lesson = o.unit.lessons.find((l) => l.id === o.lessonId);
  return newSession(o.cfg, o.uid, {
    tutor_rules: instructions({ lang: o.lang, course: o.unit.title[o.lang] ?? o.unit.title.en, lesson: lesson ? (lesson.title[o.lang] ?? lesson.title.en) : "", material, voice: false, style: o.style }),
    material, lang: o.lang, unit_id: o.unit.id, org_id: o.orgId, search_url: searchUrl(),
  });
}

/**
 * One question through the agent. A session the phone kept is reused (the agent remembers the conversation); a new one
 * gets the tutor's rules and the lesson. An explainer Lesson Studio rejects gets one repair turn, then is dropped.
 */
export async function askAgent(o: SessionFor & { question: string; sessionId?: string; show?: boolean; ix: Index; en: Index | null }): Promise<AgentAnswer> {
  const material = lessonMaterial(o.unit, o.lessonId, o.lang, 10000);
  // The course search runs here, so the agent answers in one model call; it searches again only for a different word.
  const hits = searchBoth(o.ix, o.en, o.question, 4, o.unit.id);
  const found = hits.filter((r) => !material.includes(`[${r.s.id}]`))
    .map((r) => `[${r.s.id}] (${r.s.course}: ${r.s.lesson}, ${r.s.kind})\n${r.s.text.slice(0, 2500)}`).join("\n\n");
  const open = () => openSession(o);
  let sessionId = o.sessionId || await open();
  const message = agentMessage(o.question, found, !!o.show, hits.length > 0);
  const ms = o.show ? EXPLAINER_MS : ANSWER_MS;
  let turn = await runTurn(o.cfg, o.uid, sessionId, message, ms).catch(async (e) => {
    if (!o.sessionId || String(e).includes("TimeoutError")) throw e;
    sessionId = await open(); // the phone's session is gone (expired, or another lesson's): start afresh
    return runTurn(o.cfg, o.uid, sessionId, message, ms);
  });
  let usd = turnCost(turn.usage, turn.seconds, o.cfg.agentPrices);
  let explainer: ExplainerPackage | null = null;
  if (turn.explainer) {
    let flat = turn.explainer, made = toPackage(flat, o.lang);
    if (made.errors.length) {
      logger.warn("explainer rejected, repairing", { errors: made.errors.slice(0, 8) });
      const again = await runTurn(o.cfg, o.uid, sessionId, repairMessage(made.errors.map((e) => `${e.path}: ${e.code}${e.detail ? ` (${e.detail})` : ""}`)), EXPLAINER_MS);
      usd += turnCost(again.usage, again.seconds, o.cfg.agentPrices);
      if (again.explainer) { flat = again.explainer; made = toPackage(flat, o.lang); }
      if (again.reply) turn = { ...turn, reply: again.reply };
    }
    explainer = made.errors.length ? null : made.pkg;
    // The turn ended with the explainer: its opening line introduces it in the chat.
    if (!turn.reply?.answer) turn.reply = { inScope: true, sources: [], ...turn.reply, answer: flat.scenes[0]?.narration?.trim() || flat.title };
  }
  if (!turn.reply) throw new Error(turn.error ?? "The agent didn't reply");
  return { reply: turn.reply, explainer, sessionId, usd };
}

/* ---------- The agent's course search ---------- */

const verified = new Map<string, number>();
/** The caller is the agent: a Google ID token for this address, from the agent's service account, still valid. */
async function fromAgent(auth: string | undefined, cfg: TutorConfig): Promise<boolean> {
  const t = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!t) return false;
  if (process.env.FUNCTIONS_EMULATOR === "true" && t === "emulator") return true;
  const until = verified.get(t);
  if (until && until > Date.now()) return true;
  // Google checks the signature and expiry; we check it was made for this function, by the agent's account.
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(t)}`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  const i = (r?.ok ? await r.json() : {}) as { aud?: string; email?: string; email_verified?: string | boolean; exp?: string };
  const ok = i.aud === searchUrl() && !!cfg.agentAccount && i.email === cfg.agentAccount && String(i.email_verified) === "true" && Number(i.exp) * 1000 > Date.now();
  if (ok) verified.set(t, Number(i.exp) * 1000 - 60_000);
  return ok;
}

/** search_course for the agent: the same index and ranking as the direct tutor and the voice relay. */
export const tutorSearch = onRequest({ memory: "512MiB", timeoutSeconds: 30, maxInstances: 10 }, async (req, res) => {
  const cfg = await tutorConfig();
  if (req.method !== "POST") { res.status(405).end(); return; }
  if (!(await fromAgent(req.headers.authorization, cfg))) { res.status(401).json({ error: "unauthenticated" }); return; }
  const b = (req.body ?? {}) as { query?: unknown; unitId?: unknown; orgId?: unknown; lang?: unknown };
  const orgId = typeof b.orgId === "string" && b.orgId ? b.orgId.slice(0, 64) : null;
  const unit = await loadUnit(String(b.unitId ?? "").slice(0, 64), orgId);
  if (!unit) { res.json({ hits: [] }); return; }
  const lang: TutorLang = b.lang === "ar" ? "ar" : "en";
  const ix = await trackIndex(unit, orgId, lang), en = lang === "en" ? null : await trackIndex(unit, orgId, "en");
  const hits = searchBoth(ix, en, String(b.query ?? "").slice(0, 300), 3, unit.id);
  res.json({ hits: hits.map((h) => ({ id: h.s.id, course: h.s.course, lesson: h.s.lesson, text: h.s.text.slice(0, 2000) })) });
});
