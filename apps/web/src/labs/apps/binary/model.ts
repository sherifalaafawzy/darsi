/**
 * Bits and bytes: everything a device stores or sends is on/off switches. Eight make a byte (0–255). Text is stored as
 * numbers too: in UTF-8 an English letter takes one byte and an Arabic letter two.
 */
export const PLACES = [128, 64, 32, 16, 8, 4, 2, 1];
export const toBits = (n: number) => PLACES.map((p) => (n & p ? 1 : 0));
export const fromBits = (bits: number[]) => bits.reduce((s, b, i) => s + b * PLACES[i], 0);
export const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
/** The character for a byte, when it is a printable English one. */
export const ascii = (n: number) => (n >= 32 && n < 127 ? String.fromCharCode(n) : null);
export const values = (bits: number) => 2 ** bits;

const enc = new TextEncoder();
/** Each character with its UTF-8 bytes. */
export const utf8 = (text: string) => [...text].map((ch) => ({ ch, bytes: Array.from(enc.encode(ch)) }));
export const byteCount = (text: string) => enc.encode(text).length;
