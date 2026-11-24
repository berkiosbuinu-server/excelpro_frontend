import { useRef, useState } from "react";
import { api, money, type Pricing } from "./api";
import { Runner } from "./Runner";
import { LABELS, errMsg } from "./labels";
import { Icon, useToast } from "./ui";
import { PlatformIcon, PLATFORM_COLORS } from "./visuals";

const fmtSize = (n: number) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1048576).toFixed(1).replace(".", ",")} Mo`);

/** Nouvelle conversion : un formulaire à gauche, le récapitulatif (prix estimé, plateformes) qui reste visible à droite. */
export function NewOrder({ pricing, initialPlatforms, onCreated }: { pricing: Pricing | null; initialPlatforms: string[] | null; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>(initialPlatforms?.length ? initialPlatforms : ["windows"]);
  const [file, setFile] = useState<File | null>(null);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { show, node } = useToast();
  const total = picked.reduce((s, p) => s + (pricing?.platforms[p] ?? 0), 0);
  const toggle = (p: string) => setPicked((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const take = (f: File | undefined) => {
    setRunning(false); setError("");
    if (!f) return;
    if (!/\.(xlsx|xlsm)$/i.test(f.name)) { setError("Choisissez un fichier Excel (.xlsx ou .xlsm)."); return; }
    setFile(f);
    if (!name.trim()) setName(f.name.replace(/\.(xlsx|xlsm)$/i, ""));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!file) return setError("Choisissez un fichier Excel (.xlsx ou .xlsm)");
    if (picked.length === 0) return setError("Choisissez au moins une plateforme");
    const f = new FormData();
    f.append("app_name", name); f.append("platforms", picked.join(",")); f.append("phone", phone); f.append("file", file);
    setBusy(true);
    try {
      const created = await api.createOrder(f);
      show(`Fichier reçu. Frais de vérification : ${money(created.check_fee_cents)}. Payez-les dans « Mes commandes » pour lancer la vérification.`);
      setName(""); setFile(null);
      window.setTimeout(onCreated, 1400);
    } catch (err) { setError(errMsg(err)); setBusy(false); }
  };

  return (
    <form className="neworder" onSubmit={submit}>
      <div className="page-title"><h1>Nouvelle conversion</h1><p className="muted">Envoyez votre classeur, choisissez vos plateformes : vous payez d'abord la vérification, puis la conversion si le rapport vous convient.</p></div>
      <div className="no-grid">
        <div className="no-main">
          <section className="block-card">
            <h2>1. Votre fichier</h2>
            <div className={`drop${drag ? " over" : ""}${file ? " has" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files[0]); }}>
              <input ref={input} type="file" accept=".xlsx,.xlsm" hidden onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }} />
              {file ? (
                <div className="drop-file"><span className="drop-ico ok"><Icon name="file" size={22} /></span><div><b>{file.name}</b><small>{fmtSize(file.size)}</small></div>
                  <button type="button" onClick={() => input.current?.click()}>Changer</button></div>
              ) : (
                <button type="button" className="drop-btn" onClick={() => input.current?.click()}>
                  <span className="drop-ico"><Icon name="upload" size={24} /></span><b>Déposez votre classeur ici</b><small>ou cliquez pour le choisir (.xlsx, .xlsm)</small>
                </button>
              )}
            </div>
            {file && (
              <div className="run-cta">
                <button type="button" className="primary" onClick={() => setRunning(true)}>▶ Exécuter</button>
                <span className="muted">Testez votre fichier dans le navigateur (formules et macros) avant de continuer.</span>
              </div>
            )}
            {running && file && <Runner file={file} onClose={() => setRunning(false)} />}
          </section>

          <section className="block-card">
            <h2>2. Votre application</h2>
            <label>Nom de l'application<input value={name} onChange={(e) => setName(e.target.value)} minLength={2} required placeholder="ex. Gestion de stock" /></label>
            <p className="field-label">Plateformes</p>
            <div className="plat-pick" role="group" aria-label="Plateformes">
              {pricing && Object.entries(pricing.platforms).map(([k, v]) => (
                <button type="button" key={k} aria-pressed={picked.includes(k)} className={`ptile${picked.includes(k) ? " on" : ""}`} style={{ ["--pc" as string]: PLATFORM_COLORS[k] }} onClick={() => toggle(k)}>
                  <span className="ptile-ico"><PlatformIcon id={k} size={26} /></span><strong>{LABELS[k] ?? k}</strong><span className="ptile-price">{v} $</span>
                  <span className="ptile-check" aria-hidden="true"><Icon name="check" size={14} /></span>
                </button>
              ))}
              {!pricing && Object.keys(LABELS).map((k) => <div key={k} className="skeleton tile-sk" />)}
            </div>
          </section>

          <section className="block-card">
            <h2>3. Notification <span className="muted">(facultatif)</span></h2>
            <label>Numéro WhatsApp pour être prévenu<input type="tel" placeholder="+243…" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
          </section>
        </div>

        <aside className="no-sum">
          <div className="sum-card">
            <h2>Récapitulatif</h2>
            <dl>
              <div><dt>Fichier</dt><dd>{file ? file.name : "—"}</dd></div>
              <div><dt>Application</dt><dd>{name.trim() || "—"}</dd></div>
              <div><dt>Plateformes</dt><dd>{picked.length ? picked.map((p) => LABELS[p] ?? p).join(", ") : "—"}</dd></div>
            </dl>
            <p className="sum-line"><span>Conversion estimée</span><strong>{total} $</strong></p>
            <p className="muted">Les frais de vérification sont calculés à l'envoi de votre fichier et se règlent en premier.</p>
            {error && <p className="alert err" role="alert"><Icon name="alert" size={18} />{error}</p>}
            <button className="primary big full" type="submit" disabled={busy}>{busy ? "Envoi…" : "Continuer la soumission"}</button>
          </div>
        </aside>
      </div>
      {node}
    </form>
  );
}
