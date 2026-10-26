/**
 * What others see on public Wi-Fi. Anyone running the hotspot (or a fake one with the same name) sees the traffic
 * that passes through it. Plain HTTP shows everything, passwords included; HTTPS hides what you read and type but not
 * which sites you visit; a VPN hides the sites too, handing that view to the VPN company instead.
 */
export type Conn = "http" | "https" | "vpn";
export type Action = "news" | "login" | "search";
export interface Line { what: "site" | "page" | "typed" | "size" | "tunnel"; text: string; hidden?: boolean }

const DETAILS: Record<Action, { site: string; page: string; typed?: string; kb: number }> = {
  news: { site: "news.example", page: "news.example/sport/school-football-final", kb: 420 },
  login: { site: "portal.school.example", page: "portal.school.example/login", typed: "user=amal.h  password=sunshine2024", kb: 12 },
  search: { site: "search.example", page: "search.example/?q=headache+medicine+for+children", typed: "headache medicine for children", kb: 85 },
};

/** Scrambled stand-in for encrypted bytes: same length every time for the same text. */
export function scramble(text: string) {
  let h = 2166136261, out = "";
  for (let i = 0; i < text.length; i++) { h = Math.imul(h ^ text.charCodeAt(i), 16777619); out += "0123456789abcdef"[(h >>> 7) & 15]; }
  return out;
}

/** What the person running the hotspot can read for one action. */
export function seen(action: Action, conn: Conn): Line[] {
  const d = DETAILS[action];
  if (conn === "vpn") return [{ what: "tunnel", text: "vpn.provider.example" }, { what: "page", text: scramble(d.page), hidden: true }, { what: "size", text: String(d.kb) }];
  if (conn === "https") return [{ what: "site", text: d.site }, { what: "page", text: scramble(d.page), hidden: true }, ...(d.typed ? [{ what: "typed" as const, text: scramble(d.typed), hidden: true }] : []), { what: "size", text: String(d.kb) }];
  return [{ what: "site", text: d.site }, { what: "page", text: `http://${d.page}` }, ...(d.typed ? [{ what: "typed" as const, text: d.typed }] : []), { what: "size", text: String(d.kb) }];
}
/** Does the snooper get your password? */
export const leaksPassword = (conn: Conn) => conn === "http";
