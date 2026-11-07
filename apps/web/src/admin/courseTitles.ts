/**
 * Every course Darsi has had, by id, published or not (courseTitles.json, written by apps/web/scripts/course-titles.mjs
 * from content/units and content/retired). The catalog lists only published courses, so a learner's results in a
 * course unpublished since would otherwise show its raw id. Staff chunks only: never import this from startup code.
 */
import type { CatalogEntry, LocalText } from "../content/types";
import titles from "./courseTitles.json";

export interface KnownCourse { title: LocalText; track: string; level: number }
const KNOWN = titles as Record<string, KnownCourse>;

/** A course from the course sources, or undefined (an org's own course, or one made in the editor). */
export const knownCourse = (id: string): KnownCourse | undefined => (Object.prototype.hasOwnProperty.call(KNOWN, id) ? KNOWN[id] : undefined);

/**
 * A course's title: the published catalog's, else the course sources', else its id. `gone` when it isn't published
 * now (the screens add "no longer offered").
 */
export function courseTitle(id: string, catalog: Pick<CatalogEntry, "id" | "title">[] | undefined, L: (x: LocalText | undefined) => string): { text: string; gone: boolean; known: boolean } {
  const live = catalog?.find((u) => u.id === id);
  if (live) return { text: L(live.title), gone: false, known: true };
  const k = knownCourse(id);
  return { text: k ? L(k.title) : id, gone: !!catalog, known: !!k };
}
