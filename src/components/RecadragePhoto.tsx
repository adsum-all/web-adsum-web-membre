import { useEffect, useRef, useState } from "react";

import { useLang } from "../i18n.js";
import { T } from "../proto.js";

const CONT = 300; // on-screen crop viewport (square), the round mask has this diameter
const OUT = 512; // exported square image side
const DEFAUT = ["#334155", "#475569", "#1e293b", "#64748b", "#3f4a5c", "#5b6678", "#2b3444", "#7c8698"];

type FondMode = "couleur" | "degrade" | "flou" | "image";

function _b(n: number): number { return Math.max(0, Math.min(255, Math.round(n))); }
function _hex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => _b(v).toString(16).padStart(2, "0")).join("");
}
// Lighten (f>0) or darken (f<0) a #rrggbb colour by a fraction.
function _ajuster(hexcol: string, f: number): string {
  const n = parseInt(hexcol.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, bl = n & 255;
  const mix = (c: number): number => (f >= 0 ? c + (255 - c) * f : c * (1 + f));
  return _hex(mix(r), mix(g), mix(bl));
}

// Extract a bank of candidate background colours from the image: the border average
// (blends seamlessly with the photo's edge), the overall average, and lighter/darker
// variants of both. Falls back to neutral tones if the canvas is tainted (cross-origin).
function extraireFond(img: HTMLImageElement): string[] {
  try {
    const S = 28;
    const c = document.createElement("canvas");
    c.width = S; c.height = S;
    const ctx = c.getContext("2d");
    if (!ctx) return DEFAUT;
    ctx.drawImage(img, 0, 0, S, S);
    const d = ctx.getImageData(0, 0, S, S).data;
    let br = 0, bg = 0, bb = 0, bn = 0, ar = 0, ag = 0, ab = 0;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const r = d[i] ?? 0, g = d[i + 1] ?? 0, bl = d[i + 2] ?? 0;
        ar += r; ag += g; ab += bl;
        if (x === 0 || y === 0 || x === S - 1 || y === S - 1) { br += r; bg += g; bb += bl; bn++; }
      }
    }
    const tot = S * S;
    const bordure = _hex(br / bn, bg / bn, bb / bn);
    const moyenne = _hex(ar / tot, ag / tot, ab / tot);
    return [
      bordure, moyenne,
      _ajuster(bordure, -0.28), _ajuster(bordure, 0.28),
      _ajuster(moyenne, -0.28), _ajuster(moyenne, 0.28),
      _ajuster(bordure, -0.5), _ajuster(bordure, 0.5),
    ];
  } catch {
    return DEFAUT;
  }
}

/**
 * WhatsApp-style round photo cropper: the member drags (pan) and zooms the image
 * inside a round mask, then confirms. The visible circular area is rendered to a
 * square canvas and returned as a real cropped JPEG File. When the photo is zoomed
 * out and no longer fills the circle, the padding is filled with a chosen background:
 * a colour auto-detected from the photo (default, blends with it), a custom colour,
 * a gradient, a blur of the photo, or an imported background image. The background is
 * applied identically in the preview and in the exported file, inside the round frame.
 */
