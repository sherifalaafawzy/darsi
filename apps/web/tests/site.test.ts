// The public pages (TECHNICAL.md "Public pages"): every published course gets an English and an Arabic page, the
// pages name each other, the sitemap lists exactly what was built, nothing reaches the app's precache or catch-all,
// and the copy keeps its rules (no "·" in Arabic, sources for every figure, links that lead somewhere).
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadSiteData, type SiteData } from "../scripts/site/data.mjs";
import { buildSite, makePages, sitemap, type Page } from "../scripts/site/build.mjs";
import { PAGE_PATH, PAGE_ROOTS, ROOT_FILES } from "../scripts/site/roots.mjs";
import { FEATURE_KEYS, featurePage } from "../scripts/site/features.mjs";
import { courseModel, type CourseModel } from "../scripts/site/course.mjs";

const ROOT = resolve(process.cwd(), "../..");
const unit = (id: string) => JSON.parse(readFileSync(join(ROOT, "content/units", `${id}.json`), "utf8"));
// A small published catalog: teachers' courses (one with code exercises), a students' course, a university course and
// a capstone in shown tracks, a course in a hidden track, and an organization's own course (never public).
const PUBLISHED = ["ai-4-1", "ai-s3", "cyber-u1", "code-4-1", "code-capstone"];
const HIDDEN = "opt-s3";

let dir = "", out = "", data: SiteData, pages: Page[];
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "darsi-site-"));
  mkdirSync(join(dir, "units"));
  const ids = [...PUBLISHED, HIDDEN];
  for (const id of ids) cpSync(join(ROOT, "content/units", `${id}.json`), join(dir, "units", `${id}.json`));
  const entries = ids.map((id) => { const u = unit(id); return { id, track: u.track, level: u.level, title: u.title, summary: u.summary, owner: "public", version: 1, sizeByLang: { en: 3.1, ar: 4.2 }, ...(u.audience ? { audience: u.audience } : {}), ...(u.teach ? { teach: u.teach } : {}) }; });
  entries.push({ id: "org-only", track: "ai", level: 1, title: { en: "Private" }, summary: { en: "x" }, owner: "orgA", version: 1 } as never);
  writeFileSync(join(dir, "catalog.json"), JSON.stringify({ version: 1, units: entries }));
  writeFileSync(join(dir, "settings.json"), JSON.stringify({ version: 1, tracks: [{ id: "opt", name: { en: "Optimization", ar: "الحلول المثلى" }, levels: 4, order: 6, hidden: true }] }));
  data = await loadSiteData({ source: dir, log: () => {} });
  out = join(dir, "out");
  ({ pages } = await buildSite({ outDir: out, data, log: () => {} }));
}, 60_000);
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

const html = (slug: string, lang: "en" | "ar") => readFileSync(join(out, lang === "ar" ? "ar" : "", slug, "index.html"), "utf8");
const allFiles = () => pages.flatMap((p) => (["en", "ar"] as const).map((lang) => ({ slug: p.slug, lang, text: html(p.slug, lang) })));

