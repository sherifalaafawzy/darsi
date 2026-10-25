import { describe, expect, it } from "vitest";
import { generateCode, generatePassword, suggestUsername, isValidUsername } from "../src/passwords";

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
  it("codes look like ABC-1234", () => { expect(generateCode()).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{4}$/); });
  it("usernames from any script are valid", () => {
    for (const n of ["Amina Bello", "منى عبد الرحمن", "José Ñúñez"]) expect(isValidUsername(suggestUsername(n))).toBe(true);
  });
});
