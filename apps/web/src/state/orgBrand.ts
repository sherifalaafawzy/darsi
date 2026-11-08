/**
 * The member's organization as the app shows it: its name and logo (TECHNICAL.md "Organization branding"), and the
 * courses it lets this member see (TECHNICAL.md "Course visibility in organizations").
 * One read of orgs/{orgId} per sign-in or app start (and again when the connection returns, if that failed), no
 * listener. The logo is kept in the local store as a small data: URL, so it shows offline and is downloaded only when
 * `brand.v` changes. The member's course list is worked out at that read from their role and class, so it holds offline;
 * a new role or class (an admin moved them) reads the document once more.
 */
import { useEffect } from "react";
import { loadFirebase } from "../fb";
import { sameSees, seesFor } from "../content/orgCourses";
import { useStore, type OrgBrand } from "./store";

interface OrgDoc { name?: unknown; brand?: { logo?: unknown; v?: unknown } | null; courses?: unknown }
/** Who is reading: their role and class decide which of the organization's course lists are theirs. */
export interface OrgReader { role?: string | null; group?: string | null }

/** What changed between the stored brand and the org document: null if nothing, else the new brand (logo to fetch). */
export function brandUpdate(orgId: string, doc: OrgDoc, have?: OrgBrand, who: OrgReader = {}): { brand: OrgBrand; fetchLogo: string | null } | null {
  const name = typeof doc.name === "string" ? doc.name : "";
  const v = typeof doc.brand?.v === "number" ? doc.brand.v : 0;
  const logo = typeof doc.brand?.logo === "string" ? doc.brand.logo : null;
  const courses = seesFor(doc.courses, who.role, who.group);
  const same = have?.id === orgId;
  if (same && have.name === name && have.v === v && sameSees(have.courses, courses)) return null;
  const keep = same && have.v === v ? have.logo : undefined;
  return { brand: { id: orgId, name, v, ...(keep ? { logo: keep } : {}), ...(courses ? { courses } : {}) }, fetchLogo: logo && !keep ? logo : null };
}

/**
 * `who`: the member's role (claims) and class (their profile). The class is undefined until the profile has been read,
 * and the read waits for it, so a sign-in reads the org document once, not once before the profile and once after.
 */
export function useOrgBrand(uid: string | undefined, orgId: string | null, who: { role?: string | null; group?: string | null } = {}) {
  const { state, dispatch, ready } = useStore();
  const have = state.org;
  const { role, group } = who;
  const waiting = "group" in who && group === undefined;
  useEffect(() => {
    if (!ready) return;
    if (!uid || !orgId) {
      // Left the organization (or signed out of it): Darsi's own look again, and every course.
      if (uid && !orgId && have) dispatch({ type: "set", patch: { org: undefined } });
      return;
    }
    if (waiting) return;
    let live = true, done = false;
    const pull = async () => {
      // Signed-in members only, so the SDK is already loading; nothing here reaches a guest's startup bundle.
      const [fb, { doc, getDoc }] = await Promise.all([loadFirebase(), import("firebase/firestore")]);
      const snap = await getDoc(doc(fb.db, "orgs", orgId));
      if (!live || snap.metadata.fromCache) return;
      done = true;
      const up = brandUpdate(orgId, (snap.data() ?? {}) as OrgDoc, have, { role, group });
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
    // Once per sign-in, organization, role and class; `have` is read at that moment, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, uid, orgId, dispatch, role, group, waiting]);
}
