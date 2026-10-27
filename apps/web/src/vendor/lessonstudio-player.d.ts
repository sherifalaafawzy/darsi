// Types for the vendored Lesson Studio player (lessonstudio-player.js): only what Darsi uses.
export type LightEvent = { type: "check"; id: string; correct: boolean } | { type: "ended" } | { type: "no-audio" } | { type: string };
export interface LightPlayer { play(): void; pause(): void; destroy(): void; readonly ready: Promise<void> }
export interface LightPackage {
  manifest: unknown;
  scenes: unknown;
  timing: Record<string, unknown>;
  /** Where "@lib/…" pictures and icons come from. */
  library?: string;
  /** The address of each package file ("audio/en.opus" → its URL). */
  resolve?: (path: string) => string;
}
export function createPlayer(host: HTMLElement, pkg: LightPackage, opts?: {
  lang?: string;
  tier?: "auto" | "full" | "lite" | "frames" | "text";
  captions?: boolean;
  library?: string;
  remember?: boolean;
  onEvent?: (e: LightEvent) => void;
}): LightPlayer;
