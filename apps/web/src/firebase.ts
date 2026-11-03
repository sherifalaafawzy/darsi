/**
 * The Firebase SDK. Never import this from code on the guest/learner startup path: go through `fb.ts`
 * (`loadFirebase()`), which loads it only when someone is or is becoming signed in. Static imports are fine
 * in modules that are themselves lazy (staff screens, the account screens).
 * Firestore uses a persistent local cache, so learning works offline and syncs when the connection returns.
 * Functions and Storage load on first use: only admin actions and project uploads need them.
 */
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import type { Functions } from "firebase/functions";
import type { FirebaseStorage } from "firebase/storage";
import { firebaseConfig, firebaseReady, functionsRegion, useEmulators } from "./firebase-config";

export { firebaseConfig, firebaseReady } from "./firebase-config";
const host = typeof location !== "undefined" ? location.hostname : "localhost";

export const app = initializeApp(firebaseReady ? firebaseConfig : { apiKey: "missing", projectId: "missing", appId: "missing" });
export const auth = getAuth(app);
// 10 MB is plenty for a person's progress, notes and profile (an admin's member lists too); the SDK default is 40 MB.
export const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager(), cacheSizeBytes: 10 * 1024 * 1024 }) });

if (useEmulators) {
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  // npm run local moves Firestore off 8080 when something else holds that port.
  connectFirestoreEmulator(db, host, Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT) || 8080);
}

let fns: Promise<Functions> | null = null;
const functions = () => (fns ??= import("firebase/functions").then(({ getFunctions, connectFunctionsEmulator }) => {
  const f = getFunctions(app, functionsRegion);
  if (useEmulators) connectFunctionsEmulator(f, host, 5001);
  return f;
}));

let store: Promise<FirebaseStorage> | null = null;
/** Cloud Storage, loaded on first use (project evidence uploads). */
export const storage = () => (store ??= import("firebase/storage").then(({ getStorage, connectStorageEmulator }) => {
  const s = getStorage(app);
  if (useEmulators) connectStorageEmulator(s, host, 9199);
  return s;
}));

// The tutor's answers can take an explainer and a repair turn (functions/src/agent.ts), longer than the SDK's 70 s.
const SLOW: Record<string, number> = { tutorAsk: 180_000 };

/** Typed callable helper; loads the Functions SDK on the first call. */
export const call = <Req, Res>(name: string) => async (data: Req): Promise<Res> => {
  const [{ httpsCallable }, f] = await Promise.all([import("firebase/functions"), functions()]);
  return (await httpsCallable<Req, Res>(f, name, SLOW[name] ? { timeout: SLOW[name] } : undefined)(data)).data;
};

/** A JSON file from Storage, read with the member's credentials (org-only course content: content/load.ts). */
export async function storageJSON(path: string): Promise<unknown> {
  const [{ getBytes, ref }, s] = await Promise.all([import("firebase/storage"), storage()]);
  return JSON.parse(new TextDecoder().decode(await getBytes(ref(s, path))));
}

/** A small image from Storage as a data: URL (an organization's logo, ≤ 100 KB), so it can be kept in the local store. */
export async function storageDataUrl(path: string): Promise<string> {
  const [{ getBlob, ref }, s] = await Promise.all([import("firebase/storage"), storage()]);
  const got = await getBlob(ref(s, path), 100 * 1024);
  // Some servers (the Storage emulator) answer octet-stream; the file's extension says what the image is.
  const ext = path.split(".").pop();
  const type = /^image\//.test(got.type) ? got.type : ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  const blob = got.type === type ? got : new Blob([got], { type });
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
