/**
 * App permissions: each app asks for access to parts of the phone. Some requests match what the app does; others
 * are a warning sign (a torch that wants your contacts). The right answer is to allow only what the job needs.
 * `optional` requests are harmless extras the app works without: allowing or denying them are both right.
 */
export type Perm = "camera" | "mic" | "location" | "contacts" | "sms" | "photos" | "notifications" | "calendar";
export type AppId = "torch" | "timetable" | "photo" | "quiz";
export const APPS: Record<AppId, { asks: Perm[]; needs: Perm[]; optional?: Perm[] }> = {
  torch: { asks: ["camera", "location", "contacts"], needs: ["camera"] },
  timetable: { asks: ["notifications", "calendar", "mic", "contacts"], needs: ["notifications"], optional: ["calendar"] },
  photo: { asks: ["photos", "camera", "location", "sms"], needs: ["photos"], optional: ["camera"] },
  quiz: { asks: ["notifications", "mic", "contacts", "location"], needs: [], optional: ["notifications"] },
};
/** Requests that can cost money or expose other people if misused. */
export const RISKY: Perm[] = ["sms", "contacts", "mic", "location"];

export type Choices = Partial<Record<AppId, Partial<Record<Perm, boolean>>>>;
/** Is this choice right? Needed requests must be allowed, optional ones are up to you, and the rest denied. */
export function isRight(app: AppId, p: Perm, allowed: boolean) {
  const { needs, optional = [] } = APPS[app];
  return optional.includes(p) || allowed === needs.includes(p);
}
/** Right when you allowed what the app needs and denied what it doesn't. */
export function mark(choices: Choices) {
  let right = 0, total = 0;
  for (const [app, { asks }] of Object.entries(APPS) as [AppId, (typeof APPS)[AppId]][]) for (const p of asks) { total++; if (isRight(app, p, choices[app]?.[p] ?? false)) right++; }
  return { right, total };
}
