/**
 * The pure parts of createMembers (index.ts), tested in test/members.test.ts: the order accounts are made in, the
 * logins a teacher can be named by in a sheet, and what a login that is already taken means.
 */

/** Roles a pupil's "teacher email" may point at. */
const TEACHING = new Set(["teacher", "orgAdmin"]);

/**
 * Row indexes in the order to create them: teachers and admins first, each group in file order. A pupil can then name
 * a teacher listed anywhere in the same request (the sheet's template lists the teacher first, but nothing says a
 * sheet must), and a teacher created in this request is found.
 */
export function creationOrder(roles: readonly string[]): number[] {
  return roles.map((r, i) => [TEACHING.has(r) ? 0 : 1, i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, i]) => i);
}

/**
 * What a sheet's teacher column may hold for an account: its email, and for a username login the username and the
 * hidden email it maps to. All lower case, as createMembers compares them.
 */
export function teacherKeys(email: string, username: string | null | undefined, toEmail: (u: string) => string): string[] {
  const keys = new Set([email.toLowerCase()]);
  if (username) { keys.add(username.toLowerCase()); keys.add(toEmail(username).toLowerCase()); }
  return [...keys].filter(Boolean);
}

/**
 * Why a row wasn't created, as a code the admin's screen words in their language (AddPeople's Results): the server's
 * English `error` stays for older apps and the logs.
 */
export type RowReason = "missingName" | "invalidEmail" | "invalidUsername" | "exists" | "taken";

/**
 * What a profile lacks that its owner's app would have written at sign-up, from the Auth account: the email (Auth's,
 * in lower case, as the rules compare it), the name and the creation time. A server write can reach a brand-new
 * account before its app creates the profile (joining with an invite code, or a guest's lessons synced at sign-up);
 * the app's own create is then refused because the document exists, so the server fills these. Nothing for a profile
 * that has its email (every real profile does), or when Auth has no account. `createdAt: true` means "now".
 */
export function missingBasics(p: { email?: unknown; name?: unknown; createdAt?: unknown } | undefined, a: { email?: string; displayName?: string } | null | undefined):
  { email?: string; name?: string; createdAt?: true } {
  if (!a || (typeof p?.email === "string" && p.email)) return {};
  const name = (a.displayName ?? "").trim().slice(0, 120);
  return {
    ...(a.email ? { email: a.email.toLowerCase() } : {}),
    ...(!p?.name && name ? { name } : {}),
    ...(!p?.createdAt ? { createdAt: true as const } : {}),
  };
}

/** How many logins createMembers draws for a person before it gives up (each draw is one in tens of thousands). */
export const MAX_DRAWS = 6;

/**
 * createUser failed: "retry" with a new login when the login was generated and is taken (draws left), "taken" when the
 * admin typed a username someone already has, "exists" when the typed email already has an account, null for any other
 * failure.
 */
export function onCreateError(code: string | undefined, o: { generated: boolean; typedEmail: boolean; draws: number }): "retry" | "taken" | "exists" | null {
  if (code !== "auth/email-already-exists") return null;
  if (o.generated) return o.draws < MAX_DRAWS ? "retry" : "taken";
  return o.typedEmail ? "exists" : "taken";
}
