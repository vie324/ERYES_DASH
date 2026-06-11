// CSV生成（Excelで文字化けしないよう UTF-8 BOM 付き・CRLF改行）

const BOM = "﻿";

function escapeCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** 2次元配列をBOM付きCSV文字列にする */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const body = rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
  return BOM + body + "\r\n";
}
