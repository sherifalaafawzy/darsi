/**
 * The starting courses' files as uploaded files: the classroom kits (content/kits, built by apps/web/scripts/build-kits.mjs)
 * and the lesson media (content/media: narrated videos, captions and light lessons, from scripts/import-packs.mjs).
 * Where each one goes in Storage, and the unit pointing there. Shared by scripts/seed-content.mjs and the e2e suite's
 * stand-in for Storage, so both lay the files out the same way.
 */
export const KIT_LANGS = ["en", "ar"];
const pathOf = (unitId, base, lang, fmt) => `content/media/${unitId}/${base.replace(/\//g, "_")}-${lang}.${fmt}`;
const all = () => true;

/**
 * Every kit file a unit's lessons name: the local file under content/kits and its Storage path. `has(file)` says whether
 * a language's file exists: some kits (the course packs' own plans and worksheets) are in English only, and the app
 * falls back to English. English is always listed, so a missing one is reported.
 */
export function kitFiles(unit, has = all) {
  const out = [];
  for (const l of unit.lessons) for (const k of l.kit) {
    if (!k.base) continue;
    for (const lang of KIT_LANGS) for (const fmt of k.formats) {
      const file = `${k.base}-${lang}.${fmt}`;
      if (fmt !== "mp4" && (lang === "en" || has(file))) out.push({ file, path: pathOf(unit.id, k.base, lang, fmt), fmt });
    }
  }
  return out;
}

const isMedia = (v) => typeof v === "string" && v.startsWith("/media/");
const kitMedia = (k, lang, fmt) => `${k.path.replace("{lang}", lang)}.${fmt}`;

/** Every /media/ file a unit names (video sources, captions, light lessons and video kits), as written in the unit. */
export function mediaPaths(unit) {
  const out = new Set();
  for (const l of unit.lessons) {
    for (const s of l.steps) if (s.type === "video") {
      for (const m of [s.sources, s.captions, s.light?.files]) for (const v of Object.values(m ?? {})) if (isMedia(v)) out.add(v);
    }
    for (const k of l.kit) if (isMedia(k.path)) for (const lang of KIT_LANGS) for (const fmt of k.formats) out.add(kitMedia(k, lang, fmt));
  }
  return [...out];
}

/** Where an uploaded media file goes: under the unit's media, in a folder named by its content, so it can be cached for good. */
export const mediaPathOf = (unitId, local, hash) => `content/media/${unitId}/${hash}/${local.slice("/media/".length)}`;

/**
 * The unit as it is published: kits and media point at the uploaded files instead of app paths.
 * - `urlOf(path)` is a Storage path's download URL; `has(file)` as for kitFiles.
 * - `media` maps each uploaded /media/ path to its URL. Media that wasn't uploaded (files still to be made, such as ai-1's
 *   narrated videos) keeps its app path, and video kits without any uploaded file are left out.
 */
export function withKitUrls(unit, urlOf, { has = all, media = new Map() } = {}) {
  const swap = (m) => m && Object.fromEntries(Object.entries(m).map(([k, v]) => [k, media.get(v) ?? v]));
  return {
    ...unit,
    lessons: unit.lessons.map((l) => ({
      ...l,
      steps: l.steps.map((s) => s.type !== "video" ? s : {
        ...s,
        ...(s.sources && { sources: swap(s.sources) }),
        ...(s.captions && { captions: swap(s.captions) }),
        ...(s.light && { light: { ...s.light, files: swap(s.light.files) } }),
      }),
      kit: l.kit.flatMap((k) => {
        if (isMedia(k.path)) {
          const { path, ...rest } = k;
          const urls = {};
          for (const lang of KIT_LANGS) for (const fmt of k.formats) {
            const url = media.get(kitMedia(k, lang, fmt));
            if (url) (urls[lang] ??= {})[fmt] = url;
          }
          return Object.keys(urls).length ? [{ ...rest, urls }] : [];
        }
        if (!k.base) return [k];
        const { base, ...rest } = k;
        const urls = {};
        for (const lang of KIT_LANGS) for (const fmt of k.formats) {
          if (fmt !== "mp4" && (lang === "en" || has(`${base}-${lang}.${fmt}`))) (urls[lang] ??= {})[fmt] = urlOf(pathOf(unit.id, base, lang, fmt));
        }
        return [{ ...rest, urls }];
      }),
    })),
  };
}

export const contentTypeOf = (fmt) => ({
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp4: "video/mp4",
  vtt: "text/vtt; charset=utf-8",
  json: "application/json; charset=utf-8",
  opus: "audio/ogg",
  m4a: "audio/mp4",
})[fmt] ?? "application/octet-stream";
