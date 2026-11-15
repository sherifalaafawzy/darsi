/**
 * The strings of the organization's people screens (the dashboard's People and Invite tabs, the person page's Account
 * tab, the teacher's list): paging, bulk actions and their confirmations, suspension. Registered when the first of
 * those screens loads, like every staff chunk's strings: learners never download them. Their keys aren't in MessageKey
 * (i18n/index.tsx lists the dictionaries it knows), so `k()` vouches for them: t(k("pp.showMore")).
 */
import { addMessages, type MessageKey } from "../i18n";
import en from "./people-strings/en.json";
import ar from "./people-strings/ar.json";

addMessages({ en, ar });
export type PeopleKey = keyof typeof en;
export const k = (key: PeopleKey) => key as string as MessageKey;
