#!/usr/bin/env node
/**
 * Builds the classroom kits from the course sources (content/units/*.json at the repo root):
 *   content/kits/<lesson>/slides-<lang>.pptx   — editable PowerPoint (pptxgenjs), RTL for Arabic
 *   content/kits/<lesson>/slides-<lang>.pdf    — the same slides as PDF (headless Chromium, brand fonts embedded)
 *   content/kits/<lesson>/lesson-plan-<lang>.pdf — A4 lesson plan, the sheet of the lesson's questions, and their answers
 * and writes each built PDF's page count into its kit item (`pages`, which the Kit screen shows) in the unit file,
 * changing nothing else there.
 * The app ships no courses: `npm run seed` uploads these with the unit and publishes it (scripts/seed-content.mjs).
 *
 * Usage:  npm run kits            (all units, all languages)
 *         npm run kits -- ai-1-1 data-s2  (only these units)
 *   --no-pages              leave the unit files alone (no page counts written)
 *   --units=DIR --out=DIR   read the units from, and write the kits to, other folders (to try a change)
 * Needs Chromium for the PDFs: run `npx playwright install chromium` once, or set CHROMIUM_PATH.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import PptxGenJS from "pptxgenjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const CONTENT = resolve(flag("units") ?? resolve(ROOT, "../../content/units"));
const OUT = resolve(flag("out") ?? resolve(ROOT, "../../content/kits"));
const DS = resolve(ROOT, "../../packages/design-system");
const FONTS = pathToFileURL(join(DS, "assets/fonts")).href;
const MARK_PNG = join(ROOT, "public/app-icons/app-icon-192.png");
const LANGS = ["en", "ar"];
const only = new Set(args.filter((a) => !a.startsWith("--")));
// Where capstone starters live (src/content/capstone.ts STARTER_ORG, so a move there reaches the kits too).
const STARTER_ORG = /STARTER_ORG\s*=\s*"([^"]+)"/.exec(readFileSync(join(ROOT, "src/content/capstone.ts"), "utf8"))?.[1] ?? "https://github.com/darsi-org";

const C = { ink: "1E1A33", muted: "5C5470", paper: "F2F2F2", kola: "FF6A2B", kolaSoft: "FFE2D2", kolaDeep: "B43C0A", line: "EAD9C4" };
// Each built-in track's colour family (content/tracks.ts), from the design tokens: solid, soft, ink. Other tracks get slate.
const TONES = { ai: "sunbird", iot: "lagoon", cyber: "hibiscus", code: "sky", data: "leaf", agents: "lilac", opt: "clay", aisec: "slate" };
const TOKENS = Object.fromEntries(JSON.parse(readFileSync(join(DS, "src/tokens/tokens.json"), "utf8")).color.tokens.map((t) => [t.name, t.value.light.slice(1).toUpperCase()]));
const trackColours = (track) => { const tone = TONES[track] ?? "slate"; return [TOKENS[tone], TOKENS[`${tone}-soft`], TOKENS[`${tone}-ink`]]; };
const pick = (t, lang) => (t ? t[lang] ?? t.en : "");
const pickList = (t, lang) => (t ? t[lang] ?? t.en : []);
const digits = (n, lang) => new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en").format(n);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const UI = {
  en: { footer: "Darsi · free to copy for your school", plan: "Lesson plan · for the teacher", planCheck: "Review plan · for the teacher", sheet: "Worksheet · for pupils", sheetCheck: "Quiz sheet · for each team", answers: "Answers · for the teacher",
    goals: "Learning goals", activity: "Activity", discuss: "Discussion", exit: "Exit ticket", tomorrow: "Try it in class tomorrow", time: "Time", min: "min", materials: "Materials", materialsV: "Board, chalk, paper. No devices needed.", name: "Name", cls: "Class", team: "Team", date: "Date", tf: ["True", "False"], reflect: "In your own words", forYou: "For you to think about", bank: "Word bank", unit: "Unit", lesson: "Lesson", sep: " · ", listSep: "; ", numSep: ", ", pairSep: " — ", topDown: "Top to bottom", line: "Line",
    cParsons: "Number the lines in order (1, 2, 3…). Cross out any line that doesn’t belong.", cBug: "Circle the line with the mistake. Write it correctly:",
    cParsonsIndent: "Number the lines in order (1, 2, 3…), and draw one arrow → in front of a line for each indent it needs. Cross out any line that doesn’t belong.",
    cWrite: "Write your program:", cRobot: "Cut out cards (↑ forward, ↶ turn left, ↷ turn right) and lay out a program that takes the robot to the ★. Write it here:",
    cFrom: (n, whole) => (whole ? `Use the code from question ${n}, with its gaps filled in.` : `Here goes the code from question ${n}, with its gaps filled in.`),
    kRobot: (n) => `Any program that takes the robot to the ★ with ${n} cards or fewer.`,
    // A capstone's milestone sheet.
    milestones: "Milestone sheet", repo: "My GitHub repo link", handIn: "Hand in", finishBy: "Finish by", handedIn: "Handed in on", blocked: "What blocked me, and my next step", starter: "Starter",
    hours: (h, d) => `about ${d} ${h === 1 ? "hour" : "hours"}` },
  ar: { footer: "درسي — يُسمح بنسخها لمدرستك مجانًا", plan: "خطة درس — للمعلم", planCheck: "خطة المراجعة — للمعلم", sheet: "ورقة عمل — للطلاب", sheetCheck: "ورقة الاختبار — لكل فريق", answers: "الإجابات — للمعلم",
    goals: "أهداف التعلّم", activity: "النشاط", discuss: "للنقاش", exit: "بطاقة الخروج", tomorrow: "جرّبها في الفصل غدًا", time: "المدة", min: "دقيقة", materials: "المواد", materialsV: "سبّورة، طباشير، ورق. لا حاجة إلى أجهزة.", name: "الاسم", cls: "الفصل", team: "الفريق", date: "التاريخ", tf: ["صح", "خطأ"], reflect: "بكلماتك", forYou: "لتفكّر فيه", bank: "بنك الكلمات", unit: "الوحدة", lesson: "الدرس", sep: "، ", listSep: "، ", numSep: "، ", pairSep: " — ", topDown: "من الأعلى إلى الأسفل", line: "السطر",
    cParsons: "رقّم الأسطر بالترتيب (١، ٢، ٣…). اشطب أي سطر لا ينتمي إلى البرنامج.", cBug: "ضع دائرة حول السطر الذي فيه الخطأ، ثم اكتبه صحيحًا:",
    cParsonsIndent: "رقّم الأسطر بالترتيب (١، ٢، ٣…)، وارسم أمام السطر سهمًا → عن كل إزاحة يحتاج إليها. اشطب أي سطر لا ينتمي إلى البرنامج.",
    cWrite: "اكتب برنامجك:", cRobot: "قصّ بطاقات (↑ إلى الأمام، ↶ استدر يسارًا، ↷ استدر يمينًا) ورتّب برنامجًا يوصل الروبوت إلى ★. اكتبه هنا:",
    cFrom: (n, whole) => (whole ? `استخدم الكود من السؤال ${n} بعد ملء فراغاته.` : `هنا الكود من السؤال ${n} بعد ملء فراغاته.`),
    kRobot: (n) => `أي برنامج يوصل الروبوت إلى ★ بعدد من البطاقات لا يزيد على ${n}.`,
    milestones: "ورقة المراحل", repo: "رابط مستودعي على GitHub", handIn: "المطلوب تسليمه", finishBy: "أنجزها بحلول", handedIn: "سُلِّمت في", blocked: "ما أعاقني، وخطوتي التالية", starter: "قالب البداية",
    hours: (h, d) => `${h === 1 ? "ساعة واحدة" : h === 2 ? "ساعتان" : Number.isInteger(h) && h >= 3 && h <= 10 ? `${d} ساعات` : `${d} ساعة`} تقريبًا` },
};
// Students' courses (`audience: "students"`) are written to the student: their notes and sheet never speak to a teacher.
const STUDENT_UI = {
  en: { plan: "Lesson notes · for you", planCheck: "Review notes · for you", sheet: "Worksheet", sheetCheck: "Quiz sheet", answers: "Check your answers", exit: "Check yourself", tomorrow: "Try it this week", materialsV: "Paper and a pen. No device needed." },
  ar: { plan: "ملاحظات الدرس — لك", planCheck: "ملاحظات المراجعة — لك", sheet: "ورقة عمل", sheetCheck: "ورقة الاختبار", answers: "تحقّق من إجاباتك", exit: "تحقّق من نفسك", tomorrow: "جرّبها هذا الأسبوع", materialsV: "ورق وقلم. لا حاجة إلى جهاز." },
};
// University courses (`teach: "university"`) speak to a lecturer: lecture plan, seminar sheet, the next lecture, an institution.
const UNI_UI = {
  en: { footer: "Darsi · free to copy for your institution", plan: "Lecture plan · for the lecturer", planCheck: "Review plan · for the lecturer", sheet: "Seminar sheet · for students", sheetCheck: "Quiz sheet · for students", answers: "Answers · for the lecturer", cls: "Group", tomorrow: "Try it in your next lecture", materialsV: "Projector or board, and the lecture slides." },
  ar: { footer: "درسي — يُسمح بنسخها لمؤسستك مجانًا", plan: "خطة المحاضرة، لعضو هيئة التدريس", planCheck: "خطة المراجعة، لعضو هيئة التدريس", sheet: "ورقة الحلقة النقاشية، للطلاب", sheetCheck: "ورقة الاختبار، للطلاب", answers: "الإجابات، لعضو هيئة التدريس", cls: "المجموعة", tomorrow: "جرّبها في محاضرتك القادمة", materialsV: "جهاز عرض أو سبّورة، وشرائح المحاضرة." },
};
// School teachers' courses from level 2: "try it tomorrow" is as often a staff task as a class one.
const STAFF_UI = { en: { tomorrow: "Try it at school tomorrow" }, ar: { tomorrow: "جرّبها في المدرسة غدًا" } };
// … and their questions are about the teacher's own practice, so a lesson's sheet is the teacher's, not the pupils'.
const PRACTICE_UI = { en: { sheet: "Practice questions · for you", answers: "Check your answers" }, ar: { sheet: "أسئلة للتدريب — لك", answers: "تحقّق من إجاباتك" } };
const isCheck = (lesson) => /-check$/.test(lesson?.id ?? "");
const uiFor = (unit, lang, lesson) => (unit.audience === "students" ? { ...UI[lang], ...STUDENT_UI[lang] }
  : unit.teach === "university" ? { ...UI[lang], ...UNI_UI[lang] }
  : unit.level >= 2 ? { ...UI[lang], ...STAFF_UI[lang], ...(isCheck(lesson) ? {} : PRACTICE_UI[lang]) }
  : UI[lang]);

/**
 * Who answers a lesson's printed questions, so every page speaks to the right person:
 * - students' courses: the student. Notes, then a worksheet with their reflection, then the answers to check it.
 * - school teachers' courses at level 1: their pupils (the questions are the subject itself). The teacher's own
 *   reflection never goes on the pupils' sheet; it goes on the teacher's answers page.
 * - school teachers' courses at levels 2–4: the teacher (the questions are about their own teaching), so the sheet is
 *   their practice sheet, reflection included, with no name or class to fill in.
 * - university courses: the lecturer's students, on a seminar sheet; the lecturer's reflection goes on the answers page.
 * - unit checks: a quiz sheet with every question (for each team, in teachers' courses), and the answers to reveal.
 * - capstones: a milestone sheet (planHtml) in the stage that has milestones. A lesson with nothing to print gets no sheet.
 */
