/* eslint-disable @next/next/no-img-element */
// ENi Wikipedia の本文の表示（外部のライブラリなし。HTMLは書けない＝そのまま文字として出す）。
// 見出し（# ## ###）・段落・箇条書き・番号・チェック・引用・表・コード・画像・リンク・太字に対応。
// 画像は取り込んだ画像（/api/wiki/image/…）だけ、リンクは http(s) とアプリの中（/staff/…）だけを出す。

import React from "react";
import Link from "next/link";

function safeHref(href: string): string | null {
  if (/^https?:\/\//.test(href)) return href;
  if (/^\/staff\//.test(href)) return href;
  return null;
}

function inline(text: string, key: string): React.ReactNode[] {
  // 画像・リンク・太字の順に切り出す
  const out: React.ReactNode[] = [];
  const re = /(!\[[^\]]*\]\([^)\s]+\)|\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<React.Fragment key={`${key}-t${i++}`}>{text.slice(last, m.index)}</React.Fragment>);
    const tok = m[0];
    if (tok.startsWith("![")) {
      const [, alt, src] = tok.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/) ?? [];
      if (src && (src.startsWith("/api/wiki/image/") || src.startsWith("data:image/"))) {
        out.push(<img key={`${key}-i${i++}`} src={src} alt={alt ?? ""} className="my-2 max-w-full rounded-xl border border-ink-100" loading="lazy" />);
      } else {
        out.push(<React.Fragment key={`${key}-i${i++}`}>（画像：{alt || "画像"}）</React.Fragment>);
      }
    } else if (tok.startsWith("[")) {
      const [, label, href] = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) ?? [];
      const safe = href ? safeHref(href) : null;
      if (safe && safe.startsWith("/")) {
        out.push(
          <Link key={`${key}-l${i++}`} href={safe} className="text-brand-700 underline">
            {label}
          </Link>
        );
      } else if (safe) {
        out.push(
          <a key={`${key}-l${i++}`} href={safe} target="_blank" rel="noreferrer" className="text-brand-700 underline">
            {label}
          </a>
        );
      } else {
        out.push(<React.Fragment key={`${key}-l${i++}`}>{label}</React.Fragment>);
      }
    } else {
      out.push(
        <strong key={`${key}-b${i++}`} className="font-bold text-ink-900">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(<React.Fragment key={`${key}-t${i++}`}>{text.slice(last)}</React.Fragment>);
  return out;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function WikiMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    // コード
    if (line.trim().startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={k++} className="my-2 overflow-x-auto rounded-xl bg-ink-900 text-ink-50 p-3 text-xs leading-relaxed">
          {body.join("\n")}
        </pre>
      );
      continue;
    }
    // 表
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(splitRow(lines[i++]));
      blocks.push(
        <div key={k++} className="table-wrap my-2">
          <table className="table-base">
            <thead>
              <tr>
                {header.map((h, j) => (
                  <th key={j}>{inline(h, `h${k}-${j}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {header.map((_, j) => (
                    <td key={j} className="!whitespace-normal">
                      {inline(r[j] ?? "", `c${k}-${ri}-${j}`)}
                    </td>
                  ))}
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
      const cls = level <= 1 ? "text-xl mt-5" : level === 2 ? "text-lg mt-5" : "text-base mt-4";
      blocks.push(
        <p key={k++} className={`font-bold text-ink-900 mb-1.5 ${cls}`} role="heading" aria-level={Math.min(6, level + 1)}>
          {inline(h[2], `hd${k}`)}
        </p>
      );
      i++;
      continue;
    }
    // 引用
    if (line.startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) body.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(
        <blockquote key={k++} className="my-2 border-l-4 border-brand-300 bg-brand-50/60 rounded-r-xl px-3 py-2 text-sm text-ink-700 whitespace-pre-wrap">
          {inline(body.join("\n"), `q${k}`)}
        </blockquote>
      );
      continue;
    }
    // 箇条書き・チェック・番号
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, ""));
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag key={k++} className={`my-2 space-y-1 pl-5 text-sm text-ink-800 ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((it, j) => {
            const check = it.match(/^\[( |x|X)\]\s+(.*)$/);
            return (
              <li key={j} className={check ? "list-none -ml-5" : ""}>
                {check ? (
                  <span>
                    {check[1].trim() ? "☑" : "☐"} {inline(check[2], `li${k}-${j}`)}
                  </span>
                ) : (
                  inline(it, `li${k}-${j}`)
                )}
              </li>
            );
          })}
        </Tag>
      );
      continue;
    }
    // 段落（空行まで）
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) &&
      !lines[i].startsWith(">") &&
      !lines[i].trim().startsWith("```")
    ) {
      para.push(lines[i++]);
    }
    blocks.push(
      <p key={k++} className="my-2 text-sm leading-relaxed text-ink-800 whitespace-pre-wrap">
        {inline(para.join("\n"), `p${k}`)}
      </p>
    );
  }
  return <div className="wiki-body break-words">{blocks}</div>;
}
