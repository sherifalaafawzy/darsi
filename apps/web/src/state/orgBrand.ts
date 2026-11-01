/**
 * The member's organization as the app shows it: its name and logo (TECHNICAL.md "Organization branding").
 * One read of orgs/{orgId} per sign-in (and again when the connection returns, if that failed), no listener. The logo
 * is kept in the local store as a small data: URL, so it shows offline and is downloaded only when `brand.v` changes.
 */
import { useEffect } from "react";
import { loadFirebase } from "../fb";
import { useStore, type OrgBrand } from "./store";

interface OrgDoc { name?: unknown; brand?: { logo?: unknown; v?: unknown } | null }

/** What changed between the stored brand and the org document: null if nothing, else the new brand (logo to fetch). */
export function brandUpdate(orgId: string, doc: OrgDoc, have?: OrgBrand): { brand: OrgBrand; fetchLogo: string | null } | null {
  const name = typeof doc.name === "string" ? doc.name : "";
  const v = typeof doc.brand?.v === "number" ? doc.brand.v : 0;
  const logo = typeof doc.brand?.logo === "string" ? doc.brand.logo : null;
  const same = have?.id === orgId;
  if (same && have.name === name && have.v === v) return null;
  const keep = same && have.v === v ? have.logo : undefined;
  return { brand: { id: orgId, name, v, ...(keep ? { logo: keep } : {}) }, fetchLogo: logo && !keep ? logo : null };
}

export function useOrgBrand(uid: string | undefined, orgId: string | null) {
  const { state, dispatch, ready } = useStore();
  const have = state.org;
  useEffect(() => {
    if (!ready) return;
    if (!uid || !orgId) {
      // Left the organization (or signed out of it): Darsi's own look again.
      if (uid && !orgId && have) dispatch({ type: "set", patch: { org: undefined } });
      return;
    }
    let live = true, done = false;
    const pull = async () => {
      // Signed-in members only, so the SDK is already loading; nothing here reaches a guest's startup bundle.
      const [fb, { doc, getDoc }] = await Promise.all([loadFirebase(), import("firebase/firestore")]);
      const snap = await getDoc(doc(fb.db, "orgs", orgId));
      if (!live || snap.metadata.fromCache) return;
      done = true;
      const up = brandUpdate(orgId, (snap.data() ?? {}) as OrgDoc, have);
      if (!up) return;
      const logo = up.fetchLogo ? await fb.storageDataUrl(up.fetchLogo).catch(() => undefined) : up.brand.logo;
      // A logo that failed to download is fetched next time: v stays one behind until it arrives.
      const brand = up.fetchLogo && !logo ? { ...up.brand, v: -1 } : { ...up.brand, ...(logo ? { logo } : {}) };
      if (live) dispatch({ type: "set", patch: { org: brand } });
    };
    const retry = () => { if (!done) pull().catch(() => {}); };
    pull().catch(() => {});
    window.addEventListener("online", retry);
    return () => { live = false; window.removeEventListener("online", retry); };
    // Once per sign-in and organization; `have` is read at that moment, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, uid, orgId, dispatch]);
}
