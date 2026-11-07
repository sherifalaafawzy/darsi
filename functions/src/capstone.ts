/**
 * checkCapstone (TECHNICAL.md "Capstones"): a learner sends a capstone milestone. This runs the deterministic checks
 * (link format, the repository's latest GitHub Actions run and release tag from GitHub's API, darsi-check.json,
 * localhost-only scans for aisec and cyber), asks the tutor's text model (config/tutor: Vertex AI or the Gemini API)
 * for an advisory rubric review in English and Arabic, and writes the submission.
 *
 * The learner's code is never run here, or anywhere in Darsi: their own GitHub Actions run and their check file are the
 * evidence, and both are claims a person still reviews. The submission is written with the Admin SDK, so learners can't
 * write `checks`, `aiReview`, `queue` or a status themselves (firebase/firestore.rules lets clients create only the
 * plain project fields). Learners in a school go to their teacher; the others to Darsi staff (/super/projects).
 *
 * Limits come first, before any GitHub request or model call (allowance): one send per account every 20 s and
 * config/capstone.callsPerDay a day; AI reviews per learner (perDay) and for the whole platform (maxPerDay) a day.
 */
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { audit, caller, db, requireSuper } from "./admin.js";
import { bucket } from "./storage.js";
import { GEMINI, GEMINI_KEY, googleToken, loadUnit, tutorConfig, vertexHost, vertexModel } from "./tutor.js";
import { usageCost, type Usage } from "./tutorCore.js";
import type { ProjectStep, Unit } from "./shared/types.js";
import {
  allowance, capScores, capstoneConfig, configPatch, factsTtl, filesPrefix, kinds, noReview, parseInput, parseRepo, parseReview, queueFor, repoFacts,
  reviewPrompt, REVIEW_SCHEMA, runChecks, STARTER_OWNER, type AiReview, type Allowance, type Bi, type CapstoneConfig, type CapstoneInput,
  type CheckResult, type RepoFacts,
} from "./capstoneCore.js";

/**
 * Darsi's own GitHub token: fine-grained, read-only access to public repositories, so GitHub allows 5,000 requests an hour
 * instead of 60 from a shared address. Never a learner's token. "unset" (or empty) means none.
 */
export const GITHUB_TOKEN = defineSecret("GITHUB_TOKEN");
const githubToken = () => { const v = GITHUB_TOKEN.value(); return v && v !== "unset" ? v : undefined; };

const capConfig = async () => capstoneConfig((await db.doc("config/capstone").get()).data());

/** GitHub's answers, reused for a while (factsTtl), so sending one repository again soon costs no requests. Per instance. */
const factsCache = new Map<string, { until: number; v: RepoFacts }>();
async function cachedFacts(owner: string, repo: string): Promise<RepoFacts> {
  const key = `${owner}/${repo}`.toLowerCase(), hit = factsCache.get(key);
  if (hit && hit.until > Date.now()) return hit.v;
  const v = await repoFacts(owner, repo, fetch, { token: githubToken() });
  const ttl = factsTtl(v);
  factsCache.delete(key);
  if (ttl > 0) {
    if (factsCache.size >= 500) { const oldest = factsCache.keys().next().value; if (oldest !== undefined) factsCache.delete(oldest); }
    factsCache.set(key, { until: Date.now() + ttl, v });
  }
  return v;
}

