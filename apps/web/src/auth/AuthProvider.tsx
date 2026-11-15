import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { firebaseReady } from "../firebase-config";
import { loadFirebase, storedSession } from "../fb";
import { pushSignOut } from "../notify/push";
import { forgetAccount, hasUnsent } from "../state/store";
import { forgetOrgFiles, SLOW_MS } from "../content/load";
import { clearRuns } from "../lesson/engine";
import { leftOrg } from "./LeftOrg";
import { schoolSignIn, signedOutHere as ssoSignedOut, ssoNote } from "./sso";
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
  /**
   * This session came through a school's sign-in (the token's `sso` claim, set by functions/src/sso.ts): that
   * organization's id, else null. Its end goes back to the school's sign-in, and Sign out says the school may still
   * have the person signed in.
   */
  sso: string | null;
  /**
   * `role`, `orgId` and `plan` came from a token read in this page. False while they are the copy kept on this device
   * (the token expired and the phone is offline) or the "learner" default: good enough to show the person their own
   * screens, never to conclude that they left their organization (state/orgBrand.ts).
   */
  claimsKnown: boolean;
  loading: boolean;
  /**
   * The uid of a session saved on this device whose SDK has not published it yet: it could not load (offline, chunk not
   * cached), or the connection hangs. Learning carries on in that account's local store; it reconnects when it can.
   */
  offlineUid: string | null;
  /**
   * A saved session is being opened and the SDK hasn't answered for it yet: the SDK is loading, or reading the session,
   * so `user` arrives, or the session ends, when the connection lets it. False for a guest, once the SDK has answered,
   * and once it could not load at all (offline before its file was cached; it is tried again when the phone is online).
   * With `offlineUid`, a page that needs the account waits for it instead of treating the person as signed out.
   */
  connecting: boolean;
  /** Loads the Firebase SDK and starts listening for sign-in. Account screens call it; it is a no-op once started. */
  ensureFirebase: () => Promise<void>;
  refreshClaims: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  signOut: () => Promise<void>;
  configured: boolean;
}
const Ctx = createContext<AuthState | null>(null);
interface Claims { role: Role; orgId: string | null; plan: { id: string; until: number } | null; sso: string | null }
const LEARNER: Claims = { role: "learner", orgId: null, plan: null, sso: null };
const ROLES: readonly Role[] = ["learner", "student", "teacher", "orgAdmin", "superadmin"];

/**
 * The claims last read from a token, per account, in localStorage "darsi:claims:<uid>". The ID token lasts an hour and
 * reading it again needs the network, so without this copy a school account opened offline looked like a plain learner:
 * its organization's name, logo and courses left the screen and the staff pages sent it to its lessons. Only what the
 * screen shows depends on it; the security rules read the real token. It is written at every successful read, used only
 * for its own uid when the token can't be read, and removed when the account signs out or its session ends.
 * Private mode (localStorage throws): nothing is kept, as before.
 */
const kept = {
  get(uid: string): Claims | null {
    try {
      const c = JSON.parse(localStorage.getItem(`darsi:claims:${uid}`) ?? "null") as { role?: unknown; orgId?: unknown; plan?: { id?: unknown; until?: unknown } | null; sso?: unknown } | null;
      if (!c || !ROLES.includes(c.role as Role)) return null;
      const until = Number(c.plan?.until) || 0;
      return { role: c.role as Role, orgId: typeof c.orgId === "string" && c.orgId ? c.orgId : null, plan: typeof c.plan?.id === "string" && until ? { id: c.plan.id, until } : null, sso: typeof c.sso === "string" && c.sso ? c.sso : null };
    } catch { return null; }
  },
  set(uid: string, c: Claims) {
    // `sso` only for a school session: every other account's copy stays as it was before school sign-in.
    try { const k = `darsi:claims:${uid}`, v = JSON.stringify(c.sso ? c : { role: c.role, orgId: c.orgId, plan: c.plan }); if (localStorage.getItem(k) !== v) localStorage.setItem(k, v); } catch { /* private mode */ }
  },
  drop(uid: string) { try { localStorage.removeItem(`darsi:claims:${uid}`); } catch { /* private mode */ } },
};

