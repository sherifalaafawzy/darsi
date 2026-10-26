/**
 * Platform settings that every unit and screen uses: the tracks (name, icon, colour, number of levels, order).
 * Firestore config/settings is the source of truth; saveSettings also publishes content/settings.json, which phones
 * read with a plain fetch (guests never load the Firebase SDK).
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { audit, caller, db } from "./admin.js";
import { savePublicJson } from "./storage.js";
import { trackConflicts } from "./trackRules.js";
import { BUILTIN_TRACKS, mergeTracks } from "./shared/tracks.js";
import type { TrackDef } from "./shared/types.js";
import { validateTracks } from "./shared/validate.js";

const SETTINGS = "config/settings";

/** The tracks in use now: the saved list, with the built-in tracks always present. */
export async function loadTracks(): Promise<TrackDef[]> {
  const s = await db.doc(SETTINGS).get();
  return mergeTracks(s.exists ? (s.get("tracks") as TrackDef[]) : null);
}

/** Platform admins save the whole tracks list. `rev` is the version they edited; a newer one means someone else saved. */
export const saveSettings = onCall(async (req) => {
  const c = caller(req);
  if (c.role !== "superadmin") throw new HttpsError("permission-denied", "Only platform admins can change tracks.");
  const issues = validateTracks(req.data?.tracks, BUILTIN_TRACKS.map((t) => t.id));
  if (issues.length) throw new HttpsError("invalid-argument", "The tracks have errors.", { issues: issues.slice(0, 20) });
  const rev = Number(req.data?.rev) || 0;
  const next = mergeTracks(req.data.tracks as TrackDef[]).map(({ builtIn: _b, ...t }) => t);

  const ref = db.doc(SETTINGS);
  const current = await ref.get();
  const currentRev = Number(current.get("rev")) || 0;
  if (currentRev !== rev) throw new HttpsError("aborted", "Someone else saved the tracks meanwhile. Reload to see their changes.", { conflict: true });
  const units = (await db.collection("units").select("track", "level").get()).docs
    .map((d) => ({ id: d.id, track: String(d.get("track") ?? ""), level: Number(d.get("level")) || 1 }));
  const conflicts = trackConflicts(mergeTracks(current.exists ? (current.get("tracks") as TrackDef[]) : null), next, units);
  if (conflicts.length) throw new HttpsError("failed-precondition", "Some units still use these tracks or levels.", { conflicts });

  const newRev = currentRev + 1;
  await db.runTransaction(async (tx) => {
    const again = await tx.get(ref);
    if ((Number(again.get("rev")) || 0) !== currentRev) throw new HttpsError("aborted", "Someone else saved the tracks meanwhile. Reload to see their changes.", { conflict: true });
    tx.set(ref, { tracks: next, rev: newRev, updatedAt: FieldValue.serverTimestamp(), updatedBy: c.uid });
  });
  await savePublicJson("content/settings.json", { version: newRev, tracks: next });
  await audit("saveSettings", c.uid, { tracks: next.map((t) => `${t.id}:${t.levels}${t.hidden ? ":hidden" : ""}`) });
  return { rev: newRev, tracks: next };
});
