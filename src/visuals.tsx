import { useId } from "react";

/* ---------- Icônes de plateformes (SVG génériques) ---------- */
export const PLATFORM_COLORS: Record<string, string> = {
  windows: "#2b7de9", android: "#2fa66a", linux: "#d98a0b", ios: "#6b7280", macos: "#7c5cd6", web: "#0e9fb5",
};

export function PlatformIcon({ id, size = 28 }: { id: string; size?: number }) {
  const c = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (id) {
    case "windows":
      return <svg {...c} fill="currentColor" stroke="none"><rect x="3" y="3" width="8.2" height="8.2" rx="1" /><rect x="12.8" y="3" width="8.2" height="8.2" rx="1" /><rect x="3" y="12.8" width="8.2" height="8.2" rx="1" /><rect x="12.8" y="12.8" width="8.2" height="8.2" rx="1" /></svg>;
    case "android":
      return <svg {...c}><path d="M5 14a7 7 0 0 1 14 0z" fill="currentColor" stroke="none" /><path d="M8 6.2 6.6 4M16 6.2 17.4 4" /><rect x="5" y="15.5" width="14" height="5" rx="2" /><circle cx="9.5" cy="11.3" r=".9" fill="#fff" stroke="none" /><circle cx="14.5" cy="11.3" r=".9" fill="#fff" stroke="none" /></svg>;
    case "linux":
      return <svg {...c}><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path d="m7.5 9.5 3 2.5-3 2.5M12.5 15h4" /></svg>;
    case "ios":
      return <svg {...c}><rect x="7" y="2.5" width="10" height="19" rx="2.6" /><path d="M10.5 18.5h3" /></svg>;
    case "macos":
      return <svg {...c}><rect x="4.5" y="5" width="15" height="10.5" rx="1.6" /><path d="M2.5 19h19" /></svg>;
    default:
      return <svg {...c}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z" /></svg>;
  }
}

export function PlatformBadge({ id, label, size = 22 }: { id: string; label: string; size?: number }) {
  return (
    <span className="pbadge" style={{ ["--pc" as string]: PLATFORM_COLORS[id] ?? "#667085" }}>
      <PlatformIcon id={id} size={size} />
      <span>{label}</span>
    </span>
  );
}

/* ---------- Logo ExcelPro (carré tableur) ---------- */
export function Logo({ size = 32 }: { size?: number }) {
  const g = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs><linearGradient id={g} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1fa968" /><stop offset="1" stopColor="#0b6b3a" /></linearGradient></defs>
      <rect width="40" height="40" rx="10" fill={`url(#${g})`} />
      <g stroke="#fff" strokeOpacity=".9" strokeWidth="1.6" fill="none">
        <rect x="8" y="9" width="24" height="22" rx="2.5" />
        <path d="M8 16.5h24M8 24h24M16 9v22" />
      </g>
      <rect x="17" y="17.2" width="14" height="6" fill="#fff" fillOpacity=".95" />
    </svg>
  );
}

