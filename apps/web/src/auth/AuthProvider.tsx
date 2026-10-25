import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { firebaseReady } from "../firebase-config";
import { loadFirebase, storedSession } from "../fb";
import type { Profile, Role } from "./types";

interface AuthState {
  user: User | null;
  profile: Profile | null;
  /** Role and org from the ID token (authoritative for security rules). */
  role: Role;
  orgId: string | null;
  loading: boolean;
  /**
   * The uid of a session saved on this device whose SDK could not load yet (offline, chunk not cached). Learning
   * carries on in that account's local store; it reconnects when the phone is back online.
   */
  offlineUid: string | null;
  /** Loads the Firebase SDK and starts listening for sign-in. Account screens call it; it is a no-op once started. */
  ensureFirebase: () => Promise<void>;
  refreshClaims: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  signOut: () => Promise<void>;
  configured: boolean;
}
const Ctx = createContext<AuthState | null>(null);
const LEARNER = { role: "learner" as Role, orgId: null as string | null };

/**
 * Firebase is loaded only when needed: at startup if a session is saved on this device, otherwise when an account
 * screen opens. Guests and first-time visitors never download or parse the SDK.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [claims, setClaims] = useState<{ role: Role; orgId: string | null }>(LEARNER);
  const [loading, setLoading] = useState(firebaseReady);
  const [offlineUid, setOfflineUid] = useState<string | null>(null);
  const claimsRef = useRef(claims);
  claimsRef.current = claims;
  const started = useRef<Promise<void> | null>(null);
  const stop = useRef<() => void>(() => {});

  const readClaims = useCallback(async (u: User, force = false) => {
    const r = await u.getIdTokenResult(force);
    setClaims({ role: (r.claims.role as Role) ?? "learner", orgId: (r.claims.orgId as string) ?? null });
  }, []);

  /** Load the SDK once and subscribe to auth state. Resolves when the subscription is in place. */
  const start = useCallback((): Promise<void> => (started.current ??= (async () => {
    const [fb, { onAuthStateChanged }, fs] = await Promise.all([loadFirebase(), import("firebase/auth"), import("firebase/firestore")]);
    let unsubProfile = () => {};
    const unsubAuth = onAuthStateChanged(fb.auth, async (u) => {
      unsubProfile();
      if (!u) { setUser(null); setProfile(null); setClaims(LEARNER); setLoading(false); return; }
      // Claims first, so routing never sees a signed-in admin with the default "learner" role.
      await readClaims(u).catch(() => {});
      setUser(u); setOfflineUid(null);
      unsubProfile = fs.onSnapshot(fs.doc(fb.db, "users", u.uid), (snap) => {
        if (snap.exists()) {
          const p = { uid: u.uid, ...(snap.data() as Omit<Profile, "uid">) };
          setProfile(p);
          // Claims changed server-side (joined org, role change) → refresh the token so rules see it.
          if ((p.role && p.role !== claimsRef.current.role) || (p.orgId ?? null) !== claimsRef.current.orgId) readClaims(u, true).catch(() => {});
        } else setProfile(null);
        setLoading(false);
      }, () => setLoading(false));
      fs.updateDoc(fs.doc(fb.db, "users", u.uid), { lastActive: new Date().toISOString() }).catch(() => {});
    });
    stop.current = () => { unsubAuth(); unsubProfile(); };
  })().catch((e) => { started.current = null; throw e; })), [readClaims]);

  useEffect(() => {
    if (!firebaseReady) return;
    let live = true, session: string | null = null;
    const retry = () => { if (session && !started.current) start().catch(() => {}); };
    (async () => {
      const s = await storedSession();
      if (!live) return;
      if (!s) { setLoading(false); return; } // guest or signed out: no SDK at all
      session = s.uid;
      try { await start(); }
      catch { if (live) { setOfflineUid(s.uid); setLoading(false); } } // offline before the SDK chunk was cached
    })();
    window.addEventListener("online", retry);
    return () => { live = false; window.removeEventListener("online", retry); stop.current(); };
  }, [start]);

  const updateProfile = useCallback(async (patch: Partial<Profile>) => {
    if (!user) return;
    const [{ db }, { doc, setDoc }] = await Promise.all([loadFirebase(), import("firebase/firestore")]);
    await setDoc(doc(db, "users", user.uid), patch, { merge: true });
  }, [user]);

  const value = useMemo<AuthState>(() => ({
    user, profile, role: claims.role, orgId: claims.orgId, loading, offlineUid,
    ensureFirebase: start,
    refreshClaims: async () => { if (user) await readClaims(user, true); },
    updateProfile,
    signOut: async () => { const [{ auth }, { signOut }] = await Promise.all([loadFirebase(), import("firebase/auth")]); await signOut(auth); },
    configured: firebaseReady,
  }), [user, profile, claims, loading, offlineUid, start, readClaims, updateProfile]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

/** Creates the users/{uid} profile for a self-registered learner (fields allowed by the security rules). */
export async function createLearnerProfile(uid: string, data: { name: string; email: string; lang: string }) {
  const [{ db }, { doc, serverTimestamp, setDoc }] = await Promise.all([loadFirebase(), import("firebase/firestore")]);
  await setDoc(doc(db, "users", uid), { name: data.name, email: data.email, lang: data.lang, role: "learner", orgId: null, createdAt: serverTimestamp(), lastActive: new Date().toISOString() });
}
