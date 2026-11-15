// Types for build-kits.mjs (tests/kits.test.ts imports it).
import type { Lesson, Step, Unit } from "../src/content/types";

/** The questions a lesson's sheet prints: every one in a unit check, the first five in a lesson, never a program to write that a printed bug question shows. */
export function printedSteps(lesson: Lesson): Step[];
/** The order to print n items in (indexes into the authored list), the same every build and in every language. */
export function printOrder(n: number, seed: string, scramble?: boolean): number[];
/** The lesson plan PDF's HTML: the plan, the sheet of questions and the answers, each a `section.page[data-part]`. */
export function planHtml(unit: Unit, lesson: Lesson, lang: string): string;
/** The first sentence of an explanation, with the next ones while it is under `min` characters (the answers page prints it). */
export function firstSentence(text: string, min?: number): string;
/** A university course pack's HTML. */
export function packHtml(unit: Unit, pack: unknown, lang: string): string;
/** How many pages a PDF has. */
export function pdfPages(pdf: Uint8Array | string): number;
/** A unit file's text with `pages` set on the kit items with these bases, and what changed. */
export function withPages(text: string, counts: Map<string, number> | Record<string, number>): { text: string; changed: string[] };
