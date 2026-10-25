/**
 * The only way startup code reaches Firebase. Guests and first-time visitors never download or parse the SDK
 * (about two-thirds of the app's JavaScript); it loads when someone signed in before, or opens an account screen.
 */
import { firebaseConfig, firebaseReady } from "./firebase-config";

type Sdk = typeof import("./firebase");
let sdk: Promise<Sdk> | null = null;
/** Loads the Firebase SDK once. A failed load (offline, chunk not cached yet) can be retried. */
export const loadFirebase = (): Promise<Sdk> => (sdk ??= import("./firebase").catch((e) => { sdk = null; throw e; }));

/** Typed callable helper for Cloud Functions; loads the SDK on the first call. */
export const call = <Req, Res>(name: string) => async (data: Req): Promise<Res> => (await loadFirebase()).call<Req, Res>(name)(data);

export interface StoredSession { uid: string; email: string | null; createdAt: number | null }
const parse = (v: unknown): StoredSession | null => {
  try {
    const u = (typeof v === "string" ? JSON.parse(v) : v) as { uid?: unknown; email?: unknown; createdAt?: unknown } | null;
    return u && typeof u.uid === "string" && u.uid ? { uid: u.uid, email: typeof u.email === "string" ? u.email : null, createdAt: u.createdAt ? Number(u.createdAt) || null : null } : null;
  } catch { return null; }
};

/** Firebase Auth's own IndexedDB record, read without the SDK. Resolves null if the database doesn't exist (and never creates it). */
function readAuthDb(key: string): Promise<unknown> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let req: IDBOpenDBRequest;
    try { req = indexedDB.open("firebaseLocalStorageDb"); } catch { return resolve(null); }
    req.onupgradeneeded = () => { req.transaction?.abort(); resolve(null); }; // it didn't exist: leave no empty database behind
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      try {
        if (!db.objectStoreNames.contains("firebaseLocalStorage")) { db.close(); return resolve(null); }
        const get = db.transaction("firebaseLocalStorage", "readonly").objectStore("firebaseLocalStorage").get(key);
        get.onsuccess = () => { db.close(); resolve((get.result as { value?: unknown } | undefined)?.value ?? null); };
        get.onerror = () => { db.close(); resolve(null); };
      } catch { db.close(); resolve(null); }
    };
  });
}

/**
 * Is someone signed in on this device? Answers from Firebase Auth's persisted session (IndexedDB, then localStorage)
 * without loading the SDK, so a guest's startup costs nothing.
 */
export async function storedSession(): Promise<StoredSession | null> {
  if (!firebaseReady) return null;
  const key = `firebase:authUser:${firebaseConfig.apiKey}:[DEFAULT]`;
  const fromDb = parse(await readAuthDb(key));
  if (fromDb) return fromDb;
  try { return parse(typeof localStorage !== "undefined" ? localStorage.getItem(key) : null); } catch { return null; }
}
