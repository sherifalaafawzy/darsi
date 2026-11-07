/**
 * The client's address for the per-address limits of `collect` and `reportBug` (analytics.ts, bugs.ts). Pure, tested
 * in test/clientIp.test.ts.
 *
 * Through Firebase Hosting, Hosting's CDN puts the address it was reached from in `fastly-client-ip`. darsiai.org goes
 * through Cloudflare's proxy first, so that address is a Cloudflare edge, shared by everyone the edge serves (a whole
 * city could share one limit of 8 problem reports). When it is one of Cloudflare's published ranges, the visitor's
 * address is Cloudflare's own `cf-connecting-ip` (Cloudflare sets it; a visitor can't). A request that didn't come
 * through Cloudflare (darsi-f0685.web.app) keeps `fastly-client-ip`, and a `cf-connecting-ip` it carries is ignored.
 * Without Hosting (the function's own URL, the emulators), every header is the caller's to set, so the last
 * x-forwarded-for hop (the one Google's front end adds) or the socket's address is used; the per-instance brake is what
 * holds there.
 */
import { isIP } from "node:net";

/** Cloudflare's published ranges (https://www.cloudflare.com/ips/), unchanged for years. */
export const CLOUDFLARE = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
  "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
];

/** An address as a number (IPv4 as ::ffff:a.b.c.d, so both kinds compare in one space); null when it isn't one. */
export function ipToBigInt(raw: string): bigint | null {
  let ip = raw.trim().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const v = isIP(ip);
  if (v === 4) return BigInt(0xffff) << 32n | ip.split(".").reduce((a, o) => a << 8n | BigInt(Number(o)), 0n);
  if (v !== 6) return null;
  // An IPv4 tail (::ffff:1.2.3.4) becomes two groups.
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (tail) {
    const n = tail[1].split(".").map(Number);
    ip = ip.slice(0, -tail[1].length) + `${((n[0] << 8) | n[1]).toString(16)}:${((n[2] << 8) | n[3]).toString(16)}`;
  }
  const [head, rest] = ip.split("::") as [string, string | undefined];
  const a = head ? head.split(":") : [], b = rest !== undefined && rest ? rest.split(":") : [];
  const groups = rest === undefined ? a : [...a, ...Array(8 - a.length - b.length).fill("0"), ...b];
  if (groups.length !== 8) return null;
  return groups.reduce((acc, g) => acc << 16n | BigInt(parseInt(g || "0", 16)), 0n);
}

const ranges = CLOUDFLARE.map((cidr) => {
  const [base, bits] = cidr.split("/");
  const v4 = base.includes(".");
  const width = v4 ? 32 : 128, prefix = Number(bits);
  const n = ipToBigInt(base)!;
  const span = BigInt(width - prefix);
  return { lo: n >> span << span, span };
});
/** Whether the address is one of Cloudflare's. */
export function isCloudflare(ip: string): boolean {
  const n = ipToBigInt(ip);
  return n !== null && ranges.some((r) => n >> r.span << r.span === r.lo);
}

type Headers = Record<string, string | string[] | undefined>;
const header = (h: Headers, k: string) => { const v = h[k]; return String(Array.isArray(v) ? v[0] ?? "" : v ?? "").trim(); };

export function clientIp(h: Headers, fallback = "?"): string {
  const hosting = header(h, "fastly-client-ip");
  if (hosting) {
    const visitor = header(h, "cf-connecting-ip");
    return visitor && isIP(visitor) && isCloudflare(hosting) ? visitor : hosting;
  }
  const hops = header(h, "x-forwarded-for").split(",").map((s) => s.trim()).filter(Boolean);
  return hops[hops.length - 1] || fallback;
}
