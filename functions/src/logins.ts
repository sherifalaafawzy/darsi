import type { UserRecord } from "firebase-admin/auth";
import { auth } from "./admin.js";
import { legacyEmails } from "./passwords.js";

/**
 * The account behind a login address. A username login (usernameDomain.ts) not yet moved off the old domain is found
 * there too, so admins find and assign it under its username while scripts/move-username-domain.mjs hasn't run.
 */
export async function accountByLogin(email: string): Promise<UserRecord | null> {
  const found = await auth.getUserByEmail(email).catch(() => null);
  if (found) return found;
  for (const old of legacyEmails(email)) {
    const u = await auth.getUserByEmail(old).catch(() => null);
    if (u) return u;
  }
  return null;
}

/** Whether an account at an old username domain still holds this username login's name. */
export async function legacyHolds(email: string): Promise<boolean> {
  for (const old of legacyEmails(email)) if (await auth.getUserByEmail(old).catch(() => null)) return true;
  return false;
}
