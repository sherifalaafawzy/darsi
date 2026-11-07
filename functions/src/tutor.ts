/**
 * The Darsi Super tutor on the server (docs/SUPER.md §4, TECHNICAL.md "Darsi Super"): the courses it may answer from,
 * text answers (tutorAsk), the credit balance (tutorStatus), and the credit charge shared with the voice relay
 * (relay.ts, on Cloud Run). Every call checks Super and charges what it cost Darsi, at least, in credits.
 */
import { applicationDefault } from "firebase-admin/app";
import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { caller, db, str } from "./admin.js";
import { creditsForCost, creditsLeft, holdCredits, settleCredits, spendCredits, type Credits, type Economics, type Hold } from "./billingCore.js";
import { catalogPath, type Owner } from "./catalog.js";
import { superOn } from "./settings.js";
import { bucket } from "./storage.js";
import { AgentError, askAgent, openSession } from "./agent.js";
import { AGENT_PRICES, agentPricesAt, type AgentPrices } from "./agentCore.js";
import type { ExplainerPackage } from "./explainer.js";
import { ANSWER_SCHEMA, LIVE_PRICES, TEXT_PRICES, audioCost, buildIndex, finiteNumbers, instructions, lessonMaterial, outside, searchBoth, sections, usageCost, type Index, type Prices, type TutorLang, type TutorUnit, type Usage } from "./tutorCore.js";

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
/**
 * Prices typed into config/tutor by hand: only numbers ≥ 0 count. Anything else ("0,75", text, null) is logged and the
 * default kept, because one bad price made every charge NaN, which then passed every credit check (sfm-04).
 */
function prices<T>(given: unknown, what: string): Partial<T> {
  const { ok, bad } = finiteNumbers(given);
  if (bad.length) logger.error("tutor: config/tutor has prices that aren't numbers; the defaults are used for them", { what, keys: bad });
  return ok as Partial<T>;
}
export async function tutorConfig(): Promise<TutorConfig> {
  const [d, superIsOn] = await Promise.all([db.doc("config/tutor").get().then((x) => x.data() as Partial<TutorConfig> | undefined), superOn()]);
  // Darsi Super turned off for everyone closes the tutor too (and the voice relay, which reads this). The agent's
  // prices follow Google's own change on 1 Jan 2027 unless config/tutor sets them.
  return { ...DEFAULTS, ...d, on: (d?.on ?? DEFAULTS.on) && superIsOn, live: { ...LIVE_PRICES, ...prices<Prices>(d?.live, "live") }, text: { ...TEXT_PRICES, ...prices<Prices>(d?.text, "text") }, agentPrices: { ...agentPricesAt(), ...prices<AgentPrices>(d?.agentPrices, "agentPrices") } };
}
/** Whether the tutor can reach Google: Vertex needs only the service account; the Gemini API needs its key. */
export const tutorReady = (cfg: TutorConfig) => cfg.on && (cfg.backend === "vertex" || (!!GEMINI_KEY.value() && GEMINI_KEY.value() !== "unset"));

// Vertex AI: its endpoints (VERTEX_BASE lets the checks use a stand-in) and the service account's token.
export const vertexModel = (project: string, loc: string, model: string) => `projects/${project}/locations/${loc}/publishers/google/models/${model}`;
export const vertexHost = (loc: string) => process.env.VERTEX_BASE ?? (loc === "global" ? "https://aiplatform.googleapis.com" : `https://${loc}-aiplatform.googleapis.com`);
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

/**
 * What an instance keeps, by kind (the key's prefix: "cat", "unit", "ix"), each a small LRU of at most so many
 * entries: a search index is about 1.6 MB, and keeping every one ever built could fill a 512 MiB instance (sfm-12).
 * An entry past its time is dropped when it is next asked for. A load in progress is shared, so the panel's warm-up
 * and the first question don't build the same index twice; a load that fails isn't kept.
 */
