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
