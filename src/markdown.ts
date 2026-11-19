// Petit convertisseur Markdown → HTML, sans dépendance. Le texte est TOUJOURS échappé avant tout balisage ; seuls les liens https, mailto et ancres sont conservés.
// Pris en charge : titres #–###, paragraphes, **gras**, *italique*, `code`, liens, listes (à puces, numérotées, imbriquées), tableaux, citations, blocs de code, séparateurs.

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const SAFE_URL = /^(https:\/\/|http:\/\/|mailto:|#)/;

export function inline(src: string): string {
  const codes: string[] = [];
  let s = src.replace(/`([^`\n]+)`/g, (_, c: string) => { codes.push(`<code>${escapeHtml(c)}</code>`); return `\u0000${codes.length - 1}\u0000`; });
  s = escapeHtml(s);
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, text: string, url: string) => {
    const raw = url.replace(/&amp;/g, "&");
    return SAFE_URL.test(raw) ? `<a href="${escapeHtml(raw)}"${raw.startsWith("#") ? "" : ' target="_blank" rel="noopener noreferrer"'}>${text}</a>` : text;
  });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codes[Number(i)]);
}

const LIST = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const indentOf = (l: string) => l.length - l.trimStart().length;
const isTableSep = (l: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l) && l.includes("-");
const cells = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

function list(lines: string[], start: number): { html: string; next: number } {
  const first = LIST.exec(lines[start])!, base = first[1].length, ordered = /\d/.test(first[2]);
  const items: string[] = [];
  let i = start;
  while (i < lines.length) {
    const m = LIST.exec(lines[i]);
    if (!m || m[1].length !== base || /\d/.test(m[2]) !== ordered) break;
    let text = m[3]; i++;
    const sub: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && indentOf(lines[i]) > base) { sub.push(lines[i]); i++; }
    const own: string[] = [], nested: string[] = [];
    let inNested = false;
    for (const l of sub) { if (LIST.test(l)) inNested = true; (inNested ? nested : own).push(l); }
    if (own.length) text += " " + own.map((l) => l.trim()).join(" ");
    items.push(`<li>${inline(text)}${nested.length ? blocks(nested) : ""}</li>`);
  }
  const tag = ordered ? "ol" : "ul";
  return { html: `<${tag}>${items.join("")}</${tag}>`, next: i };
}

function blocks(lines: string[]): string {
  const out: string[] = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.trim() === "") { i++; continue; }
    const fence = /^\s*```(\w*)\s*$/.exec(l);
    if (fence) { const code: string[] = []; i++; while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]); i++; out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`); continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(l);
    if (h) { const n = h[1].length; out.push(`<h${n} id="${slug(h[2])}">${inline(h[2])}</h${n}>`); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
    if (l.trim().startsWith("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(l), rows: string[][] = []; i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      out.push(`<div class="md-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, k) => `<td>${inline(r[k] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`); continue;
    }
    if (/^\s*>/.test(l)) { const q: string[] = []; while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, "")); out.push(`<blockquote>${blocks(q)}</blockquote>`); continue; }
    if (LIST.test(l)) { const r = list(lines, i); out.push(r.html); i = r.next; continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^\s*(```|#{1,3}\s|>)/.test(lines[i]) && !LIST.test(lines[i]) && !(lines[i].trim().startsWith("|") && i + 1 < lines.length && isTableSep(lines[i + 1]))) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

export const renderMarkdown = (md: string): string => blocks(md.replace(/\r\n?/g, "\n").split("\n"));
/** Titres de niveau 2 d'un texte Markdown (pour le sommaire d'un chapitre). */
export const headingsOf = (md: string): { id: string; title: string }[] => md.split(/\r?\n/).filter((l) => /^##\s+/.test(l)).map((l) => { const t = l.replace(/^##\s+/, "").trim(); return { id: slug(t), title: t.replace(/[*`]/g, "") }; });
export const titleOf = (md: string): string => (/^#\s+(.*)$/m.exec(md)?.[1] ?? "").trim();