describe("which pages are built", () => {
  it("every published course in a shown track gets an English and an Arabic page; nothing else does", () => {
    const courses = pages.filter((p) => /^courses\/[^/]+$/.test(p.slug) && p.en.kind === "course").map((p) => p.slug.slice("courses/".length));
    expect(courses.sort()).toEqual([...PUBLISHED].sort());
    for (const id of PUBLISHED) {
      expect(html(`courses/${id}`, "en")).toContain('<html lang="en" dir="ltr">');
      expect(html(`courses/${id}`, "ar")).toContain('<html lang="ar" dir="rtl">');
    }
    expect(pages.some((p) => p.slug.includes(HIDDEN) || p.slug.includes("org-only"))).toBe(false);
    // Every shown track has a page (the home page links to each); a hidden one doesn't.
    expect(pages.some((p) => p.slug === "courses/opt")).toBe(false);
    expect(pages.some((p) => p.slug === "courses/ai")).toBe(true);
  });

  it("every page sits under one of the page roots, and the sitemap lists exactly the pages built, in both languages", () => {
    for (const p of pages) expect(PAGE_ROOTS).toContain(p.slug.split("/")[0]);
    const map = readFileSync(join(out, "sitemap-pages.xml"), "utf8");
    expect(map).toBe(sitemap(pages));
    const locs = [...map.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
    const want = pages.flatMap((p) => [`https://darsiai.org/${p.slug}/`, `https://darsiai.org/ar/${p.slug}/`]).sort();
    expect(locs).toEqual(want);
    const list = JSON.parse(readFileSync(join(out, "site-pages.json"), "utf8"));
    expect(list.courses.sort()).toEqual([...PUBLISHED].sort());
    for (const f of ROOT_FILES) expect(() => readFileSync(join(out, f))).not.toThrow();
  });
});

describe("each page", () => {
  it("names its own canonical address and the other language's, with matching hreflang pairs", () => {
    for (const { slug, lang, text } of allFiles()) {
      const self = `https://darsiai.org${lang === "ar" ? "/ar" : ""}/${slug}/`;
      expect(text).toContain(`<link rel="canonical" href="${self}">`);
      expect(text).toContain(`<link rel="alternate" hreflang="en" href="https://darsiai.org/${slug}/">`);
      expect(text).toContain(`<link rel="alternate" hreflang="ar" href="https://darsiai.org/ar/${slug}/">`);
      expect(text).toContain(`<link rel="alternate" hreflang="x-default" href="https://darsiai.org/${slug}/">`);
      expect(text).not.toMatch(/web\.app|firebaseapp\.com/);
    }
  });

  it("has one h1, a title and a description, and schema.org data that parses", () => {
    for (const { slug, text } of allFiles()) {
      expect(text.match(/<h1[ >]/g)?.length, slug).toBe(1);
      expect(text).toMatch(/<title>[^<]{10,}<\/title>/);
      expect(text).toMatch(/<meta name="description" content="[^"]{50,}">/);
      const ld = [...text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      expect(ld).toHaveLength(1);
      const graph = JSON.parse(ld[0][1])["@graph"];
      expect(graph[0]["@type"]).toBe("WebPage");
      // Nothing invented: no ratings or reviews, ever.
      expect(ld[0][1]).not.toMatch(/aggregateRating|"review"/i);
    }
  });

  it("runs no script (the only <script> is schema.org data) and loads one stylesheet", () => {
    for (const { text } of allFiles()) {
      expect([...text.matchAll(/<script(?![^>]*application\/ld\+json)/g)]).toHaveLength(0);
      expect(text.match(/<link rel="stylesheet"/g)).toHaveLength(1);
      expect(text).not.toMatch(/ on[a-z]+="/);
    }
  });

  it("never uses · in Arabic, and an English page has Arabic only in the other-script spans", () => {
    for (const { lang, text } of allFiles()) {
      const body = text.slice(text.indexOf("<body"));
      if (lang === "ar") expect(body).not.toContain("·");
      else expect(body.replace(/<span class="pp-other" lang="ar"[^>]*>[^<]*<\/span>/g, "")).not.toMatch(/[؀-ۿ]/);
    }
  });

  it("links only to pages that were built, the app's own routes, or https sources", () => {
    const built = new Set(pages.flatMap((p) => [`/${p.slug}/`, `/ar/${p.slug}/`]));
    const app = /^\/(?:\?lang=ar)?$|^\/(?:signin|signup|labs|lesson\/[^?]+)(?:\?.*)?$|^\/assets\/|^\/favicon\.svg$|^\/app-icons\//;
    for (const { slug, text } of allFiles()) {
      for (const [, href] of text.matchAll(/href="([^"]+)"/g)) {
        const path = href.replace(/&amp;/g, "&").split("#")[0];
        if (!path || href.startsWith("#") || href.startsWith("https://")) continue;
        expect(built.has(path) || app.test(path), `${slug}: ${href}`).toBe(true);
      }
    }
  });
});

describe("what the pages say", () => {
  it("a course page lists every lesson of the course, with the course's own words and counts", () => {
    const u = unit("ai-s3");
    const en = html("courses/ai-s3", "en"), ar = html("courses/ai-s3", "ar");
    for (const l of u.lessons) {
      expect(en).toContain(`id="${l.id}"`);
      expect(ar).toContain(l.title.ar.replace(/&/g, "&amp;"));
    }
    expect(en).toContain(`It has ${u.lessons.length} lessons`);
    expect(en).toContain('"@type":"Course"');
    expect(en).toContain('"isAccessibleForFree":true');
  });

  it("the why page names a source for every figure, and every source is an https address", async () => {
    const { SOURCES, NEEDS } = await import("../scripts/site/why.mjs");
    for (const g of NEEDS) for (const it of g.items) {
      expect(it.src.length).toBeGreaterThan(0);
      for (const s of it.src) expect(SOURCES[s]?.url).toMatch(/^https:\/\//);
      // The sentence names the year it is about.
      expect(it.text.en).toMatch(/20\d\d/);
      expect(it.text.ar).toMatch(/[٠-٩]{4}/);
    }
    const why = html("why-darsi", "en");
    for (const s of Object.values(SOURCES) as { url: string }[]) if (why.includes(`#src-`)) expect(why).toContain(s.url.replace(/&/g, "&amp;"));
  });

  it("makePages is the same pages the folder holds", () => {
    expect(makePages(data).pages.map((p) => p.slug)).toEqual(pages.map((p) => p.slug));
  });
});

describe("the feature pages", () => {
  type Unit = { kind?: string; lessons: { kit?: unknown[] }[] };
  const modelsOf = (d: SiteData) => (d.units as Unit[]).map((u) => courseModel(u, d));
  const CODE_KINDS = ["code", "parsons", "codefill", "bug", "blocks"];

  it("every feature has a page in both languages, with every counted {placeholder} filled in", () => {
    expect(FEATURE_KEYS).toEqual(["lessons", "labs", "offline", "languages", "kits", "code", "projects", "schools", "standards"]);
    for (const k of FEATURE_KEYS) for (const lang of ["en", "ar"] as const) {
      expect(html(`features/${k}`, lang).replace(/<script[\s\S]*?<\/script>/g, ""), `${lang} ${k}`).not.toMatch(/\{[a-zA-Z]+\}/);
    }
  });

  it("says \"every lesson\" only when it is true of every published lesson", () => {
    const models = modelsOf(data);
    const all = models.every((m) => m.lessons.every((l) => l.kit.length));
    expect(featurePage("kits", "en", data, models).description).toContain(all ? "with every lesson" : "of the");
    const units = structuredClone(data.units) as Unit[];
    for (const l of units[0].lessons) l.kit = [];
    const fewer = { ...data, units };
    const m2 = modelsOf(fewer);
    const total = m2.reduce((a, m) => a + m.lessons.length, 0), kits = m2.reduce((a, m) => a + m.lessons.filter((l) => l.kit.length).length, 0);
    expect(featurePage("kits", "en", fewer, m2).description).toContain(`with ${kits} of the ${total} lessons`);
    expect(featurePage("kits", "ar", fewer, m2).description).not.toContain("مع كل درس");
  });

  it("shows the capstone section only while a capstone is published", () => {
    expect(featurePage("projects", "en", data, modelsOf(data)).body).toContain('id="capstones"');
    const none = { ...data, units: (data.units as Unit[]).filter((u) => u.kind !== "capstone") };
    expect(featurePage("projects", "en", none, modelsOf(none)).body).not.toContain('id="capstones"');
  });

  it("the standards page lists every competency the published lessons build, and only those", () => {
    const known = data.competencies as Map<string, unknown>;
    const used = [...new Set(modelsOf(data).flatMap((m: CourseModel) => m.competencies))].filter((c) => known.has(c));
    const listed = [...html("features/standards", "en").matchAll(/<li id="c-([^"]+)">/g)].map((m) => m[1]);
    expect(listed.sort()).toEqual(used.map((c) => c.toLowerCase().replace(/[^a-z0-9]+/g, "-")).sort());
  });

  it("the code page lists exactly the courses with code exercises", () => {
    const want = modelsOf(data).filter((m) => m.lessons.some((l) => CODE_KINDS.some((k) => l.kinds.has(k)))).map((m) => m.id);
    expect(want).toContain("code-4-1");
    const page = html("features/code", "en");
    const section = page.slice(page.indexOf('id="code-courses"'));
    expect([...section.matchAll(/<li class="pp-card[^"]*"><h3><a href="\/courses\/([^/]+)\/"/g)].map((m) => m[1]).sort()).toEqual(want.sort());
  });

  it("the why page links to the feature pages it mentions", () => {
    const why = html("why-darsi", "en");
    for (const k of ["kits", "offline", "code", "standards", "languages", "labs"]) expect(why).toContain(`href="/features/${k}/"`);
    expect(html("why-darsi", "ar")).toContain('href="/ar/features/kits/"');
  });
});

describe("Hosting and the service worker leave the pages alone", () => {
  it("the app's catch-all rewrite skips every page root, so a page that doesn't exist is a real 404", () => {
    const fb = JSON.parse(readFileSync(join(ROOT, "firebase.json"), "utf8"));
    const app = fb.hosting.find((h: { target: string }) => h.target === "app");
    const catchAll = app.rewrites.find((r: { destination?: string }) => r.destination === "/app.html").source as string;
    for (const r of PAGE_ROOTS) expect(catchAll).toContain(`|${r}`);
    expect(app.ignore).not.toContain("404.html");
    // /ar/ on its own sends people on to the Arabic home page, which the app serves (no Hosting redirect: the emulator
    // ignores them, so a file is what can be checked).
    const ar = readFileSync(join(out, "ar", "index.html"), "utf8");
    expect(ar).toContain('<meta http-equiv="refresh" content="0; url=/?lang=ar">');
    expect(ar).toContain('<meta name="robots" content="noindex">');
    expect(ar).toContain('<a href="/?lang=ar">');
  });

  it("the service worker never answers a page with the app, and never precaches one", () => {
    for (const p of ["/courses/", "/courses/ai-4-1/", "/ar/", "/ar/courses/ai-4-1/", "/features/labs/", "/why-darsi/"]) expect(PAGE_PATH.test(p), p).toBe(true);
    for (const p of ["/", "/learn", "/labs", "/lesson/ai-4-1/x", "/tracks", "/me", "/courseshop", "/archive"]) expect(PAGE_PATH.test(p), p).toBe(false);
    const config = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");
    expect(config).toMatch(/navigateFallbackDenylist: \[[^\]]*PAGE_PATH\]/);
    expect(config).toContain("export const PAGE_IGNORES = [...PAGE_ROOTS.map((r) => `${r}/**`), ...ROOT_FILES, \"assets/site-*.css\"];");
    expect(config).toMatch(/globIgnores: \[[^\n]*\.\.\.PAGE_IGNORES,/);
  });

  it("robots.txt names the pages' sitemap", () => {
    expect(readFileSync(resolve(process.cwd(), "public/robots.txt"), "utf8")).toContain("Sitemap: https://darsiai.org/sitemap-pages.xml");
  });
});
