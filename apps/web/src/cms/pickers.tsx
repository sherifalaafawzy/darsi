/**
 * Track and level pickers for units: cards with each track's icon and colour, and one button per level of the chosen
 * track (with the level's name when platform admins gave it one). Hidden tracks are offered too, marked, so editors can
 * prepare units before a track goes live.
 */
import { ChoiceCard, type IconName } from "@darsi/design-system";
import { useTracks } from "../content/settings";
import { AUDIENCES, type Audience } from "../content/types";
import { useI18n } from "../i18n";

export function TrackPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t, num } = useI18n();
  const tracks = useTracks();
  const known = tracks.all.some((x) => x.id === value);
  const list = known ? tracks.all : [...tracks.all, tracks.of(value)];
  return (
    <fieldset className="ed-fieldset">
      <legend className="dr-field-label">{t("cms.track")}</legend>
      <div className="ed-trackpick" role="radiogroup" aria-label={t("cms.track")}>
        {list.map((x) => (
          <div key={x.id} className={`dr-tr dr-tr-${x.tone}`}>
            <ChoiceCard icon={x.icon as IconName} title={tracks.name(x.id)} selected={value === x.id} onClick={() => onChange(x.id)}
              description={!known && x.id === value ? t("cms.tracks.unknown")
                : [t("cms.tracks.levelsCount", { n: num(x.levels) }), x.hidden ? t("cms.tracks.hidden") : ""].filter(Boolean).join(t("common.sep"))} />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/** Who the course is for: students see only courses for students, teachers only courses for teachers. */
export function AudiencePicker({ value, onChange }: { value: Audience; onChange: (a: Audience) => void }) {
  const { t } = useI18n();
  return (
    <fieldset className="ed-fieldset">
      <legend className="dr-field-label">{t("cms.audience")}</legend>
      <div className="ed-seg" role="radiogroup" aria-label={t("cms.audience")}>
        {AUDIENCES.map((a) => (
          <button key={a} type="button" role="radio" aria-checked={value === a} className={`ed-seg-btn${value === a ? " is-on" : ""}`} onClick={() => onChange(a)}>
            <strong>{t(`cms.audience.${a}`)}</strong>
          </button>
        ))}
      </div>
      <p className="muted small">{t("cms.audienceHint")}</p>
    </fieldset>
  );
}

export function LevelPicker({ track, value, onChange }: { track: string; value: number; onChange: (level: number) => void }) {
  const { t, num } = useI18n();
  const tracks = useTracks();
  const n = Math.max(tracks.of(track).levels, value);
  return (
    <fieldset className="ed-fieldset">
      <legend className="dr-field-label">{t("cms.level")}</legend>
      <div className="ed-seg" role="radiogroup" aria-label={t("cms.level")}>
        {Array.from({ length: n }, (_, i) => i + 1).map((lv) => {
          const name = tracks.levelName(track, lv), named = name !== t("place.level", { n: lv });
          return (
            <button key={lv} type="button" role="radio" aria-checked={value === lv} aria-label={named ? `${t("place.level", { n: lv })}: ${name}` : name}
              className={`ed-seg-btn${value === lv ? " is-on" : ""}`} onClick={() => onChange(lv)}>
              <strong>{num(lv)}</strong>{named && <span>{name}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
