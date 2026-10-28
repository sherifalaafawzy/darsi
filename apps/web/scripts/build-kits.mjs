#!/usr/bin/env node
/**
 * Builds the teacher classroom kits from the course sources (content/units/*.json at the repo root):
 *   content/kits/<lesson>/slides-<lang>.pptx   — editable PowerPoint (pptxgenjs), RTL for Arabic
 *   content/kits/<lesson>/slides-<lang>.pdf    — the same slides as PDF (headless Chromium, brand fonts embedded)
 *   content/kits/<lesson>/lesson-plan-<lang>.pdf — A4 lesson plan + pupil worksheet
 * The app ships no courses: `npm run seed` uploads these with the unit and publishes it (scripts/seed-content.mjs).
 *
 * Usage:  npm run kits            (all units, all languages)
 *         npm run kits -- ai-1-1  (one unit)
 * Needs Chromium for the PDFs: run `npx playwright install chromium` once, or set CHROMIUM_PATH.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import PptxGenJS from "pptxgenjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = resolve(ROOT, "../../content/units");
const OUT = resolve(ROOT, "../../content/kits");
const DS = resolve(ROOT, "../../packages/design-system");
const FONTS = pathToFileURL(join(DS, "assets/fonts")).href;
const MARK_PNG = join(ROOT, "public/app-icons/app-icon-192.png");
const LANGS = ["en", "ar"];
const only = process.argv[2];

const C = { ink: "1E1A33", muted: "5C5470", paper: "F2F2F2", kola: "FF6A2B", kolaSoft: "FFE2D2", kolaDeep: "B43C0A", line: "EAD9C4",
  track: { ai: ["FFC53D", "FFF0C4", "7A5000"], iot: ["14B8A6", "CCF2EC", "065F56"], cyber: ["F04A7E", "FDD9E5", "A3123F"] } };
const pick = (t, lang) => (t ? t[lang] ?? t.en : "");
const pickList = (t, lang) => (t ? t[lang] ?? t.en : []);
const digits = (n, lang) => new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en").format(n);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const UI = {
  en: { footer: "Darsi · free to copy for your school", plan: "Lesson plan · for the teacher", sheet: "Worksheet · for pupils", goals: "Learning goals", activity: "Activity", discuss: "Discussion", exit: "Exit ticket", tomorrow: "Try it in class tomorrow", time: "Time", min: "min", materials: "Materials", materialsV: "Board, chalk, paper. No devices needed.", name: "Name", cls: "Class", date: "Date", tf: ["True", "False"], reflect: "In your own words", bank: "Word bank", unit: "Unit", lesson: "Lesson", sep: " · ", listSep: "; " },
  ar: { footer: "درسي — يُسمح بنسخها لمدرستك مجانًا", plan: "خطة درس — للمعلم", sheet: "ورقة عمل — للطلاب", goals: "أهداف التعلّم", activity: "النشاط", discuss: "للنقاش", exit: "بطاقة الخروج", tomorrow: "جرّبها في الصف غدًا", time: "المدة", min: "دقيقة", materials: "المواد", materialsV: "سبّورة، طباشير، ورق. لا حاجة إلى أجهزة.", name: "الاسم", cls: "الصف", date: "التاريخ", tf: ["صح", "خطأ"], reflect: "بكلماتك", bank: "بنك الكلمات", unit: "الوحدة", lesson: "الدرس", sep: "، ", listSep: "، " },
};

/**
 * Type size for a slide's text: the base size while it fits `room` characters, smaller as it grows (area goes with the
 * square of the size), never under `min`. Activity slides carry the steps and the preparation note, so they get long.
 */
const fit = (texts, base, room, min) => { const n = texts.join(" ").length; return n <= room ? base : Math.max(min, Math.floor(base * Math.sqrt(room / n))); };

