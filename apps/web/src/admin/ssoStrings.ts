/**
 * The school sign-in wizard's own strings (admin/SsoSetup.tsx, the listing requests on /super/domains and the platform
 * switch on /super/plans), registered when the staff chunk that shows them loads: learners never download them. The
 * keys aren't in MessageKey (i18n/index.tsx lists the dictionaries it knows), so `k()` vouches for them.
 */
import { addMessages, type MessageKey } from "../i18n";
import en from "./sso-strings/en.json";
import ar from "./sso-strings/ar.json";

addMessages({ en, ar });
export type SsoKey = keyof typeof en;
export const k = (key: SsoKey) => key as string as MessageKey;
/** Is this one of the wizard's keys? For keys built from data (a console step's id, a refusal, a discovery hint). */
export const isSsoKey = (key: string): key is SsoKey => Object.prototype.hasOwnProperty.call(en, key);
