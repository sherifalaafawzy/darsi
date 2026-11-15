// index.html and public/boot.js: the page has no inline script of our own (the report-only Content-Security-Policy
// allows only the site's files), and boot.js does what the three inline scripts did: the redirect from the Hosting
// site's own addresses, the service worker's registration, and "update your browser", which now shows only before the
// app's first mount. (The build's side, data-sw on the tag: tests/build-config.test.ts.)
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (file: string) => readFileSync(join(__dirname, "..", file), "utf8");

describe("index.html and public/boot.js", () => {
  const html = read("index.html");
  const boot = read("public/boot.js");

  it("has no inline script: the report-only Content-Security-Policy allows only the site's own files", () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    expect(scripts.map((m) => m[1].trim())).toEqual(['src="/boot.js"', 'type="module" src="/src/main.tsx"']);
    for (const m of scripts) expect(m[2].trim()).toBe("");
    // boot.js comes first, in the head: the redirect runs before anything else loads.
    expect(html.indexOf('<script src="/boot.js"></script>')).toBeLessThan(html.indexOf("</head>"));
    expect(html).not.toMatch(/\son\w+\s*=/); // no inline handlers either
  });

  it("Hosting serves boot.js with no-cache, as sw.js: it isn't hashed, so a cached copy would outlive a fix to it", () => {
    // The app's Hosting site (firebase.json has two since school sign-in: "app" and "login").
    const hosting = (JSON.parse(readFileSync(join(__dirname, "../../../firebase.json"), "utf8")) as { hosting: { target: string; headers: { source: string; headers: { key: string; value: string }[] }[] }[] }).hosting.find((h) => h.target === "app")!;
    const of = (source: string) => hosting.headers.find((x) => x.source === source)?.headers.find((x) => x.key === "Cache-Control")?.value;
    expect(of("/boot.js")).toBe("no-cache");
    expect(of("/boot.js")).toBe(of("/sw.js"));
  });

  it("keeps boot.js to ES5 with no imports: it is served as written, to browsers too old for the app", () => {
    const code = boot.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const modern of [/=>/, /\b(?:let|const|class|import|export|async|await)\b/, /`/, /\?\./, /\?\?/, /\.\.\./]) expect(code).not.toMatch(modern);
    expect(() => new Function(code)).not.toThrow();
  });

  /** Run boot.js against a page of our own: #root and the card as index.html has them, and stand-ins for the rest. */
  function page(o: { host?: string; sw?: string | null; loading?: boolean; observer?: boolean; register?: () => unknown } = {}) {
    document.body.innerHTML = '<div id="root"></div><div id="boot-fallback" hidden></div>';
    const root = document.getElementById("root")!, box = document.getElementById("boot-fallback")!;
    const replace = vi.fn(), register = vi.fn(o.register ?? (() => Promise.resolve()));
    const location = { hostname: o.host ?? "darsiai.org", pathname: "/learn", search: "?a=1", hash: "#top", replace };
    let ready: (() => void) | undefined;
    const doc = {
      currentScript: o.sw === null ? null : { getAttribute: (name: string) => (name === "data-sw" ? o.sw ?? null : null) },
      readyState: o.loading ? "loading" : "interactive",
      getElementById: (id: string) => document.getElementById(id),
      addEventListener: (type: string, f: () => void) => { if (type === "DOMContentLoaded") ready = f; },
    };
    const win = { MutationObserver: o.observer === false ? undefined : MutationObserver };
    new Function("window", "document", "location", "navigator", boot)(win, doc, location, { serviceWorker: { register } });
    // jsdom delivers mutation records in a microtask.
    const settle = () => Promise.resolve().then(() => Promise.resolve());
    return { root, box, replace, register, settle, ready: () => ready?.() };
  }
  const shown = (box: HTMLElement) => !box.hasAttribute("hidden");

  beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }); });
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ""; });

  it("sends the Hosting site's own addresses to darsiai.org, and does nothing else there", () => {
    for (const host of ["darsi-f0685.web.app", "darsi-f0685.firebaseapp.com"]) {
      const p = page({ host, sw: "/sw.js" });
      expect(p.replace).toHaveBeenCalledWith("https://darsiai.org/learn?a=1#top");
      expect(p.register).not.toHaveBeenCalled();
    }
    for (const host of ["darsiai.org", "school.darsiai.org", "localhost", "darsi-f0685.web.app.example.org"]) expect(page({ host }).replace).not.toHaveBeenCalled();
  });

  it("registers the service worker the tag names, and none without the attribute (npm run dev)", () => {
    const built = page({ sw: "/sw.js" });
    expect(built.register).toHaveBeenCalledTimes(1);
    expect(built.register).toHaveBeenCalledWith("/sw.js");
    expect(page({}).register).not.toHaveBeenCalled();
    expect(page({ sw: null }).register).not.toHaveBeenCalled(); // a browser without document.currentScript
  });

  it("catches a refused registration (no unhandled rejection for the error counts) and one that throws at once", () => {
    const refused = Promise.reject(new Error("The operation is insecure."));
    const then = vi.spyOn(refused, "then");
    expect(() => page({ sw: "/sw.js", register: () => refused })).not.toThrow();
    expect(then).toHaveBeenCalledWith(null, expect.any(Function));
    expect(() => page({ sw: "/sw.js", register: () => { throw new DOMException("blocked", "SecurityError"); } })).not.toThrow();
    // The rest still runs: the card's watch is in place.
    const p = page({ sw: "/sw.js", register: () => { throw new Error("blocked"); } });
    vi.advanceTimersByTime(15_000);
    expect(shown(p.box)).toBe(true);
  });

  it("shows “update your browser” when the app has not mounted after 15 seconds, and hides it if it mounts later", async () => {
    const p = page();
    vi.advanceTimersByTime(14_999);
    expect(shown(p.box)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(shown(p.box)).toBe(true);
    p.root.appendChild(document.createElement("main")); // a slow phone gets there in the end
    await p.settle();
    expect(shown(p.box)).toBe(false);
  });

  it("never shows it once the app has mounted, even when React empties the root afterwards", async () => {
    const p = page();
    p.root.appendChild(document.createElement("main"));
    await p.settle();
    vi.advanceTimersByTime(20_000);
    expect(shown(p.box)).toBe(false);
    // An unmount (an error no boundary caught, a remount): the page is empty, on a browser that plainly runs the app.
    p.root.innerHTML = "";
    await p.settle();
    vi.advanceTimersByTime(60_000);
    expect(shown(p.box)).toBe(false);
    expect(vi.getTimerCount()).toBe(0); // the 15 s timer was cleared at the mount, not left to fire
  });

  it("waits for the body when it runs in the head, and sees an app that mounted before then", async () => {
    const p = page({ loading: true });
    vi.advanceTimersByTime(20_000);
    expect(shown(p.box)).toBe(false); // nothing is watching yet: the page is still being parsed
    p.ready();
    vi.advanceTimersByTime(15_000);
    expect(shown(p.box)).toBe(true);

    const mounted = page({ loading: true });
    mounted.root.appendChild(document.createElement("main")); // the module script ran before DOMContentLoaded
    mounted.ready();
    mounted.root.innerHTML = "";
    await mounted.settle();
    vi.advanceTimersByTime(60_000);
    expect(shown(mounted.box)).toBe(false);
  });

  it("still shows the card in a browser without MutationObserver", () => {
    const p = page({ observer: false });
    vi.advanceTimersByTime(15_000);
    expect(shown(p.box)).toBe(true);
  });
});
