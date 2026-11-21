// @vitest-environment node
// Pictures in lesson text (the capstones' set-up screenshots, content/media/capstone-shared): `npm run seed` uploads them
// and rewrites their links (scripts/lib/kits.mjs), the app shows only app /media/ paths and this project's published
// course media (content/figure.ts), and a download saves them (unitAssetUrls). Until 2026-11-06 the seed left them as app
// paths, which Hosting answers with the app page, so every live capstone showed broken pictures.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Unit } from "../src/content/types";
import { contentTypeOf, figurePaths, mediaPathOf, mediaPaths, withKitUrls } from "../../../scripts/lib/kits.mjs";

vi.mock("../src/firebase-config", () => ({ firebaseConfig: { storageBucket: "bkt" }, firebaseReady: true, useEmulators: false }));
const { figureOf, figureSrcOk } = await import("../src/content/figure");
const { unitAssetUrls } = await import("../src/content/load");

const store = (p: string) => `https://firebasestorage.googleapis.com/v0/b/bkt/o/${encodeURIComponent(p)}?alt=media`;
const UNITS = join(__dirname, "../../../content/units");
const MEDIA = join(__dirname, "../../../content/media");
/** ai-1 (retired, a fixture) with screenshots in a reading, the Arabic one with isolates inside its path, and in a setup tab. */
const unit = (): Unit => {
  const u = JSON.parse(readFileSync(join(__dirname, "../../../content/retired/ai-1.json"), "utf8")) as Unit;
  const read = u.lessons[0].steps.find((s) => s.type === "read")!;
  if (read.type !== "read") throw new Error("ai-1 has no reading");
  read.body = {
    en: "Open the template.\n\n![Use this template (illustrative)](/media/capstone-shared/github-use-this-template.jpg)\n\nThen press it.",
    ar: "افتح القالب ⁦https://github.com/darsi-org⁩.\n\n![Use this template على GitHub (توضيحي)](/⁦media/capstone-shared/github-use-this-template.jpg⁩)\n\nثم اضغط ⁦Create⁩.",
  };
  u.lessons[0].steps.push({ type: "project", id: "m1", prompt: { en: "Send it" }, task: { en: "T" }, deliverable: { en: "D" }, rubric: [{ criterion: { en: "C" } }],
    setup: [{ os: "windows", body: { en: "Run it.\n\n![VS Code terminal](/media/capstone-shared/vscode-terminal.jpg)" } }] });
  return u;
};

describe("pictures in lesson text", () => {
  it("are part of a unit's media, read past the isolates in Arabic paths", () => {
    expect(figurePaths(unit()).sort()).toEqual(["/media/capstone-shared/github-use-this-template.jpg", "/media/capstone-shared/vscode-terminal.jpg"]);
    expect(mediaPaths(unit())).toEqual(expect.arrayContaining(figurePaths(unit())));
    expect(contentTypeOf("jpg")).toBe("image/jpeg");
  });

  it("point at Storage once published, the rest of the text untouched, and the app shows and downloads them", () => {
    const source = unit();
    const media = new Map(mediaPaths(source).map((p) => [p, store(mediaPathOf(source.id, p, "0123456789ab"))]));
    const published = withKitUrls(source, store, { media });
    const read = published.lessons[0].steps.find((s) => s.type === "read")!;
    if (read.type !== "read") throw new Error("no reading");
    const url = store("content/media/ai-1/0123456789ab/capstone-shared/github-use-this-template.jpg");
    expect(read.body.ar).toBe(`افتح القالب ⁦https://github.com/darsi-org⁩.\n\n![Use this template على GitHub (توضيحي)](${url})\n\nثم اضغط ⁦Create⁩.`);
    expect(read.body.en).toBe(`Open the template.\n\n![Use this template (illustrative)](${url})\n\nThen press it.`);
    expect(figureOf(read.body.ar!.split("\n\n")[1])).toEqual({ alt: "Use this template على GitHub (توضيحي)", src: url });
    expect(unitAssetUrls(published, "ar")).toEqual(expect.arrayContaining([url, store("content/media/ai-1/0123456789ab/capstone-shared/vscode-terminal.jpg")]));
    // Before the seed rewrites them (the dev server serves /media/), they show but aren't saved: Hosting has no /media/.
    expect(unitAssetUrls(source, "ar").some((u) => u.includes("capstone-shared"))).toBe(false);
    expect(figureOf("![x](/⁦media/capstone-shared/a.jpg⁩)")).toEqual({ alt: "x", src: "/media/capstone-shared/a.jpg" });
  });

  // content/media is gitignored (scripts/import-media.mjs, capstone-shared): where it is on this computer, every picture a
  // course shows is there, so `npm run seed` can publish it (it refuses a unit with a missing one).
  it.runIf(existsSync(MEDIA))("names only pictures that are in content/media", () => {
    const missing = readdirSync(UNITS).filter((f) => f.endsWith(".json"))
      .flatMap((f) => figurePaths(JSON.parse(readFileSync(join(UNITS, f), "utf8")) as Unit).filter((p) => !existsSync(join(MEDIA, p.slice("/media/".length)))).map((p) => `${f}: ${p}`));
    expect(missing).toEqual([]);
  });

  it("only from this project's published course media, on the live site or the emulators", () => {
    for (const ok of ["/media/capstone-shared/a.jpg", store("content/media/ai-1/abc/capstone-shared/a.jpg"),
      "http://127.0.0.1:9199/v0/b/bkt/o/content%2Fmedia%2Fai-1%2Fa.jpg?alt=media", "http://localhost:9199/v0/b/bkt/o/content%2Fmedia%2Fa.jpg?alt=media"]) expect(figureSrcOk(ok), ok).toBe(true);
    for (const bad of ["https://firebasestorage.googleapis.com/v0/b/other/o/content%2Fmedia%2Fa.jpg?alt=media", store("orgs/x/a.jpg"),
      "https://example.com/a.jpg", "javascript:alert(1)", "/media/../index.html", "//example.com/a.jpg", "/kits/a.pdf"]) expect(figureSrcOk(bad), bad).toBe(false);
    expect(figureOf("Text ![x](/media/a.jpg) more")).toBeNull();
    expect(figureSrcOk(store("content/media/a.jpg"), undefined)).toBe(true);
    expect(figureSrcOk(store("content/media/a.jpg"), "")).toBe(false);
  });
});
