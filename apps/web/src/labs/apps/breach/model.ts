/**
 * Reused passwords: a small forum is hacked and its passwords leak. Attackers try the same email and password on every
 * other site (credential stuffing). Sites with a different password hold; two-step sign-in stops the rest. And if they
 * get into the email account, they can "reset" the passwords of everything else.
 */
export const SITES = ["email", "school", "shop", "bank", "forum"] as const;
export type Site = (typeof SITES)[number];
export const LEAKED: Site = "forum";
export interface Account { same: boolean; twoStep: boolean }
export type Setup = Record<Site, Account>;
export type Outcome = "safe-unique" | "safe-2fa" | "taken" | "taken-reset";

export const PRESETS: Record<"lazy" | "careful", Setup> = {
  lazy: { email: { same: true, twoStep: false }, school: { same: true, twoStep: false }, shop: { same: true, twoStep: false }, bank: { same: true, twoStep: true }, forum: { same: true, twoStep: false } },
  careful: { email: { same: false, twoStep: true }, school: { same: false, twoStep: true }, shop: { same: false, twoStep: false }, bank: { same: false, twoStep: true }, forum: { same: false, twoStep: false } },
};

export function attack(setup: Setup): Record<Site, Outcome> {
  const out = {} as Record<Site, Outcome>;
  // The leaked password works on the forum itself, and on every site that uses the same one. (The forum's own
  // "same" means nothing: it is the password that leaked.)
  for (const site of SITES) {
    const works = site === LEAKED || setup[site].same;
    out[site] = !works ? "safe-unique" : setup[site].twoStep ? "safe-2fa" : "taken";
  }
  // With the email account, "forgot password" links let them into anything without two-step sign-in.
  if (out.email === "taken") for (const site of SITES) if (out[site] === "safe-unique" && !setup[site].twoStep) out[site] = "taken-reset";
  return out;
}
export const lost = (o: Record<Site, Outcome>) => SITES.filter((s) => o[s] === "taken" || o[s] === "taken-reset").length;
