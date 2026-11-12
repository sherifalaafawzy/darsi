import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppBar, Button, EmptyState, Icon, TextField } from "@darsi/design-system";
import { ref, uploadBytes } from "firebase/storage";
import { storage } from "../firebase";
import { api } from "../auth/api";
import { useAuth } from "../auth/AuthProvider";
import { BLOCK_KINDS, checkPage, IMAGE_MAX_BYTES, IMAGE_MAX_PX, LIMITS, newBlock, pageDir, textIn, type Block, type BlockKind, type OrgPage, type PageProblem, type Texts } from "../content/page";
import { useI18n, useLanguages, type MessageKey } from "../i18n";
import { SiteBlocks } from "../landing/SiteBlocks";
import { storageUrl } from "../content/load";
import { errorText } from "../staff/errors";
import { InlineConfirm } from "../staff/InlineConfirm";
import { LeaveQuestion, useFormGuard } from "./formGuard";
import { useOrg } from "./data";
import "../styles/admin.css";
import "../styles/page-builder.css";
import "./strings";

/**
 * The homepage builder (TECHNICAL.md "Organization homepage"): /admin/page for an organization's admins, and
 * /super/orgs/:orgId/page for platform admins. Blocks (text, picture, cards, questions, contact, button) are added from
 * a row of buttons, put in order by dragging their handle (mouse or finger), by the arrow keys on the handle, or by
 * Move up / Move down, and written in each of the page's languages. The preview beside them (under a tab on phones) is
 * the page as people see it. Save keeps a draft; Publish puts it on the organization's own web address.
 */
type Answer = { page: OrgPage | null; rev: number; publishedRev: number | null; publishedAt: number | null };
const KIND_WORD: Record<BlockKind, MessageKey> = { text: "pb.k.text", image: "pb.k.image", cards: "pb.k.cards", faq: "pb.k.faq", contact: "pb.k.contact", button: "pb.k.button" };
const KIND_ICON: Record<BlockKind, Parameters<typeof Icon>[0]["name"]> = { text: "file", image: "image", cards: "book", faq: "chat", contact: "info", button: "link" };
const FIELD_KEYS: Record<string, true> = Object.fromEntries(["heading", "body", "alt", "caption", "title", "text", "q", "a", "email", "phone", "address", "website", "label", "href", "items", "src"].map((f) => [`pb.f.${f}`, true]));
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 10);
const fileId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 12);

/** A picture shrunk on this device to at most IMAGE_MAX_PX on its long side, as WebP (JPEG where WebP can't be made), under IMAGE_MAX_BYTES. */
async function shrink(file: File): Promise<{ blob: Blob; ext: "webp" | "jpg" }> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, IMAGE_MAX_PX / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    for (const type of ["image/webp", "image/jpeg"] as const) {
      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, type, q));
      if (blob && blob.type === type && blob.size <= IMAGE_MAX_BYTES) return { blob, ext: type === "image/webp" ? "webp" : "jpg" };
    }
  }
  throw new Error("too-big");
}

/** A text of several lines, drawn as the design system's text field is (dr-field), which has no multi-line form. */
function LongField({ label, value, max, dir, lang, hint, onChange }: { label: string; value: string; max: number; dir: string; lang: string; hint?: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="dr-field">
      <label htmlFor={id} className="dr-field-label">{label}</label>
      <textarea id={id} className="dr-field-input pb-long" rows={4} maxLength={max} dir={dir} lang={lang} value={value} aria-describedby={hint ? `${id}-hint` : undefined} onChange={(e) => onChange(e.target.value)} />
      {hint && <span id={`${id}-hint`} className="dr-field-hint">{hint}</span>}
    </div>
  );
}

