/**
 * Course access (out/project-work/PLAN.md): a platform admin lets a university teacher read the student results and
 * project submissions of chosen courses. courseAccess/{uid} holds the grant; the reads are collection-group queries on
 * `unitId`, which firebase/firestore.rules allow only for granted courses, and never as writes.
 */
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "../firebase";

export interface Grant { uid: string; units: string[]; name?: string; email?: string; grantedBy?: string }
export interface ResultRow { uid: string; lessonId: string; accuracy: number; completedAt?: string }
export interface FileRef { url: string; name: string; type?: string }
export interface StudentWork {
  id: string; uid: string; lessonId: string; stepId?: string; text: string; final?: boolean; explain?: string; aiUse?: string; name?: string;
  fileUrl?: string | null; fileName?: string | null; files?: FileRef[]; createdAt?: { seconds: number } | null;
}

/** The user who owns a users/{uid}/… document. */
const ownerOf = (path: string) => path.split("/")[1];

export async function myGrant(uid: string): Promise<Grant | null> {
  const s = await getDoc(doc(db, "courseAccess", uid));
  return s.exists() ? ({ uid, units: [], ...s.data() } as Grant) : null;
}

export async function courseResults(unitId: string): Promise<{ results: ResultRow[]; work: StudentWork[] }> {
  const [p, s] = await Promise.all([
    getDocs(query(collectionGroup(db, "progress"), where("unitId", "==", unitId), limit(2000))),
    getDocs(query(collectionGroup(db, "submissions"), where("unitId", "==", unitId), limit(500))),
  ]);
  return {
    results: p.docs.map((d) => ({ uid: ownerOf(d.ref.path), lessonId: d.id, ...d.data() }) as ResultRow),
    work: s.docs.map((d) => ({ id: d.id, uid: ownerOf(d.ref.path), ...d.data() }) as StudentWork)
      .sort((a, b) => Number(!!b.final) - Number(!!a.final) || (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)),
  };
}

/* ---------- Platform admin: grants ---------- */
export async function allGrants(): Promise<Grant[]> {
  return (await getDocs(collection(db, "courseAccess"))).docs.map((d) => ({ uid: d.id, units: [], ...d.data() }) as Grant);
}
export async function findUser(email: string): Promise<{ uid: string; name: string; email: string; teach?: string } | null> {
  const s = await getDocs(query(collection(db, "users"), where("email", "==", email.trim().toLowerCase()), limit(1)));
  const d = s.docs[0];
  return d ? ({ uid: d.id, ...d.data() } as { uid: string; name: string; email: string; teach?: string }) : null;
}
export const saveGrant = (g: Grant, by: string) =>
  setDoc(doc(db, "courseAccess", g.uid), { units: g.units, name: g.name ?? "", email: g.email ?? "", grantedBy: by, updatedAt: serverTimestamp() });
export const removeGrant = (uid: string) => deleteDoc(doc(db, "courseAccess", uid));