async function aiReview(o: { step: ProjectStep; unit: Unit; input: CapstoneInput; checks: CheckResult[] }): Promise<AiReview> {
  const cfg = await tutorConfig();
  const vertex = cfg.backend === "vertex", key = vertex ? "" : GEMINI_KEY.value();
  if (!vertex && (!key || key === "unset")) return noReview("unavailable", { en: "The AI reviewer isn't set up yet. A person will review your work.", ar: "المراجِع الآلي غير مُعدّ بعد. سيراجع عملك شخص." });
  // A fresh fence per call (reviewPrompt): the learner's text can't close it. The milestone is named from its own step
  // (milestoneOf), never from the lesson that holds every milestone ("3. Project submission").
  const { sys, user } = reviewPrompt({ step: o.step, unitTitle: o.unit.title.en, input: o.input, checks: o.checks });
  const url = vertex ? `${vertexHost(cfg.textLocation)}/v1/${vertexModel(cfg.vertexProject, cfg.textLocation, cfg.textModel)}:generateContent` : `${GEMINI}/${cfg.textModel}:generateContent`;
  const r = await fetch(url, {
    method: "POST", signal: AbortSignal.timeout(45000),
    headers: { "Content-Type": "application/json", ...(vertex ? { Authorization: `Bearer ${await googleToken()}` } : { "x-goog-api-key": key }) },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { responseMimeType: "application/json", responseSchema: REVIEW_SCHEMA, maxOutputTokens: 1500, temperature: 0.2 } }),
  });
  const body = (await r.json().catch(() => ({}))) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: Usage; error?: { message?: string } };
  if (!r.ok) throw new Error(`review model ${r.status}: ${body.error?.message ?? ""}`);
  const usd = usageCost(body.usageMetadata, cfg.text);
  const parsed = parseReview(body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "", o.step.rubric.length);
  if (!parsed) return { ...noReview("unavailable", { en: "The AI reviewer's answer couldn't be read. A person will review your work.", ar: "تعذّرت قراءة رد المراجِع الآلي. سيراجع عملك شخص." }), usd };
  // Failed automatic checks cap every score at 1 here, in code, whatever the work talked the model into.
  return capScores({ ...parsed, model: cfg.textModel, usd, at: new Date().toISOString() }, o.checks);
}

/** Why there's no AI review this time; the work still goes to a person. */
const SKIPPED: Record<"off" | "mine" | "platform", Bi> = {
  off: { en: "AI reviews are off. A person will review your work.", ar: "المراجعة الآلية متوقفة. سيراجع عملك شخص." },
  mine: { en: "You've used today's AI reviews. A person will still review your work.", ar: "استخدمت كل المراجعات الآلية المتاحة لك اليوم. سيراجع عملك شخص على أي حال." },
  platform: { en: "The AI reviewer has done all it can for today. A person will still review your work.", ar: "أنهى المراجِع الآلي كل ما يستطيعه اليوم. سيراجع عملك شخص على أي حال." },
};

/** The day's capstone use: analytics/{day}.capstone for /super/analytics, and the platform budget's cost. Never fails a send. */
async function countUse(today: string, review: AiReview) {
  const usd = review.usd ?? 0, paid = usd > 0 || review.status === "done";
  await Promise.all([
    db.doc(`analytics/${today}`).set({ day: today, capstone: { calls: FieldValue.increment(1), ...(paid ? { reviews: FieldValue.increment(1), usd: FieldValue.increment(usd) } : {}) } }, { merge: true }),
    ...(paid ? [db.doc(`capstoneDays/${today}`).set({ day: today, usd: FieldValue.increment(usd) }, { merge: true })] : []),
  ]).catch((e) => logger.error("checkCapstone: use not counted", { error: String(e) }));
}

