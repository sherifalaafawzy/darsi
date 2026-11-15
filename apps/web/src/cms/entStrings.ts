/**
 * Strings the course editor and the organization page gained with the enterprise pass (a catalog that is still on its
 * way, the join confirmation, a failed spreadsheet download), registered when the first screen that uses them loads:
 * learners never download them. Their keys aren't in MessageKey (i18n/index.tsx lists the dictionaries it knows), so
 * `k()` vouches for them: t(k("ent.org.joinAsk")).
 */
import { addMessages, type MessageKey } from "../i18n";
import { reasonOf } from "../admin/refusals";
import { errorText } from "../staff/errors";
import en from "./ent-strings/en.json";
import ar from "./ent-strings/ar.json";

addMessages({ en, ar });
export const k = (key: keyof typeof en) => key as string as MessageKey;

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * An error whose message is already in the author's language (the editor's own: "that id is taken", "someone else
 * saved first"). Everything else that is thrown is a server's or the SDK's, in raw English, and goes through errorText.
 */
export class Said extends Error {}
/** What to show for something that failed in the editor. Call it once per error (errorText logs the raw one). */
export const failText = (e: unknown, t: T) => (e instanceof Said ? e.message : errorText(e, t));
/**
 * publishUnit, unpublishUnit and deleteUnit answer "catalog-pending" when Firestore holds the change and only the
 * course list (catalog.json) could not be written: the server writes it by itself within 15 minutes. For publish and
 * unpublish that is a success learners see a little later, and the author is told so, never "it failed".
 */
export const catalogPending = (e: unknown) => reasonOf(e) === "catalog-pending";
