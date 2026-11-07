import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { firebaseReady } from "../firebase-config";
import { loadFirebase, storedSession } from "../fb";
import { pushSignOut } from "../notify/push";
import { forgetAccount } from "../state/store";
import { forgetOrgFiles } from "../content/load";
import { clearRuns } from "../lesson/engine";
import type { Profile, Role } from "./types";

interface AuthState {
  user: User | null;
  profile: Profile | null;
  /** The signed-in account's users/{uid} has been read (or found missing): `profile` is that answer, not "not yet". */
  profileReady: boolean;
  /** Role and org from the ID token (authoritative for security rules). */
  role: Role;
  orgId: string | null;
  /** Darsi Super from the ID token: the plan and when it ends (ms), or null (docs/SUPER.md). */
  plan: { id: string; until: number } | null;
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
const LEARNER = { role: "learner" as Role, orgId: null as string | null, plan: null as { id: string; until: number } | null };

/** Resolves with `fallback` if `p` takes longer than `ms` (or fails), so signing out never hangs on a weak connection. */
const within = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p.catch(() => fallback), new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

/** Small flags that must survive the reload after signing out (private mode: they are simply lost). */
const flag = (key: string) => ({
  get: () => { try { return localStorage.getItem(key) === "1"; } catch { return false; } },
  set: (on: boolean) => { try { if (on) localStorage.setItem(key, "1"); else localStorage.removeItem(key); } catch { /* private mode */ } },
});
/** Firestore's cache on this device still has to be cleared: the clear at sign-out didn't finish. */
const purgeLater = flag("darsi:purgeFs");
/** sessionStorage: the last sign-out kept unsent work on this device (App says so once, after the reload). */
export const KEPT_KEY = "darsi:keptOnDevice";

/**
 * Deletes Firestore's cache on this device (documents and the queue of unsent writes). The instance must not be running
 * (the SDK throws at once if it is). Whatever stops it, it is tried again later, and it never throws.
 */
async function clearCache(fs: typeof import("firebase/firestore"), db: Firestore): Promise<boolean> {
  let done = false;
  try { done = await within(fs.clearIndexedDbPersistence(db).then(() => true), 3000, false); } catch { done = false; }
  purgeLater.set(!done);
  return done;
}

/**
 * Signing out on a shared phone or lab PC leaves nothing of the person behind for the next one: Firestore's cache (an
 * admin's member lists and invite codes, a teacher's submissions, the person's notes) is deleted, and the account's own
 * copy in the local store keeps only its settings and onboarding answers. All of it comes back from the cloud at the next
 * sign-in. Unsent work (offline, or a slow connection) is the exception: the local copy keeps it, sync sends it at this
 * account's next sign-in on this device, and the person is told so. The page then starts afresh, as a guest.
 */
async function signOutHere(uid: string | undefined) {
  if (uid) await pushSignOut(uid); // while the session can still call unregisterDevice
  const [{ auth, db }, { signOut }, fs] = await Promise.all([loadFirebase(), import("firebase/auth"), import("firebase/firestore")]);
  // Only acknowledged writes are in the cloud. Offline, this never resolves: the cap decides. (It throws at once on an
  // instance another tab's sign-out already stopped: then nothing is known to be sent.)
  let synced = false;
  if (uid) try { synced = (await within(fs.waitForPendingWrites(db).then(() => true), 5000, false)) && navigator.onLine !== false; } catch { synced = false; }
  await signOut(auth);
  if (!uid) return;
  try { await fs.terminate(db); await clearCache(fs, db); } catch { purgeLater.set(true); }
  if (synced) { await forgetAccount(uid).catch(() => {}); clearRuns(uid); } // with the lessons it had in progress here
  else try { sessionStorage.setItem(KEPT_KEY, "1"); } catch { /* private mode */ }
  await forgetOrgFiles().catch(() => {}); // before the reload cuts it short (content/load.ts also starts it)
  // The Firestore instance is terminated: a fresh page gets a new one.
  location.replace("/");
}
/**
 * The sign-out under way, if any: a second tap (the nav rail and Me while it waits for a slow connection) joins it, rather
 * than running again on a stopped Firestore and telling the person, wrongly, that their work wasn't sent.
 */
let signingOut: Promise<void> | null = null;
const signOutOnce = (uid: string | undefined) => (signingOut ??= signOutHere(uid).finally(() => { signingOut = null; }));

/**
 * Firebase is loaded only when needed: at startup if a session is saved on this device, otherwise when an account
 * screen opens. Guests and first-time visitors never download or parse the SDK.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  /** Whose profile the last read answered for: ready once it is the signed-in account's. */
  const [profileOf, setProfileOf] = useState<string | null>(null);
  const [claims, setClaims] = useState<{ role: Role; orgId: string | null; plan: { id: string; until: number } | null }>(LEARNER);
  const [loading, setLoading] = useState(firebaseReady);
  const [offlineUid, setOfflineUid] = useState<string | null>(null);
  const claimsRef = useRef(claims);
  claimsRef.current = claims;
  const started = useRef<Promise<void> | null>(null);
  const stop = useRef<() => void>(() => {});