/* ---------- Écran d'une application (issue d'un classeur Excel) ---------- */
export function AppScreen({ w, h, title = "Gestion de stock" }: { w: number; h: number; title?: string }) {
  const id = useId().replace(/:/g, "");
  const wide = w >= 500;
  const mid = w >= 280;
  const pad = Math.round(w * 0.04);
  const bar = Math.round(h * (wide ? 0.1 : 0.075));
  const kpiH = Math.round(h * 0.15);
  const kpiN = mid ? 3 : 2;
  const gap = Math.round(pad * 0.6);
  const kw = (w - pad * 2 - gap * (kpiN - 1)) / kpiN;
  const kpiY = bar + pad;
  const chartY = kpiY + kpiH + gap;
  const chartH = Math.round(h * (wide ? 0.3 : 0.26));
  const tableY = chartY + chartH + gap;
  const rowH = Math.max(14, Math.round(h * 0.052));
  const rows = Math.max(2, Math.floor((h - tableY - pad) / rowH) - 1);
  const bars = wide ? [40, 62, 48, 78, 58, 90, 70, 84] : [45, 70, 52, 88, 64, 76];
  const sideW = wide ? Math.round(w * 0.16) : 0;
  const bx = pad + sideW;
  const bw = w - bx - pad;
  const kw2 = (bw - gap * (kpiN - 1)) / kpiN;
  const kpis = [["Ventes", "12 480 $", "#1f9d5c"], ["Stock", "1 284", "#2b7de9"], ["Alertes", "7", "#e0841a"]].slice(0, kpiN);
  const cols = mid ? 4 : 3;
  const cw = bw / cols;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Application ${title}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id={`${id}h`} x1="0" x2="1"><stop offset="0" stopColor="#14925a" /><stop offset="1" stopColor="#0d6b3d" /></linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2fbf7a" /><stop offset="1" stopColor="#14925a" /></linearGradient>
      </defs>
      <rect width={w} height={h} fill="#f3f6f4" />
      <rect width={w} height={bar} fill={`url(#${id}h)`} />
      <text x={pad} y={bar * 0.64} fill="#fff" fontSize={bar * 0.42} fontWeight="700" fontFamily="system-ui,sans-serif">{title}</text>
      <circle cx={w - pad - bar * 0.25} cy={bar / 2} r={bar * 0.2} fill="#fff" fillOpacity=".85" />
      {wide && (
        <g>
          <rect x="0" y={bar} width={sideW + pad / 2} height={h - bar} fill="#e4ece7" />
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x={pad * 0.7} y={bar + pad + i * rowH * 1.4} width={sideW - pad * 0.4} height={rowH * 0.7} rx="4" fill={i === 0 ? "#14925a" : "#c3d3c9"} />
          ))}
        </g>
      )}
      {kpis.map(([l, v, c], i) => {
        const x = wide ? bx + i * (kw2 + gap) : pad + i * (kw + gap);
        const ww = wide ? kw2 : kw;
        return (
          <g key={l}>
            <rect x={x} y={kpiY} width={ww} height={kpiH} rx="7" fill="#fff" stroke="#dbe4de" />
            <rect x={x} y={kpiY + 6} width="3.5" height={kpiH - 12} rx="2" fill={c} />
            <text x={x + 12} y={kpiY + kpiH * 0.4} fontSize={kpiH * 0.22} fill="#6b7a72" fontFamily="system-ui,sans-serif">{l}</text>
            <text x={x + 12} y={kpiY + kpiH * 0.78} fontSize={kpiH * 0.34} fontWeight="700" fill="#1c2430" fontFamily="system-ui,sans-serif">{v}</text>
          </g>
        );
      })}
      <rect x={wide ? bx : pad} y={chartY} width={wide ? bw : w - pad * 2} height={chartH} rx="7" fill="#fff" stroke="#dbe4de" />
      {bars.map((b, i) => {
        const cx0 = (wide ? bx : pad) + 12;
        const cwid = (wide ? bw : w - pad * 2) - 24;
        const slot = cwid / bars.length;
        const bh = ((chartH - 20) * b) / 100;
        return <rect key={i} x={cx0 + i * slot + slot * 0.18} y={chartY + chartH - 8 - bh} width={slot * 0.64} height={bh} rx="3" fill={`url(#${id}b)`} />;
      })}
      <g>
        {Array.from({ length: rows + 1 }).map((_, r) => (
          <g key={r}>
            <rect x={wide ? bx : pad} y={tableY + r * rowH} width={wide ? bw : w - pad * 2} height={rowH} fill={r === 0 ? "#dcebe2" : r % 2 ? "#fff" : "#f7faf8"} stroke="#dbe4de" strokeWidth=".6" />
            {Array.from({ length: cols }).map((__, c) => (
              <rect key={c} x={(wide ? bx : pad) + c * (wide ? cw : (w - pad * 2) / cols) + 6} y={tableY + r * rowH + rowH * 0.34} width={(wide ? cw : (w - pad * 2) / cols) * (r === 0 ? 0.5 : 0.3 + ((r * 7 + c * 3) % 4) * 0.12)} height={rowH * 0.3} rx="2" fill={r === 0 ? "#14925a" : "#cbd6cf"} />
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
}

/* ---------- Composition : ordinateur + tablette + smartphone ---------- */
export function DevicesShowcase() {
  return (
    <div className="devices" aria-label="La même application sur ordinateur, tablette et smartphone">
      <div className="dev desktop">
        <div className="screen"><AppScreen w={640} h={400} /></div>
        <div className="stand" />
        <div className="base" />
      </div>
      <div className="dev tablet">
        <div className="screen"><AppScreen w={300} h={400} /></div>
      </div>
      <div className="dev phone">
        <div className="notch" />
        <div className="screen"><AppScreen w={180} h={380} /></div>
      </div>
      <span className="tag t-desk">Ordinateur</span>
      <span className="tag t-tab">Tablette</span>
      <span className="tag t-phone">Smartphone</span>
    </div>
  );
}

/* ---------- Pastilles des moyens de paiement ---------- */
export const OPERATOR_STYLE: Record<string, { bg: string; fg: string; short: string }> = {
  mpesa: { bg: "#e60000", fg: "#fff", short: "M-PESA" },
  orange: { bg: "#ff7900", fg: "#000", short: "Orange Money" },
  airtel: { bg: "#e40000", fg: "#fff", short: "Airtel Money" },
};

export function CardIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6.5 15h4" />
    </svg>
  );
}
export function PhoneIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="7" y="2.5" width="10" height="19" rx="2.6" /><path d="M10.5 18.5h3" />
    </svg>
  );
}
