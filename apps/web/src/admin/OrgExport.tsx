import { useEffect, useRef, useState } from "react";
import { Button } from "@darsi/design-system";
import { api } from "../auth/api";
import type { Org } from "../auth/types";
import { storage } from "../firebase";
import { useI18n } from "../i18n";
import { errorText } from "../staff/errors";
import { downloadBlob } from "./importer";
import { k } from "./orgsStrings";

/** Where an export stands: being written on the server, being downloaded, or finished (`error`: why it stopped). */
type State = { phase: "idle" | "build" | "save" | "done"; members: number; files: string[]; at: number; error?: string };
const IDLE: State = { phase: "idle", members: 0, files: [], at: 0 };

/**
 * An organization's data as files, for a school that asks for it or leaves (functions/src/orgExport.ts): every
 * member's profile, lesson results, projects and certificates, never private notes or payments. The server writes
 * gzipped JSON parts in steps (exportOrgData is called until it answers `done`), then each part is fetched through
 * the Storage SDK with the admin's own credentials and saved as a file. A download that fails keeps the parts'
 * names, so "Download the files again" does not export a second time. Nothing here is live: it runs on a click.
 */
export function OrgExport({ org }: { org: Org }) {
  // The locale too: a refusal that names a time ("a new export can start at …") says it in the app's language.
  const { t, locale } = useI18n();
  const [st, setSt] = useState<State>(IDLE);
  // The loop stops asking, and says nothing more, once the page is gone.
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const busy = st.phase === "build" || st.phase === "save";

  const download = async (files: string[], members: number) => {
    setSt({ phase: "save", members, files, at: 0 });
    try {
      const [{ getBlob, ref }, s] = await Promise.all([import("firebase/storage"), storage()]);
      const slug = org.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "org";
      const day = new Date().toISOString().slice(0, 10);
      for (let i = 0; i < files.length; i++) {
        if (!live.current) return;
        setSt({ phase: "save", members, files, at: i + 1 });
        // "exports/{orgId}/{exportId}/part-0001.json.gz": the part's own name, after the organization's and the day.
        downloadBlob(await getBlob(ref(s, files[i])), `darsi-${slug}-${day}-${files[i].split("/").pop()}`);
      }
      if (live.current) setSt({ phase: "done", members, files, at: files.length });
    } catch (e) {
      if (live.current) setSt({ phase: "done", members, files, at: 0, error: `${t(k("og.exportFileFailed"))} ${errorText(e, t, locale)}` });
    }
  };

  const run = async () => {
    setSt({ ...IDLE, phase: "build" });
    let files: string[] = [], members = 0;
    try {
      let exportId: string | undefined, cursor: string | null = null;
      for (;;) {
        const r = await api.exportOrgData({ orgId: org.id, ...(exportId ? { exportId, cursor } : {}) });
        if (!live.current) return;
        files = r.files ?? []; members = r.members ?? 0;
        if (r.done !== false) break;
        // Each step moves on from the last member it wrote: the same place again would never end.
        if (!r.cursor || r.cursor === cursor) throw new Error("exportOrgData made no progress");
        exportId = r.exportId; cursor = r.cursor;
        setSt({ phase: "build", members, files, at: 0 });
      }
    } catch (e) {
      if (live.current) setSt({ ...IDLE, error: errorText(e, t, locale) });
      return;
    }
    // No members: the server wrote one empty list. Nothing worth a file: say so instead.
    if (!members) { setSt({ phase: "done", members: 0, files: [], at: 0 }); return; }
    await download(files, members);
  };

  return (
    <section className="panel stack" aria-labelledby="ox-h">
      <h3 id="ox-h">{t(k("og.exportTitle"))}</h3>
      <p className="muted small">{t(k("og.exportHint"))}</p>
      {busy && <p className="muted" role="status" aria-busy="true">{st.phase === "build" ? t(k("og.exportProgress"), { n: st.members }) : t(k("og.exportSaving"), { i: Math.max(st.at, 1), of: st.files.length })}</p>}
      {st.error && <p className="notice err" role="alert">{st.error}</p>}
      {st.phase === "done" && !st.error && <p className="notice ok" role="status">{st.files.length ? t(k("og.exportDone"), { n: st.members, files: st.files.length }) : t(k("og.exportEmpty"))}</p>}
      <div className="row-gap">
        <Button variant="secondary" icon="file" loading={busy} onClick={() => { void run(); }}>{t(k("og.exportBtn"))}</Button>
        {/* The parts are still on the server: a download that failed, or that the browser held back, without a new export. */}
        {st.phase === "done" && st.files.length > 0 && <Button variant="ghost" icon="sync" onClick={() => { void download(st.files, st.members); }}>{t(k("og.exportAgain"))}</Button>}
      </div>
    </section>
  );
}
