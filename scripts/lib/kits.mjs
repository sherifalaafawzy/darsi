/**
 * The starting courses' classroom kits (content/kits, built by apps/web/scripts/build-kits.mjs) as uploaded files:
 * where each one goes in Storage, and the unit with its kit entries pointing there. Shared by scripts/seed-content.mjs
 * and the e2e suite's stand-in for Storage, so both lay the files out the same way.
 */
export const KIT_LANGS = ["en", "ar"];
const pathOf = (unitId, base, lang, fmt) => `content/media/${unitId}/${base.replace(/\//g, "_")}-${lang}.${fmt}`;

/** Every kit file a unit's lessons name: the local file under content/kits and its Storage path. */
export function kitFiles(unit) {
  const out = [];
  for (const l of unit.lessons) for (const k of l.kit) {
    if (!k.base) continue;
    for (const lang of KIT_LANGS) for (const fmt of k.formats) if (fmt !== "mp4") out.push({ file: `${k.base}-${lang}.${fmt}`, path: pathOf(unit.id, k.base, lang, fmt), fmt });
  }
  return out;
}

/**
 * The unit as it is published: kits point at the uploaded files (urls per language and format) instead of app paths,
 * and kit entries for files that don't exist yet (the narrated videos under /media/, still to be made) are left out.
 */
export function withKitUrls(unit, urlOf) {
  return {
    ...unit,
    lessons: unit.lessons.map((l) => ({
      ...l,
      kit: l.kit.filter((k) => !(k.path && k.path.startsWith("/media/"))).map((k) => {
        if (!k.base) return k;
        const { base, ...rest } = k;
        const urls = {};
        for (const lang of KIT_LANGS) for (const fmt of k.formats) if (fmt !== "mp4") (urls[lang] ??= {})[fmt] = urlOf(pathOf(unit.id, base, lang, fmt));
        return { ...rest, urls };
      }),
    })),
  };
}

export const contentTypeOf = (fmt) => ({ pdf: "application/pdf", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" })[fmt] ?? "application/octet-stream";
