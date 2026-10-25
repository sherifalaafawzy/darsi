// Generated from tokens.json — run `npm run tokens`.
export const themes = ["light","sunlight"] as const;
export type ThemeId = (typeof themes)[number];
export const colors = {
  "light": {
    "paper": "#f2f2f2",
    "surface": "#ffffff",
    "surface-sunk": "#f6ebdd",
    "line": "#ead9c4",
    "line-strong": "#8a7560",
    "ink": "#1e1a33",
    "ink-muted": "#5c5470",
    "ink-inverse": "#fff8ee",
    "kola": "#ff6a2b",
    "kola-deep": "#b43c0a",
    "kola-soft": "#ffe2d2",
    "on-kola": "#1e1a33",
    "sunbird": "#ffc53d",
    "sunbird-soft": "#fff0c4",
    "sunbird-ink": "#7a5000",
    "lagoon": "#14b8a6",
    "lagoon-soft": "#ccf2ec",
    "lagoon-ink": "#065f56",
    "hibiscus": "#f04a7e",
    "hibiscus-soft": "#fdd9e5",
    "hibiscus-ink": "#a3123f",
    "correct": "#1660c4",
    "correct-soft": "#dceafc",
    "wrong": "#c4271f",
    "wrong-soft": "#fde1de",
    "scrim": "rgba(30, 26, 51, 0.55)",
    "focus": "#2f4bdb"
  },
  "sunlight": {
    "paper": "#ffffff",
    "surface": "#ffffff",
    "surface-sunk": "#f2f2f2",
    "line": "#000000",
    "line-strong": "#000000",
    "ink": "#000000",
    "ink-muted": "#1f1f1f",
    "ink-inverse": "#ffffff",
    "kola": "#ff6a2b",
    "kola-deep": "#7a2700",
    "kola-soft": "#ffd9c6",
    "on-kola": "#000000",
    "sunbird": "#ffc53d",
    "sunbird-soft": "#fff0c4",
    "sunbird-ink": "#523500",
    "lagoon": "#14b8a6",
    "lagoon-soft": "#ccf2ec",
    "lagoon-ink": "#033f39",
    "hibiscus": "#ff5c8d",
    "hibiscus-soft": "#fdd9e5",
    "hibiscus-ink": "#6e0a29",
    "correct": "#0b3f8f",
    "correct-soft": "#dceafc",
    "wrong": "#8f130d",
    "wrong-soft": "#fde1de",
    "scrim": "rgba(0, 0, 0, 0.7)",
    "focus": "#0000ee"
  }
} as const;
export type ColorToken = keyof (typeof colors)["light"];
export const shadows = {
  "light": {
    "shadow-press": "0 4px 0 0 #1e1a33",
    "shadow-card": "0 3px 0 0 #ead9c4"
  },
  "sunlight": {
    "shadow-press": "0 4px 0 0 #000000",
    "shadow-card": "0 3px 0 0 #000000"
  }
} as const;
export const spacing = {
  "space-1": "4px",
  "space-2": "8px",
  "space-3": "12px",
  "space-4": "16px",
  "space-6": "24px",
  "space-8": "32px",
  "space-12": "48px"
} as const;
export const radius = {
  "radius-sm": "8px",
  "radius-md": "14px",
  "radius-lg": "22px",
  "radius-pill": "999px"
} as const;
export const size = {
  "tap-min": "48px",
  "icon-md": "24px",
  "content-max": "560px",
  "appbar-h": "56px",
  "bottomnav-h": "64px",
  "path-node": "72px"
} as const;
export const zIndex = {
  "z-appbar": "10",
  "z-banner": "20",
  "z-sheet": "40",
  "z-toast": "50"
} as const;
export const fontFamilies = {
  "display": "\"Baloo 2\", \"Baloo 2 Ext\", \"Baloo Bhaijaan 2\", \"Noto Sans Devanagari\", \"Noto Sans Ethiopic\", system-ui, sans-serif",
  "sans": "\"Noto Sans\", \"Noto Sans Arabic\", \"Noto Sans Devanagari\", \"Noto Sans Bengali\", \"Noto Sans Ethiopic\", system-ui, sans-serif"
} as const;
export const typography = {
  "display-xl": {
    "fontFamily": "\"Baloo 2\", \"Baloo 2 Ext\", \"Baloo Bhaijaan 2\", \"Noto Sans Devanagari\", \"Noto Sans Ethiopic\", system-ui, sans-serif",
    "fontSize": "48px",
    "lineHeight": "52px",
    "fontWeight": 800
  },
  "display": {
    "fontFamily": "\"Baloo 2\", \"Baloo 2 Ext\", \"Baloo Bhaijaan 2\", \"Noto Sans Devanagari\", \"Noto Sans Ethiopic\", system-ui, sans-serif",
    "fontSize": "36px",
    "lineHeight": "42px",
    "fontWeight": 800
  },
  "title": {
    "fontFamily": "\"Baloo 2\", \"Baloo 2 Ext\", \"Baloo Bhaijaan 2\", \"Noto Sans Devanagari\", \"Noto Sans Ethiopic\", system-ui, sans-serif",
    "fontSize": "26px",
    "lineHeight": "32px",
    "fontWeight": 700
  },
  "heading": {
    "fontFamily": "\"Baloo 2\", \"Baloo 2 Ext\", \"Baloo Bhaijaan 2\", \"Noto Sans Devanagari\", \"Noto Sans Ethiopic\", system-ui, sans-serif",
    "fontSize": "20px",
    "lineHeight": "28px",
    "fontWeight": 700
  },
  "body-lg": {
    "fontFamily": "\"Noto Sans\", \"Noto Sans Arabic\", \"Noto Sans Devanagari\", \"Noto Sans Bengali\", \"Noto Sans Ethiopic\", system-ui, sans-serif",
    "fontSize": "18px",
    "lineHeight": "28px",
    "fontWeight": 400
  },
  "body": {
    "fontFamily": "\"Noto Sans\", \"Noto Sans Arabic\", \"Noto Sans Devanagari\", \"Noto Sans Bengali\", \"Noto Sans Ethiopic\", system-ui, sans-serif",
    "fontSize": "16px",
    "lineHeight": "24px",
    "fontWeight": 400
  },
  "label": {
    "fontFamily": "\"Noto Sans\", \"Noto Sans Arabic\", \"Noto Sans Devanagari\", \"Noto Sans Bengali\", \"Noto Sans Ethiopic\", system-ui, sans-serif",
    "fontSize": "14px",
    "lineHeight": "20px",
    "fontWeight": 600
  },
  "caption": {
    "fontFamily": "\"Noto Sans\", \"Noto Sans Arabic\", \"Noto Sans Devanagari\", \"Noto Sans Bengali\", \"Noto Sans Ethiopic\", system-ui, sans-serif",
    "fontSize": "12px",
    "lineHeight": "16px",
    "fontWeight": 500
  }
} as const;
/** CSS custom-property reference for a token, e.g. cssVar("kola") → "var(--kola)". */
export const cssVar = (name: string) => `var(--${name})`;
