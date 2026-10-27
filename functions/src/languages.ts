/**
 * Languages platform admins add (/super/languages). Drafts live in Firestore translations/{code}, written by the
 * Languages page; these functions alone put a language in front of learners: an immutable pack
 * content/i18n/{code}/v{n}.json, and its entry in config/settings and content/settings.json.
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { audit, caller, db, str } from "./admin.js";
import { staleVersions } from "./catalog.js";
import { SETTINGS, writeSettingsFile } from "./settings.js";
import { bucket } from "./storage.js";
import { LANG_CODE, validateLanguage } from "./shared/languages.js";
import type { LanguageDef } from "./shared/types.js";

export const packPrefix = (code: string) => `content/i18n/${code}/`;
export const packPath = (code: string, version: number) => `${packPrefix(code)}v${version}.json`;

/** The settings entry for a language: what pickers need, and which pack to fetch. */
export const languageEntry = (d: Partial<LanguageDef>, version: number): LanguageDef =>
  ({ code: String(d.code), native: String(d.native).trim(), english: String(d.english).trim(), dir: d.dir === "rtl" ? "rtl" : "ltr", numerals: String(d.numerals).trim(), version });
/** The language list with one entry added or replaced (by code), or removed when `entry` is null. */
export function withLanguage(list: readonly LanguageDef[] | undefined, code: string, entry: LanguageDef | null): LanguageDef[] {
  const rest = (list ?? []).filter((l) => l.code !== code);
  return entry ? [...rest, entry] : rest;
}

function platformAdmin(req: CallableRequest) {
  const c = caller(req);
  if (c.role !== "superadmin") throw new HttpsError("permission-denied", "Only platform admins can publish languages.");
  const code = str(req.data?.code, 20);
  if (!LANG_CODE.test(code)) throw new HttpsError("invalid-argument", "Not a language code.");
  return { c, code };
}

/** Checks the saved draft, writes content/i18n/{code}/v{n+1}.json, and lists the language for everyone. */
export const publishLanguage = onCall(async (req) => {
  const { c, code } = platformAdmin(req);
  const ref = db.doc(`translations/${code}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Save the language first.");
  const d = snap.data() as Partial<LanguageDef> & { messages?: Record<string, string>; rev?: number; published?: { version?: number } | null };
  const problems = validateLanguage({ ...d, code }, d.messages);
  if (problems.length) throw new HttpsError("invalid-argument", "The language has problems.", { problems });

  const version = (Number(d.published?.version) || 0) + 1;
  await bucket().file(packPath(code, version)).save(JSON.stringify({ code, version, messages: d.messages }), {
    resumable: false, contentType: "application/json; charset=utf-8",
    metadata: { cacheControl: "public, max-age=31536000, immutable" },
  });
  const entry = languageEntry({ ...d, code }, version);
  const languages = await db.runTransaction(async (tx) => {
    const s = await tx.get(db.doc(SETTINGS));
    const list = withLanguage(s.get("languages") as LanguageDef[] | undefined, code, entry);
    tx.set(db.doc(SETTINGS), { languages: list }, { merge: true });
    return list;
  });
  await ref.update({ published: { version, rev: Number(d.rev) || 0, at: FieldValue.serverTimestamp(), by: c.uid } });
  await writeSettingsFile();
  // Keep this version and the one before (a phone that read the old settings can still fetch it); drop older ones.
  const [files] = await bucket().getFiles({ prefix: packPrefix(code) });
  await Promise.all(staleVersions(files.map((f) => f.name), version).map((name) => bucket().file(name).delete({ ignoreNotFound: true })));
  await audit("publishLanguage", c.uid, { code, version, keys: Object.keys(d.messages ?? {}).length });
  return { version, languages };
});

/** Takes a language off the pickers. People who chose it see English; the draft stays, to publish again later. */
export const unpublishLanguage = onCall(async (req) => {
  const { c, code } = platformAdmin(req);
  const languages = await db.runTransaction(async (tx) => {
    const s = await tx.get(db.doc(SETTINGS));
    const list = withLanguage(s.get("languages") as LanguageDef[] | undefined, code, null);
    tx.set(db.doc(SETTINGS), { languages: list }, { merge: true });
    return list;
  });
  const ref = db.doc(`translations/${code}`);
  if ((await ref.get()).exists) await ref.update({ published: null });
  await writeSettingsFile();
  const [files] = await bucket().getFiles({ prefix: packPrefix(code) });
  await Promise.all(files.map((f) => f.delete({ ignoreNotFound: true })));
  await audit("unpublishLanguage", c.uid, { code });
  return { ok: true, languages };
});
