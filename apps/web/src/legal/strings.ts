/**
 * The strings of the privacy and terms pages, their links, the agreement at sign-up and "Leave <organization>" (Me),
 * registered when the first screen that uses them loads. Not in the app's main dictionaries; MessageKey lists them
 * (i18n/index.tsx). `k` checks a key against this file and hands it to t(); importing it keeps the registration with
 * every screen that uses them.
 */
import { addMessages, type MessageKey } from "../i18n";
import en from "./strings/en.json";
import ar from "./strings/ar.json";

addMessages({ en, ar });
export type LegalKey = keyof typeof en;
export const k = (key: LegalKey): MessageKey => key;
