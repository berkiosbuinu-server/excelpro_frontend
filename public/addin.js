"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var VERSION_COL = "_berkios_version";
var NUM_RE = /^(numeric|decimal|int|integer|bigint|smallint|double|real|float)/i;
var DATE_RE = /^(date|timestamp)/i;
var isNumericType = function (t) { return NUM_RE.test(t.trim()); };
var isDateType = function (t) { return DATE_RE.test(t.trim()); };
var isBoolType = function (t) { return /^bool/i.test(t.trim()); };
function columnsOf(t) {
    var cols = t.fields.filter(function (f) { return !f.secret; }).map(function (f) { return ({ name: f.name, type: f.type, readOnly: false }); });
    return t.generatedPrimaryKey ? __spreadArray([{ name: t.primaryKey, type: "uuid", readOnly: true }], cols, true) : cols;
}
function serialToIso(n) {
    var ms = Math.round((n - 25569) * 86400000), d = new Date(ms), iso = d.toISOString();
    return Number.isInteger(n) ? iso.slice(0, 10) : iso.slice(0, 19).replace("T", " ");
}
function toCell(v, type) {
    if (v === null || v === undefined)
        return "";
    if (isNumericType(type) && typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)))
        return Number(v);
    if (isBoolType(type))
        return v === true || v === "true" || v === "t";
    if (isDateType(type) && typeof v === "string")
        return v.slice(0, /^timestamp/i.test(type) ? 19 : 10).replace("T", " ");
    return v;
}
function fromCell(c, type) {
    if (c === null || c === undefined || c === "")
        return null;
    if (typeof c === "number") {
        if (isDateType(type))
            return serialToIso(c);
        return c;
    }
    if (typeof c === "boolean")
        return c;
    var s = String(c);
    return s.trim() === "" ? null : s;
}
var same = function (a, b, type) {
    if (a === b)
        return true;
    if (a === null || b === null)
        return false;
    if (isNumericType(type))
        return Number(a) === Number(b);
    return String(a) === String(b);
};
function buildSheet(t, rows) {
    var cols = columnsOf(t);
    return {
        header: cols.map(function (c) { return c.name; }), types: cols.map(function (c) { return c.type; }),
        values: rows.map(function (r) { return cols.map(function (c) { return toCell(r[c.name], c.type); }); }),
        versions: rows.map(function (r) { var _a; return String((_a = r[VERSION_COL]) !== null && _a !== void 0 ? _a : "1"); }),
    };
}
function diffSheet(t, snapshot, current, _a) {
    var _b = _a === void 0 ? {} : _a, _c = _b.withDeletes, withDeletes = _c === void 0 ? false : _c;
    var cols = columnsOf(t), keyIdx = cols.findIndex(function (c) { return c.name === t.primaryKey; });
    var errors = [];
    if (keyIdx < 0)
        return { changes: [], errors: ["Colonne de clé introuvable dans la feuille."] };
    var snap = new Map();
    snapshot.values.forEach(function (r, i) { return snap.set(String(r[keyIdx]), { row: r, version: Number(snapshot.versions[i]) || 1 }); });
    var seen = new Set(), changes = [];
    current.forEach(function (row, i) {
        var line = i + 2;
        if (row.every(function (c) { return c === "" || c === null || c === undefined; }))
            return;
        var keyCell = row[keyIdx], key = keyCell === "" || keyCell == null ? "" : String(keyCell);
        var writable = cols.filter(function (c) { return !c.readOnly; });
        var all = function () { return Object.fromEntries(writable.map(function (c) { return [c.name, fromCell(row[cols.indexOf(c)], c.type)]; })); };
        if (!key && !t.generatedPrimaryKey) {
            errors.push("Ligne ".concat(line, " : la cl\u00E9 \u00AB ").concat(t.primaryKey, " \u00BB est vide."));
            return;
        }
        if (key && seen.has(key)) {
            errors.push("Ligne ".concat(line, " : la cl\u00E9 \u00AB ").concat(key, " \u00BB appara\u00EEt deux fois."));
            return;
        }
        if (key)
            seen.add(key);
        var old = key ? snap.get(key) : undefined;
        if (!old) {
            changes.push({ kind: "insert", line: line, values: Object.fromEntries(Object.entries(all()).filter(function (_a) {
                    var v = _a[1];
                    return v !== null;
                })) });
            return;
        }
        var diff = {};
        for (var _i = 0, writable_1 = writable; _i < writable_1.length; _i++) {
            var c = writable_1[_i];
            if (c.name === t.primaryKey)
                continue;
            var now = fromCell(row[cols.indexOf(c)], c.type), before = fromCell(old.row[cols.indexOf(c)], c.type);
            if (!same(before, now, c.type))
                diff[c.name] = now;
        }
        if (Object.keys(diff).length)
            changes.push({ kind: "update", line: line, key: key, expectedVersion: old.version, values: diff });
    });
    if (withDeletes)
        snap.forEach(function (o, key) { if (!seen.has(key))
            changes.push({ kind: "delete", key: key, expectedVersion: o.version }); });
    return { changes: changes, errors: errors };
}
var LS = {
    get: function (k) { try {
        return window.localStorage.getItem(k);
    }
    catch (e) {
        return null;
    } },
    set: function (k, v) { try {
        window.localStorage.setItem(k, v);
    }
    catch (e) { } },
    del: function (k) { try {
        window.localStorage.removeItem(k);
    }
    catch (e) { } },
};
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function errMsg(e) { return e && e.message ? e.message : "Erreur inconnue"; }
function apiBase() { return String(LS.get("excelpro_api") || window.EXCELPRO_API || "").replace(/\/+$/, ""); }
function http(method, url, headers, body) {
    return new Promise(function (resolve, reject) {
        var x = new XMLHttpRequest();
        x.open(method, url, true);
        for (var k in headers)
            if (headers.hasOwnProperty(k))
                x.setRequestHeader(k, headers[k]);
        x.timeout = 120000;
        x.onload = function () { var j = null; try {
            j = JSON.parse(x.responseText);
        }
        catch (e) { } resolve({ status: x.status, json: j }); };
        x.onerror = x.ontimeout = function () { reject(new Error("Serveur injoignable. Vérifiez votre connexion et réessayez.")); };
        x.send(body);
    });
}
function pro(method, path, json) {
    var h = { Accept: "application/json" };
    var t = LS.get("excelpro_token");
    if (t)
        h.Authorization = "Bearer " + t;
    if (json !== undefined)
        h["Content-Type"] = "application/json";
    return http(method, apiBase() + path, h, json !== undefined ? JSON.stringify(json) : undefined).then(function (r) {
        if (r.status >= 400) {
            var d = r.json && r.json.detail;
            throw new Error(typeof d === "string" ? d : "Erreur " + r.status);
        }
        return r.json;
    });
}
var conn = null;
function connection(force) {
    if (!force && conn && conn.exp - 60 > Date.now() / 1000)
        return Promise.resolve(conn);
    return pro("POST", "/hosting/token").then(function (t) { conn = { token: t.token, exp: t.expires_at, url: String(t.server_url).replace(/\/+$/, "") }; return conn; });
}
function call(method, path, json, retried) {
    return connection(!!retried).then(function (c) {
        var h = { Accept: "application/json", Authorization: "Bearer " + c.token };
        if (json !== undefined)
            h["Content-Type"] = "application/json";
        return http(method, c.url + "/admin/v1/excel-cloud" + path, h, json !== undefined ? JSON.stringify(json) : undefined).then(function (r) {
            if (r.status === 401 && !retried)
                return call(method, path, json, true);
            if (r.status >= 400)
                throw new Error((r.json && r.json.error && r.json.error.message) || "Requête refusée (code " + r.status + ").");
            return r.json && r.json.data;
        });
    });
}
var enc = encodeURIComponent;
function listAll(importId, table) {
    var out = [];
    function page(offset) {
        return call("GET", "/imports/" + importId + "/data/" + enc(table) + "?limit=500&offset=" + offset + "&orderBy=_berkios_created_at").then(function (r) {
            out = out.concat(r.data);
            return r.data.length && offset + 500 < r.total ? page(offset + 500) : out;
        });
    }
    return page(0);
}
function colLetter(n) { var s = ""; for (var i = n; i > 0; i = Math.floor((i - 1) / 26))
    s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; }
