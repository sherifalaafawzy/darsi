import fs from "node:fs";
import path from "node:path";
import { CATEGORIES } from "../../src/labs/categories";
import { LAB_METAS, LADDER, labMeta, nextLab } from "../../src/labs/catalog";
import { LAB_ID } from "../../src/content/validate";
import ai1 from "../../../../content/retired/ai-1.json";

const APPS = path.join(__dirname, "../../src/labs/apps");

describe("Labs catalogue", () => {
  it("has one valid card per app folder, with the folder's name as id", () => {
    const folders = fs.readdirSync(APPS).filter((f) => fs.statSync(path.join(APPS, f)).isDirectory()).sort();
    expect(LAB_METAS.map((m) => m.id).sort()).toEqual(folders);
    for (const f of folders) expect(fs.existsSync(path.join(APPS, f, "index.tsx")), `${f}/index.tsx`).toBe(true);
  });

  it("writes every card in English and Arabic, on a known shelf, with a valid id and level", () => {
    const shelves = new Set(CATEGORIES.map((c) => c.id));
    for (const m of LAB_METAS) {
      expect(LAB_ID.test(m.id), m.id).toBe(true);
      expect(shelves.has(m.category), m.id).toBe(true);
      expect([1, 2, 3]).toContain(m.level);
      for (const t of [m.title, m.summary]) { expect(t.en.trim(), m.id).not.toBe(""); expect(t.ar.trim(), m.id).not.toBe(""); expect(t.ar).not.toContain("·"); }
    }
  });

  it("keeps the labs used by existing lessons", () => {
    const unit = ai1 as unknown as { lessons: { steps: { type: string; tool?: string }[] }[] };
    const used = unit.lessons.flatMap((l) => l.steps).filter((s) => s.type === "lab").map((s) => s.tool!);
    expect(used.length).toBeGreaterThan(0);
    for (const id of used) expect(labMeta(id), id).toBeTruthy();
  });

  it("numbers the AI ladder without gaps in order and without duplicates", () => {
    const rungs = LADDER.map((m) => m.ladder);
    expect(new Set(rungs).size).toBe(rungs.length);
    expect([...rungs].sort((a, b) => a! - b!)).toEqual(rungs);
    expect(LADDER[0].id).toBe("neuron");
    expect(nextLab("neuron")?.ladder).toBeGreaterThan(1);
  });
});
