import type { ActionsAttendues, ActionUrgence } from "../api.js";
import { useT } from "../i18n.js";
import { T } from "../proto.js";

interface Props {
  actions: ActionsAttendues;
  /** Open the pending request(s): the exact request when there is one, else the list. */
  onOpen: () => void;
  /** When provided, a discreet dismiss control is shown. Only offered at the calm
   * level, so a real deadline can never be silenced away. */
  onDismiss?: () => void;
}

/** Palette per urgency. Kept calm on purpose: a member must notice, never feel
 * scolded. The colour only firms up as the request ages or its deadline nears. */
function palette(urgence: ActionUrgence): { bg: string; border: string; accent: string; title: string } {
  if (urgence === "critique") {
    return { bg: T.warnbg, border: T.warn, accent: T.warn, title: T.warn };
  }
  if (urgence === "elevee") {
    return { bg: T.warnbg, border: T.warn, accent: T.warn, title: T.ink };
  }
  return { bg: T.tintb, border: `${T.b600}33`, accent: T.b600, title: T.ink };
}

/** A single sober line, shown above the tab content on every main screen, that
 * tells the member an action awaits them and leads straight to it. It never
 * blocks the interface (no modal) and never stacks: several pending requests are
 * summarised as one count, opening the list. */
export function ActionBanner({ actions, onOpen, onDismiss }: Props): JSX.Element | null {
  const t = useT();
  if (!actions.total) return null;

  const p = palette(actions.urgence_max);
  const multiple = actions.total > 1;
  const primary = actions.items[0];
  const critique = actions.urgence_max === "critique";

  const title = multiple
    ? t("action.many").replace("{n}", String(actions.total))
    : t("action.one");

  // Second line: what it is and why it presses. For several requests, a calm hint
  // about the oldest, so the member grasps the urgency without a wall of items.
  let detail = "";
  if (multiple) {
    detail =
      actions.plus_ancienne_jours >= 3
        ? t("action.manyOldest").replace("{n}", String(actions.plus_ancienne_jours))
        : t("action.manyHint");
  } else if (primary) {
    const bits: string[] = [primary.sujet];
    if (primary.echeance_jours != null) {
      if (primary.echeance_jours < 0) bits.push(t("action.deadlinePassed"));
      else if (primary.echeance_jours === 0) bits.push(t("action.deadlineToday"));
      else bits.push(t("action.deadlineIn").replace("{n}", String(primary.echeance_jours)));
    } else if (primary.depuis_jours >= 3) {
      bits.push(t("action.sinceDays").replace("{n}", String(primary.depuis_jours)));
    }
    detail = bits.join(" · ");
  }

  const cta = critique ? t("action.act") : t("action.cta");

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        background: p.bg,
        border: `1px solid ${p.border}`,
        borderRadius: 13,
        padding: "10px 12px",
        margin: "10px 16px 2px",
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={multiple ? title : `${title} : ${primary?.sujet ?? ""}`}
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 11,
          background: "transparent",
          border: "none",
          padding: 0,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 30,
            height: 30,
            flexShrink: 0,
            borderRadius: 9,
            background: critique ? T.warn : T.surf,
            color: critique ? "#fff" : p.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: p.title, lineHeight: 1.25 }}>{title}</span>
          {detail && (
            <span
              style={{
                display: "block",
                fontSize: 11,
                color: T.mut,
                marginTop: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {detail}
            </span>
          )}
        </span>
        <span
          style={{
            flexShrink: 0,
            fontSize: 11.5,
            fontWeight: 700,
            color: critique ? "#fff" : p.accent,
            background: critique ? T.warn : "transparent",
            border: critique ? "none" : `1px solid ${p.accent}55`,
            borderRadius: 9,
            padding: critique ? "6px 12px" : "5px 11px",
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
          }}
        >
          {cta}
          <span aria-hidden="true" style={{ fontSize: 14 }}>›</span>
        </span>
      </button>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("action.dismiss")}
          style={{
            flexShrink: 0,
            width: 26,
            height: 26,
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: T.faint,
            fontSize: 16,
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
