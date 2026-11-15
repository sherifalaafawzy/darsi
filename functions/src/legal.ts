/**
 * The privacy notice and the terms of use (TECHNICAL.md): platform admins write and publish them, and
 * each account records which version it accepted. The wording is the owner's; this file holds none.
 * - config/legal = {privacy?: {draft: {<lang>: text}, published?: {version, at (ms), by}, lastVersion}, terms?: {…},
 *   updatedAt, updatedBy}: the drafts and what is published, for platform admins (rules: config/{doc}).
 * - config/legalPublished = {privacy?: {version, at (ms), text: {<lang>: text}}, terms?: {…}}: the published copies.
 *   Kept apart from the drafts so both fit a Firestore document, and so the public file can always be written again
 *   from what Firestore holds.
 * - config/legal/versions/<doc>-<n> = {doc, version, at (ms), by, text}: every version ever published, kept for good
 *   (what someone who accepted version n agreed to). No rule opens it, so only the server and the console read it.
 * - content/legal.json (public, re-checked at most once a minute):
 *   {v: 1, privacy: {version, at (ISO), text: {en, ar, …}} | null, terms: {…} | null}. Guests read it with a plain
 *   fetch, like the catalog; a document that isn't published is null, and the app then shows and asks nothing.
 * - users/{uid}.terms = {privacy?, terms?, at}: the versions the person accepted, written only here (the rules let
 *   nobody change it from a phone).
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { audit, caller, db, requireSuper } from "./admin.js";
import { savePublicJson } from "./storage.js";
import { acceptedVersions, isLegalDoc, mergeDraft, nextVersion, publicFile, publishable, validateText, type LegalEntry, type Published } from "./legalCore.js";

const CONFIG = "config/legal";
const LIVE = "config/legalPublished";
export const LEGAL_FILE = "content/legal.json";
/** One published version's record. Under config/legal, where no rule reaches (rules: config/{doc} is that level only): server-side only. */
export const versionPath = (doc: string, version: number) => `${CONFIG}/versions/${doc}-${version}`;

/** Writes content/legal.json from the published copies as they are now (both documents, whichever one changed). */
export async function writeLegalFile() {
  const live = await db.doc(LIVE).get();
  const file = publicFile({ privacy: live.get("privacy"), terms: live.get("terms") });
  await savePublicJson(LEGAL_FILE, file);
  return file;
}

const refuse = (reason: string, message: string) => new HttpsError("invalid-argument", message, { reason });

/**
 * {doc, text, publish}: saves the draft (the languages sent; one sent empty is removed, the others stay) and, with
 * `publish`, makes it the next version for everyone. {doc, unpublish: true}: takes the document out of the public file;
 * the draft stays, and its next publish gets a new number. Answers the version that is published after the call
 * (null: none). The audit log gets what was done, never the text.
 */
export const saveLegal = onCall(async (req) => {
  const c = await requireSuper(req);
  const doc = req.data?.doc;
  if (!isLegalDoc(doc)) throw refuse("legal-doc", "The document is 'privacy' or 'terms'.");
  const publish = req.data?.publish === true, unpublish = req.data?.unpublish === true;
  if (publish && unpublish) throw refuse("legal-doc", "Publish or unpublish, not both.");
  const sent = unpublish ? {} : validateText(req.data?.text);
  if (!sent) throw refuse("legal-text", "Each language's text is plain text of at most 60,000 characters.");

  const at = Date.now();
  const done = await db.runTransaction(async (tx) => {
    const cfg = await tx.get(db.doc(CONFIG)), live = await tx.get(db.doc(LIVE));
    const all = (cfg.data() ?? {}) as Record<string, unknown>;
    const entry = (all[doc] ?? {}) as LegalEntry;
    const stamp = { updatedAt: FieldValue.serverTimestamp(), updatedBy: c.uid };
    // Whole documents are written back, inside the transaction: a merge would keep a language the admin removed.
    if (unpublish) {
      const { published, ...rest } = entry;
      tx.set(db.doc(CONFIG), { ...all, [doc]: { ...rest, lastVersion: nextVersion(entry) - 1 }, ...stamp });
      const { [doc]: _gone, ...others } = (live.data() ?? {}) as Record<string, unknown>;
      tx.set(db.doc(LIVE), others);
      return { version: null, was: published?.version ?? null };
    }
    const draft = mergeDraft(entry.draft, sent);
    if (!draft) throw refuse("legal-text", "The languages together are too long.");
    if (!publish) {
      tx.set(db.doc(CONFIG), { ...all, [doc]: { ...entry, draft }, ...stamp });
      return { version: entry.published?.version ?? null, was: null };
    }
    const text = publishable(draft);
    if (!text) throw refuse("legal-text", "Write the English text before publishing.");
    const version = nextVersion(entry);
    tx.set(db.doc(CONFIG), { ...all, [doc]: { ...entry, draft, published: { version, at, by: c.uid }, lastVersion: version }, ...stamp });
    tx.set(db.doc(LIVE), { ...(live.data() ?? {}), [doc]: { version, at, text } satisfies Published });
    // Every version ever published is kept word for word, and nothing here or in retention.ts deletes it: an
    // acceptance names a version number, which proves nothing once the text it named has been written over.
    tx.set(db.doc(versionPath(doc, version)), { doc, version, at, by: c.uid, text });
    return { version, was: entry.published?.version ?? null };
  });

  await audit("saveLegal", c.uid, { doc, publish, version: done.version, ...(unpublish ? { unpublish: true, was: done.was } : {}) });
  // The file last, from what Firestore holds now. If Storage refuses, what is published is already recorded and
  // audited, and publishing again writes the file (as a new version).
  if (publish || unpublish) {
    await writeLegalFile().catch((e: unknown) => {
      throw new HttpsError("internal", `Saved, but the public file could not be written. ${unpublish ? "Unpublish" : "Publish"} again.`, { reason: "legal-file", error: String(e) });
    });
  }
  return { version: done.version };
});

/**
 * A signed-in person accepts the published privacy notice and/or terms: {privacy?: version, terms?: version}. Each
 * version given must be the one published now (`legal-version`: the app reads content/legal.json again and asks
 * again). Recorded on their profile; a profile that doesn't exist yet (a sign-up whose app hasn't created it) is
 * never made here: the call still answers ok, with `recorded: false`, and the app calls again once it has one.
 */
export const acceptTerms = onCall(async (req) => {
  const c = caller(req);
  const live = await db.doc(LIVE).get();
  const accepted = acceptedVersions(req.data, { privacy: live.get("privacy.version"), terms: live.get("terms.version") });
  if (!accepted) throw new HttpsError("failed-precondition", "That is not the version published now.", { reason: "legal-version" });
  const ref = db.doc(`users/${c.uid}`);
  if (!(await ref.get()).exists) return { ok: true, recorded: false };
  const fields: Record<string, unknown> = { "terms.at": FieldValue.serverTimestamp() };
  for (const [doc, version] of Object.entries(accepted)) fields[`terms.${doc}`] = version;
  // update, not set with merge: it changes only these fields of an existing profile, and fails (NOT_FOUND, 5) rather
  // than create one if the account was deleted between the read and this write.
  try { await ref.update(fields); }
  catch (e) { if ((e as { code?: number }).code === 5) return { ok: true, recorded: false }; throw e; }
  return { ok: true, recorded: true };
});
