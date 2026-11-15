// Search and AI engines (seo.ts, seoCore.ts): each address's home page carries its own title, description, canonical,
// language alternates, JSON-LD and real text; sitemap.xml and llms.txt are per address; nothing an
// organization types becomes markup.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { darsiSeo, esc, inject, ldJson, llms, orgSeo, sitemap } from "../src/seoCore";
import type { OrgPage } from "../src/shared/page";

const SHELL = `<!doctype html><html lang="en"><head><meta name="description" content="old" /><meta property="og:title" content="old" /><title>Darsi — درسي</title><script src="/boot.js"></script></head><body><div id="root"></div><script type="module" src="/assets/index-abc.js"></script></body></html>`;
const UNITS = [
  { id: "ai-4-1", track: "ai", level: 4, title: { en: "Leading AI at school", ar: "قيادة الذكاء الاصطناعي في المدرسة" }, summary: { en: "Plan and lead AI use.", ar: "خطط وقُد." }, lessons: 4 },
  { id: "org-x", track: "ai", level: 1, title: { en: "Private" }, summary: { en: "Org only" }, owner: "o1" },
];
const PAGE: OrgPage = { v: 1, langs: ["en", "ar"], blocks: [
  { id: "aaaa1", kind: "text", heading: { en: "About" }, body: { en: "We are <b>Nile</b> School & friends.", ar: "نحن مدرسة النيل." } },
  { id: "aaaa2", kind: "faq", heading: {}, items: [{ q: { en: "When?" }, a: { en: "Mornings." } }] },
  { id: "aaaa3", kind: "contact", heading: {}, email: "info@nile.edu", phone: "+20 100", address: {}, website: "https://nile.edu" },
] };
const SITE = { orgId: "o1", name: "Nile </title><script>x</script>", logo: "https://cdn/logo.png", darsi: true };

describe("what crawlers read", () => {
  it("darsiai.org: its title, canonical, Arabic alternate, public courses only, in JSON-LD and as text", () => {
    const s = darsiSeo(UNITS, "en", "https://darsiai.org/icon.png");
    const html = inject(SHELL, s);
    expect(html).toContain("<title>Darsi — practical AI");
    expect(html).not.toContain('content="old"');
    expect(html).toContain('<link rel="canonical" href="https://darsiai.org/" />');
    expect(html).toContain('<link rel="alternate" hreflang="ar" href="https://darsiai.org/?lang=ar" />');
    expect(html).toContain("<h3>Leading AI at school</h3>");
    expect(html).not.toContain("Private");
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)![1]);
    expect(ld["@graph"].map((x: { "@type": string }) => x["@type"])).toEqual(["EducationalOrganization", "WebSite", "ItemList"]);
    expect(ld["@graph"][2].itemListElement[0].item).toMatchObject({ "@type": "Course", name: "Leading AI at school", isAccessibleForFree: true });
    // The app's own scripts stay.
    expect(html).toContain('<script type="module" src="/assets/index-abc.js"></script>');
  });

  it("links to the public pages this release has, and to a course's page only when it has one", () => {
    const pages = { courses: ["ai-4-1"] };
    const en = inject(SHELL, darsiSeo([...UNITS, { id: "new-1", track: "ai", level: 1, title: { en: "Brand new" }, summary: { en: "Published after the release." } }], "en", "x", pages));
    for (const path of ["/courses/", "/features/", "/why-darsi/"]) expect(en).toContain(`href="${path}"`);
    expect(en).toContain('<h3><a href="/courses/ai-4-1/">Leading AI at school</a></h3>');
    expect(en).toContain("<h3>Brand new</h3>");
    const graph = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(en)![1])["@graph"];
    expect(graph[2].itemListElement[0].item.url).toBe("https://darsiai.org/courses/ai-4-1/");
    expect(graph[2].itemListElement[1].item.url).toBe("https://darsiai.org/learn");
    const ar = inject(SHELL, darsiSeo(UNITS, "ar", "x", pages));
    expect(ar).toContain('href="/ar/courses/ai-4-1/"');
    expect(ar).toContain('href="/ar/why-darsi/"');
    // Without the list (site-pages.json unreadable) the page links nowhere it can't vouch for.
    expect(inject(SHELL, darsiSeo(UNITS, "en", "x"))).not.toContain('href="/courses/');
    const txt = llms(darsiSeo(UNITS, "en", "x", pages), "https://darsiai.org", pages);
    expect(txt).toContain("- [Why Darsi exists](https://darsiai.org/why-darsi/)");
    expect(txt).toContain("- [All courses (Arabic)](https://darsiai.org/ar/courses/)");
    expect(txt).toContain("(https://darsiai.org/sitemap-pages.xml)");
  });

  it("?lang=ar: the Arabic page, right to left, with its own canonical", () => {
    const html = inject(SHELL, darsiSeo(UNITS, "ar", "x"));
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain('<link rel="canonical" href="https://darsiai.org/?lang=ar" />');
    expect(html).toContain("قيادة الذكاء الاصطناعي في المدرسة");
  });

  it("an organization's address: its own name and canonical, its homepage's text, FAQ and contact as schema.org, all escaped", () => {
    const s = orgSeo("learn.nile.edu", SITE, PAGE, "en", SITE.logo);
    const html = inject(SHELL, s);
    expect(html).toContain('<link rel="canonical" href="https://learn.nile.edu/" />');
    expect(html).not.toContain("darsiai.org/");
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;b&gt;Nile&lt;/b&gt; School &amp; friends.");
    expect(s.description).toBe("We are <b>Nile</b> School & friends.");
    const graph = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)![1])["@graph"];
    expect(graph[0]).toMatchObject({ "@type": "EducationalOrganization", contactPoint: { email: "info@nile.edu" }, sameAs: ["https://nile.edu/"] });
    expect(graph[2]).toMatchObject({ "@type": "FAQPage", mainEntity: [{ name: "When?", acceptedAnswer: { text: "Mornings." } }] });
    expect(ldJson({ a: "</script>" })).not.toContain("</script>");
    expect(esc(`"'<>&`)).toBe("&quot;&#39;&lt;&gt;&amp;");
  });

  it("sitemap.xml and llms.txt name the address they were asked for", () => {
    const map = sitemap("https://learn.nile.edu", ["/privacy"]);
    expect(map).toContain("<loc>https://learn.nile.edu/</loc>");
    expect(map).toContain('hreflang="ar" href="https://learn.nile.edu/?lang=ar"');
    expect(map).toContain("<loc>https://learn.nile.edu/privacy</loc>");
    const txt = llms(orgSeo("learn.nile.edu", SITE, PAGE, "en", null), "https://learn.nile.edu");
    expect(txt.split("\n")[0]).toBe("# Nile </title><script>x</script>");
    expect(txt).toContain("> We are <b>Nile</b>");
    expect(txt).toContain("- [Home (Arabic)](https://learn.nile.edu/?lang=ar)");
  });
});

