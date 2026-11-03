/**
 * The tutor agent's explainers (agent/darsi_tutor/explainer.py) as Lesson Studio packages: the agent writes flat scenes
 * (one shape for every template, simple for the model), this turns them into Lesson Studio scenes, adds a manifest and
 * estimated timing, and checks the whole package with Lesson Studio's own validatePackage. The phone's light player
 * plays the result: a few KB of JSON, silent with captions when typing, under the tutor's voice in a call.
 */
import { ICONS, estimateTiming, validatePackage, type Issue, type TimingFile } from "../vendor/lessonstudio-spec.js";
import type { TutorLang } from "./tutorCore.js";

export interface FlatScene {
  template: string; narration: string; title?: string; kicker?: string; hook?: string; icon?: string;
  items?: string[]; reveal_words?: string[]; takeaway?: string;
  nodes?: { id: string; label: string; icon?: string; tone?: string }[]; edges?: { source: string; target: string; label?: string }[];
  message?: { kind: string; sender: string; subject?: string; lines: string[]; link?: string; flag?: string; flag_line?: number };
  question?: { prompt: string; options: { id: string; text: string }[]; answer: string; explain: string };
}
export interface Explainer { title: string; scenes: FlatScene[] }
export interface ExplainerPackage { manifest: Record<string, unknown>; scenes: { version: "0.1"; scenes: Record<string, unknown>[] }; timing: Record<string, TimingFile> }

const LANGS: Record<TutorLang, { dir: "ltr" | "rtl"; name: string }> = { en: { dir: "ltr", name: "English" }, ar: { dir: "rtl", name: "العربية" } };
const icon = (i?: string) => (i && ICONS.includes(i) ? i : undefined);
const id = (s: string, i: number) => (/^[A-Za-z0-9_-]{1,40}$/.test(s) ? s : `n${i + 1}`);
// Cues reveal items as their word is spoken; one whose word isn't in the narration is dropped (it would never fire).
const reveals = (s: FlatScene, n: number) => (s.reveal_words ?? []).slice(0, n)
  .map((w, i) => ({ word: w.trim(), action: "reveal", target: String(i + 1) }))
  .filter((c) => c.word && s.narration.includes(c.word));

/** One flat scene as a Lesson Studio scene, or null for a template the explainer may not use. */
export function toScene(s: FlatScene, i: number, lang: TutorLang, fallbackTitle: string): Record<string, unknown> | null {
  const base = { id: `s${i + 1}`, narration: { [lang]: s.narration.trim() } };
  const title = s.title?.trim() || undefined;
  switch (s.template) {
    case "title-hook": return { ...base, template: "title-hook", content: { kicker: s.kicker, title: title ?? fallbackTitle, hook: s.hook, icon: icon(s.icon) } };
    case "steps": {
      const steps = (s.items ?? []).filter(Boolean).slice(0, 6);
      return steps.length ? { ...base, template: "steps", content: { title, steps }, cues: reveals(s, steps.length) } : null;
    }
    case "summary": {
      const points = (s.items ?? []).filter(Boolean).slice(0, 5);
      return points.length ? { ...base, template: "summary", content: { title, points, takeaway: s.takeaway }, cues: reveals(s, points.length) } : null;
    }
    case "flow": {
      const nodes = (s.nodes ?? []).slice(0, 6).map((n, j) => ({ id: id(n.id, j), label: n.label, icon: icon(n.icon), tone: ["neutral", "trusted", "system", "danger"].includes(n.tone ?? "") ? n.tone : undefined }));
      const ids = new Set(nodes.map((n) => n.id));
      const edges = (s.edges ?? []).filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target).map((e) => ({ from: e.source, to: e.target, label: e.label }));
      return nodes.length >= 2 ? { ...base, template: "flow", content: { title, nodes, edges } } : null;
    }
    case "message-mock": {
      const m = s.message;
      if (!m?.lines?.length) return null;
      const lines = m.lines.slice(0, 5);
      const flags = m.flag ? [{ id: "f1", line: Math.min(Math.max(0, m.flag_line ?? 0), lines.length - 1), label: m.flag }] : undefined;
      return { ...base, template: "message-mock", content: { kind: ["sms", "chat", "email"].includes(m.kind) ? m.kind : "sms", from: m.sender, subject: m.subject, lines, link: m.link, flags } };
    }
    case "quiz": {
      const q = s.question;
      if (!q?.options?.length || !q.options.some((o) => o.id === q.answer)) return null;
      return { ...base, template: "quiz", content: { title }, check: { type: "single-choice", id: "q1", prompt: q.prompt, options: q.options.slice(0, 4), answer: q.answer, explain: q.explain } };
    }
    default: return null;
  }
}

/** Drops undefined fields, so the package is plain JSON for the validator and the phone. */
const clean = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** The explainer as a whole package (one language), with Lesson Studio's verdict on it. */
export function toPackage(e: Explainer, lang: TutorLang, now = new Date()): { pkg: ExplainerPackage; errors: Issue[] } {
  const scenes = clean((e.scenes ?? []).slice(0, 7).map((s, i) => toScene(s, i, lang, e.title)).filter((s): s is Record<string, unknown> => !!s));
  const timing = estimateTiming(scenes, lang);
  const manifest = clean({
    spec: "lesson-package", version: "0.1", id: `explainer-${now.getTime().toString(36)}`, rev: 1, title: { [lang]: e.title },
    defaultLang: lang, languages: [{ code: lang, ...LANGS[lang], duration: timing.duration, timing: `timing/${lang}.json`, quality: "machine" }],
    brand: "darsi-light", provenance: { createdAt: now.toISOString(), createdBy: "Darsi tutor", tool: "darsi-tutor-agent" },
    ai: { script: "ai", translation: "none", narration: "none", visuals: "ai", avatar: "none" },
  });
  const pkg: ExplainerPackage = { manifest, scenes: { version: "0.1", scenes }, timing: { [lang]: timing } };
  const report = validatePackage(pkg);
  const errors = scenes.length < 2 ? [{ code: "tooFewScenes", path: "scenes" }, ...report.errors] : report.errors;
  return { pkg, errors };
}
