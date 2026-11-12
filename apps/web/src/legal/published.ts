/**
 * What is published of the privacy notice and the terms of use: content/legal.json in Storage, written by a platform
 * admin's publish (functions/src/legal.ts) as
 * {v: 1, privacy: {version, at (ISO), text: {en, ar, …}} | null, terms: {…} | null}. No file (404) is nothing published.
 * - Startup-safe: a plain fetch, so guests never load Firebase, and nothing here imports content/load (a module shared
 *   with lazy chunks; Landing and the legal pages read this without pulling it in).
 * - Read once per page load, when the first screen that shows a link asks (Me, sign-up, the home page, the pages
 *   themselves). No Cache Storage and no retries: offline, there are simply no links. Only a read that never got an
 *   answer (no connection) is tried again by the next screen that asks, so someone who opened the app offline and
 *   signs up later is still shown what they agree to.
 * - Until the file answers nothing is published: no link, no checkbox, and no room kept for them.
 */
import { useEffect, useSyncExternalStore } from "react";
import { firebaseConfig, firebaseReady, useEmulators } from "../firebase-config";

export type LegalDoc = "privacy" | "terms";
export const LEGAL_DOCS: readonly LegalDoc[] = ["privacy", "terms"];
/** The versions someone agrees to: what acceptTerms takes. */
export type LegalVersions = Partial<Record<LegalDoc, number>>;

export interface Legal {
  /** The published version of each document, or null while it isn't published (or the file hasn't answered). */
  privacy: number | null;
  terms: number | null;
  /** The text for a reader: in their language, else in English, else in whichever language it was published. */
  text(doc: LegalDoc, lang: string): string | null;
  /** The language text() answers in (the page marks it for screen readers). */
  shown(doc: LegalDoc, lang: string): string | null;
  /** When the published version was published (ISO), if the file says. */
  at(doc: LegalDoc): string | null;
  /** The file has answered (or can't be asked): "not published" is known, not just not yet read. */
  ready: boolean;
}

interface Published { version: number; at: string | null; text: Record<string, string> }
type LegalFile = Record<LegalDoc, Published | null>;
const NONE: LegalFile = { privacy: null, terms: null };

/** One document as the file gives it; anything else (missing, not published, a shape this app doesn't know) is null. */
function one(p: unknown): Published | null {
  const v = p as { version?: unknown; at?: unknown; text?: unknown } | null;
  if (!v || typeof v !== "object" || typeof v.version !== "number" || !Number.isInteger(v.version) || v.version < 1 || !v.text || typeof v.text !== "object") return null;
  const text: Record<string, string> = {};
  for (const [lang, s] of Object.entries(v.text as Record<string, unknown>)) if (typeof s === "string" && s.trim()) text[lang] = s;
  if (!Object.keys(text).length) return null;
  return { version: v.version, at: typeof v.at === "string" && !Number.isNaN(Date.parse(v.at)) ? v.at : null, text };
}
const parse = (j: unknown): LegalFile => {
  const f = (j && typeof j === "object" ? j : {}) as Record<string, unknown>;
  return { privacy: one(f.privacy), terms: one(f.terms) };
};

// By its own text, never `lang in`: a code such as "constructor" would find Object's and show that.
const langOf = (p: Published | null, lang: string) => (!p ? null : typeof p.text[lang] === "string" ? lang : typeof p.text.en === "string" ? "en" : Object.keys(p.text)[0] ?? null);
const view = (file: LegalFile, ready: boolean): Legal => ({
  privacy: file.privacy?.version ?? null,
  terms: file.terms?.version ?? null,
  text: (doc, lang) => { const l = langOf(file[doc], lang); return l === null ? null : file[doc]!.text[l]; },
  shown: (doc, lang) => langOf(file[doc], lang),
  at: (doc) => file[doc]?.at ?? null,
  ready,
});

/**
 * The file's public address: the Storage REST address (the emulator's on port 9199), by the same formula as
 * content/load.ts storageUrl. Null without a Firebase project (the app then runs for guests only).
 */
const FILE = "content/legal.json";
const address = () => (!firebaseReady || !firebaseConfig.storageBucket ? null
  : `${useEmulators ? `http://${typeof location !== "undefined" ? location.hostname : "localhost"}:9199` : "https://firebasestorage.googleapis.com"}/v0/b/${firebaseConfig.storageBucket}/o/${encodeURIComponent(FILE)}?alt=media`);

let now: Legal = view(NONE, false);
let reading = false;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const publish = (file: LegalFile) => { now = view(file, true); listeners.forEach((l) => l()); };
/**
 * Unit tests read nothing until one asks (resetLegal): a machine's .env.local reaches vitest too, and the tests of
 * every screen that shows these links must neither call the live project nor change with what is published there.
 */
let off = import.meta.env.MODE === "test";

function read() {
  if (reading) return;
  reading = true;
  const url = off ? null : address();
  if (!url) { if (!now.ready) publish(NONE); return; }
  fetch(url, { credentials: "omit" }).then(
    // Any answer settles it for this page load: 404 is "nothing published", and so is a file this app can't read.
    async (r) => publish(r.ok ? parse(await r.json().catch(() => null)) : NONE),
    // No answer at all: nothing to show now, and the next screen that asks reads again.
    () => { reading = false; if (!now.ready) publish(NONE); },
  );
}

/** What is published, read when the first screen asks. Every screen re-renders once, when the file answers. */
export function useLegal(): Legal {
  useEffect(read, []);
  return useSyncExternalStore(subscribe, () => now);
}
/**
 * Reads the file again, once: acceptTerms answered "legal-version" (a newer version was published since this page read
 * it). What is shown stays until the answer; a read already on its way is not doubled.
 */
let refreshing = false;
export function refreshLegal() {
  // The first read still on its way brings the new file anyway; tests and pages without a project read nothing.
  const url = off ? null : address();
  if (!now.ready || refreshing || !url) return;
  refreshing = true;
  fetch(url, { credentials: "omit" })
    .then(async (r) => { if (r.ok) publish(parse(await r.json().catch(() => null))); else if (r.status === 404) publish(NONE); }, () => {})
    .finally(() => { refreshing = false; });
}
/** The versions published now, as acceptTerms takes them; null when nothing is. */
export const publishedVersions = (legal: Legal): LegalVersions | null => {
  const v: LegalVersions = {};
  for (const doc of LEGAL_DOCS) { const n = legal[doc]; if (n !== null) v[doc] = n; }
  return Object.keys(v).length ? v : null;
};

/** For tests: forget what was read, and read the file (their stubbed fetch) from now on, or not (`readFile` false). */
export function resetLegal(readFile = true) {
  off = !readFile;
  reading = false; refreshing = false;
  now = view(NONE, false);
  listeners.forEach((l) => l());
}
