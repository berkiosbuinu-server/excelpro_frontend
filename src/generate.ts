// Génération automatique, pour CHAQUE classeur hébergé, du code qui l'utilise : module VBA typé (vrais noms de tables et de colonnes),
// liste des routes, exemples JavaScript / Python. Aucun travail de développement côté entreprise : on copie ou on télécharge.
import { vbaModule } from "./snippets";
import { columnsOf, isDateType, isNumericType, type DataTable } from "./dataops";

/** Mots réservés ou noms de fonctions VBA : un paramètre qui porte ce nom reçoit un « _ » final (type -> type_). */
const VBA_RESERVED = new Set(("and as boolean byref byte byval call case const currency date declare dim do double each else elseif end enum eqv erase error event exit false for friend function get global gosub goto if imp implements in integer is let lib like long loop lset me mod new next not nothing null object on option optional or paramarray preserve private property public raiseevent redim rem resume return rset select set single static stop string sub then to true type typeof until variant wend while with withevents xor name time timer now abs asc chr format left right mid len val str instr replace trim ucase lcase cint clng cdbl cdate csng cstr cbool input output print open close seek write line array table range cells sheets").split(" "));
export const vbaIdent = (name: string) => (VBA_RESERVED.has(name.toLowerCase()) || /^bk_/i.test(name) ? `${name}_` : name);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const proc = (table: string) => cap(table);

/** Texte sans accents ni guillemets typographiques : un .bas est lu en ANSI par l'éditeur VBA (l'UTF-8 y devient illisible). */
export function toAscii(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[«»“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "?");
}

/** Signature découpée : une ligne VBA ne dépasse pas 1023 caractères et 24 continuations maximum. */
function signature(head: string, params: string[]): string {
  const lines: string[] = [];
  for (let i = 0; i < params.length; i += 3) lines.push(params.slice(i, i + 3).join(", "));
  return `${head}(${lines.join(", _\n        ")})`;
}

