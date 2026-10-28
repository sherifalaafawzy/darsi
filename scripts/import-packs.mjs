#!/usr/bin/env node
/**
 * Imports Darsi's course packs (trainings/*.zip, unzipped) as courses: content/units/<unit>.json, in English, ready for
 * the Arabic. Each lesson's video comes from Lesson Studio, where the packs' storyboards became narrated lessons in
 * English and Egyptian Arabic: the light lesson (played on the phone by the Lesson Studio player) and the 240p MP4 with
 * captions, copied into content/media/<lesson>/ (gitignored; `npm run seed` uploads them). The packs' own lesson plans,
 * worksheets and answer keys (English PDFs) go to content/kits/<lesson>/.
 *
 *   node scripts/import-packs.mjs --packs <folder of unzipped packs> --studio <Lesson Studio repository> [--force]
 *   node scripts/import-packs.mjs ... --media-only     refresh the videos, light lessons, sizes and times only
 *
 * A unit file that exists holds the Arabic and any edits: it is left alone unless --force, and --media-only updates
 * only its video steps' media fields (files, sizes, durations, checkpoint and chapter times).
 * The units in content/units also had a hand pass after import (2026-10-27): multi-answer explanations that name each
 * option and say why the others are wrong, and a few sentences fixed for clarity and local fit. --force undoes it.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, sceneTimes, studioMedia, walk } from "./lib/studio-media.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const PACKS = resolve(flag("--packs") ?? join(ROOT, "trainings"));
const STUDIO = resolve(flag("--studio") ?? join(ROOT, "..", "lessonstudio"));
const force = args.includes("--force");
const mediaOnly = args.includes("--media-only");

/** The three packs: unit id, the pack's code, and per lesson the lab app and the competencies it builds. */
const UNITS = {
  "AI-1-1": {
    id: "ai-1-1",
    labs: ["nextword", "classifier", "bias", "factcheck"],
    labPrompts: ["Try it: guess the next word, the way a phone keyboard does", "Try it: teach the machine to spot scam messages", "Try it: see what happens when the examples leave people out", "Try it: check an AI’s answer, claim by claim"],
    competencies: [["T.AF.A", "S.TA.U"], ["T.AF.A", "S.TA.U"], ["T.ET.A", "S.ET.U", "T.HM.A"], ["T.HM.A", "S.HM.U", "DC.1.2"]],
  },
  "CY-1-1": {
    id: "cyber-1-1",
    labs: ["password", "phishing", "permissions", "footprint"],
    labPrompts: ["Try it: see how fast a password falls, and why three random words win", "Try it: scam or safe? Eight messages to judge", "Try it: give four new apps only what they really need", "Try it: see what a stranger can learn from harmless posts"],
    competencies: [["DC.4.1", "DC.4.2"], ["DC.4.2", "DC.4.1"], ["DC.4.1", "DC.4.2"], ["DC.4.2", "DC.2.6", "DC.4.3"]],
  },
  "IOT-1-2": {
    id: "iot-1-2",
    labs: ["sensor", "adc", "datalog", "decision"],
    labPrompts: ["Try it: a day in the life of a classroom sensor", "Try it: turn a signal into numbers, and see how the step size matters", "Try it: clean a week of readings before you trust the average", "Try it: decide with numbers, not hunches"],
    competencies: [["IOT.1"], ["IOT.1", "DC.1.2"], ["IOT.1", "IOT.3"], ["IOT.1", "DC.1.2"]],
  },
};
const TRACK_NAME = { ai: "AI", cyber: "Cyber safety", iot: "IoT" };

/* ---------- reading the packs ---------- */

