/**
 * The staff kit's own strings (errors a server or the SDK gave, load states, course access), registered when the first
 * staff chunk that uses the kit loads: learners never download them. Their keys aren't in MessageKey (i18n/index.tsx
 * lists the dictionaries it knows), so `k()` vouches for them: t(k("st.loading")).
 */
import { addMessages, type MessageKey } from "../i18n";
import en from "./strings/en.json";
import ar from "./strings/ar.json";

addMessages({ en, ar });
export type StaffKey = keyof typeof en;
export const k = (key: StaffKey) => key as string as MessageKey;
