import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  webSource, type CellValue, type ControlProps, type FormControl, type FormLayout, type MacroInfo, type MacroRun, type Preview,
  type PreviewSheet, type PreviewWorkbook, type RunnerSource,
} from "./api";

const MAX_ROWS = 300;
const MAX_COLS = 40;
const MIN_ROWS = 25;
const MIN_COLS = 10;
const PX = 4 / 3; // 1 point = 1,33 pixel : unités des formulaires VBA

const colName = (n: number) => {
  let s = "";
  for (let c = n; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s;
  return s;
};
const splitAddr = (a: string) => {
  const m = /^([A-Z]+)(\d+)$/.exec(a);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + ch.charCodeAt(0) - 64;
  return { col, row: Number(m[2]) };
};

function show(v: CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "VRAI" : "FAUX";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(12)));
  if (typeof v === "object") return v.e;
  return v;
}
const isError = (v: CellValue) => typeof v === "object" && v !== null;
const toEdit = (v: CellValue): string => (v === null ? "" : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : typeof v === "object" ? v.e : String(v));

type Log = { id: number; kind: "ok" | "err" | "info"; text: string };
type FormState = Record<string, ControlProps>; // contrôle (minuscules) -> propriétés
const low = (s: string) => s.toLowerCase();
const asText = (v: ControlProps[string] | undefined) => (v === undefined || v === null ? "" : Array.isArray(v) ? v.join(", ") : String(v));
const asBool = (v: ControlProps[string] | undefined) => v === true || v === "TRUE" || v === "true" || v === -1 || v === "-1";

function initialState(f: FormLayout): FormState {
  const st: FormState = {};
  for (const c of f.controls) {
    const p: ControlProps = {};
    if (c.type === "Label" || c.type === "CommandButton" || c.type === "Frame" || c.type === "CheckBox" || c.type === "OptionButton" || c.type === "ToggleButton") p.caption = c.caption;
    if (c.type === "TextBox" || c.type === "ComboBox") { p.value = c.value; p.text = c.value; }
    if (c.type === "CheckBox" || c.type === "OptionButton" || c.type === "ToggleButton") p.value = asBool(c.value);
    if (c.type === "ComboBox" || c.type === "ListBox") p.items = [];
    st[low(c.name)] = p;
  }
  return st;
}

