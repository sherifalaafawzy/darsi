import { analyse, bruteBits, OFFLINE, seconds } from "../../src/labs/apps/password/model";
import { base32, hotp, totp, verify } from "../../src/labs/apps/twofactor/model";
import { attack, lost, PRESETS } from "../../src/labs/apps/breach/model";
import { MESSAGES, score } from "../../src/labs/apps/phishing/model";
import { counts as sir, over, SETTINGS, step, world } from "../../src/labs/apps/malware/model";
import { STEPS } from "../../src/labs/apps/social/model";
import { ALPHABET, crack, shift } from "../../src/labs/apps/caesar/model";
import { bitsDiffer, salted, sha256 } from "../../src/labs/apps/hash/model";
import { check, codes, keys, lock, modinv, modpow, sign, unlock } from "../../src/labs/apps/publickey/model";
import { leaksPassword, seen } from "../../src/labs/apps/wifi/model";
import { APPS, mark } from "../../src/labs/apps/permissions/model";
import { known, POSTS } from "../../src/labs/apps/footprint/model";

describe("password strength", () => {
  it("sees through common passwords and patterns; length wins", () => {
    expect(analyse("password").found).toContain("common");
    expect(analyse("P@ssw0rd").found).toContain("common"); // leet spelling doesn't fool the list
    expect(analyse("qwerty2024").found).toEqual(expect.arrayContaining(["keyboard", "year"]));
    expect(analyse("sunshine2024").bits).toBeLessThan(bruteBits("sunshine2024"));
    expect(analyse("river-mango-camel-desert-olive").bits).toBeGreaterThan(analyse("Tr0ub4dor!").bits);
    expect(seconds(analyse("123456").bits, OFFLINE)).toBeLessThan(1);
  });
});

describe("two-step sign-in", () => {
  const key = new TextEncoder().encode("12345678901234567890");
  it("matches the RFC 6238 test vectors", async () => {
    expect(await Promise.all([59, 1111111109, 1111111111, 1234567890, 2000000000].map((t) => totp(key, t, 8)))).toEqual(["94287082", "07081804", "14050471", "89005924", "69279037"]);
    expect(await hotp(key, 0)).toBe("755224"); // RFC 4226
  });
  it("accepts the current and neighbouring codes, not old ones", async () => {
    const t = 1_700_000_000;
    expect(await verify(key, await totp(key, t), t)).toBe(true);
    expect(await verify(key, await totp(key, t - 30), t)).toBe(true);
    expect(await verify(key, await totp(key, t - 120), t)).toBe(false);
    expect(base32(new Uint8Array([0x66, 0x6f, 0x6f]))).toBe("MZXW6");
  });
});

describe("one leak, many accounts", () => {
  it("reuse loses everything; unique passwords and two-step contain it", () => {
    const lazy = attack(PRESETS.lazy), careful = attack(PRESETS.careful);
    expect(lost(lazy)).toBe(4); // the mobile money account had two-step sign-in
    expect(lazy.bank).toBe("safe-2fa");
    expect(lost(careful)).toBe(1); // only the forum itself
    const emailOnly = attack({ ...PRESETS.careful, email: { same: true, twoStep: false }, forum: { same: true, twoStep: false } });
    expect(emailOnly.shop).toBe("taken-reset"); // email falls, then "forgot password" opens the shop
  });
});

