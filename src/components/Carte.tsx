import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";

import { type MembreProfile, type NiveauItem, getNiveaux, getQrToken } from "../api.js";
import { useT } from "../i18n.js";
import { civilName } from "../name.js";
import { AttestationManuelle } from "./AttestationManuelle.js";
import { QrCard } from "./QrCard.js";

// The card tab: fetch the server-signed QR token and refresh it before it
// expires, so the member always shows a valid code at the door.
const REFRESH_MS = 60_000;

export function Carte({ token, profile }: { token: string; profile: MembreProfile | null }): JSX.Element {
  const t = useT();
  const [serverToken, setServerToken] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  // Admin-defined engagement levels, so the card shows the exact label the
  // administration set (never a raw slug).
  const [niveaux, setNiveaux] = useState<NiveauItem[]>([]);
  useEffect(() => {
    let alive = true;
    getNiveaux(token)
      .then((n) => {
        if (alive) setNiveaux(n);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [token]);
  const engagementLabel = niveaux.find((n) => n.cle === profile?.type_membre)?.libelle ?? profile?.type_membre ?? null;

  useEffect(() => {
    let alive = true;
    const load = (): void => {
      getQrToken(token)
        .then((qr) => {
          if (alive) {
            setServerToken(qr.token);
            setNote(null);
          }
        })
        .catch(() => {
          if (alive) setNote(t("carte.qrUnavailable"));
        });
    };
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [token]);

  return (
    <div className="card-view">
      <AttestationManuelle token={token} />
      <QrCard
        matricule={profile?.matricule ?? "ADS-000000"}
        codeMembre={profile?.code_membre ?? null}
        membreId={profile?.id ?? "00000000-0000-0000-0000-000000000000"}
        verifie={profile?.verifie ?? false}
        preview={false}
        serverToken={serverToken}
        nom={profile ? civilName(profile) || null : null}
        tribu={profile?.tribu}
        commission={profile?.commission}
        engagement={engagementLabel}
        authToken={token}
        prenoms={profile?.prenoms}
        memberNom={profile?.nom}
        focusX={profile?.photo_focus_x}
        focusY={profile?.photo_focus_y}
        estBerger={profile?.est_berger}
        nomPastoral={profile?.nom_pastoral_affiche}
        fonctionPrincipale={profile?.fonctions?.[0]?.libelle ?? null}
        fonctionPerimetre={profile?.fonctions?.[0]?.perimetre ?? null}
        appellation={profile?.appellation ?? null}
        categoriePrincipale={profile?.categorie_principale ?? null}
      />
      <button type="button" className="btn btn-ghost" onClick={() => setFullscreen(true)} disabled={!serverToken}>
        {t("carte.fullscreen")}
      </button>
      {note && <p className="card-hint">{note}</p>}
      {fullscreen && serverToken && (
        <FullscreenQr
          token={serverToken}
          matricule={profile?.matricule ?? "ADS-000000"}
          onClose={() => setFullscreen(false)}
        />
      )}
    </div>
  );
}

function FullscreenQr({
  token,
  matricule,
  onClose,
}: {
  token: string;
  matricule: string;
  onClose: () => void;
}): JSX.Element {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      void QRCode.toCanvas(canvasRef.current, token, {
        width: 300,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });
    }
  }, [token]);

  return (
    <div className="fs-qr" role="dialog" aria-label={t("carte.fsAria")} onClick={onClose}>
      <p className="fs-qr-hint">{t("carte.brightness")}</p>
      <canvas ref={canvasRef} width={300} height={300} aria-label={t("carte.qrAria")} />
      <p className="fs-qr-id">{matricule}</p>
      <button type="button" className="btn btn-primary fs-qr-close" onClick={onClose}>
        {t("common.close")}
      </button>
    </div>
  );
}
