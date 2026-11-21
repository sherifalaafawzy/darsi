// Types for features.mjs (tests/site.test.ts imports it).
import type { SiteData } from "./data.mjs";
import type { PageText } from "./build.mjs";

export const FEATURE_KEYS: string[];
export function featurePage(key: string, lang: "en" | "ar", data: SiteData, models: unknown[]): PageText;
export function facts(data: SiteData, models: unknown[], lang: "en" | "ar"): Record<string, string> & { raw: Record<string, number> };