const LIMITS: Record<string, number> = { cat: 64, unit: 150, ix: 24 };
const caches = new Map<string, Map<string, { at: number; v: Promise<unknown> }>>();
function cached<T>(key: string, ms: number, load: () => Promise<T>): Promise<T> {
  const kind = key.slice(0, Math.max(0, key.indexOf(":")));
  let c = caches.get(kind);
  if (!c) caches.set(kind, (c = new Map()));
  const hit = c.get(key);
  if (hit) {
    c.delete(key);
    if (Date.now() - hit.at < ms) { c.set(key, hit); return hit.v as Promise<T>; } // now the most recently used
  }
  const v = load();
  const entry = { at: Date.now(), v: v as Promise<unknown> };
  c.set(key, entry);
  for (const old of c.keys()) { if (c.size <= (LIMITS[kind] ?? 50)) break; c.delete(old); }
  const mine = c;
  v.catch(() => { if (mine.get(key) === entry) mine.delete(key); });
  return v;
}
/** For the tests: how many entries of a kind an instance keeps. */
export const cachedCount = (kind: string) => caches.get(kind)?.size ?? 0;
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
/**
 * A search index over every course of the unit's track the learner can see, in their language. It is kept by the
 * course files it covers, not by organization: every organization without courses of its own in the track shares the
 * public one (sfm-12), and an organization's own courses (orgs/{id}/… files) still get an index of their own.
 */
export async function trackIndex(unit: TutorUnit, orgId: string | null, lang: string): Promise<Index> {
  const entries = (await catalog(orgId)).filter((u) => u.track === unit.track);
  return cached(`ix:${unit.track}:${lang}:${entries.map((e) => e.src).join()}`, 30 * 60e3, async () => {
    const units = (await Promise.all(entries.map((e) => loadUnit(e.id, orgId)))).filter((u): u is TutorUnit => !!u);
    return buildIndex(units.flatMap((u) => sections(u, lang)));
  });
}

/* ---------- Super and credits ---------- */

export const hasSuper = (token: Record<string, unknown> | undefined) => Number(token?.planUntil) > Date.now();
const day = () => new Date().toISOString().slice(0, 10);

/**
 * The day's tutor cost per person and for the platform. Bookkeeping: it never fails a call that was paid (H3). A
 * figure that isn't a number is left out (logged): Firestore refuses to add NaN, which used to fail the whole answer.
 */
async function countUsage(uid: string, usd: number, credits: number, mode: "text" | "voice") {
  if (!Number.isFinite(usd) || !Number.isFinite(credits)) logger.error("tutor: a call's cost isn't a number", { uid, usd: String(usd), credits: String(credits) });
  const inc = { ...(Number.isFinite(usd) ? { usd: FieldValue.increment(usd) } : {}), ...(Number.isFinite(credits) ? { credits: FieldValue.increment(credits) } : {}), [mode]: FieldValue.increment(1) };
  await Promise.all([
    db.doc(`tutorUsage/${uid}/days/${day()}`).set({ day: day(), ...inc }, { merge: true }),
    db.doc(`analytics/${day()}`).set({ day: day(), tutor: inc }, { merge: true }),
  ]).catch((e) => logger.error("tutor: usage not counted", { uid, error: String(e) }));
}

/**
 * Charges a call that cost Darsi `usd` at Google. Takes what's left if it was more than the balance (the call already
 * happened), and says so (`short`: the credits it couldn't take). Also counts the day's tutor cost.
 */
export async function charge(uid: string, usd: number, mode: "text" | "voice"): Promise<{ ok: boolean; credits: number; left: number; short: number }> {
  // A cost that isn't a number can't be charged: the relay then ends the call (fail closed), never lets it run free.
  if (!Number.isFinite(usd)) throw new Error(`tutor: a ${mode} cost isn't a number`);
  if (usd <= 0) return { ok: true, credits: 0, left: await balance(uid), short: 0 };
  const eco = await economics();
  const n = creditsForCost(usd, eco);
  const ref = db.doc(`credits/${uid}`);
  const r = await db.runTransaction(async (tx) => {
    const c = (await tx.get(ref)).data() as Credits | undefined;
    const have = creditsLeft(c);
    const next = spendCredits(c, Math.min(n, have));
    if (next) tx.set(ref, next);
    return { ok: have >= n, left: Math.max(0, have - n), short: Math.max(0, n - have) };
  });
  await countUsage(uid, usd, n, mode);
  return { ok: r.ok, credits: n, left: Math.round(r.left * 100) / 100, short: Math.round(r.short * 100) / 100 };
}

