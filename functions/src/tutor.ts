/**
 * The Darsi Super tutor on the server (docs/SUPER.md §4, TECHNICAL.md "Darsi Super"): the courses it may answer from,
 * text answers (tutorAsk), the credit balance (tutorStatus), and the credit charge shared with the voice relay
 * (relay.ts, on Cloud Run). Every call checks Super and charges what it cost Darsi, at least, in credits.
 */
import { applicationDefault } from "firebase-admin/app";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { caller, db, str } from "./admin.js";
import { creditsForCost, creditsLeft, spendCredits, type Credits, type Economics } from "./billingCore.js";
import { catalogPath, type Owner } from "./catalog.js";
import { superOn } from "./settings.js";
import { bucket } from "./storage.js";
import { askAgent, openSession } from "./agent.js";
import { AGENT_PRICES, type AgentPrices } from "./agentCore.js";
import type { ExplainerPackage } from "./explainer.js";
import { ANSWER_SCHEMA, LIVE_PRICES, TEXT_PRICES, audioCost, buildIndex, instructions, lessonMaterial, outside, searchBoth, sections, usageCost, type Index, type Prices, type TutorLang, type TutorUnit, type Usage } from "./tutorCore.js";

export const GEMINI_KEY = defineSecret("GEMINI_API_KEY");

/**
 * config/tutor, set by platform admins (or these defaults): where the models run, the models, the voice and Google's prices.
 * backend "vertex" is Vertex AI, billed through the project's Cloud billing account (so GCP credits apply), signed in as
 * the service account; "gemini" is the Gemini API with GEMINI_API_KEY, billed from AI Studio's prepaid balance.
 * The voice model is on Vertex only in us-central1; the text model runs from the global endpoint.
 * engine "agent" sends typed questions to the ADK agent on Agent Runtime (agent.ts; agentId is its reasoningEngines id,
 * agentAccount the service account its search calls come from); "direct" calls textModel here. If the agent fails, the
 * question goes the direct way, so the tutor keeps answering.
 */
export interface TutorConfig { backend: "vertex" | "gemini"; vertexProject: string; textLocation: string; liveLocation: string; liveModel: string; textModel: string; voice: string; live: Prices; text: Prices; maxMinutes: number; on: boolean; engine: "agent" | "direct"; agentId: string; agentLocation: string; agentAccount: string; agentPrices: AgentPrices }
// Darsi's own project; vertexProject may name another one (whose billing pays), where this service account may use Vertex AI.
export const PROJECT = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? "";
const DEFAULTS: TutorConfig = { backend: process.env.TUTOR_BACKEND === "gemini" ? "gemini" : "vertex", vertexProject: PROJECT, textLocation: "global", liveLocation: "us-central1", liveModel: "gemini-3.8-live", textModel: "gemini-3.5-flash-lite", voice: "Kore", live: LIVE_PRICES, text: TEXT_PRICES, maxMinutes: 14, on: true, engine: "direct", agentId: "", agentLocation: "europe-west1", agentAccount: "", agentPrices: AGENT_PRICES };
export async function tutorConfig(): Promise<TutorConfig> {
  const [d, superIsOn] = await Promise.all([db.doc("config/tutor").get().then((x) => x.data() as Partial<TutorConfig> | undefined), superOn()]);
  // Darsi Super turned off for everyone closes the tutor too (and the voice relay, which reads this).
  return { ...DEFAULTS, ...d, on: (d?.on ?? DEFAULTS.on) && superIsOn, live: { ...LIVE_PRICES, ...d?.live }, text: { ...TEXT_PRICES, ...d?.text }, agentPrices: { ...AGENT_PRICES, ...d?.agentPrices } };
}
/** Whether the tutor can reach Google: Vertex needs only the service account; the Gemini API needs its key. */
export const tutorReady = (cfg: TutorConfig) => cfg.on && (cfg.backend === "vertex" || (!!GEMINI_KEY.value() && GEMINI_KEY.value() !== "unset"));

