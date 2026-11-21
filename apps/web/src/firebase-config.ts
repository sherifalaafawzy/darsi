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
export const useEmulators = env.VITE_USE_EMULATORS === "true";
/**
 * `npm run dev` never reaches the live project: if apps/web/.env.development (the emulators) is missing, sign-in,
 * content and analytics stay off rather than reading and writing live data. VITE_ALLOW_LIVE_DEV=true allows it on purpose.
 * Builds (production mode) and the unit tests (test mode) are not affected.
 */
const liveInDev = env.MODE === "development" && !useEmulators && env.VITE_ALLOW_LIVE_DEV !== "true";
if (liveInDev) console.error("Darsi: npm run dev is not using the Firebase emulators (apps/web/.env.development is missing), so Firebase is off.");
export const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId) && !liveInDev;
export const functionsRegion = env.VITE_FUNCTIONS_REGION || "europe-west1";
/** Web Push certificate (public key) for FCM; empty = notifications not set up yet, and the app says so. */
export const vapidKey: string = env.VITE_FIREBASE_VAPID_KEY ?? "";