/* ---------- Calls under way: credits held first, and a few at a time per person (M5) ---------- */

/** tutorLeases/{uid}: the person's calls under way ({kind, until} by id) and their last warm-up; only the functions touch it. */
const leasesRef = (uid: string) => db.doc(`tutorLeases/${uid}`);
/** Calls at once per person: two typed (a question while the last answer is still coming), one spoken. */
export const MAX_CALLS = { text: 2, voice: 1 } as const;
type Lease = { kind: "text" | "voice"; until: number };

/**
 * Starts a call: within one transaction, checks the person has fewer than MAX_CALLS of this kind under way and holds
 * `holdN` credits (all that's left, when less). Parallel calls therefore can't each see the same balance and overspend.
 * Throws resource-exhausted "no-credits" or "busy".
 */
export async function startCall(uid: string, kind: "text" | "voice", holdN: number, ttlMs: number): Promise<{ id: string; hold: Hold }> {
  const cRef = db.doc(`credits/${uid}`), lRef = leasesRef(uid);
  return db.runTransaction(async (tx) => {
    const [c, l] = await Promise.all([tx.get(cRef), tx.get(lRef)]);
    const now = Date.now();
    const live = Object.entries((l.get("calls") ?? {}) as Record<string, Lease>).filter(([, v]) => v && v.until > now);
    if (live.filter(([, v]) => v.kind === kind).length >= MAX_CALLS[kind]) throw new HttpsError("resource-exhausted", "busy");
    const h = holdCredits(c.data() as Credits | undefined, holdN, now);
    if (!h) throw new HttpsError("resource-exhausted", "no-credits");
    const id = randomBytes(8).toString("hex");
    tx.set(cRef, h.next);
    tx.set(lRef, { calls: Object.fromEntries([...live, [id, { kind, until: now + ttlMs }]]) }, { mergeFields: ["calls"] });
    return { id, hold: h.hold };
  });
}

/** Ends a call that cost `cost` credits: settles against what was held, gives back the rest, and frees its place. */
export async function endCall(uid: string, id: string, hold: Hold, cost: number): Promise<{ charged: number; left: number; short: boolean }> {
  const cRef = db.doc(`credits/${uid}`), lRef = leasesRef(uid);
  return db.runTransaction(async (tx) => {
    const [c, l] = await Promise.all([tx.get(cRef), tx.get(lRef)]);
    const r = settleCredits(c.data() as Credits | undefined, hold, cost);
    tx.set(cRef, r.next);
    if (l.exists) tx.update(lRef, { [`calls.${id}`]: FieldValue.delete() });
    return { charged: r.charged, left: Math.round(creditsLeft(r.next) * 100) / 100, short: r.short };
  });
}

/** Credits a spoken minute costs (half the learner, half the tutor, plus the lesson re-read on a few turns): held while a call runs. */
export async function minuteCredits(cfg: TutorConfig) {
  return Math.max(0.01, creditsForCost(audioCost(30, 30, cfg.live) + (4 * 4000 * cfg.live.textIn) / 1e6, await economics()));
}

/** Credits held for a typed answer: about four times the usual cost (an answer with an explainer costs more). */
async function textHold() { return Math.max(0.01, creditsForCost(0.03, await economics())); }

/** At most one warm-up per person every 20 seconds (each one opens an Agent Runtime session, a shared quota). */
async function mayWarm(uid: string) {
  const ref = leasesRef(uid);
  return db.runTransaction(async (tx) => {
    const at = Number((await tx.get(ref)).get("warmAt")) || 0;
    if (Date.now() - at < 20_000) return false;
    tx.set(ref, { warmAt: Date.now() }, { mergeFields: ["warmAt"] });
    return true;
  });
}

