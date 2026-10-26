/**
 * The Labs catalogue: every app's card (labs/apps/<id>/meta.ts), found at build time, so adding an app never edits a
 * shared file. Static imports only: the course editor's lazy chunk imports this too, and a dynamic import in a module
 * shared with lazy chunks makes the bundler split the startup bundle. The apps themselves load through loader.tsx.
 */
import { CATEGORIES } from "./categories";
import type { LabMeta } from "./types";

const metas = import.meta.glob<{ meta: LabMeta }>("./apps/*/meta.ts", { eager: true });
const rank = (m: LabMeta) => CATEGORIES.findIndex((c) => c.id === m.category);

export const LAB_METAS: LabMeta[] = Object.values(metas).map((m) => m.meta).sort((a, b) => rank(a) - rank(b) || a.order - b.order || a.id.localeCompare(b.id));
export const labMeta = (id: string) => LAB_METAS.find((m) => m.id === id);
/** "The AI ladder": from one neuron to networks, language models and decision models. */
export const LADDER = LAB_METAS.filter((m) => m.ladder).sort((a, b) => a.ladder! - b.ladder!);
/** The lab after this one: next on the ladder, else next on its shelf. */
export function nextLab(id: string): LabMeta | undefined {
  const m = labMeta(id); if (!m) return undefined;
  if (m.ladder) { const i = LADDER.indexOf(m); if (LADDER[i + 1]) return LADDER[i + 1]; }
  const shelf = LAB_METAS.filter((x) => x.category === m.category);
  return shelf[shelf.indexOf(m) + 1];
}