describe("spot the scam", () => {
  it("every scam has warning signs and genuine ones have none", () => {
    for (const m of MESSAGES) expect(m.scam ? m.clues.length > 0 : m.clues.length === 0).toBe(true);
    expect(MESSAGES.filter((m) => m.en.link).every((m) => /\.example\//.test(m.en.link!) && m.ar.link === m.en.link)).toBe(true);
    expect(score(Object.fromEntries(MESSAGES.map((m) => [m.id, m.scam])))).toBe(MESSAGES.length);
  });
});

describe("infection spread", () => {
  it("ends, and patching everyone stops it", () => {
    let w = world(SETTINGS);
    for (let i = 0; i < 200 && !over(w); i++) w = step(w, SETTINGS);
    expect(over(w)).toBe(true);
    const all = { ...SETTINGS, patched: 1 };
    let p = world(all);
    for (let i = 0; i < 20 && !over(p); i++) p = step(p, all);
    expect(sir(p).sick + sir(p).clean).toBeLessThanOrEqual(1);
    const backed = { ...SETTINGS, backups: 1 };
    let b = world(backed);
    for (let i = 0; i < 200 && !over(b); i++) b = step(b, backed);
    expect(sir(b).lost).toBe(0);
  });
});

describe("phone call scenario", () => {
  it("every path ends, and only giving the code loses the account", () => {
    const visit = (id: keyof typeof STEPS, seen = new Set<string>()): string[] => { const st = STEPS[id]; if (st.end) return [st.end]; return st.choices.flatMap((c) => (seen.has(c.to) ? [] : visit(c.to, new Set([...seen, id])))); };
    const ends = visit("start");
    expect(ends).toContain("safe"); expect(ends).toContain("lost");
    for (const st of Object.values(STEPS)) for (const c of st.choices) if (STEPS[c.to].end === "lost") expect(c.good).toBe(false);
  });
});

describe("Caesar cipher", () => {
  it("round-trips and cracks long messages in both alphabets", () => {
    expect(ALPHABET.ar).toHaveLength(28);
    expect(shift(shift("Hello", 3, "en"), -3, "en")).toBe("Hello");
    expect(shift("abc", 1, "en")).toBe("bcd");
    const en = "the students learn to read and write at school and they also learn how to protect their accounts";
    const ar = "يتعلم الطلاب في المدرسة القراءة والكتابة والحساب ويتعلمون كيف يحمون حساباتهم وكلمات المرور الخاصة بهم";
    expect(crack(shift(en, 9, "en"), "en")[0].k).toBe(9);
    expect(crack(shift(ar, 13, "ar"), "ar")[0].k).toBe(13);
  });
});

describe("hash", () => {
  it("gives the known SHA-256, flips about half the bits for one letter, and salts differ", async () => {
    expect(await sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const d = bitsDiffer(await sha256("Darsi"), await sha256("darsi"));
    expect(d).toBeGreaterThan(90); expect(d).toBeLessThan(166);
    expect(await salted("sun123", "aaaa")).not.toBe(await salted("sun123", "bbbb"));
  });
});

describe("locks and keys (RSA)", () => {
  it("builds valid keys, round-trips English and Arabic, and signatures catch tampering", () => {
    expect(modpow(4n, 13n, 497n)).toBe(445n);
    expect(modinv(17n, 3120n)).toBe(2753n);
    const k = keys(61, 53);
    expect([k.n, k.phi]).toEqual([3233n, 3120n]);
    expect((k.e * k.d) % k.phi).toBe(1n);
    for (const m of codes("Hi مرحبا")) expect(unlock(lock(m, k), k)).toBe(m);
    const m = codes("A")[0], sig = sign(m, k);
    expect(check(m, sig, k)).toBe(true); expect(check(m + 1n, sig, k)).toBe(false);
  });
});

describe("public Wi-Fi", () => {
  it("HTTP shows the password, HTTPS hides it, VPN hides the site too", () => {
    expect(seen("login", "http").some((l) => l.what === "typed" && /password=/.test(l.text))).toBe(true);
    expect(seen("login", "https").filter((l) => l.what === "typed").every((l) => l.hidden)).toBe(true);
    expect(seen("login", "https").some((l) => l.what === "site" && l.text === "portal.school.example")).toBe(true);
    expect(seen("login", "vpn").some((l) => l.what === "site")).toBe(false);
    expect(leaksPassword("https")).toBe(false);
  });
});

describe("app permissions", () => {
  it("allowing exactly what's needed scores full marks", () => {
    const perfect = Object.fromEntries(Object.entries(APPS).map(([a, { asks, needs }]) => [a, Object.fromEntries(asks.map((p) => [p, needs.includes(p)]))]));
    const m = mark(perfect);
    expect(m.right).toBe(m.total);
    expect(mark({}).right).toBeLessThan(m.total);
  });
});

describe("digital footprint", () => {
  it("every public post gives something away; hiding them all leaves nothing", () => {
    expect(known({})).toHaveLength(6);
    expect(known(Object.fromEntries(POSTS.map((p) => [p.id, "friends"])))).toHaveLength(0);
  });
});
