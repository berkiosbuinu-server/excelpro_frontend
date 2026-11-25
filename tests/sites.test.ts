import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { buildZip, crc32, pick } from "../src/zip.ts";
import { slugify, accessNotice, fmtUsdCents, fmtBytes, SITE_ID_RE, SITE_PRICING, repoUrlError, isSshRepo, hookUrl, GIT_STATUS_LABEL } from "../src/sitesui.ts";
const enc = new TextEncoder();
assert.equal(crc32(enc.encode("123456789")), 0xcbf43926);
// archive : relue par python (zlib) et par le lecteur du serveur
const big = enc.encode("<p>bonjour é</p>".repeat(500));
const zip = await buildZip([{ path: "index.html", data: big }, { path: "css/a.css", data: enc.encode("a{}") }, { path: "é/ü.txt", data: enc.encode("x") }]);
const d = mkdtempSync(tmpdir() + "/z-"); writeFileSync(d + "/t.zip", zip);
const out = execFileSync("python3", ["-I", "-c", "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(sorted(z.namelist()), len(z.read('index.html')))", d + "/t.zip"]).toString();
assert.match(out, /index\.html/); assert.ok(out.includes(String(big.length)), out);
try { const { readZip } = await import("/tmp/claude-0/-home-claude/1a9a5a9e-05b1-5759-8c22-5636d152878d/scratchpad/verify/client-serveur/berkios-server/sites-zip.mjs"); const r = readZip(Buffer.from(zip)); assert.equal(r.files.length, 3); assert.equal(r.files.find((f: {path:string}) => f.path === "index.html").data.length, big.length); } catch (e) { throw e; }
assert.ok(zip.length < big.length, "compressé");
// sélection
assert.equal(pick(null).kind, "empty"); assert.equal(pick([new File(["x"], "s.ZIP")]).kind, "zip"); assert.equal(pick([new File(["x"], "a.html"), new File(["y"], "b.css")]).kind, "files");
// aides
assert.equal(slugify("Ma Pharmacie Étoile !"), "ma-pharmacie-etoile"); assert.equal(slugify("123 boutique"), "site-123-boutique"); assert.equal(slugify("***"), "");
assert.ok(SITE_ID_RE.test(slugify("Ma Pharmacie")));
assert.equal(fmtUsdCents(1920), "19,20 $"); assert.equal(fmtUsdCents(1000), "10 $"); assert.equal(fmtBytes(1536), "2 Ko"); assert.equal(fmtBytes(104857600), "100,0 Mo");
assert.equal(accessNotice({ state: "active", daysLeft: 30 } as never), null); assert.equal(accessNotice({ state: "grace" } as never)?.level, "warn"); assert.equal(accessNotice({ state: "expired" } as never)?.level, "error"); assert.equal(accessNotice({ state: "active", daysLeft: 3 } as never)?.level, "info");
assert.deepEqual(SITE_PRICING.map((p) => p.monthly), [2, 10]);
// Git
assert.equal(repoUrlError(""), "Indiquez l'adresse du dépôt."); assert.equal(repoUrlError("https://github.com/a/b.git"), ""); assert.equal(repoUrlError("git@github.com:a/b.git"), ""); assert.equal(repoUrlError("ssh://git@gitlab.com/a/b.git"), "");
for (const bad of ["http://github.com/a/b", "github.com/a/b", "https://user:tok@github.com/a/b", "https://github.com", "ftp://x/y"]) assert.notEqual(repoUrlError(bad), "", bad);
assert.match(repoUrlError("https://u:t@github.com/a/b"), /ni identifiant/);
assert.equal(isSshRepo("git@github.com:a/b.git"), true); assert.equal(isSshRepo("https://github.com/a/b"), false);
assert.equal(hookUrl("demo"), "https://server.berkios.online/admin/v1/sites/hook/demo"); assert.ok(GIT_STATUS_LABEL.running && GIT_STATUS_LABEL.ok && GIT_STATUS_LABEL.error);
console.log("sites.test OK");
