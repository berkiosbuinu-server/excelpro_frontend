import { useEffect, useRef, useState } from "react";
import { AppScreen, PlatformIcon, PLATFORM_COLORS } from "./visuals";
import { LABELS } from "./labels";
import { Icon } from "./ui";

/* ---------- Le classeur : un tableur dessiné en SVG (même principe que AppScreen) ---------- */
const HEAD = ["Article", "Stock", "Prix", "Valeur", "Statut"];
const DATA: string[][] = [
  ["Riz 25 kg", "48", "32,50", "1 560", "OK"],
  ["Huile 5 L", "12", "14,00", "168", "Bas"],
  ["Sucre 50 kg", "30", "41,00", "1 230", "OK"],
  ["Farine 25 kg", "8", "22,00", "176", "Bas"],
  ["Savon (carton)", "64", "9,80", "627", "OK"],
  ["Lait en poudre", "21", "18,40", "386", "OK"],
  ["Sel 1 kg", "95", "0,60", "57", "OK"],
  ["Bougies", "40", "1,20", "48", "OK"],
];
const LETTERS = ["A", "B", "C", "D", "E", "F"];
const FONT = "Calibri, 'Segoe UI', Arial, sans-serif";

export function SheetScreen({ w, h }: { w: number; h: number }) {
  const cols = w >= 500 ? 5 : w >= 280 ? 4 : 3;
  const ribbon = Math.round(h * 0.075), fbar = Math.round(h * 0.06), colHead = Math.round(h * 0.055);
  const rowH = Math.max(15, Math.round(h * 0.062)), rowW = Math.round(w * 0.07);
  const top = ribbon + fbar + colHead, cw = (w - rowW) / cols;
  const nRows = Math.max(3, Math.floor((h - top) / rowH)), fs = Math.max(7, rowH * 0.46);
  const rows = Array.from({ length: nRows }, (_, r) => (r === 0 ? HEAD : DATA[r - 1] ?? []));
  const selCol = cols > 3 ? 3 : 1;
  const numeric = (c: number) => c >= 1 && c <= 3;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Classeur Excel : gestion de stock" style={{ display: "block" }}>
      <rect width={w} height={h} fill="#fff" />
      <rect width={w} height={ribbon} fill="#107c41" />
      <rect x={ribbon * 0.3} y={ribbon * 0.22} width={ribbon * 0.56} height={ribbon * 0.56} rx={ribbon * 0.1} fill="#fff" fillOpacity=".95" />
      <text x={ribbon * 0.58} y={ribbon * 0.64} textAnchor="middle" fontSize={ribbon * 0.4} fontWeight="700" fill="#107c41" fontFamily={FONT}>X</text>
      <text x={ribbon * 1.15} y={ribbon * 0.64} fontSize={ribbon * 0.4} fill="#fff" fontFamily={FONT}>Gestion de stock.xlsx</text>
      <rect y={ribbon} width={w} height={fbar} fill="#f3f3f3" />
      <rect x={6} y={ribbon + fbar * 0.18} width={rowW + 18} height={fbar * 0.64} fill="#fff" stroke="#d4d4d4" strokeWidth=".8" />
      <text x={12} y={ribbon + fbar * 0.66} fontSize={fbar * 0.4} fill="#333" fontFamily={FONT}>{LETTERS[selCol]}2</text>
      <text x={rowW + 36} y={ribbon + fbar * 0.67} fontSize={fbar * 0.42} fill="#888" fontStyle="italic" fontFamily={FONT}>fx</text>
      <text x={rowW + 54} y={ribbon + fbar * 0.66} fontSize={fbar * 0.42} fill="#222" fontFamily={FONT}>{selCol === 3 ? "=B2*C2" : "48"}</text>
      <g>
        <rect y={ribbon + fbar} width={w} height={colHead} fill="#efefef" />
        {Array.from({ length: cols }, (_, c) => (
          <g key={c}>
            {c === selCol && <rect x={rowW + c * cw} y={ribbon + fbar} width={cw} height={colHead} fill="#d3e9dc" />}
            <text x={rowW + c * cw + cw / 2} y={ribbon + fbar + colHead * 0.72} textAnchor="middle" fontSize={colHead * 0.52} fill="#444" fontFamily={FONT}>{LETTERS[c]}</text>
          </g>
        ))}
      </g>
      {rows.map((row, r) => {
        const y = top + r * rowH;
        return (
          <g key={r}>
            <rect x={0} y={y} width={rowW} height={rowH} fill={r === 1 ? "#d3e9dc" : "#efefef"} stroke="#d4d4d4" strokeWidth=".6" />
            <text x={rowW / 2} y={y + rowH * 0.68} textAnchor="middle" fontSize={fs * 0.9} fill="#444" fontFamily={FONT}>{r + 1}</text>
            {Array.from({ length: cols }, (_, c) => {
              const v = row[c] ?? "", x = rowW + c * cw;
              const warn = v === "Bas";
              return (
                <svg key={c} x={x} y={y} width={cw} height={rowH}>
                  <rect width={cw} height={rowH} fill={r === 0 ? "#f6faf7" : "#fff"} stroke="#e1e1e1" strokeWidth=".6" />
                  <text x={numeric(c) ? cw - 6 : 6} y={rowH * 0.68} textAnchor={numeric(c) ? "end" : "start"} fontSize={fs} fontWeight={r === 0 ? 700 : 400} fill={warn ? "#b54708" : "#222"} fontFamily={FONT}>{v}</text>
                </svg>
              );
            })}
          </g>
        );
      })}
      <rect x={rowW + selCol * cw} y={top + rowH} width={cw} height={rowH} fill="none" stroke="#107c41" strokeWidth="2" />
    </svg>
  );
}

