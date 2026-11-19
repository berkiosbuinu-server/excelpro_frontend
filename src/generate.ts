// Génération automatique, pour CHAQUE classeur hébergé, du code qui l'utilise : module VBA typé (vrais noms de tables et de colonnes),
// liste des routes, exemples JavaScript / Python. Aucun travail de développement côté entreprise : on copie ou on télécharge.
import { vbaModule } from "./snippets";
import { columnsOf, isDateType, isNumericType, type DataTable, type SavedItem } from "./dataops";

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
  out.push(`' Synchronisation : renvoie en JSON ce qui a change depuis le curseur (vide = tout) : { rows, deleted, cursor, hasMore }. Gardez le curseur recu pour l'appel suivant.`,
    `Public Function ${P}_Modifications(Optional ByVal bk_curseur As String = "") As String`, `    ${P}_Modifications = BK_Request("GET", "/${t.table}/_changes?limit=1000&cursor=" & BK_UrlEncode(bk_curseur), "")`, "End Function", "");
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


// ───────────── Requêtes et actions enregistrées ─────────────
const pascal = (name: string) => name.split(/[^a-z0-9]+/i).filter(Boolean).map(cap).join("");
/** Racine du classeur (l'adresse de base de l'API de données sans son « /data » final). */
export const rootOf = (base: string) => base.replace(/\/data\/?$/, "");
/** Paramètres d'un élément : obligatoires d'abord (VBA interdit un argument obligatoire après un facultatif). */
const orderedParams = (it: SavedItem) => it.params.map((p) => (it.kind === "procedure" ? { ...p, optional: p.required === false } : p)).sort((a, b) => Number(Boolean(a.optional)) - Number(Boolean(b.optional)));
const note = (it: SavedItem) => (it.def.description ? it.def.description.replace(/[\r\n]+/g, " ") : it.kind === "query" ? "Requete enregistree" : it.kind === "procedure" ? "Procedure enregistree" : "Action enregistree");

function authVba(tables: DataTable[]): string[] {
  const a = authTarget(tables); if (!a) return [];
  return ["", "' ================== CONNEXION DES UTILISATEURS ==================",
    `' Le mot de passe est verifie par le serveur (table ${a.table}, colonne ${a.secret}) : Excel ne le compare jamais et ne recoit jamais son empreinte.`,
    "' If BK_Authenticate(TextBoxNom.Value, TextBoxMotDePasse.Value) Then ... Else MsgBox BK_DernierMessage", "",
    "Public Function BK_Authenticate(ByVal nom As String, ByVal motDePasse As String) As Boolean",
    `    BK_Authenticate = BK_Verify("${a.table}", "${a.secret}", "${a.by}", nom, motDePasse)`, "End Function", "",
    "' Comme BK_Authenticate, mais ouvre une session (jeton qui expire) : les appels suivants se font avec l'identite de l'utilisateur.",
    "Public Function BK_Connexion(ByVal nom As String, ByVal motDePasse As String) As Boolean",
    `    BK_Connexion = BK_Login("${a.table}", "${a.secret}", "${a.by}", nom, motDePasse${a.active ? `, "${a.active}"` : ""})`, "End Function", ""];
}