const files = walk(PACKS);
const find = (re) => files.find((f) => re.test(basename(f)));
const findAll = (re) => files.filter((f) => re.test(basename(f)));
const plain = (s) => String(s ?? "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\s+/g, " ").trim();
const en = (s) => ({ en: plain(s) });
const pdfPages = (p) => Math.max(1, (readFileSync(p, "latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length);
const seconds = (mmss) => { const [m, s] = String(mmss).split(":").map(Number); return m * 60 + s; };

/* ---------- questions ---------- */

const ids = "abcdefgh";
/** Feedback as an explanation: Darsi says "Correct" or "Not quite" itself, so the pack's own verdict word goes. */
const why = (s) => { const t = plain(s).replace(/^(Yes|Correct|Right|True|False|No|Not quite)\s*[—:,-]\s*/i, ""); return t.charAt(0).toUpperCase() + t.slice(1); };
const explainOf = (options) => options.filter((o) => o.correct).map((o) => why(o.feedback)).join(" ");
/** A pack practice item (the lesson sources' format) as a Darsi step. */
function practiceStep(it, id) {
  switch (it.type) {
    case "choice":
    case "image": {
      const options = it.options.map((o, i) => ({ id: ids[i], text: en(o.text ?? o.label) }));
      const answer = ids[it.options.findIndex((o) => o.correct)];
      return { type: "choice", id, prompt: en(it.prompt), options, answer, explain: en(it.feedback ? why(it.feedback) : explainOf(it.options)) };
    }
    case "multi":
      return {
        type: "multi", id, prompt: en(it.prompt), options: it.options.map((o, i) => ({ id: ids[i], text: en(o.text) })),
        answers: it.options.flatMap((o, i) => (o.correct ? [ids[i]] : [])), explain: en(explainOf(it.options)),
      };
    case "truefalse":
      return { type: "truefalse", id, prompt: en(it.statement), answer: it.answer, explain: en(why(it.feedback)) };
    case "match":
      return { type: "match", id, prompt: en(it.prompt), pairs: it.pairs.map((p) => ({ left: en(p.left), right: en(p.right) })), explain: en(why(it.feedback)) };
    case "order":
      return { type: "order", id, prompt: en(it.prompt), steps: it.steps.map(en), explain: en(why(it.feedback)) };
    case "fill": {
      const blanks = it.parts.filter((p) => typeof p === "object").map((p) => p.blank).sort((a, b) => a - b);
      return {
        type: "fill", id, prompt: en(it.prompt),
        sentence: { en: it.parts.map((p) => (typeof p === "object" ? { blank: blanks.indexOf(p.blank) } : p)) },
        bank: { en: [...new Set(it.bank)] }, answers: { en: blanks.map((b) => it.answers[String(b)]) }, explain: en(why(it.feedback)),
      };
    }
    case "scenario":
      return {
        type: "scenario", id, prompt: en(it.ask), who: en(it.who), initial: en(it.initial), situation: en(it.situation),
        choices: it.choices.map((c, i) => ({ id: ids[i], label: en(c.label), tone: c.tone === "good" ? "good" : "consider", consequence: en(c.consequence) })),
      };
    case "hotspot":
      return hotspotStep(it, id);
  }
  throw new Error(`Unknown practice type ${it.type}`);
}

/**
 * A message with warning signs to tap: its sender, body and link, with a spot over the line each sign is on. Darsi's
 * card always ends in a link, so a picture with no link (a weather log) becomes "select all that apply" over its lines.
 */
function hotspotStep(it, id) {
  const lines = it.content_lines.map(plain);
  const linkAt = lines.findIndex((l, i) => i > 0 && /[a-z0-9-]+\.[a-z]{2,}\/\S*/i.test(l));
  const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "is", "it", "you", "your", "for", "with", "this", "that"]);
  const words = (s) => plain(s).toLowerCase().replace(/[“”"’']/g, "").split(/[^\p{L}\p{N}]+/u).filter((w) => w && !STOP.has(w));
  const lineOf = (sp, among) => {
    const want = new Set(words(sp.label));
    const scores = among.map((l) => words(l).filter((w) => want.has(w)).length);
    return scores.indexOf(Math.max(...scores));
  };
  const explain = en(it.spots.map((sp) => plain(sp.explanation)).join(" "));
  if (linkAt < 0) {
    const body = lines.slice(1);
    const hits = new Set(it.spots.map((sp) => lineOf(sp, body)));
    return {
      type: "multi", id, prompt: en(it.prompt.replace(/^Tap the (\w+) problems in/i, "Which $1 entries have a problem in").replace(/\.$/, "?")),
      options: body.map((l, i) => ({ id: ids[i], text: en(l) })), answers: body.flatMap((_, i) => (hits.has(i) ? [ids[i]] : [])), explain,
    };
  }
  const body = lines.filter((_, i) => i > 0 && i !== linkAt);
  // The card: the sender's name on top, the body lines, then the link at the bottom (the design system's HotspotImage).
  const bodyTop = 8, bodyH = 50, linkTop = 66, linkH = 26;
  const spots = it.spots.map((sp, i) => {
    const label = en(`${plain(sp.label)}: ${plain(sp.explanation)}`);
    if (/\blink\b/i.test(sp.label) || lineOf(sp, lines) === linkAt) return { id: `s${i + 1}`, x: 3, y: linkTop, w: 94, h: linkH, label };
    const k = lineOf(sp, body);
    const h = bodyH / body.length;
    return { id: `s${i + 1}`, x: 3, y: Math.round(bodyTop + k * h), w: 94, h: Math.round(h), label };
  });
  return { type: "hotspot", id, prompt: en(it.prompt), mock: { from: lines[0], body: { en: body.join("\n") }, link: { en: lines[linkAt] } }, spots, explain };
}

/** A unit check question (the packs' app format) as a Darsi step. */
function checkStep(q, id) {
  const prompt = q.questionHeader?.prompt;
  switch (q.component) {
    case "QuizOption":
      return practiceStep({ type: q.multi ? "multi" : "choice", prompt, options: q.options, feedback: q.multi ? undefined : q.options.find((o) => o.correct)?.feedback }, id);
    case "ImageChoice":
      return practiceStep({ type: "choice", prompt, options: q.options.map((o) => ({ text: o.label, correct: o.correct, feedback: q.feedback })), feedback: q.feedback }, id);
    case "TrueFalse":
      return practiceStep({ type: "truefalse", statement: q.statement ?? prompt, answer: q.answer, feedback: q.feedback }, id);
    case "OrderSteps": {
      const label = Object.fromEntries(q.items.map((x) => [x.id, x.label]));
      return practiceStep({ type: "order", prompt, steps: q.answer.map((x) => label[x]), feedback: q.feedback }, id);
    }
    case "MatchPairs": {
      const left = Object.fromEntries(q.left.map((x) => [x.id, x.label]));
      const right = Object.fromEntries(q.right.map((x) => [x.id, x.label]));
      return practiceStep({ type: "match", prompt, pairs: Object.entries(q.answer).map(([l, r]) => ({ left: left[l], right: right[r] })), feedback: q.feedback }, id);
    }
    case "ScenarioCard":
      return practiceStep({ type: "scenario", ask: q.ask ?? prompt, who: q.who, initial: q.initial, situation: q.situation, choices: q.choices }, id);
    case "FillBlank":
      return practiceStep({ type: "fill", prompt, parts: q.parts, bank: q.bank, answers: q.answer, feedback: q.feedback }, id);
  }
  throw new Error(`Unknown check component ${q.component}`);
}

/** Puts steps in an order where no two of the same type follow each other (CONTENT.md), keeping it close to the pack's. */
function spread(steps) {
  const out = [];
  const left = [...steps];
  while (left.length) {
    const prev = out.at(-1)?.type;
    let i = left.findIndex((s) => s.type !== prev);
    if (i < 0) i = 0;
    out.push(left.splice(i, 1)[0]);
  }
  return out;
}

/* ---------- media from Lesson Studio: scripts/lib/studio-media.mjs ---------- */

/* ---------- lessons ---------- */

function lessonOf(unit, code, cfg, S, n) {
  const lessonId = `${cfg.id}-${n}`;
  const studioId = S.id.toLowerCase();
  const m = studioMedia(ROOT, STUDIO, studioId, lessonId);
  const story = readJson(join(STUDIO, "content", "darsi", "source", `${S.id}.json`)).video;
  const arabic = readJson(join(STUDIO, "content", "darsi", studioId, "ar-EG.json"));
  const at = sceneTimes(STUDIO, studioId);
  const sceneOf = (mmss) => story.scenes.findIndex((s) => s.start === mmss);
  const chapters = story.chapters.map((c) => {
    const i = Math.max(0, sceneOf(c.at));
    return { at: at.en[i], atBy: { en: at.en[i], ar: at.ar[i] }, label: en(c.label) };
  });
  const cps = story.checkpoints ?? [];
  const cp = cps[0];
  const checkpoint = cp && {
    at: m.info.en.checks[0].at, atBy: { en: m.info.en.checks[0].at, ar: m.info.ar.checks[0].at },
    question: { type: "choice", id: "cp", prompt: en(cp.prompt), options: cp.options.map((o, i) => ({ id: ids[i], text: en(o.text) })), answer: ids[cp.options.findIndex((o) => o.correct)], explain: en(why(cp.feedback_correct)) },
  };
  const video = {
    type: "video", id: "video", prompt: { en: "Watch" }, title: en(S.lesson.title), src: null,
    sources: m.sources, captions: m.captions, duration: m.duration, sizeMB: m.sizeMB,
    transcript: { en: story.scenes.map((s) => plain(s.narration)).join(" "), ar: story.scenes.map((s) => plain(arabic.scenes[String(s.n)].narration)).join(" ") },
    chapters, ...(checkpoint ? { checkpoint } : {}), light: m.light,
  };
  if (mediaOnly) return { video };

  const read = {
    type: "read", id: "read", prompt: { en: "Read" }, title: en(S.lesson.subtitle ?? S.lesson.title),
    body: { en: [plain(S.core_concept.big_idea), ...S.core_concept.explanation.map(plain)].join("\n\n") },
    keyTerms: S.key_terms.map((k) => ({ term: en(k.term), def: en(k.definition) })),
  };
  const practice = spread(S.practice.map((it, i) => practiceStep(it, `p${i + 1}`)));
  const lab = { type: "lab", id: "lab", prompt: en(cfg.labPrompts[n - 1]), tool: cfg.labs[n - 1] };
  const reflect = { type: "reflect", id: "reflect", prompt: en(S.reflection.prompt), placeholder: en(S.reflection.placeholder) };
  const lp = S.lesson_plan;
  const project = {
    type: "project", id: "project", prompt: en(`Project: ${S.try_tomorrow.title}`), task: en(S.try_tomorrow.text),
    deliverable: en("A photo of your pupils’ work or of the board (no faces needed), and two sentences: what worked, and what you would change."),
    rubric: lp.objectives.map((o) => ({ criterion: en(`Pupils could: ${o.charAt(0).toLowerCase()}${o.slice(1)}`) })),
  };
  const half = Math.ceil(practice.length / 2);
  const steps = spread([video, read, ...practice.slice(0, half), lab, ...practice.slice(half), reflect, project]);

  // Slides from the pack's 40-minute lesson plan (apps/web/scripts/build-kits.mjs makes the slides, plan and worksheet).
  const main = lp.steps.reduce((a, b) => (b.minutes > a.minutes ? b : a));
  // The first sentence, never cut inside a quotation (“How do you know? …”).
  const firstSentence = (s) => {
    let out = "";
    for (const part of plain(s).split(/(?<=[.!?])\s/)) {
      out = out ? `${out} ${part}` : part;
      if ((out.match(/“/g) ?? []).length <= (out.match(/”/g) ?? []).length) break;
    }
    return out;
  };
  // The pack's objectives are about pupils ("in their own words"); under "Today we will" they speak as the class.
  const asClass = (s) => plain(s).replace(/\bthemselves\b/g, "ourselves").replace(/\btheir\b/g, "our").replace(/\bthey\b/g, "we").replace(/\bThey\b/g, "We");
  const questions = lp.steps.flatMap((s) => plain(s.say).split(/(?<=[.!?])\s/).filter((x) => x.endsWith("?"))).slice(0, 3);
  const slides = [
    { layout: "title", title: en(S.lesson.title), note: en(`${TRACK_NAME[unit.track]} · Level ${unit.level} · Lesson ${n}`), narration: en(lp.big_question) },
    { layout: "bullets", title: en("Today we will"), bullets: { en: lp.objectives.map(asClass) } },
    S.diagram
      ? { layout: "bullets", title: en(S.diagram.title), bullets: { en: S.diagram.steps.map(([, label]) => plain(label)) } }
      : { layout: "bullets", title: en("Remember"), bullets: { en: S.summary.points.map(plain) } },
    { layout: "activity", title: en(main.name === "Teach" ? lp.title : `${lp.title}: ${main.name}`), bullets: { en: lp.steps.map((s) => `${s.name} (${s.minutes} min): ${firstSentence(s.do)}`) },
      // The slide keeps one sentence per step; the teacher's lesson plan prints each step in full.
      details: { en: lp.steps.map((s) => `${s.name} (${s.minutes} min): ${plain(s.do)}`) }, note: en(lp.prep), narration: en(main.say) },
    { layout: "questions", title: en("Let’s discuss"), bullets: { en: questions.length ? questions : [plain(lp.big_question)] } },
    { layout: "exit", title: en("Exit ticket"), bullets: { en: [plain(lp.exit_ticket)] }, narration: en(lp.steps.at(-1).say) },
  ];

  // The kit: bilingual slides and plan (built from the slides), the pack's own English PDFs, and the video file.
  const kitDir = join(ROOT, "content", "kits", lessonId);
  mkdirSync(kitDir, { recursive: true });
  const kit = [
    { kind: "slides", title: en(`Slides: ${S.lesson.title}`), pages: 6, base: `${lessonId}/slides`, formats: ["pdf", "pptx"] },
    { kind: "lesson-plan", title: en(`Lesson plan and worksheet: ${S.lesson.title}`), pages: 2, base: `${lessonId}/lesson-plan`, formats: ["pdf"] },
  ];
  for (const [kind, re, title] of [["lesson-plan", new RegExp(`^L${n}_Lesson-plan_.*\\.pdf$`), `Full lesson plan (English): ${lp.title}`], ["worksheet", new RegExp(`^L${n}_Worksheet_.*\\.pdf$`), `Worksheet (English): ${S.worksheet?.title ?? S.lesson.title}`]]) {
    const pdf = findAll(re).find((f) => f.slice(PACKS.length + 1).startsWith(packOf[code]));
    if (!pdf) continue;
    const name = kind === "worksheet" ? "pack-worksheet" : "pack-lesson-plan";
    copyFileSync(pdf, join(kitDir, `${name}-en.pdf`));
    kit.push({ kind, title: en(title), pages: pdfPages(pdf), base: `${lessonId}/${name}`, formats: ["pdf"] });
  }
  kit.push({ kind: "video", title: en("The lesson video (240p, for class or WhatsApp)"), pages: 0, formats: ["mp4"], path: `/media/${lessonId}/video-{lang}` });

  const minutes = Math.min(60, Math.ceil(m.duration / 60) + 2 + practice.length + 3 + 2);
  return {
    id: lessonId, title: en(S.lesson.title), minutes, tryTomorrow: en(`${S.try_tomorrow.title}: ${S.try_tomorrow.text}`),
    // The kit's lesson plan prints the preparation note beside the materials, so "(see prep)" pointers go.
    materials: { en: lp.materials.map((m) => plain(m).replace(/\s*\(see (prep|Before class)\)/i, "")) }, steps, slides, kit, competencies: cfg.competencies[n - 1],
  };
}

/** The unit check: the pack's ten questions as a last lesson, with a review deck and the answer key. */
function checkLesson(unit, code, cfg, check, lessons) {
  const lessonId = `${cfg.id}-check`;
  const steps = spread(check.questions.map((q, i) => checkStep(q, `q${i + 1}`)));
  const kitDir = join(ROOT, "content", "kits", lessonId);
  mkdirSync(kitDir, { recursive: true });
  const kit = [
    { kind: "slides", title: en(`Slides: ${unit.title.en} review`), pages: 6, base: `${lessonId}/slides`, formats: ["pdf", "pptx"] },
    { kind: "lesson-plan", title: en(`Review plan and quiz sheet: ${unit.title.en}`), pages: 2, base: `${lessonId}/lesson-plan`, formats: ["pdf"] },
  ];
  const key = findAll(/^Answer-key_.*\.pdf$/).find((f) => f.slice(PACKS.length + 1).startsWith(packOf[code]));
  if (key) {
    copyFileSync(key, join(kitDir, "pack-answer-key-en.pdf"));
    kit.push({ kind: "worksheet", title: en("Answer key for the unit’s worksheets (English)"), pages: pdfPages(key), base: `${lessonId}/pack-answer-key`, formats: ["pdf"] });
  }
  return {
    id: lessonId, title: en(check.title), minutes: 10,
    tryTomorrow: en("Pick the habit from this unit your pupils need most, teach it this week, and tell a colleague how it went."),
    steps,
    slides: [
      { layout: "title", title: en(`${unit.title.en}: review`), note: en(`${TRACK_NAME[unit.track]} · Level ${unit.level} · Unit check`), narration: en("Today we look back at the whole unit and check what stuck.") },
      { layout: "bullets", title: en("In this unit"), bullets: { en: lessons.map((l) => l.title.en) } },
      { layout: "bullets", title: en("The big ideas"), bullets: { en: lessons.map((l) => l.steps.find((s) => s.type === "read").title.en) } },
      { layout: "activity", title: en("Team quiz"), bullets: { en: ["Make teams of four", "Read each question aloud; teams agree on one answer", "Reveal the answer and ask one team to explain why", "Write the hardest question on the board for tomorrow"] } },
      { layout: "questions", title: en("Let’s discuss"), bullets: { en: ["Which idea will you use first?", "Which question surprised you, and why?", "What will you tell your family about this unit?"] } },
      { layout: "exit", title: en("Exit ticket"), bullets: { en: ["One idea I will use, and when I will use it"] } },
    ],
    kit, competencies: [...new Set(lessons.flatMap((l) => l.competencies))],
  };
}

/* ---------- the units ---------- */

const packOf = {};
for (const [code] of Object.entries(UNITS)) {
  const u = find(new RegExp(`^${code}_unit\\.json$`));
  if (!u) throw new Error(`No ${code}_unit.json under ${PACKS}`);
  // The pack's folder: the first level under --packs.
  packOf[code] = u.slice(PACKS.length + 1).split(/[\\/]/)[0];
}

for (const [code, cfg] of Object.entries(UNITS)) {
  const out = join(ROOT, "content", "units", `${cfg.id}.json`);
  const exists = existsSync(out);
  if (exists && !force && !mediaOnly) { console.log(`${cfg.id}: exists, left alone (--force replaces it, --media-only refreshes its videos)`); continue; }
  const meta = readJson(find(new RegExp(`^${code}_unit\\.json$`)));
  const sources = findAll(new RegExp(`^${code}-[1-9]\\.json$`)).filter((f) => !f.includes("App-content")).sort();
  const check = readJson(find(new RegExp(`^${code}-check\\.app\\.json$`)));
  const unit = { id: cfg.id, track: meta.track, level: meta.level, title: en(meta.title), summary: en(meta.subtitle), lessons: [] };
  if (mediaOnly) {
    if (!exists) { console.log(`${cfg.id}: no unit file to refresh`); continue; }
    const current = readJson(out);
    sources.forEach((f, i) => {
      const { video } = lessonOf(unit, code, cfg, readJson(f), i + 1);
      const step = current.lessons[i].steps.find((s) => s.type === "video");
      // Media fields only: the text (and its Arabic) stays as it is.
      Object.assign(step, { sources: video.sources, captions: video.captions, duration: video.duration, sizeMB: video.sizeMB, light: video.light });
      step.chapters = step.chapters?.map((c, k) => ({ ...c, at: video.chapters[k]?.at ?? c.at, atBy: video.chapters[k]?.atBy }));
      if (step.checkpoint && video.checkpoint) Object.assign(step.checkpoint, { at: video.checkpoint.at, atBy: video.checkpoint.atBy });
    });
    writeFileSync(out, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`${cfg.id}: videos refreshed`);
    continue;
  }
  unit.lessons = sources.map((f, i) => lessonOf(unit, code, cfg, readJson(f), i + 1));
  unit.lessons.push(checkLesson(unit, code, cfg, check, unit.lessons));
  writeFileSync(out, `${JSON.stringify(unit, null, 2)}\n`);
  console.log(`${cfg.id}: ${unit.lessons.length} lessons, ${unit.lessons.reduce((n, l) => n + l.steps.length, 0)} steps`);
}
