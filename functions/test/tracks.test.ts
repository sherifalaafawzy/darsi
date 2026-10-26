import { describe, expect, it } from "vitest";
import { buildCatalog, catalogEntry } from "../src/catalog";
import { mediaStillUsed, trackConflicts } from "../src/trackRules";
import { BUILTIN_TRACKS, levelsByTrack, mergeTracks } from "../src/shared/tracks";
import type { TrackDef, Unit } from "../src/shared/types";
import { validateTracks, validateUnit } from "../src/shared/validate";

const data: TrackDef = { id: "data", name: { en: "Data science", ar: "علم البيانات" }, icon: "chart", tone: "leaf", levels: 6, order: 3 };

describe("mergeTracks", () => {
  it("always keeps the built-in tracks, with their own colour and icon", () => {
    const merged = mergeTracks([{ ...BUILTIN_TRACKS[0], name: { en: "Artificial intelligence" }, tone: "slate", icon: "book", levels: 6 }, data]);
    expect(merged.map((t) => t.id)).toEqual(["ai", "iot", "cyber", "data"]);
    expect(merged[0]).toMatchObject({ name: { en: "Artificial intelligence" }, tone: "sunbird", icon: "ai", levels: 6, builtIn: true });
    expect(merged[3].builtIn).toBe(false);
  });
  it("orders by the order admins set", () => {
    expect(mergeTracks([{ ...data, order: -1 }]).map((t) => t.id)).toEqual(["data", "ai", "iot", "cyber"]);
  });
});

describe("validateTracks", () => {
  const ids = BUILTIN_TRACKS.map((t) => t.id);
  it("accepts the built-ins plus a well-formed track", () => {
    expect(validateTracks([...BUILTIN_TRACKS, data], ids)).toEqual([]);
  });
  it("refuses bad ids, duplicates, unknown colours, too many levels and a missing built-in", () => {
    const bad = validateTracks([BUILTIN_TRACKS[0], BUILTIN_TRACKS[1], { ...data, id: "Data Science" }, { ...data, tone: "gold", levels: 20 }, { ...data, name: { en: "" } }], ids);
    const codes = bad.map((i) => `${i.code}:${i.at.field}`);
    expect(codes).toContain("badId:tracks.2.id");
    expect(codes).toContain("badValue:tracks.3.tone");
    expect(codes).toContain("range:tracks.3.levels");
    expect(codes).toContain("duplicateId:tracks.4.id");
    expect(bad.some((i) => i.code === "required" && i.params?.value === "cyber")).toBe(true);
  });
});

describe("validateUnit with tracks", () => {
  const unit = (track: string, level: number) => ({ id: "u12345678", track, level, title: { en: "T" }, summary: { en: "S" }, lessons: [] });
  const tracks = levelsByTrack(mergeTracks([data]));
  const trackIssues = (u: unknown) => validateUnit(u, { tracks }).filter((i) => i.at.field === "track" || i.at.field === "level");
  it("accepts a level the track has", () => { expect(trackIssues(unit("data", 6))).toEqual([]); });
  it("refuses a level beyond the track's levels", () => { expect(trackIssues(unit("data", 7))).toMatchObject([{ code: "range", params: { max: 6 } }]); });
  it("refuses a track nobody set up", () => { expect(trackIssues(unit("robotics", 1))).toMatchObject([{ code: "badValue", at: { field: "track" } }]); });
  it("without a tracks list, any well-formed track and levels 1-12 pass", () => {
    expect(validateUnit(unit("robotics", 12)).filter((i) => i.at.field === "track" || i.at.field === "level")).toEqual([]);
    expect(validateUnit(unit("robotics", 13)).some((i) => i.at.field === "level")).toBe(true);
  });
});

describe("trackConflicts", () => {
  const prev = mergeTracks([data]);
  const units = [{ id: "u1", track: "data", level: 5 }, { id: "u2", track: "ai", level: 2 }, { id: "u3", track: "stray", level: 1 }];
  it("blocks removing a track that units use", () => {
    expect(trackConflicts(prev, mergeTracks([]), units)).toEqual([{ track: "data", reason: "removed", units: ["u1"] }]);
  });
  it("blocks fewer levels than a unit uses", () => {
    expect(trackConflicts(prev, mergeTracks([{ ...data, levels: 4 }]), units)).toEqual([{ track: "data", reason: "levels", units: ["u1"] }]);
  });
  it("allows more levels, renames and a stray track nobody set up", () => {
    expect(trackConflicts(prev, mergeTracks([{ ...data, levels: 8, name: { en: "Data" } }]), units)).toEqual([]);
  });
});

describe("mediaStillUsed", () => {
  it("keeps files another draft links to, by path or by download URL", () => {
    const files = ["content/media/u1/a.mp4", "content/media/u1/b.vtt", "content/media/u1/c.pdf"];
    const other = [JSON.stringify({ src: `https://x/o/${encodeURIComponent(files[0])}?alt=media&token=t` }), JSON.stringify({ path: files[2] })];
    expect([...mediaStillUsed(files, other)].sort()).toEqual([files[0], files[2]]);
  });
});

describe("buildCatalog with track order", () => {
  it("follows the order admins set, unknown tracks last", () => {
    const u = (id: string, track: string): Unit => ({ id, track, level: 1, title: { en: id }, summary: { en: "" }, lessons: [] });
    const entries = ["x", "data", "ai"].map((t, i) => catalogEntry(u(`u${i}`, t), "public", 1, 100));
    expect(buildCatalog(entries, { data: 0, ai: 1 }).units.map((e) => e.track)).toEqual(["data", "ai", "x"]);
  });
});