// The handler: the address from X-Forwarded-Host, files from the bucket, the shell from Hosting.
const files = vi.hoisted(() => new Map<string, string>());
vi.mock("../src/storage.js", () => ({
  bucket: () => ({ file: (p: string) => ({ exists: async () => [files.has(p)], download: async () => [Buffer.from(files.get(p) ?? "")] }) }),
  publicFileUrl: (p: string) => `https://storage.test/${p}`,
}));
const { seoPage, hostOf } = await import("../src/seo");
async function get(path: string, host: string, query: Record<string, string> = {}) {
  const out = { status: 200, body: "", headers: {} as Record<string, string>, type: "" };
  const res = {
    set(k: string | Record<string, string>, v?: string) { if (typeof k === "string") out.headers[k] = v!; else Object.assign(out.headers, k); return res; },
    status(c: number) { out.status = c; return res; }, type(t: string) { out.type = t; return res; },
    send(b: string) { out.body = b; return res; }, end() { return res; },
  };
  await (seoPage as unknown as (q: unknown, r: unknown) => Promise<void>)({ method: "GET", path, query, headers: { "x-forwarded-host": host } }, res);
  return out;
}

describe("seoPage", () => {
  beforeEach(() => {
    files.clear();
    files.set("content/catalog.json", JSON.stringify({ units: UNITS }));
    files.set("content/sites.json", JSON.stringify({ v: 1, sites: { "learn.nile.edu": { orgId: "o1", name: "Nile School", logo: null, darsi: true } } }));
    files.set("content/pages/o1/page.json", JSON.stringify(PAGE));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(SHELL, { status: 200, headers: { "content-security-policy": "frame-ancestors 'none'", "x-frame-options": "DENY", "x-other": "no" } })));
  });

  it("reads the address Hosting was asked for", () => {
    expect(hostOf({ "x-forwarded-host": "Learn.Nile.edu:443, proxy" })).toBe("learn.nile.edu");
    expect(hostOf({ host: "bad host/<" })).toBe("");
  });

  it("answers an organization's home page with its own head and text, and Hosting's security headers", async () => {
    const r = await get("/", "learn.nile.edu");
    expect(r.body).toContain("<title>Nile School</title>");
    expect(r.body).toContain("We are &lt;b&gt;Nile&lt;/b&gt;");
    expect(r.headers).toMatchObject({ "content-security-policy": "frame-ancestors 'none'", "x-frame-options": "DENY", "Cache-Control": "no-cache" });
    expect(r.headers).not.toHaveProperty("x-other");
  });

  it("answers Darsi's own address, an unknown one, and the text files", async () => {
    expect((await get("/", "darsiai.org")).body).toContain("<h3>Leading AI at school</h3>");
    expect((await get("/", "unknown.example")).body).toContain('<link rel="canonical" href="https://darsiai.org/" />');
    expect((await get("/sitemap.xml", "learn.nile.edu")).body).toContain("<loc>https://learn.nile.edu/</loc>");
    expect((await get("/llms.txt", "darsiai.org", { lang: "ar" })).body.split("\n")[0]).toBe("# درسي");
  });
});