/** Fenêtre d'un UserForm : contrôles positionnés comme dans le concepteur (ou d'après le code si la mise en page est déduite). */
function FormWindow({ form, state, busy, onChange, onEvent, onClose }: {
  form: FormLayout; state: FormState; busy: boolean;
  onChange: (ctl: string, patch: ControlProps) => void; onEvent: (ctl: string, event: string, patch?: ControlProps) => void; onClose: () => void;
}) {
  const has = (ctl: string, ev: string) => form.events.some((e) => low(e.control) === low(ctl) && low(e.event) === low(ev));
  const frames = form.controls.filter((c) => c.type === "Frame");
  const groupOf = (c: FormControl) => {
    const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    const f = frames.filter((fr) => cx >= fr.left && cx <= fr.left + fr.width && cy >= fr.top && cy <= fr.top + fr.height).sort((a, b) => a.width * a.height - b.width * b.height)[0];
    return f ? f.name : "";
  };
  const focusVal = useRef("");
  const sorted = [...form.controls].sort((a, b) => a.tab - b.tab);

  const render = (c: FormControl) => {
    const p = state[low(c.name)] ?? {};
    if (p.visible === false || p.visible === "FALSE") return null;
    const off = busy || p.enabled === false || p.enabled === "FALSE";
    const style: CSSProperties = { left: c.left * PX, top: c.top * PX, width: c.width * PX, height: c.height * PX };
    if (c.font?.name) style.fontFamily = `"${c.font.name}", "Segoe UI", sans-serif`;
    if (c.font?.size) style.fontSize = `${c.font.size * PX}px`;
    if (c.font?.bold) style.fontWeight = 700;
    if (c.font?.italic) style.fontStyle = "italic";
    if (c.fore) style.color = c.fore;
    if (c.back) style.background = c.back;
    if (c.font?.align === 3 && c.type !== "CommandButton") style.textAlign = "center";
    const cap = asText(p.caption) || c.caption;
    const key = c.name;
    switch (c.type) {
      case "Label": return <div key={key} className="uf-c uf-label" style={style}>{cap}</div>;
      case "Frame": return <fieldset key={key} className="uf-c uf-frame" style={style}><legend>{cap}</legend></fieldset>;
      case "CommandButton":
        return <button key={key} type="button" className="uf-c uf-btn" style={style} disabled={off} onClick={() => onEvent(c.name, "Click")}>{cap}</button>;
      case "TextBox":
        return <input key={key} type={c.password ? "password" : "text"} className="uf-c uf-input" style={style} disabled={off} aria-label={c.name} value={asText(p.value)}
          onFocus={() => { focusVal.current = asText(p.value); }}
          onChange={(e) => onChange(c.name, { value: e.target.value, text: e.target.value })}
          onBlur={(e) => { if (e.target.value !== focusVal.current && has(c.name, "Change")) onEvent(c.name, "Change"); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
      case "ComboBox":
      case "ListBox": {
        const items = Array.isArray(p.items) ? p.items : [];
        const val = asText(p.value);
        const set = (v: string) => {
          const patch = { value: v, text: v, listindex: items.indexOf(v) };
          if (has(c.name, "Change") || has(c.name, "Click")) onEvent(c.name, has(c.name, "Change") ? "Change" : "Click", patch);
          else onChange(c.name, patch);
        };
        return (
          <select key={key} className="uf-c uf-input" style={style} disabled={off} aria-label={c.name} size={c.type === "ListBox" ? Math.max(2, Math.floor(c.height / 14)) : undefined}
            value={items.includes(val) ? val : ""} onChange={(e) => set(e.target.value)}>
            {c.type === "ComboBox" && <option value="" />}
            {items.map((it, i) => <option key={`${it}-${i}`} value={it}>{it}</option>)}
          </select>
        );
      }
      case "CheckBox":
      case "ToggleButton":
      case "OptionButton": {
        const on = asBool(p.value);
        const radio = c.type === "OptionButton";
        return (
          <label key={key} className="uf-c uf-check" style={style}>
            <input type={radio ? "radio" : "checkbox"} disabled={off} checked={on} onChange={(e) => {
              const v = radio ? true : e.target.checked;
              if (radio) for (const o of form.controls) if (o.type === "OptionButton" && o.name !== c.name && groupOf(o) === groupOf(c)) onChange(o.name, { value: false });
              if (has(c.name, "Click") || has(c.name, "Change")) onEvent(c.name, has(c.name, "Click") ? "Click" : "Change", { value: v });
              else onChange(c.name, { value: v });
            }} /> {cap}
          </label>
        );
      }
      default: return <div key={key} className="uf-c uf-other" style={style} title={c.type}>{c.type === "Unknown" ? c.name : c.type}</div>;
    }
  };

  return (
    <div className="uf-win" role="dialog" aria-label={form.caption}>
      <div className="uf-title"><span style={{ whiteSpace: "pre" }}>{form.caption || form.name}</span><button type="button" onClick={onClose} aria-label="Fermer le formulaire">✕</button></div>
      <div className="uf-body" style={{ width: form.width * PX, height: form.height * PX, ...(form.picture ? { background: `url(${form.picture}) 0 0 / 100% 100% no-repeat` } : {}) }}>
        {form.layout === "inferred" && <div className="uf-note">Mise en page déduite du code</div>}
        {sorted.map(render)}
      </div>
    </div>
  );
}

export function Runner({ file, source, title, onClose }: { file?: File; source?: RunnerSource; title?: string; onClose?: () => void }) {
  const src = useMemo(() => source ?? (file ? webSource(file) : null), [source, file]);
  const embedded = !onClose;
  const [preview, setPreview] = useState<Preview | null>(null);
  const [wb, setWb] = useState<PreviewWorkbook | null>(null);
  const [sheet, setSheet] = useState(0);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<Log[]>([]);
  const [inputs, setInputs] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [forms, setForms] = useState<Record<string, FormState>>({}); // formulaire (minuscules) -> état des contrôles
  const [openForms, setOpenForms] = useState<string[]>([]); // noms (minuscules) des formulaires ouverts
  const [dialog, setDialog] = useState<string[] | null>(null);
  const logId = useRef(0);
  const name = title ?? file?.name ?? preview?.filename ?? "Classeur";

  const log = useCallback((kind: Log["kind"], text: string) => setLogs((l) => [...l, { id: ++logId.current, kind, text }].slice(-60)), []);

  useEffect(() => {
    if (!src) return;
    let alive = true;
    src.open()
      .then((p) => {
        if (!alive) { src.close(); return; }
        setPreview(p); setWb(p.workbook);
        setSheet(Math.max(0, p.workbook.sheets.findIndex((s) => !s.hidden)));
        const f = p.forms?.length ?? 0;
        log("info", `Classeur ouvert et calculé : ${p.workbook.sheets.length} feuille(s)${p.macros.length ? `, ${p.macros.length} macro(s)` : ""}${f ? `, ${f} formulaire(s)` : ""}.`);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Erreur inconnue"));
    return () => { alive = false; src.close(); };
  }, [src, log]);

  useEffect(() => {
    if (embedded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && editing === null && !dialog) onClose?.(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose, editing, embedded, dialog]);

  const current: PreviewSheet | undefined = wb?.sheets[sheet];
  const grid = useMemo(() => {
    if (!current) return null;
    const map = new Map<string, { v: CellValue; f?: string }>();
    let maxRow = 0, maxCol = 0;
    for (const c of current.cells) {
      const p = splitAddr(c.a);
      if (!p) continue;
      map.set(c.a, c);
      maxRow = Math.max(maxRow, p.row); maxCol = Math.max(maxCol, p.col);
    }
    const rows = Math.min(Math.max(maxRow + 1, MIN_ROWS), MAX_ROWS);
    const cols = Math.min(Math.max(maxCol + 1, MIN_COLS), MAX_COLS);
    const hiddenRows = new Set(current.hidden_rows), hiddenCols = new Set(current.hidden_columns);
    return {
      map, truncated: maxRow > MAX_ROWS || maxCol > MAX_COLS,
      rows: Array.from({ length: rows }, (_, i) => i + 1).filter((r) => !hiddenRows.has(r)),
      cols: Array.from({ length: cols }, (_, i) => i + 1).filter((c) => !hiddenCols.has(c)),
    };
  }, [current]);

  const layouts = preview?.forms ?? [];
  const layoutOf = (n: string) => layouts.find((f) => low(f.name) === low(n));

  const recalc = async (next: Record<string, string>) => {
    if (!src) return;
    setBusy("Recalcul…"); setError("");
    try {
      const r = await src.recalc(next);
      setWb(r.workbook); setEdits(next);
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    setBusy("");
  };

  const commit = async (addr: string) => {
    setEditing(null);
    if (!current) return;
    const cell = grid?.map.get(addr);
    const raw = draft.trim().replace(/^(-?\d+),(\d+)$/, "$1.$2");
    if (raw === toEdit(cell?.v ?? null)) return;
    await recalc({ ...edits, [`${current.name}!${addr}`]: raw });
  };

  /** Applique le résultat d'une exécution : journal, boîtes de message, classeur, état des contrôles, formulaires ouverts. */
  const apply = (r: MacroRun, formsBefore: Record<string, FormState>) => {
    for (const a of r.actions) log("info", a);
    for (const i of r.ignored.slice(0, 5)) log("err", `Instruction non exécutée par le moteur : ${i}`);
    if (r.messages.length) { r.messages.forEach((m) => log("info", `Message affiché : « ${m} »`)); setDialog(r.messages); }
    if (r.error) log("err", `Erreur VBA ${r.error.number} (ligne ${r.error.line}) : ${r.error.description}`);
    else log("ok", `Terminée : ${r.changes_total} cellule(s) modifiée(s), ${r.steps} instructions, ${r.elapsed_ms} ms.`);
    if (r.workbook) {
      setWb(r.workbook);
      const next = { ...edits };
      for (const c of r.changes) next[`${c.sheet}!${c.cell}`] = toEdit(c.after);
      setEdits(next);
    }
    const merged: Record<string, FormState> = { ...formsBefore };
    for (const c of r.controls ?? []) {
      const f = low(c.form);
      merged[f] = { ...(merged[f] ?? {}), [low(c.name)]: { ...(merged[f]?.[low(c.name)] ?? {}), ...c.props } };
    }
    setForms(merged);
    const shown = (r.forms_shown ?? []).map(low);
    for (const f of shown) if (!merged[f]) { const l = layoutOf(f); if (l) merged[f] = initialState(l); }
    setOpenForms(shown.filter((f) => layoutOf(f)));
  };

  const runMacro = async (m: MacroInfo) => {
    if (!src) return;
    setBusy(`Exécution de ${m.name}…`); setError("");
    log("info", `▶ ${m.module}.${m.name}`);
    try {
      const r = await src.macro({
        macro: `${m.module}.${m.name}`, edits, active_sheet: current?.name, shown_forms: openForms,
        inputs: inputs.split("\n").map((l) => l.trim()).filter(Boolean),
      });
      apply(r, forms);
    } catch (e) {
      const m2 = e instanceof Error ? e.message : "Erreur";
      setError(m2); log("err", m2);
    }
    setBusy("");
  };

  /** Événement d'un contrôle (`Click`, `Change`) ou du formulaire (`Initialize`) : exécute le vrai code VBA du classeur. */
  const fireEvent = async (form: FormLayout, ctl: string, event: string, patch?: ControlProps, base?: FormState) => {
    if (!src) return;
    const f = low(form.name);
    const state: FormState = { ...(base ?? forms[f] ?? initialState(form)) };
    if (patch) state[low(ctl)] = { ...(state[low(ctl)] ?? {}), ...patch };
    const info = form.events.find((e) => low(e.control) === low(ctl) && low(e.event) === low(event));
    const before = { ...forms, [f]: state };
    if (!info) { setForms(before); return; }
    setBusy(`${info.proc}…`); setError("");
    log("info", `▶ ${form.name}.${info.proc}`);
    try {
      const r = await src.formEvent({
        form: form.name, proc: info.proc, controls: state, edits, active_sheet: current?.name,
        shown_forms: openForms.map((o) => layoutOf(o)?.name ?? o),
        inputs: inputs.split("\n").map((l) => l.trim()).filter(Boolean),
      });
      apply(r, before);
    } catch (e) {
      const m2 = e instanceof Error ? e.message : "Erreur";
      setError(m2); log("err", m2);
    }
    setBusy("");
  };

  const openForm = async (form: FormLayout) => {
    const f = low(form.name);
    const loaded = !!forms[f]; // déjà chargé (fermé par Me.Hide) : comme dans Excel, Initialize ne se relance pas
    const state = forms[f] ?? initialState(form);
    setForms({ ...forms, [f]: state });
    setOpenForms((o) => (o.includes(f) ? o : [...o, f]));
    if (!loaded && form.events.some((e) => !e.control && low(e.event) === "initialize")) {
      // « Initialize » s'exécute à l'ouverture : le formulaire doit déjà compter parmi les formulaires affichés
      if (!src) return;
      setBusy("Initialisation…"); setError("");
      log("info", `▶ ${form.name}.UserForm_Initialize`);
      try {
        const r = await src.formEvent({ form: form.name, proc: "UserForm_Initialize", controls: state, edits, active_sheet: current?.name, shown_forms: [form.name], inputs: [] });
        apply(r, { ...forms, [f]: state });
        setOpenForms((o) => (o.includes(f) ? o : [...o, f]));
      } catch (e) { const m2 = e instanceof Error ? e.message : "Erreur"; setError(m2); log("err", m2); }
      setBusy("");
    }
  };
  /** Croix de la fenêtre = déchargement du formulaire : son état est perdu (Initialize se relancera à la prochaine ouverture). */
  const closeForm = (f: string) => { setOpenForms((o) => o.filter((x) => x !== f)); setForms((all) => { const n = { ...all }; delete n[f]; return n; }); };

  const reset = () => { setLogs([]); setForms({}); setOpenForms([]); if (preview) { setWb(preview.workbook); setEdits({}); } };
  const runnable = preview?.macros.filter((m) => m.kind === "sub" && m.parameters === 0 && !layouts.some((f) => low(f.name) === low(m.module))) ?? [];
  const others = (preview?.macros.length ?? 0) - runnable.length - (preview?.macros.filter((m) => layouts.some((f) => low(f.name) === low(m.module))).length ?? 0);

  const body = (
    <>
      <h2>{embedded ? `▶ ${name}` : "▶ Test dans le navigateur"}</h2>
      <p className="muted run-sub">{embedded ? "Exécuté par le moteur ExcelPro, sans Excel." : `${name} — calculé par le moteur ExcelPro, sans Excel. Votre fichier d'origine n'est jamais modifié.`}</p>

      {!preview && !error && <p className="run-wait" role="status">Ouverture et calcul du classeur…</p>}
      {!preview && error && <p className="error" role="alert">{error}</p>}

      {preview && wb && (
        <>
          <div className="run-bar">
            <div className="run-tabs" role="tablist">
              {wb.sheets.map((s, i) => (
                <button key={s.name} role="tab" aria-selected={i === sheet} className={i === sheet ? "on" : ""} onClick={() => { setSheet(i); setEditing(null); }}>
                  {s.name}{s.hidden ? " (masquée)" : ""}
                </button>
              ))}
            </div>
            <span className="muted run-status" role="status">{busy || (Object.keys(edits).length ? `${Object.keys(edits).length} modification(s)` : "Cliquez une cellule pour la modifier")}</span>
            {(Object.keys(edits).length > 0 || logs.length > 1 || openForms.length > 0) && <button className="link" onClick={reset}>Réinitialiser</button>}
          </div>

          {grid && (
            <div className="run-grid" tabIndex={0} aria-label={`Feuille ${current?.name}`}>
              <table>
                <thead>
                  <tr><th className="corner" />{grid.cols.map((c) => <th key={c}>{colName(c)}</th>)}</tr>
                </thead>
                <tbody>
                  {grid.rows.map((r) => (
                    <tr key={r}>
                      <th>{r}</th>
                      {grid.cols.map((c) => {
                        const addr = `${colName(c)}${r}`;
                        const cell = grid.map.get(addr);
                        const changed = current ? `${current.name}!${addr}` in edits : false;
                        const isEd = editing === addr;
                        return (
                          <td key={addr}
                            className={[cell?.f ? "calc" : "", cell && isError(cell.v) ? "bad" : "", changed ? "edited" : "", typeof cell?.v === "number" ? "num" : ""].join(" ")}
                            title={cell?.f ? `${cell.f}` : undefined}
                            onClick={() => { if (!cell?.f && !isEd && !busy) { setEditing(addr); setDraft(toEdit(cell?.v ?? null)); } }}>
                            {isEd ? (
                              <input autoFocus value={draft} aria-label={`Cellule ${addr}`} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit(addr)}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { e.stopPropagation(); setEditing(null); } }} />
                            ) : show(cell?.v ?? null)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {grid?.truncated && <p className="muted run-note">Affichage limité aux {MAX_ROWS} premières lignes et {MAX_COLS} premières colonnes.</p>}
          <p className="muted run-note">Les cellules vertes contiennent une formule (survolez-les pour la lire) ; modifiez les autres pour tester les calculs.</p>

          {layouts.length > 0 && (
            <section className="run-forms">
              <h3>UserForms</h3>
              <div className="run-list">
                {layouts.map((f) => (
                  <button key={f.name} className="primary" disabled={!!busy} onClick={() => openForm(f)}>▶ Ouvrir {f.name}<small>{f.layout === "inferred" ? "mise en page déduite du code" : f.layout === "binary" ? "mise en page du classeur" : "mise en page exacte"}</small></button>
                ))}
              </div>
              {layouts.some((f) => f.layout === "inferred") && <p className="muted run-note">Mise en page approximative : le code des événements est celui de votre classeur, mais les positions et tailles des contrôles sont déduites. Fournissez les fichiers .frm exportés pour une mise en page exacte.</p>}
              <div className="uf-stage">
                {openForms.map((f) => {
                  const l = layoutOf(f);
                  return l ? (
                    <FormWindow key={f} form={l} state={forms[f] ?? initialState(l)} busy={!!busy}
                      onChange={(ctl, patch) => setForms((all) => ({ ...all, [f]: { ...(all[f] ?? initialState(l)), [low(ctl)]: { ...((all[f] ?? initialState(l))[low(ctl)] ?? {}), ...patch } } }))}
                      onEvent={(ctl, ev, patch) => fireEvent(l, ctl, ev, patch)} onClose={() => closeForm(f)} />
                  ) : null;
                })}
              </div>
            </section>
          )}

          <section className="run-macros">
            <h3>Macros VBA</h3>
            {!wb.has_macros && <p className="muted">Ce classeur ne contient pas de macro.</p>}
            {wb.has_macros && runnable.length === 0 && <p className="muted">Aucune macro exécutable trouvée (code VBA absent, protégé ou non analysable).</p>}
            {runnable.length > 0 && (
              <div className="run-list">
                {runnable.map((m) => (
                  <button key={`${m.module}.${m.name}`} className="primary" disabled={!!busy} onClick={() => runMacro(m)}>▶ {m.name}<small>{m.module}</small></button>
                ))}
              </div>
            )}
            {(runnable.length > 0 || layouts.length > 0) && (
              <details className="run-inputs">
                <summary>Réponses aux boîtes de saisie (InputBox)</summary>
                <textarea rows={2} placeholder="Une réponse par ligne, dans l'ordre où la macro les demande" value={inputs} onChange={(e) => setInputs(e.target.value)} />
              </details>
            )}
            {others > 0 && <p className="muted run-note">{others} procédure(s) avec paramètres ou fonctions : non lançables ici.</p>}
            {preview.parse_errors.length > 0 && <p className="muted run-note">Modules non analysables : {preview.parse_errors.map((p) => p.module).join(", ")}.</p>}
            <p className="muted run-note">Graphiques et mises en forme ne sont pas affichés ; une instruction non prise en charge est signalée, jamais devinée.</p>
          </section>

          {error && <p className="error" role="alert">{error}</p>}
          {logs.length > 0 && (
            <ol className="run-log" aria-label="Journal d'exécution">
              {logs.map((l) => <li key={l.id} className={l.kind}>{l.text}</li>)}
            </ol>
          )}
        </>
      )}

      {dialog && (
        <div className="uf-msgbox" role="alertdialog" aria-label="Message">
          <div>{dialog.map((m, i) => <p key={i}>{m}</p>)}<button className="primary" autoFocus onClick={() => setDialog(null)}>OK</button></div>
        </div>
      )}
    </>
  );

  if (embedded) return <div className="runner-page">{body}</div>;
  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal runner" role="dialog" aria-modal="true" aria-label="Test du fichier Excel">
        <button className="close" onClick={onClose} aria-label="Fermer">✕</button>
        {body}
      </div>
    </div>
  );
}
