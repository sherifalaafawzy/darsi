/**
 * Firebase settings from Vite env, with no SDK imports, so the startup bundle can read them for free.
 * The SDK itself lives in `firebase.ts` and is loaded through `fb.ts` only when someone is (or is becoming) signed in.
 */
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
export const useEmulators = env.VITE_USE_EMULATORS === "true";
export const functionsRegion = env.VITE_FUNCTIONS_REGION || "europe-west1";
