/**
 * App permissions: each app asks for access to parts of the phone. Some requests match what the app does; others
 * are a warning sign (a torch that wants your contacts). The right answer is to allow only what the job needs.
 */
export type Perm = "camera" | "mic" | "location" | "contacts" | "sms" | "photos" | "notifications" | "calendar";
export type AppId = "torch" | "timetable" | "photo" | "quiz";
export const APPS: Record<AppId, { asks: Perm[]; needs: Perm[] }> = {
  torch: { asks: ["camera", "location", "contacts"], needs: ["camera"] },
  timetable: { asks: ["notifications", "calendar", "mic", "contacts"], needs: ["notifications", "calendar"] },
  photo: { asks: ["photos", "camera", "location", "sms"], needs: ["photos", "camera"] },
  quiz: { asks: ["notifications", "mic", "contacts", "location"], needs: ["notifications"] },
};
/** Requests that can cost money or expose other people if misused. */
export const RISKY: Perm[] = ["sms", "contacts", "mic", "location"];

export type Choices = Partial<Record<AppId, Partial<Record<Perm, boolean>>>>;
/** Right when you allowed exactly what the app needs. */
export function mark(choices: Choices) {
  let right = 0, total = 0;
  for (const [app, { asks, needs }] of Object.entries(APPS) as [AppId, (typeof APPS)[AppId]][]) for (const p of asks) { total++; if ((choices[app]?.[p] ?? false) === needs.includes(p)) right++; }
  return { right, total };
}
