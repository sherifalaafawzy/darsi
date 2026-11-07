// Types for isolates.mjs (inline code in Arabic course text, kept in left-to-right isolates).
export const LRI: string;
export const PDI: string;
/** The pieces of code in an Arabic string that need an isolate, as [start, end) offsets. */
export function codePieces(text: string): [number, number][];
/** The string with each piece of code isolated. */
export function isolateCode(text: string): string;
/** The string isolated again with the current rules, mending older isolates and keeping hand-placed ones. */
export function reisolate(text: string): string;
/** The string without its left-to-right isolates (hand-placed U+2067/U+2068 ones stay). */
export function stripIsolates(text: string): string;
/** True when every isolate opener has its PDI and no PDI is left over. */
export function isolatesPair(text: string): boolean;
/** The isolates that hold a line break (none should: a line break ends every isolate on screen), as their text. */
export function isolatesOverLines(text: string): string[];
/** Every string in a unit's (or a course pack's: pass `root`) Arabic fields, with its path: [path, text, set(newText)]. */
export function arabicStrings(unit: unknown, root?: string): [string, string, (text: string) => void][];