export const balance = async (uid: string) => Math.round(creditsLeft((await db.doc(`credits/${uid}`).get()).data() as Credits | undefined) * 100) / 100;

/* ---------- Text answers ---------- */

// GEMINI_BASE lets the emulator checks use a stand-in.
export const GEMINI = `${process.env.GEMINI_BASE ?? "https://generativelanguage.googleapis.com"}/v1beta/models`;

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
  // opened, so the first question waits for neither. Nothing is charged; it needs credits and is limited per person.
  if (req.data?.warm === true) {
    if (!unit || left <= 0 || !(await mayWarm(c.uid))) return { sessionId: "" };
    await Promise.all([trackIndex(unit, orgId, lang), lang === "en" ? null : trackIndex(unit, orgId, "en")]);
    const sessionId = cfg.engine === "agent" && cfg.agentId ? await openSession({ cfg, uid: c.uid, orgId, unit, lessonId, lang, style }).catch(() => "") : "";
    return { sessionId };
  }
  if (left <= 0) throw new HttpsError("resource-exhausted", "no-credits");
  const question = str(req.data?.question, 1500);
  if (!question) throw new HttpsError("invalid-argument", "Ask a question.");
  if (!unit) throw new HttpsError("not-found", "No such course.");
  const history = Array.isArray(req.data?.history) ? (req.data.history as { role: string; text: unknown }[]).slice(-6).map((h) => ({ role: h.role === "user" ? "user" as const : "tutor" as const, text: str(h.text, 1500) })) : [];
  // Credits are held before the model is called and settled after, and only MAX_CALLS run at once per person (M5).
  const call = await startCall(c.uid, "text", await textHold(), 200_000);
  let a: Answer | null = null, explainer: ExplainerPackage | null = null, sessionId = "";
  // What an agent turn cost when it didn't answer (too slow, failed): Darsi paid Google for it, so it is charged with
  // the direct answer that took its place (sfm-03).
  let agentUsd = 0;
  try {
    const [ix, en] = await Promise.all([trackIndex(unit, orgId, lang), lang === "en" ? null : trackIndex(unit, orgId, "en")]);
    if (cfg.engine === "agent" && cfg.agentId) {
      try {
        const r = await askAgent({ cfg, uid: c.uid, orgId, unit, lessonId, lang, question, style, sessionId: str(req.data?.sessionId, 128) || undefined, show: req.data?.show === true, ix, en });
        a = finish(r.reply, { unit, lang, ix }, r.usd);
        ({ explainer, sessionId } = r);
      } catch (e) {
        agentUsd = e instanceof AgentError ? e.usd : 0;
        logger.error("tutor agent failed, answering directly", { error: String(e), usd: agentUsd });
      }
    }
    if (!a) {
      try { a = await answer({ key: GEMINI_KEY.value(), cfg, unit, lessonId, ix, en, question, lang, history, style }); } catch (e) {
        logger.error("tutorAsk failed", { error: String(e) });
        throw new HttpsError("unavailable", "The tutor didn't answer. Try again in a minute.");
      }
    }
  } catch (e) {
    // No answer at all: the learner isn't charged, but what the agent cost is still counted, so the real cost shows.
    await endCall(c.uid, call.id, call.hold, 0).catch((x) => logger.error("tutor: hold not released", { uid: c.uid, error: String(x) }));
    if (agentUsd > 0) await countUsage(c.uid, agentUsd, 0, "text");
    throw e;
  }
  const usd = a.usd + agentUsd;
  const credits = creditsForCost(usd, await economics());
  const paid = await endCall(c.uid, call.id, call.hold, credits);
  await countUsage(c.uid, usd, paid.charged, "text");
  return { inScope: a.inScope, answer: a.answer, sources: a.sources, explainer, sessionId, credits: paid.charged, left: paid.left };
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