export function RecadragePhoto({
  imageUrl,
  busy,
  onCancel,
  onConfirm,
}: Readonly<{ imageUrl: string; busy?: boolean; onCancel: () => void; onConfirm: (file: File) => void }>): JSX.Element {
  const en = useLang() === "en";
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinch = useRef<{ dist: number; scale: number } | null>(null);

  const [banque, setBanque] = useState<string[]>(DEFAUT);
  const [fenetre, setFenetre] = useState(0); // rotating window into the colour bank
  const [fondMode, setFondMode] = useState<FondMode>("couleur");
  const [couleur, setCouleur] = useState<string>(DEFAUT[0] ?? "#334155");
  const [couleur2, setCouleur2] = useState<string>(DEFAUT[2] ?? "#1e293b");
  const [fondImage, setFondImage] = useState<HTMLImageElement | null>(null);
  const [fondImageUrl, setFondImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setNat({ w: img.naturalWidth, h: img.naturalHeight });
      const p = extraireFond(img);
      setBanque(p);
      setCouleur(p[0] ?? DEFAUT[0] ?? "#334155");
      setCouleur2(p[2] ?? DEFAUT[2] ?? "#1e293b");
    };
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => () => { if (fondImageUrl) URL.revokeObjectURL(fondImageUrl); }, [fondImageUrl]);

  // Base scale so the image always COVERS the round viewport, then the user zoom.
  const coverScale = nat ? Math.max(CONT / nat.w, CONT / nat.h) : 1;
  const total = coverScale * scale;
  const drawnW = nat ? nat.w * total : CONT;
  const drawnH = nat ? nat.h * total : CONT;

  const palette = [0, 1, 2, 3].map((i) => banque[(fenetre + i) % banque.length] ?? DEFAUT[i] ?? "#334155");

  // Clamp the offset so the image is recentred once it becomes smaller than the circle.
  function clamp(o: { x: number; y: number }): { x: number; y: number } {
    const maxX = Math.max(0, (drawnW - CONT) / 2);
    const maxY = Math.max(0, (drawnH - CONT) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, o.x)), y: Math.max(-maxY, Math.min(maxY, o.y)) };
  }

  useEffect(() => { setOffset((o) => clamp(o)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scale, nat]);

  function onPointerDown(e: React.PointerEvent): void {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: React.PointerEvent): void {
    if (!drag.current) return;
    setOffset(clamp({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) }));
  }
  function onPointerUp(): void { drag.current = null; }

  function onTouchMove(e: React.TouchEvent): void {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot((a?.clientX ?? 0) - (b?.clientX ?? 0), (a?.clientY ?? 0) - (b?.clientY ?? 0));
      if (!pinch.current) pinch.current = { dist, scale };
      else setScale(Math.max(0.1, Math.min(4, pinch.current.scale * (dist / pinch.current.dist))));
    }
  }
  function onTouchEnd(): void { pinch.current = null; }

  function regenerer(): void { setFenetre((f) => (f + 4) % banque.length); }

  function onFondFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { setFondImage(img); setFondImageUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; }); setFondMode("image"); };
    img.src = url;
  }

  // Paint the chosen background across the whole square, under the photo.
  function remplirFond(ctx: CanvasRenderingContext2D): void {
    if (fondMode === "degrade") {
      const g = ctx.createLinearGradient(0, 0, OUT, OUT);
      g.addColorStop(0, couleur); g.addColorStop(1, couleur2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, OUT, OUT);
      return;
    }
    if (fondMode === "flou" && imgRef.current) {
      const img = imgRef.current;
      const s = Math.max(OUT / img.naturalWidth, OUT / img.naturalHeight) * 1.15;
      const w = img.naturalWidth * s, h = img.naturalHeight * s;
      ctx.save();
      ctx.filter = "blur(18px)";
      ctx.drawImage(img, (OUT - w) / 2, (OUT - h) / 2, w, h);
      ctx.restore();
      return;
    }
    if (fondMode === "image" && fondImage) {
      const s = Math.max(OUT / fondImage.naturalWidth, OUT / fondImage.naturalHeight);
      const w = fondImage.naturalWidth * s, h = fondImage.naturalHeight * s;
      ctx.drawImage(fondImage, (OUT - w) / 2, (OUT - h) / 2, w, h);
      return;
    }
    ctx.fillStyle = couleur; ctx.fillRect(0, 0, OUT, OUT);
  }

  function confirmer(): void {
    const img = imgRef.current;
    if (!img || !nat) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const k = OUT / CONT; // viewport -> output scale
    const w = drawnW * k;
    const h = drawnH * k;
    const left = (OUT - w) / 2 + offset.x * k;
    const top = (OUT - h) / 2 + offset.y * k;
    remplirFond(ctx);
    ctx.drawImage(img, left, top, w, h);
    canvas.toBlob((blob) => {
      if (blob) onConfirm(new File([blob], "photo.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  }

  const viewportFond = fondMode === "degrade" ? `linear-gradient(160deg, ${couleur}, ${couleur2})`
    : fondMode === "couleur" ? couleur : "#0e1526";

  const pill = (on: boolean): React.CSSProperties => ({
    height: 30, padding: "0 10px", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer",
    border: `1px solid ${on ? T.b600 : T.line}`, background: on ? T.b600 : T.surf, color: on ? "#fff" : T.ink,
  });
  const swatch = (c: string, on: boolean): React.CSSProperties => ({
    width: 26, height: 26, borderRadius: "50%", cursor: "pointer", padding: 0,
    background: c, border: on ? `3px solid ${T.ink}` : `1px solid ${T.line}`,
  });

  const modes: { m: FondMode; fr: string; en: string }[] = [
    { m: "couleur", fr: "Couleur", en: "Colour" },
    { m: "degrade", fr: "Dégradé", en: "Gradient" },
    { m: "flou", fr: "Flou", en: "Blur" },
    { m: "image", fr: "Image", en: "Image" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,20,35,0.72)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <div style={{ background: T.surf, borderRadius: 18, padding: 18, width: "min(360px, 92vw)", boxShadow: "0 24px 60px -20px rgba(0,0,0,.5)" }}>
        <h3 style={{ margin: "0 0 4px", fontFamily: T.fd, fontSize: 16, color: T.ink }}>{en ? "Adjust your photo" : "Ajustez votre photo"}</h3>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: T.mut }}>{en ? "Drag to move, use the slider to zoom." : "Glissez pour déplacer, utilisez le curseur pour zoomer."}</p>
        <div
          style={{ position: "relative", width: CONT, height: CONT, maxWidth: "100%", margin: "0 auto", borderRadius: 14, overflow: "hidden", background: viewportFond, touchAction: "none", cursor: "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {fondMode === "flou" && nat && (
            <img src={imageUrl} alt="" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(14px) saturate(1.1)", transform: "scale(1.18)", pointerEvents: "none" }} />
          )}
          {fondMode === "image" && fondImageUrl && (
            <img src={fondImageUrl} alt="" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
          )}
          {nat && (
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              style={{ position: "absolute", left: "50%", top: "50%", width: drawnW, height: drawnH, transform: `translate(${-drawnW / 2 + offset.x}px, ${-drawnH / 2 + offset.y}px)`, maxWidth: "none", userSelect: "none", pointerEvents: "none" }}
            />
          )}
          {/* Round mask overlay */}
          <div style={{ position: "absolute", inset: 0, boxShadow: `0 0 0 999px rgba(14,21,38,0.55)`, borderRadius: "50%", pointerEvents: "none" }} />
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.9)", pointerEvents: "none" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0 4px" }}>
          <span aria-hidden="true" style={{ fontSize: 13, color: T.mut }}>-</span>
          <input type="range" min={0.1} max={4} step={0.01} value={scale} onChange={(e) => setScale(Number(e.target.value))} style={{ flex: 1 }} aria-label={en ? "Zoom" : "Zoom"} />
          <span aria-hidden="true" style={{ fontSize: 17, color: T.mut }}>+</span>
        </div>

        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: T.mut, textTransform: "uppercase", letterSpacing: ".04em" }}>{en ? "Background" : "Fond"}</span>
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {modes.map((o) => (
              <button key={o.m} type="button" className="tap" onClick={() => setFondMode(o.m)} style={pill(fondMode === o.m)}>{en ? o.en : o.fr}</button>
            ))}
          </div>

          {fondMode === "couleur" && (
            <div style={{ display: "flex", gap: 7, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              {palette.map((c, i) => (
                <button key={i} type="button" aria-label={`${en ? "Colour" : "Couleur"} ${c}`} onClick={() => setCouleur(c)} style={swatch(c, couleur.toLowerCase() === c.toLowerCase())} />
              ))}
              <input type="color" value={couleur} onChange={(e) => setCouleur(e.target.value)} style={{ width: 30, height: 30, border: "none", background: "none", padding: 0, cursor: "pointer" }} aria-label={en ? "Custom colour" : "Couleur personnalisée"} />
              <button type="button" className="tap" onClick={regenerer} style={pill(false)}>{en ? "Regenerate" : "Régénérer"}</button>
            </div>
          )}
          {fondMode === "degrade" && (
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input type="color" value={couleur} onChange={(e) => setCouleur(e.target.value)} style={{ width: 34, height: 30, border: "none", background: "none", padding: 0, cursor: "pointer" }} aria-label={en ? "Colour 1" : "Couleur 1"} />
              <input type="color" value={couleur2} onChange={(e) => setCouleur2(e.target.value)} style={{ width: 34, height: 30, border: "none", background: "none", padding: 0, cursor: "pointer" }} aria-label={en ? "Colour 2" : "Couleur 2"} />
              <button type="button" className="tap" onClick={() => { const p = extraireFond(imgRef.current ?? new Image()); setCouleur(p[6] ?? couleur); setCouleur2(p[7] ?? couleur2); }} style={pill(false)}>{en ? "From photo" : "Depuis la photo"}</button>
            </div>
          )}
          {fondMode === "image" && (
            <div style={{ marginTop: 8, fontSize: 12, color: T.mut }}>
              <input type="file" accept="image/*" onChange={onFondFile} aria-label={en ? "Import a background" : "Importer un fond"} />
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button type="button" className="tap" onClick={onCancel} disabled={busy} style={{ flex: 1, height: 44, borderRadius: 12, border: `1px solid ${T.line}`, background: T.surf, color: T.ink, fontWeight: 600 }}>{en ? "Cancel" : "Annuler"}</button>
          <button type="button" className="tap" onClick={confirmer} disabled={busy || !nat} style={{ flex: 1, height: 44, borderRadius: 12, border: "none", background: T.b600, color: "#fff", fontWeight: 700 }}>{busy ? "..." : en ? "Use this photo" : "Utiliser cette photo"}</button>
        </div>
      </div>
    </div>
  );
}
