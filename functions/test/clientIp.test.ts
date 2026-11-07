// The client's address for collect's and reportBug's per-address limits (X-RATE-IP): behind Cloudflare it is
// cf-connecting-ip, never the Cloudflare edge Hosting sees; and a cf-connecting-ip that didn't come through Cloudflare
// is ignored.
import { describe, expect, it } from "vitest";
import { clientIp, ipToBigInt, isCloudflare } from "../src/clientIp";

describe("Cloudflare's ranges", () => {
  it("knows Cloudflare's edges, IPv4 and IPv6, and nothing else", () => {
    for (const ip of ["173.245.48.1", "104.16.0.1", "104.23.255.254", "172.64.10.20", "162.159.1.1", "2606:4700::6810:84e5", "2a06:98c0:3600::103", "::ffff:104.16.0.1"]) expect(isCloudflare(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "104.32.0.1", "196.218.1.1", "41.33.0.1", "2001:4860:4860::8888", "::1", "not an ip", ""]) expect(isCloudflare(ip), ip).toBe(false);
  });
  it("reads addresses of both kinds", () => {
    expect(ipToBigInt("1.2.3.4")).toBe(ipToBigInt("::ffff:1.2.3.4"));
    expect(ipToBigInt("::ffff:1.2.3.4")).toBe(ipToBigInt("::ffff:102:304"));
    expect(ipToBigInt("2606:4700::")).toBe(0x26064700n << 96n);
    expect(ipToBigInt("1.2.3")).toBeNull();
  });
});

describe("clientIp", () => {
  it("through Cloudflare (darsiai.org), the visitor's address Cloudflare reports", () => {
    expect(clientIp({ "fastly-client-ip": "172.70.1.2", "cf-connecting-ip": "41.33.12.7", "x-forwarded-for": "41.33.12.7, 172.70.1.2" })).toBe("41.33.12.7");
    expect(clientIp({ "fastly-client-ip": "2a06:98c0:3600::103", "cf-connecting-ip": "2c0f:fc88::1" })).toBe("2c0f:fc88::1");
  });
  it("straight to Hosting (web.app), Hosting's address, whatever cf-connecting-ip claims", () => {
    expect(clientIp({ "fastly-client-ip": "41.33.12.7", "cf-connecting-ip": "1.1.1.1" })).toBe("41.33.12.7");
    expect(clientIp({ "fastly-client-ip": "41.33.12.7" })).toBe("41.33.12.7");
  });
  it("a cf-connecting-ip that isn't an address is ignored", () => {
    expect(clientIp({ "fastly-client-ip": "172.70.1.2", "cf-connecting-ip": "made up" })).toBe("172.70.1.2");
  });
  it("without Hosting, the hop Google's front end added (the last), never the first a caller wrote", () => {
    expect(clientIp({ "x-forwarded-for": "9.9.9.9, 41.33.12.7" })).toBe("41.33.12.7");
    expect(clientIp({}, "127.0.0.1")).toBe("127.0.0.1");
    expect(clientIp({ "fastly-client-ip": ["41.33.12.7", "x"] })).toBe("41.33.12.7");
  });
});
