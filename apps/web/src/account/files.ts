/**
 * Small helpers that Me's data section (account/MyData.tsx, startup) and the admin's account actions
 * (admin/AccountActions.tsx, a lazy chunk) share. Pure, with type-only imports: a module both use must not import
 * anything that lazy-loads Firebase (auth/api does), or Rolldown splits the startup bundle (CLAUDE.md).
 */
import type { AccountRefusal } from "../auth/api";

/** Saves `data` as a JSON file on the device. */
export function saveJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Why the server refused (functions/src/account.ts puts it in the error's details), or "". */
export const refusal = (e: unknown) => String((e as { details?: { reason?: string } }).details?.reason ?? "") as AccountRefusal | "";

/**
 * Whether the person's organization manages this account (it made the login: its admins reset its password, suspend and
 * delete it, and the person can't leave or delete it themself). The profile says so (`managedBy`, the organization's id,
 * written by createMembers); a profile from before that field is managed when its login is a username (`domain`, auth/api
 * USERNAME_DOMAIN, passed in: this module must not import auth/api). The same rule as the server's
 * (functions/src/orgMembersCore.ts isManaged). Nobody is managed outside an organization. `createdBy` alone says nothing:
 * an admin who typed someone's own email made that login, but its owner keeps it.
 */
export function isManaged(p: { managedBy?: unknown } | null | undefined, email: string | null | undefined, orgId: string | null | undefined, domain: string): boolean {
  if (!orgId) return false;
  if (typeof p?.managedBy === "string" && p.managedBy) return p.managedBy === orgId;
  return typeof email === "string" && email.toLowerCase().endsWith(`@${domain}`);
}
