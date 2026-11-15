// Types for data.mjs (vite.config.ts and tests/site.test.ts import it). The page writers take the result as a whole.
export interface SiteData { units: unknown[]; tracks: { id: string }[]; from: string; [k: string]: unknown }
export interface LoadOptions { source?: "live" | "repo" | (string & {}); strict?: boolean; cache?: string; log?: (message: string) => void }
export function loadSiteData(opts?: LoadOptions): Promise<SiteData>;
export function publicEntries(catalog: unknown): { id: string; version?: number }[];
