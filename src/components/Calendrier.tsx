import { useEffect, useMemo, useState } from "react";

import {
  type AnniversaireCategorie,
  type AnniversaireOut,
  type EvenementOut,
  type NotifPreferences,
  getAnniversaires,
  getEvenements,
  getNotifPreferences,
} from "../api.js";
import { type Lang, useLang, useT } from "../i18n.js";
import { dayKey, monthGrid, monthLabel } from "../format.js";
import { T } from "../proto.js";
import { useResource } from "../useResource.js";
import { CalendrierFiltres } from "./CalendrierFiltres.js";
import { CalendrierJour } from "./CalendrierJour.js";
import { EmptyState } from "./ui.js";

const FILTERS_KEY = "adsum.cal.filters.v1";

/** Load the persisted activity/family/tag filters (session preferences applied
 * over the server birthday prefs). Corrupt or absent storage yields empty sets. */
function loadStoredFilters(): { filtres: Set<string>; familles: Set<AnniversaireCategorie>; tags: string[] } {
  const empty = { filtres: new Set<string>(), familles: new Set<AnniversaireCategorie>(), tags: [] as string[] };
  if (typeof localStorage === "undefined") return empty;
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return empty;
    const p = JSON.parse(raw) as { filtres?: unknown; familles?: unknown; tags?: unknown };
    return {
      filtres: new Set(Array.isArray(p.filtres) ? (p.filtres as string[]) : []),
      familles: new Set(Array.isArray(p.familles) ? (p.familles as AnniversaireCategorie[]) : []),
      tags: Array.isArray(p.tags) ? (p.tags as string[]) : [],
    };
  } catch {
    return empty;
  }
}

const WEEKDAYS: Record<Lang, string[]> = {
  fr: ["L", "M", "M", "J", "V", "S", "D"],
  en: ["M", "T", "W", "T", "F", "S", "S"],
};

// Birthday categories tied to a saved preference. The `group` splits them for a
// legible presentation in the filters sheet (leaders vs organisational scope)
// while keeping the exact same keys/handlers as before.
export const CATEGORIES: { key: AnniversaireCategorie; pref: keyof NotifPreferences; label: string; group: "responsables" | "perimetre" }[] = [
  { key: "vip", pref: "cal_vip", label: "calendar.filterVip", group: "responsables" },
  { key: "responsables", pref: "cal_responsables", label: "calendar.filterResponsables", group: "responsables" },
  { key: "commission", pref: "cal_commission", label: "calendar.filterCommission", group: "perimetre" },
  { key: "tribu", pref: "cal_tribu", label: "calendar.filterTribu", group: "perimetre" },
  { key: "coordination", pref: "cal_coordination", label: "calendar.filterCoordination", group: "perimetre" },
  { key: "intendance", pref: "cal_intendance", label: "calendar.filterIntendance", group: "perimetre" },
];

// Birthday overlays by function family (taxonomy 0092), as calendar view toggles.
// label holds an i18n key (translated at render), like CATEGORIES.
export const FAMILLES_ANNIV: { key: AnniversaireCategorie; label: string }[] = [
  { key: "direction", label: "calendar.famDirection" },
  { key: "coordinateurs", label: "calendar.famCoordinateurs" },
  { key: "bergers", label: "calendar.famBergers" },
  { key: "patriarches", label: "calendar.famPatriarches" },
];

// Quick activity filters (client-side, combinable). `group` structures them in
// the sheet (type / format / scope) without changing the filtering logic. label
// holds an i18n key.
// Activity type (evenement.type) and targeting scope (evenement.cible_type) filters,
// aligned with what the back office / API actually produce: types rassemblement /
// formation / priere, and the eight targeting scopes.
export const FILTRES_ACTIVITE: { key: string; label: string; group: "type" | "format" | "perimetre" }[] = [
  { key: "rassemblement", label: "calendar.actRassemblement", group: "type" },
  { key: "formation", label: "calendar.actFormation", group: "type" },
  { key: "priere", label: "calendar.actPriere", group: "type" },
  { key: "en_ligne", label: "calendar.actEnLigne", group: "format" },
  { key: "presentiel", label: "calendar.actPresentiel", group: "format" },
  { key: "coordination", label: "calendar.actMaCoordination", group: "perimetre" },
  { key: "commission", label: "calendar.actMaCommission", group: "perimetre" },
  { key: "intendance", label: "calendar.actMonIntendance", group: "perimetre" },
  { key: "tribu", label: "calendar.actMaTribu", group: "perimetre" },
  { key: "bergers", label: "calendar.actBergers", group: "perimetre" },
  { key: "responsables", label: "calendar.actResponsables", group: "perimetre" },
  { key: "liste", label: "calendar.actListe", group: "perimetre" },
];

