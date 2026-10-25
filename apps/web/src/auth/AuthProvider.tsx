import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db, firebaseReady } from "../firebase";
import type { Profile, Role } from "./types";

interface AuthState {
  user: User | null;
  profile: Profile | null;
  /** Role and org from the ID token (authoritative for security rules). */
  role: Role;
  orgId: string | null;
  loading: boolean;
  refreshClaims: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  signOut: () => Promise<void>;
  configured: boolean;
}
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [claims, setClaims] = useState<{ role: Role; orgId: string | null }>({ role: "learner", orgId: null });
  const [loading, setLoading] = useState(firebaseReady);
  const claimsRef = useRef(claims);
  claimsRef.current = claims;

  const readClaims = useCallback(async (u: User, force = false) => {
    const r = await u.getIdTokenResult(force);
    setClaims({ role: (r.claims.role as Role) ?? "learner", orgId: (r.claims.orgId as string) ?? null });
  }, []);

  useEffect(() => {
    if (!firebaseReady) return;
    let unsubProfile = () => {};
    const unsub = onAuthStateChanged(auth, async (u) => {
      unsubProfile();
      if (!u) { setUser(null); setProfile(null); setClaims({ role: "learner", orgId: null }); setLoading(false); return; }
      // Claims first, so routing never sees a signed-in admin with the default "learner" role.
      await readClaims(u).catch(() => {});
      setUser(u);
      unsubProfile = onSnapshot(doc(db, "users", u.uid), (snap) => {
        if (snap.exists()) {
          const p = { uid: u.uid, ...(snap.data() as Omit<Profile, "uid">) };
          setProfile(p);
          // Claims changed server-side (joined org, role change) → refresh the token so rules see it.
          if ((p.role && p.role !== claimsRef.current.role) || (p.orgId ?? null) !== claimsRef.current.orgId) readClaims(u, true).catch(() => {});
        } else setProfile(null);
        setLoading(false);
      }, () => setLoading(false));
      updateDoc(doc(db, "users", u.uid), { lastActive: new Date().toISOString() }).catch(() => {});
    });
    return () => { unsub(); unsubProfile(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateProfile = useCallback(async (patch: Partial<Profile>) => {
    if (!user) return;
    await setDoc(doc(db, "users", user.uid), patch, { merge: true });
  }, [user]);

  const value = useMemo<AuthState>(() => ({
    user, profile, role: claims.role, orgId: claims.orgId, loading,
    refreshClaims: async () => { if (user) await readClaims(user, true); },
    updateProfile,
    signOut: () => fbSignOut(auth),
    configured: firebaseReady,
  }), [user, profile, claims, loading, readClaims, updateProfile]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

/** Creates the users/{uid} profile for a self-registered learner (fields allowed by the security rules). */
export async function createLearnerProfile(uid: string, data: { name: string; email: string; lang: string }) {
  await setDoc(doc(db, "users", uid), { name: data.name, email: data.email, lang: data.lang, role: "learner", orgId: null, createdAt: serverTimestamp(), lastActive: new Date().toISOString() });
}
