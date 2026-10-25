/**
 * The Admin SDK, initialised once, and the helpers every callable shares.
 * index.ts and notify.ts both import from here, so neither imports the other's internals.
 */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";

initializeApp();
setGlobalOptions({ region: "europe-west1", maxInstances: 20 });
export const db = getFirestore();
export const auth = getAuth();
export const messaging = getMessaging();

export type Role = "learner" | "student" | "teacher" | "orgAdmin" | "superadmin";

export function caller(req: CallableRequest) {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  return { uid: req.auth.uid, role: (req.auth.token.role as Role | undefined) ?? "learner", orgId: req.auth.token.orgId as string | undefined };
}
export async function audit(action: string, by: string, data: Record<string, unknown>) {
  await db.collection("audit").add({ action, by, ...data, at: FieldValue.serverTimestamp() });
}
export const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
