import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { TRACK_TONES, TrackChip } from "@darsi/design-system";
import type { ReactNode } from "react";
import type { Settings, TrackDef } from "../src/content/types";
import { I18nProvider } from "../src/i18n";

// The settings file is the only thing read from the network here.
const m = vi.hoisted(() => ({ settings: null as Settings | null }));
vi.mock("../src/content/load", async (orig) => ({ ...(await orig<typeof import("../src/content/load")>()), loadSettings: async () => m.settings, forgetSettings: () => {} }));

const { SettingsProvider, useTracks } = await import("../src/content/settings");
const { BUILTIN_TRACKS, mergeTracks, levelsByTrack } = await import("../src/content/tracks");
const { TRACK_TONE_IDS } = await import("../src/content/validate");
const { placementNext } = await import("../src/screens/Onboarding");
const { useHistory } = await import("../src/cms/history");

const data: TrackDef = { id: "data", name: { en: "Data science", ar: "علم البيانات" }, icon: "chart", tone: "leaf", levels: 6, levelNames: [{ en: "Basics" }], order: 3 };
const wrap = (lang = "en") => ({ children }: { children: ReactNode }) => <I18nProvider lang={lang}><SettingsProvider lang={lang}>{children}</SettingsProvider></I18nProvider>;

beforeEach(() => { m.settings = null; });

describe("mergeTracks", () => {
  it("keeps every built-in track, with its own colour and icon, and sorts by order", () => {
    const merged = mergeTracks([{ ...BUILTIN_TRACKS[2], tone: "slate", icon: "book", hidden: true, order: 9 }, data]);
    expect(merged.map((t) => t.id)).toEqual(["ai", "iot", "data", "cyber"]);
    expect(merged[3]).toMatchObject({ tone: "hibiscus", icon: "cyber", hidden: true, builtIn: true });
    expect(levelsByTrack(merged).get("data")).toBe(6);
  });
});

describe("useTracks", () => {
  it("starts with the built-in tracks, then uses the published settings", async () => {
    m.settings = { version: 2, tracks: [{ ...BUILTIN_TRACKS[0], name: { en: "Artificial intelligence", ar: "الذكاء الاصطناعي" }, levels: 5 }, { ...BUILTIN_TRACKS[1], hidden: true }, data] };
    const { result } = renderHook(() => useTracks(), { wrapper: wrap() });
    expect(result.current.all.map((t) => t.id)).toEqual(["ai", "iot", "cyber"]);
    await waitFor(() => expect(result.current.all).toHaveLength(4));
    expect(result.current.visible.map((t) => t.id)).toEqual(["ai", "cyber", "data"]);
    expect(result.current.name("ai")).toBe("Artificial intelligence");
    expect(result.current.of("ai").levels).toBe(5);
    expect(result.current.levelName("data", 1)).toBe("Basics");
    expect(result.current.levelName("data", 2)).toBe("Level 2");
    expect(result.current.order("data")).toBe(3);
  });

  it("shows a track nobody set up under its id, in neutral colours", () => {
    const { result } = renderHook(() => useTracks(), { wrapper: wrap() });
    expect(result.current.name("robotics")).toBe("robotics");
    expect(result.current.of("robotics")).toMatchObject({ tone: "slate", icon: "learn" });
    expect(result.current.order("robotics")).toBeGreaterThan(100);
  });

  it("tells the design system each track's colour and icon", async () => {
    m.settings = { version: 1, tracks: [data] };
    const { container } = render(<TrackChip track="data">Data</TrackChip>, { wrapper: wrap() });
    await waitFor(() => expect(container.querySelector(".dr-chip")?.className).toContain("dr-tr-leaf"));
    render(<TrackChip track="ai">AI</TrackChip>, { wrapper: wrap() });
    expect(screen.getByText("AI").closest(".dr-chip")?.className).toContain("dr-tr-sunbird");
  });

  it("uses a saved list at once (the Tracks page)", async () => {
    const { result } = renderHook(() => useTracks(), { wrapper: wrap() });
    act(() => result.current.apply([...BUILTIN_TRACKS, data]));
    expect(result.current.of("data").levels).toBe(6);
  });
});

describe("track colours", () => {
  it("are the same list in the validator and the design system", () => {
    expect([...TRACK_TONE_IDS]).toEqual([...TRACK_TONES]);
  });
});

describe("placementNext", () => {
  /** Runs answers through the check for one track; returns the level it places the learner at. */
  const run = (answers: boolean[], top = 4) => {
    let st = { level: 1, asked: 0 };
    for (const ok of answers) {
      const r = placementNext(st, ok, top);
      if ("level" in r) return { level: r.level };
      st = r.state;
    }
    return { level: -1 }; // still asking
  };
  it("asks two per level and stops at the first level not passed", () => {
    expect(run([false]).level).toBe(1); // nothing known: Beginner, after one question
    expect(run([true, false]).level).toBe(1); // a level needs both right
    expect(run([true, true, false]).level).toBe(2);
    expect(run([true, true, true, true, true, false]).level).toBe(3);
    expect(run([true, true, true, true, true, true, true, true]).level).toBe(4); // every level passed: the top
    expect(run([true, true, true]).level).toBe(-1); // still asking level 2
  });
  it("works for tracks with fewer levels", () => {
    expect(run([true, true], 1).level).toBe(1);
    expect(run([true, true, true, true], 2).level).toBe(2);
  });
});

describe("useHistory", () => {
  it("merges quick typing in one place, keeps other changes apart, and undoes and redoes", () => {
    const { result } = renderHook(() => useHistory("a"));
    act(() => result.current.set("ab", "title"));
    act(() => result.current.set("abc", "title"));
    act(() => result.current.set("abc!"));
    expect(result.current.value).toBe("abc!");
    act(() => result.current.undo());
    expect(result.current.value).toBe("abc");
    act(() => result.current.undo());
    expect(result.current.value).toBe("a");
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.redo());
    expect(result.current.value).toBe("abc");
    act(() => result.current.set("x"));
    expect(result.current.canRedo).toBe(false);
  });

  it("keeps the last 50 changes", () => {
    const { result } = renderHook(() => useHistory(0));
    for (let i = 1; i <= 60; i++) act(() => result.current.set(i));
    for (let i = 0; i < 60; i++) act(() => result.current.undo());
    expect(result.current.value).toBe(10);
  });
});
