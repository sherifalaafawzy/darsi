/**
 * Course editor callables. Drafts live in Firestore (units/{id} for lists, unitDrafts/{id} for the content); these
 * functions are the only way content reaches learners: they validate the draft with the same validator as the editor,
 * write an immutable versioned JSON file to Storage and rebuild that owner's catalog.json.
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { audit, caller, db, str } from "./admin.js";
import { buildCatalog, canManage, catalogEntry, catalogPath, idAllowed, isOwner, mediaPrefix, staleVersions, unitPath, unitPrefix, type Owner } from "./catalog.js";
import { loadTracks } from "./settings.js";
import { bucket } from "./storage.js";
import { mediaStillUsed } from "./trackRules.js";
import { levelsByTrack } from "./shared/tracks.js";
import type { CatalogEntry, Unit } from "./shared/types.js";
import { byteSize, errorsOf, UNIT_ID, validateUnit } from "./shared/validate.js";

/** Loads units/{unitId} and checks that the caller may manage it. */
async function target(req: CallableRequest) {
  const c = caller(req);
  const unitId = str(req.data?.unitId, 60);
  if (!UNIT_ID.test(unitId)) throw new HttpsError("invalid-argument", "unitId is required.");
  const meta = await db.doc(`units/${unitId}`).get();
  if (!meta.exists) throw new HttpsError("not-found", "No such unit.");
  const owner = meta.get("owner") as unknown;
  if (!isOwner(owner)) throw new HttpsError("failed-precondition", "The unit has no valid owner.");
  if (!canManage(c, owner)) throw new HttpsError("permission-denied", "Only this unit's admins can do that.");
  return { c, unitId, meta, owner };
}

/**
 * Rewrites owner's catalog.json from the entries stored on its published units. Two publishes at once could each miss
 * the other's entry, so it re-reads after writing and writes again if the set changed.
 */
async function writeCatalog(owner: Owner) {
  const order = Object.fromEntries((await loadTracks()).map((t) => [t.id, t.order]));
  const read = async () => (await db.collection("units").where("owner", "==", owner).get()).docs
    .map((d) => d.get("published.entry") as CatalogEntry | undefined).filter((e): e is CatalogEntry => !!e);
  const key = (es: CatalogEntry[]) => es.map((e) => `${e.id}@${e.version}`).sort().join(",");
  let entries = await read();
  for (let i = 0; i < 3; i++) {
    await bucket().file(catalogPath(owner)).save(JSON.stringify(buildCatalog(entries, order)), {
      resumable: false, contentType: "application/json; charset=utf-8",
      metadata: { cacheControl: owner === "public" ? "public, max-age=60" : "private, max-age=60" },
    });
    const again = await read();
    if (key(again) === key(entries)) return;
    entries = again;
  }
}

async function deleteJson(owner: Owner, unitId: string, keepFrom = Infinity) {
  const [files] = await bucket().getFiles({ prefix: unitPrefix(owner, unitId) });
  const doomed = keepFrom === Infinity ? files.map((f) => f.name) : staleVersions(files.map((f) => f.name), keepFrom);
  await Promise.all(doomed.map((name) => bucket().file(name).delete({ ignoreNotFound: true })));
}

/** Validate the draft, write content/…/units/{id}/v{n+1}.json, and rebuild the catalog. */
export const publishUnit = onCall({ memory: "512MiB" }, async (req) => {
  const { c, unitId, meta, owner } = await target(req);
  const draft = await db.doc(`unitDrafts/${unitId}`).get();
  const unit = draft.get("unit") as Unit | undefined;
  // The unit's track must be one platform admins set up, and its level must fit that track.
  const errors = errorsOf(validateUnit(unit, { tracks: levelsByTrack(await loadTracks()) }));
  if (errors.length) throw new HttpsError("invalid-argument", "The unit has errors. Fix them in the editor first.", { issues: errors.slice(0, 20) });
  if (!unit || unit.id !== unitId) throw new HttpsError("failed-precondition", "The draft's id does not match the unit.");
  if (!idAllowed(owner, unitId)) throw new HttpsError("failed-precondition", "Organization units need a generated id.");
  const version = (Number(meta.get("published.version")) || 0) + 1;
  const body = JSON.stringify(unit);
  await bucket().file(unitPath(owner, unitId, version)).save(body, {
    resumable: false, contentType: "application/json; charset=utf-8",
    // Versioned paths never change, so phones may keep them forever; org units stay out of shared caches.
    metadata: { cacheControl: `${owner === "public" ? "public" : "private"}, max-age=31536000, immutable` },
  });
  // `rev` is the draft revision that went live: the editor shows "changes not published" while the draft's rev differs.
  await meta.ref.update({ published: { version, rev: Number(draft.get("rev")) || 0, at: FieldValue.serverTimestamp(), by: c.uid, entry: catalogEntry(unit, owner, version, byteSize(unit)) } });
  await writeCatalog(owner);
  await deleteJson(owner, unitId, version);
  await audit("publishUnit", c.uid, { unitId, owner, version });
  return { version };
});

/** Take a unit away from learners. Its media stays, so publishing again needs no new uploads. */
export const unpublishUnit = onCall(async (req) => {
  const { c, unitId, meta, owner } = await target(req);
  await meta.ref.update({ published: null });
  await writeCatalog(owner);
  await deleteJson(owner, unitId);
  await audit("unpublishUnit", c.uid, { unitId, owner });
  return { ok: true };
});

/**
 * Delete a unit everywhere: catalog entry, JSON versions, uploaded media and both Firestore documents. Media that another
 * unit of the same owner still links to (a duplicated unit shares its files) is kept.
 */
export const deleteUnit = onCall(async (req) => {
  const { c, unitId, meta, owner } = await target(req);
  if (meta.get("published")) { await meta.ref.update({ published: null }); await writeCatalog(owner); }
  await deleteJson(owner, unitId);
  const [media] = await bucket().getFiles({ prefix: mediaPrefix(owner, unitId) });
  if (media.length) {
    const others = (await db.collection("unitDrafts").where("owner", "==", owner).get()).docs.filter((d) => d.id !== unitId).map((d) => JSON.stringify(d.get("unit") ?? ""));
    const keep = mediaStillUsed(media.map((f) => f.name), others);
    await Promise.all(media.filter((f) => !keep.has(f.name)).map((f) => f.delete({ ignoreNotFound: true })));
  }
  const batch = db.batch();
  batch.delete(meta.ref);
  batch.delete(db.doc(`unitDrafts/${unitId}`));
  await batch.commit();
  await audit("deleteUnit", c.uid, { unitId, owner });
  return { ok: true };
});