const TYPES_ACTIVITE = ["rassemblement", "formation", "priere"];
const PERIMETRES_ACTIVITE = ["coordination", "commission", "intendance", "tribu", "bergers", "responsables", "liste"];

function eventDayKey(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : dayKey(d);
}

export function Calendrier({
  token,
  onJoin,
}: {
  token: string;
  onJoin?: (evenement: EvenementOut) => void;
}): JSX.Element {
  const t = useT();
  const lang = useLang();
  const now = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState<{ year: number; month: number }>({ year: now.getFullYear(), month: now.getMonth() });
  const [selected, setSelected] = useState<string>(dayKey(now));
  const [prefs, setPrefs] = useState<NotifPreferences | null>(null);
  const [birthdays, setBirthdays] = useState<AnniversaireOut[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Filters are hydrated from localStorage so a member keeps their selection
  // across tab switches and app reloads, then serialised on every change.
  const initialFilters = useMemo(() => loadStoredFilters(), []);
  // Selected activity tags to filter the agenda (empty = show every activity).
  const [tagFiltre, setTagFiltre] = useState<string[]>(initialFilters.tags);
  // Quick activity filters (mode / type / perimeter). Empty = no restriction.
  const [filtres, setFiltres] = useState<Set<string>>(initialFilters.filtres);
  function toggleFiltre(k: string): void {
    setFiltres((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }
  // Birthday overlays by FUNCTION FAMILY (taxonomy), as view toggles.
  const [famillesAnniv, setFamillesAnniv] = useState<Set<AnniversaireCategorie>>(initialFilters.familles);
  function toggleFamille(k: AnniversaireCategorie): void {
    setFamillesAnniv((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }
  function resetFiltres(): void {
    setFiltres(new Set());
    setFamillesAnniv(new Set());
    setTagFiltre([]);
  }

  // Persist the session filters (activity filters, family overlays, tags).
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify({ filtres: Array.from(filtres), familles: Array.from(famillesAnniv), tags: tagFiltre }));
    } catch {
      /* storage may be unavailable (private mode / quota); ignore. */
    }
  }, [filtres, famillesAnniv, tagFiltre]);

  const { data: events, loading, error } = useResource(() => getEvenements(token), [token]);

  useEffect(() => {
    void getNotifPreferences(token).then(setPrefs).catch(() => undefined);
  }, [token]);

  // Fetch birthdays only for categories whose preference toggle is on, for the
  // currently visible month. Birthdays stay subtle: activities are primary.
  useEffect(() => {
    if (!prefs) return;
    let alive = true;
    const active = CATEGORIES.filter((c) => prefs[c.pref]);
    // The member's own birthday ("moi") is always fetched, independent of the
    // category toggles and of the peer-directory opt-out: a member must always
    // see their own birthday on their own calendar, every year.
    const cats: AnniversaireCategorie[] = ["moi", ...active.map((c) => c.key), ...Array.from(famillesAnniv)];
    const mois = cursor.month + 1;
    Promise.all(cats.map((cat) => getAnniversaires(token, { categorie: cat, mois }).catch(() => [])))
      .then((lists) => {
        if (!alive) return;
        const seen = new Set<string>();
        const merged: AnniversaireOut[] = [];
        for (const list of lists) {
          for (const a of list) {
            if (seen.has(a.id)) continue;
            seen.add(a.id);
            merged.push(a);
          }
        }
        setBirthdays(merged);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [token, prefs, cursor.year, cursor.month, famillesAnniv]);

  const cells = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor.year, cursor.month]);

  // Distinct tags present on the loaded activities, for the filter chips.
  const tousTags = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of events ?? []) for (const t of e.tags ?? []) m.set(t.id, t.libelle);
    return [...m.entries()].map(([id, libelle]) => ({ id, libelle }));
  }, [events]);
  // Activities kept after the filters. Filters of the SAME group combine with OR
  // (e.g. "En ligne" + "Présentiel" shows both, not an impossible AND); different
  // groups combine with AND. Stale tag ids no longer present on any loaded activity
  // are ignored, so a leftover filter can never silently hide everything.
  const eventsVisibles = useMemo(
    () =>
      (events ?? []).filter((e) => {
        const validTags = tagFiltre.filter((id) => tousTags.some((tg) => tg.id === id));
        if (validTags.length > 0 && !(e.tags ?? []).some((t) => validTags.includes(t.id))) return false;
        const formats = ["en_ligne", "presentiel"].filter((f) => filtres.has(f));
        if (formats.length > 0 && !formats.some((f) => e.mode === f || e.mode === "hybride")) return false;
        const types = TYPES_ACTIVITE.filter((tk) => filtres.has(tk));
        if (types.length > 0 && !types.includes(e.type ?? "")) return false;
        const perims = PERIMETRES_ACTIVITE.filter((p) => filtres.has(p));
        if (perims.length > 0 && !perims.includes(e.cible_type ?? "")) return false;
        return true;
      }),
    [events, tagFiltre, filtres, tousTags],
  );

  // Drop persisted tag filters that no longer match any loaded activity, so the
  // stored selection and the visible summary stay consistent.
  useEffect(() => {
    if (!events) return;
    setTagFiltre((s) => {
      const pruned = s.filter((id) => tousTags.some((tg) => tg.id === id));
      return pruned.length === s.length ? s : pruned;
    });
  }, [tousTags, events]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, EvenementOut[]>();
    for (const e of eventsVisibles) {
      const key = eventDayKey(e.debut);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [eventsVisibles]);

  const birthdaysByDay = useMemo(() => {
    const map = new Map<string, AnniversaireOut[]>();
    for (const a of birthdays) {
      if (a.mois !== cursor.month + 1) continue;
      const key = `${cursor.year}-${String(a.mois).padStart(2, "0")}-${String(a.jour).padStart(2, "0")}`;
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    return map;
  }, [birthdays, cursor.year, cursor.month]);

  function togglePref(pref: keyof NotifPreferences): void {
    if (!prefs) return;
    setPrefs({ ...prefs, [pref]: !prefs[pref] });
    // The persistent write lives in Settings; here we only steer the view.
  }

  function shift(delta: number): void {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  if (loading) return <EmptyState variant="loading" text={t("calendar.loading")} />;
  if (error) return <EmptyState variant="error" title={t("act.errorTitle")} text={error} />;

  const selectedEvents = eventsByDay.get(selected) ?? [];
  const selectedBirthdays = birthdaysByDay.get(selected) ?? [];
  const todayKey = dayKey(now);

  // Active-filter summary for the compact bar. It reflects only the SESSION
  // filters the member actively applied (family overlays, activity filters,
  // tags), never the persistent birthday-category preferences (cal_*), which are
  // a saved display choice, not a filter to reset. This keeps the bar empty by
  // default and consistent with what resetFiltres actually clears.
  const activeLabels = [
    ...FAMILLES_ANNIV.filter((f) => famillesAnniv.has(f.key)).map((f) => t(f.label)),
    ...FILTRES_ACTIVITE.filter((f) => filtres.has(f.key)).map((f) => t(f.label)),
    ...tousTags.filter((tg) => tagFiltre.includes(tg.id)).map((tg) => tg.libelle),
  ];
  const activeCount = activeLabels.length;
  // Condensed summary: at most two labels, then "+N", so the bar stays calm.
  const summaryLabels = activeLabels.slice(0, 2);
  const summaryExtra = activeCount - summaryLabels.length;

  return (
    <div style={{ paddingBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button type="button" aria-label={t("calendar.prev")} onClick={() => shift(-1)} style={navBtn}>‹</button>
        <div style={{ fontFamily: T.fd, fontWeight: 700, fontSize: 16, textTransform: "capitalize" }}>
          {monthLabel(cursor.year, cursor.month, lang)}
        </div>
        <button type="button" aria-label={t("calendar.next")} onClick={() => shift(1)} style={navBtn}>›</button>
      </div>

      {/* Compact filter bar: one "Filtres" trigger + a read-only summary of the
          active filters. The full grouped controls live in the bottom sheet, so
          the calendar grid stays visible immediately. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            padding: "6px 12px",
            borderRadius: 999,
            border: `1px solid ${activeCount > 0 ? T.b600 : T.line}`,
            background: activeCount > 0 ? T.tintb : T.surf,
            color: activeCount > 0 ? T.tintbf : T.ink,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <span aria-hidden="true">☰</span>
          {t("calendar.filtersBtn")}
          {activeCount > 0 && (
            <span style={{ minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999, background: T.b600, color: "#fff", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {activeCount}
            </span>
          )}
        </button>
        <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 6, alignItems: "center", overflow: "hidden" }}>
          {activeCount === 0 ? (
            <span style={{ fontSize: 11.5, color: T.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("calendar.allEvents")}</span>
          ) : (
            <>
              {summaryLabels.map((l, i) => (
                <span key={i} style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: T.mut, background: T.chip, borderRadius: 999, padding: "3px 9px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l}</span>
              ))}
              {summaryExtra > 0 && (
                <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: T.mut }}>+{summaryExtra}</span>
              )}
            </>
          )}
        </div>
        {activeCount > 0 && (
          <button type="button" onClick={resetFiltres} aria-label={t("calendar.resetFilters")} style={{ flexShrink: 0, border: "none", background: "transparent", color: T.mut, fontSize: 18, lineHeight: 1, cursor: "pointer", fontFamily: "inherit" }}>×</button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 4 }}>
        {WEEKDAYS[lang].map((w, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: T.faint, padding: "2px 0" }}>{w}</div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {cells.map((cell) => {
          const dayEvents = eventsByDay.get(cell.key) ?? [];
          const hasEvents = dayEvents.length > 0;
          // Up to three distinct type colours, so a day shows its events' colours
          // (no longer all blue). Events without a catalogue type use the shared neutral,
          // identical across the back office, collaboration and the member app.
          const dayColours = [...new Set(dayEvents.map((e) => e.couleur || "#64748B"))].slice(0, 3);
          const hasBirthday = (birthdaysByDay.get(cell.key) ?? []).length > 0;
          const isSelected = cell.key === selected;
          const isToday = cell.key === todayKey;
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => setSelected(cell.key)}
              style={{
                aspectRatio: "1",
                borderRadius: 10,
                border: isToday ? `1.5px solid ${T.b600}` : `1px solid ${T.line}`,
                background: isSelected ? T.b600 : cell.inMonth ? T.surf : T.bg,
                color: isSelected ? "#fff" : cell.inMonth ? T.ink : T.faint,
                fontSize: 12.5,
                fontWeight: 600,
                position: "relative",
                cursor: "pointer",
                padding: 0,
              }}
            >
              {cell.day}
              <span style={{ position: "absolute", bottom: 5, left: 0, right: 0, display: "flex", gap: 3, justifyContent: "center" }}>
                {hasEvents && dayColours.map((c, i) => (
                  <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: isSelected ? "#fff" : c }} />
                ))}
                {hasBirthday && <span style={{ width: 5, height: 5, borderRadius: "50%", background: isSelected ? "#ffd9a0" : T.warn }} />}
              </span>
            </button>
          );
        })}
      </div>

      <CalendrierJour token={token} events={selectedEvents} anniversaires={selectedBirthdays} onJoin={onJoin} />

      {sheetOpen && (
        <CalendrierFiltres
          prefs={prefs}
          onTogglePref={togglePref}
          famillesAnniv={famillesAnniv}
          onToggleFamille={toggleFamille}
          filtres={filtres}
          onToggleFiltre={toggleFiltre}
          tousTags={tousTags}
          tagFiltre={tagFiltre}
          onToggleTag={(id) => setTagFiltre((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
          resultCount={eventsVisibles.length}
          onReset={resetFiltres}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}

const navBtn = {
  width: 34,
  height: 34,
  borderRadius: 10,
  border: `1px solid ${T.line}`,
  background: T.surf,
  color: T.ink,
  fontSize: 18,
  cursor: "pointer",
} as const;

