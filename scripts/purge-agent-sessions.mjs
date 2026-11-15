#!/usr/bin/env node
/**
 * Lists, and with --apply deletes, old conversations with the tutor agent. They live on Vertex AI Agent Runtime, one
 * session per opened tutor panel, keyed by the account's uid, and nothing there ever expires by itself. Deleting an
 * account deletes its sessions (functions/src/account.ts); this is for the ones that just grow old. It uses the same
 * calls (functions/src/agentSessions.ts), against the agent config/tutor names.
 *
 * It never runs by itself: run it by hand, read the dry run, then run it again with --apply.
 *
 *   node scripts/purge-agent-sessions.mjs                          dry run: every account's sessions not used for 90 days
 *   node scripts/purge-agent-sessions.mjs --days 30                … not used for 30 days
 *   node scripts/purge-agent-sessions.mjs --days 30 --apply        deletes them
 *   node scripts/purge-agent-sessions.mjs --uid <uid> --days 0 --apply   all of one account's (also a session key that
 *                                                                  is no account, such as the eval's "eval")
 *   … --agent <id> [--location <region>]                           another agent: an older one that still holds sessions
 *   … --pace <ms>                                                  the pause after each call (default 3000)
 *
 * "Every account" is every profile in users/. Sessions whose last use Agent Runtime doesn't give are counted and kept
 * (only --days 0 deletes them). Agent Runtime allows about 30 queries a minute for the whole project, the live tutor
 * included, and every listing and every deletion here is one: hence the pause. With 1,000 accounts a dry run takes
 * about 50 minutes; lower --pace only when nobody is learning.
 *
 * The real project only (credentials as for `npm run seed`: the personal application-default login). Build the
 * functions first (npm run build --prefix functions).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const apply = process.argv.includes("--apply");
const days = Number(arg("--days") ?? 90), pace = Number(arg("--pace") ?? 3000);
if (!Number.isFinite(days) || days < 0 || !Number.isFinite(pace) || pace < 0) { console.error("--days and --pace take a number, 0 or more."); process.exit(2); }
const KNOWN = ["--apply", "--days", "--pace", "--uid", "--agent", "--location"];
const unknown = process.argv.slice(2).filter((a) => a.startsWith("--") && !KNOWN.includes(a));
if (unknown.length) { console.error(`Unknown option: ${unknown.join(", ")}`); process.exit(2); }
// An option given without its value must never fall back to the default: "--uid" alone would mean every account.
const bare = KNOWN.filter((k) => k !== "--apply" && process.argv.includes(k) && (arg(k) === undefined || arg(k) === "" || arg(k).startsWith("--")));
if (bare.length) { console.error(`${bare.join(", ")} needs a value.`); process.exit(2); }

process.env.GCLOUD_PROJECT ??= JSON.parse(fs.readFileSync(path.join(ROOT, ".firebaserc"), "utf8")).projects.default;
const lib = (f) => import(pathToFileURL(path.join(ROOT, "functions/lib", f)).href);
const [{ listSessions, deleteSession }, { db }, { tutorConfig }] = await Promise.all([lib("agentSessions.js"), lib("admin.js"), lib("tutor.js")]);

const cfg = await tutorConfig();
const at = { agentId: arg("--agent") ?? cfg.agentId, agentLocation: arg("--location") ?? cfg.agentLocation };
if (!at.agentId) { console.error("config/tutor names no agent (agentId). Give one: --agent <reasoningEngines id>"); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uids = arg("--uid") ? [arg("--uid")] : (await db.collection("users").select().get()).docs.map((d) => d.id);
const before = Date.now() - days * 864e5;
const date = (ms) => (ms === null ? "last use unknown" : new Date(ms).toISOString().slice(0, 10));
console.log(`${apply ? "Deleting" : "Dry run:"} sessions not used ${days ? `for ${days} days` : "(any age)"}, of ${uids.length} account${uids.length === 1 ? "" : "s"}, on agent ${at.agentId} (${at.agentLocation}) in ${process.env.GCLOUD_PROJECT}.`);

let seen = 0, old = 0, undated = 0, deleted = 0, failed = 0, withOld = 0;
for (const uid of uids) {
  let list;
  try { list = await listSessions(uid, at); } catch (e) { failed++; console.error(`  ${uid}: not listed (${String(e).slice(0, 160)})`); await sleep(pace); continue; }
  await sleep(pace);
  seen += list.length;
  undated += days ? list.filter((s) => s.updatedAt === null).length : 0;
  const due = list.filter((s) => !days || (s.updatedAt !== null && s.updatedAt < before));
  if (!due.length) continue;
  old += due.length; withOld++;
  console.log(`  ${uid}: ${due.length} of ${list.length}${apply ? "" : ` (${due.map((s) => `${s.id} ${date(s.updatedAt)}`).join(", ")})`}`);
  if (!apply) continue;
  for (const s of due) {
    try { await deleteSession(uid, s.id, at); deleted++; } catch (e) { failed++; console.error(`    ${s.id}: not deleted (${String(e).slice(0, 160)})`); }
    await sleep(pace);
  }
}

console.log(`${seen} sessions seen; ${old} ${days ? `not used for ${days} days` : "in all"}, of ${withOld} account${withOld === 1 ? "" : "s"}.${undated ? ` ${undated} with no last use given were kept (--days 0 takes them too).` : ""}`);
console.log(apply ? `Deleted ${deleted}.${failed ? ` ${failed} calls failed: run it again.` : ""}` : `Nothing was deleted. Add --apply to delete ${old ? "them" : "what a later run finds"}.${failed ? ` ${failed} accounts could not be listed.` : ""}`);
process.exit(failed ? 1 : 0);
