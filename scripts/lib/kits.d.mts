// Types for kits.mjs (the web app's tests and e2e suite import it).
import type { Unit } from "../../apps/web/src/content/types";

export const KIT_LANGS: string[];
export function kitFiles(unit: Unit, has?: (file: string) => boolean): { file: string; path: string; fmt: string }[];
export function mediaPaths(unit: Unit): string[];
export function mediaPathOf(unitId: string, local: string, hash: string): string;
export function withKitUrls(unit: Unit, urlOf: (path: string) => string, opts?: { has?: (file: string) => boolean; media?: Map<string, string> }): Unit;
export function contentTypeOf(fmt: string): string;
