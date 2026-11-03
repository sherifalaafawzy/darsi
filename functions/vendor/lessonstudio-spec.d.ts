// Types for lessonstudio-spec.js (Lesson Studio's scripts/darsi/vendor-spec.mjs): only what Darsi's functions use.
export interface Issue { code: string; path: string; detail?: string }
export interface Report { ok: boolean; errors: Issue[]; warnings: Issue[] }
export interface TimingFile { version: "0.1"; lang: string; source: string; duration: number; scenes: { id: string; start: number; end: number; sentences: { text: string; start: number; end: number }[]; words: { w: string; s: number; e: number }[] }[] }
export function validatePackage(pkg: { manifest: unknown; scenes: unknown; timing: Record<string, TimingFile> }): Report;
export function estimateTiming(scenes: unknown[], lang: string, o?: Record<string, number>): TimingFile;
export const TEMPLATES: readonly string[];
export const ICONS: readonly string[];
