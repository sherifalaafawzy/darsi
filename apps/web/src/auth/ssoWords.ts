/**
 * School sign-in's words for people (every refusal with what to do next, the school finder, the test page, Me's
 * "School sign-in"), registered when the first chunk that shows one loads: the sign-in screen itself carries only the
 * few strings of its button (i18n/en.json "sso.*"). The keys aren't in MessageKey, so `k()` vouches for them.
 * The admin wizard's own words are admin/sso-strings.
 */
import { addMessages, type MessageKey, useI18n } from "../i18n";
import en from "./sso-strings/en.json";
import ar from "./sso-strings/ar.json";

addMessages({ en, ar });
export type SsoWordKey = keyof typeof en;
export const k = (key: SsoWordKey) => key as string as MessageKey;
const isKey = (key: string): key is SsoWordKey => Object.prototype.hasOwnProperty.call(en, key);

/** The sentence for a refusal code (sso-*, or "network"), with what to do; an unknown code gets a general one. */
export function refusalText(code: string, t: ReturnType<typeof useI18n>["t"]): string {
  const key = `ss.rf.${code}`;
  return t(k(isKey(key) ? key : "ss.rf.other"));
}
