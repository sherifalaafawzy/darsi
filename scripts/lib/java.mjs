/**
 * A JDK 21 or newer for the Firebase emulators (firebase-tools 15 refuses older ones): the one on PATH, or one
 * installed in the usual places. The same search as scripts/local.mjs's java(), for scripts/verify.mjs --rules.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const win = process.platform === "win32";
/** `java -version` writes to stderr. 0 when there is no such program. */
export const javaMajor = (bin = "java") => Number(/version "(\d+)/.exec(String(spawnSync(bin, ["-version"], { encoding: "utf8" }).stderr ?? ""))?.[1] ?? 0);

/** The environment to run the emulators with, or null when no JDK 21+ is found. */
export function javaEnv(base = process.env) {
  const env = { ...base };
  // Java's loopback pipe fails in a temp folder whose path has spaces (docs/FIREBASE.md, emulators).
  if (win && !env.JAVA_TOOL_OPTIONS) env.JAVA_TOOL_OPTIONS = "-Djdk.net.unixdomain.tmpdir=C:\\Users\\Public";
  if (javaMajor("java") >= 21) return env;
  const roots = win ? ["C:/Program Files/Java", "C:/Program Files/Eclipse Adoptium", "C:/Program Files/Microsoft", "C:/Program Files/Zulu"] : ["/usr/lib/jvm", "/Library/Java/JavaVirtualMachines"];
  for (const r of roots.filter(existsSync)) for (const d of readdirSync(r).filter((x) => /jdk|jre/i.test(x)).sort().reverse()) {
    const home = [join(r, d), join(r, d, "Contents/Home")].find((h) => existsSync(join(h, "bin", win ? "java.exe" : "java")));
    // Windows spells it Path; a second PATH key would hide it from the children.
    const key = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
    if (home && javaMajor(join(home, "bin", "java")) >= 21) return { ...env, JAVA_HOME: home, [key]: `${join(home, "bin")}${win ? ";" : ":"}${env[key]}` };
  }
  return null;
}
