/**
 * The tutor agent's conversations on Vertex AI Agent Runtime, by account (agent.ts opens them with the uid as
 * `user_id`): Darsi's only copy of what a person asked the tutor, kept outside Firestore, so deleting an account must
 * delete them there (account.ts wipeAccount) and an export must list them (exportAccountData).
 * scripts/purge-agent-sessions.mjs uses the same calls to clear old ones by hand.
 *
 * With no agent set up (config/tutor has no agentId) there is nothing to do. Agent Runtime allows about 30 queries a
 * minute for the whole project and every call here is one, taken from the live tutor's share: calls run one after the
 * other, inside a time budget, and a failure is logged and reported, never thrown, so nothing else waits on it.
 */
import { logger } from "firebase-functions/v2";
import { sessionEvents, sessionsOf, type AgentSession } from "./accountCore.js";
import { googleToken, PROJECT, tutorConfig, type TutorConfig } from "./tutor.js";

/** Which agent: config/tutor's, unless a script names another (an older agent that still holds sessions). */
export interface AgentAt { agentId?: string; agentLocation?: string }
type Engine = Pick<TutorConfig, "agentId" | "agentLocation">;
const engineAt = async (at: AgentAt = {}): Promise<Engine> => {
  if (at.agentId && at.agentLocation) return { agentId: at.agentId, agentLocation: at.agentLocation }; // named in full: no settings read
  const cfg = await tutorConfig();
  return { agentId: at.agentId ?? cfg.agentId, agentLocation: at.agentLocation ?? cfg.agentLocation };
};
// The same address as agent.ts builds (its engineUrl is private to it).
const engineUrl = (e: Engine) =>
  `${process.env.AGENT_BASE ?? `https://${e.agentLocation}-aiplatform.googleapis.com`}/v1/projects/${PROJECT}/locations/${e.agentLocation}/reasoningEngines/${e.agentId}`;

async function query(e: Engine, method: string, input: Record<string, unknown>, ms: number): Promise<unknown> {
  const r = await fetch(`${engineUrl(e)}:query`, {
    method: "POST", signal: AbortSignal.timeout(ms),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await googleToken()}` },
    body: JSON.stringify({ class_method: method, input }),
  });
  if (!r.ok) throw new Error(`Agent Runtime ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
  return ((await r.json().catch(() => ({}))) as { output?: unknown }).output;
}

/** An account's sessions (id and last use). Throws when Agent Runtime can't be asked; [] when no agent is set up. */
export async function listSessions(uid: string, at?: AgentAt): Promise<AgentSession[]> {
  const e = await engineAt(at);
  if (!e.agentId || !uid) return [];
  return sessionsOf(await query(e, "async_list_sessions", { user_id: uid }, 20_000));
}

/** Deletes one session. Throws when it can't. */
export async function deleteSession(uid: string, sessionId: string, at?: AgentAt): Promise<void> {
  const e = await engineAt(at);
  if (!e.agentId) return;
  await query(e, "async_delete_session", { user_id: uid, session_id: sessionId }, 15_000);
}

/**
 * Deletes every session of an account. Never throws: `sessionsFailed` says some may be left (Agent Runtime down, its
 * quota used up, or the budget spent), with how many did go. A listing may come a page at a time, so it is asked again
 * until it comes back empty.
 */
export async function deleteSessions(uid: string, budgetMs = 60_000, at?: AgentAt): Promise<{ sessions: number; sessionsFailed: boolean }> {
  let sessions = 0;
  try {
    const e = await engineAt(at);
    if (!e.agentId || !uid) return { sessions, sessionsFailed: false };
    const until = Date.now() + budgetMs;
    for (let round = 0; round < 50; round++) {
      const list = sessionsOf(await query(e, "async_list_sessions", { user_id: uid }, 20_000));
      if (!list.length) return { sessions, sessionsFailed: false };
      for (const s of list) {
        if (Date.now() > until) throw new Error("out of time");
        await query(e, "async_delete_session", { user_id: uid, session_id: s.id }, 15_000);
        sessions++;
      }
    }
    throw new Error("the listing never came back empty");
  } catch (err) {
    logger.warn("agentSessions: an account's tutor sessions were not all deleted", { uid, deleted: sessions, error: String(err) });
    return { sessions, sessionsFailed: true };
  }
}

/**
 * An account's conversations for its export: each session's id, last use and events. Never throws: within the budget
 * it reads what it can, and `complete: false` says the list (or some session's events) is not all there.
 */
export async function exportSessions(uid: string, budgetMs = 20_000, at?: AgentAt): Promise<{ complete: boolean; sessions: (AgentSession & { events: ReturnType<typeof sessionEvents> | null })[] }> {
  const out: (AgentSession & { events: ReturnType<typeof sessionEvents> | null })[] = [];
  const until = Date.now() + budgetMs;
  const left = () => until - Date.now();
  try {
    const e = await engineAt(at);
    if (!e.agentId || !uid) return { complete: true, sessions: out };
    const list = sessionsOf(await query(e, "async_list_sessions", { user_id: uid }, Math.max(1000, left())));
    let complete = true;
    for (const s of list) {
      // Out of time: the session is still listed, without its events.
      const got = left() > 500 ? await query(e, "async_get_session", { user_id: uid, session_id: s.id }, left()).catch(() => undefined) : undefined;
      if (got === undefined) complete = false;
      out.push({ ...s, events: got === undefined ? null : sessionEvents(got) });
    }
    return { complete, sessions: out };
  } catch (err) {
    logger.warn("agentSessions: an account's tutor sessions were not read", { uid, error: String(err) });
    return { complete: false, sessions: out };
  }
}
