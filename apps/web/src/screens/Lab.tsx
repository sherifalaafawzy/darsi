import { AppBar } from "@darsi/design-system";
import { useI18n } from "../i18n";
import { LAB_TOOLS, LabTool } from "../lab/presets";

export function Lab() {
  const { t, lang, num } = useI18n();
  return (
    <>
      <AppBar title={t("lab.title")} />
      <main className="screen">
        <p className="lead">{t("lab.intro")}</p>
        <div className="lab-grid">{LAB_TOOLS.map((tool) => <LabTool key={tool} tool={tool} lang={lang} num={(n) => num(n)} />)}</div>
      </main>
    </>
  );
}
