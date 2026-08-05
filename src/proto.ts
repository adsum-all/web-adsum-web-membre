import { palette } from "./paletteMarque.js";

// Design tokens copied verbatim from the ADSUM member prototype (03-prototype),
// so the live app matches the high-fidelity design pixel for pixel.

// Theme-sensitive tokens reference the @adsum/tokens CSS variables so the app
// follows the active theme (light / dark / system). The hex after each var is a
// fallback: in light mode it equals the historical value (zero visual change),
// in dark mode the variable resolves to the dark palette. The brand blues stay
// literal because they are used as solid fills under white text (buttons, active
// chips, gradients), legible in both themes, and some are combined with an alpha
// suffix (`${T.b600}33`) that only works on a hex literal. Text or tint surfaces
// that must adapt use the semantic tint tokens below (defined in styles.css).
export const T = {
  fd: "'Space Grotesk',sans-serif",
  fu: "'IBM Plex Sans',sans-serif",
  fm: "'IBM Plex Mono',monospace",
  // The brand blues follow the colour the organisation configured. Read through
  // getters so every existing call site keeps working, including the ones that
  // concatenate alpha onto them, which only works on a hex string.
  get b400(): string {
    return palette.b400;
  },
  get b500(): string {
    return palette.b500;
  },
  get b600(): string {
    return palette.b600;
  },
  get b700(): string {
    return palette.b700;
  },
  get b900(): string {
    return palette.b900;
  },
  ink: "var(--adsum-ink, #16181d)",
  mut: "var(--adsum-mut, #676b73)",
  faint: "var(--adsum-faint, #9498a1)",
  line: "var(--adsum-line, #e7e9ee)",
  surf: "var(--adsum-panel, #ffffff)",
  bg: "var(--adsum-bg, #eef1f6)",
  ok: "var(--adsum-ok, #1f8a5b)",
  okbg: "var(--adsum-ok-bg, #e6f3ec)",
  warn: "var(--adsum-warn, #b5731a)",
  warnbg: "var(--adsum-warn-bg, #f7eede)",
  dng: "var(--adsum-danger, #c0392b)",
  // Semantic tints, legible in light and dark (see styles.css).
  tintb: "var(--adsum-tint-blue-bg, #eef3fc)",
  tintbf: "var(--adsum-tint-blue-fg, #2a4fad)",
  tintr: "var(--adsum-tint-red-bg, #fae9e7)",
  tintrf: "var(--adsum-tint-red-fg, #c0392b)",
  tintrl: "var(--adsum-tint-red-line, #e0a59c)",
  chip: "var(--adsum-chip-bg, #f2f4f8)",
} as const;

/** All navigable routes of the member app, mirroring the prototype. */
export type Route =
  | "card"
  | "qr"
  | "activities"
  | "session"
  | "sent"
  | "history"
  | "detail"
  | "profile"
  | "validation"
  | "notif"
  | "secu"
  | "document"
  | "dossier"
  | "recens"
  | "first"
  | "forgot"
  | "otp"
  | "engage"
  | "settings";

/** Routes shown full screen (no bottom tab bar). */
export const FULLSCREEN: Route[] = ["qr", "session", "sent", "first", "forgot", "otp", "engage"];

export const gradient = `linear-gradient(180deg,${T.b500},${T.b600})`;
export const cardGradient = `linear-gradient(155deg,${T.b600},${T.b900})`;
