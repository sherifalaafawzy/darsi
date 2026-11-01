import { useEffect, useRef, useState } from "react";
import { BrandProvider, Button, Mark, TextField, BrandMark } from "@darsi/design-system";
import { doc, updateDoc } from "firebase/firestore";
import { deleteObject, ref, uploadBytes } from "firebase/storage";
import { db, storage, storageDataUrl } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import type { Org } from "../auth/types";
import { useI18n } from "../i18n";
import { useStore } from "../state/store";
import "./strings";

/** Largest side of a logo, in px; the app shows it at 36 px at most, so 256 stays sharp on dense screens. */
const LOGO_PX = 256;
const MAX_BYTES = 100 * 1024;

const dataUrl = (b: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(b);
});

/**
 * A logo for the phone: at most 256 px, WebP where the browser can write it (PNG otherwise, keeping transparency),
 * and under 100 KB, so every member's phone downloads it once, quickly. Smaller sizes are tried if it is still big.
 */
export async function shrinkLogo(file: Blob): Promise<{ blob: Blob; ext: "webp" | "png" }> {
  const bmp = await createImageBitmap(file);
  try {
    for (const px of [LOGO_PX, 192, 128]) {
      const scale = Math.min(1, px / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bmp.width * scale)); canvas.height = Math.max(1, Math.round(bmp.height * scale));
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const webp = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.85));
      const out = webp?.type === "image/webp" ? webp : await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (out && out.size <= MAX_BYTES) return { blob: out, ext: out.type === "image/webp" ? "webp" : "png" };
    }
  } finally { bmp.close(); }
  throw new Error("too-big");
}

const fileId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 12);

/**
 * The organization's name and logo (TECHNICAL.md "Organization branding"). Its members see them in place of Darsi's
 * in the app bar, the nav rail, their certificates and the page title, with a small credit for Darsi.
 */
export function OrgBranding({ org }: { org: Org }) {
  const { t } = useI18n();
  const { state, dispatch } = useStore();
  const { orgId: myOrg } = useAuth();
  const mine = myOrg === org.id;
  // A platform admin looking at another organization: its logo comes from Storage once, not from this phone.
  const [remote, setRemote] = useState<string>();
  const [name, setName] = useState(org.name);
  const [logo, setLogo] = useState<{ blob: Blob; ext: "webp" | "png"; url: string } | null>(null);
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { setName(org.name); }, [org.name]);
  const path = org.brand?.logo;
  useEffect(() => { if (!mine && path) storageDataUrl(path).then(setRemote, () => {}); }, [mine, path]);
  // The logo as members see it now: a new pick, nothing (removed), or the one this phone already keeps.
  const current = mine && state.org?.id === org.id ? state.org.logo : remote;
  const shown = logo?.url ?? (remove ? undefined : current);
  const trimmed = name.trim();
  const changed = trimmed !== org.name || Boolean(logo) || (remove && Boolean(org.brand?.logo));

  const pick = async (f?: File) => {
    setMsg(null);
    if (!f) return;
    if (!/^image\//.test(f.type)) return setMsg({ ok: false, text: t("brand.notImage") });
    try { const s = await shrinkLogo(f); setLogo({ ...s, url: await dataUrl(s.blob) }); setRemove(false); }
    catch { setMsg({ ok: false, text: t("brand.tooBig") }); }
  };

  const save = async () => {
    if (trimmed.length < 2 || trimmed.length > 80) return setMsg({ ok: false, text: t("brand.nameLength") });
    setBusy(true); setMsg(null);
    try {
      const old = org.brand?.logo ?? null;
      let path = remove ? null : old;
      if (logo) {
        path = `orgs/${org.id}/brand/logo-${fileId()}.${logo.ext}`;
        await uploadBytes(ref(await storage(), path), logo.blob, { contentType: logo.blob.type, cacheControl: "public, max-age=31536000, immutable" });
      }
      const v = (org.brand?.v ?? 0) + 1;
      await updateDoc(doc(db, "orgs", org.id), { name: trimmed, brand: { logo: path, v } });
      // The old file is no longer used; a failed delete only leaves a small orphan behind.
      if (old && old !== path) deleteObject(ref(await storage(), old)).catch(() => {});
      // This phone shows the new look at once; members' phones pick it up at their next sign-in or start.
      if (mine) dispatch({ type: "set", patch: { org: { id: org.id, name: trimmed, v, ...(shown ? { logo: shown } : {}) } } });
      setLogo(null); setRemove(false);
      setMsg({ ok: true, text: t("brand.saved") });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally { setBusy(false); }
  };

  return (
    <section className="panel stack" aria-labelledby="brand-h">
      <h3 id="brand-h">{t("brand.title")}</h3>
      <p className="muted small">{t("brand.hint")}</p>
      <TextField label={t("brand.name")} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      <div className="brand-row">
        {/* What members will see in their app bar. */}
        <BrandProvider logo={shown} name={trimmed}>
          <div className="brand-preview" aria-label={t("brand.preview")}><BrandMark size={36} /><strong><bdi>{trimmed || "—"}</bdi></strong><small><Mark size={14} />{t("org.withDarsi")}</small></div>
        </BrandProvider>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        <Button size="sm" variant="secondary" icon="install" onClick={() => file.current?.click()}>{shown ? t("brand.changeLogo") : t("brand.addLogo")}</Button>
        {shown && <Button size="sm" variant="ghost" icon="close" onClick={() => { setLogo(null); setRemove(true); }}>{t("brand.removeLogo")}</Button>}
      </div>
      <p className="muted small">{t("brand.logoHint")}</p>
      {msg && <p className={msg.ok ? "notice ok" : "notice err"} role="status">{msg.text}</p>}
      <div><Button onClick={() => { void save(); }} disabled={busy || !changed}>{busy ? t("brand.saving") : t("brand.save")}</Button></div>
    </section>
  );
}