function queryVba(it: SavedItem): string {
  const N = pascal(it.name), ps = orderedParams(it), url = `"~/q/${encodeURIComponent(it.name)}"`;
  const params = ps.map((p) => (p.optional ? `Optional ${vbaIdent(p.name)} As Variant` : `${vbaIdent(p.name)} As Variant`));
  const qsLines = ps.map((p) => (p.optional ? `    If Not IsMissing(${vbaIdent(p.name)}) Then bk_q = BK_Qs(bk_q, "${p.name}", ${vbaIdent(p.name)})` : `    bk_q = BK_Qs(bk_q, "${p.name}", ${vbaIdent(p.name)})`));
  const doc = ps.length ? `Parametres : ${ps.map((p) => p.name + (p.optional ? " (facultatif)" : "")).join(", ")}.` : "Sans parametre.";
  return [
    `' ===== Requete "${it.name}" : ${note(it)}. ${doc} =====`,
    `' Remplit une feuille a partir de la cellule bk_cible.`,
    signature(`Public Sub Requete_${N}`, ["ByVal bk_cible As Range", ...params]),
    '    Dim bk_q As String: bk_q = "?format=csv"', ...qsLines,
    `    BK_LoadPath ${url} & bk_q, bk_cible`, "End Sub", "",
    `' Renvoie la premiere valeur du resultat (ideal pour un total ou un nombre).`,
    signature(`Public Function Requete_${N}_Valeur`, params) + " As Variant",
    '    Dim bk_q As String: bk_q = "?format=csv"', ...qsLines,
    "    Dim bk_d As Variant", `    bk_d = BK_ParseCsv(BK_Request("GET", ${url} & bk_q, ""))`,
    "    If IsEmpty(bk_d) Then Exit Function", "    If UBound(bk_d, 1) < 2 Then Exit Function",
    `    If BK_LooksNumeric(CStr(bk_d(2, 1))) Then Requete_${N}_Valeur = Val(bk_d(2, 1)) Else Requete_${N}_Valeur = bk_d(2, 1)`, "End Function", "",
  ].join("\n");
}

