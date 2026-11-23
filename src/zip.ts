// Création d'une archive ZIP dans le navigateur (aucune bibliothèque) pour publier un dossier de site. Compression deflate via CompressionStream quand le navigateur la propose.
export type ZipInput = { path: string; data: Uint8Array };

const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(buf: Uint8Array): number { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

async function deflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  const CS = (globalThis as { CompressionStream?: new (f: string) => { writable: WritableStream; readable: ReadableStream<Uint8Array> } }).CompressionStream;
  if (!CS) return null;
  try {
    const cs = new CS("deflate-raw"), w = cs.writable.getWriter(); void w.write(data as BufferSource as never).then(() => w.close()).catch(() => {});
    const chunks: Uint8Array[] = []; const r = cs.readable.getReader(); let n = 0;
    for (;;) { const { value, done } = await r.read(); if (done) break; chunks.push(value); n += value.length; }
    const out = new Uint8Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } return out;
  } catch { return null; }
}

const u16 = (v: DataView, o: number, x: number) => v.setUint16(o, x, true);
const u32 = (v: DataView, o: number, x: number) => v.setUint32(o, x >>> 0, true);

/** Construit l'archive. Chemins en UTF-8 (drapeau 0x800), horodatage fixe : le résultat ne dépend que du contenu. */
export async function buildZip(files: ZipInput[]): Promise<Uint8Array> {
  const enc = new TextEncoder(), parts: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.path), crc = crc32(f.data);
    const packed = f.data.length > 64 ? await deflateRaw(f.data) : null, deflated = !!packed && packed.length < f.data.length, body = deflated ? packed! : f.data, method = deflated ? 8 : 0;
    const lh = new Uint8Array(30), lv = new DataView(lh.buffer);
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x800); u16(lv, 8, method); u32(lv, 10, 0x21000000); u32(lv, 14, crc); u32(lv, 18, body.length); u32(lv, 22, f.data.length); u16(lv, 26, name.length);
    parts.push(lh, name, body);
    const ch = new Uint8Array(46), cv = new DataView(ch.buffer);
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x800); u16(cv, 10, method); u32(cv, 12, 0x21000000); u32(cv, 16, crc); u32(cv, 20, body.length); u32(cv, 24, f.data.length); u16(cv, 28, name.length); u32(cv, 42, offset);
    central.push(ch, name); offset += 30 + name.length + body.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50); u16(ev, 8, files.length); u16(ev, 10, files.length); u32(ev, 12, cdSize); u32(ev, 16, offset);
  const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((n, c) => n + c.length, 0)); let o = 0;
  for (const c of all) { out.set(c, o); o += c.length; }
  return out;
}

/** Fichiers à publier d'après une sélection (dossier ou fichiers) ; un seul .zip sélectionné est envoyé tel quel. */
export type Picked = { kind: "zip"; file: File } | { kind: "files"; files: { path: string; file: File }[] } | { kind: "empty" };
export function pick(list: FileList | File[] | null): Picked {
  const arr = Array.from(list ?? []);
  if (!arr.length) return { kind: "empty" };
  if (arr.length === 1 && /\.zip$/i.test(arr[0].name)) return { kind: "zip", file: arr[0] };
  return { kind: "files", files: arr.map((f) => ({ path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, file: f })) };
}
export async function archiveOf(p: Picked): Promise<Blob> {
  if (p.kind === "zip") return p.file;
  if (p.kind === "empty") throw new Error("Aucun fichier sélectionné.");
  const items: ZipInput[] = [];
  for (const { path, file } of p.files) items.push({ path, data: new Uint8Array(await file.arrayBuffer()) });
  return new Blob([(await buildZip(items)) as BlobPart], { type: "application/octet-stream" });
}
