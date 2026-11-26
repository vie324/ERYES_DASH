// ZIPファイルの中身を取り出す（Notionの書き出しを、端末の中で開くため。外部のライブラリなし）。
// ブラウザ（iPhone の Safari 16.4 以降・PCの Chrome など）と Node の両方で動く DecompressionStream を使う。
// 対応：無圧縮（0）・deflate（8）。ZIP64・暗号化には対応しない（Notionの書き出しでは使われない）。

export interface ZipEntry {
  path: string;
  data: Uint8Array;
}

function u16(v: DataView, o: number): number {
  return v.getUint16(o, true);
}
function u32(v: DataView, o: number): number {
  return v.getUint32(o, true);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZip(buf: ArrayBuffer): Promise<ZipEntry[]> {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  // 末尾から「中央ディレクトリの終わり」（0x06054b50）を探す
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(view, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIPファイルとして読めませんでした");
  const count = u16(view, eocd + 10);
  let p = u32(view, eocd + 16);
  const decoderUtf8 = new TextDecoder("utf-8");
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (u32(view, p) !== 0x02014b50) break;
    const flags = u16(view, p + 8);
    const method = u16(view, p + 10);
    const compSize = u32(view, p + 20);
    const nameLen = u16(view, p + 28);
    const extraLen = u16(view, p + 30);
    const commentLen = u16(view, p + 32);
    const localOffset = u32(view, p + 42);
    const nameBytes = bytes.subarray(p + 46, p + 46 + nameLen);
    // 名前は UTF-8（フラグの11ビット目）。立っていなくても、Notion・Mac の書き出しは UTF-8 のことが多い
    const name = (flags & 0x0800) !== 0 ? decoderUtf8.decode(nameBytes) : decoderUtf8.decode(nameBytes);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    if (u32(view, localOffset) !== 0x04034b50) continue;
    const lNameLen = u16(view, localOffset + 26);
    const lExtraLen = u16(view, localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(start, start + compSize);
    if (method === 0) entries.push({ path: name, data: raw.slice() });
    else if (method === 8) entries.push({ path: name, data: await inflateRaw(raw) });
  }
  return entries;
}

/** ZIPの中にZIPがある（Notionの大きな書き出し）ときは、1段だけ中も開く */
export async function readZipDeep(buf: ArrayBuffer): Promise<ZipEntry[]> {
  const top = await readZip(buf);
  const out: ZipEntry[] = [];
  for (const e of top) {
    if (/\.zip$/i.test(e.path)) {
      const inner = await readZip(e.data.buffer.slice(e.data.byteOffset, e.data.byteOffset + e.data.byteLength) as ArrayBuffer);
      out.push(...inner);
    } else {
      out.push(e);
    }
  }
  return out;
}

/** ZIPの中のパスの「この md から見た相対パス」を、ZIPの中の絶対パスにする */
export function resolveZipPath(fromFile: string, rel: string): string {
  const base = fromFile.split("/").slice(0, -1);
  for (const part of rel.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") base.pop();
    else base.push(part);
  }
  return base.join("/");
}
