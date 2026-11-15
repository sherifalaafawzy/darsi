/**
 * Numbers as people type them into the admin forms' fields. The fields keep the typed text (a field bound to a number
 * could not hold "0." or "0.00" on the way to 0.0035, and an emptied one read as 0), and are text fields with a numeric
 * keyboard: a `type="number"` field refuses the Arabic and Persian digits an Arabic keyboard types.
 */

/** Arabic-Indic (٠–٩) and Persian (۰–۹) digits as 0–9, the Arabic decimal mark (٫) as ".", thousands marks (٬) dropped. */
export const latinDigits = (s: string) => s
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
  .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
  .replace(/٫/g, ".").replace(/٬/g, "");

/**
 * What was typed, as a number: undefined for an empty field, null for anything that is not a plain positive number
 * ("1e3", "-2", "1,5", "abc": a comma could be a decimal mark or a thousands mark, so it is asked for again).
 */
export function typedNumber(text: string): number | null | undefined {
  const s = latinDigits(text).trim();
  if (s === "") return undefined;
  return /^(?:\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : null;
}

/** A whole number within [min, max], or null while the field is empty, not a number or out of range. */
export const typedWhole = (text: string, min: number, max: number) => {
  const n = typedNumber(text);
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max ? n : null;
};
