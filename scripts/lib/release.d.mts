// Types for release.mjs (the web app's tests import it).
export type Parsed =
  | { error: string }
  | { error?: undefined; targets: string[]; yes: boolean; rules: boolean; e2e: boolean; skipRulesTests: boolean };
export function parseArgs(argv: string[]): Parsed;
export function hasHosting(targets: string[]): boolean;
export function hasFunctions(targets: string[]): boolean;
export function hasRules(targets: string[]): boolean;
export function refusals(state: { changed: string[]; targets: string[]; project: string; exists: (path: string) => boolean; hosting?: { sites: string[]; mapped: string[] } }): string[];
/** firebase.json's Hosting sites by target, and the ones .firebaserc maps for a project. */
export function hostingTargets(firebaseJson: Record<string, unknown>, firebaserc: Record<string, unknown>, project: string): { sites: string[]; mapped: string[] };
export function plan(targets: string[]): string[];
export function firebaseCommand(only: string, project: string, config: string): string;
export function isFunctionsStep(only: string): boolean;
/** What the Firebase CLI refused or left out without --force, read from a functions step's output. */
export function unforced(output: string): { skipped: boolean; refused: boolean; names: string[] };
export function forceCommand(names: string[], project: string): string;
export function deployConfig<T extends Record<string, unknown>>(firebaseJson: T): T;
export function ymd(d: Date): string;
export function buildStamp(shortCommit: string, d: Date): string;
export function tagName(d: Date, existing: string[]): string;
