/**
 * Strings of the admin forms that must not lose work (leave questions, the passwords' download, the import preview,
 * the plans' field errors, seats), registered when the first of those screens loads: staff chunks only. Their keys
 * aren't in MessageKey (i18n/index.tsx lists the dictionaries it knows), so `k()` vouches for them: t(k("fm.leave.stay")).
 */
import { addMessages, type MessageKey } from "../i18n";
import en from "./forms-strings/en.json";
import ar from "./forms-strings/ar.json";

addMessages({ en, ar });
export const k = (key: keyof typeof en) => key as string as MessageKey;