/**
 * localStorage "darsi:signedOut" ("<uid> <ms>"): the account last signed out on purpose on this device, and when (one
 * entry, replaced by the next). Another tab still open as that account sees its session end too; this tells it that
 * Sign out did, so it must not run the clean-up for a session the server ended (sessionEnded), which would delete the
 * unsent work Sign out kept here. The account signing in here again takes the mark away, but not within a minute of
 * it: a tab opened while that sign-out is still at work finds the session, and must not unmark it.
 */
const SIGNED_OUT = "darsi:signedOut";
const leaving = {
  read: (): [string, number] => { try { const [uid = "", at = ""] = (localStorage.getItem(SIGNED_OUT) ?? "").split(" "); return [uid, Number(at) || 0]; } catch { return ["", 0]; } },
  is: (uid: string) => leaving.read()[0] === uid,
  set: (uid: string) => { try { localStorage.setItem(SIGNED_OUT, `${uid} ${Date.now()}`); } catch { /* private mode */ } },
  clear: (uid: string, now = false) => {
    const [who, at] = leaving.read();
    if (who === uid && (now || Date.now() - at > 60e3)) try { localStorage.removeItem(SIGNED_OUT); } catch { /* private mode */ }
  },
};

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
 * sessionStorage: the server ended this tab's session (sessionEnded), "kept" when the account's unsent work stayed on
 * the device, "out" otherwise. App says so once on the page the person lands on, and removes it.
 */
export const ENDED_NOTE = "darsi:endedNote";
/** A moment for the acks of writes that just reached the server to clear the unsent mark (state/sync.ts). */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

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
 * sign-in. Unsent work (offline, a slow connection, or a project typed and not sent yet) is the exception: the local copy
 * keeps it, sync sends the lessons and notes at this account's next sign-in on this device (a project draft waits there
 * for the person to send it), and the person is told so. The page then starts afresh, as a guest.
 */
async function signOutHere(uid: string | undefined, to = "/") {
  if (uid) await pushSignOut(uid); // while the session can still call unregisterDevice
  const [{ auth, db }, { signOut }, fs] = await Promise.all([loadFirebase(), import("firebase/auth"), import("firebase/firestore")]);
  // Only acknowledged writes are in the cloud. Offline, this never resolves: the cap decides. (It throws at once on an
  // instance another tab's sign-out already stopped: then nothing is known to be sent.)
  let synced = false;
  if (uid) try { synced = (await within(fs.waitForPendingWrites(db).then(() => true), 5000, false)) && navigator.onLine !== false; } catch { synced = false; }
  // An empty queue isn't everything: lessons sync held back (finished offline in an earlier session, before this one's
  // first server read, or taken over from the guest) never entered it. The unsent mark knows about those. Nor is a
  // project draft with words in it that was never sent: only the person sends it, and the form says it is kept on this
  // phone until they do. It stays, with the rest of the account's copy (only this account opens it), as after a session
  // the server ended.
  if (uid && synced) { await tick(); synced = !hasUnsent(uid, true); }
  await signOut(auth);
  if (!uid) return;
  try { await fs.terminate(db); await clearCache(fs, db); } catch { purgeLater.set(true); }
  if (synced) { await forgetAccount(uid).catch(() => {}); clearRuns(uid); } // with the lessons it had in progress here
  else try { sessionStorage.setItem(KEPT_KEY, "1"); } catch { /* private mode */ }
  await forgetOrgFiles().catch(() => {}); // before the reload cuts it short (content/load.ts also starts it)
  // The Firestore instance is terminated: a fresh page gets a new one (a school session's: its school's sign-in).
  location.replace(to);
}
/**
 * The sign-out under way, if any: a second tap (the nav rail and Me while it waits for a slow connection) joins it, rather
 * than running again on a stopped Firestore and telling the person, wrongly, that their work wasn't sent.
 */
let signingOut: Promise<void> | null = null;
const signOutOnce = (uid: string | undefined, to?: string) => (signingOut ??= signOutHere(uid, to).finally(() => { signingOut = null; }));

/**
 * sessionStorage "darsi:ended": the account whose ended session this tab has already cleaned up after (sessionEnded),
 * until someone signs in. The clean-up restarts the page; if the record of the session were still on the device then
 * (a damaged one the SDK won't open, say), the fresh page must not clean and restart again, for ever.
 */
