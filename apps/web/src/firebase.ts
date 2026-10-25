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
  connectFirestoreEmulator(db, host, 8080);
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

/** Typed callable helper; loads the Functions SDK on the first call. */
export const call = <Req, Res>(name: string) => async (data: Req): Promise<Res> => {
  const [{ httpsCallable }, f] = await Promise.all([import("firebase/functions"), functions()]);
  return (await httpsCallable<Req, Res>(f, name)(data)).data;
};