function sheetFor(unit, lesson) {
  const students = unit.audience === "students", uni = !students && unit.teach === "university", check = isCheck(lesson);
  const practice = !students && !uni && unit.level >= 2 && !check;
  return { check, reflectOnSheet: students || practice, fields: check && !students && !uni ? ["team", "date"] : practice ? [] : ["name", "cls", "date"] };
}

/**
 * Type size for a slide's text: the base size while it fits `room` characters, smaller as it grows (area goes with the
 * square of the size), never under `min`. Activity slides carry the steps and the preparation note, so they get long.
 */
const fit = (texts, base, room, min) => { const n = texts.join(" ").length; return n <= room ? base : Math.max(min, Math.floor(base * Math.sqrt(room / n))); };

/* ---------------- PPTX ---------------- */
function buildPptx(unit, lesson, lang) {
  const rtl = lang === "ar", u = uiFor(unit, lang, lesson), [trackC, trackSoft, trackInk] = trackColours(unit.track);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 × 7.5 in
  pptx.rtlMode = rtl;
  pptx.author = "Darsi"; pptx.company = "Darsi"; pptx.title = pick(lesson.title, lang); pptx.lang = rtl ? "ar-SA" : "en-GB";
  const font = "Arial"; // available on every school PC and phone, with full Arabic support
  const align = rtl ? "right" : "left";
  const T = (o) => ({ fontFace: font, color: C.ink, align, rtlMode: rtl, lang: rtl ? "ar-SA" : "en-GB", ...o });
  const frame = (s, n) => {
    s.background = { color: "FFFFFF" };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.28, fill: { color: trackC }, line: { color: trackC } });
    s.addImage({ path: MARK_PNG, x: rtl ? 0.45 : 12.38, y: 6.75, w: 0.5, h: 0.5 });
    s.addText(`${u.footer}${u.sep}${pick(lesson.title, lang)}${u.sep}${digits(n, lang)}`, T({ x: rtl ? 1.1 : 0.5, y: 6.82, w: 11.7, h: 0.4, fontSize: 11, color: C.muted }));
  };
  lesson.slides.forEach((sl, i) => {
    const s = pptx.addSlide();
    frame(s, i + 1);
    const title = pick(sl.title, lang), bullets = pickList(sl.bullets, lang), note = pick(sl.note, lang);
    if (sl.layout === "title") {
      s.addShape(pptx.ShapeType.roundRect, { x: rtl ? 0.6 : 8.9, y: 1.4, w: 3.8, h: 3.8, fill: { color: trackSoft }, line: { color: trackSoft }, rectRadius: 0.4 });
      s.addImage({ path: MARK_PNG, x: rtl ? 1.5 : 9.8, y: 2.3, w: 2, h: 2 });
      s.addText(title, T({ x: rtl ? 4.8 : 0.7, y: 2.0, w: 7.9, h: 2.0, fontSize: 54, bold: true, valign: "middle" }));
      if (note) s.addText(note, T({ x: rtl ? 4.8 : 0.7, y: 4.1, w: 7.9, h: 0.6, fontSize: 22, color: trackInk, bold: true }));
      return;
    }
    s.addText(title, T({ x: 0.7, y: 0.65, w: 11.9, h: 1.0, fontSize: 38, bold: true }));
    const numbered = sl.layout === "activity" || sl.layout === "questions";
    const box = sl.layout === "activity" && note;
    const size = fit(bullets, 26, box ? 230 : 360, 14), noteSize = fit([note], 20, 100, 12), tall = note.length > 100;
    s.addText(bullets.map((b, k) => ({ text: b, options: { bullet: numbered ? { type: "number", style: rtl ? "arabicPeriod" : "arabicPeriod" } : { code: "25CF" }, breakLine: k < bullets.length - 1, paraSpaceAfter: Math.round(size / 2), rtlMode: rtl } })),
      T({ x: 0.9, y: 1.85, w: box ? 7.9 : 11.5, h: 4.6, fontSize: size, valign: "top", ...(rtl && box ? { x: 4.55 } : {}) }));
    if (box) {
      s.addShape(pptx.ShapeType.roundRect, { x: rtl ? 0.7 : 9.1, y: 1.95, w: 3.55, h: tall ? 4.4 : 2.2, fill: { color: C.kolaSoft }, line: { color: C.kola, width: 2 }, rectRadius: 0.2 });
      s.addText(note, T({ x: rtl ? 0.85 : 9.25, y: 2.05, w: 3.25, h: tall ? 4.2 : 2.0, fontSize: noteSize, bold: true, valign: "middle", align: "center" }));
    } else if (note) s.addText(note, T({ x: 0.9, y: 6.1, w: 11.5, h: 0.5, fontSize: 18, color: C.muted }));
    if (sl.layout === "exit") s.addShape(pptx.ShapeType.rect, { x: 0.9, y: 5.0, w: 11.5, h: 0.04, fill: { color: C.line }, line: { color: C.line } });
  });
  return pptx;
}