/* ---------------- PPTX ---------------- */
function buildPptx(unit, lesson, lang) {
  const rtl = lang === "ar", u = UI[lang], [trackC, trackSoft, trackInk] = C.track[unit.track];
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
  const rtl = lang === "ar", u = UI[lang], [trackC, trackSoft, trackInk] = C.track[unit.track];
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

function planHtml(unit, lesson, lang) {
  const rtl = lang === "ar", u = UI[lang], [trackC] = C.track[unit.track];
  const bySlide = (layout) => lesson.slides.find((s) => s.layout === layout);
  const goals = bySlide("bullets"), act = bySlide("activity"), q = bySlide("questions"), ex = bySlide("exit"), titleSl = bySlide("title");
  const li = (sl) => pickList(sl?.bullets, lang).map((b) => `<li>${esc(b)}</li>`).join("");
  // The activity in full when the slide has it (the slide itself keeps one line per step).
  const steps = (sl) => (sl?.details ? pickList(sl.details, lang).map((b) => `<li>${esc(b)}</li>`).join("") : li(sl));
  const n = (k) => digits(k, lang);
  // The activity's own timing ("Warm-up (5 min): …") when every step gives it, and what the class needs.
  const mins = pickList(act?.bullets, "en").map((b) => Number(/\((\d+) min\)/.exec(b)?.[1]));
  const minutes = mins.length && mins.every((m) => m > 0) ? mins.reduce((a, b) => a + b, 0) : 45;
  const materials = lesson.materials ? pickList(lesson.materials, lang).map(esc).join(u.listSep) : u.materialsV;
  const qs = lesson.steps.filter((s) => ["choice", "multi", "truefalse", "match", "order", "fill", "type"].includes(s.type)).slice(0, 5).map((s, k) => {
    let body = "";
    if (s.type === "choice" || s.type === "multi") body = `<div class="opts">${s.options.map((o) => `<span><i class="${s.type === "multi" ? "sq" : ""}"></i>${esc(pick(o.text, lang))}</span>`).join("")}</div>`;
    if (s.type === "truefalse") body = `<div class="opts">${u.tf.map((x) => `<span><i></i>${x}</span>`).join("")}</div>`;
    if (s.type === "match") { const right = [...s.pairs].reverse(); body = `<div class="match">${s.pairs.map((p, j) => `<span class="b">${esc(pick(p.left, lang))}</span><span class="dots">• • • •</span><span class="b">${esc(pick(right[j].right, lang))}</span>`).join("")}</div>`; }
    if (s.type === "order") body = `<div class="order">${[...s.steps].reverse().map((x) => `<div><i></i>${esc(pick(x, lang))}</div>`).join("")}</div>`;
    if (s.type === "fill") { const parts = s.sentence[lang] ?? s.sentence.en; body = `<p class="fill">${parts.map((p) => (typeof p === "string" ? esc(p) : `<span class="gap"></span>`)).join("")}</p><p class="bank"><b>${u.bank}:</b> ${pickList(s.bank, lang).map(esc).join(u.sep)}</p>`; }
    if (s.type === "type") body = `<div class="lines"><i></i></div>`;
    return `<div class="q"><h3><span class="qn">${n(k + 1)}</span>${esc(pick(s.prompt, lang))}</h3>${body}</div>`;
  }).join("");
  const reflect = lesson.steps.find((s) => s.type === "reflect");
  const head = (k, t) => `<div class="head">${MARK_SVG}<div><div class="kicker">${k}</div><h1>${t}</h1></div><div class="meta"><span class="chip">${esc(pick(titleSl?.note, lang))}</span></div></div>`;
  const foot = `<div class="foot"><span>${esc(u.footer)}</span><span>${esc(pick(lesson.title, lang))}</span></div>`;
  return `<!doctype html><html lang="${lang}" dir="${rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><style>${fontCss}
@page{size:A4;margin:14mm 15mm 16mm}body{font-size:10.5pt;line-height:${rtl ? 1.75 : 1.5}}
.page{position:relative;min-height:262mm;page-break-after:always}.page:last-child{page-break-after:auto}
.head{display:flex;align-items:center;gap:4mm;padding-bottom:3mm;border-bottom:1.2pt solid #1e1a33}.head svg{width:12mm;height:12mm;flex:none}
.head h1{font-size:22pt;font-weight:800}.kicker{font-size:8.5pt;font-weight:700;color:#b43c0a}
.meta{margin-inline-start:auto}.chip{display:inline-block;padding:1mm 3mm;border:1pt solid #1e1a33;border-radius:99px;font-size:8.5pt;font-weight:700;background:repeating-linear-gradient(45deg,#${trackC} 0 2mm,#fff 2mm 4mm)}
h2{font-size:13pt;font-weight:800;margin:5mm 0 2mm}
.grid{display:grid;grid-template-columns:1fr 2fr;gap:3mm;margin-top:4mm}.box{border:1pt solid #8a7560;border-radius:3mm;padding:2.5mm 3mm}.box b{display:block;font-size:8pt;color:#5c5470}
ul,ol{margin:0;padding-inline-start:6mm}li{margin-bottom:1mm}${rtl ? "ol{list-style:arabic-indic}" : ""}
.note{border:1pt solid #1e1a33;border-radius:3mm;padding:3mm 4mm;margin-top:4mm;background:#fff8ee}
.fields{display:grid;grid-template-columns:2fr 1fr 1fr;gap:4mm;margin:4mm 0}.fields div{border-bottom:1pt solid #1e1a33;padding-bottom:1mm;font-size:8.5pt;color:#5c5470}
.q{margin-top:4.5mm;break-inside:avoid}.q h3{display:flex;gap:2mm;align-items:baseline;font-size:11pt}
.qn{display:inline-grid;place-items:center;width:6.5mm;height:6.5mm;border-radius:1.5mm;border:1.2pt solid #1e1a33;font-size:9pt;flex:none}
.opts{display:flex;flex-wrap:wrap;gap:2mm 6mm;margin-top:2mm}.opts i{display:inline-block;width:4mm;height:4mm;border:1pt solid #1e1a33;border-radius:50%;margin-inline-end:2mm;vertical-align:-0.6mm}.opts i.sq{border-radius:1mm}
.match{display:grid;grid-template-columns:1fr 16mm 1fr;row-gap:2mm;margin-top:2mm;align-items:center}.match .b{border:1pt solid #8a7560;border-radius:2mm;padding:1.5mm 3mm}.dots{text-align:center;color:#8a7560}
.order{display:grid;gap:1.5mm;margin-top:2mm}.order div{display:flex;gap:3mm;align-items:center}.order i{width:7mm;height:7mm;border:1.2pt solid #1e1a33;border-radius:1.5mm;flex:none}
.fill{margin:2mm 0;font-size:11pt;line-height:2.2}.gap{display:inline-block;width:28mm;border-bottom:1.2pt solid #1e1a33;margin:0 1mm}.bank{margin:0;font-size:9pt;color:#5c5470}
.lines i{display:block;height:8.5mm;border-bottom:.8pt solid #8a7560}
.foot{position:absolute;bottom:0;inset-inline:0;display:flex;justify-content:space-between;font-size:7.5pt;color:#5c5470;border-top:.6pt solid #c9b8a4;padding-top:2mm}
</style></head><body>
<section class="page">${head(u.plan, esc(pick(lesson.title, lang)))}
<div class="grid"><div class="box"><b>${u.time}</b>${n(minutes)} ${u.min}</div><div class="box"><b>${u.materials}</b>${materials}</div></div>
<h2>${u.goals}</h2><ul>${li(goals)}</ul>
<h2>${u.activity}: ${esc(pick(act?.title, lang))}</h2><ol>${steps(act)}</ol>${act?.note ? `<p><b>${esc(pick(act.note, lang))}</b></p>` : ""}
<h2>${u.discuss}</h2><ul>${li(q)}</ul>
<h2>${u.exit}</h2><ul>${li(ex)}</ul>
<div class="note"><h3>${u.tomorrow}</h3><div>${esc(pick(lesson.tryTomorrow, lang))}</div></div>${foot}</section>
<section class="page">${head(u.sheet, esc(pick(lesson.title, lang)))}
<div class="fields"><div>${u.name}</div><div>${u.cls}</div><div>${u.date}</div></div>${qs}
${reflect ? `<div class="q"><h3><span class="qn">✎</span>${esc(pick(reflect.prompt, lang))}</h3><div class="lines"><i></i><i></i><i></i></div></div>` : ""}${foot}</section>
</body></html>`;
}

/* ---------------- run ---------------- */
async function main() {
  const units = readdirSync(CONTENT).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(CONTENT, f), "utf8"))).filter((u) => !only || u.id === only);
  let chromium = null, browser = null;
  try { ({ chromium } = await import("playwright")); browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}); }
  catch (e) { console.warn(`! PDFs skipped — Chromium not available (${String(e.message).split("\n")[0]}).\n  Run: npx playwright install chromium   (or set CHROMIUM_PATH)`); }
  const page = browser ? await browser.newPage() : null;
  let count = 0;
  for (const unit of units) for (const lesson of unit.lessons) {
    const dir = join(OUT, lesson.id); mkdirSync(dir, { recursive: true });
    for (const lang of LANGS) {
      await buildPptx(unit, lesson, lang).writeFile({ fileName: join(dir, `slides-${lang}.pptx`) }); count++;
      if (page) {
        for (const [name, html, opts] of [["slides", slidesHtml(unit, lesson, lang), { width: "13.333in", height: "7.5in" }], ["lesson-plan", planHtml(unit, lesson, lang), { format: "A4" }]]) {
          const tmp = join(dir, `.${name}-${lang}.html`); writeFileSync(tmp, html);
          await page.goto(pathToFileURL(tmp).href); await page.evaluate(() => document.fonts.ready);
          await page.pdf({ path: join(dir, `${name}-${lang}.pdf`), printBackground: true, preferCSSPageSize: true, ...opts }); count++;
          (await import("node:fs")).rmSync(tmp);
        }
      }
    }
    console.log(`✓ ${lesson.id}`);
  }
  await browser?.close();
  console.log(`${count} files written to content/kits/`);
  if (!existsSync(MARK_PNG)) console.warn("! app icon missing for PPTX logo");
}
main().catch((e) => { console.error(e); process.exit(1); });