// Vertex AI: its endpoints (VERTEX_BASE lets the checks use a stand-in) and the service account's token.
export const vertexModel = (project: string, loc: string, model: string) => `projects/${project}/locations/${loc}/publishers/google/models/${model}`;
const vertexHost = (loc: string) => process.env.VERTEX_BASE ?? (loc === "global" ? "https://aiplatform.googleapis.com" : `https://${loc}-aiplatform.googleapis.com`);
let token: { v: string; until: number } | null = null;
/** An access token for Google's APIs, kept until a minute before it expires. */
export async function googleToken(): Promise<string> {
  if (!token || token.until < Date.now() + 60_000) {
    const t = await applicationDefault().getAccessToken();
    token = { v: t.access_token, until: Date.now() + t.expires_in * 1000 };
  }
  return token.v;
}

async function economics(): Promise<Economics> {
  const e = (await db.doc("config/plans").get()).get("economics") as Economics | undefined;
  if (!e?.usdPerCredit) throw new HttpsError("failed-precondition", "The tutor is not priced yet.");
  return e;
}

/* ---------- The courses ---------- */

const cache = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, ms: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.v as T;
  const v = await load();
  cache.set(key, { at: Date.now(), v });
  return v;
}
const readJson = async (path: string) => JSON.parse((await bucket().file(path).download())[0].toString("utf8"));
type Entry = { id: string; track: string; src?: string; version?: number };
/** The public catalog plus the learner's organization's (published units only). */
async function catalog(orgId: string | null): Promise<Entry[]> {
  const read = (owner: Owner) => cached(`cat:${owner}`, 5 * 60e3, async () => ((await readJson(catalogPath(owner)).catch(() => ({ units: [] }))) as { units: Entry[] }).units);
  return [...(await read("public")), ...(orgId ? await read(orgId) : [])];
}
export async function loadUnit(unitId: string, orgId: string | null): Promise<TutorUnit | null> {
  const e = (await catalog(orgId)).find((u) => u.id === unitId);
  if (!e?.src) return null;
  return cached(`unit:${e.src}`, 30 * 60e3, () => readJson(e.src!) as Promise<TutorUnit>);
}
/** A search index over every course of the unit's track the learner can see, in their language. */
export async function trackIndex(unit: TutorUnit, orgId: string | null, lang: string): Promise<Index> {
  const entries = (await catalog(orgId)).filter((u) => u.track === unit.track);
  return cached(`ix:${orgId ?? "public"}:${unit.track}:${lang}:${entries.map((e) => e.src).join()}`, 30 * 60e3, async () => {
    const units = (await Promise.all(entries.map((e) => loadUnit(e.id, orgId)))).filter((u): u is TutorUnit => !!u);
    return buildIndex(units.flatMap((u) => sections(u, lang)));
  });
}

/* ---------- Super and credits ---------- */

export const hasSuper = (token: Record<string, unknown> | undefined) => Number(token?.planUntil) > Date.now();
const day = () => new Date().toISOString().slice(0, 10);

/**
 * Charges a call that cost Darsi `usd` at Google. Takes what's left if it was more than the balance (the call already
 * happened), and says so. Also counts the day's tutor cost per person and for the platform.
 */
export async function charge(uid: string, usd: number, mode: "text" | "voice"): Promise<{ ok: boolean; credits: number; left: number }> {
  if (usd <= 0) return { ok: true, credits: 0, left: await balance(uid) };
  const eco = await economics();
  const n = creditsForCost(usd, eco);
  const ref = db.doc(`credits/${uid}`);
  const r = await db.runTransaction(async (tx) => {
    const c = (await tx.get(ref)).data() as Credits | undefined;
    const have = creditsLeft(c);
    const next = spendCredits(c, Math.min(n, have));
    if (next) tx.set(ref, next);
    return { ok: have >= n, left: Math.max(0, have - n) };
  });
  const inc = { usd: FieldValue.increment(usd), credits: FieldValue.increment(n), [mode]: FieldValue.increment(1) };
  await Promise.all([
    db.doc(`tutorUsage/${uid}/days/${day()}`).set({ day: day(), ...inc }, { merge: true }),
    db.doc(`analytics/${day()}`).set({ day: day(), tutor: inc }, { merge: true }),
  ]);
  return { ok: r.ok, credits: n, left: Math.round(r.left * 100) / 100 };
}
export const balance = async (uid: string) => Math.round(creditsLeft((await db.doc(`credits/${uid}`).get()).data() as Credits | undefined) * 100) / 100;

/* ---------- Text answers ---------- */