const ended = {
  is: (uid: string) => { try { return sessionStorage.getItem("darsi:ended") === uid; } catch { return false; } },
  set: (uid: string) => { try { sessionStorage.setItem("darsi:ended", uid); } catch { /* private mode */ } },
  clear: () => { try { sessionStorage.removeItem("darsi:ended"); } catch { /* private mode */ } },
};

/**
 * A session the server ended (an admin reset the password, suspended or removed the account, or took a role away: the
 * token can't be refreshed any more; or the Auth SDK dropped it at start for a reason other than the network) leaves a
 * shared phone or lab PC as Sign out does: Firestore's cache, the account's work in the local store, its lessons in
 * progress, its organization's files and its kept claims all go, and the page starts afresh as a guest.
 * Except unsent work: Firestore has already put the account's queue aside, but the unsent mark (state/store.tsx
 * `unsent`, cleared only when the server has everything) or a project draft never sent says the device holds work the
 * cloud lacks. Then the account's local store, its lessons in progress and its drafts stay (only that account opens
 * them), the next sign-in of that account here sends them (sync), and the person is told so once (ENDED_NOTE).
 * The store is marked first (forgetAccount does it before it awaits anything), so the account's screens, still mounted
 * for a moment, can't save it back. The cache is cleared now if the SDK stops in time; the flag makes the next account
 * screen finish it otherwise (start(true)). Never throws.
 * `school`: the session came through a school's sign-in. It ends there (/signin?school=<slug>, "Your school asks you to
 * sign in again"), never as a guest: the school's sign-in decides how long its sessions last (functions/src/sso.ts).
 */
async function sessionEnded(uid: string, fs: typeof import("firebase/firestore"), db: Firestore, school: string | null = null) {
  ended.set(uid);
  purgeLater.set(true); // if the page closes before the clear below
  const keep = hasUnsent(uid, true);
  // A school session's page says it itself (and the kept work, with the toast as usual).
  if (school) ssoNote.set("again");
  try { if (keep || !school) sessionStorage.setItem(ENDED_NOTE, keep ? "kept" : "out"); } catch { /* private mode: nothing said */ }
  const forgot = keep ? Promise.resolve() : forgetAccount(uid).catch(() => {});
  if (!keep) clearRuns(uid);
  kept.drop(uid);
  try { await within(fs.terminate(db), 3000, undefined); await clearCache(fs, db); } catch { purgeLater.set(true); }
  await forgot;
  await forgetOrgFiles().catch(() => {});
  location.replace(school ? schoolSignIn(school) : "/");
}

