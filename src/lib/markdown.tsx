// 議事録用の最小Markdownレンダラ（外部依存なし・XSS対策のためHTMLはエスケープ）。
// 対応：## ### 見出し / **太字** / - 箇条書き / 1. 番号 / | 表 | / 段落・引用。

import React from "react";

function inline(text: string, keyBase: string): React.ReactNode[] {
  // **太字** のみ対応（それ以外はそのまま）
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return (
        <strong key={`${keyBase}-b${i}`} className="font-bold text-ink-900">
          {p.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={`${keyBase}-t${i}`}>{p}</React.Fragment>;
  });
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 表（| ... | が連続、2行目が --- 区切り）
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push(
        <div key={key++} className="overflow-x-auto my-2">
          <table className="table-base">
            <thead>
              <tr>{header.map((h, hi) => <th key={hi}>{inline(h, `h${hi}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => <td key={ci}>{inline(c, `c${ri}-${ci}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // 見出し
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const cls =
        level <= 2
          ? "font-display text-base font-bold text-ink-900 mt-4 mb-1.5 flex items-center gap-2"
          : "font-bold text-sm text-ink-700 mt-3 mb-1";
      blocks.push(
        <p key={key++} className={cls}>
          {level <= 2 && <span className="h-4 w-1 rounded-full bg-gradient-to-b from-brand-400 to-brand-600" />}
          {inline(h[2], `hd${key}`)}
        </p>
      );
      i++;
      continue;
    }

    // 箇条書き（- または 数字.）
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: string[] = [];
      const ordered = /^\s*\d+\.\s+/.test(line);
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        i++;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag key={key++} className={`${ordered ? "list-decimal" : "list-disc"} list-inside space-y-0.5 text-sm text-ink-700 my-1`}>
          {items.map((it, ii) => <li key={ii}>{inline(it, `li${key}-${ii}`)}</li>)}
        </ListTag>
      );
      continue;
    }

    // 引用
    if (/^\s*>\s?/.test(line)) {
      blocks.push(
        <p key={key++} className="text-xs text-ink-500 border-l-2 border-ink-200 pl-3 my-2">
          {inline(line.replace(/^\s*>\s?/, ""), `q${key}`)}
        </p>
      );
      i++;
      continue;
    }

    // 空行
    if (line.trim() === "") {
      i++;
      continue;
    }

    // 段落
    blocks.push(
      <p key={key++} className="text-sm text-ink-700 my-1 whitespace-pre-wrap">
        {inline(line, `p${key}`)}
      </p>
    );
    i++;
  }

  return <div>{blocks}</div>;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}
