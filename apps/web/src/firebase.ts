/**
 * Firebase wiring. Config comes from Vite env (.env.local for your real project, .env.development for the emulators).
 * Firestore uses a persistent local cache, so learning works offline and syncs when the connection returns.
 * Functions and Storage load on first use: only admin actions and project uploads need them, so learners on old
 * phones never download or parse them.
 */
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import type { Functions } from "firebase/functions";
import type { FirebaseStorage } from "firebase/storage";

const env = import.meta.env;
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
};
export const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
const emulators = env.VITE_USE_EMULATORS === "true";
const host = typeof location !== "undefined" ? location.hostname : "localhost";

export const app = initializeApp(firebaseReady ? firebaseConfig : { apiKey: "missing", projectId: "missing", appId: "missing" });
export const auth = getAuth(app);
// 10 MB is plenty for a person's progress, notes and profile (an admin's member lists too); the SDK default is 40 MB.
export const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager(), cacheSizeBytes: 10 * 1024 * 1024 }) });

if (emulators) {
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
}

let fns: Promise<Functions> | null = null;
const functions = () => (fns ??= import("firebase/functions").then(({ getFunctions, connectFunctionsEmulator }) => {
  const f = getFunctions(app, env.VITE_FUNCTIONS_REGION || "europe-west1");
  if (emulators) connectFunctionsEmulator(f, host, 5001);
  return f;
}));

let store: Promise<FirebaseStorage> | null = null;
/** Cloud Storage, loaded on first use (project evidence uploads). */
export const storage = () => (store ??= import("firebase/storage").then(({ getStorage, connectStorageEmulator }) => {
  const s = getStorage(app);
  if (emulators) connectStorageEmulator(s, host, 9199);
  return s;
}));

/** Typed callable helper; loads the Functions SDK on the first call. */
export const call = <Req, Res>(name: string) => async (data: Req): Promise<Res> => {
  const [{ httpsCallable }, f] = await Promise.all([import("firebase/functions"), functions()]);
  return (await httpsCallable<Req, Res>(f, name)(data)).data;
};