// GEMINI_BASE lets the emulator checks use a stand-in.
const GEMINI = `${process.env.GEMINI_BASE ?? "https://generativelanguage.googleapis.com"}/v1beta/models`;

export interface Answer { inScope: boolean; answer: string; sources: { id: string; unitId: string; lessonId: string; stepId: string; lesson: string }[]; usd: number }
/**
 * One text answer: the lesson as material, plus the best sections of the track for this question, and the reply as
 * JSON (in scope or not, the answer, the sections it used). Out of scope gets the fixed kind reply. The eval runs this.
 */
export async function answer(o: { key?: string; cfg: TutorConfig; unit: TutorUnit; lessonId: string | null; ix: Index; en?: Index | null; question: string; lang: TutorLang; history?: { role: "user" | "tutor"; text: string }[]; style?: string }): Promise<Answer> {
  const material = lessonMaterial(o.unit, o.lessonId, o.lang);
  const found = searchBoth(o.ix, o.en ?? null, o.question, 4, o.unit.id).filter((r) => !material.includes(`[${r.s.id}]`));
  const extra = found.map((r) => `[${r.s.id}] (${r.s.course}: ${r.s.lesson}, ${r.s.kind})\n${r.s.text.slice(0, 2500)}`).join("\n\n");
  const lesson = o.unit.lessons.find((l) => l.id === o.lessonId);
  const sys = instructions({ lang: o.lang, course: o.unit.title[o.lang] ?? o.unit.title.en, lesson: lesson ? (lesson.title[o.lang] ?? lesson.title.en) : "", material: material + (extra ? `\n\n${extra}` : ""), voice: false, style: o.style });
  const contents = [...(o.history ?? []).slice(-6).map((h) => ({ role: h.role === "user" ? "user" : "model", parts: [{ text: h.text.slice(0, 1500) }] })), { role: "user", parts: [{ text: o.question.slice(0, 1500) }] }];
  const vertex = o.cfg.backend === "vertex";
  const url = vertex ? `${vertexHost(o.cfg.textLocation)}/v1/${vertexModel(o.cfg.vertexProject, o.cfg.textLocation, o.cfg.textModel)}:generateContent` : `${GEMINI}/${o.cfg.textModel}:generateContent`;
  const r = await fetch(url, {
    method: "POST", signal: AbortSignal.timeout(30000),
    headers: { "Content-Type": "application/json", ...(vertex ? { Authorization: `Bearer ${await googleToken()}` } : { "x-goog-api-key": o.key ?? "" }) },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents, generationConfig: { responseMimeType: "application/json", responseSchema: ANSWER_SCHEMA, maxOutputTokens: 700, temperature: 0.4 } }),
  });
  const body = (await r.json().catch(() => ({}))) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: Usage; error?: { message?: string } };
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${body.error?.message ?? ""}`);
  let out: { inScope?: boolean; answer?: string; sources?: string[] } = {};
  try { out = JSON.parse(body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "{}"); } catch { /* treated as out of scope */ }
  return finish(out, o, usageCost(body.usageMetadata, o.cfg.text));
}

/** A model's answer as the learner gets it, from either engine: its sources looked up in the course, out of scope replaced by the kind reply. */
function finish(out: { inScope?: boolean; answer?: string; sources?: string[] }, o: { unit: TutorUnit; lang: TutorLang; ix: Index }, usd: number): Answer {
  const known = new Map([...sections(o.unit, o.lang), ...o.ix.docs.map((d) => d.s)].map((s) => [s.id, s]));
  const sources = (out.sources ?? []).map((id) => known.get(id)).filter((s): s is NonNullable<typeof s> => !!s).slice(0, 3)
    .map((s) => ({ id: s.id, unitId: s.unitId, lessonId: s.lessonId, stepId: s.stepId, lesson: s.lesson }));
  // An answer the model calls in scope must point to the course; one that doesn't is replaced by the outside reply.
  const inScope = out.inScope === true && !!out.answer?.trim() && sources.length > 0;
  return { inScope, answer: inScope ? out.answer!.trim() : outside(o.lang), sources: inScope ? sources : [], usd };
}

/** A text question to the tutor, about a course the learner can see. Charges its cost in credits. */
export const tutorAsk = onCall({ secrets: [GEMINI_KEY], memory: "512MiB", timeoutSeconds: 180, maxInstances: 10 }, async (req) => {
  const c = caller(req);
  if (!hasSuper(req.auth?.token)) throw new HttpsError("permission-denied", "The tutor comes with Darsi Super.");
  const lang: TutorLang = req.data?.lang === "ar" ? "ar" : "en";
  const orgId = c.orgId ?? null, lessonId = str(req.data?.lessonId, 80) || null, style = str(req.data?.style, 60);
  const [cfg, left, unit] = await Promise.all([tutorConfig(), balance(c.uid), loadUnit(str(req.data?.unitId, 64), orgId)]);
  if (!tutorReady(cfg)) throw new HttpsError("failed-precondition", "tutor-closed");
  // {warm: true} when the panel opens: this instance loads the course and its search index, and the agent's session is
  // opened, so the first question waits for neither. Nothing is charged.
  if (req.data?.warm === true) {
    if (!unit) return { sessionId: "" };
    await Promise.all([trackIndex(unit, orgId, lang), lang === "en" ? null : trackIndex(unit, orgId, "en")]);
    const sessionId = cfg.engine === "agent" && cfg.agentId ? await openSession({ cfg, uid: c.uid, orgId, unit, lessonId, lang, style }).catch(() => "") : "";
    return { sessionId };
  }
  if (left <= 0) throw new HttpsError("resource-exhausted", "no-credits");
  const question = str(req.data?.question, 1500);
  if (!question) throw new HttpsError("invalid-argument", "Ask a question.");
  if (!unit) throw new HttpsError("not-found", "No such course.");
  const history = Array.isArray(req.data?.history) ? (req.data.history as { role: string; text: unknown }[]).slice(-6).map((h) => ({ role: h.role === "user" ? "user" as const : "tutor" as const, text: str(h.text, 1500) })) : [];
  const [ix, en] = await Promise.all([trackIndex(unit, orgId, lang), lang === "en" ? null : trackIndex(unit, orgId, "en")]);
  let a: Answer | null = null, explainer: ExplainerPackage | null = null, sessionId = "";
  if (cfg.engine === "agent" && cfg.agentId) {
    try {
      const r = await askAgent({ cfg, uid: c.uid, orgId, unit, lessonId, lang, question, style, sessionId: str(req.data?.sessionId, 128) || undefined, show: req.data?.show === true, ix, en });
      a = finish(r.reply, { unit, lang, ix }, r.usd);
      ({ explainer, sessionId } = r);
    } catch (e) { logger.error("tutor agent failed, answering directly", { error: String(e) }); }
  }
  if (!a) {
    try { a = await answer({ key: GEMINI_KEY.value(), cfg, unit, lessonId, ix, en, question, lang, history, style }); } catch (e) {
      logger.error("tutorAsk failed", { error: String(e) });
      throw new HttpsError("unavailable", "The tutor didn't answer. Try again in a minute.");
    }
  }
  const paid = await charge(c.uid, a.usd, "text");
  return { inScope: a.inScope, answer: a.answer, sources: a.sources, explainer, sessionId, credits: paid.credits, left: paid.left };
});

/** The balance, and roughly what a minute of talking costs in credits (for "about N minutes left"). */
export const tutorStatus = onCall(async (req) => {
  const c = caller(req);
  const [cfg, left, eco] = await Promise.all([tutorConfig(), balance(c.uid), db.doc("config/plans").get().then((s) => s.get("economics") as Economics | undefined)]);
  // A spoken minute: half the learner, half the tutor, plus the lesson re-read as context on a few turns.
  const minute = eco?.usdPerCredit ? creditsForCost(audioCost(30, 30, cfg.live) + (4 * 4000 * cfg.live.textIn) / 1e6, eco) : null;
  // An explainer turn, as measured: about 11k tokens in, 1.7k out (thinking included) and 30 s of runtime.
  const explainer = eco?.usdPerCredit && cfg.engine === "agent" && cfg.agentId ? creditsForCost((11000 * cfg.agentPrices.textIn + 1700 * cfg.agentPrices.textOut) / 1e6 + 30 * cfg.agentPrices.runtimePerSec, eco) : null;
  return { super: hasSuper(req.auth?.token), on: cfg.on, left, minute, maxMinutes: cfg.maxMinutes, explainer };
});
