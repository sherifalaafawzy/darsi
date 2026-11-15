import { useEffect, useState } from "react";
import { Button, Icon, type IconName } from "@darsi/design-system";
import { loadFirebase } from "../fb";
import { isolate, useI18n } from "../i18n";
import type { Lesson, LocalText, ProjectStep } from "../content/types";
import type { CapFields } from "../content/capstone";
import type { FileRef } from "../results/data";
import { CapstoneResult } from "../lesson/CapstoneParts";
import { evidencePath, isEvidenceUrl, shownType } from "./evidence";
// The project cards' styles (.submission, .sub-text, .sub-media), for every screen that shows a project.
import "../styles/person.css";

/** What a project holds besides its review (users/{uid}/submissions, written by lesson/ProjectView.tsx or checkCapstone). */
export interface WorkFields extends CapFields {
  text: string; stepId?: string; final?: boolean; explain?: string; aiUse?: string;
  fileUrl?: string | null; fileName?: string | null; files?: FileRef[];
}

/** The project step a submission answers: by its id, or the lesson's only project step (projects sent before steps had ids). */
export function projectStep(lesson: Lesson | undefined, stepId?: string): ProjectStep | undefined {
  const projects = (lesson?.steps ?? []).filter((s): s is ProjectStep => s.type === "project");
  return stepId ? projects.find((s) => s.id === stepId) : projects.length === 1 ? projects[0] : undefined;
}
/** A step's name for reviewers: the first line of its prompt ("Milestone 2: A baseline…"). */
export const stepName = (step: ProjectStep | undefined, L: (x: LocalText | undefined) => string) => (step ? L(step.prompt).split("\n")[0].trim() : "");

/** Every attached file (projects sent before `files` have only `fileUrl`), and only files in Darsi's own Storage. */
export const filesOf = (w: WorkFields, fallbackName: string): FileRef[] =>
  (w.files?.length ? w.files : w.fileUrl ? [{ url: w.fileUrl, name: w.fileName || fallbackName }] : []).filter((f) => isEvidenceUrl(f.url));

/**
 * What a learner sent, as every reviewer sees it (SubmissionCard on /teach, /admin and /super; /results for university
 * teachers): the text; for a capstone milestone its repository and links, the automatic checks and the advisory AI
 * review named by the step's rubric; for a final project or a milestone, the learner's own explanation (what the AI
 * review read) and what AI they used; and every attached file.
 */
export function WorkBody({ work, rubric }: { work: WorkFields; rubric?: ProjectStep["rubric"] }) {
  const { t } = useI18n();
  const files = filesOf(work, t("p.attachment"));
  return (
    <>
      <p dir="auto" className="sub-text">{work.text}</p>
      {work.capstone && <>
        {[work.repo, ...(work.links ?? [])].filter((u): u is string => !!u && /^https:\/\//.test(u)).map((u) => <OutLink key={u} url={u} />)}
        <CapstoneResult checks={work.checks} review={work.aiReview} rubric={rubric} />
      </>}
      {(work.final || work.capstone) && <>
        <div className="stack-sm"><strong className="small">{t("results.explain")}</strong><p dir="auto" className="sub-text">{work.explain || "—"}</p></div>
        <div className="stack-sm"><strong className="small">{t("results.aiUse")}</strong><p dir="auto" className="sub-text">{!work.aiUse || work.aiUse === "none" ? t("results.aiNone") : work.aiUse}</p></div>
      </>}
      {files.map((f, i) => <EvidenceFile key={`${i}:${f.url}`} file={f} />)}
    </>
  );
}

/**
 * A link the learner typed (a capstone's repository or links: any https site, checkCapstone). The site it opens comes
 * first and in bold, as the browser parses it (a look-alike name shows as its xn-- form), so a page pretending to be
 * Darsi's sign-in can't pass for a link to the learner's work.
 */
export function OutLink({ url }: { url: string }) {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const rest = `${u.pathname === "/" ? "" : u.pathname}${u.search}${u.hash}`;
  return <a href={u.href} target="_blank" rel="noreferrer noopener" dir="ltr"><Icon name="link" size={16} /> <strong>{u.host}</strong>{rest}</a>;
}

/** Projects take files of at most 10 MB (firebase/storage.rules). */
const MAX_BYTES = 11 * 1024 * 1024;
const iconFor = (type = ""): IconName => (type.startsWith("image/") ? "image" : type.startsWith("audio/") ? "audio" : type.startsWith("video/") ? "video" : "file");

/**
 * One attached file. Nothing is downloaded until the reviewer opens it: then it is read through the Storage SDK with
 * their own sign-in (the rules decide, and no link that works for anyone is ever shown) and appears in the card. A photo,
 * voice note or video plays here; a PDF or anything else is offered to save, never opened as a page.
 */
export function EvidenceFile({ file }: { file: FileRef }) {
  const { t } = useI18n();
  const [s, setS] = useState<{ busy?: boolean; url?: string; type?: string; failed?: boolean }>({});
  useEffect(() => () => { if (s.url) URL.revokeObjectURL(s.url); }, [s.url]);
  const name = file.name || t("p.attachment");
  const open = async () => {
    const path = evidencePath(file.url);
    if (!path) return setS({ failed: true });
    setS({ busy: true });
    try {
      const [{ getBlob, ref }, st] = await Promise.all([import("firebase/storage"), loadFirebase().then((fb) => fb.storage())]);
      const got = await getBlob(ref(st, path), MAX_BYTES);
      const type = shownType(got.type, file.type, name);
      setS({ url: URL.createObjectURL(got.type === type ? got : new Blob([got], { type })), type });
    } catch { setS({ failed: true }); }
  };
  if (s.url && s.type) {
    if (s.type.startsWith("image/")) return <figure className="reading-fig"><img src={s.url} alt={name} /><figcaption><bdi>{name}</bdi></figcaption></figure>;
    if (s.type.startsWith("audio/") || s.type === "video/mp4") {
      const Media = s.type.startsWith("audio/") ? "audio" : "video";
      return <figure className="reading-fig"><Media className="sub-media" controls preload="metadata" src={s.url} aria-label={name} /><figcaption><bdi>{name}</bdi></figcaption></figure>;
    }
    return <a href={s.url} download={name}><Icon name="install" size={16} /> {t("p.fileSave", { name: isolate(name) })}</a>;
  }
  return (
    <div className="stack-sm">
      <div className="row-gap"><Button size="sm" variant="ghost" icon={iconFor(file.type)} loading={s.busy} onClick={() => { void open(); }}><bdi>{name}</bdi></Button></div>
      {s.failed && <p className="notice err small" role="alert">{t("p.fileFailed")}</p>}
    </div>
  );
}
