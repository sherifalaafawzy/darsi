// `npm run dev` talks to the Firebase emulators, never to the live project: apps/web/.env.development is committed and
// outranks .env.local in development mode, and without it Firebase stays off in development (firebase-config.ts).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "vite";

const dir = join(__dirname, "..");
const keys = (file: string) => [...readFileSync(join(dir, file), "utf8").matchAll(/^(VITE_\w+)=/gm)].map((m) => m[1]);

describe("npm run dev and the live project", () => {
  it("reads the emulators' settings in development mode, whatever .env.local holds", () => {
    // Settings already in the environment win over the files: leave them out, as a developer's shell would.
    const outside = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("VITE_")));
    for (const k of Object.keys(outside)) delete process.env[k];
    try {
      expect(loadEnv("development", dir, "VITE_")).toMatchObject({
        VITE_USE_EMULATORS: "true", VITE_FIREBASE_PROJECT_ID: "demo-darsi", VITE_FIREBASE_STORAGE_BUCKET: "demo-darsi.appspot.com",
        VITE_FIREBASE_API_KEY: "demo-local", VITE_FIREBASE_VAPID_KEY: "", VITE_TUTOR_RELAY: "ws://localhost:8091/live",
      });
    } finally { Object.assign(process.env, outside); }
  });

  it("sets every setting the example lists, so none falls through to the live .env.local", () => {
    expect(keys(".env.development")).toEqual(expect.arrayContaining(keys(".env.example")));
  });

  it("keeps .env.development in git and every other .env file out", () => {
    const ignore = readFileSync(join(dir, "../../.gitignore"), "utf8").split(/\r?\n/);
    expect(ignore.indexOf("!apps/web/.env.development")).toBeGreaterThan(ignore.indexOf(".env*"));
  });

  it("turns Firebase off in development when the emulators aren't set, and only then", async () => {
    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    const ready = async (mode: string, emulators: string) => {
      vi.stubEnv("MODE", mode); vi.stubEnv("VITE_USE_EMULATORS", emulators);
      vi.stubEnv("VITE_FIREBASE_API_KEY", "key"); vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "project");
      vi.resetModules();
      return (await import("../src/firebase-config")).firebaseReady;
    };
    try {
      expect(await ready("development", "false")).toBe(false);
      expect(said).toHaveBeenCalledWith(expect.stringMatching(/not using the Firebase emulators/));
      expect(await ready("development", "true")).toBe(true);
      expect(await ready("production", "false")).toBe(true);
      expect(await ready("test", "false")).toBe(true);
    } finally { vi.unstubAllEnvs(); vi.resetModules(); said.mockRestore(); }
  });
});
