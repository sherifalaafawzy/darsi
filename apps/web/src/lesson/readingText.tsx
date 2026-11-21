/**
 * Course text as it was written: a reading's paragraphs (StepView ReadingBody) and a capstone's set-up tabs
 * (CapstoneParts SetupBody can use it too).
 *
 * - A single line break inside a paragraph stays a line break: capstone set-ups put each click and each command on its
 *   own line, and a <p> would run them together ("python -m venv .venv .venv\Scripts\activate pip install …").
 * - On a right-to-left page, a line that is left to right outside its isolates (a bare command or path, "Windows:")
 *   is laid out left to right, so ".venv\Scripts\activate" doesn't show as "venv\Scripts\activate." and "Windows:" as
 *   ":Windows". A line with Arabic, or whose Latin is already isolated (scripts/lib/isolates.mjs), keeps the page's flow,
 *   so a list number stays on its right.
 * - https:// addresses are links, without the punctuation after them. Example addresses ("https://github.com/YOU/…",
 *   "…/<your-username>/…") stay text: "you" is a real GitHub account.
 * Isolates and direction marks stay in the text (they order mixed Arabic and Latin), and out of the links.
 */
import { Fragment, type ReactNode } from "react";
import { figureOf } from "../content/figure";

/** Hebrew and Arabic script letters and digits: a line with any of these belongs to the right-to-left flow. */
const RTL_CHAR = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/;
const LETTER = /\p{L}/u;
/** An isolated run (LRI, RLI or FSI to its PDI, or to the end of the line), laid out as one unit by the bidi algorithm. */
const ISOLATED = /[\u2066-\u2068][^\u2069]*(?:\u2069|$)/g;
/** A line whose letters outside isolates are all in left-to-right scripts. */
export const latinLine = (line: string) => { const bare = line.replace(ISOLATED, ""); return LETTER.test(bare) && !RTL_CHAR.test(bare); };

const STOP = "\\s\\u200E\\u200F\\u202A-\\u202E\\u2066-\\u2069<>\"";
/** An https address, ending before trailing punctuation: "(https://git-scm.com)," links https://git-scm.com. */
const URL_RE = new RegExp(`https://[^${STOP}]*[^${STOP}.,;:!?)\\]،]`, "g");
/** A placeholder in an example address: a "you" or "your-…" path part, or a "<…>" or "{…}" right after it. */
const example = (url: string, next: string) => next === "<" || next === "{" || /\/(?:you|your[-_][^/]*)(?:\/|$)/i.test(url);

/** Text with its https:// addresses as links (new tab, left to right). */
export function linked(text: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0], at = m.index ?? 0;
    if (example(url, text[at + url.length] ?? "")) continue;
    if (at > last) out.push(text.slice(last, at));
    out.push(<a key={at} href={url} target="_blank" rel="noopener noreferrer" dir="ltr">{url}</a>);
    last = at + url.length;
  }
  if (!out.length) return text;
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** One paragraph's content: its lines (kept apart with <br>), each linked, bare left-to-right lines isolated as such. */
export function paraLines(para: string): ReactNode {
  const lines = para.replace(/^\n+|\n+$/g, "").split("\n");
  if (lines.length === 1) return linked(lines[0]);
  return lines.map((line, i) => <Fragment key={i}>{i > 0 && <br />}{latinLine(line) ? <bdi dir="ltr">{linked(line)}</bdi> : linked(line)}</Fragment>);
}

/** Where a sentence ends: its stop, any closing quotes or brackets, then a space. */
const SENTENCE_END = /[.!?؟…]["'”’»)\]]*(?=\s)/y;
/**
 * A video's transcript as paragraphs, the low-data way to follow the video: at its blank lines when it has them,
 * otherwise a new paragraph every `per` sentences, so it isn't one 500-word block. Never inside an isolate (LRI … PDI).
 */
export function transcriptParas(text: string, per = 3): string[] {
  const all = text.trim();
  if (!all) return [];
  if (/\n\s*\n/.test(all)) return all.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const out: string[] = [];
  let depth = 0, start = 0, count = 0;
  for (let i = 0; i < all.length; i++) {
    const c = all[i];
    if (c >= "\u2066" && c <= "\u2068") { depth++; continue; }
    if (c === "\u2069") { depth = Math.max(0, depth - 1); continue; }
    if (depth) continue;
    SENTENCE_END.lastIndex = i;
    const m = SENTENCE_END.exec(all);
    if (!m) continue;
    i += m[0].length - 1;
    if (++count < per) continue;
    out.push(all.slice(start, i + 1).trim());
    start = i + 1; count = 0;
  }
  const rest = all.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/** Paragraphs at blank lines, screenshots as figures (`.reading-fig`, lesson.css; which pictures: content/figure.ts). */
export function ReadingParagraphs({ text, paragraph = (content, key) => <p key={key}>{content}</p> }: { text: string; paragraph?: (content: ReactNode, key: number) => ReactNode }) {
  return <>{text.split(/\n\s*\n/).map((para, i) => {
    const cleaned = para.trim().replace(/[\u2066-\u2069\u202A-\u202E]/g, "");
    if (!cleaned) return null;
    const fig = figureOf(para);
    if (fig) return <figure key={i} className="reading-fig"><img src={fig.src} alt={fig.alt} loading="lazy" /><figcaption>{fig.alt}</figcaption></figure>;
    return paragraph(paraLines(para), i);
  })}</>;
}
