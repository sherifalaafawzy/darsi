/**
 * The UI strings a language pack translates (/super/languages, `npm run languages`): the app's own (en.json) plus the
 * learner-facing strings that lazy chunks register when they load (the tour, Report a problem, the tutor, Upgrade). A
 * pack is merged into the language's strings when someone picks it, so those chunks find their translations there.
 *
 * Staff strings (admin/, cms/) are not in packs: every learner would download them. They stay English and Arabic.
 * scripts/seed-languages.mjs reads the same files (SOURCES there); tests/i18n-packs.test.ts checks the two agree.
 */
import en from "./en.json";
import ar from "./ar.json";
import tourEn from "../tour/strings/en.json";
import tourAr from "../tour/strings/ar.json";
import bugsEn from "../bugs/strings/en.json";
import bugsAr from "../bugs/strings/ar.json";
import tutorEn from "../tutor/strings/en.json";
import tutorAr from "../tutor/strings/ar.json";
import upgradeEn from "../upgrade/strings/en.json";
import upgradeAr from "../upgrade/strings/ar.json";

/** Relative to apps/web/src. */
export const PACK_SOURCES = ["i18n", "tour/strings", "bugs/strings", "tutor/strings", "upgrade/strings"];
export const PACK_EN: Record<string, string> = { ...en, ...tourEn, ...bugsEn, ...tutorEn, ...upgradeEn };
export const PACK_AR: Record<string, string> = { ...ar, ...tourAr, ...bugsAr, ...tutorAr, ...upgradeAr };