/* ---------------- HTML for PDFs ---------------- */
const fontCss = `
@font-face{font-family:"Baloo 2";src:url(${FONTS}/baloo-2-latin-800-normal.woff2);font-weight:800}
@font-face{font-family:"Baloo 2";src:url(${FONTS}/baloo-2-latin-700-normal.woff2);font-weight:700}
@font-face{font-family:"Baloo Bhaijaan 2";src:url(${FONTS}/baloo-bhaijaan-2-arabic-800-normal.woff2);font-weight:800}
@font-face{font-family:"Baloo Bhaijaan 2";src:url(${FONTS}/baloo-bhaijaan-2-arabic-700-normal.woff2);font-weight:700}
@font-face{font-family:"Noto Sans";src:url(${FONTS}/noto-sans-latin-wght-normal.woff2);font-weight:100 900}
@font-face{font-family:"Noto Sans Arabic";src:url(${FONTS}/noto-sans-arabic-arabic-wght-normal.woff2);font-weight:100 900}
*{box-sizing:border-box}body{margin:0;color:#1e1a33;font-family:"Noto Sans","Noto Sans Arabic",sans-serif}
h1,h2,h3{font-family:"Baloo 2","Baloo Bhaijaan 2",sans-serif;margin:0;line-height:1.15}`;
const MARK_SVG = `<svg viewBox="0 0 64 64"><path d="M14 4h36a10 10 0 0 1 10 10v28a10 10 0 0 1-10 10H26l-12 9v-9a10 10 0 0 1-10-10V14A10 10 0 0 1 14 4z" fill="#ff6a2b"/><path d="M32 13c1.6 7.4 4.6 10.4 12 12-7.4 1.6-10.4 4.6-12 12-1.6-7.4-4.6-10.4-12-12 7.4-1.6 10.4-4.6 12-12z" fill="#ffc53d"/><circle cx="46" cy="40" r="4" fill="#1e1a33"/></svg>`;

function slidesHtml(unit, lesson, lang) {
  const rtl = lang === "ar", u = uiFor(unit, lang, lesson), [trackC, trackSoft, trackInk] = trackColours(unit.track);
  const slides = lesson.slides.map((sl, i) => {
    const title = esc(pick(sl.title, lang)), note = esc(pick(sl.note, lang)), bullets = pickList(sl.bullets, lang).map(esc);
    const numbered = sl.layout === "activity" || sl.layout === "questions";
    const boxed = sl.layout === "activity" && note;
    const size = fit(pickList(sl.bullets, lang), 26, boxed ? 230 : 360, 14), noteSize = fit([pick(sl.note, lang)], 20, 100, 12);
    const list = bullets.length ? `<${numbered ? "ol" : "ul"} style="font-size:${size}pt">${bullets.map((b) => `<li>${b}</li>`).join("")}</${numbered ? "ol" : "ul"}>` : "";
    const body = sl.layout === "title"
      ? `<div class="hero"><div><h1 class="big">${title}</h1>${note ? `<p class="kicker">${note}</p>` : ""}</div><div class="markbox">${MARK_SVG}</div></div>`
      : `<h1>${title}</h1><div class="cols${sl.layout === "activity" && note ? " with-box" : ""}">${list}${boxed ? `<div class="box" style="font-size:${noteSize}pt">${note}</div>` : ""}</div>${sl.layout !== "activity" && note ? `<p class="note">${note}</p>` : ""}${sl.layout === "exit" ? `<div class="lines"><i></i><i></i><i></i></div>` : ""}`;
    return `<section class="slide"><div class="band"></div>${body}<footer><span class="m">${MARK_SVG}</span><span>${esc(u.footer)}${u.sep}${esc(pick(lesson.title, lang))}</span><span class="n">${digits(i + 1, lang)}</span></footer></section>`;
  }).join("");
  return `<!doctype html><html lang="${lang}" dir="${rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><style>${fontCss}
@page{size:13.333in 7.5in;margin:0}
.slide{position:relative;width:13.333in;height:7.5in;padding:.75in .8in .9in;page-break-after:always;overflow:hidden;background:#fff}
.slide:last-child{page-break-after:auto}
.band{position:absolute;inset:0 0 auto 0;height:.28in;background:#${trackC}}
h1{font-size:44pt;font-weight:800;margin-bottom:.35in}
.big{font-size:64pt}
.hero{display:flex;align-items:center;justify-content:space-between;gap:.6in;height:100%}
.markbox{flex:none;width:3.6in;height:3.6in;border-radius:.4in;background:#${trackSoft};display:grid;place-items:center}.markbox svg{width:2.1in;height:2.1in}
.kicker{font-size:22pt;font-weight:700;color:#${trackInk};margin:.2in 0 0}
.cols{display:grid;grid-template-columns:1fr;gap:.4in}.cols.with-box{grid-template-columns:1fr 3.4in}
ul,ol{margin:0;padding-inline-start:.45in;font-size:26pt;line-height:1.45}li{margin-bottom:.14in}
ol li::marker{font-weight:800;color:#b43c0a}ul li::marker{color:#${trackC === "FFC53D" ? "B43C0A" : trackInk}}
${rtl ? "ol{list-style:arabic-indic}" : ""}
.box{align-self:start;padding:.3in;border:3px solid #ff6a2b;border-radius:.2in;background:#ffe2d2;font-size:20pt;font-weight:700;text-align:center}
.note{font-size:18pt;color:#5c5470}
.lines i{display:block;height:.55in;border-bottom:2px solid #c9b8a4}
footer{position:absolute;inset:auto .8in .3in .8in;display:flex;align-items:center;gap:.15in;font-size:11pt;color:#5c5470}
footer .m svg{width:.35in;height:.35in;display:block}footer .n{margin-inline-start:auto;font-weight:700}
</style></head><body>${slides}</body></html>`;
}

/* The questions on a lesson plan's sheet (planHtml). */
const CODE_TYPES = ["code", "parsons", "codefill", "bug", "blocks"];
const PRINTED = new Set(["choice", "multi", "image", "truefalse", "match", "order", "fill", "type", ...CODE_TYPES]);
/**
 * The questions a lesson's sheet prints, in lesson order: every one in a unit check, the first five in a lesson. On
 * paper every question shows at once, so a program to write that a printed bug question shows (its fixed code is in
 * the solution, or the solution in it) is left off for the next question: the bug question would answer it.
 */
