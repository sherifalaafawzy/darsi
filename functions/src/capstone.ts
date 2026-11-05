/**
 * checkCapstone (TECHNICAL.md "Capstones"): a learner sends a capstone milestone. This runs the deterministic checks
 * (link format, the repository's latest GitHub Actions run and release tag from GitHub's public API, darsi-check.json,
 * localhost-only scans for aisec and cyber), asks the tutor's text model (config/tutor: Vertex AI or the Gemini API)
 * for an advisory rubric review in English and Arabic, and writes the submission.
 *
 * The learner's code is never run here, or anywhere in Darsi: their own GitHub Actions run and their check file are the
 * evidence, and both are claims a person still reviews. The submission is written with the Admin SDK, so learners can't
 * write `checks`, `aiReview`, `queue` or a status themselves (firebase/firestore.rules lets clients create only the
 * plain project fields). Learners in a school go to their teacher; the others to Darsi staff (/super/projects).
 */
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { caller, db } from "./admin.js";
import { bucket } from "./storage.js";
import { GEMINI, GEMINI_KEY, googleToken, loadUnit, tutorConfig, vertexHost, vertexModel } from "./tutor.js";
import { usageCost, type Usage } from "./tutorCore.js";
import type { ProjectStep, Unit } from "./shared/types.js";
import { kinds, nextCount, noReview, parseInput, parseRepo, parseReview, queueFor, repoFacts, reviewPrompt, REVIEW_SCHEMA, runChecks, type AiReview, type CapstoneInput, type CheckResult, type RepoFacts } from "./capstoneCore.js";

/** config/capstone, set by platform admins: AI reviews on or off, and how many a learner may ask for in a day. */
interface CapstoneConfig { ai: boolean; perDay: number }
const DEFAULTS: CapstoneConfig = { ai: true, perDay: 5 };
const capConfig = async (): Promise<CapstoneConfig> => ({ ...DEFAULTS, ...((await db.doc("config/capstone").get()).data() as Partial<CapstoneConfig> | undefined) });

async function aiReview(o: { step: ProjectStep; unit: Unit; lessonTitle: string; input: CapstoneInput; checks: CheckResult[] }): Promise<AiReview> {
  const cfg = await tutorConfig();
  const vertex = cfg.backend === "vertex", key = vertex ? "" : GEMINI_KEY.value();
  if (!vertex && (!key || key === "unset")) return noReview("unavailable", { en: "The AI reviewer isn't set up yet. A person will review your work.", ar: "المراجِع الآلي غير مُعدّ بعد. سيراجع عملك شخص." });
  const { sys, user } = reviewPrompt({ step: o.step, unitTitle: o.unit.title.en, lessonTitle: o.lessonTitle, input: o.input, checks: o.checks });
  const url = vertex ? `${vertexHost(cfg.textLocation)}/v1/${vertexModel(cfg.vertexProject, cfg.textLocation, cfg.textModel)}:generateContent` : `${GEMINI}/${cfg.textModel}:generateContent`;
  const r = await fetch(url, {
    method: "POST", signal: AbortSignal.timeout(45000),
    headers: { "Content-Type": "application/json", ...(vertex ? { Authorization: `Bearer ${await googleToken()}` } : { "x-goog-api-key": key }) },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { responseMimeType: "application/json", responseSchema: REVIEW_SCHEMA, maxOutputTokens: 1500, temperature: 0.2 } }),
  });
  const body = (await r.json().catch(() => ({}))) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: Usage; error?: { message?: string } };
  if (!r.ok) throw new Error(`review model ${r.status}: ${body.error?.message ?? ""}`);
  const parsed = parseReview(body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "", o.step.rubric.length);
  if (!parsed) return noReview("unavailable", { en: "The AI reviewer's answer couldn't be read. A person will review your work.", ar: "تعذّرت قراءة رد المراجِع الآلي. سيراجع عملك شخص." });
  return { ...parsed, model: cfg.textModel, usd: usageCost(body.usageMetadata, cfg.text), at: new Date().toISOString() };
}