export const checkCapstone = onCall({ secrets: [GEMINI_KEY, GITHUB_TOKEN], memory: "512MiB", timeoutSeconds: 120, maxInstances: 10 }, async (req) => {
  const c = caller(req);
  const orgId = c.orgId ?? null;
  let input: CapstoneInput;
  try { input = parseInput(req.data, filesPrefix(bucket().name, orgId, c.uid)); } catch (e) { throw new HttpsError("invalid-argument", (e as Error).message); }
  const unit = (await loadUnit(input.unitId, orgId)) as unknown as Unit | null;
  const lesson = unit?.lessons.find((l) => l.id === input.lessonId);
  const step = lesson?.steps.find((x) => x.id === input.stepId && x.type === "project") as ProjectStep | undefined;
  if (!unit || !lesson || !step || unit.kind !== "capstone") throw new HttpsError("not-found", "No such capstone milestone.");

  // The limits, before any GitHub request or model call. Refused sends write nothing; the phone keeps the draft.
  const cfg = await capConfig();
  const today = new Date().toISOString().slice(0, 10);
  const limitRef = db.doc(`capstoneLimits/${c.uid}`), dayRef = db.doc(`capstoneDays/${today}`);
  const a: Allowance = await db.runTransaction(async (tx) => {
    const [mine, day] = await Promise.all([tx.get(limitRef), cfg.ai ? tx.get(dayRef) : Promise.resolve(null)]);
    const r = allowance(mine.data(), Number(day?.get("n")) || 0, cfg, today, Date.now());
    if (r.refuse) return r;
    tx.set(limitRef, { ...r.mine, at: FieldValue.serverTimestamp() });
    if (r.ai === "ok") tx.set(dayRef, { day: today, n: r.platform }, { merge: true });
    return r;
  });
  if (a.refuse) {
    logger.info("checkCapstone: refused", { uid: c.uid, why: a.refuse });
    throw new HttpsError("resource-exhausted", a.refuse);
  }
  if (a.ai === "ok" && (a.platform === Math.ceil(cfg.maxPerDay * 0.8) || a.platform === cfg.maxPerDay)) logger.warn("checkCapstone: platform AI reviews used today", { used: a.platform, max: cfg.maxPerDay });

  // The starter repository itself is refused without asking GitHub (runChecks).
  const k = kinds(step), gh = input.repo ? parseRepo(input.repo) : null;
  const facts = gh && gh.owner.toLowerCase() !== STARTER_OWNER && (k.has("repo") || k.has("release")) ? await cachedFacts(gh.owner, gh.repo) : null;
  const checks = runChecks({ step, track: unit.track, input, facts });

  let review: AiReview;
  if (a.ai !== "ok") review = noReview("skipped", SKIPPED[a.ai]);
  else {
    try { review = await aiReview({ step, unit, input, checks }); }
    catch (e) { logger.warn("checkCapstone: review failed", { error: (e as Error).message }); review = noReview("unavailable", { en: "The AI reviewer couldn't answer. A person will review your work.", ar: "لم يتمكّن المراجِع الآلي من الرد. سيراجع عملك شخص." }); }
  }

  const sub = {
    lessonId: input.lessonId, unitId: input.unitId, stepId: input.stepId, orgId, text: input.text,
    fileUrl: input.files[0]?.url ?? null, fileName: input.files[0]?.name ?? null, ...(input.files.length ? { files: input.files } : {}),
    ...(step.final ? { final: true } : {}), explain: input.explain, aiUse: input.aiUse, name: input.name,
    capstone: true, repo: input.repo || null, links: input.links, checks, ...(input.check ? { check: input.check } : {}),
    aiReview: review, queue: queueFor(orgId), status: "submitted", createdAt: FieldValue.serverTimestamp(),
  };
  const [ref] = await Promise.all([db.collection(`users/${c.uid}/submissions`).add(sub), countUse(today, review)]);
  logger.info("checkCapstone", { uid: c.uid, unitId: input.unitId, lessonId: input.lessonId, passed: checks.filter((x) => x.ok === true).length, failed: checks.filter((x) => x.ok === false).length, unchecked: checks.filter((x) => x.ok === null).length, github: facts?.error ?? null, review: review.status, capped: !!review.capped, usd: review.usd ?? 0 });
  return { id: ref.id, checks, aiReview: review, queue: sub.queue };
});

/**
 * Platform admins: capstone AI reviews on or off and the daily limits (config/capstone; CAPSTONE_BOUNDS in capstoneCore).
 * Only the fields sent change. config/* is closed to clients, so this is the way to change it outside the console.
 */
export const saveCapstoneConfig = onCall(async (req) => {
  const c = await requireSuper(req);
  let patch: Partial<CapstoneConfig>;
  try { patch = configPatch(req.data); } catch (e) { throw new HttpsError("invalid-argument", (e as Error).message); }
  await db.doc("config/capstone").set({ ...patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: c.uid }, { merge: true });
  await audit("saveCapstoneConfig", c.uid, patch);
  return capConfig();
});
