// @vitest-environment node
// The Firebase SDK gives up on a callable after 70 seconds unless told otherwise. A function the server lets run longer
// (its onCall `timeoutSeconds`) must be in firebase.ts SLOW with at least that limit, or the app shows a failure for
// work that goes on and finishes on the server (and invites a second run of it). Read from the sources: firebase.ts
// starts the SDK when imported, and the functions aren't built here.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SDK_DEFAULT_S = 70;

/** firebase.ts SLOW, as written: name → milliseconds. */
function clientLimits(): Record<string, number> {
  const body = /const SLOW: Record<string, number> = \{([^}]*)\}/.exec(readFileSync(join(__dirname, "../src/firebase.ts"), "utf8"))?.[1] ?? "";
  return Object.fromEntries([...body.matchAll(/(\w+):\s*([\d_]+)/g)].map((m) => [m[1], Number(m[2].replace(/_/g, ""))]));
}
/** Every `export const name = onCall({ … timeoutSeconds: n … }` in functions/src: name → seconds. */
function serverLimits(): Record<string, number> {
  const dir = join(__dirname, "../../../functions/src");
  const out: Record<string, number> = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    for (const m of readFileSync(join(dir, f), "utf8").matchAll(/export const (\w+) = onCall\(\s*\{([^}]*)\}/g)) {
      const s = /timeoutSeconds:\s*(\d+)/.exec(m[2])?.[1];
      if (s) out[m[1]] = Number(s);
    }
  }
  return out;
}

describe("callables that take longer than the SDK waits", () => {
  const client = clientLimits(), server = serverLimits();

  it("reads both lists", () => {
    expect(client.tutorAsk).toBe(180_000);
    expect(server.createMembers).toBe(540);
  });

  it("the app waits at least as long as the server lets each one run", () => {
    const short = Object.entries(server).filter(([name, s]) => s > SDK_DEFAULT_S && (client[name] ?? 0) < s * 1000).map(([name, s]) => `${name}: ${s} s`);
    expect(short).toEqual([]);
  });

  it("lists the staff actions over a whole organization or the platform", () => {
    expect(client).toMatchObject({ deleteOrg: 540_000, fillSeats: 300_000, refreshStats: 300_000, exportOrgData: 540_000, bulkMembers: 300_000, listMembers: 120_000, courseResults: 120_000 });
  });

  it("lists publishing a course and school sign-in's actions at their server limit", () => {
    expect(server).toMatchObject({ publishUnit: 120, unpublishUnit: 120, manageSso: 120 });
    expect(client).toMatchObject({ publishUnit: 120_000, unpublishUnit: 120_000, manageSso: 120_000 });
  });
});