export const checkCapstone = onCall({ secrets: [GEMINI_KEY], memory: "512MiB", timeoutSeconds: 120, maxInstances: 10 }, async (req) => {
  const c = caller(req);
  const orgId = c.orgId ?? null;
  const prefix = `https://firebasestorage.googleapis.com/v0/b/${bucket().name}/o/${encodeURIComponent(`submissions/${orgId ?? "none"}/${c.uid}/`)}`;
  let input: CapstoneInput;
  try { input = parseInput(req.data, prefix); } catch (e) { throw new HttpsError("invalid-argument", (e as Error).message); }
  const unit = (await loadUnit(input.unitId, orgId)) as unknown as Unit | null;
  const lesson = unit?.lessons.find((l) => l.id === input.lessonId);
  const step = lesson?.steps.find((x) => x.id === input.stepId && x.type === "project") as ProjectStep | undefined;
  if (!unit || !lesson || !step || unit.kind !== "capstone") throw new HttpsError("not-found", "No such capstone milestone.");

  const k = kinds(step), gh = input.repo ? parseRepo(input.repo) : null;
  const facts: RepoFacts | null = gh && (k.has("repo") || k.has("release")) ? await repoFacts(gh.owner, gh.repo, fetch) : null;
  const checks = runChecks({ step, track: unit.track, input, facts });

  // The AI review has a daily budget per learner; over it, or switched off, the work still goes to a person.
  const cfg = await capConfig();
  const today = new Date().toISOString().slice(0, 10);
  const limitRef = db.doc(`capstoneLimits/${c.uid}`);
  const allowed = cfg.ai && await db.runTransaction(async (tx) => {
    const n = nextCount((await tx.get(limitRef)).data() as { day?: string; n?: number } | undefined, today, cfg.perDay);
    if (n.ok) tx.set(limitRef, { day: today, n: n.n, at: FieldValue.serverTimestamp() });
    return n.ok;
  });
  let review: AiReview;
  if (!allowed) review = noReview("skipped", cfg.ai ? { en: "You've used today's AI reviews. A person will still review your work.", ar: "استخدمت مراجعات اليوم الآلية. سيراجع عملك شخص على أي حال." } : { en: "AI reviews are off. A person will review your work.", ar: "المراجعة الآلية متوقفة. سيراجع عملك شخص." });
  else {
    try { review = await aiReview({ step, unit, lessonTitle: lesson.title.en, input, checks }); }
    catch (e) { logger.warn("checkCapstone: review failed", { error: (e as Error).message }); review = noReview("unavailable", { en: "The AI reviewer couldn't answer. A person will review your work.", ar: "لم يتمكّن المراجِع الآلي من الرد. سيراجع عملك شخص." }); }
  }

  const sub = {
    lessonId: input.lessonId, unitId: input.unitId, stepId: input.stepId, orgId, text: input.text,
    fileUrl: input.files[0]?.url ?? null, fileName: input.files[0]?.name ?? null, ...(input.files.length ? { files: input.files } : {}),
    ...(step.final ? { final: true } : {}), explain: input.explain, aiUse: input.aiUse, name: input.name,
    capstone: true, repo: input.repo || null, links: input.links, checks, ...(input.check ? { check: input.check } : {}),
    aiReview: review, queue: queueFor(orgId), status: "submitted", createdAt: FieldValue.serverTimestamp(),
  };
  const ref = await db.collection(`users/${c.uid}/submissions`).add(sub);
  logger.info("checkCapstone", { uid: c.uid, unitId: input.unitId, lessonId: input.lessonId, passed: checks.filter((x) => x.ok).length, of: checks.length, review: review.status, usd: review.usd ?? 0 });
  return { id: ref.id, checks, aiReview: review, queue: sub.queue };
});
