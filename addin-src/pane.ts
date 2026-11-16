// Volet du complément Excel — volontairement SANS React ni modules : compilé en ES5 pour fonctionner aussi dans
// les anciennes versions d'Excel (2016/2019, navigateur intégré IE11). Construit par addin-src/build.sh → public/addin.js.
declare const Excel: any;
declare const Office: any;
declare const window: any;
declare const document: any;

// ───────── Stockage et HTTP ─────────
var LS = {
  get: function (k: string): string | null { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
  set: function (k: string, v: string) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignoré */ } },
  del: function (k: string) { try { window.localStorage.removeItem(k); } catch (e) { /* ignoré */ } },
};
function esc(s: any): string { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function errMsg(e: any): string { return e && e.message ? e.message : "Erreur inconnue"; }
function apiBase(): string { return String(LS.get("excelpro_api") || window.EXCELPRO_API || "").replace(/\/+$/, ""); }

function http(method: string, url: string, headers: { [k: string]: string }, body?: string): Promise<{ status: number; json: any }> {
  return new Promise(function (resolve, reject) {
    var x = new XMLHttpRequest();
    x.open(method, url, true);
    for (var k in headers) if (headers.hasOwnProperty(k)) x.setRequestHeader(k, headers[k]);
    x.timeout = 120000;
    x.onload = function () { var j: any = null; try { j = JSON.parse(x.responseText); } catch (e) { /* corps vide */ } resolve({ status: x.status, json: j }); };
    x.onerror = x.ontimeout = function () { reject(new Error("Serveur injoignable. Vérifiez votre connexion et réessayez.")); };
    x.send(body);
  });
}

// ───────── ExcelPro (compte) ─────────
function pro(method: string, path: string, json?: any): Promise<any> {
  var h: { [k: string]: string } = { Accept: "application/json" };
  var t = LS.get("excelpro_token"); if (t) h.Authorization = "Bearer " + t;
  if (json !== undefined) h["Content-Type"] = "application/json";
  return http(method, apiBase() + path, h, json !== undefined ? JSON.stringify(json) : undefined).then(function (r) {
    if (r.status >= 400) { var d = r.json && r.json.detail; throw new Error(typeof d === "string" ? d : "Erreur " + r.status); }
    return r.json;
  });
}

// ───────── Serveur d'hébergement (jeton signé court) ─────────
var conn: { token: string; exp: number; url: string } | null = null;
function connection(force: boolean): Promise<{ token: string; exp: number; url: string }> {
  if (!force && conn && conn.exp - 60 > Date.now() / 1000) return Promise.resolve(conn);
  return pro("POST", "/hosting/token").then(function (t: any) { conn = { token: t.token, exp: t.expires_at, url: String(t.server_url).replace(/\/+$/, "") }; return conn; });
}
function call(method: string, path: string, json?: any, retried?: boolean): Promise<any> {
  return connection(!!retried).then(function (c) {
    var h: { [k: string]: string } = { Accept: "application/json", Authorization: "Bearer " + c.token };
    if (json !== undefined) h["Content-Type"] = "application/json";
    return http(method, c.url + "/admin/v1/excel-cloud" + path, h, json !== undefined ? JSON.stringify(json) : undefined).then(function (r) {
      if (r.status === 401 && !retried) return call(method, path, json, true);
      if (r.status >= 400) throw new Error((r.json && r.json.error && r.json.error.message) || "Requête refusée (code " + r.status + ").");
      return r.json && r.json.data;
    });
  });
}
var enc = encodeURIComponent;
function listAll(importId: string, table: string): Promise<any[]> {
  var out: any[] = [];
  function page(offset: number): Promise<any[]> {
    return call("GET", "/imports/" + importId + "/data/" + enc(table) + "?limit=500&offset=" + offset + "&orderBy=_berkios_created_at").then(function (r: any) {
      out = out.concat(r.data);
      return r.data.length && offset + 500 < r.total ? page(offset + 500) : out;
    });
  }
  return page(0);
}

// ───────── Feuille Excel ─────────
function sheetName(t: string) { return ("BK_" + t).slice(0, 31); }
function snapName(t: string) { return ("_BKS_" + t).slice(0, 31); }

async function pull(importId: string, t: DataTable): Promise<number> {
  var rows = await listAll(importId, t.table), sh = buildSheet(t, rows), n = sh.header.length;
  await Excel.run(async function (ctx: any) {
    var wb = ctx.workbook;
    var main = wb.worksheets.getItemOrNullObject(sheetName(t.table)), snap = wb.worksheets.getItemOrNullObject(snapName(t.table));
    await ctx.sync();
    var ws = main.isNullObject ? wb.worksheets.add(sheetName(t.table)) : main;
    var ss = snap.isNullObject ? wb.worksheets.add(snapName(t.table)) : snap;
    ws.getRange().clear(); ss.getRange().clear();
    var fmt = function (sheet: any, rowsN: number, extra: number) {
      var line: string[] = sh.types.map(function (ty) { return isNumericType(ty) ? "General" : "@"; });
      for (var i = 0; i < extra; i++) line.push("@");
      var f: string[][] = []; for (var r = 0; r < rowsN; r++) f.push(line.slice());
      sheet.getRangeByIndexes(0, 0, rowsN, n + extra).numberFormat = f;
    };
    fmt(ws, sh.values.length + 1, 0);
    ws.getRangeByIndexes(0, 0, 1, n).values = [sh.header];
    if (sh.values.length) ws.getRangeByIndexes(1, 0, sh.values.length, n).values = sh.values;
    ws.getRangeByIndexes(0, 0, 1, n).format.font.bold = true;
    ws.getRangeByIndexes(0, 0, 1, n).format.fill.color = "#E3F4EA";
    if (t.generatedPrimaryKey) ws.getRangeByIndexes(0, 0, 1, 1).format.fill.color = "#DDDDDD";
    try { ws.freezePanes.freezeRows(1); } catch (e) { /* ExcelApi ancien */ }
    ws.getUsedRange().format.autofitColumns();
    fmt(ss, sh.values.length + 2, 1);
    ss.getRangeByIndexes(0, 0, 1, 4).values = [["importId", importId, "table", t.table]];
    ss.getRangeByIndexes(1, 0, 1, n + 1).values = [sh.header.concat([VERSION_COL])];
    if (sh.values.length) ss.getRangeByIndexes(2, 0, sh.values.length, n + 1).values = sh.values.map(function (r, i) { return (r as any[]).concat([sh.versions[i]]); });
    ss.visibility = "Hidden";
    ws.activate();
    await ctx.sync();
  });
  return rows.length;
}

async function readChanges(importId: string, t: DataTable, withDeletes: boolean) {
  var cols = columnsOf(t), n = cols.length;
  var res: { cur: any[][]; snapVals: any[][] } = await Excel.run(async function (ctx: any) {
    var ws = ctx.workbook.worksheets.getItemOrNullObject(sheetName(t.table)), ss = ctx.workbook.worksheets.getItemOrNullObject(snapName(t.table));
    await ctx.sync();
    if (ws.isNullObject || ss.isNullObject) throw new Error("Cette table n'a pas encore été chargée dans ce classeur : cliquez d'abord sur « Charger depuis le serveur ».");
    var a = ws.getUsedRange(true); a.load("values"); var b = ss.getUsedRange(true); b.load("values");
    await ctx.sync();
    return { cur: a.values, snapVals: b.values };
  });
  var snapVals = res.snapVals, cur = res.cur;
  if (String(snapVals[0] && snapVals[0][1]) !== importId || String(snapVals[0] && snapVals[0][3]) !== t.table) throw new Error("La feuille provient d'une autre importation : rechargez-la depuis le serveur.");
  var expected = cols.map(function (c) { return c.name; });
  var header = (cur[0] || []).slice(0, n).map(String);
  if (header.join("|") !== expected.join("|")) throw new Error("Les en-têtes de la feuille ont été modifiés. Ne renommez, ne déplacez et ne supprimez aucune colonne (rechargez pour repartir d'une feuille propre).");
  var snapRows = snapVals.slice(2);
  var snapshot: Sheet = {
    header: expected, types: cols.map(function (c) { return c.type; }),
    values: snapRows.map(function (r) { return r.slice(0, n); }),
    versions: snapRows.map(function (r) { return String(r[n] == null ? "1" : r[n]); }),
  };
  return diffSheet(t, snapshot, cur.slice(1).map(function (r) { return r.slice(0, n); }), { withDeletes: withDeletes });
}
function describeChange(c: Change): string { return c.kind === "insert" ? "➕ ligne " + c.line : c.kind === "update" ? "✏️ " + c.key + " (" + Object.keys(c.values).join(", ") + ")" : "🗑️ " + c.key; }

// ───────── Interface ─────────
var S: { screen: string; imports: any[]; importId: string; tables: DataTable[]; tableName: string; withDeletes: boolean; preview: { changes: Change[]; errors: string[] } | null; busy: string; error: string; info: string } =
  { screen: "boot", imports: [], importId: "", tables: [], tableName: "", withDeletes: false, preview: null, busy: "", error: "", info: "" };
function $(id: string): any { return document.getElementById(id); }
function curTable(): DataTable | null { for (var i = 0; i < S.tables.length; i++) if (S.tables[i].table === S.tableName) return S.tables[i]; return null; }
function msgs(): string { return (S.error ? '<p class="err" role="alert">' + esc(S.error) + "</p>" : "") + (S.info ? '<p class="ok">' + esc(S.info) + "</p>" : ""); }

function render() {
  var root = $("root"), h = "";
  if (S.screen === "noexcel") h = "<h2>ExcelPro — Hébergement</h2><p class=\"warn\">Ce volet fonctionne uniquement à l'intérieur d'Excel.</p>";
  else if (S.screen === "boot") h = '<p class="muted">Chargement…</p>';
  else if (S.screen === "config") h = "<h2>Configuration</h2><p class=\"muted\">Adresse du service ExcelPro (fournie par votre administrateur).</p>" + msgs() +
    '<label>Adresse<input id="api" type="url" placeholder="https://api.exemple.com" value="' + esc(apiBase()) + '"></label><button id="save" class="primary">Enregistrer</button>';
  else if (S.screen === "login") h = "<h2>Connexion ExcelPro</h2><p class=\"muted\">Utilisez le compte avec lequel vous avez hébergé votre classeur.</p>" + msgs() +
    '<label>E-mail<input id="email" type="email" autocomplete="username"></label><label>Mot de passe<input id="pw" type="password" autocomplete="current-password"></label>' +
    '<button id="login" class="primary"' + (S.busy ? " disabled" : "") + ">" + (S.busy ? "Connexion…" : "Se connecter") + '</button> <button id="cfg">Adresse du service</button>';
  else {
    var t = curTable(), dis = S.busy ? " disabled" : "";
    h = '<div class="row"><h2>Hébergement</h2><button id="logout">Déconnexion</button></div>' + msgs();
    if (!S.imports.length) h += '<p class="muted">Aucune importation terminée. Publiez d\'abord votre classeur depuis ExcelPro → Hébergement.</p>';
    else {
      h += "<label>Classeur hébergé<select id=\"imp\">" + S.imports.map(function (r) { return '<option value="' + esc(r.id) + '"' + (r.id === S.importId ? " selected" : "") + ">" + esc(r.fileName) + "</option>"; }).join("") + "</select></label>";
      h += "<label>Table<select id=\"tab\">" + S.tables.map(function (x) { return '<option value="' + esc(x.table) + '"' + (x.table === S.tableName ? " selected" : "") + ">" + esc(x.table) + "</option>"; }).join("") + "</select></label>";
      if (t) { var sec = t.fields.filter(function (f) { return f.secret; }).map(function (f) { return f.name; }); if (sec.length) h += '<p class="muted">🔒 Colonnes protégées non affichées : ' + esc(sec.join(", ")) + ". Modifiez-les depuis ExcelPro.</p>"; }
      h += '<button id="pull" class="primary"' + (t && !S.busy ? "" : " disabled") + ">" + (S.busy === "pull" ? "Chargement…" : "⬇ Charger depuis le serveur") + "</button><hr>";
      h += '<p class="muted">Modifiez, ajoutez ou supprimez des lignes dans la feuille <b>' + esc(t ? sheetName(t.table) : "") + "</b>, puis envoyez.</p>";
      h += '<label class="chk"><input id="del" type="checkbox"' + (S.withDeletes ? " checked" : "") + '> Supprimer aussi du serveur les lignes retirées de la feuille</label>';
      h += '<button id="diff"' + (t && !S.busy ? "" : " disabled") + ">" + (S.busy === "diff" ? "Analyse…" : "Voir mes modifications") + "</button>";
      if (S.preview) {
        h += '<div class="card">' + S.preview.errors.map(function (e) { return '<p class="err">' + esc(e) + "</p>"; }).join("");
        if (S.preview.changes.length) {
          h += "<b>" + S.preview.changes.length + " modification(s) :</b><ul>" + S.preview.changes.slice(0, 200).map(function (c) { return "<li>" + esc(describeChange(c)) + "</li>"; }).join("") + "</ul>";
          h += '<button id="push" class="primary"' + (S.busy || S.preview.errors.length ? " disabled" : "") + ">" + (S.busy === "push" ? "Envoi…" : "⬆ Envoyer au serveur") + "</button>";
          if (S.preview.errors.length) h += '<p class="warn">Corrigez les erreurs ci-dessus avant d\'envoyer.</p>';
        }
        h += "</div>";
      }
    }
    void dis;
  }
  root.innerHTML = h; bind();
}

function run(key: string, fn: () => Promise<void>) {
  S.busy = key; S.error = ""; S.info = ""; render();
  fn().then(function () { S.busy = ""; render(); }, function (e) { S.busy = ""; S.error = errMsg(e); render(); });
}
async function loadImports() {
  var all: any[] = await call("GET", "/imports");
  S.imports = all.filter(function (r) { return r.state === "completed"; });
  if (S.imports.length && !S.importId) S.importId = S.imports[0].id;
  await loadTables();
}
async function loadTables() {
  S.tables = []; S.tableName = ""; S.preview = null;
  if (!S.importId) return;
  var s: any = await call("GET", "/imports/" + S.importId + "/data");
  S.tables = s.tables; S.tableName = S.tables.length ? S.tables[0].table : "";
}
function enter() { S.screen = "main"; run("init", loadImports); }

function bind() {
  var b = function (id: string, fn: () => void) { var el = $(id); if (el) el.onclick = fn; };
  b("save", function () { var v = String($("api").value).trim().replace(/\/+$/, ""); if (!/^https:\/\//.test(v)) { S.error = "L'adresse doit commencer par https://"; render(); return; } LS.set("excelpro_api", v); S.error = ""; S.screen = LS.get("excelpro_token") ? "main" : "login"; if (S.screen === "main") enter(); else render(); });
  b("cfg", function () { S.screen = "config"; S.error = ""; render(); });
  b("login", function () {
    var email = String($("email").value).trim(), pw = String($("pw").value);
    run("login", async function () { var r = await pro("POST", "/auth/login", { email: email, password: pw }); LS.set("excelpro_token", r.token); conn = null; S.screen = "main"; await loadImports(); });
  });
  b("logout", function () { LS.del("excelpro_token"); conn = null; S.imports = []; S.importId = ""; S.tables = []; S.preview = null; S.screen = "login"; render(); });
  var imp = $("imp"); if (imp) imp.onchange = function () { S.importId = imp.value; run("tables", loadTables); };
  var tab = $("tab"); if (tab) tab.onchange = function () { S.tableName = tab.value; S.preview = null; render(); };
  var del = $("del"); if (del) del.onchange = function () { S.withDeletes = !!del.checked; S.preview = null; render(); };
  b("pull", function () { var t = curTable(); if (!t) return; run("pull", async function () { var n = await pull(S.importId, t!); S.preview = null; S.info = n + " ligne(s) chargée(s) dans la feuille " + sheetName(t!.table) + "."; }); });
  b("diff", function () { var t = curTable(); if (!t) return; run("diff", async function () { var d = await readChanges(S.importId, t!, S.withDeletes); S.preview = d; if (!d.changes.length && !d.errors.length) S.info = "Aucune modification à envoyer."; }); });
  b("push", function () {
    var t = curTable(), p = S.preview; if (!t || !p) return;
    run("push", async function () {
      var fails: string[] = [], ok = 0, base = "/imports/" + S.importId + "/data/" + enc(t!.table);
      for (var i = 0; i < p!.changes.length; i++) {
        var c = p!.changes[i];
        try {
          if (c.kind === "insert") await call("POST", base, { values: c.values });
          else if (c.kind === "update") await call("PUT", base + "/" + enc(c.key), { expectedVersion: c.expectedVersion, values: c.values });
          else await call("DELETE", base + "/" + enc(c.key), { expectedVersion: c.expectedVersion });
          ok++;
        } catch (e) { fails.push(describeChange(c) + " : " + errMsg(e)); }
      }
      await pull(S.importId, t!); S.preview = null;
      S.info = ok + " modification(s) envoyée(s). La feuille a été rechargée.";
      if (fails.length) S.error = fails.length + " échec(s) :\n" + fails.slice(0, 10).join("\n");
    });
  });
}

function start(inExcel: boolean) {
  if (!inExcel) { S.screen = "noexcel"; render(); return; }
  if (!apiBase()) { S.screen = "config"; render(); return; }
  if (!LS.get("excelpro_token")) { S.screen = "login"; render(); return; }
  pro("GET", "/auth/me").then(enter, function () { LS.del("excelpro_token"); S.screen = "login"; render(); });
}
var started = false;
function go(inExcel: boolean) { if (!started) { started = true; start(inExcel); } }
if (typeof Office !== "undefined" && Office.onReady) {
  Office.onReady(function (info: any) { go(!!info && (info.host === "Excel" || typeof Excel !== "undefined")); });
  window.setTimeout(function () { go(typeof Excel !== "undefined"); }, 6000);
} else window.setTimeout(function () { go(false); }, 1500);
