// Types for bundle.mjs (the web app's tests import it).
export const KB: number;
export interface SizedFile { file: string; bytes: number; gzip: number }
export interface Startup { entry: string; files: SizedFile[]; gzip: number; css: SizedFile[]; scripts: SizedFile[] }
export interface Budget { maxFiles: number; maxGzipKB: number }
export function staticImports(code: string, file: string): string[];
export function startup(dir: string): Startup;
export function precached(dir: string): string[];
export function lazyScreens(viteConfig: string): string[];
export function onDemandPatterns(screens: string[]): { what: string; re: RegExp }[];
export function checkBundle(dir: string, budget: Budget, opts?: { screens?: string[]; has?: string }): { startup: Startup; kb: number; precache: string[]; problems: string[] };
