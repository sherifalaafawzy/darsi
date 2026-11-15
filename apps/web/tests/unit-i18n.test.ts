/**
 * Course translations (content/i18n/units/<lang>/<unitId>.json, scripts/unit-i18n.mjs): each one still fits its course
 * (the English it was made from is the course's English, the shape matches), the translated course passes the
 * validator, and fill-in answers are words of their bank. A translation that went stale (the English changed since)
 * shows in English until it is translated again; the test lists those so the next pass can pick them up.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { errorsOf, validateUnit } from "../src/content/validate";
// @ts-expect-error: a plain .mjs script without types
import { apply, DIR, overlayLangs, PACKS, UNITS } from "../../../scripts/unit-i18n.mjs";

const langs: string[] = overlayLangs();
for (const lang of langs) {
  const ids = readdirSync(join(DIR, lang)).filter((f: string) => f.endsWith(".json")).map((f: string) => f.slice(0, -5));
  describe(`courses in ${lang}`, () => {
    for (const id of ids.filter((x: string) => x.startsWith("pack-"))) {
      it(`${id} (university course pack)`, () => {
        const pack = JSON.parse(readFileSync(join(PACKS, `${id.slice(5)}.json`), "utf8"));
        expect(apply(pack, [lang], id).stats[lang].stale).toBe(0);
      });
    }
    for (const id of ids.filter((x: string) => !x.startsWith("pack-"))) {
      it(id, () => {
        expect(existsSync(join(UNITS, `${id}.json`)), `no course ${id}`).toBe(true);
        const source = JSON.parse(readFileSync(join(UNITS, `${id}.json`), "utf8"));
        const { unit, stats } = apply(source, [lang]);
        expect(stats[lang].stale, `${stats[lang].stale} translations no longer match the English (re-translate them)`).toBe(0);
        expect(errorsOf(validateUnit(unit, { langs: ["en", "ar", lang] })).map((e) => `${e.code} ${JSON.stringify(e.at)}`)).toEqual([]);
        for (const l of unit.lessons) for (const s of l.steps as { type: string; id: string; bank?: Record<string, string[]>; answers?: Record<string, string[]> }[]) {
          if (s.type !== "fill" || !s.bank?.[lang]) continue;
          for (const a of s.answers?.[lang] ?? []) expect(s.bank[lang], `${l.id}/${s.id}: «${a}»`).toContain(a);
        }
      });
    }
  });
}