function addr(row, col, rows, cols) { return colLetter(col + 1) + (row + 1) + ":" + colLetter(col + cols) + (row + rows); }
function sheetsExist(ctx, names) {
    return __awaiter(this, void 0, void 0, function () {
        var items, have, i, out, j;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    items = ctx.workbook.worksheets;
                    items.load("items/name");
                    return [4, ctx.sync()];
                case 1:
                    _a.sent();
                    have = {};
                    for (i = 0; i < items.items.length; i++)
                        have[String(items.items[i].name).toLowerCase()] = true;
                    out = {};
                    for (j = 0; j < names.length; j++)
                        out[names[j].toLowerCase()] = !!have[names[j].toLowerCase()];
                    return [2, out];
            }
        });
    });
}
function sheetName(t) { return ("BK_" + t).slice(0, 31); }
function snapName(t) { return ("_BKS_" + t).slice(0, 31); }
function pull(importId, t) {
    return __awaiter(this, void 0, void 0, function () {
        var rows, sh, n;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4, listAll(importId, t.table)];
                case 1:
                    rows = _a.sent(), sh = buildSheet(t, rows), n = sh.header.length;
                    return [4, Excel.run(function (ctx) {
                            return __awaiter(this, void 0, void 0, function () {
                                var wb, ex, ws, ss, fmt;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            wb = ctx.workbook;
                                            return [4, sheetsExist(ctx, [sheetName(t.table), snapName(t.table)])];
                                        case 1:
                                            ex = _a.sent();
                                            ws = ex[sheetName(t.table).toLowerCase()] ? wb.worksheets.getItem(sheetName(t.table)) : wb.worksheets.add(sheetName(t.table));
                                            ss = ex[snapName(t.table).toLowerCase()] ? wb.worksheets.getItem(snapName(t.table)) : wb.worksheets.add(snapName(t.table));
                                            ws.getRange().clear();
                                            ss.getRange().clear();
                                            fmt = function (sheet, rowsN, extra) {
                                                var line = sh.types.map(function (ty) { return isNumericType(ty) ? "General" : "@"; });
                                                for (var i = 0; i < extra; i++)
                                                    line.push("@");
                                                var f = [];
                                                for (var r = 0; r < rowsN; r++)
                                                    f.push(line.slice());
                                                sheet.getRange(addr(0, 0, rowsN, n + extra)).numberFormat = f;
                                            };
                                            fmt(ws, sh.values.length + 1, 0);
                                            ws.getRange(addr(0, 0, 1, n)).values = [sh.header];
                                            if (sh.values.length)
                                                ws.getRange(addr(1, 0, sh.values.length, n)).values = sh.values;
                                            ws.getRange(addr(0, 0, 1, n)).format.font.bold = true;
                                            ws.getRange(addr(0, 0, 1, n)).format.fill.color = "#E3F4EA";
                                            if (t.generatedPrimaryKey)
                                                ws.getRange(addr(0, 0, 1, 1)).format.fill.color = "#DDDDDD";
                                            try {
                                                ws.freezePanes.freezeRows(1);
                                            }
                                            catch (e) { }
                                            try {
                                                ws.getUsedRange().format.autofitColumns();
                                            }
                                            catch (e) { }
                                            fmt(ss, sh.values.length + 2, 1);
                                            ss.getRange(addr(0, 0, 1, 4)).values = [["importId", importId, "table", t.table]];
                                            ss.getRange(addr(1, 0, 1, n + 1)).values = [sh.header.concat([VERSION_COL])];
                                            if (sh.values.length)
                                                ss.getRange(addr(2, 0, sh.values.length, n + 1)).values = sh.values.map(function (r, i) { return r.concat([sh.versions[i]]); });
                                            ss.visibility = "Hidden";
                                            ws.activate();
                                            return [4, ctx.sync()];
                                        case 2:
                                            _a.sent();
                                            return [2];
                                    }
                                });
                            });
                        })];
                case 2:
                    _a.sent();
                    return [2, rows.length];
            }
        });
    });
}
function readChanges(importId, t, withDeletes) {
    return __awaiter(this, void 0, void 0, function () {
        var cols, n, res, snapVals, cur, expected, header, snapRows, snapshot;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    cols = columnsOf(t), n = cols.length;
                    return [4, Excel.run(function (ctx) {
                            return __awaiter(this, void 0, void 0, function () {
                                var ex, ws, ss, a, b;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4, sheetsExist(ctx, [sheetName(t.table), snapName(t.table)])];
                                        case 1:
                                            ex = _a.sent();
                                            if (!ex[sheetName(t.table).toLowerCase()] || !ex[snapName(t.table).toLowerCase()])
                                                throw new Error("Cette table n'a pas encore été chargée dans ce classeur : cliquez d'abord sur « Charger depuis le serveur ».");
                                            ws = ctx.workbook.worksheets.getItem(sheetName(t.table)), ss = ctx.workbook.worksheets.getItem(snapName(t.table));
                                            a = ws.getUsedRange();
                                            a.load("values");
                                            b = ss.getUsedRange();
                                            b.load("values");
                                            return [4, ctx.sync()];
                                        case 2:
                                            _a.sent();
                                            return [2, { cur: a.values, snapVals: b.values }];
                                    }
                                });
                            });
                        })];
                case 1:
                    res = _a.sent();
                    snapVals = res.snapVals, cur = res.cur;
                    if (String(snapVals[0] && snapVals[0][1]) !== importId || String(snapVals[0] && snapVals[0][3]) !== t.table)
                        throw new Error("La feuille provient d'une autre importation : rechargez-la depuis le serveur.");
                    expected = cols.map(function (c) { return c.name; });
                    header = (cur[0] || []).slice(0, n).map(String);
                    if (header.join("|") !== expected.join("|"))
                        throw new Error("Les en-têtes de la feuille ont été modifiés. Ne renommez, ne déplacez et ne supprimez aucune colonne (rechargez pour repartir d'une feuille propre).");
                    snapRows = snapVals.slice(2);
                    snapshot = {
                        header: expected, types: cols.map(function (c) { return c.type; }),
                        values: snapRows.map(function (r) { return r.slice(0, n); }),
                        versions: snapRows.map(function (r) { return String(r[n] == null ? "1" : r[n]); }),
                    };
                    return [2, diffSheet(t, snapshot, cur.slice(1).map(function (r) { return r.slice(0, n); }), { withDeletes: withDeletes })];
            }
        });
    });
}
function describeChange(c) { return c.kind === "insert" ? "➕ ligne " + c.line : c.kind === "update" ? "✏️ " + c.key + " (" + Object.keys(c.values).join(", ") + ")" : "🗑️ " + c.key; }
var S = { screen: "boot", imports: [], importId: "", tables: [], tableName: "", withDeletes: false, preview: null, busy: "", error: "", info: "" };
function $(id) { return document.getElementById(id); }
function curTable() { for (var i = 0; i < S.tables.length; i++)
    if (S.tables[i].table === S.tableName)
        return S.tables[i]; return null; }