export const printedSteps = (lesson) => {
  const all = lesson.steps.filter((s) => PRINTED.has(s.type)), max = isCheck(lesson) ? Infinity : 5, skip = new Set();
  const lines = (text) => codeLines(text).map((x) => x.l);
  const within = (hay, needle) => needle.length >= 2 && hay.some((_, a) => a + needle.length <= hay.length && needle.every((l, k) => hay[a + k] === l));
  for (;;) {
    const p = all.filter((s) => !skip.has(s)).slice(0, max);
    const bugs = p.filter((s) => s.type === "bug").map((s) => lines(s.code.split("\n").map((l, i) => (i + 1 === s.line ? s.fix : l)).join("\n")));
    const shown = p.find((s) => s.type === "code" && bugs.some((b) => within(lines(s.solution), b) || within(b, lines(s.solution))));
    if (!shown) return p;
    skip.add(shown);
  }
};
const codeBox = (text, numbered = false) => `<pre class="code" dir="ltr">${text.replace(/\n$/, "").split("\n").map((l, i) => `${numbered ? `<span class="ln">${i + 1}</span>` : ""}${esc(l)}`).join("\n")}</pre>`;
/** The same random numbers for the same string, every build (FNV-1a, then mulberry32). */
function random(seed) {
  let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/**
 * The order to print `n` items in, as indexes into the authored list. The same in every build and every language (it
 * depends only on the seed and `n`), and different per question: seed it with the lesson and the step, because every
 * lesson reuses the step ids p1, p2…. `scramble` also keeps every item off its authored place and, from four items,
 * off its place in the reversed list too, so an order, match, Parsons or word-bank question never prints its answer,
 * or most of it, read down or up (two items can only be swapped; three are rotated). Choices are only shuffled: a
 * rule such as "never where the author put it" would itself be a pattern.
 */
export function printOrder(n, seed, scramble = false) {
  const ids = [...Array(n).keys()];
  if (n < 2) return ids;
  const next = random(seed);
  const ok = (p) => !scramble || p.every((v, i) => v !== i && (n < 4 || v !== n - 1 - i));
  for (let tries = 0; tries < 500; tries++) {
    const p = ids.slice();
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    if (ok(p)) return p;
  }
  return ids.map((i) => (i + 1) % n); // not reached in practice: a rotation is at least off every authored place
}
/** printOrder(n, seed, true), seeded again (seed#1, seed#2…) while `bad` holds for it, so a question can rule out more. */
function scrambled(n, seed, bad = () => false) {
  let order = printOrder(n, seed, true);
  for (let k = 1; k <= 50 && bad(order); k++) order = printOrder(n, `${seed}#${k}`, true);
  return order;
}
/** True when the first `count` places hold only answers (`isAnswer(i)`) and the bank has more: the answers would come first. */
const answersFirst = (order, isAnswer) => { const count = order.filter(isAnswer).length; return count > 0 && count < order.length && order.slice(0, count).every(isAnswer); };
/** A code text as lines without the blank ones, each with its place in the text. */
const codeLines = (text) => String(text).replace(/\n$/, "").split("\n").map((l, i) => ({ i, l: l.trimEnd() })).filter((x) => x.l.trim());
/**
 * A question's code (a snippet, a starter) as printed. On paper every question shows at once, so when it contains the
 * code another question asks to complete (`filled`: a codefill's lines with the gaps filled in, from two lines), it
 * points to that question instead of printing its answer.
 */
function shownCode(text, filled, u, n) {
  const lines = codeLines(text), all = String(text).replace(/\n$/, "").split("\n");
  for (const f of filled) for (let a = 0; a + f.lines.length <= lines.length; a++) {
    if (!f.lines.every((l, k) => lines[a + k].l === l)) continue;
    const before = all.slice(0, lines[a].i).join("\n").replace(/\n+$/, ""), after = all.slice(lines[a + f.lines.length - 1].i + 1).join("\n").replace(/^\n+/, "");
    const whole = !before.trim() && !after.trim();
    return `${before.trim() ? codeBox(before) : ""}<p class="how">${esc(u.cFrom(n(f.q), whole))}</p>${after.trim() ? codeBox(after) : ""}`;
  }
  return codeBox(text);
}
const ARROW = { N: "↑", E: "→", S: "↓", W: "←" };
const robotGrid = (w) => `<table class="robot" dir="ltr">${Array.from({ length: w.rows }, (_, y) => `<tr>${Array.from({ length: w.cols }, (_, x) => {
  const wall = (w.walls ?? []).some((p) => p.x === x && p.y === y);
  return `<td class="${wall ? "wall" : ""}">${w.start.x === x && w.start.y === y ? ARROW[w.start.dir] : w.goal.x === x && w.goal.y === y ? "★" : ""}</td>`;
}).join("")}</tr>`).join("")}</table>`;

/**
 * One printed question: what the sheet shows (`body`) and its answer for the answers page (`key`). Lists print in
 * printOrder, so the sheet never gives the answer away. The code steps on paper, for classes without devices: number
 * the strips, fill the gaps, circle the bug, write the program, or walk the robot on the grid with cut-out cards.
 */
function question(s, sid, u, lang, box = codeBox) {
  const n = (k) => digits(k, lang), b = (x) => `<b>${x}</b>`; // b(): an answer inside its sentence or its code
  const optionText = (o) => (o ? pick(s.type === "image" ? o.label : o.text, lang) : "");
  switch (s.type) {
    case "choice": case "multi": case "image": {
      const order = printOrder(s.options.length, sid);
      return { body: `<div class="opts">${order.map((i) => `<span><i class="${s.type === "multi" ? "sq" : ""}"></i>${esc(optionText(s.options[i]))}</span>`).join("")}</div>`,
        key: s.type === "multi" ? s.options.filter((o) => s.answers.includes(o.id)).map((o) => esc(optionText(o))).join(u.listSep) : esc(optionText(s.options.find((o) => o.id === s.answer))) };
    }
    case "truefalse": return { body: `<div class="opts">${u.tf.map((x) => `<span><i></i>${x}</span>`).join("")}</div>`, key: u.tf[s.answer ? 0 : 1] };
    case "match": {
      // Two pairs can share an answer: never print one beside a left side it belongs to either.
      const right = (i) => pick(s.pairs[i].right, "en");
      const order = scrambled(s.pairs.length, sid, (o) => o.some((v, i) => right(v) === right(i)));
      return { body: `<div class="match">${s.pairs.map((p, j) => `<span class="b">${esc(pick(p.left, lang))}</span><span class="dots">• • • •</span><span class="b">${esc(pick(s.pairs[order[j]].right, lang))}</span>`).join("")}</div>`,
        key: s.pairs.map((p) => `${esc(pick(p.left, lang))}${u.pairSep}${esc(pick(p.right, lang))}`).join("<br>") };
    }
    case "order": {
      const order = scrambled(s.steps.length, sid);
      return { body: `<div class="order">${order.map((i) => `<div><i></i>${esc(pick(s.steps[i], lang))}</div>`).join("")}</div>`,
        key: `${u.topDown}: ${order.map((i) => n(i + 1)).join(u.numSep)}` };
    }
    case "fill": {
      // Which bank words are answers, from the English (the same order in every language), never all of them first.
      const parts = s.sentence[lang] ?? s.sentence.en, bank = pickList(s.bank, lang), answers = pickList(s.answers, lang), en = new Set(pickList(s.answers, "en"));
      const order = scrambled(bank.length, sid, (o) => answersFirst(o, (i) => en.has(pickList(s.bank, "en")[i])));
      return { body: `<p class="fill">${parts.map((p) => (typeof p === "string" ? esc(p) : `<span class="gap"></span>`)).join("")}</p><p class="bank"><b>${u.bank}:</b> ${order.map((i) => esc(bank[i])).join(u.sep)}</p>`,
        key: parts.map((p) => (typeof p === "string" ? esc(p) : b(esc(answers[p.blank] ?? "")))).join("") };
    }
    case "type": return { body: `<div class="lines"><i></i></div>`, key: pickList(s.accept, lang).slice(0, 3).map(esc).join(u.listSep) };
    case "parsons": {
      // Strips print without their indent (that would give it away); where it matters, pupils mark it with arrows.
      const items = [...s.lines, ...(s.distractors ?? [])], order = scrambled(items.length, sid);
      return { body: `<p class="how">${s.lines.some((l) => /^\s/.test(l)) ? u.cParsonsIndent : u.cParsons}</p><div class="order code-strips" dir="ltr">${order.map((i) => `<div><i></i><code>${esc(items[i].trim())}</code></div>`).join("")}</div>`,
        key: `${u.topDown}: ${order.map((i) => (i < s.lines.length ? n(i + 1) : "✗")).join(u.numSep)}${codeBox(s.lines.join("\n"))}` };
    }
    case "codefill": {
      const tokens = [...s.answers, ...(s.distractors ?? [])], order = scrambled(tokens.length, sid, (o) => answersFirst(o, (i) => i < s.answers.length));
      const code = (gap) => `<pre class="code" dir="ltr">${s.code.map((p) => (typeof p === "string" ? esc(p) : gap(p.blank))).join("")}</pre>`;
      return { body: `${code(() => `<span class="gap"></span>`)}<p class="bank"><b>${u.bank}:</b> <code dir="ltr">${order.map((i) => esc(tokens[i])).join("   ")}</code></p>`,
        key: code((k) => b(esc(s.answers[k] ?? ""))) };
    }
    // The line number as the sheet's code box prints it.
    case "bug": return { body: `<p class="how">${u.cBug}</p>${codeBox(s.code, true)}<div class="lines"><i></i></div>`, key: `${u.line} <bdi dir="ltr">${s.line}</bdi>: <code dir="ltr">${esc(s.fix)}</code>` };
    case "code": return { body: `${s.starter.trim() ? box(s.starter) : ""}<p class="how">${u.cWrite}</p><div class="lines"><i></i><i></i><i></i><i></i></div>`, key: codeBox(s.solution) };
    case "blocks": return { body: `${robotGrid(s.world)}<p class="how">${u.cRobot}</p><div class="lines"><i></i><i></i></div>`, key: esc(u.kRobot(n(s.maxBlocks))) };
    default: return { body: "", key: "" };
  }
}

/**
 * The first sentence of a step's explanation, for the answers page: enough to say why, in about half the text, so a
 * unit check's ten answers stay on one sheet. A first sentence shorter than `min` characters ("Attention mixes.")
 * rarely says why on its own, so the next ones join it until there are `min`.
 */
export function firstSentence(text, min = 40) {
  const t = String(text).trim();
  for (const m of t.matchAll(/[.!?؟](?=\s+\S)/gu)) {
    if (/(?:\be\.g|\bi\.e|\bvs|\betc|\bMrs?|\bDr|\bSt|\bNo)$/i.test(t.slice(0, m.index))) continue;
    if (m.index + 1 >= min) return t.slice(0, m.index + 1);
  }
  return t;
}

/** A CSS string (for the page footer, which the page margin prints on every sheet). */
const cssString = (s) => `"${String(s).replace(/\s+/g, " ").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/</g, "\\3c ")}"`;

/**
 * The lesson plan PDF: the plan (for whoever runs the lesson), the sheet of the lesson's questions (sheetFor says for
 * whom) and, on its own page so copies of the sheet stay clean, the answers. Each part starts a page; the footer sits
 * in the page margin, so it never covers text when a part runs on (main() scales each part to fit its page first).
 * The answers page is set in the heading font: Chromium draws the variable body font as paths again on every page
 * (60–90 KB a page in Arabic), while the static heading font is embedded once, and phones download kits with a course.
 */
export function planHtml(unit, lesson, lang) {
  const rtl = lang === "ar", u = uiFor(unit, lang, lesson), who = sheetFor(unit, lesson), [trackC] = trackColours(unit.track);
  const bySlide = (layout) => lesson.slides.find((s) => s.layout === layout);
  const goals = bySlide("bullets"), act = bySlide("activity"), q = bySlide("questions"), ex = bySlide("exit"), titleSl = bySlide("title");
  const li = (sl) => pickList(sl?.bullets, lang).map((b) => `<li>${esc(b)}</li>`).join("");
  // The activity in full when the slide has it (the slide itself keeps one line per step).
  const steps = (sl) => (sl?.details ? pickList(sl.details, lang).map((b) => `<li>${esc(b)}</li>`).join("") : li(sl));
  const n = (k) => digits(k, lang), title = esc(pick(lesson.title, lang)), capstone = unit.kind === "capstone";
  // The activity's own timing ("Warm-up (5 min): …") when every step gives it; else a capstone stage's own time, a class
  // period for a class, and none for a student working alone (nothing says how long their activity takes).
  const mins = pickList(act?.bullets, "en").map((b) => Number(/\((\d+) min\)/.exec(b)?.[1]));
  const minutes = mins.length && mins.every((m) => m > 0) ? mins.reduce((a, b) => a + b, 0) : capstone && lesson.minutes ? lesson.minutes : unit.audience === "students" ? 0 : 45;
  // What the class needs; a capstone also needs its starter repository.
  const repo = capstone ? unit.lessons.flatMap((l) => l.steps).find((s) => s.type === "project" && s.starterRepo)?.starterRepo : null;
  const materials = (lesson.materials ? pickList(lesson.materials, lang).map(esc).join(u.listSep) : u.materialsV)
    + (repo ? `<div>${esc(u.starter)}: <bdi dir="ltr">${esc(`${STARTER_ORG}/${repo}`)}</bdi></div>` : "");
  // The activity's heading, once: many slide titles already start with "Activity:".
  const actTitle = pick(act?.title, lang).replace(new RegExp(`^\\s*(?:Activity|${u.activity})\\s*:\\s*`, "i"), "");
  // A capstone's activity slide repeats its goals; its steps are the lesson's own: what to read, then each milestone.
  const firstLine = (t) => t.split("\n")[0].trim(), sameList = (a, b) => a.length > 0 && a.length === b.length && a.every((x, i) => x === b[i]);
  const walk = capstone && !act?.details && sameList(pickList(act?.bullets, lang), pickList(goals?.bullets, lang))
    ? lesson.steps.filter((s) => s.type === "read" || s.type === "project").map((s) => `<li>${s.type === "read" ? `<b>${esc(pick(s.title, lang).replace(/^[\d٠-٩]+\.\s*/, ""))}</b>: ${esc(pick(s.prompt, lang))}` : esc(firstLine(pick(s.prompt, lang)))}</li>`).join("") : null;
  const activity = walk === "" ? "" : `<h2>${u.activity}${actTitle ? `: ${esc(actTitle)}` : ""}</h2><ol>${walk ?? steps(act)}</ol>${act?.note ? `<p><b>${esc(pick(act.note, lang))}</b></p>` : ""}`;
  // On paper every question shows at once: code another question asks to complete is pointed to, not printed again.
  const steps5 = printedSteps(lesson);
  const filled = steps5.map((s, k) => ({ s, q: k + 1, lines: s.type === "codefill" ? codeLines(s.code.map((p) => (typeof p === "string" ? p : s.answers[p.blank] ?? "")).join("")).map((x) => x.l) : [] }))
    .filter((f) => f.lines.length >= 2);
  const box = (s) => (text) => shownCode(text, filled.filter((f) => f.s !== s), u, n);
  const printed = steps5.map((s) => ({ s, ...question(s, `${lesson.id}:${s.id}`, u, lang, box(s)) }));
  // A question's code ("What does this print?") comes before its answers.
  const qs = printed.map(({ s, body }, k) => `<div class="q" data-step="${esc(s.id)}"><h3><span class="qn">${n(k + 1)}</span>${esc(pick(s.prompt, lang))}</h3>${s.snippet ? box(s)(s.snippet.text) : ""}${body}</div>`).join("");
  const answers = printed.map(({ s, key }, k) => `<div class="ans" data-step="${esc(s.id)}"><span class="qn">${n(k + 1)}</span><div><div class="a">${key}</div>${s.explain ? `<p class="why">${esc(firstSentence(pick(s.explain, lang)))}</p>` : ""}</div></div>`).join("");
  const reflect = lesson.steps.find((s) => s.type === "reflect");
  const mine = reflect && !who.reflectOnSheet
    ? `<div class="q mine" data-step="${esc(reflect.id)}"><h3><span class="qn">✎</span>${esc(u.forYou)}</h3><p>${esc(pick(reflect.prompt, lang))}</p><div class="lines"><i></i><i></i></div></div>` : "";
  const row = (labels) => `<div class="fields${labels.length === 2 ? " two" : labels.length === 1 ? " one" : ""}">${labels.map((f) => `<div>${f}</div>`).join("")}</div>`;
  const fields = who.fields.length ? row(who.fields.map((f) => u[f])) : "";
  const onSheet = reflect && who.reflectOnSheet
    ? `<div class="q" data-step="${esc(reflect.id)}"><h3><span class="qn">✎</span>${esc(pick(reflect.prompt, lang))}</h3><div class="lines"><i></i><i></i><i></i></div></div>` : "";
  // A capstone's milestones, to plan and tick off on paper (the work itself happens on a computer).
  const milestones = lesson.steps.filter((s) => s.type === "project" && s.milestone).map((s) => `<div class="ms" data-milestone="${esc(s.id)}"><h3>${esc(firstLine(pick(s.prompt, lang)))}</h3>`
    + `<p class="how">${s.hours ? `${u.time}: ${esc(u.hours(s.hours, n(s.hours)))}<br>` : ""}${u.handIn}: ${esc(pick(s.deliverable, lang))}</p>${row([u.finishBy, u.handedIn])}<p class="how">${u.blocked}</p><div class="lines"><i></i></div></div>`).join("");
  const head = (k, t) => `<div class="head">${MARK_SVG}<div><div class="kicker">${k}</div><h1>${t}</h1></div><div class="meta"><span class="chip">${esc(pick(titleSl?.note, lang))}</span></div></div>`;
  const foot = `font:7.5pt "Noto Sans","Noto Sans Arabic",sans-serif;color:#5c5470;border-top:.6pt solid #c9b8a4;padding-top:2mm;vertical-align:top`;
  return `<!doctype html><html lang="${lang}" dir="${rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><style>${fontCss}
@page{size:A4;margin:14mm 15mm 16mm;@bottom-${rtl ? "right" : "left"}{content:${cssString(u.footer)};${foot}}@bottom-${rtl ? "left" : "right"}{content:${cssString(pick(lesson.title, lang))};${foot}}}
body{font-size:10.5pt;line-height:${rtl ? 1.6 : 1.42}}
.page{break-after:page}.page:last-child{break-after:auto}
.head{display:flex;align-items:center;gap:4mm;padding-bottom:3mm;border-bottom:1.2pt solid #1e1a33}.head svg{width:12mm;height:12mm;flex:none}
.head h1{font-size:22pt;font-weight:800}.kicker{font-size:8.5pt;font-weight:700;color:#b43c0a}
.meta{margin-inline-start:auto}.chip{display:inline-block;padding:1mm 3mm;border:1pt solid #1e1a33;border-radius:99px;font-size:8.5pt;font-weight:700;background:repeating-linear-gradient(45deg,#${trackC} 0 2mm,#fff 2mm 4mm)}
h2{font-size:13pt;font-weight:800;margin:3.5mm 0 1.5mm}
.grid{display:grid;grid-template-columns:1fr 2fr;gap:3mm;margin-top:3mm}.grid.one{grid-template-columns:1fr}.box{border:1pt solid #8a7560;border-radius:3mm;padding:2.5mm 3mm}.box b{display:block;font-size:8pt;color:#5c5470}
ul,ol{margin:0;padding-inline-start:6mm}li{margin-bottom:.6mm}${rtl ? "ol{list-style:arabic-indic}" : ""}
.note{border:1pt solid #1e1a33;border-radius:3mm;padding:3mm 4mm;margin-top:3mm;background:#fff8ee;break-inside:avoid}
.fields{display:grid;grid-template-columns:2fr 1fr 1fr;gap:4mm;margin:4mm 0}.fields.two{grid-template-columns:2fr 1fr}.fields.one{grid-template-columns:1fr}.fields div{border-bottom:1pt solid #1e1a33;padding-bottom:1mm;font-size:8.5pt;color:#5c5470}
.q{margin-top:3.5mm;break-inside:avoid}.q h3{display:flex;gap:2mm;align-items:baseline;font-size:11pt}
.qn{display:inline-grid;place-items:center;width:6.5mm;height:6.5mm;border-radius:1.5mm;border:1.2pt solid #1e1a33;font-size:9pt;flex:none}
.opts{display:flex;flex-wrap:wrap;gap:2mm 6mm;margin-top:2mm}.opts i{display:inline-block;width:4mm;height:4mm;border:1pt solid #1e1a33;border-radius:50%;margin-inline-end:2mm;vertical-align:-0.6mm}.opts i.sq{border-radius:1mm}
.match{display:grid;grid-template-columns:1fr 16mm 1fr;row-gap:2mm;margin-top:2mm;align-items:center}.match .b{border:1pt solid #8a7560;border-radius:2mm;padding:1.5mm 3mm}.dots{text-align:center;color:#8a7560}
.order{display:grid;gap:1.5mm;margin-top:2mm}.order div{display:flex;gap:3mm;align-items:center}.order i{width:7mm;height:7mm;border:1.2pt solid #1e1a33;border-radius:1.5mm;flex:none}
.fill{margin:2mm 0;font-size:11pt;line-height:2.2}.gap{display:inline-block;width:28mm;border-bottom:1.2pt solid #1e1a33;margin:0 1mm}.bank{margin:0;font-size:9pt;color:#5c5470}
.lines i{display:block;height:7.5mm;border-bottom:.8pt solid #8a7560}
.code{margin:2mm 0;padding:2mm 3mm;border:1pt solid #8a7560;border-radius:2mm;font:9.5pt/1.5 Consolas,"DejaVu Sans Mono",monospace;white-space:pre-wrap;direction:ltr;text-align:left}
.code .ln{display:inline-block;width:6mm;color:#5c5470}.code .gap{width:18mm}.how{margin:1mm 0;font-size:9pt;color:#5c5470}
.code-strips code{font:9.5pt Consolas,"DejaVu Sans Mono",monospace;white-space:pre}.bank code{font-family:Consolas,"DejaVu Sans Mono",monospace;white-space:pre-wrap}
.robot{border-collapse:collapse;margin:2mm 0}.robot td{width:9mm;height:9mm;border:1pt solid #1e1a33;text-align:center;font-size:13pt}.robot td.wall{background:#5c5470}
.ans{display:flex;gap:2.5mm;align-items:baseline;margin-top:2.5mm;break-inside:avoid}.ans>div{flex:1;min-width:0}.ans .code{margin:1mm 0}
[data-part=answers]{font-family:"Baloo 2","Baloo Bhaijaan 2",sans-serif;font-weight:700}
.a b{text-decoration:underline;text-underline-offset:.2em}.a .code b{text-decoration:none}
.ms{margin-top:3.5mm;break-inside:avoid}.ms h3{font-size:11pt}.why{margin:.5mm 0 0;font-size:8.5pt;color:#5c5470}.mine{margin-top:5mm}.mine p{margin:1mm 0 0}
.tight .q{margin-top:2.5mm}.tight .lines i{height:6.5mm}.tight .code{margin:1.5mm 0;padding:1.5mm 2.5mm;line-height:1.35}.tight .order,.tight .opts{gap:1mm 5mm;margin-top:1.5mm}.tight .fields{margin:3mm 0}.tight .fill{line-height:2}
</style></head><body>
<section class="page" data-part="plan">${head(who.check ? u.planCheck : u.plan, title)}
<div class="grid${minutes ? "" : " one"}">${minutes ? `<div class="box"><b>${u.time}</b>${n(minutes)} ${u.min}</div>` : ""}<div class="box"><b>${u.materials}</b>${materials}</div></div>
<h2>${u.goals}</h2><ul>${li(goals)}</ul>
${activity}
<h2>${u.discuss}</h2><ul>${li(q)}</ul>
<h2>${u.exit}</h2><ul>${li(ex)}</ul>
<div class="note"><h3>${u.tomorrow}</h3><div>${esc(pick(lesson.tryTomorrow, lang))}</div></div></section>
${milestones ? `<section class="page" data-part="sheet">${head(u.milestones, title)}${row([u.name, u.date])}${row([u.repo])}${milestones}</section>`
  : qs || onSheet ? `<section class="page" data-part="sheet">${head(who.check ? u.sheetCheck : u.sheet, title)}
${fields}${qs}
${onSheet}</section>` : ""}
${answers || mine ? `<section class="page" data-part="answers">${head(u.answers, title)}${answers}${mine}</section>` : ""}
</body></html>`;
}

/**
 * Run in the page, laid out at the print width with print styles, before a lesson plan prints: fits each part to
 * whole A4 pages. A part a little over a page is scaled down (CSS zoom scales every pt and mm size, where a smaller
 * body font would not) until it fits, never under `floor`; if that is not enough, its writing lines and spacing are
 * tightened (`.tight`) and it tries again. A part that needs several pages (a unit check's ten questions) is fitted
 * the same way to save its last page when it can. Returns each part's name, zoom and pages (estimated).
 */
function fitParts({ pageH, floor }) {
  return [...document.querySelectorAll("section.page")].map((s) => {
    const part = s.dataset.part, height = (z) => { s.style.zoom = String(z); return s.getBoundingClientRect().height; };
    const natural = height(1), pages = Math.ceil(natural / pageH);
    if (pages <= 1) return { part, zoom: 1, pages: 1 };
    const room = pages === 2 ? pageH : (pages - 1) * pageH * 0.95; // page breaks between questions leave gaps
    const fitIn = () => { for (let z = 1; z >= floor - 1e-9; z = Math.round((z - 0.01) * 100) / 100) if (height(z) <= room) return z; return 0; };
    let zoom = fitIn();
    if (!zoom) { s.classList.add("tight"); zoom = fitIn(); }
    if (zoom) return { part, zoom, pages: pages - 1 };
    s.classList.remove("tight"); height(1);
    return { part, zoom: 1, pages };
  });
}
const MM = 96 / 25.4;
/** A4 less the lesson plan's margins (15 mm a side; 14 mm top, 16 mm bottom), with 3 mm to spare, in CSS px. */
const PLAN = { width: Math.floor(180 * MM), pageH: (297 - 14 - 16 - 3) * MM, floor: 0.85 };

/** How many pages a PDF has (Chromium writes one /Type /Page object per page). */
export const pdfPages = (pdf) => (Buffer.from(pdf).toString("latin1").match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
/**
 * A unit file's text with `pages` set on the kit items with these bases (base → pages), as the PDFs came out. Only
 * those numbers change and the file keeps its exact formatting: a file written as JSON.stringify(unit, null, 2), as
 * the course files are, is written back the same way; any other is edited in place. Returns the text and what changed.
 */
export function withPages(text, counts) {
  const want = new Map(counts instanceof Map ? counts : Object.entries(counts)), changed = [];
  let unit = null;
  try { unit = JSON.parse(text); } catch { /* not JSON: edit the text */ }
  if (unit && `${JSON.stringify(unit, null, 2)}\n` === text) {
    for (const l of unit.lessons ?? []) for (const k of l.kit ?? []) {
      const pages = want.get(k.base);
      if (pages !== undefined && k.pages !== pages) { changed.push(`${k.base} ${k.pages} → ${pages}`); k.pages = pages; }
    }
    return { text: changed.length ? `${JSON.stringify(unit, null, 2)}\n` : text, changed };
  }
  for (const [base, pages] of want) {
    const re = new RegExp(`("pages":\\s*)(\\d+)(,\\s*"base":\\s*"${base.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}")`, "g");
    text = text.replace(re, (_, a, old, c) => { if (Number(old) !== pages) changed.push(`${base} ${old} → ${pages}`); return `${a}${pages}${c}`; });
  }
  return { text, changed };
}

/* ---------------- University course pack ---------------- */
const PACKS = resolve(ROOT, "../../content/packs");
const PACK_UI = {
  // The rubric's columns, best first: a criterion's levels[0..3] print as Excellent, Good, Developing and Not yet, so a
  // pack lists each criterion's levels from the best work down.
  en: { kicker: "University course pack", outcomes: "Learning outcomes", syllabus: "14-week syllabus", week: "Week", topic: "Topic", work: "In class and out", slides: "Lecture slide outline", lecture: "Lecture", problems: "Problem set", solutions: "Solutions", lab: "Lab handout", goal: "Goal", steps: "Steps", deliver: "Hand in", rubric: "Assessment rubric", criterion: "Criterion", levels: ["Excellent", "Good", "Developing", "Not yet"], readings: "Reading list" },
  ar: { kicker: "حزمة المقرر الجامعي", outcomes: "نواتج التعلّم", syllabus: "الخطة الدراسية في ١٤ أسبوعًا", week: "الأسبوع", topic: "الموضوع", work: "داخل القاعة وخارجها", slides: "مخطط شرائح المحاضرات", lecture: "المحاضرة", problems: "مجموعة المسائل", solutions: "الحلول", lab: "ورقة المعمل", goal: "الهدف", steps: "الخطوات", deliver: "المطلوب تسليمه", rubric: "معيار التقييم", criterion: "المعيار", levels: ["ممتاز", "جيد", "قيد التطور", "لم يتحقق بعد"], readings: "قائمة القراءات" },
};
export function packHtml(unit, pack, lang) {
  const rtl = lang === "ar", u = uiFor(unit, lang), p = PACK_UI[lang], [trackC] = trackColours(unit.track), n = (k) => digits(k, lang);
  const T = (x) => esc(pick(x, lang));
  const head = (k, t) => `<div class="head">${MARK_SVG}<div><div class="kicker">${k}</div><h1>${t}</h1></div></div>`;
  const foot = `<div class="foot"><span>${esc(u.footer)}</span><span>${T(unit.title)}</span></div>`;
  const page = (k, body) => `<section class="page">${head(esc(p.kicker), k)}${body}${foot}</section>`;
  return `<!doctype html><html lang="${lang}" dir="${rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><style>${fontCss}
@page{size:A4;margin:14mm 15mm 16mm}body{font-size:10pt;line-height:${rtl ? 1.7 : 1.45}}
.page{position:relative;min-height:262mm;padding-bottom:10mm;page-break-after:always}.page:last-child{page-break-after:auto}
.head{display:flex;align-items:center;gap:4mm;padding-bottom:3mm;border-bottom:1.2pt solid #1e1a33;border-top:3mm solid #${trackC};padding-top:3mm}.head svg{width:12mm;height:12mm;flex:none}
.head h1{font-size:20pt;font-weight:800}.kicker{font-size:8.5pt;font-weight:700;color:#b43c0a}
h2{font-size:13pt;font-weight:800;margin:5mm 0 2mm}h3{font-size:11pt;margin:3mm 0 1mm}
ul,ol{margin:0;padding-inline-start:6mm}li{margin-bottom:1mm}${rtl ? "ol{list-style:arabic-indic}" : ""}
table{width:100%;border-collapse:collapse;margin-top:2mm;font-size:9.5pt}th,td{border:.8pt solid #8a7560;padding:1.5mm 2mm;vertical-align:top;text-align:start}th{background:#fff1e4}
.q{margin-top:3mm;break-inside:avoid}.sol{margin-top:2mm;break-inside:avoid;border-inline-start:2pt solid #${trackC};padding-inline-start:3mm}
.intro{margin-top:4mm}.ref{margin-bottom:2mm}.ref i{color:#5c5470;font-style:normal}
.foot{position:absolute;bottom:0;inset-inline:0;display:flex;justify-content:space-between;font-size:7.5pt;color:#5c5470;border-top:.6pt solid #c9b8a4;padding-top:2mm}
</style></head><body>
${page(T(unit.title), `<p class="intro">${T(pack.intro)}</p><h2>${p.outcomes}</h2><ol>${pack.outcomes.map((o) => `<li>${T(o)}</li>`).join("")}</ol>
<h2>${p.syllabus}</h2><table><tr><th>${p.week}</th><th>${p.topic}</th><th>${p.work}</th></tr>${pack.syllabus.map((w, i) => `<tr><td>${n(i + 1)}</td><td>${T(w.topic)}</td><td>${T(w.work)}</td></tr>`).join("")}</table>`)}
${page(p.slides, pack.slides.map((l, i) => `<h3>${p.lecture} ${n(i + 1)}: ${T(l.title)}</h3><ul>${l.bullets.map((b) => `<li>${T(b)}</li>`).join("")}</ul>`).join(""))}
${page(p.problems, pack.problems.map((q, i) => `<div class="q"><b>${n(i + 1)}.</b> ${T(q.q)}</div>`).join("") + `<h2>${p.solutions}</h2>` + pack.problems.map((q, i) => `<div class="sol"><b>${n(i + 1)}.</b> ${T(q.a)}</div>`).join(""))}
${page(`${p.lab}: ${T(pack.lab.title)}`, `<h2>${p.goal}</h2><p>${T(pack.lab.goal)}</p><h2>${p.steps}</h2><ol>${pack.lab.steps.map((x) => `<li>${T(x)}</li>`).join("")}</ol><h2>${p.deliver}</h2><p>${T(pack.lab.deliver)}</p>`)}
${page(p.rubric, `<table><tr><th>${p.criterion}</th>${p.levels.map((l) => `<th>${l}</th>`).join("")}</tr>${pack.rubric.map((r) => `<tr><td><b>${T(r.name)}</b></td>${r.levels.map((l) => `<td>${T(l)}</td>`).join("")}</tr>`).join("")}</table>
<h2>${p.readings}</h2>${pack.readings.map((r) => `<div class="ref" dir="ltr" style="text-align:${rtl ? "right" : "left"}">${esc(r.cite)}<br><i dir="${rtl ? "rtl" : "ltr"}">${T(r.note)}</i></div>`).join("")}`)}
</body></html>`;
}

/* ---------------- run ---------------- */
async function main() {
  const files = new Map();
  const units = readdirSync(CONTENT).filter((f) => f.endsWith(".json")).map((f) => { const unit = JSON.parse(readFileSync(join(CONTENT, f), "utf8")); files.set(unit.id, join(CONTENT, f)); return unit; }).filter((u) => !only.size || only.has(u.id));
  for (const id of only) if (!units.some((u) => u.id === id)) console.warn(`! No unit ${id} in ${CONTENT}`);
  let chromium = null, browser = null;
  try { ({ chromium } = await import("playwright")); browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}); }
  catch (e) { console.warn(`! PDFs skipped — Chromium not available (${String(e.message).split("\n")[0]}).\n  Run: npx playwright install chromium   (or set CHROMIUM_PATH)`); }
  const page = browser ? await browser.newPage() : null;
  // Lesson plans are laid out as they print (A4 width, print styles), so fitParts measures what the PDF will hold.
  const plans = browser ? await browser.newPage({ viewport: { width: PLAN.width, height: 1123 } }) : null;
  await plans?.emulateMedia({ media: "print" });
  let count = 0;
  const pdf = async (tab, dir, name, lang, html, opts, label) => {
    const tmp = join(dir, `.${name}-${lang}.html`); writeFileSync(tmp, html);
    await tab.goto(pathToFileURL(tmp).href); await tab.evaluate(() => document.fonts.ready);
    if (label) for (const f of await tab.evaluate(fitParts, PLAN)) if (f.pages > 1 && !(f.part !== "plan" && isCheck({ id: label }))) console.warn(`! ${label} ${lang}: the ${f.part} takes ${f.pages} pages`);
    const out = await tab.pdf({ path: join(dir, `${name}-${lang}.pdf`), printBackground: true, preferCSSPageSize: true, ...opts }); count++;
    rmSync(tmp);
    return pdfPages(out);
  };
  for (const unit of units) {
    const pages = new Map(), note = (base, n) => pages.set(base, Math.max(pages.get(base) ?? 0, n));
    for (const lesson of unit.lessons) {
      const dir = join(OUT, lesson.id); mkdirSync(dir, { recursive: true });
      for (const lang of LANGS) {
        await buildPptx(unit, lesson, lang).writeFile({ fileName: join(dir, `slides-${lang}.pptx`) }); count++;
        if (!browser) continue;
        note(`${lesson.id}/slides`, await pdf(page, dir, "slides", lang, slidesHtml(unit, lesson, lang), { width: "13.333in", height: "7.5in" }));
        note(`${lesson.id}/lesson-plan`, await pdf(plans, dir, "lesson-plan", lang, planHtml(unit, lesson, lang), { format: "A4" }, lesson.id));
      }
      const packKit = lesson.kit?.find((k) => k.base?.endsWith("/course-pack"));
      if (browser && packKit && existsSync(join(PACKS, `${unit.id}.json`))) {
        const pack = JSON.parse(readFileSync(join(PACKS, `${unit.id}.json`), "utf8"));
        for (const lang of LANGS) note(packKit.base, await pdf(page, dir, "course-pack", lang, packHtml(unit, pack, lang), { format: "A4" }));
      }
      console.log(`✓ ${lesson.id}`);
    }
    // The Kit screen shows each file's page count: write what the PDFs came to (the larger of the two languages).
    if (pages.size && !args.includes("--no-pages")) {
      const file = files.get(unit.id), { text, changed } = withPages(readFileSync(file, "utf8"), pages);
      if (changed.length) { writeFileSync(file, text); console.log(`  pages in ${unit.id}.json: ${changed.join(", ")}`); }
    }
  }
  await browser?.close();
  console.log(`${count} files written to ${OUT}`);
  if (!existsSync(MARK_PNG)) console.warn("! app icon missing for PPTX logo");
}
const entry = (p) => resolve(p).toLowerCase();
if (process.argv[1] && entry(process.argv[1]) === entry(fileURLToPath(import.meta.url))) main().catch((e) => { console.error(e); process.exit(1); });
