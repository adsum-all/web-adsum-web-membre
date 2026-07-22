import { useState } from "react";

import type { OrgStatut } from "../../api.js";
import { LINK_META, LINK_ORDER, STATUT_META } from "./orgLabels.js";
import type { LinkMeta } from "./orgLabels.js";

/** Small SVG sample of one link kind, reproducing its exact stroke, dash pattern
 * and arrow head, so the legend matches what is drawn on the canvas. */
function LinkSample({ meta }: { meta: LinkMeta }): JSX.Element {
  const markerId = `lg-arrow-${meta.type}`;
  return (
    <svg width="48" height="14" viewBox="0 0 48 14" aria-hidden="true" focusable="false">
      <defs>
        <marker id={markerId} markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={meta.color} />
        </marker>
      </defs>
      <line
        x1="2"
        y1="7"
        x2="40"
        y2="7"
        stroke={meta.color}
        strokeWidth="2"
        strokeDasharray={meta.dash || undefined}
        markerEnd={`url(#${markerId})`}
      />
    </svg>
  );
}

const STATUTS: OrgStatut[] = ["actif", "vacant", "attente", "archive"];

/** Always-available legend of the six link kinds and the four node statuses,
 * collapsible so it never covers the graph. Each kind is described in words and
 * shown with its exact signature, so meaning never rests on color alone. */
export function OrgLegende(): JSX.Element {
  // Collapsed by default so the legend is a small chip that never covers the graph;
  // the reader opens it on demand. This keeps the canvas clear, especially on a phone.
  const [open, setOpen] = useState(false);

  return (
    <div className={`org-legende ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="org-legende-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Légende
        <span className={`org-legende-chev ${open ? "is-open" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="org-legende-body">
          <p className="org-legende-title">Types de liens</p>
          <ul className="org-legende-list">
            {LINK_ORDER.map((type) => {
              const meta = LINK_META[type];
              return (
                <li key={type} className="org-legende-row">
                  <LinkSample meta={meta} />
                  <span className="org-legende-text">
                    <span className="org-legende-label">{meta.label}</span>
                    <span className="org-legende-desc">{meta.description}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="org-legende-title">Statut d'un poste</p>
          <ul className="org-legende-statuts">
            {STATUTS.map((s) => (
              <li key={s} className="org-legende-statut">
                <span className={`org-dot org-dot-${s}`} aria-hidden="true" />
                {STATUT_META[s].label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
