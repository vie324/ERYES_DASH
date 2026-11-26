// ENi Wikipedia：Notionの書き出し（Markdown＋CSV）を取り込むときの文字の加工。
// 画面（端末）とサーバーの両方で使うので、サーバー専用のものは読み込まない。


/** Notionのファイル名の末尾に付く32桁のIDを落とす（"就業規則 1a2b…f.md" → "就業規則"） */
export function cleanNotionTitle(fileName: string): string {
  const base = fileName.split("/").pop() ?? fileName;
  return base
    .replace(/\.(md|csv)$/i, "")
    .replace(/\s+[0-9a-f]{32}$/i, "")
    .replace(/_all$/i, "")
    .trim();
}

/** Markdown の先頭の「# 題名」を題名として取り出し、本文から外す */
export function splitTitle(md: string, fallback: string): { title: string; body: string } {
  const lines = md.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const first = lines.findIndex((l) => l.trim() !== "");
  if (first >= 0 && /^#\s+/.test(lines[first])) {
    return { title: lines[first].replace(/^#\s+/, "").trim() || fallback, body: lines.slice(first + 1).join("\n").trim() };
  }
  return { title: fallback, body: lines.join("\n").trim() };
}

/** CSV（Notionのデータベース）を Markdown の表にする */
export function csvToMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const esc = (c: string) => c.replace(/\|/g, "｜").replace(/\n/g, " ");
  const head = rows[0];
  const lines = [`| ${head.map(esc).join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`];
  for (const r of rows.slice(1)) lines.push(`| ${head.map((_, i) => esc(r[i] ?? "")).join(" | ")} |`);
  return lines.join("\n");
}

/**
 * 本文の中の画像の参照（Notionの書き出しでは "ページ名 id/image.png" のような相対パス・URLエンコード）を、
 * 取り込んだ画像のURLに置き換える。見つからない画像は「（画像：ファイル名）」の文字にする。
 */
export function rewriteImageLinks(md: string, imageUrlOf: (path: string) => string | null): string {
  return md.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (all, alt: string, src: string) => {
    if (/^(https?:|data:)/.test(src) || src.startsWith("/api/wiki/image/")) return all;
    let decoded = src;
    try {
      decoded = decodeURIComponent(src);
    } catch {
      // そのまま
    }
    const url = imageUrlOf(decoded);
    return url ? `![${alt}](${url})` : `（画像：${decoded.split("/").pop()}）`;
  });
}