function tableVba(t: DataTable): string {
  const P = proc(t.table), cols = columnsOf(t), pk = t.primaryKey;
  const fields = cols.filter((c) => !c.readOnly || c.name === pk);
  const editable = fields.filter((c) => c.name !== pk);
  const q = (n: string) => `"${n}"`;
  const dictLine = (c: { name: string; type: string }) =>
    isNumericType(c.type) ? `    d(${q(c.name)}) = Val(BK_JsonField(txt, ${q(c.name)}))` : isDateType(c.type) ? `    d(${q(c.name)}) = BK_ToDate(BK_JsonField(txt, ${q(c.name)}))` : `    d(${q(c.name)}) = BK_JsonField(txt, ${q(c.name)})`;
  const out: string[] = [];
  out.push(`' ===== Table "${t.table}" : ${cols.length} colonne(s), cle = ${pk}${t.generatedPrimaryKey ? " (generee par le serveur)" : ""} =====`);
  out.push(`Public Sub ${P}_Charger(ByVal bk_cible As Range)`, `    BK_LoadTable "${t.table}", bk_cible`, "End Sub", "");
  // Ajouter
  // La cle d'abord (obligatoire quand elle n'est pas generee) : en VBA, un argument obligatoire ne peut pas suivre un argument facultatif.
  const addFields = [...fields.filter((c) => c.name === pk && !t.generatedPrimaryKey), ...fields.filter((c) => c.name !== pk)];
  const addParams = addFields.map((c) => (c.name === pk ? `${vbaIdent(c.name)} As Variant` : `Optional ${vbaIdent(c.name)} As Variant`));
  out.push(`' Ajoute une ligne ; renvoie la cle (${pk}) de la ligne creee.`);
  out.push(signature(`Public Function ${P}_Ajouter`, addParams) + " As String");
  out.push("    Dim bk_j As String");
  for (const c of addFields) out.push(c.name === pk ? `    bk_j = BK_Add(bk_j, ${q(c.name)}, ${vbaIdent(c.name)})` : `    If Not IsMissing(${vbaIdent(c.name)}) Then bk_j = BK_Add(bk_j, ${q(c.name)}, ${vbaIdent(c.name)})`);
  out.push(`    ${P}_Ajouter = BK_JsonField(BK_Request("POST", "/${t.table}", "{""values"":{" & bk_j & "}}"), ${q(pk)})`, "End Function", "");
  // Modifier
  out.push(`' Modifie une ligne (seuls les champs fournis changent). Sans bk_version : la version actuelle est lue puis utilisee.`);
  out.push(signature(`Public Sub ${P}_Modifier`, ["ByVal bk_cle As String", "Optional bk_version As Long = 0", ...editable.map((c) => `Optional ${vbaIdent(c.name)} As Variant`)]));
  out.push("    Dim bk_j As String");
  for (const c of editable) out.push(`    If Not IsMissing(${vbaIdent(c.name)}) Then bk_j = BK_Add(bk_j, ${q(c.name)}, ${vbaIdent(c.name)})`);
  out.push("    If Len(bk_j) = 0 Then Exit Sub", `    If bk_version = 0 Then bk_version = BK_Version("${t.table}", bk_cle)`,
    `    BK_Request "PUT", "/${t.table}/" & BK_UrlEncode(bk_cle), "{""expectedVersion"":" & bk_version & ",""values"":{" & bk_j & "}}"`, "End Sub", "");
  // Supprimer
  out.push(`Public Sub ${P}_Supprimer(ByVal bk_cle As String, Optional bk_version As Long = 0)`,
    `    If bk_version = 0 Then bk_version = BK_Version("${t.table}", bk_cle)`,
    `    BK_Request "DELETE", "/${t.table}/" & BK_UrlEncode(bk_cle), "{""expectedVersion"":" & bk_version & "}"`, "End Sub", "");
  // Lecture
  out.push(`Private Function ${P}_FromJson(ByVal txt As String) As Object`, '    Dim d As Object: Set d = CreateObject("Scripting.Dictionary")');
  for (const c of cols) out.push(dictLine(c));
  out.push('    d("_berkios_version") = CLng(Val(BK_JsonField(txt, "_berkios_version")))', `    Set ${P}_FromJson = d`, "End Function", "");
  out.push(`' Renvoie la ligne sous forme de dictionnaire : ${P}_Lire("1")("${cols[0]?.name ?? pk}")`);
  out.push(`Public Function ${P}_Lire(ByVal bk_cle As String) As Object`, `    Set ${P}_Lire = ${P}_FromJson(BK_Get("${t.table}", bk_cle))`, "End Function", "");
  out.push(`' Premiere ligne dont la colonne vaut la valeur donnee ; Nothing si aucune.`);
  out.push(`Public Function ${P}_Chercher(ByVal bk_colonne As String, ByVal bk_valeur As String) As Object`, "    Dim bk_t As String",
    `    bk_t = BK_Request("GET", "/${t.table}?limit=1&f." & BK_UrlEncode(bk_colonne) & "=" & BK_UrlEncode(bk_valeur), "")`,
    `    If InStr(bk_t, """total"":0") > 0 Then Set ${P}_Chercher = Nothing: Exit Function`, `    Set ${P}_Chercher = ${P}_FromJson(bk_t)`, "End Function", "");
  return out.join("\n");
}

/** Module VBA complet pour ce classeur : socle réseau + fonctions nommées d'après vos tables. */
export function vbaApp(base: string, key: string, tables: DataTable[]): string {
  const all = [
    "", "' ================== FONCTIONS GENEREES POUR VOS TABLES ==================",
    "' Les arguments portent le nom des colonnes : Vente_Ajouter numero:=\"T1\", ttc:=1160   (arguments nommes, ordre libre).",
    "' Un nom de colonne reserve par VBA recoit un _ final (type -> type_).", "",
    "' Charge toutes les tables dans des feuilles BK_<table> (a lancer a l'ouverture ou depuis un bouton).",
    "Public Sub Berkios_ChargerTout()", ...tables.map((t) => `    BK_LoadInSheet "${t.table}"`), "End Sub", "",
    ...tables.map(tableVba),
  ].join("\n");
  return toAscii(vbaModule(base, key).replace(/\s+$/, "") + "\n" + all + "\n").replace(/\r?\n/g, "\r\n");
}

