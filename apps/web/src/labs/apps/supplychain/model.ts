/**
 * The model supply chain: checking a downloaded model is the one the publisher made, and from whom. A SHA-256
 * fingerprint (real, from the phone's WebCrypto) catches any changed byte; an ECDSA P-256 signature (keys generated on
 * the phone) says who published it. These helpers are real cryptography — the tests run them in Node, which has the
 * same WebCrypto. The numbers in REAL_FILES are Darsi Tiny's own files, so the sizes and one hash are genuine.
 */
const enc = new TextEncoder();

/** Darsi Tiny's real published files (from its manifest.json): name, size in bytes, and the model's real fingerprint. */
export const REAL_FILES: { name: string; bytes: number; sha256?: string }[] = [
  { name: "model.bin", bytes: 2998448, sha256: "29ccd1fab5c360e5be6a0c1ddaa787b1d571d5a19628ae9b34519363c8207e57" },
  { name: "tokenizer.json", bytes: 33765, sha256: "3a62f537197128dd76a336d01219f7eae67492711b0f3614706d1607886cd93b" },
  { name: "world.json", bytes: 86957 },
  { name: "replay.json", bytes: 51420 },
];

/** The small "model package" the learner hashes and signs here (a stand-in for the real weights, so it hashes live). */
export interface Pkg { name: string; version: number; params: number; note: string }
export const basePkg = (): Pkg => ({ name: "Darsi Tiny", version: 1, params: 2937792, note: "int8 agent model for the school labs" });
export const pkgBytes = (p: Pkg): Uint8Array => enc.encode(JSON.stringify(p));

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

/** The real SHA-256 fingerprint of some bytes, as 64 hex characters. */
export async function sha256(bytes: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer));
}

export interface Signer { publicKey: CryptoKey; privateKey: CryptoKey }
/** A fresh ECDSA P-256 key pair, generated on the phone. The publisher keeps the private key; everyone gets the public one. */
export async function makeSigner(): Promise<Signer> {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return { publicKey: kp.publicKey, privateKey: kp.privateKey };
}

/** The publisher signs the bytes with their private key (SHA-256 inside ECDSA). */
export async function sign(priv: CryptoKey, bytes: Uint8Array): Promise<ArrayBuffer> {
  return crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, priv, bytes as unknown as ArrayBuffer);
}

/** Verify a signature against the public key you trust. False if the bytes changed or the signer was someone else. */
export async function verify(pub: CryptoKey, sig: ArrayBuffer, bytes: Uint8Array): Promise<boolean> {
  return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, sig, bytes as unknown as ArrayBuffer);
}

/** A short, readable thumbprint of a public key (so two keys can be told apart on screen). */
export async function keyFingerprint(pub: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", pub);
  return (await sha256(new Uint8Array(raw))).slice(0, 16);
}

/** How many of the 256 bits differ between two hex fingerprints (the avalanche effect). */
export function bitsDiffer(a: string, b: string): number {
  let n = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { n += x & 1; x >>= 1; } }
  return n;
}
