// Types for course.mjs (tests/site.test.ts imports it).
import type { SiteData } from "./data.mjs";

export interface CourseModel { id: string; capstone: boolean; competencies: string[]; lessons: { kinds: Map<string, number>; kit: unknown[] }[]; [k: string]: unknown }
export function courseModel(unit: unknown, data: SiteData): CourseModel;
