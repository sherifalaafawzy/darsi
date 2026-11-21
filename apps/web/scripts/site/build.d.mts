// Types for build.mjs (vite.config.ts and tests/site.test.ts import it).
import type { SiteData } from "./data.mjs";

export interface PageText { slug: string; lang: "en" | "ar"; title: string; description: string; h1?: string; kind: string; body: string; crumbs: { name: string; slug: string }[]; ld: unknown[] }
export interface Page { slug: string; en: PageText; ar: PageText }
export function makePages(data: SiteData): { pages: Page[]; models: { id: string }[] };
export function sitemap(pages: Page[]): string;
export function stylesheet(outDir: string): string;
export function buildSite(opts: { outDir: string; data: SiteData; log?: (message: string) => void }): Promise<{ pages: Page[]; models: { id: string }[]; css: string }>;
