/**
 * The hidden email domain behind username logins (people without email): `<username>@users.darsiai.org`. Firebase
 * Auth needs an email, so a username is mapped to one. The domain must be one Darsi controls, with no mail set up for
 * it: anyone can ask Firebase to send a password reset to any address, so whoever receives mail for this domain could
 * open every username account. Must match apps/web/src/auth/api.ts.
 *
 * `users.darsi.app` was used until 2026-11: Darsi doesn't own that domain. Accounts are moved off it by
 * scripts/move-username-domain.mjs; until that has run everywhere, it still counts as a username login (an
 * organization's account, never a person's own email) and a new username may not take a name it still holds.
 */
export const USERNAME_DOMAIN = "users.darsiai.org";
export const LEGACY_USERNAME_DOMAINS: readonly string[] = ["users.darsi.app"];
export const USERNAME_DOMAINS: readonly string[] = [USERNAME_DOMAIN, ...LEGACY_USERNAME_DOMAINS];
export type Domains = string | readonly string[];

/** Whether an address is a login at one of these domains (by default every username domain, the old one included). */
export function atDomain(email: unknown, domains: Domains = USERNAME_DOMAINS): boolean {
  if (typeof email !== "string") return false;
  const e = email.toLowerCase();
  return (typeof domains === "string" ? [domains] : domains).some((d) => e.endsWith(`@${d.toLowerCase()}`));
}
export const isUsernameEmail = (email: unknown) => atDomain(email, USERNAME_DOMAINS);
