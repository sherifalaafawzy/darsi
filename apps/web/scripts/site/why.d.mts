// Types for why.mjs (tests/site.test.ts imports it).
type L = { en: string; ar: string };
export const SOURCES: Record<string, { label: string; url: string }>;
export const NEEDS: { id: string; h3: L; items: { value: L; text: L; src: string[] }[] }[];
export const ANSWERS: { id: string; h3: L; p: L }[];
export const WHY_KEYS: string[];