export function PageBuilder() {
  const { t, lang: appLang, locale } = useI18n();
  const params = useParams();
  const { orgId: own, role } = useAuth();
  const orgId = params.orgId ?? own ?? null;
  const platform = role === "superadmin" && !!params.orgId;
  const back = platform ? `/super/orgs/${orgId}?tab=settings` : "/admin?tab=look";
  const nav = useNavigate();
  const org = useOrg(orgId);
  const languages = useLanguages();
  const [loaded, setLoaded] = useState<Answer | null>(null);
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [page, setPage] = useState<OrgPage | null>(null);
  const [dirty, setDirty] = useState(false);
  const [lang, setLang] = useState(appLang);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "save" | "publish" | "unpublish" | "upload">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [problems, setProblems] = useState<PageProblem[]>([]);
  const [asking, setAsking] = useState<"unpublish" | { remove: string } | null>(null);
  const [said, setSaid] = useState("");
  const guard = useFormGuard(dirty);

  const read = async () => {
    if (!orgId) return;
    setLoadErr(null);
    try {
      const a = (await api.manageOrgPage({ action: "get", orgId })) as Answer;
      setLoaded(a);
      const start: OrgPage = a.page ?? { v: 1, langs: [...new Set([appLang, ...languages.slice(0, 2).map((l) => l.code)])].slice(0, 2), blocks: [] };
      setPage(start); setDirty(false);
      setLang(start.langs.includes(appLang) ? appLang : start.langs[0] ?? appLang);
    } catch (e) { setLoadErr(e); }
  };
  useEffect(() => { void read(); }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (next: OrgPage) => { setPage(next); setDirty(true); setMsg(null); };
  const setBlock = (id: string, patch: Partial<Block>) => page && change({ ...page, blocks: page.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)) });
  const move = (from: number, to: number, announce = true) => {
    if (!page || to < 0 || to >= page.blocks.length || from === to) return;
    const blocks = [...page.blocks];
    const [b] = blocks.splice(from, 1);
    blocks.splice(to, 0, b);
    change({ ...page, blocks });
    if (announce) setSaid(t("pb.moved", { kind: t(KIND_WORD[b.kind]), n: to + 1, m: blocks.length }));
  };
  const add = (kind: BlockKind) => {
    if (!page || page.blocks.length >= LIMITS.blocks) return;
    const b = newBlock(kind, newId());
    const at = open ? page.blocks.findIndex((x) => x.id === open) + 1 : page.blocks.length;
    const blocks = [...page.blocks];
    blocks.splice(at < 1 ? blocks.length : at, 0, b);
    change({ ...page, blocks });
    setOpen(b.id);
  };

  // Drag: the handle follows the pointer (mouse or finger), and the block moves as the pointer passes its neighbours.
  const list = useRef<HTMLOListElement>(null);
  const dragging = useRef<{ id: string; pointer: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const onHandleDown = (e: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (e.button !== 0) return;
    dragging.current = { id, pointer: e.pointerId };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragId(id);
  };
  const onHandleMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragging.current;
    if (!d || !page || !list.current) return;
    const items = Array.from(list.current.querySelectorAll<HTMLElement>(":scope > li"));
    const from = page.blocks.findIndex((b) => b.id === d.id);
    let to = from;
    items.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      if (i < from && e.clientY < r.top + r.height / 2) to = Math.min(to, i);
      if (i > from && e.clientY > r.top + r.height / 2) to = Math.max(to, i);
    });
    if (to !== from) move(from, to, false);
  };
  const onHandleUp = () => {
    const d = dragging.current;
    dragging.current = null; setDragId(null);
    if (d && page) { const i = page.blocks.findIndex((b) => b.id === d.id); const b = page.blocks[i]; if (b) setSaid(t("pb.moved", { kind: t(KIND_WORD[b.kind]), n: i + 1, m: page.blocks.length })); }
  };
  const onHandleKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      move(i, e.key === "ArrowUp" ? i - 1 : i + 1);
      // The handle keeps the focus as its block moves.
      const target = e.currentTarget;
      requestAnimationFrame(() => target.focus());
    }
  };

  const check = useMemo(() => (page && orgId ? checkPage(page, orgId) : null), [page, orgId]);
  const shown = useMemo(() => (check?.page ? check.page : page), [check, page]);

  const save = async (publish: boolean) => {
    if (!page || !orgId || busy) return;
    setBusy(publish ? "publish" : "save"); setMsg(null);
    try {
      const r = (await api.manageOrgPage({ action: publish ? "publish" : "save", orgId, page })) as { rev: number; problems?: PageProblem[]; publishedAt?: number };
      setDirty(false);
      setProblems(r.problems ?? []);
      setLoaded((a) => (a ? { ...a, rev: r.rev, ...(publish ? { publishedRev: r.rev, publishedAt: r.publishedAt ?? Date.now() } : {}) } : a));
      setMsg({ ok: true, text: t(publish ? "pb.published" : (r.problems?.length ? "pb.savedWithProblems" : "pb.saved")) });
    } catch (e) {
      const details = (e as { details?: { reason?: string; problems?: PageProblem[] } }).details;
      if (details?.problems) setProblems(details.problems);
      setMsg({ ok: false, text: details?.reason === "page-problems" ? t("pb.fixFirst") : details?.reason === "page-too-long" ? t("pb.tooLong") : errorText(e, t, locale) });
    } finally { setBusy(""); }
  };
  const unpublish = async () => {
    if (!orgId) return;
    setBusy("unpublish"); setMsg(null);
    try { await api.manageOrgPage({ action: "unpublish", orgId }); setLoaded((a) => (a ? { ...a, publishedRev: null, publishedAt: null } : a)); setMsg({ ok: true, text: t("pb.unpublished") }); }
    catch (e) { setMsg({ ok: false, text: errorText(e, t, locale) }); }
    finally { setBusy(""); setAsking(null); }
  };
  const upload = async (id: string, file: File) => {
    if (!orgId) return;
    setBusy("upload"); setMsg(null);
    try {
      const { blob, ext } = await shrink(file);
      const path = `${pageDir(orgId)}img-${fileId()}.${ext}`;
      await uploadBytes(ref(await storage(), path), blob, { contentType: blob.type, cacheControl: "public, max-age=31536000, immutable" });
      setBlock(id, { src: path } as Partial<Block>);
    } catch (e) { setMsg({ ok: false, text: (e as Error).message === "too-big" ? t("pb.imageTooBig") : errorText(e, t, locale) }); }
    finally { setBusy(""); }
  };

  const bar = <AppBar title={t("pb.title")} onBack={() => nav(back)} backLabel={t("common.back")} />;
  if (!orgId) return <>{bar}<main className="screen"><EmptyState title={t("pb.noOrg")} /></main></>;
  if (loadErr) return <>{bar}<main className="screen"><EmptyState tone="error" title={errorText(loadErr, t, locale)} action={<Button size="sm" icon="sync" onClick={() => void read()}>{t("common.retry")}</Button>} /></main></>;
  if (!page || !loaded) return <>{bar}<main className="screen"><div className="loading" aria-busy="true" /></main></>;

  const langDef = (code: string) => languages.find((l) => l.code === code);
  const dirOf = (code: string) => langDef(code)?.dir ?? "ltr";
  const pageLangs = page.langs;
  const published = loaded.publishedRev != null;
  const changedSince = published && (dirty || loaded.rev !== loaded.publishedRev);
  const when = loaded.publishedAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(loaded.publishedAt)) : "";
  const siteHost = (org.data as { site?: { host?: string } } | null | undefined)?.site?.host;
  /** A problem's field in words: "items.2.title" is the third card's (or question's) Title. */
  const fieldWord = (f: string) => { const last = f.split(".").pop() ?? f; const key = `pb.f.${last}`; return t((key in FIELD_KEYS ? key : "pb.f.items") as MessageKey); };
  const problemsOf = (i: number) => problems.filter((p) => p.block === i);
  const showProblems = problems.length > 0;

  /** One text field in the language being written, with the main language's text as a hint when this one is empty. */
  const field = (label: string, value: Texts, set: (v: Texts) => void, opts: { long?: boolean; max: number }) => {
    const v = value[lang] ?? "";
    const other = !v.trim() ? textIn(value, lang, pageLangs) : "";
    const hint = other ? t("pb.fallback", { text: other.length > 60 ? `${other.slice(0, 60)}…` : other }) : undefined;
    return opts.long
      ? <LongField label={label} value={v} max={opts.max} dir={dirOf(lang)} lang={lang} hint={hint} onChange={(x) => set({ ...value, [lang]: x })} />
      : <TextField label={label} value={v} maxLength={opts.max} dir={dirOf(lang)} lang={lang} hint={hint} onChange={(e) => set({ ...value, [lang]: e.target.value })} />;
  };

  const editor = (b: Block, i: number): ReactNode => {
    const set = (patch: Partial<Block>) => setBlock(b.id, patch);
    switch (b.kind) {
      case "text": return <>{field(t("pb.f.heading"), b.heading, (heading) => set({ heading }), { max: LIMITS.heading })}{field(t("pb.f.body"), b.body, (body) => set({ body }), { long: true, max: LIMITS.body })}</>;
      case "image": return (
        <>
          {b.src ? <img className="pb-thumb" src={storageUrl(b.src)} alt="" /> : <p className="muted small">{t("pb.imageNone")}</p>}
          <label className="file-pick">
            <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(b.id, f); }} />
            <Icon name="image" size={20} /><span>{t(b.src ? "pb.imageReplace" : "pb.imageAdd")}</span>
          </label>
          {field(t("pb.f.alt"), b.alt, (alt) => set({ alt }), { max: LIMITS.alt })}
          {field(t("pb.f.caption"), b.caption, (caption) => set({ caption }), { max: LIMITS.caption })}
        </>
      );
      case "cards": return (
        <>
          {field(t("pb.f.heading"), b.heading, (heading) => set({ heading }), { max: LIMITS.heading })}
          {b.items.map((c, j) => (
            <fieldset key={j} className="pb-item">
              <legend>{t("pb.card", { n: j + 1 })}</legend>
              {field(t("pb.f.title"), c.title, (title) => set({ items: b.items.map((x, k) => (k === j ? { ...x, title } : x)) }), { max: LIMITS.title })}
              {field(t("pb.f.text"), c.text, (text) => set({ items: b.items.map((x, k) => (k === j ? { ...x, text } : x)) }), { long: true, max: LIMITS.text })}
              {b.items.length > 1 && <Button size="sm" variant="ghost" icon="cross" onClick={() => set({ items: b.items.filter((_, k) => k !== j) })}>{t("pb.removeCard")}</Button>}
            </fieldset>
          ))}
          {b.items.length < LIMITS.cards && <div><Button size="sm" variant="secondary" icon="up" onClick={() => set({ items: [...b.items, { title: {}, text: {} }] })}>{t("pb.addCard")}</Button></div>}
        </>
      );
      case "faq": return (
        <>
          {field(t("pb.f.heading"), b.heading, (heading) => set({ heading }), { max: LIMITS.heading })}
          {b.items.map((q, j) => (
            <fieldset key={j} className="pb-item">
              <legend>{t("pb.question", { n: j + 1 })}</legend>
              {field(t("pb.f.q"), q.q, (v) => set({ items: b.items.map((x, k) => (k === j ? { ...x, q: v } : x)) }), { max: LIMITS.q })}
              {field(t("pb.f.a"), q.a, (v) => set({ items: b.items.map((x, k) => (k === j ? { ...x, a: v } : x)) }), { long: true, max: LIMITS.a })}
              {b.items.length > 1 && <Button size="sm" variant="ghost" icon="cross" onClick={() => set({ items: b.items.filter((_, k) => k !== j) })}>{t("pb.removeQuestion")}</Button>}
            </fieldset>
          ))}
          {b.items.length < LIMITS.faq && <div><Button size="sm" variant="secondary" icon="up" onClick={() => set({ items: [...b.items, { q: {}, a: {} }] })}>{t("pb.addQuestion")}</Button></div>}
        </>
      );
      case "contact": return (
        <>
          {field(t("pb.f.heading"), b.heading, (heading) => set({ heading }), { max: LIMITS.heading })}
          <TextField label={t("pb.f.email")} type="email" dir="ltr" value={b.email} maxLength={LIMITS.email} onChange={(e) => set({ email: e.target.value })} />
          <TextField label={t("pb.f.phone")} type="tel" dir="ltr" value={b.phone} maxLength={LIMITS.phone} onChange={(e) => set({ phone: e.target.value })} />
          {field(t("pb.f.address"), b.address, (address) => set({ address }), { long: true, max: LIMITS.address })}
          <TextField label={t("pb.f.website")} type="url" dir="ltr" value={b.website} maxLength={LIMITS.url} hint={t("pb.httpsHint")} onChange={(e) => set({ website: e.target.value })} />
        </>
      );
      case "button": return (
        <>
          {field(t("pb.f.label"), b.label, (label) => set({ label }), { max: LIMITS.label })}
          <TextField label={t("pb.f.href")} dir="ltr" value={b.href} maxLength={LIMITS.url} hint={t("pb.hrefHint")} onChange={(e) => set({ href: e.target.value })} />
        </>
      );
    }
    void i;
  };

  return (
    <>
      {bar}
      <main className="screen wide stack-lg pb">
        <LeaveQuestion guard={guard} />
        <p className="muted">{t("pb.intro")}</p>
        <p className="small">
          {published ? t(changedSince ? "pb.stateChanged" : "pb.statePublished", { date: when }) : t("pb.stateDraft")}{" "}
          {siteHost ? <>{t("pb.shownAt")} <a href={`https://${siteHost}/`} target="_blank" rel="noopener" dir="ltr">{siteHost}</a></> : <>{t("pb.noSite")} {!platform && <Link to="/admin?tab=signin">{t("pb.askSite")}</Link>}</>}
        </p>

        {/* The page's languages: which it is written in (the first is the one shown where another is empty), and which one is being written now. */}
        <section className="panel stack-sm" aria-labelledby="pb-langs">
          <h3 id="pb-langs">{t("pb.langs")}</h3>
          <div className="pb-chips" role="group" aria-labelledby="pb-has">
            <p className="pb-row-label small" id="pb-has">{t("pb.langsHas")}</p>
            {languages.map((l) => {
              const on = pageLangs.includes(l.code);
              return (
                <button key={l.code} type="button" className="pb-chip" aria-pressed={on} lang={l.code} disabled={on && pageLangs.length === 1}
                  onClick={() => { const langs = on ? pageLangs.filter((x) => x !== l.code) : [...pageLangs, l.code]; change({ ...page, langs }); if (on && lang === l.code) setLang(langs[0]); }}>
                  {l.native}{pageLangs[0] === l.code && <span className="pb-main">{t("common.sep")}{t("pb.main")}</span>}
                </button>
              );
            })}
          </div>
          <p className="pb-row-label small" id="pb-writing">{t("pb.writing")}</p>
          <div className="pb-tabs" role="tablist" aria-labelledby="pb-writing">
            {pageLangs.map((code) => (
              <button key={code} type="button" role="tab" aria-selected={lang === code} className="pb-tab" lang={code} onClick={() => setLang(code)}>{langDef(code)?.native ?? code}</button>
            ))}
          </div>
          {lang !== pageLangs[0] && <div><Button size="sm" variant="ghost" onClick={() => change({ ...page, langs: [lang, ...pageLangs.filter((x) => x !== lang)] })}>{t("pb.makeMain", { lang: langDef(lang)?.native ?? lang })}</Button></div>}
        </section>

        <div className="pb-views" role="tablist" aria-label={t("pb.title")}>
          <button type="button" role="tab" aria-selected={view === "edit"} className="pb-tab" onClick={() => setView("edit")}>{t("pb.edit")}</button>
          <button type="button" role="tab" aria-selected={view === "preview"} className="pb-tab" onClick={() => setView("preview")}>{t("pb.preview")}</button>
        </div>

        <div className={`pb-split is-${view}`}>
          <div className="pb-editor stack">
            <div className="pb-add" role="group" aria-label={t("pb.add")}>
              <span className="small">{t("pb.add")}</span>
              {BLOCK_KINDS.map((k) => <Button key={k} size="sm" variant="secondary" icon={KIND_ICON[k]} disabled={page.blocks.length >= LIMITS.blocks} onClick={() => add(k)}>{t(KIND_WORD[k])}</Button>)}
            </div>
            {page.blocks.length === 0 && <p className="muted">{t("pb.empty")}</p>}
            <p className="pb-said" role="status" aria-live="polite">{said}</p>
            <ol className="pb-list" ref={list}>
              {page.blocks.map((b, i) => {
                const mine = showProblems ? problemsOf(i) : [];
                const isOpen = open === b.id;
                const head = b.kind === "image" ? textIn(b.alt, lang, pageLangs) : b.kind === "button" ? textIn(b.label, lang, pageLangs) : textIn((b as { heading?: Texts }).heading, lang, pageLangs) || (b.kind === "text" ? textIn(b.body, lang, pageLangs).slice(0, 48) : "");
                return (
                  <li key={b.id} className={`pb-block${dragId === b.id ? " is-dragging" : ""}${mine.length ? " is-bad" : ""}`}>
                    <div className="pb-block-head">
                      <button type="button" className="pb-handle" aria-label={t("pb.handle", { kind: t(KIND_WORD[b.kind]), n: i + 1, m: page.blocks.length })} aria-describedby="pb-handle-hint"
                        onPointerDown={(e) => onHandleDown(e, b.id)} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp} onKeyDown={(e) => onHandleKey(e, i)}>
                        <Icon name="grip" size={20} />
                      </button>
                      <button type="button" className="pb-block-title" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : b.id)}>
                        <Icon name={KIND_ICON[b.kind]} size={18} /><span><b>{t(KIND_WORD[b.kind])}</b>{head && head !== t(KIND_WORD[b.kind]) && <span className="muted"> — {head}</span>}</span>
                      </button>
                      <div className="pb-block-tools">
                        <Button size="sm" variant="ghost" iconOnly icon="up" disabled={i === 0} onClick={() => move(i, i - 1)}>{t("pb.up")}</Button>
                        <Button size="sm" variant="ghost" iconOnly icon="down" disabled={i === page.blocks.length - 1} onClick={() => move(i, i + 1)}>{t("pb.down")}</Button>
                        <Button size="sm" variant="ghost" iconOnly icon="cross" onClick={() => setAsking({ remove: b.id })}>{t("pb.remove")}</Button>
                      </div>
                    </div>
                    {mine.length > 0 && <ul className="err-text pb-problems">{mine.map((p, j) => <li key={j}>{t(`pb.p.${p.code}${p.code === "too-long" && p.lang ? "Lang" : ""}` as MessageKey, { field: fieldWord(p.field), lang: p.lang ? langDef(p.lang)?.native ?? p.lang : "" })}</li>)}</ul>}
                    {asking && typeof asking === "object" && asking.remove === b.id && (
                      <InlineConfirm danger title={t("pb.removeTitle")} confirmLabel={t("pb.remove")} onConfirm={() => { change({ ...page, blocks: page.blocks.filter((x) => x.id !== b.id) }); setAsking(null); }} onCancel={() => setAsking(null)} />
                    )}
                    {isOpen && <div className="pb-fields stack-sm" lang={lang} dir={dirOf(lang)}>{editor(b, i)}</div>}
                  </li>
                );
              })}
            </ol>
            <p id="pb-handle-hint" className="muted small">{t("pb.handleHint")}</p>
          </div>
          <div className="pb-preview" aria-label={t("pb.preview")} role="region">
            {shown && shown.blocks.length ? <SiteBlocks page={shown} lang={lang} /> : <p className="muted">{t("pb.previewEmpty")}</p>}
          </div>
        </div>

        {showProblems && <p className="err-text" role="alert">{t("pb.fixFirst")}</p>}
        {msg && <p className={msg.ok ? "notice ok" : "notice err"} role="status">{msg.text}</p>}
        {asking === "unpublish" && <InlineConfirm danger title={t("pb.unpublishTitle")} body={t("pb.unpublishBody")} confirmLabel={t("pb.unpublish")} busy={busy === "unpublish"} onConfirm={() => void unpublish()} onCancel={() => setAsking(null)} />}
        <div className="row-gap pb-actions">
          <Button loading={busy === "publish"} disabled={!!busy && busy !== "publish"} onClick={() => void save(true)}>{t("pb.publish")}</Button>
          <Button variant="secondary" loading={busy === "save"} disabled={(!!busy && busy !== "save") || !dirty} onClick={() => void save(false)}>{t("pb.save")}</Button>
          {published && <Button variant="ghost" disabled={!!busy} onClick={() => setAsking("unpublish")}>{t("pb.unpublish")}</Button>}
          {busy === "upload" && <span className="muted small" role="status">{t("pb.uploading")}</span>}
        </div>
      </main>
    </>
  );
}
