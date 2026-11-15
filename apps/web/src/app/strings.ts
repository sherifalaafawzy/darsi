/**
 * The app shell's own strings (app/AppBoundary.tsx: what shows when a page or a chunk fails). Startup code: a handful of
 * short lines. MessageKey lists their keys (i18n/index.tsx); `k()` checks a key against this file and, by being imported,
 * makes sure the module that registers them is loaded wherever they are used: t(k("shell.pageError")).
 */
import { addMessages, type MessageKey } from "../i18n";
import en from "./strings/en.json";
import ar from "./strings/ar.json";

addMessages({ en, ar });
export const k = (key: keyof typeof en): MessageKey => key;
export const WORDS: Record<"en" | "ar", Record<keyof typeof en, string>> = { en, ar };
