/**
 * A lesson's video from Lesson Studio (H:\htdocs\lessonstudio by default): the 240p MP4 and captions per language and the
 * light lesson, copied into content/media/<lesson>/ (gitignored; `npm run seed` uploads them), and the times inside each
 * language's video. Used by scripts/import-packs.mjs (the three course packs) and scripts/import-media.mjs (every other
 * course). Lesson Studio's lesson id is the Darsi lesson id; `npm run mp4` and `npm run package-lessons` there make the files.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

/** Darsi language → Lesson Studio language: the Arabic videos are narrated in Egyptian Arabic. */
export const STUDIO_LANGS = { en: "en", ar: "ar-EG" };
/** Seconds the Lesson Studio MP4 holds still on each quick check (scripts/video/mp4.ts --hold). */
export const HOLD = 4;

export const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
export function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

/** The video and light lesson Lesson Studio made for this lesson, copied under <root>/content/media/<lesson>/. */
export function studioMedia(root, studio, studioId, lessonId) {
  const out = join(root, "content", "media", lessonId);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const langs = STUDIO_LANGS;
  const sources = {}, captions = {}, info = {};
  for (const [dl, sl] of Object.entries(langs)) {
    const v = join(studio, "out", "videos", studioId, sl);
    if (!existsSync(join(v, "video.json"))) throw new Error(`No ${sl} video for ${studioId} in ${v}: render it with npm run mp4 in Lesson Studio`);
    info[dl] = readJson(join(v, "video.json"));
    if (!info[dl].narrated) throw new Error(`The ${sl} video for ${studioId} has no narration yet`);
    copyFileSync(join(v, "240p.mp4"), join(out, `video-${dl}.mp4`));
    copyFileSync(join(v, "captions.vtt"), join(out, `captions-${dl}.vtt`));
    sources[dl] = `/media/${lessonId}/video-${dl}.mp4`;
    captions[dl] = `/media/${lessonId}/captions-${dl}.vtt`;
  }
  // The light lesson: Lesson Studio's package (manifest, scenes, timing and narration per language).
  const pkg = join(studio, "out", "packages", studioId);
  if (!existsSync(join(pkg, "manifest.json"))) throw new Error(`No light lesson for ${studioId}: run npm run package-lessons in Lesson Studio`);
  const lightFiles = {};
  const sizeKB = {};
  for (const f of walk(pkg)) {
    const rel = f.slice(pkg.length + 1).replace(/\\/g, "/");
    if (rel.startsWith("captions/")) continue; // the player captions from the timing
    mkdirSync(join(out, "light", dirname(rel)), { recursive: true });
    copyFileSync(f, join(out, "light", rel));
    lightFiles[rel] = `/media/${lessonId}/light/${rel}`;
  }
  for (const [dl, sl] of Object.entries(langs)) {
    sizeKB[dl] = Math.round(["manifest.json", "scenes.json", `timing/${sl}.json`, `audio/${sl}.opus`].reduce((n, p) => n + (existsSync(join(pkg, p)) ? statSync(join(pkg, p)).size : 0), 0) / 1024);
  }
  const mb = (dl) => statSync(join(out, `video-${dl}.mp4`)).size / 1048576;
  return {
    sources, captions, info,
    duration: Math.ceil(Math.max(info.en.seconds, info.ar.seconds)),
    sizeMB: Math.round(Math.max(mb("en"), mb("ar")) * 10) / 10,
    light: { files: lightFiles, langs, sizeKB },
  };
}

/** When storyboard scene i starts in each language's video: Lesson Studio's measured timing plus the holds before it. */
export function sceneTimes(studio, studioId) {
  const dir = join(studio, "content", "darsi", "lessons", studioId);
  const scenes = readJson(join(dir, "scenes.json")).scenes;
  const at = {};
  for (const [dl, sl] of Object.entries(STUDIO_LANGS)) {
    const t = readJson(join(dir, "timing", `${sl}.json`));
    const holds = t.scenes.flatMap((s, i) => (scenes[i].check ? [s.end] : []));
    at[dl] = t.scenes.map((s) => Math.round((s.start + HOLD * holds.filter((h) => h <= s.start + 1e-6).length) * 10) / 10);
  }
  return at;
}

/** The storyboard (English) and its Egyptian Arabic, as written in Lesson Studio's content/darsi. */
export function storyboard(studio, studioId) {
  const story = readJson(join(studio, "content", "darsi", "source", `${studioId.toUpperCase()}.json`)).video;
  const arabic = readJson(join(studio, "content", "darsi", studioId, "ar-EG.json"));
  return { story, arabic };
}
