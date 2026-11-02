import { describe, expect, it } from "vitest";
import { generateCode, generatePassword, normalizeCode, suggestUsername, isValidUsername } from "../src/passwords";

describe("passwords", () => {
  it("has every character class and no look-alikes", () => {
    for (let i = 0; i < 200; i++) {
      const p = generatePassword(10);
      expect(p).toHaveLength(10);
      expect(p).toMatch(/[a-z]/); expect(p).toMatch(/[A-Z]/); expect(p).toMatch(/[2-9]/); expect(p).toMatch(/[!@#$%*?]/);
      expect(p).not.toMatch(/[0O1lI]/);
    }
  });
  it("clamps length", () => { expect(generatePassword(3)).toHaveLength(8); expect(generatePassword(99)).toHaveLength(32); });
  it("codes are 12 characters in groups of 4, with no look-alikes", () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });
  it("reads a typed code however it is spaced or cased, and still reads the old short codes", () => {
    expect(normalizeCode(" k7qp 2mxr-9dha ")).toBe("K7QP-2MXR-9DHA");
    expect(normalizeCode("k7q2mxp")).toBe("K7Q-2MXP");
    expect(normalizeCode("K7Q-2MX")).toBeNull();
    expect(normalizeCode("../orgs/x")).toBeNull();
    expect(normalizeCode(42)).toBeNull();
  });
  it("usernames from any script are valid", () => {
    for (const n of ["Amina Bello", "منى عبد الرحمن", "José Ñúñez"]) expect(isValidUsername(suggestUsername(n))).toBe(true);
  });
});
