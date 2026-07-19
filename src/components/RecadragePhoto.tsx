import { useEffect, useRef, useState } from "react";

import { useLang } from "../i18n.js";
import { T } from "../proto.js";

const CONT = 300; // on-screen crop viewport (square), the round mask has this diameter
const OUT = 512; // exported square image side

/**
 * WhatsApp-style round photo cropper: the member drags (pan) and zooms the image
 * inside a round mask, then confirms. The visible circular area is rendered to a
 * square canvas and returned as a real cropped JPEG File, whatever the source
 * aspect ratio. The card then displays this square image inside its round frame.
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

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { imgRef.current = img; setNat({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.src = imageUrl;
  }, [imageUrl]);

  // Base scale so the image always COVERS the round viewport, then the user zoom.
  const coverScale = nat ? Math.max(CONT / nat.w, CONT / nat.h) : 1;
  const total = coverScale * scale;
  const drawnW = nat ? nat.w * total : CONT;
  const drawnH = nat ? nat.h * total : CONT;

  // Clamp the offset so the image never leaves a gap inside the circle.
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
      else setScale(Math.max(1, Math.min(4, pinch.current.scale * (dist / pinch.current.dist))));
    }
  }
  function onTouchEnd(): void { pinch.current = null; }

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
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.drawImage(img, left, top, w, h);
    canvas.toBlob((blob) => {
      if (blob) onConfirm(new File([blob], "photo.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,20,35,0.72)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: T.surf, borderRadius: 18, padding: 18, width: "min(360px, 92vw)", boxShadow: "0 24px 60px -20px rgba(0,0,0,.5)" }}>
        <h3 style={{ margin: "0 0 4px", fontFamily: T.fd, fontSize: 16, color: T.ink }}>{en ? "Adjust your photo" : "Ajustez votre photo"}</h3>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: T.mut }}>{en ? "Drag to move, use the slider to zoom." : "Glissez pour déplacer, utilisez le curseur pour zoomer."}</p>
        <div
          style={{ position: "relative", width: CONT, height: CONT, maxWidth: "100%", margin: "0 auto", borderRadius: 14, overflow: "hidden", background: "#0e1526", touchAction: "none", cursor: "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
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
          <input type="range" min={1} max={4} step={0.01} value={scale} onChange={(e) => setScale(Number(e.target.value))} style={{ flex: 1 }} aria-label={en ? "Zoom" : "Zoom"} />
          <span aria-hidden="true" style={{ fontSize: 17, color: T.mut }}>+</span>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button type="button" className="tap" onClick={onCancel} disabled={busy} style={{ flex: 1, height: 44, borderRadius: 12, border: `1px solid ${T.line}`, background: T.surf, color: T.ink, fontWeight: 600 }}>{en ? "Cancel" : "Annuler"}</button>
          <button type="button" className="tap" onClick={confirmer} disabled={busy || !nat} style={{ flex: 1, height: 44, borderRadius: 12, border: "none", background: T.b600, color: "#fff", fontWeight: 700 }}>{busy ? "..." : en ? "Use this photo" : "Utiliser cette photo"}</button>
        </div>
      </div>
    </div>
  );
}