/** Exemple d'utilisation propre au classeur (premières tables), à coller dans une macro. */
export function vbaUsage(tables: DataTable[]): string {
  const t = tables[0]; if (!t) return "";
  const P = proc(t.table), cols = columnsOf(t).filter((c) => !c.readOnly), pk = t.primaryKey, extra = cols.filter((c) => c.name !== pk).slice(0, 2);
  const sample = (c: { name: string; type: string }) => (isNumericType(c.type) ? "0" : isDateType(c.type) ? "Date" : `"exemple"`);
  const args = [...(t.generatedPrimaryKey ? [] : [`${vbaIdent(pk)}:="T1"`]), ...extra.map((c) => `${vbaIdent(c.name)}:=${sample(c)}`)].join(", ");
  return toAscii(`Sub Exemple()
    ' 1) Remplir une feuille avec la table "${t.table}"
    ${P}_Charger Sheets("Feuille1").Range("A1")

    ' 2) Ajouter une ligne
    Dim cle As String
    cle = ${P}_Ajouter(${args})

    ' 3) Lire, modifier, supprimer
    Dim ligne As Object
    Set ligne = ${P}_Lire(cle)
${extra[0] ? `    MsgBox ligne("${extra[0].name}")\n    ${P}_Modifier cle, ${vbaIdent(extra[0].name)}:=${sample(extra[0])}\n` : ""}    ${P}_Supprimer cle
End Sub`);
}

export type Route = { group: string; method: "GET" | "POST" | "PUT" | "DELETE"; path: string; title: string; body?: string };
const sampleJson = (t: DataTable): string => {
  const rows = columnsOf(t).filter((c) => !c.readOnly).slice(0, 4).map((c) => `"${c.name}": ${isNumericType(c.type) ? "0" : '"valeur"'}`);
  return `{ "values": { ${rows.join(", ")} } }`;
};
/** Toutes les routes disponibles pour ce classeur (relatives à l'adresse de base). */
export function routesOf(tables: DataTable[]): Route[] {
  const r: Route[] = [{ group: "Général", method: "GET", path: "", title: "Liste des tables et de leurs colonnes" }];
  for (const t of tables) {
    const p = `/${t.table}`;
    r.push(
      { group: t.table, method: "GET", path: `${p}?limit=50&offset=0&orderBy=${t.primaryKey}&direction=asc&f.<colonne>=<valeur>`, title: "Lister (pagination, tri, filtre exact)" },
      { group: t.table, method: "GET", path: `${p}?format=csv`, title: "Exporter toute la table en CSV (Excel / Power Query)" },
      { group: t.table, method: "GET", path: `${p}/{${t.primaryKey}}`, title: "Lire une ligne" },
      { group: t.table, method: "POST", path: p, title: "Ajouter une ligne", body: sampleJson(t) },
      { group: t.table, method: "PUT", path: `${p}/{${t.primaryKey}}`, title: "Modifier une ligne (version obligatoire)", body: `{ "expectedVersion": 1, "values": { … } }` },
      { group: t.table, method: "DELETE", path: `${p}/{${t.primaryKey}}`, title: "Supprimer une ligne (version obligatoire)", body: `{ "expectedVersion": 1 }` },
    );
  }
  return r;
}

export function jsExample(base: string, table: string, key: string): string {
  return `// Navigateur (page autorisée par l'hébergement) ou Node 18+ — avec votre clé d'API
const BASE = "${base}";
const KEY = "${key}";
const call = async (method, path, body) => {
  const res = await fetch(BASE + path, { method, headers: { Authorization: "Bearer " + KEY, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? res.status);
  return json.data;
};

const { data, total } = await call("GET", "/${encodeURIComponent(table)}?limit=10");
console.log(total, data);
// await call("POST", "/${encodeURIComponent(table)}", { values: { /* colonne: valeur */ } });`;
}

export function pythonExample(base: string, table: string, key: string): string {
  return `# Python 3, bibliothèque standard uniquement
import json, urllib.request

BASE = "${base}"
KEY = "${key}"

def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)["data"]

page = call("GET", "/${encodeURIComponent(table)}?limit=10")
print(page["total"], page["data"])
# call("POST", "/${encodeURIComponent(table)}", {"values": {}})   # colonne: valeur`;
}
