/**
 * The governance panels' own strings (an organization's activity log and join rules; the platform's log filters, legal
 * pages, retention periods and status; deleting a problem report), registered when the first staff chunk that shows
 * one loads: learners never download them. Their keys aren't in MessageKey (i18n/index.tsx lists the dictionaries it
 * knows), so `k()` vouches for them: t(k("gv.log.title")).
 */
import { addMessages, type MessageKey } from "../i18n";
import en from "./governance-strings/en.json";
import ar from "./governance-strings/ar.json";

addMessages({ en, ar });
export type GovKey = keyof typeof en;
export const k = (key: GovKey) => key as string as MessageKey;
/** Is this one of the panels' keys? For keys built from data (an audit action's id, a job's name). */
export const isGovKey = (key: string): key is GovKey => Object.prototype.hasOwnProperty.call(en, key);
