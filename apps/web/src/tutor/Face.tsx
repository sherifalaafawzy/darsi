import type { Ref } from "react";

/**
 * The tutor's face: Salma from the Lesson Studio cast (public/lib/v1/cast), drawn inline so it costs no request and
 * shows offline. It lives on the startup path (the lesson screen's button), so it imports nothing but React's types.
 * The panel animates it through CSS variables set straight on the element, without re-rendering React:
 * --mouth (0–1, from the tutor's voice) opens the mouth; --ear (0–1, from the microphone) grows the listening ring.
 */
export function TutorFace({ className, ref }: { className?: string; ref?: Ref<SVGSVGElement> }) {
  const line = { stroke: "#1e1a33", strokeWidth: 6, strokeLinejoin: "round" as const };
  return (
    <svg ref={ref} className={className ? `tf-face ${className}` : "tf-face"} viewBox="80 66 240 240" aria-hidden="true" focusable="false">
      <path d="M200 106 m-31 0 a31 31 0 1 0 62 0 a31 31 0 1 0 -62 0" fill="#3b2a22" {...line} />
      <path d="M66 400 C66 322 126 286 200 286 C274 286 334 322 334 400 Z" fill="#f04a7e" {...line} />
      <path d="M170 288 L200 330 L230 288" fill="none" {...line} />
      <rect x="177" y="244" width="46" height="50" rx="12" fill="#c48a5c" stroke="#1e1a33" strokeWidth={6} />
      <ellipse cx="200" cy="192" rx="64" ry="72" fill="#c48a5c" stroke="#1e1a33" strokeWidth={6} />
      <path d="M136 196 q-16 -2 -12 18 q4 14 16 10" fill="#c48a5c" {...line} />
      <path d="M264 196 q16 -2 12 18 q-4 14 -16 10" fill="#c48a5c" {...line} />
      <path d="M137 182 C134 128 170 116 200 116 C232 116 268 128 263 182 C250 150 226 140 200 146 C176 140 150 152 137 182 Z" fill="#3b2a22" {...line} />
      <circle cx="160" cy="218" r="10" fill="#ff6a2b" opacity="0.28" />
      <circle cx="240" cy="218" r="10" fill="#ff6a2b" opacity="0.28" />
      <circle className="tf-eye" cx="178" cy="197" r="7.5" fill="#1e1a33" />
      <circle className="tf-eye" cx="222" cy="197" r="7.5" fill="#1e1a33" />
      <g className="tf-brows" fill="none" stroke="#1e1a33" strokeWidth={5.5} strokeLinecap="round">
        <path d="M165 177 q12 -7 24 -1" />
        <path d="M211 176 q12 -6 24 1" />
      </g>
      <ellipse className="tf-mouth" cx="200" cy="230" rx="14" ry="11" fill="#1e1a33" />
      <circle cx="134" cy="232" r="7" fill="#ffc53d" stroke="#1e1a33" strokeWidth={4} />
      <circle cx="266" cy="232" r="7" fill="#ffc53d" stroke="#1e1a33" strokeWidth={4} />
    </svg>
  );
}
