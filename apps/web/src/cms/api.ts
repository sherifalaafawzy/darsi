import { call } from "../fb";
import type { TrackDef } from "../content/types";
import type { Issue } from "../content/validate";

/** Course editor callables (functions/src/content.ts). publishUnit refuses a draft with errors and returns them in `details.issues`. */
export const cmsApi = {
  publishUnit: call<{ unitId: string }, { version: number }>("publishUnit"),
  unpublishUnit: call<{ unitId: string }, { ok: boolean }>("unpublishUnit"),
  deleteUnit: call<{ unitId: string }, { ok: boolean }>("deleteUnit"),
  /** Platform admins (functions/src/settings.ts). `rev` is the version edited; refused with "aborted" if someone saved since. */
  saveSettings: call<{ rev: number; tracks: TrackDef[] }, { rev: number; tracks: TrackDef[] }>("saveSettings"),
};
export const issuesOf = (e: unknown): Issue[] => ((e as { details?: { issues?: Issue[] } }).details?.issues ?? []);
/** What saveSettings refused: tracks that units still use, or levels below the ones units use. */
export interface TrackConflict { track: string; reason: "removed" | "levels"; units: string[] }
export const conflictsOf = (e: unknown): TrackConflict[] => ((e as { details?: { conflicts?: TrackConflict[] } }).details?.conflicts ?? []);
/** A callable's error code without the "functions/" prefix. */
export const codeOf = (e: unknown) => String((e as { code?: string }).code ?? "").replace(/^functions\//, "");