  const readClaims = useCallback(async (u: User, force = false) => {
    const r = await u.getIdTokenResult(force);
    const until = Number(r.claims.planUntil) || 0;
    setClaims({ role: (r.claims.role as Role) ?? "learner", orgId: (r.claims.orgId as string) ?? null, plan: typeof r.claims.plan === "string" && until ? { id: r.claims.plan, until } : null });
  }, []);

  /**
   * Load the SDK once and subscribe to auth state. Resolves when the subscription is in place. `signedOut`: nobody is
   * signed in on this device (an account screen opened), the moment to finish a cache clear an earlier sign-out left.
   */
  const start = useCallback((signedOut = false): Promise<void> => (started.current ??= (async () => {
    const [fb, { onAuthStateChanged }, fs] = await Promise.all([loadFirebase(), import("firebase/auth"), import("firebase/firestore")]);
    // Before anything reads Firestore (clearing needs an instance that hasn't started).
    if (signedOut && purgeLater.get()) await clearCache(fs, fb.db);
    let unsubProfile = () => {};
    const unsubAuth = onAuthStateChanged(fb.auth, async (u) => {
      unsubProfile();
      // Also clears offlineUid: a session that ended while the phone was offline (expired, revoked) makes this a guest.
      if (!u) { setUser(null); setProfile(null); setProfileOf(null); setClaims(LEARNER); setOfflineUid(null); setLoading(false); return; }
      // Claims first, so routing never sees a signed-in admin with the default "learner" role.
      await readClaims(u).catch(() => {});
      setUser(u); setOfflineUid(null);
      unsubProfile = fs.onSnapshot(fs.doc(fb.db, "users", u.uid), (snap) => {
        if (snap.exists()) {
          const p = { uid: u.uid, ...(snap.data() as Omit<Profile, "uid">) };
          setProfile(p);
          // Claims changed server-side (joined org, role change) → refresh the token so rules see it.
          // Darsi Super is mirrored on the profile too (planUntil), so a purchase or a seat refreshes the token the same way.
          if ((p.role && p.role !== claimsRef.current.role) || (p.orgId ?? null) !== claimsRef.current.orgId
            || (p.planUntil ?? null) !== (claimsRef.current.plan?.until ?? null)) readClaims(u, true).catch(() => {});
        } else setProfile(null);
        setProfileOf(u.uid);
        setLoading(false);
      }, () => { setProfileOf(u.uid); setLoading(false); });
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

  // Account screens. With a session on this device the startup effect has already called start(), and an offline
  // session (offlineUid) is still someone's: neither clears a cache.
  const ensureFirebase = useCallback(() => start(!offlineUid), [start, offlineUid]);

  const value = useMemo<AuthState>(() => ({
    user, profile, profileReady: Boolean(user && profileOf === user.uid), role: claims.role, orgId: claims.orgId, plan: claims.plan, loading, offlineUid,
    ensureFirebase,
    refreshClaims: async () => { if (user) await readClaims(user, true); },
    updateProfile,
    // Every Sign out button (Me, the nav rail, the set-password screen) comes here. This phone stops getting the
    // account's notifications first, while the session can still call unregisterDevice: on a shared phone the next
    // person must not see them. pushSignOut is capped at a few seconds, so signing out never hangs offline.
    signOut: () => signOutOnce(user?.uid),
    configured: firebaseReady,
  }), [user, profile, profileOf, claims, loading, offlineUid, ensureFirebase, readClaims, updateProfile]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

/**
 * Creates the users/{uid} profile for a self-registered learner (fields allowed by the security rules). A sign-up from an
 * invite link can lose a race on a slow connection: joining the organization (setRole in the functions) creates the
 * document first, and the create is then an update the rules refuse. The person's typed name and language still go in,
 * as an edit of their own profile; the function fills in the email from Auth.
 */
export async function createLearnerProfile(uid: string, data: { name: string; email: string; lang: string }) {
  const [{ db }, { doc, serverTimestamp, setDoc }] = await Promise.all([loadFirebase(), import("firebase/firestore")]);
  const ref = doc(db, "users", uid);
  const lastActive = new Date().toISOString();
  try {
    await setDoc(ref, { name: data.name, email: data.email, lang: data.lang, role: "learner", orgId: null, createdAt: serverTimestamp(), lastActive });
  } catch (x) {
    if (!String((x as { code?: string }).code ?? x).includes("permission-denied")) throw x;
    await setDoc(ref, { name: data.name, lang: data.lang, lastActive }, { merge: true });
  }
}
