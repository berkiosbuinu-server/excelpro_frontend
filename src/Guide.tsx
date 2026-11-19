import { useMemo, useState } from "react";
import { headingsOf, renderMarkdown, titleOf } from "./markdown";

// Les chapitres sont des fichiers Markdown (src/guide/NN-nom.md) : modifiables sans toucher au code, et téléchargeables.
const FILES = import.meta.glob("./guide/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const CHAPTERS = Object.keys(FILES).sort().map((path) => {
  const id = path.replace(/^.*\//, "").replace(/\.md$/, ""), md = FILES[path];
  return { id, md, title: titleOf(md) || id, text: md.toLowerCase() };
});

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Guide d'utilisation : explique ExcelPro pas à pas. Chaque chapitre est un fichier .md téléchargeable. */
export function Guide() {
  const [id, setId] = useState(CHAPTERS[0]?.id ?? "");
  const [q, setQ] = useState("");
  const i = Math.max(0, CHAPTERS.findIndex((c) => c.id === id)), cur = CHAPTERS[i];
  const html = useMemo(() => (cur ? renderMarkdown(cur.md) : ""), [cur]);
  const toc = useMemo(() => (cur ? headingsOf(cur.md) : []), [cur]);
  const hits = q.trim().length >= 2 ? CHAPTERS.filter((c) => c.text.includes(q.trim().toLowerCase())) : null;
  const open = (to: string) => { setId(to); setQ(""); window.scrollTo({ top: 0 }); };
  // Les liens « #NN-chapitre » changent de chapitre ; les autres ancres font défiler vers le titre.
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a"); const href = a?.getAttribute("href");
    if (!a || !href || !href.startsWith("#")) return;
    e.preventDefault(); const t = href.slice(1);
    if (CHAPTERS.some((c) => c.id === t)) open(t); else document.getElementById(t)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  if (!cur) return <p className="muted">Le guide n'est pas disponible.</p>;
  return (
    <div className="guide">
      <aside className="guide-nav" aria-label="Chapitres du guide">
        <h2>Guide d'utilisation</h2>
        <input type="search" value={q} placeholder="Rechercher dans le guide…" onChange={(e) => setQ(e.target.value)} aria-label="Rechercher dans le guide" />
        {hits && (hits.length ? <ul className="guide-hits">{hits.map((c) => <li key={c.id}><button className="link" onClick={() => open(c.id)}>{c.title}</button></li>)}</ul> : <p className="muted">Aucun chapitre ne contient « {q} ».</p>)}
        <ol className="guide-chapters">{CHAPTERS.map((c) => <li key={c.id}><button className={c.id === cur.id ? "active" : ""} aria-current={c.id === cur.id ? "page" : undefined} onClick={() => open(c.id)}>{c.title}</button></li>)}</ol>
        <button onClick={() => download("guide-excelpro.md", CHAPTERS.map((c) => c.md.trim()).join("\n\n---\n\n") + "\n")}>⬇ Télécharger tout le guide (.md)</button>
      </aside>
      <article className="guide-body">
        {toc.length > 1 && <nav className="guide-toc" aria-label="Dans ce chapitre"><b>Dans ce chapitre</b> {toc.map((t) => <button key={t.id} className="link" onClick={() => document.getElementById(t.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{t.title}</button>)}</nav>}
        <div className="md" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
        <div className="guide-pager">
          <button disabled={i === 0} onClick={() => open(CHAPTERS[i - 1].id)}>← {i > 0 ? CHAPTERS[i - 1].title : ""}</button>
          <button onClick={() => download(`${cur.id}.md`, cur.md)}>⬇ Ce chapitre (.md)</button>
          <button onClick={() => window.print()}>🖨 Imprimer</button>
          <button disabled={i === CHAPTERS.length - 1} onClick={() => open(CHAPTERS[i + 1].id)}>{i < CHAPTERS.length - 1 ? CHAPTERS[i + 1].title : ""} →</button>
        </div>
      </article>
    </div>
  );
}
