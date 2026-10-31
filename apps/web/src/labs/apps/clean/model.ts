/**
 * Cleaning data: a class of 8 and a week of attendance (40 records), typed by two teachers into one sheet. Names are
 * spelled several ways, three records were typed twice, four answers were left blank, and a pupil from another class
 * signed in once. Each fix is a choice, and each choice changes the counts:
 * - names: as typed; tidied (spaces, capitals); or matched to the class list (also Arabic letter forms such as أ/ا,
 *   ة/ه and ى/ي, then the closest name within a small spelling distance; names not on the list are set aside);
 * - repeats: kept, or removed (the same pupil on the same day), which only works once the names agree;
 * - blank answers: left out of the rate, or counted as absent, or as present.
 */
export type Lang = "en" | "ar";
export interface Raw { name: string; day: number; present: boolean | null }
export type NameFix = 0 | 1 | 2;
export type Blank = "leave" | "absent" | "present";
export interface Opts { names: NameFix; repeats: boolean; blank: Blank }

/** The class list, and the ways each name gets typed (index 0 is the right spelling). */
export const VARIANTS: Record<Lang, string[][]> = {
  en: [["Amina", "amina ", "Aminah"], ["Tunde", "TUNDE"], ["Chidi", " Chidi"], ["Fatima", "Fatimah", "fatima"], ["Kofi", "Kofi  "], ["Grace", "grace"], ["Musa", "Moussa"], ["Zainab", "Zainab ", "Zaynab"]],
  ar: [["أمينة", "أمينة ", "امينه"], ["عمر", " عمر"], ["ليلى", "ليلي"], ["فاطمة", "فاطمه", "فاطمة  "], ["يوسف", "يوسف "], ["مريم", "مريمم"], ["مصطفى", "مصطفي"], ["عبد الله", "عبدالله", "عبد  الله"]],
};
/** Someone from another class who signed this sheet once. */
const STRANGER: Record<Lang, string> = { en: "Ngozi", ar: "سعاد" };
export const classList = (lang: Lang) => VARIANTS[lang].map((v) => v[0]);
export const DAYS = 5;

/** Who was really away: [pupil, day]. 6 of 40, so the true attendance is 34 of 40 (85%). */
const AWAY: [number, number][] = [[1, 2], [4, 3], [4, 4], [5, 5], [6, 1], [7, 3]];
/** Which spelling each pupil got on each day. */
const TYPED = [[0, 0, 1, 2, 0], [0, 1, 0, 0, 1], [0, 0, 1, 0, 0], [0, 1, 0, 2, 0], [0, 0, 0, 1, 0], [0, 1, 0, 0, 1], [1, 0, 0, 0, 0], [0, 2, 1, 0, 0]];
/** Answers left blank: [pupil, day] (two of them were really away). */
const BLANK: [number, number][] = [[1, 2], [4, 4], [7, 1], [5, 3]];
/** Typed twice: [pupil, day, spelling]. Only the second is an exact copy; the others differ in spelling. */
const TWICE: [number, number, number][] = [[0, 3, 0], [2, 4, 0], [3, 1, 1]];

export const TRUE_PRESENT = DAYS * 8 - AWAY.length;
export const TRUE_RATE = TRUE_PRESENT / (DAYS * 8);

export function register(lang: Lang): Raw[] {
  const v = VARIANTS[lang], out: Raw[] = [];
  const truth = (p: number, d: number) => !AWAY.some(([a, b]) => a === p && b === d);
  for (let d = 1; d <= DAYS; d++) {
    for (let p = 0; p < v.length; p++) {
      out.push({ name: v[p][TYPED[p][d - 1]], day: d, present: BLANK.some(([a, b]) => a === p && b === d) ? null : truth(p, d) });
      for (const [a, b, sp] of TWICE) if (a === p && b === d) out.push({ name: v[p][sp], day: d, present: truth(p, d) });
    }
    if (d === 3) out.push({ name: STRANGER[lang], day: d, present: true });
  }
  return out;
}

/** Spaces and capitals: trim, one space between words, lower case (and no Arabic stretching mark). */
export const tidy = (s: string) => s.replace(/ـ/g, "").trim().replace(/\s+/g, " ").toLowerCase();
/** For matching only: also one form per Arabic letter that is often typed several ways, and no spaces at all. */
export const fold = (s: string) => tidy(s).replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s/g, "");

export function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
/** The class-list name a typed name means, or null when none is close (at most one change per three letters). */
export function match(name: string, list: string[]): string | null {
  const f = fold(name);
  let best: string | null = null, bestD = Infinity;
  for (const n of list) { const d = distance(f, fold(n)); if (d < bestD) { bestD = d; best = n; } }
  return bestD <= Math.max(1, Math.floor(f.length / 3)) ? best : null;
}

export type Status = "kept" | "renamed" | "repeat" | "aside";
export interface Row { raw: Raw; name: string; key: string; status: Status; value: boolean | null }

export function clean(rows: Raw[], list: string[], o: Opts) {
  // 1. Names. Tidied names show their most common spelling.
  const keyed = rows.map((raw) => {
    if (o.names === 0) return { raw, key: raw.name, name: raw.name };
    if (o.names === 1) return { raw, key: tidy(raw.name), name: "" };
    const m = match(raw.name, list);
    return { raw, key: m ?? `?${tidy(raw.name)}`, name: m ?? raw.name.trim(), aside: m === null };
  });
  if (o.names === 1) {
    const spell = new Map<string, Map<string, number>>();
    for (const k of keyed) { const m = spell.get(k.key) ?? new Map<string, number>(); const t = k.raw.name.trim().replace(/\s+/g, " "); m.set(t, (m.get(t) ?? 0) + 1); spell.set(k.key, m); }
    for (const k of keyed) k.name = [...spell.get(k.key)!].sort((a, b) => b[1] - a[1])[0][0];
  }
  // 2. Repeats: the same pupil on the same day; keep the first copy that has an answer.
  const keep = new Map<string, number>();
  if (o.repeats) keyed.forEach((k, i) => {
    if ("aside" in k && k.aside) return;
    const id = `${k.key}|${k.raw.day}`, j = keep.get(id);
    if (j === undefined || (keyed[j].raw.present === null && k.raw.present !== null)) keep.set(id, i);
  });
  const out: Row[] = keyed.map((k, i) => {
    const aside = "aside" in k && !!k.aside;
    const repeat = !aside && o.repeats && keep.get(`${k.key}|${k.raw.day}`) !== i;
    const value = k.raw.present ?? (o.blank === "absent" ? false : o.blank === "present" ? true : null);
    return { raw: k.raw, name: k.name, key: k.key, status: aside ? "aside" : repeat ? "repeat" : k.name !== k.raw.name ? "renamed" : "kept", value };
  });
  // 3. Counts over the rows that stay.
  const kept = out.filter((r) => r.status === "kept" || r.status === "renamed");
  const answered = kept.filter((r) => r.value !== null);
  const pupils = new Map<string, { name: string; rows: number; present: number }>();
  for (const r of kept) { const p = pupils.get(r.key) ?? { name: r.name, rows: 0, present: 0 }; p.rows++; if (r.value) p.present++; pupils.set(r.key, p); }
  return {
    rows: out,
    kept: kept.length,
    pupils: [...pupils.values()],
    repeats: out.filter((r) => r.status === "repeat").length,
    aside: out.filter((r) => r.status === "aside").length,
    blank: kept.filter((r) => r.raw.present === null).length,
    present: answered.filter((r) => r.value).length,
    rate: answered.length ? answered.filter((r) => r.value).length / answered.length : 0,
  };
}
