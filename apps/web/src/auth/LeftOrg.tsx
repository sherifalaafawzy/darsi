import { useState } from "react";
import { isolate, useI18n } from "../i18n";
import { k } from "../legal/strings";

/**
 * "You left <organization>", for after the page has restarted. Leaving ends the account's sessions with the membership
 * (functions/src/billing.ts writeClaims revokes them whenever an account loses an organization), so moments after
 * Me's "Leave" succeeds the app starts afresh, signed out (AuthProvider sessionEnded). Without this the person would
 * find themself on the home page with no word of why. Kept for this tab only, and only for a while: it is said on the
 * home page, the sign-in screen and Me until they sign in again.
 */
const KEY = "darsi:leftOrg";
const FOR_MS = 15 * 60_000;
export const leftOrg = {
  /** `name`: the organization's name, "" when this phone never learnt it. */
  set(name: string) { try { sessionStorage.setItem(KEY, JSON.stringify({ name, at: Date.now() })); } catch { /* private mode: no note */ } },
  get(): string | null {
    try {
      const v = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { name?: unknown; at?: unknown } | null;
      return v && typeof v.name === "string" && typeof v.at === "number" && Date.now() - v.at < FOR_MS ? v.name : null;
    } catch { return null; }
  },
  clear() { try { sessionStorage.removeItem(KEY); } catch { /* private mode */ } },
};

/** The note, where someone signed out by leaving will look next. Nothing for everyone else. */
export function LeftOrgNote() {
  const { t } = useI18n();
  const [name] = useState(leftOrg.get);
  if (name === null) return null;
  return <p className="notice ok" role="status">{t(k("leave.signIn"), { org: name ? isolate(name) : t(k("leave.yourOrg")) })}</p>;
}