/* ---------- Habillage de l'appareil selon la plateforme ---------- */
const DEVICE: Record<string, "desktop" | "phone"> = { windows: "desktop", linux: "desktop", macos: "desktop", web: "desktop", android: "phone", ios: "phone" };
const PLATFORMS = ["windows", "android", "ios", "macos", "linux", "web"];

function Chrome({ os }: { os: string }) {
  if (os === "macos") return <div className="xf-bar" data-os={os}><span className="xf-dots"><i style={{ background: "#ff5f57" }} /><i style={{ background: "#febc2e" }} /><i style={{ background: "#28c840" }} /></span><span className="xf-title">Gestion de stock</span><span className="xf-sp" /></div>;
  if (os === "web") return <div className="xf-bar" data-os={os}><span className="xf-dots"><i /><i /><i /></span><span className="xf-url"><Icon name="lock" size={12} />monapp.exemple.com</span><span className="xf-sp" /></div>;
  if (os === "linux") return <div className="xf-bar" data-os={os}><span className="xf-sp" /><span className="xf-title">Gestion de stock</span><span className="xf-ctl"><b>✕</b></span></div>;
  return <div className="xf-bar" data-os={os}><span className="xf-title">Gestion de stock</span><span className="xf-ctl"><b>—</b><b>☐</b><b>✕</b></span></div>;
}

/** Curseur avant/après : à gauche le classeur Excel, à droite l'application. Un seul mouvement automatique à l'arrivée, puis la main revient à la personne. */
export function Transformer() {
  const [os, setOs] = useState("windows");
  const [pos, setPos] = useState(100);
  const touched = useRef(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setPos(50); return; }
    let raf = 0; const t0 = performance.now(), delay = 450, dur = 1500;
    const step = (t: number) => {
      if (touched.current) return;
      const k = Math.min(1, Math.max(0, (t - t0 - delay) / dur));
      setPos(Math.round((100 - 50 * (1 - Math.pow(1 - k, 3))) * 10) / 10);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const kind = DEVICE[os] ?? "desktop";
  const dim = kind === "phone" ? { w: 180, h: 380 } : { w: 640, h: 400 };
  return (
    <div className="xf">
      <div className="xf-stage">
        <div className={`xf-frame ${kind}`} data-os={os} key={os}>
          {kind === "desktop" ? <Chrome os={os} /> : <span className="xf-cam" data-os={os} aria-hidden="true" />}
          <div className="xf-screen" style={{ aspectRatio: `${dim.w} / ${dim.h}` }}>
            <div className="xf-layer"><SheetScreen w={dim.w} h={dim.h} /></div>
            <div className="xf-layer" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}><AppScreen w={dim.w} h={dim.h} /></div>
            <span className="xf-tag left" style={{ opacity: pos > 24 ? 1 : 0 }}>Classeur Excel</span>
            <span className="xf-tag right" style={{ opacity: pos < 76 ? 1 : 0 }}>Application {LABELS[os]}</span>
            <div className="xf-handle" style={{ left: `${pos}%` }} aria-hidden="true"><span><Icon name="swap" size={18} /></span></div>
            <input className="xf-range" type="range" min={0} max={100} step={0.5} value={pos} aria-label="Comparer le classeur Excel et l'application"
              onPointerDown={() => { touched.current = true; }} onKeyDown={() => { touched.current = true; }} onChange={(e) => { touched.current = true; setPos(Number(e.target.value)); }} />
          </div>
        </div>
      </div>
      <p className="xf-cap">Faites glisser pour voir votre classeur devenir une application</p>
      <div className="xf-chips" role="group" aria-label="Plateforme affichée">
        {PLATFORMS.map((p) => (
          <button type="button" key={p} aria-pressed={os === p} className={os === p ? "on" : ""} style={{ ["--pc" as string]: PLATFORM_COLORS[p] }} onClick={() => setOs(p)}>
            <PlatformIcon id={p} size={18} /><span>{LABELS[p]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