/**
 * Firebase is loaded only when needed: at startup if a session is saved on this device, otherwise when an account
 * screen opens. Guests and first-time visitors never download or parse the SDK.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  /** Whose profile the last read answered for: ready once it is the signed-in account's. */
  const [profileOf, setProfileOf] = useState<string | null>(null);
  const [claims, setClaims] = useState<Claims>(LEARNER);
  const [claimsKnown, setClaimsKnown] = useState(false);
  const [loading, setLoading] = useState(firebaseReady);
  const [offlineUid, setOfflineUid] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const claimsRef = useRef(claims);
  claimsRef.current = claims;
  const knownRef = useRef(claimsKnown);
  knownRef.current = claimsKnown;
  const started = useRef<Promise<void> | null>(null);
  const stop = useRef<() => void>(() => {});
  /** Who the SDK says is signed in (before the claims are read and the user is published). */
  const sdkUser = useRef<User | null>(null);
  /** Whose page this is: the session stored on this device at start, then the SDK's user. Null for a guest. */
  const owner = useRef<string | null>(null);
  /** The SDK is on the page and reporting the auth state; it has published its first answer (a user, or nobody). */
  const listening = useRef(false);
  const answered = useRef(false);
  /** The start timer ran out with no claims kept for the account: the first screen waits for the SDK's answer. */
  const late = useRef(false);
  /** The account whose lastActive this page has looked at: once per page load. */
  const touched = useRef<string | null>(null);

  const readClaims = useCallback(async (u: User, force = false) => {
    const r = await u.getIdTokenResult(force);
    // A read that outlived its session (signed out, or another account, meanwhile) is nobody's: not shown, not kept.
    if (sdkUser.current?.uid !== u.uid) return;
    const until = Number(r.claims.planUntil) || 0;
    const next: Claims = { role: (r.claims.role as Role) ?? "learner", orgId: (r.claims.orgId as string) ?? null, plan: typeof r.claims.plan === "string" && until ? { id: r.claims.plan, until } : null,
      sso: typeof r.claims.sso === "string" && r.claims.sso ? r.claims.sso : null };
    kept.set(u.uid, next);
    setClaims(next); setClaimsKnown(true);
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
    listening.current = true;
    const unsubAuth = onAuthStateChanged(fb.auth, async (u) => {
      unsubProfile();
      const was = owner.current;
      sdkUser.current = u; owner.current = u?.uid ?? null;
      if (!u) {
        answered.current = true;
        // Nobody signed out here (this tab's Sign out is `signingOut`, another tab's left its mark), yet the account this
        // page belonged to is gone: the server ended its session. A guest opening an account screen has no `was`.
        // A school session goes back to its school's sign-in: the claims on screen are still that session's, or, when
        // it ended while the app was closed (this is the SDK's first answer, so no token was read and the screen has
        // the "learner" default), the copy kept on this device says so. Read before the kept copy is dropped below.
        const cleaning = was && !signingOut && !leaving.is(was) && !ended.is(was)
          ? sessionEnded(was, fs, fb.db, claimsRef.current.sso ?? kept.get(was)?.sso ?? null) : null;
        if (was) kept.drop(was);
        // Also clears offlineUid: a session that ended while the phone was offline (expired, revoked) makes this a guest.
        setUser(null); setProfile(null); setProfileOf(null); setClaims(LEARNER); setClaimsKnown(false); setOfflineUid(null); setConnecting(false); setLoading(false);
        await cleaning;
        return;
      }
      leaving.clear(u.uid); ended.clear(); // signed in here again
      // A sign-in in this page (not the session it started with): "You left <organization>" has done its job.
      if (was !== u.uid) leftOrg.clear();
      if (was && was !== u.uid) kept.drop(was); // another account took the page over without a sign-out
      // Claims first, so routing never sees a signed-in admin with the default "learner" role. A token that can't be
      // read (expired, and the phone is offline) leaves the claims this account last had here, never another account's.
      const read = await readClaims(u).then(() => true, () => false);
      if (sdkUser.current !== u) return; // signed out, or another account, while the token was read
      if (!read) { setClaims(kept.get(u.uid) ?? LEARNER); setClaimsKnown(false); }
      answered.current = true;
      setUser(u); setOfflineUid(null); setConnecting(false);
      // The start timer has already run out, and held the screen for this answer: from here only the profile is
      // still to come (profileReady says when), as the timer does for a user it finds published.
      if (late.current) setLoading(false);
      unsubProfile =fs.onSnapshot(fs.doc(fb.db, "users", u.uid), (snap) => {
        if (snap.exists()) {
          const p = { uid: u.uid, ...(snap.data() as Omit<Profile, "uid">) };
          setProfile(p);
          // Claims changed server-side (joined org, role change) → refresh the token so rules see it.
          // Darsi Super is mirrored on the profile too (planUntil), so a purchase or a seat refreshes the token the same way.
          if ((p.role && p.role !== claimsRef.current.role) || (p.orgId ?? null) !== claimsRef.current.orgId
            || (p.planUntil ?? null) !== (claimsRef.current.plan?.until ?? null)) readClaims(u, true).catch(() => {});
          // The claims on screen are still the kept copy, and the server just answered (a connection that came back
          // without an "online" event): the token can be read now.
          else if (!knownRef.current && snap.metadata?.fromCache === false) readClaims(u).catch(() => {});
          // "Last seen", to the day: one write (and one run of the function it wakes) on the first start of each day
          // (UTC, as it is stored), not on every start. Looked at once, when the profile first arrives in this page.
          if (touched.current !== u.uid) {
            touched.current = u.uid;
            const last = (p as Profile & { lastActive?: unknown }).lastActive, now = new Date().toISOString();
            if (typeof last !== "string" || last.slice(0, 10) !== now.slice(0, 10)) fs.updateDoc(fs.doc(fb.db, "users", u.uid), { lastActive: now }).catch(() => {});
          }
        } else setProfile(null);
        setProfileOf(u.uid);
        setLoading(false);
      }, () => { setProfileOf(u.uid); setLoading(false); });
    });
    stop.current = () => { unsubAuth(); unsubProfile(); };
  })().catch((e) => { started.current = null; throw e; })), [readClaims]);

  useEffect(() => {
    if (!firebaseReady) return;
    let live = true, session: string | null = null, slow: ReturnType<typeof setTimeout> | undefined;
    const retry = () => {
      if (session && !started.current) { setConnecting(true); start().catch(() => { if (live) setConnecting(false); }); } // the SDK never loaded
      // The token couldn't be read at start (expired, offline): the claims on screen are the kept copy. One read now.
      const u = sdkUser.current;
      if (u && !knownRef.current) readClaims(u).catch(() => {});
    };
    (async () => {
      const s = await storedSession();
      if (!live) return;
      if (!s) { setLoading(false); return; } // guest or signed out: no SDK at all
      session = owner.current = s.uid;
      setConnecting(true);
      // A connection that hangs rather than fails (the SDK chunk, or the expired token's refresh) must not hold the
      // first screen for the 30 to 60 seconds it takes to give up: after SLOW_MS the person gets their own lessons, in
      // the state the app already has for "offline before the SDK was cached". The SDK publishes the user when it can;
      // the store is that uid's either way, so nothing remounts. With the SDK on the page the kept claims show (the
      // staff pages can read its cache); without it, as before, only lessons work. Once the user is published, only
      // the wait for the profile is cut short (as after a sign-in: profileReady says when it has been read).
      // Only with a copy of the account's claims kept on this device. Without one (the account's first start with a
      // build that keeps them, or private mode) the role isn't known, and a staff account published as a learner is
      // sent off its page for good (App.tsx Allow, homeFor): that start waits for the SDK, as every start did before
      // this timer. `late` then releases the screen as soon as the user is published.
      slow = setTimeout(() => {
        if (!live) return;
        if (!answered.current) {
          const c = kept.get(s.uid);
          if (!c) { late.current = true; return; }
          setOfflineUid(s.uid); if (listening.current) setClaims(c);
        }
        setLoading(false);
      }, SLOW_MS);
      try { await start(); }
      catch { clearTimeout(slow); if (live) { setOfflineUid(s.uid); setConnecting(false); setLoading(false); } } // offline before the SDK chunk was cached
    })();
    window.addEventListener("online", retry);
    return () => { live = false; clearTimeout(slow); window.removeEventListener("online", retry); stop.current(); };
  }, [start, readClaims]);

  const updateProfile = useCallback(async (patch: Partial<Profile>) => {
    if (!user) return;
    const [{ db }, { doc, setDoc }] = await Promise.all([loadFirebase(), import("firebase/firestore")]);
    await setDoc(doc(db, "users", user.uid), patch, { merge: true });
  }, [user]);

  // Account screens. With a session on this device the startup effect has already called start(), and an offline
  // session (offlineUid) is still someone's: neither clears a cache.
  const ensureFirebase = useCallback(() => start(!offlineUid), [start, offlineUid]);

  const value = useMemo<AuthState>(() => ({
    user, profile, profileReady: Boolean(user && profileOf === user.uid), role: claims.role, orgId: claims.orgId, plan: claims.plan, sso: claims.sso, claimsKnown, loading, offlineUid, connecting,
    ensureFirebase,
    refreshClaims: async () => { if (user) await readClaims(user, true); },
    updateProfile,
    // Every Sign out button (Me, the nav rail, the set-password screen) comes here. This phone stops getting the
    // account's notifications first, while the session can still call unregisterDevice: on a shared phone the next
    // person must not see them. pushSignOut is capped at a few seconds, so signing out never hangs offline.
    // Around it: other tabs are told this is a sign-out (`leaving`; taken back if it fails), and the kept claims go.
    // A school session (claims.sso) signs out to its school's sign-in: the next school sign-in on this device asks the
    // provider for a fresh login (a shared computer), and the page says the school may still have them signed in.
    signOut: () => {
      const uid = user?.uid, school = claims.sso;
      if (uid) leaving.set(uid);
      if (school) { ssoSignedOut.set(true); ssoNote.set("out"); }
      return signOutOnce(uid, school ? schoolSignIn(school) : undefined).then(() => { if (uid) kept.drop(uid); },
        (e) => { if (uid) leaving.clear(uid, true); if (school) ssoNote.take(); throw e; });
    },
    configured: firebaseReady,
  }), [user, profile, profileOf, claims, claimsKnown, loading, offlineUid, connecting, ensureFirebase, readClaims, updateProfile]);
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
