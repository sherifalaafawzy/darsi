import type { Art as ArtName } from "../content/types";
/** Word-free pictograms for image questions (same picture works in every language). */
export function Art({ name }: { name: ArtName }) {
  return (
    <svg viewBox="0 0 120 90" width="100%" height="100%" aria-hidden>
      {name === "sensor" && <><rect x={52} y={10} width={16} height={50} rx={8} fill="var(--ink)" /><circle cx={60} cy={66} r={14} fill="var(--hibiscus)" /></>}
      {name === "lamp" && <><circle cx={60} cy={38} r={20} fill="var(--sunbird)" /><rect x={52} y={58} width={16} height={14} rx={3} fill="var(--ink)" /></>}
      {name === "phone" && <><rect x={42} y={8} width={36} height={74} rx={8} fill="var(--ink)" /><rect x={46} y={16} width={28} height={52} rx={3} fill="var(--lagoon-soft)" /></>}
      {name === "plant" && <><rect x={44} y={56} width={32} height={26} rx={6} fill="var(--kola)" /><rect x={58} y={28} width={4} height={30} fill="var(--lagoon-ink)" /><circle cx={48} cy={30} r={12} fill="var(--lagoon)" /><circle cx={72} cy={24} r={12} fill="var(--lagoon)" /></>}
      {name === "chat" && <><path d="M22 14h76a8 8 0 0 1 8 8v36a8 8 0 0 1-8 8H50l-16 12V66H22a8 8 0 0 1-8-8V22a8 8 0 0 1 8-8z" fill="var(--kola)" /><rect x={30} y={30} width={56} height={6} rx={3} fill="var(--surface)" /><rect x={30} y={44} width={38} height={6} rx={3} fill="var(--surface)" /></>}
      {name === "calculator" && <><rect x={38} y={8} width={44} height={74} rx={6} fill="var(--ink)" /><rect x={44} y={14} width={32} height={16} rx={2} fill="var(--lagoon-soft)" />{[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={45 + c * 11} y={38 + r * 13} width={8} height={9} rx={2} fill="var(--surface)" />))}</>}
    </svg>
  );
}
