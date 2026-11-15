/**
 * An organization's homepage (TECHNICAL.md "Organization homepage"): what its admins put together on the page builder,
 * shown at the organization's own web address. One callable, manageOrgPage:
 * - save: the draft, checked and cleaned (shared/page.ts checkPage), into orgs/{orgId}/private/page {page, rev,
 *   updatedAt, updatedBy}. A draft may still have problems; they come back so the editor can show them.
 * - publish: saves, then writes content/pages/{orgId}/page.json for everyone to read (a plain fetch: guests on the
 *   organization's address never load Firebase), but only a page without problems. Five minutes in caches.
 * - unpublish: removes that file; the draft stays.
 * The organization's admins, and platform admins (orgMembers.ts orgAdmin: never for a suspended or deleting
 * organization's own admins). Every save that changes something, publish and unpublish are audited. Pictures are
 * uploaded by the admin's browser to content/pages/{orgId}/img-… (storage.rules); deleteOrg removes the folder.
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { audit, db } from "./admin.js";
import { orgAdmin } from "./orgMembers.js";
import { checkPage, pagePath, type OrgPage, type PageProblem } from "./shared/page.js";
import { bucket, saveJson } from "./storage.js";

const ACTIONS = ["get", "save", "publish", "unpublish"] as const;
type Action = (typeof ACTIONS)[number];

export const manageOrgPage = onCall({ timeoutSeconds: 60 }, async (req) => {
  const d = (req.data ?? {}) as Record<string, unknown>;
  const orgId = typeof d.orgId === "string" ? d.orgId : "";
  const action = d.action as Action;
  if (!ACTIONS.includes(action)) throw new HttpsError("invalid-argument", "Unknown action.", { reason: "bad-action" });
  const c = await orgAdmin(req, orgId);
  const ref = db.doc(`orgs/${orgId}/private/page`);

  if (action === "get") {
    const snap = await ref.get();
    return {
      page: (snap.get("page") as OrgPage | undefined) ?? null, rev: (snap.get("rev") as number | undefined) ?? 0,
      publishedRev: (snap.get("publishedRev") as number | null | undefined) ?? null, publishedAt: (snap.get("publishedAt") as number | null | undefined) ?? null,
    };
  }

  if (action === "unpublish") {
    await bucket().file(pagePath(orgId)).delete({ ignoreNotFound: true });
    await ref.set({ publishedRev: null, publishedAt: null }, { merge: true });
    await audit("unpublishOrgPage", c.uid, { orgId });
    return { ok: true };
  }

  const { page, problems } = checkPage(d.page, orgId);
  if (!page) throw new HttpsError("invalid-argument", "That isn't a page.", { reason: "bad-page", problems });
  const json = JSON.stringify(page);
  if (problems.some((p) => p.code === "too-long" && p.field === "page") || problems.some((p) => p.code === "too-many" && p.field === "blocks")) {
    throw new HttpsError("invalid-argument", "The page is too long.", { reason: "page-too-long", problems });
  }
  if (action === "publish" && problems.length) {
    throw new HttpsError("failed-precondition", "Fix what is marked on the page first.", { reason: "page-problems", problems });
  }
  // One revision number for the draft; a save that changes nothing writes nothing.
  const now = Date.now();
  const { rev, changed } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const was = snap.get("page") as OrgPage | undefined;
    const prev = (snap.get("rev") as number | undefined) ?? 0;
    const same = was !== undefined && JSON.stringify(was) === json;
    if (!same) tx.set(ref, { page, rev: prev + 1, updatedAt: now, updatedBy: c.uid }, { merge: true });
    return { rev: same ? prev : prev + 1, changed: !same };
  });
  if (changed) await audit("saveOrgPage", c.uid, { orgId, rev, blocks: page.blocks.length });
  if (action === "save") return { ok: true, rev, problems: problems as PageProblem[] };

  await saveJson(pagePath(orgId), json, "public, max-age=300");
  await ref.set({ publishedRev: rev, publishedAt: now }, { merge: true });
  await audit("publishOrgPage", c.uid, { orgId, rev, blocks: page.blocks.length, langs: page.langs });
  return { ok: true, rev, publishedAt: now };
});
