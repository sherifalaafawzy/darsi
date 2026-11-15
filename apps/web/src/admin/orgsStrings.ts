/**
 * The strings of an organization's lifecycle on the platform admins' screens (suspend and resume, deletion in steps,
 * the data export) and of the long member lists (the report, the organization's page), registered when the first of
 * those screens loads. Their keys aren't in MessageKey (i18n/index.tsx lists the dictionaries it knows), so `k()`
 * vouches for them: t(k("og.suspend")).
 */
import { addMessages, type MessageKey } from "../i18n";
import en from "./orgs-strings/en.json";
import ar from "./orgs-strings/ar.json";

addMessages({ en, ar });
export const k = (key: keyof typeof en) => key as string as MessageKey;
