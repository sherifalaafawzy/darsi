#!/usr/bin/env node
/**
 * Checks one Darsi lesson against the teaching structure of the darsi-course skill. It costs nothing and changes
 * nothing. It reads the Lesson Studio storyboard (source/<ID>.json, <id>/ar-EG.json, <id>/design.json) and the lesson
 * in content/units, and reports what breaks the structure (problems) and what a reader should look at (notes).
 *
 *   node .claude/skills/darsi-course/scripts/check-lesson.mjs <lesson id>… [--all] [--studio <Lesson Studio folder>]
 *
 * --all checks every storyboard and prints how many lessons break each rule. Exit code 1 when there are problems.
 * Storyboards written before the skill have no `teaching` block and no `part` on their scenes: that is reported, and
 * the parts are then worked out from the beats so the rest can still be checked.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const STUDIO = resolve(flag("--studio") ?? join(ROOT, "..", "lessonstudio"));
const SRC = join(STUDIO, "content", "darsi", "source");
const ALL = args.includes("--all");
const ids = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--studio").map((a) => a.toLowerCase());

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const STOPS = new Set([".", "!", "?", "؟", "…"]);
/** The converter's sentence split (Lesson Studio packages/spec/src/text.ts). */
function sentences(text) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  const out = [];
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    if (!STOPS.has(s[i])) continue;
    let j = i;
    while (j + 1 < s.length && (STOPS.has(s[j + 1]) || s[j + 1] === "\"" || s[j + 1] === "”" || s[j + 1] === "»")) j++;
    if (j + 1 === s.length || s[j + 1] === " ") { out.push(s.slice(from, j + 1).trim()); from = j + 2; i = j; }
  }
  if (from < s.length) out.push(s.slice(from).trim());
  return out.filter(Boolean);
}
const words = (t) => String(t ?? "").split(/\s+/).filter(Boolean);
const norm = (t) => String(t ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, "\"").replace(/\s+/g, " ").trim();
const STOPWORDS = new Set("a an the and or but so of to in on at for from with by is are was were be it its this that these those what which who how why would could does did do my your our their me you i we they he she not no yes one two can will just really than then them his her as if about into up out".split(" "));
const keywords = (t) => new Set(norm(t).replace(/[^a-z0-9' ]/g, " ").split(" ").filter((w) => w.length > 2 && !STOPWORDS.has(w)));

/** Storyboard ids: the lesson id in capitals; the cyber pack course was written as CY-1-1-n. */
function storyId(lessonId) {
  const up = lessonId.toUpperCase();
  if (existsSync(join(SRC, `${up}.json`))) return up;
  const cy = up.replace(/^CYBER-1-1-/, "CY-1-1-");
  return existsSync(join(SRC, `${cy}.json`)) ? cy : null;
}

let unitIndex = null;
function findLesson(lessonId) {
  if (!unitIndex) {
    unitIndex = new Map();
    const dir = join(ROOT, "content", "units");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const unit = readJson(join(dir, f));
      for (const lesson of unit.lessons ?? []) unitIndex.set(lesson.id.toLowerCase(), { unit, lesson });
    }
  }
  return unitIndex.get(lessonId) ?? null;
}

const ORDER = ["hook", "promise", "show", "name", "work", "check", "reveal", "widen", "lab", "check2", "recap", "try"];
const NEW_TERM_PARTS = new Set(["show", "name", "work"]);
/** A scene's part: as written, or worked out from the beats for storyboards from before the skill. */
function partsOf(scenes) {
  let seenDef = false, checks = 0, seenReveal = false;
  return scenes.map((s) => {
    const beat = String(s.beat ?? "");
    let part = s.part;
    if (!part) {
      if (beat === "Hook") part = "hook";
      else if (beat === "Title") part = "promise";
      else if (beat.startsWith("Checkpoint")) part = "check";
      else if (beat === "Reveal") part = checks ? "reveal" : "work";
      else if (beat === "Lab preview") part = "lab";
      else if (beat === "Recap") part = "recap";
      else if (beat.startsWith("Try it")) part = "try";
      else if (beat === "Definition") part = "name";
      else if (checks && seenReveal) part = "widen";
      else if (checks) part = "widen";
      else part = seenDef ? "work" : "show";
    }
    if (part === "name") seenDef = true;
    if (part === "reveal") seenReveal = true;
    if (part === "check") { checks++; if (checks > 1) part = "check2"; }
    return part;
  });
}

const MSA_IN_SPEECH = ["إذا", "يمكن", "لأن", "كيف", "يوجد", "أكثر", "هل", "لكن", "ثم", "سوف", "الذي", "التي", "لماذا", "ماذا", "هذا", "هذه"];
const arWords = (t) => String(t ?? "").replace(/[^ء-يٱ-ۓ ]/g, " ").replace(/[ً-ْ]/g, "").split(/\s+/).filter(Boolean);

function check(lessonId) {
  const problems = [], notes = [];
  const P = (code, text) => problems.push({ code, text });
  const N = (code, text) => notes.push({ code, text });
  const ID = storyId(lessonId);
  if (!ID) return { id: lessonId, problems: [{ code: "noStoryboard", text: `no storyboard in ${SRC}` }], notes };
  const sb = readJson(join(SRC, `${ID}.json`));
  const folder = join(STUDIO, "content", "darsi", ID.toLowerCase());
  const ar = existsSync(join(folder, "ar-EG.json")) ? readJson(join(folder, "ar-EG.json")) : null;
  const design = existsSync(join(folder, "design.json")) ? readJson(join(folder, "design.json")) : { scenes: {} };
  const v = sb.video ?? {};
  const scenes = v.scenes ?? [];
  const cps = v.checkpoints ?? [];
  const primary = /-s1-/.test(lessonId);
  const T = sb.teaching;

  /* ---- the teaching block ---- */
  if (!T) P("noTeachingBlock", "no `teaching` block (assumes, outcome, hook, terms, misconception, next): written before the skill");
  else {
    if (!Array.isArray(T.assumes)) P("teaching", "teaching.assumes must be a list ([] for a track's first lesson)");
    if (!T.outcome) P("teaching", "teaching.outcome is empty");
    else if (/^(understand|know|learn|be aware)/i.test(T.outcome)) P("outcome", `the outcome starts with "${T.outcome.split(" ")[0]}": say what the learner can do (tell apart, spot, explain, trace, choose…)`);
    if (!["question", "surprise", "problem"].includes(T.hook?.kind)) P("teaching", "teaching.hook.kind must be question, surprise or problem");
    if (!/[?؟]$/.test(String(T.hook?.question ?? "").trim())) P("teaching", "teaching.hook.question must be the question the hook leaves open");
    if (!Array.isArray(T.terms) || T.terms.length < 1 || T.terms.length > 4) P("terms", `teaching.terms must list 1 to 4 new terms (has ${T.terms?.length ?? 0})`);
    if (!T.misconception) P("teaching", "teaching.misconception is empty");
    if (!T.next) P("teaching", "teaching.next is empty (the next lesson, or the unit check)");
  }

  /* ---- the parts, in order ---- */
  if (scenes.length < 12 || scenes.length > 15) P("sceneCount", `${scenes.length} scenes (12 to 15)`);
  if (T && scenes.some((s) => !s.part)) P("noPart", `scenes without a \`part\`: ${scenes.filter((s) => !s.part).map((s) => s.n).join(", ")}`);
  const parts = partsOf(scenes);
  let at = -1;
  parts.forEach((p, i) => {
    const k = ORDER.indexOf(p);
    if (k < 0) P("part", `scene ${scenes[i].n}: unknown part "${p}"`);
    else if (k < at) P("order", `scene ${scenes[i].n} (${p}) comes after ${ORDER[at]}: the parts go ${ORDER.join(" → ").replace("check2", "check")}`);
    else at = k;
  });
  for (const need of ORDER) if (!parts.includes(need)) (need === "lab" ? N : P)("missingPart", `no ${need === "check2" ? "second check" : `\`${need}\``} scene`);
  const count = (p) => parts.filter((x) => x === p).length;
  if (count("show") > 2) N("tooMany", `${count("show")} show scenes (1 or 2)`);
  if (count("work") > 3) N("tooMany", `${count("work")} work scenes (1 to 3)`);
  if (parts.includes("name") && parts.indexOf("show") < 0) P("definitionFirst", "the first definition comes before any example: show it, then name it");
  else if (parts.includes("name") && parts.indexOf("name") < parts.indexOf("show")) P("definitionFirst", "the first definition comes before any example: show it, then name it");

  /* ---- hook and promise ---- */
  const hook = scenes[0];
  if (hook) {
    if (hook.beat !== "Hook") P("hook", `scene 1 is "${hook.beat}", not the hook`);
    if (/narrator/i.test(hook.voice ?? "")) P("hook", "the narrator tells the hook: a cast member should");
    const hs = sentences(hook.narration);
    const hw = words(hook.narration).length;
    if (hw > 40) P("hookLong", `the hook is ${hw} words (40 at most)`);
    if (hs.length > 4) P("hookLong", `the hook is ${hs.length} sentences (4 at most)`);
    if (hs[0] && words(hs[0]).length > 12) P("hookBubble", `the hook's first sentence is ${words(hs[0]).length} words (12 at most: it is the speech bubble)`);
    if (hs.length && !/[?؟]["”»]?$/.test(hs[hs.length - 1])) P("hookClosed", "the hook doesn't end on a question: leave the gap open");
    for (const t of T?.terms ?? []) if (norm(hook.narration).includes(norm(t))) P("hookTerm", `the hook uses the new term "${t}"`);
  }
  const title = scenes[1];
  if (title) {
    if (title.beat !== "Title") P("promise", `scene 2 is "${title.beat}", not the title card`);
    if (!/^By the end\b/i.test(String(title.narration ?? "").trim())) P("promise", `the promise should start "By the end, you'll be able to…" (it says "${String(title.narration ?? "").slice(0, 60)}")`);
    if (words(title.narration).length > 25) P("promise", `the promise is ${words(title.narration).length} words (25 at most)`);
    if (T?.outcome && !norm(title.narration).includes(norm(T.outcome).slice(0, 24))) N("promise", "the promise and teaching.outcome say different things");
  }

  /* ---- words and length ---- */
  const total = scenes.reduce((n, s) => n + words(s.narration).length, 0);
  const [lo, hi, cap] = primary ? [280, 370, 400] : [380, 450, 470];
  if (total > cap) P("tooLong", `${total} words (${cap} at most; aim for ${lo}–${hi})`);
  else if (total > hi || total < lo - 40) N("length", `${total} words (aim for ${lo}–${hi})`);
  const sceneCap = primary ? 45 : 55;
  const sentCap = primary ? 14 : 22;
  scenes.forEach((s, i) => {
    const w = words(s.narration).length, ss = sentences(s.narration);
    if (w > sceneCap) P("sceneLong", `scene ${s.n} (${parts[i]}) is ${w} words (${sceneCap} at most)`);
    if (ss.length > 5) P("sceneLong", `scene ${s.n} has ${ss.length} sentences (4, or 5 for a list)`);
    const long = ss.filter((x) => words(x).length > sentCap);
    if (long.length) N("sentenceLong", `scene ${s.n}: ${long.length} sentence(s) over ${sentCap} words`);
  });

  /* ---- terms: said, shown, and not before the show part ---- */
  const designText = (lang) => { const out = []; (function walk(x) { if (!x || typeof x !== "object") return; if (typeof x[lang] === "string") out.push(x[lang]); for (const k of Object.keys(x)) walk(x[k]); })(design); return out; };
  const screenEn = norm([...scenes.map((s) => s.on_screen_text), ...designText("en")].join(" | "));
  for (const t of T?.terms ?? []) {
    const k = scenes.findIndex((s) => norm(s.narration).includes(norm(t)));
    if (k < 0) { P("termUnsaid", `the term "${t}" is never said`); continue; }
    if (!NEW_TERM_PARTS.has(parts[k])) P("termEarly", `"${t}" is first said in scene ${scenes[k].n} (${parts[k].replace("check2", "check")}): introduce new terms in show, name or work`);
    if (!screenEn.includes(norm(t))) N("termUnseen", `"${t}" is never shown on screen`);
  }

  /* ---- the two checks ---- */
  if (cps.length !== 2) P("checks", `${cps.length} checkpoints (2)`);
  cps.forEach((c, i) => {
    const sc = scenes.find((s) => s.n === c.after_scene);
    if (!sc || !String(sc.beat).startsWith("Checkpoint")) P("checks", `checkpoint ${i + 1}: after_scene ${c.after_scene} is not a Checkpoint scene`);
    const opts = c.options ?? [];
    if (opts.length < 2 || opts.length > 4) P("checks", `checkpoint ${i + 1} has ${opts.length} options (2 to 4)`);
    const right = opts.filter((o) => o.correct);
    if (right.length !== 1) P("checks", `checkpoint ${i + 1} has ${right.length} correct options`);
    else if (opts.length > 2) {
      const longestWrong = Math.max(...opts.filter((o) => !o.correct).map((o) => o.text.length));
      if (right[0].text.length > longestWrong * 1.34) P("giveaway", `checkpoint ${i + 1}: the right option is much the longest (${right[0].text.length} characters against ${longestWrong})`);
    }
    if (!c.feedback_correct) P("feedback", `checkpoint ${i + 1}: no feedback_correct`);
    if (!c.feedback_wrong) P("feedback", `checkpoint ${i + 1}: no feedback_wrong (a wrong answer would be told "Correct")`);
  });
  const c1 = parts.indexOf("check"), c2 = parts.indexOf("check2");
  if (c1 >= 0 && parts[c1 + 1] !== "reveal") P("noReveal", "check 1 is not followed by a reveal scene");
  if (c2 >= 0 && parts[c2 + 1] !== "recap") P("noRecap", "check 2 is not followed by the recap");
  if (c2 >= 0 && hook && cps[1]) {
    const a = keywords(`${hook.narration} ${T?.hook?.question ?? ""}`), b = keywords(`${cps[1].prompt} ${scenes[c2].narration}`);
    const shared = [...b].filter((w) => a.has(w));
    if (shared.length < 2) (T ? P : N)("hookUnpaid", "check 2 doesn't return to the hook's question");
  }
  if (c1 >= 0 && cps[0] && T) {
    const work = scenes.filter((_, i) => parts[i] === "work").map((s) => s.narration).join(" ");
    const said = sentences(work).some((s) => { const a = keywords(s), b = keywords(cps[0].prompt); const sh = [...b].filter((w) => a.has(w)); return b.size > 2 && sh.length >= b.size - 1; });
    if (said) N("check1Repeats", "check 1 looks like a sentence the worked case just said: ask about a new case");
  }

  /* ---- the close ---- */
  const last = scenes[scenes.length - 1];
  if (last && !/\bNext( lesson)?:/i.test(last.narration ?? "")) P("noNext", "the last scene doesn't name what comes next (\"Next lesson: …\")");
  const chapters = v.chapters ?? [];
  if (chapters.length < 4 || chapters.length > 5) P("chapters", `${chapters.length} chapters (4 or 5)`);
  for (const c of chapters) if (!scenes.some((s) => s.start === c.at)) P("chapters", `chapter "${c.label}" at ${c.at} doesn't start on a scene`);

  /* ---- Arabic ---- */
  if (!ar) P("noArabic", "no ar-EG.json");
  else {
    for (const s of scenes) {
      const a = ar.scenes?.[String(s.n)];
      if (!a?.narration) { P("noArabic", `scene ${s.n}: no Egyptian Arabic narration`); continue; }
      const ne = sentences(s.narration).length, na = sentences(a.narration).length;
      if (ne !== na) P("sentenceBreaks", `scene ${s.n}: ${na} Arabic sentences, ${ne} English`);
      if (s.on_screen_text && !a.on_screen_text) P("noArabic", `scene ${s.n}: no Arabic on-screen text`);
      const stiff = arWords(a.narration).filter((w) => MSA_IN_SPEECH.includes(w) || MSA_IN_SPEECH.includes(w.replace(/^[وف]/, "")));
      if (stiff.length) N("standardArabic", `scene ${s.n}: written-Arabic words in the narration: ${[...new Set(stiff)].join("، ")}`);
    }
    if ((ar.checkpoints ?? []).length !== cps.length) P("noArabic", `${(ar.checkpoints ?? []).length} Arabic checkpoints, ${cps.length} English`);
    (ar.checkpoints ?? []).forEach((c, i) => {
      if ((c.options ?? []).length !== (cps[i]?.options ?? []).length) P("noArabic", `checkpoint ${i + 1}: the Arabic options don't match the English`);
      if (!c.feedback_correct || !c.feedback_wrong) P("feedback", `checkpoint ${i + 1}: Arabic feedback missing (${!c.feedback_correct ? "correct" : "wrong"})`);
    });
    if (!ar.unit) N("noArabic", "ar-EG.json has no `unit` (the course title for the title card)");
    const arText = JSON.stringify(ar) + designText("ar-EG").join(" ");
    if (arText.includes("·")) P("middleDot", "\"·\" in the Arabic (it reads as a zero): use «،»");
  }

  /* ---- the unit file agrees ---- */
  const found = findLesson(lessonId);
  if (!found) N("noUnit", "no lesson with this id in content/units");
  else {
    const { lesson } = found;
    const step = lesson.steps.find((s) => s.type === "video");
    const read = lesson.steps.find((s) => s.type === "read");
    if (step && (step.chapters ?? []).length !== chapters.length) P("unitChapters", `the unit has ${(step.chapters ?? []).length} chapter labels, the storyboard ${chapters.length} chapters`);
    if (step && cps[0] && norm(step.checkpoint?.question?.prompt?.en) !== norm(cps[0].prompt)) P("unitCheckpoint", "the unit's checkpoint question is not the storyboard's first check");
    const spoken = norm(scenes.map((s) => s.narration).join(" "));
    if (step && norm(step.transcript?.en) !== spoken) N("unitTranscript", "the unit's transcript differs from the storyboard (import-media sets it after narration)");
    const terms = (read?.keyTerms ?? []).map((k) => norm(k.term?.en));
    for (const t of T?.terms ?? []) if (!terms.some((k) => k.includes(norm(t)) || norm(t).includes(k))) P("unitTerms", `the reading's key terms don't include "${t}"`);
    if (T && read && terms.length > (T.terms?.length ?? 0) + 1) N("unitTerms", `the reading has ${terms.length} key terms, the video ${T.terms.length}: one more at most`);
    const first = lesson.steps.find((s) => !["video", "read"].includes(s.type));
    if (cps[1] && first && (first.type !== "choice" || norm(first.prompt?.en) !== norm(cps[1].prompt))) (T ? P : N)("unitFirstQuestion", "the first practice question should be the video's second check, as a choice");
    if (T && step && lesson.slides?.[0] && T.hook?.question && norm(lesson.slides[0].narration?.en) !== norm(T.hook.question)) N("unitSlides", "the title slide's narration is not the hook's question");
  }
  return { id: lessonId, problems, notes, words: total, scenes: scenes.length };
}

const list = ALL ? readdirSync(SRC).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5).toLowerCase().replace(/^cy-1-1-/, "cyber-1-1-")) : ids;
if (!list.length) { console.error("Usage: node .claude/skills/darsi-course/scripts/check-lesson.mjs <lesson id>… | --all"); process.exit(2); }
let bad = 0;
const tally = new Map();
for (const id of list) {
  const r = check(id);
  if (r.problems.length) bad++;
  for (const code of new Set(r.problems.map((p) => p.code))) tally.set(code, (tally.get(code) ?? 0) + 1);
  if (ALL) continue;
  console.log(`${id}: ${r.scenes ?? 0} scenes, ${r.words ?? 0} words, ${r.problems.length} problem(s), ${r.notes.length} note(s)`);
  for (const p of r.problems) console.log(`  ✗ ${p.code}: ${p.text}`);
  for (const n of r.notes) console.log(`  · ${n.code}: ${n.text}`);
}
if (ALL) {
  console.log(`${list.length} lessons checked, ${list.length - bad} clean, ${bad} with problems.\nLessons that break each rule:`);
  for (const [code, n] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${code}`);
}
process.exit(bad ? 1 : 0);
