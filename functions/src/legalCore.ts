/**
 * The privacy notice and the terms of use, the pure part (legal.ts; TECHNICAL.md). The wording is the
 * owner's: nothing here writes, suggests or defaults any of it. This only checks what a platform admin typed, numbers
 * the published versions, and shapes the public file the app reads.
 */
export const LEGAL_DOCS = ["privacy", "terms"] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];
export const isLegalDoc = (v: unknown): v is LegalDoc => (LEGAL_DOCS as readonly unknown[]).includes(v);

/** A language code as the app's languages use them: "en", "ar", "fil", "pt-BR". */
export const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/;
/** One language's text, in characters. */
export const MAX_TEXT = 60_000;
/**
 * One document's languages together, in UTF-8 bytes: both documents' drafts share one Firestore document (1 MiB), and
 * so do both published copies, so each document gets well under half of it. About four languages at full length.
 */
export const MAX_BYTES = 400_000;

/** Language code -> plain text. */
export type Texts = Record<string, string>;
const bytes = (t: Texts) => Object.values(t).reduce((n, s) => n + Buffer.byteLength(s, "utf8"), 0);

/**
 * The texts an admin sent, checked: a map of language code to plain text of at most MAX_TEXT characters (line ends
 * made "\n"). Nothing sent is an empty map. Null for anything else: a wrong code, a value that isn't text, a text too long.
 */
export function validateText(v: unknown): Texts | null {
  if (v === undefined || v === null) return {};
  if (typeof v !== "object" || Array.isArray(v)) return null;
  const out: Texts = {};
  for (const [lang, text] of Object.entries(v as Record<string, unknown>)) {
    if (!LANG.test(lang) || typeof text !== "string" || text.length > MAX_TEXT) return null;
    out[lang] = text.replace(/\r\n?/g, "\n");
  }
  return out;
}

/**
 * The draft after a save: the languages sent replace the draft's, a language sent empty leaves it, and languages not
 * sent stay, so a screen that edits one language at a time never wipes the others. Null when the whole is too big.
 */
export function mergeDraft(draft: unknown, sent: Texts): Texts | null {
  const out: Texts = {};
  if (draft && typeof draft === "object") for (const [lang, text] of Object.entries(draft as Record<string, unknown>)) if (LANG.test(lang) && typeof text === "string") out[lang] = text;
  for (const [lang, text] of Object.entries(sent)) { if (text.trim()) out[lang] = text; else delete out[lang]; }
  return bytes(out) > MAX_BYTES ? null : out;
}

/**
 * What a draft publishes as: its languages that have any text, trimmed. Null without English, the text every other
 * language falls back to (the app shows English where a language has no translation).
 */
export function publishable(draft: Texts): Texts | null {
  const out: Texts = {};
  for (const [lang, text] of Object.entries(draft)) if (text.trim()) out[lang] = text.trim();
  return out.en ? out : null;
}

/** A document's entry in config/legal. `lastVersion` outlives an unpublish, so a version number is never used twice. */
export interface LegalEntry { draft?: Texts; published?: { version: number; at: number; by: string }; lastVersion?: number }
/** A document's published copy (config/legalPublished): what content/legal.json is written from. */
export interface Published { version: number; at: number; text: Texts }

/** The next version of a document: one more than any it ever had. */
export const nextVersion = (e: LegalEntry | undefined) => Math.max(Number(e?.published?.version) || 0, Number(e?.lastVersion) || 0) + 1;

export interface PublicLegal {
  v: 1;
  privacy: { version: number; at: string; text: Texts } | null;
  terms: { version: number; at: string; text: Texts } | null;
}
const isPublished = (p: unknown): p is Published => {
  const v = p as Published | null | undefined;
  return !!v && Number.isInteger(v.version) && v.version > 0 && typeof v.at === "number" && !!v.text && typeof v.text === "object" && typeof v.text.en === "string" && v.text.en !== "";
};
/** content/legal.json: each document's published version, date and texts, or null while it isn't published. */
export function publicFile(live: Partial<Record<LegalDoc, unknown>>): PublicLegal {
  const one = (p: unknown) => (isPublished(p) ? { version: p.version, at: new Date(p.at).toISOString(), text: p.text } : null);
  return { v: 1, privacy: one(live.privacy), terms: one(live.terms) };
}

/**
 * The versions a person says they accept, against the published ones: each given one must be exactly the version
 * published now (an older one means they read an old text; the app fetches the new one and asks again). Null when
 * none is given, one isn't a whole number, or one doesn't match.
 */
export function acceptedVersions(given: unknown, current: Partial<Record<LegalDoc, unknown>>): Partial<Record<LegalDoc, number>> | null {
  const g = (given && typeof given === "object" ? given : {}) as Record<string, unknown>;
  const out: Partial<Record<LegalDoc, number>> = {};
  for (const doc of LEGAL_DOCS) {
    const v = g[doc];
    if (v === undefined || v === null) continue;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v !== current[doc]) return null;
    out[doc] = v;
  }
  return Object.keys(out).length ? out : null;
}