function procedureVba(it: SavedItem): string {
  const N = pascal(it.name), ps = orderedParams(it), url = `"~/act/${encodeURIComponent(it.name)}"`;
  const params = [...ps.map((p) => (p.type === "list" ? `ByVal ${vbaIdent(p.name)} As Range` : p.optional ? `Optional ${vbaIdent(p.name)} As Variant` : `${vbaIdent(p.name)} As Variant`)), "Optional bk_idem As String = \"\""];
  const lists = ps.filter((p) => p.type === "list");
  const line = (p: (typeof ps)[number]) => {
    const v = vbaIdent(p.name);
    if (p.type === "list") return `    If Len(bk_p) > 0 Then bk_p = bk_p & ","\n    bk_p = bk_p & BK_JsonString("${p.name}") & ":" & BK_List(${v}, "${(p.fields ?? []).join("|")}")`;
    return p.optional ? `    If Not IsMissing(${v}) Then bk_p = BK_Add(bk_p, "${p.name}", ${v})` : `    bk_p = BK_Add(bk_p, "${p.name}", ${v})`;
  };
  return [
    `' ===== Procedure "${it.name}" : ${note(it)}. Plusieurs etapes executees par le serveur en UNE transaction : tout reussit, ou rien n'est ecrit. =====`,
    ...(lists.length ? [`' ${lists.map((l) => `${l.name} : plage de cellules, une ligne par element, colonnes dans l'ordre : ${(l.fields ?? []).join(", ")}`).join(" ; ")}.`] : []),
    `' bk_idem (facultatif) : un texte unique par operation ; si l'appel est renvoye (coupure reseau), le serveur ne refait rien et rend le meme resultat.`,
    `' Renvoie un JSON : lire un champ avec Berkios_Champ(resultat, "colonne"). En cas de refus (ex. stock insuffisant) l'erreur porte le message du serveur.`,
    signature(`Public Function Procedure_${N}`, params) + " As String",
    "    Dim bk_p As String, bk_b As String", ...ps.map(line),
    '    bk_b = "{""params"":{" & bk_p & "}"', '    If Len(bk_idem) > 0 Then bk_b = bk_b & ",""idempotencyKey"":" & BK_JsonString(bk_idem)', '    bk_b = bk_b & "}"',
    `    Procedure_${N} = BK_Request("POST", ${url}, bk_b)`, "End Function", "",
  ].join("\n");
}

const LIST_HELPER = [
  "' Convertit une plage (une ligne par element) en liste JSON ; bk_f = noms des champs separes par |, dans l'ordre des colonnes. Les lignes vides sont ignorees.",
  "Private Function BK_List(ByVal bk_r As Range, ByVal bk_f As String) As String",
  "    Dim bk_n() As String, bk_i As Long, bk_c As Long, bk_o As String, bk_row As String, bk_empty As Boolean",
  '    bk_n = Split(bk_f, "|")', "    For bk_i = 1 To bk_r.Rows.Count", '        bk_row = "": bk_empty = True', "        For bk_c = 0 To UBound(bk_n)",
  "            If bk_c + 1 <= bk_r.Columns.Count Then", "                If Len(CStr(bk_r.Cells(bk_i, bk_c + 1).Value)) > 0 Then bk_empty = False",
  "                bk_row = BK_Add(bk_row, bk_n(bk_c), bk_r.Cells(bk_i, bk_c + 1).Value)", "            End If", "        Next bk_c", "        If Not bk_empty Then",
  '            If Len(bk_o) > 0 Then bk_o = bk_o & ","', '            bk_o = bk_o & "{" & bk_row & "}"', "        End If", "    Next bk_i", '    BK_List = "[" & bk_o & "]"', "End Function", "",
].join("\n");

function actionVba(it: SavedItem): string {
  const N = pascal(it.name), ps = orderedParams(it), update = it.def.op !== "insert", url = `"~/act/${encodeURIComponent(it.name)}"`;
  const params = [...(update ? ["ByVal bk_cle As String"] : []), ...ps.map((p) => `${vbaIdent(p.name)} As Variant`), ...(update ? ["Optional bk_version As Long = 0"] : [])];
  const body = update ? `"{""key"":" & BK_JsonString(bk_cle) & ",""expectedVersion"":" & bk_version & ",""params"":{" & bk_p & "}}"` : `"{""params"":{" & bk_p & "}}"`;
  return [
    `' ===== Action "${it.name}" : ${note(it)}. ${update ? `Modifie la ligne de cle bk_cle (table ${it.def.table}).` : `Ajoute une ligne (table ${it.def.table}).`} =====`,
    `' Renvoie la ligne obtenue (JSON) : lire un champ avec Berkios_Champ(resultat, "colonne").`,
    signature(`Public Function Action_${N}`, params) + " As String",
    "    Dim bk_p As String", ...ps.map((p) => `    bk_p = BK_Add(bk_p, "${p.name}", ${vbaIdent(p.name)})`),
    ...(update ? [`    If bk_version = 0 Then bk_version = BK_Version("${it.def.table}", bk_cle)`] : []),
    `    Action_${N} = BK_Request("POST", ${url}, ${body})`, "End Function", "",
  ].join("\n");
}

/** Exemples (Power Query, curl, JavaScript, Python) d'une requête ou d'une action enregistrée. */
export function savedExample(lang: "pq" | "curl" | "js" | "py", base: string, it: SavedItem, key: string): string {
  const root = rootOf(base), path = `/${it.kind === "query" ? "q" : "act"}/${encodeURIComponent(it.name)}`, ps = it.params;
  const sample = (n: string) => `${n}=valeur`, qs = ps.map((p) => sample(p.name)).join("&");
  const proc = it.kind === "procedure";
  const pv = (p: (typeof ps)[number]) => (p.type === "list" ? `[{${(p.fields ?? []).map((f) => `"${f}":"valeur"`).join(",")}}]` : `"valeur"`);
  const body = proc ? `{"params":{${ps.map((p) => `"${p.name}":${pv(p)}`).join(",")}},"idempotencyKey":"operation-001"}` : it.def.op === "insert" ? `{"params":{${ps.map((p) => `"${p.name}":"valeur"`).join(",")}}}` : `{"key":"CLE_DE_LA_LIGNE","expectedVersion":1,"params":{${ps.map((p) => `"${p.name}":"valeur"`).join(",")}}}`;
  if (lang === "pq") {
    if (it.kind !== "query") return "// Power Query ne fait que lire : utilisez le VBA, curl, JavaScript ou Python pour une action.";
    const query = ["format = \"csv\"", ...ps.map((p) => `${p.name} = "valeur"`)].join(", ");
    return `let
    Source = Csv.Document(
        Web.Contents("${root}${path}", [Headers = [Authorization = "Bearer ${key}"], Query = [${query}]]),
        [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),
    Entetes = Table.PromoteHeaders(Source, [PromoteAllScalars = true])
in
    Entetes`;
  }
  if (lang === "curl") return it.kind === "query" ? `curl -H "Authorization: Bearer ${key}" "${root}${path}${qs ? "?" + qs : ""}"`
    : `curl -X POST -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" \\\n  -d '${body}' "${root}${path}"`;
  if (lang === "js") return `const res = await fetch("${root}${path}${it.kind === "query" && qs ? "?" + qs : ""}", {
  method: "${it.kind === "query" ? "GET" : "POST"}",
  headers: { Authorization: "Bearer ${key}"${it.kind !== "query" ? ', "Content-Type": "application/json"' : ""} },${it.kind !== "query" ? `\n  body: JSON.stringify(${body}),` : ""}
});
const json = await res.json();
if (!res.ok) throw new Error(json.error?.message ?? res.status);
console.log(json.data);`;
  return `import json, urllib.request

req = urllib.request.Request("${root}${path}${it.kind === "query" && qs ? "?" + qs : ""}", method="${it.kind === "query" ? "GET" : "POST"}",
    headers={"Authorization": "Bearer ${key}", "Content-Type": "application/json"}${it.kind !== "query" ? `,\n    data=json.dumps(${body}).encode()` : ""})
with urllib.request.urlopen(req) as r:
    print(json.load(r)["data"])`;
}

/** Table d'utilisateurs probable : celle qui a un champ protégé (mot de passe), de préférence nommée comme un compte. */
export function authTarget(tables: DataTable[]): { table: string; secret: string; by: string; active: string } | null {
  const withSecret = tables.filter((t) => t.fields.some((f) => f.secret));
  const t = withSecret.find((x) => /param|user|utilisateur|compte|login|membre|acces/i.test(x.table)) ?? withSecret[0];
  if (!t) return null;
  const open = t.fields.filter((f) => !f.secret);
  const by = open.find((f) => /^(nom|identifiant|login|username|user|email|mail)$/i.test(f.name))?.name ?? (t.generatedPrimaryKey ? open[0]?.name : t.primaryKey) ?? t.primaryKey;
  return { table: t.table, secret: t.fields.find((f) => f.secret)!.name, by, active: open.find((f) => /^(actif|active|enabled)$/i.test(f.name))?.name ?? "" };
}

/** Module VBA complet pour ce classeur : socle réseau + fonctions nommées d'après vos tables. */
export function vbaApp(base: string, key: string, tables: DataTable[], items: SavedItem[] = []): string {
  const valid = items.filter((i) => i.valid);
  const all = [
    "", "' ================== FONCTIONS GENEREES POUR VOS TABLES ==================",
    "' Les arguments portent le nom des colonnes : Vente_Ajouter numero:=\"T1\", ttc:=1160   (arguments nommes, ordre libre).",
    "' Un nom de colonne reserve par VBA recoit un _ final (type -> type_).", "",
    "' Charge toutes les tables dans des feuilles BK_<table> (a lancer a l'ouverture ou depuis un bouton).",
    "Public Sub Berkios_ChargerTout()", ...tables.map((t) => `    BK_LoadInSheet "${t.table}"`), "End Sub", "",
    ...tables.map(tableVba),
    ...(valid.length ? ["", "' ================== REQUETES ET ACTIONS ENREGISTREES ==================", ""] : []),
    ...valid.map((i) => (i.kind === "query" ? queryVba(i) : i.kind === "procedure" ? procedureVba(i) : actionVba(i))),
    ...(valid.some((i) => i.kind === "procedure" && i.params.some((p) => p.type === "list")) ? [LIST_HELPER] : []),
    ...authVba(tables),
    "' Lit un champ dans le resultat JSON d'une action.", "Public Function Berkios_Champ(ByVal bk_json As String, ByVal bk_champ As String) As String", "    Berkios_Champ = BK_JsonField(bk_json, bk_champ)", "End Function", "",
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

export type Route = { group: string; method: "GET" | "POST" | "PUT" | "DELETE"; path: string; title: string; body?: string; root?: boolean };
const sampleJson = (t: DataTable): string => {
  const rows = columnsOf(t).filter((c) => !c.readOnly).slice(0, 4).map((c) => `"${c.name}": ${isNumericType(c.type) ? "0" : '"valeur"'}`);
  return `{ "values": { ${rows.join(", ")} } }`;
};
/** Toutes les routes disponibles pour ce classeur (relatives à l'adresse de base). */
export function routesOf(tables: DataTable[], items: SavedItem[] = []): Route[] {
  const r: Route[] = [{ group: "Général", method: "GET", path: "", title: "Liste des tables et de leurs colonnes" }];
  const au = authTarget(tables);
  if (au) r.push(
    { group: "Authentification", root: true, method: "POST", path: "/verify-secret", title: "Vérifier un mot de passe sur le serveur (renvoie valid: true/false, jamais l'empreinte)", body: `{ "table": "${au.table}", "field": "${au.secret}", "by": "${au.by}", "key": "<nom>", "secret": "<mot de passe>" }` },
    { group: "Authentification", root: true, method: "POST", path: "/login", title: "Connecter un utilisateur : renvoie un jeton de session (bks1…) et ses données", body: `{ "table": "${au.table}", "field": "${au.secret}", "by": "${au.by}", "key": "<nom>", "secret": "<mot de passe>"${au.active ? `, "activeField": "${au.active}"` : ""}, "ttlMinutes": 480 }` },
    { group: "Authentification", root: true, method: "GET", path: "/session", title: "Vérifier la session en cours (Authorization: Bearer <jeton bks1…>)" },
    { group: "Authentification", root: true, method: "POST", path: "/logout", title: "Fermer la session en cours", body: "{}" },
    { group: "Authentification", root: true, method: "GET", path: "/can?table=<table>&op=read|create|update|delete  (ou ?query=<nom> / ?action=<nom>)", title: "L'utilisateur connecté a-t-il ce droit ? → { allowed }" });
  for (const t of tables) {
    const p = `/${t.table}`;
    r.push(
      { group: t.table, method: "GET", path: `${p}?limit=50&offset=0&orderBy=${t.primaryKey}&direction=asc&f.<colonne>=<valeur>`, title: "Lister (pagination, tri, filtre exact)" },
      { group: t.table, method: "GET", path: `${p}?format=csv`, title: "Exporter toute la table en CSV (Excel / Power Query)" },
      { group: t.table, method: "GET", path: `${p}/_changes?cursor=<curseur>&limit=1000`, title: "Modifications depuis la dernière synchronisation : lignes créées/modifiées, lignes supprimées et nouveau curseur (curseur vide = tout)" },
      { group: t.table, method: "GET", path: `${p}/{${t.primaryKey}}`, title: "Lire une ligne" },
      { group: t.table, method: "POST", path: p, title: "Ajouter une ligne", body: sampleJson(t) },
      { group: t.table, method: "PUT", path: `${p}/{${t.primaryKey}}`, title: "Modifier une ligne (version obligatoire)", body: `{ "expectedVersion": 1, "values": { … } }` },
      { group: t.table, method: "DELETE", path: `${p}/{${t.primaryKey}}`, title: "Supprimer une ligne (version obligatoire)", body: `{ "expectedVersion": 1 }` },
    );
  }
  for (const it of items.filter((i) => i.valid)) {
    const ps = it.params, group = "Requêtes enregistrées";
    if (it.kind === "query") r.push({ group, root: true, method: "GET", path: `/q/${it.name}${ps.length ? "?" + ps.map((p) => `${p.name}=<valeur>`).join("&") : ""}`, title: `${note(it)} — ajoutez ?format=csv pour Excel` });
    else if (it.kind === "procedure") r.push({ group, root: true, method: "POST", path: `/act/${it.name}`, title: `${note(it)} (procedure : plusieurs etapes en une transaction, tout ou rien)`,
      body: `{ "params": { ${ps.map((p) => `"${p.name}": ${p.type === "list" ? `[ { ${(p.fields ?? []).map((f) => `"${f}": …`).join(", ")} } ]` : "…"}`).join(", ")} }, "idempotencyKey": "<texte unique, facultatif>" }` });
    else r.push({ group, root: true, method: "POST", path: `/act/${it.name}`, title: `${note(it)} (${it.def.op === "insert" ? "ajoute une ligne" : "modifie une ligne"})`,
      body: `{ ${it.def.op === "insert" ? "" : '"key": "…", "expectedVersion": 1, '}"params": { ${ps.map((p) => `"${p.name}": …`).join(", ")} } }` });
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
