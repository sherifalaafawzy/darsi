import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { UpdateToast } from "@darsi/design-system";
import { useAuth } from "../auth/AuthProvider";
import type { Profile } from "../auth/types";
import { useI18n } from "../i18n";
import { call } from "../fb";
import { LEGAL_DOCS, refreshLegal, useLegal, type Legal, type LegalDoc, type LegalVersions } from "./published";
import { k } from "./strings";

/**
 * What a signed-in person still has to agree to: the published documents whose version is newer than the one their
 * profile records (users/{uid}.terms, written by acceptTerms), with every published version to send (they agree to what
 * the banner links to), or null when nothing is due or nothing is published.
 */
export function dueTerms(legal: Pick<Legal, LegalDoc>, terms: Profile["terms"]): { docs: LegalDoc[]; versions: LegalVersions } | null {
  const docs: LegalDoc[] = [], versions: LegalVersions = {};
  for (const doc of LEGAL_DOCS) {
    const v = legal[doc];
    if (v === null) continue;
    versions[doc] = v;
    const had = terms?.[doc];
    if (typeof had !== "number" || had < v) docs.push(doc);
  }
  return docs.length ? { docs, versions } : null;
}

/** An account made a moment ago agreed on the sign-up screen; its acceptTerms call may still be on its way. */
const FRESH_MS = 2 * 60e3;
/** acceptTerms answering `recorded: false` (the profile isn't there yet) is tried again this many times, as it arrives. */
const RETRIES = 3;

/**
 * The privacy notice or the terms changed since this account agreed (or it never did: made by an organization, on the
 * sign-in screen with Google, before the texts existed, or its call at sign-up failed). A small banner in the app shell,
 * never in the way: it links to what changed, and "I agree" records it (acceptTerms). Signed in only (Layout mounts it
 * for a user), so guests read nothing for it and never load Firebase; the file is the public one useLegal already reads.
 * - `recorded: false`: the profile doesn't exist yet. Asked again when the profile arrives, a few times at most.
 * - "legal-version": a newer version was published meanwhile. The file is read again, and the banner asks for it.
 * - Anything else (offline): the banner stays, and the next tap tries again.
 */
export function TermsPrompt() {
  const { t } = useI18n();
  const { user, profile, profileReady } = useAuth();
  const legal = useLegal();
  // "busy": asked; "wait": the server had no profile to write to; "done": recorded (the profile's copy follows).
  const [phase, setPhase] = useState<"idle" | "busy" | "wait" | "done">("idle");
  const tries = useRef(0);
  const due = legal.ready && profileReady && profile ? dueTerms(legal, profile.terms) : null;
  const created = Date.parse(user?.metadata?.creationTime ?? "");
  const fresh = Number.isFinite(created) && Date.now() - created < FRESH_MS;
  const agree = (versions: LegalVersions) => {
    setPhase("busy");
    tries.current++;
    call<LegalVersions, { ok: boolean; recorded?: boolean }>("acceptTerms")(versions).then(
      (r) => setPhase(r?.recorded === false ? (tries.current < RETRIES ? "wait" : "idle") : "done"),
      (e: unknown) => {
        if (String((e as { details?: { reason?: unknown } } | null)?.details?.reason ?? "") === "legal-version") refreshLegal();
        setPhase("idle");
      },
    );
  };
  // The profile arrived (or changed) while the server had none to write to: once more.
  useEffect(() => { if (phase === "wait" && profile && due) agree(due.versions); }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!due || fresh || phase === "done" || phase === "wait") return null;
  const said = due.docs.length === 2 ? "legal.changedBoth" : due.docs[0] === "privacy" ? "legal.changedPrivacy" : "legal.changedTerms";
  return (
    <UpdateToast actionLabel={t(k("legal.agree"))} onAction={() => { if (phase !== "busy") agree(due.versions); }}>
      {t(k(said))}{" "}
      {due.docs.map((doc, i) => <span key={doc}>{i > 0 && t("common.sep")}<Link to={`/${doc}`}>{t(k(doc === "privacy" ? "legal.privacy" : "legal.terms"))}</Link></span>)}
    </UpdateToast>
  );
}