function msgs() { return (S.error ? '<p class="err" role="alert">' + esc(S.error) + "</p>" : "") + (S.info ? '<p class="ok">' + esc(S.info) + "</p>" : ""); }
function render() {
    var root = $("root"), h = "";
    if (S.screen === "noexcel")
        h = "<h2>ExcelPro — Hébergement</h2><p class=\"warn\">Ce volet fonctionne uniquement à l'intérieur d'Excel.</p>";
    else if (S.screen === "boot")
        h = '<p class="muted">Chargement…</p>';
    else if (S.screen === "config")
        h = "<h2>Configuration</h2><p class=\"muted\">Adresse du service ExcelPro (fournie par votre administrateur).</p>" + msgs() +
            '<label>Adresse<input id="api" type="url" placeholder="https://api.exemple.com" value="' + esc(apiBase()) + '"></label><button id="save" class="primary">Enregistrer</button>';
    else if (S.screen === "login")
        h = "<h2>Connexion ExcelPro</h2><p class=\"muted\">Utilisez le compte avec lequel vous avez hébergé votre classeur.</p>" + msgs() +
            '<label>E-mail<input id="email" type="email" autocomplete="username"></label><label>Mot de passe<input id="pw" type="password" autocomplete="current-password"></label>' +
            '<button id="login" class="primary"' + (S.busy ? " disabled" : "") + ">" + (S.busy ? "Connexion…" : "Se connecter") + '</button> <button id="cfg">Adresse du service</button>';
    else {
        var t = curTable(), dis = S.busy ? " disabled" : "";
        h = '<div class="row"><h2>Hébergement</h2><button id="logout">Déconnexion</button></div>' + msgs();
        if (!S.imports.length)
            h += '<p class="muted">Aucune importation terminée. Publiez d\'abord votre classeur depuis ExcelPro → Hébergement.</p>';
        else {
            h += "<label>Classeur hébergé<select id=\"imp\">" + S.imports.map(function (r) { return '<option value="' + esc(r.id) + '"' + (r.id === S.importId ? " selected" : "") + ">" + esc(r.fileName) + "</option>"; }).join("") + "</select></label>";
            h += "<label>Table<select id=\"tab\">" + S.tables.map(function (x) { return '<option value="' + esc(x.table) + '"' + (x.table === S.tableName ? " selected" : "") + ">" + esc(x.table) + "</option>"; }).join("") + "</select></label>";
            if (t) {
                var sec = t.fields.filter(function (f) { return f.secret; }).map(function (f) { return f.name; });
                if (sec.length)
                    h += '<p class="muted">🔒 Colonnes protégées non affichées : ' + esc(sec.join(", ")) + ". Modifiez-les depuis ExcelPro.</p>";
            }
            h += '<button id="pull" class="primary"' + (t && !S.busy ? "" : " disabled") + ">" + (S.busy === "pull" ? "Chargement…" : "⬇ Charger depuis le serveur") + "</button><hr>";
            h += '<p class="muted">Modifiez, ajoutez ou supprimez des lignes dans la feuille <b>' + esc(t ? sheetName(t.table) : "") + "</b>, puis envoyez.</p>";
            h += '<label class="chk"><input id="del" type="checkbox"' + (S.withDeletes ? " checked" : "") + '> Supprimer aussi du serveur les lignes retirées de la feuille</label>';
            h += '<button id="diff"' + (t && !S.busy ? "" : " disabled") + ">" + (S.busy === "diff" ? "Analyse…" : "Voir mes modifications") + "</button>";
            if (S.preview) {
                h += '<div class="card">' + S.preview.errors.map(function (e) { return '<p class="err">' + esc(e) + "</p>"; }).join("");
                if (S.preview.changes.length) {
                    h += "<b>" + S.preview.changes.length + " modification(s) :</b><ul>" + S.preview.changes.slice(0, 200).map(function (c) { return "<li>" + esc(describeChange(c)) + "</li>"; }).join("") + "</ul>";
                    h += '<button id="push" class="primary"' + (S.busy || S.preview.errors.length ? " disabled" : "") + ">" + (S.busy === "push" ? "Envoi…" : "⬆ Envoyer au serveur") + "</button>";
                    if (S.preview.errors.length)
                        h += '<p class="warn">Corrigez les erreurs ci-dessus avant d\'envoyer.</p>';
                }
                h += "</div>";
            }
        }
        void dis;
    }
    root.innerHTML = h;
    bind();
}
function run(key, fn) {
    S.busy = key;
    S.error = "";
    S.info = "";
    render();
    fn().then(function () { S.busy = ""; render(); }, function (e) { S.busy = ""; S.error = errMsg(e); render(); });
}
function loadImports() {
    return __awaiter(this, void 0, void 0, function () {
        var all;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4, call("GET", "/imports")];
                case 1:
                    all = _a.sent();
                    S.imports = all.filter(function (r) { return r.state === "completed"; });
                    if (S.imports.length && !S.importId)
                        S.importId = S.imports[0].id;
                    return [4, loadTables()];
                case 2:
                    _a.sent();
                    return [2];
            }
        });
    });
}
function loadTables() {
    return __awaiter(this, void 0, void 0, function () {
        var s;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    S.tables = [];
                    S.tableName = "";
                    S.preview = null;
                    if (!S.importId)
                        return [2];
                    return [4, call("GET", "/imports/" + S.importId + "/data")];
                case 1:
                    s = _a.sent();
                    S.tables = s.tables;
                    S.tableName = S.tables.length ? S.tables[0].table : "";
                    return [2];
            }
        });
    });
}
function enter() { S.screen = "main"; run("init", loadImports); }
function bind() {
    var b = function (id, fn) { var el = $(id); if (el)
        el.onclick = fn; };
    b("save", function () { var v = String($("api").value).trim().replace(/\/+$/, ""); if (!/^https:\/\//.test(v)) {
        S.error = "L'adresse doit commencer par https://";
        render();
        return;
    } LS.set("excelpro_api", v); S.error = ""; S.screen = LS.get("excelpro_token") ? "main" : "login"; if (S.screen === "main")
        enter();
    else
        render(); });
    b("cfg", function () { S.screen = "config"; S.error = ""; render(); });
    b("login", function () {
        var email = String($("email").value).trim(), pw = String($("pw").value);
        run("login", function () {
            return __awaiter(this, void 0, void 0, function () { var r; return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4, pro("POST", "/auth/login", { email: email, password: pw })];
                    case 1:
                        r = _a.sent();
                        LS.set("excelpro_token", r.token);
                        conn = null;
                        S.screen = "main";
                        return [4, loadImports()];
                    case 2:
                        _a.sent();
                        return [2];
                }
            }); });
        });
    });
    b("logout", function () { LS.del("excelpro_token"); conn = null; S.imports = []; S.importId = ""; S.tables = []; S.preview = null; S.screen = "login"; render(); });
    var imp = $("imp");
    if (imp)
        imp.onchange = function () { S.importId = imp.value; run("tables", loadTables); };
    var tab = $("tab");
    if (tab)
        tab.onchange = function () { S.tableName = tab.value; S.preview = null; render(); };
    var del = $("del");
    if (del)
        del.onchange = function () { S.withDeletes = !!del.checked; S.preview = null; render(); };
    b("pull", function () { var t = curTable(); if (!t)
        return; run("pull", function () {
        return __awaiter(this, void 0, void 0, function () { var n; return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4, pull(S.importId, t)];
                case 1:
                    n = _a.sent();
                    S.preview = null;
                    S.info = n + " ligne(s) chargée(s) dans la feuille " + sheetName(t.table) + ".";
                    return [2];
            }
        }); });
    }); });
    b("diff", function () { var t = curTable(); if (!t)
        return; run("diff", function () {
        return __awaiter(this, void 0, void 0, function () { var d; return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4, readChanges(S.importId, t, S.withDeletes)];
                case 1:
                    d = _a.sent();
                    S.preview = d;
                    if (!d.changes.length && !d.errors.length)
                        S.info = "Aucune modification à envoyer.";
                    return [2];
            }
        }); });
    }); });
    b("push", function () {
        var t = curTable(), p = S.preview;
        if (!t || !p)
            return;
        run("push", function () {
            return __awaiter(this, void 0, void 0, function () {
                var fails, ok, base, i, c, e_1;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            fails = [], ok = 0, base = "/imports/" + S.importId + "/data/" + enc(t.table);
                            i = 0;
                            _a.label = 1;
                        case 1:
                            if (!(i < p.changes.length)) return [3, 11];
                            c = p.changes[i];
                            _a.label = 2;
                        case 2:
                            _a.trys.push([2, 9, , 10]);
                            if (!(c.kind === "insert")) return [3, 4];
                            return [4, call("POST", base, { values: c.values })];
                        case 3:
                            _a.sent();
                            return [3, 8];
                        case 4:
                            if (!(c.kind === "update")) return [3, 6];
                            return [4, call("PUT", base + "/" + enc(c.key), { expectedVersion: c.expectedVersion, values: c.values })];
                        case 5:
                            _a.sent();
                            return [3, 8];
                        case 6: return [4, call("DELETE", base + "/" + enc(c.key), { expectedVersion: c.expectedVersion })];
                        case 7:
                            _a.sent();
                            _a.label = 8;
                        case 8:
                            ok++;
                            return [3, 10];
                        case 9:
                            e_1 = _a.sent();
                            fails.push(describeChange(c) + " : " + errMsg(e_1));
                            return [3, 10];
                        case 10:
                            i++;
                            return [3, 1];
                        case 11: return [4, pull(S.importId, t)];
                        case 12:
                            _a.sent();
                            S.preview = null;
                            S.info = ok + " modification(s) envoyée(s). La feuille a été rechargée.";
                            if (fails.length)
                                S.error = fails.length + " échec(s) :\n" + fails.slice(0, 10).join("\n");
                            return [2];
                    }
                });
            });
        });
    });
}
function start(inExcel) {
    if (!inExcel) {
        S.screen = "noexcel";
        render();
        return;
    }
    if (!apiBase()) {
        S.screen = "config";
        render();
        return;
    }
    if (!LS.get("excelpro_token")) {
        S.screen = "login";
        render();
        return;
    }
    pro("GET", "/auth/me").then(enter, function () { LS.del("excelpro_token"); S.screen = "login"; render(); });
}
var started = false;
function go(inExcel) { if (!started) {
    started = true;
    start(inExcel);
} }
if (typeof Office !== "undefined" && Office.onReady) {
    Office.onReady(function (info) { go(!!info && (info.host === "Excel" || typeof Excel !== "undefined")); });
    window.setTimeout(function () { go(typeof Excel !== "undefined"); }, 6000);
}
else
    window.setTimeout(function () { go(false); }, 1500);
