// @vitest-environment node
// The deciding part of scripts/backfill-last-version.mjs (scripts/lib/unit-versions.mjs): which version counter a unit
// gets from what still records it. A published unit file is immutable and phones keep it for good, so a counter that
// is too low (a version number used twice) is the one thing it must never write. Nothing here touches a project.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { auditVersions, counterFor, fileVersion, needsFiles, orphans } from "../../../scripts/lib/unit-versions.mjs";

const repo = (path: string) => readFileSync(join(__dirname, "../../..", path), "utf8");

describe("a unit's version counter, from what still records it", () => {
  it("reads the version in a published file's name, as the functions do", () => {
    expect(fileVersion("content/units/ai-1-1/v4.json")).toBe(4);
    expect(fileVersion("orgs/o1/units/uabcdefgh/v12.json")).toBe(12);
    expect(fileVersion("content/units/ai-1-1/v4.json.bak")).toBeNaN();
    expect(fileVersion("content/catalog.json")).toBeNaN();
    // The same pattern as functions/src/catalog.ts versionOf.
    expect(repo("functions/src/catalog.ts")).toContain("/\\/v(\\d+)\\.json$/");
  });

  it("takes the highest publish the audit log holds for each owner's unit", () => {
    const m = auditVersions([
      { unitId: "ai-1-1", owner: "public", version: 1 }, { unitId: "ai-1-1", owner: "public", version: 4 }, { unitId: "ai-1-1", owner: "public", version: 3 },
      { unitId: "uabcdefgh", owner: "o1", version: 2 },
      { unitId: "ai-1-1", owner: "public", version: "9" }, { unitId: "ai-1-1", owner: "public", version: 2.5 }, { unitId: "ai-1-1", owner: "public" },
      { unitId: "x", version: 3 }, { owner: "public", version: 3 }, null, undefined,
    ]);
    expect([...m]).toEqual([["public/ai-1-1", 4], ["o1/uabcdefgh", 2]]);
  });

  it("a unit unpublished before the counter existed (nothing on it, no files) gets its last version from the audit log", () => {
    expect(counterFor({ lastVersion: undefined, publishedVersion: undefined, audited: 4, files: [] })).toBe(4);
    expect(needsFiles({ lastVersion: undefined, publishedVersion: undefined })).toBe(true);
  });

  it("takes the highest of the live version, the audit log and the files still there", () => {
    expect(counterFor({ publishedVersion: 3, audited: 2 })).toBe(3);
    expect(counterFor({ audited: 2, files: ["content/units/u/v5.json", "content/units/u/v4.json", "content/units/u/notes.txt"] })).toBe(5);
    expect(counterFor({ publishedVersion: 4, audited: 4 })).toBe(4); // a live unit is stamped too
    // Unpublished and published again before the counter existed: live at v1, its history at v4. The next publish must be v5.
    expect(counterFor({ publishedVersion: 1, audited: 4 })).toBe(4);
    expect(needsFiles({ publishedVersion: 1 })).toBe(false);
    expect(needsFiles({ publishedVersion: 4 })).toBe(false);
    expect(needsFiles({ lastVersion: 2 })).toBe(false);
  });

  it("never lowers a counter, and leaves a unit that already holds it (or that nothing records) alone", () => {
    expect(counterFor({ lastVersion: 6, publishedVersion: 4, audited: 5 })).toBe(0);
    expect(counterFor({ lastVersion: 4, audited: 4 })).toBe(0); // run again: nothing to write
    expect(counterFor({ lastVersion: 2, audited: 4 })).toBe(4);
    expect(counterFor({})).toBe(0); // a draft never published
    expect(counterFor({ lastVersion: "7", publishedVersion: -1, audited: 1.5, files: ["v0.json"] })).toBe(0);
  });

  it("lists the publishes of unit ids that have no unit now, which only the audit log remembers", () => {
    const audited = auditVersions([{ unitId: "gone", owner: "public", version: 3 }, { unitId: "here", owner: "public", version: 2 }, { unitId: "here", owner: "o1", version: 1 }]);
    expect(orphans(audited, ["public/here"])).toEqual(["o1/here", "public/gone"]);
  });
});

describe("the backfill script", () => {
  const script = repo("scripts/backfill-last-version.mjs");
  it("reads everything before it writes, stops without writing when a read fails, and writes only the counter, never lower", () => {
    const at = (s: string) => { const i = script.indexOf(s); expect(i, s).toBeGreaterThan(0); return i; };
    expect(at("Nothing was written.")).toBeLessThan(at("tx.update("));
    expect(script.match(/\.(set|update|delete)\(/g)).toEqual([".update("]);
    expect(script).toContain("if (now < u.to) tx.update(u.ref, { lastVersion: u.to });");
    expect(at("if (!dry) {")).toBeLessThan(at("tx.update("));
  });
  // The deadline is the next publish, not an audit period: the functions trust a live unit's own version, so a unit
  // published again after an unpublish by the code before this release (live at v1, history at v4) would reuse a number.
  it("is a step of the enterprise release, to run before the next publish", () => {
    const doc = repo("docs/FIREBASE.md");
    const steps = doc.slice(doc.indexOf("### Releasing the enterprise batch"));
    const step = steps.split("\n").find((l) => l.includes("node scripts/backfill-last-version.mjs")) ?? "";
    expect(step).toMatch(/^5\. /);
    expect(step).toContain("before anyone publishes or republishes a course after the release");
    expect(step).toContain("may just as well be run just before the release");
    expect(steps).not.toContain("before anyone saves an audit period");
    expect(steps).toContain('"(live)"');
    // The script says the same where an operator opens it, and what it prints for such a unit.
    expect(script).toContain("before anyone publishes or republishes a course after the release");
    expect(script).toContain('" (live)" : " (not published now)"');
  });
});
