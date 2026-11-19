import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { renderMarkdown, inline, headingsOf, titleOf, slug } from "../src/markdown.ts";

// ── convertisseur
assert.equal(inline("a **gras** et *italique* et `x<y`"), "a <strong>gras</strong> et <em>italique</em> et <code>x&lt;y</code>");
assert.equal(inline("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
assert.ok(!inline("[clic](javascript:alert(1))").includes("href")); assert.ok(inline("[clic](javascript:alert(1))").startsWith("clic"));
assert.ok(inline("[ok](https://a.test/x?y=1&z=2)").includes('href="https://a.test/x?y=1&amp;z=2"') && inline("[ok](https://a.test)").includes('rel="noopener noreferrer"'));
assert.ok(inline("[a](#02-offres)").includes('href="#02-offres"') && !inline("[a](#x)").includes("target"));
assert.equal(inline("`**pas gras**`"), "<code>**pas gras**</code>");
assert.equal(slug("Les étapes : mode d'emploi"), "les-etapes-mode-d-emploi");
const md = "# Titre\n\nUn *para*\nsuite.\n\n## Sous-titre\n\n- a\n- b\n  1. b1\n  2. b2\n- c\n\n1. un\n2. deux\n\n| A | B |\n|---|---|\n| 1 | **2** |\n\n> note\n\n```vb\nx = 1 < 2\n```\n\n---\n";
const html = renderMarkdown(md);
for (const frag of ['<h1 id="titre">Titre</h1>', '<p>Un <em>para</em> suite.</p>', '<h2 id="sous-titre">', "<ul><li>a</li><li>b<ol><li>b1</li><li>b2</li></ol></li><li>c</li></ul>", "<ol><li>un</li><li>deux</li></ol>", "<th>A</th>", "<td><strong>2</strong></td>", "<blockquote><p>note</p></blockquote>", "x = 1 &lt; 2", "<hr>"]) assert.ok(html.includes(frag), frag + "\n" + html);
assert.deepEqual(headingsOf(md), [{ id: "sous-titre", title: "Sous-titre" }]); assert.equal(titleOf(md), "Titre");

// ── contenu du guide : chapitres cohérents
const dir = new URL("../src/guide/", import.meta.url), files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
assert.ok(files.length >= 10, "au moins 10 chapitres"); const ids = files.map((f) => f.replace(/\.md$/, ""));
for (const f of files) {
  const text = readFileSync(new URL(f, dir), "utf8");
  assert.ok(/^# .+/.test(text), `${f} : commence par un titre`);
  assert.equal((text.match(/^```/gm) ?? []).length % 2, 0, `${f} : blocs de code fermés`);
  for (const m of text.matchAll(/\]\(#([^)]+)\)/g)) assert.ok(ids.includes(m[1]), `${f} : lien vers un chapitre inconnu « ${m[1]} »`);
  const out = renderMarkdown(text); assert.ok(!out.includes("<script") && !/href="javascript/i.test(out), `${f} : HTML sain`);
  text.replace(/```[\s\S]*?```/g, "").split("\n").forEach((l, n) => assert.equal((l.replace(/`[^`]*`/g, "").match(/\*\*/g) ?? []).length % 2, 0, `${f} ligne ${n + 1} : gras non fermé`));
  // pas de lignes de tableau mal formées : même nombre de colonnes que l'en-tête
  const lines = text.split("\n"); for (let i = 0; i < lines.length - 1; i++) if (lines[i].startsWith("|") && /^\|[\s:|-]+\|$/.test(lines[i + 1])) { const n = lines[i].split("|").length; for (let j = i + 2; j < lines.length && lines[j].startsWith("|"); j++) assert.equal(lines[j].split("|").length, n, `${f} ligne ${j + 1} : colonnes du tableau`); }
}
console.log("guide OK");
