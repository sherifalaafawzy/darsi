import { TutorFace } from "./Face";
import "../styles/tutor-fab.css";

/**
 * The tutor's button, floating at the inline end of lesson screens (App renders it, with the panel). On the startup
 * path: it imports only the face, and the panel itself is a lazy chunk that loads on the first tap (`busy` pulses the
 * button meanwhile, since that can take a moment on a slow phone).
 */
export function TutorFab({ label, onOpen, busy = false }: { label: string; onOpen: () => void; busy?: boolean }) {
  return (
    <button type="button" className="tutor-fab" aria-label={label} title={label} aria-haspopup="dialog" aria-busy={busy} onClick={onOpen}>
      <TutorFace />
    </button>
  );
}
