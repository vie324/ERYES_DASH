"use client";

// Notionの書き出し（「Markdown & CSV」で書き出したZIP）を ENi Wikipedia に取り込む。
// ZIPは端末の中で開き、画像は縮めてから1枚ずつ、ページは1つずつサーバーへ送る（一度に送ると大きすぎるため）。
// 同じファイルから取り込んだページは上書きする（何度取り込んでも重ならない）。

import { useState } from "react";
import { readZipDeep, resolveZipPath, type ZipEntry } from "@/lib/zip-read";
import { cleanNotionTitle, csvToMarkdownTable, rewriteImageLinks, splitTitle } from "@/lib/wiki/text";
import { parseCsv } from "@/lib/csv-parse";
import { importWikiPageAction, uploadWikiImageAction } from "@/app/staff/wiki/actions";

interface Planned {
  path: string;
  title: string;
  kind: "md" | "csv";
  text: string;
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp)$/i;

async function toDataUrl(entry: ZipEntry): Promise<string> {
  const type = /\.png$/i.test(entry.path) ? "image/png" : /\.gif$/i.test(entry.path) ? "image/gif" : /\.webp$/i.test(entry.path) ? "image/webp" : "image/jpeg";
  const blob = new Blob([entry.data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function NotionImport({ categories, canAdminOnly }: { categories: string[]; canAdminOnly: boolean }) {
  const [entries, setEntries] = useState<ZipEntry[]>([]);
  const [planned, setPlanned] = useState<Planned[]>([]);
  const [category, setCategory] = useState(categories[0] ?? "");
  const [visibility, setVisibility] = useState("all");
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    if (files.length === 0) return;
    setBusy(true);
    setLog([]);
    try {
      const all: ZipEntry[] = [];
      for (const f of files) {
        const buf = await f.arrayBuffer();
        if (/\.zip$/i.test(f.name)) all.push(...(await readZipDeep(buf)));
        else all.push({ path: f.name, data: new Uint8Array(buf) });
      }
      const dec = new TextDecoder("utf-8");
      const csvs = all.filter((x) => /\.csv$/i.test(x.path));
      const plans: Planned[] = [];
      for (const x of all) {
        if (/\.md$/i.test(x.path)) {
          plans.push({ path: x.path, title: cleanNotionTitle(x.path), kind: "md", text: dec.decode(x.data) });
        } else if (/\.csv$/i.test(x.path)) {
          // 新しい書き出しは「〇〇.csv」と「〇〇_all.csv」の両方が入る → 全件の _all を使う
          if (!/_all\.csv$/i.test(x.path) && csvs.some((c) => c.path === x.path.replace(/\.csv$/i, "_all.csv"))) continue;
          plans.push({ path: x.path, title: `${cleanNotionTitle(x.path)}（一覧）`, kind: "csv", text: dec.decode(x.data) });
        }
      }
      setEntries(all);
      setPlanned(plans);
      if (plans.length === 0) setLog(["取り込めるページ（.md / .csv）が見つかりませんでした"]);
    } catch (err) {
      setLog([err instanceof Error ? err.message : "ファイルを開けませんでした"]);
    }
    setBusy(false);
  };

  const run = async () => {
    setBusy(true);
    const out: string[] = [];
    const uploaded = new Map<string, string>();
    for (const p of planned) {
      try {
        let title = p.title;
        let body: string;
        if (p.kind === "md") {
          const split = splitTitle(p.text, p.title);
          title = split.title;
          // 画像：ZIPの中の画像を1枚ずつ送り、本文の参照をアプリの画像のURLにする
          const refs = [...split.body.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)].map((m) => m[1]).filter((s) => !/^(https?:|data:)/.test(s));
          for (const ref of refs) {
            let decoded = ref;
            try {
              decoded = decodeURIComponent(ref);
            } catch {
              // そのまま
            }
            const abs = resolveZipPath(p.path, decoded);
            if (uploaded.has(abs)) continue;
            const img = entries.find((x) => x.path === abs || x.path.endsWith(`/${abs}`));
            if (!img || !IMAGE_RE.test(img.path)) continue;
            const res = await uploadWikiImageAction({ fileName: abs.split("/").pop() ?? "image", dataUrl: await toDataUrl(img) });
            if (res.ok && res.url) uploaded.set(abs, res.url);
          }
          body = rewriteImageLinks(split.body, (rel) => uploaded.get(resolveZipPath(p.path, rel)) ?? null)
            // Notionのページ同士のリンク（〇〇.md）は文字だけにする
            .replace(/\[([^\]]+)\]\(([^)\s]+\.md)\)/g, "$1");
        } else {
          body = csvToMarkdownTable(parseCsv(p.text.replace(/^﻿/, "")));
        }
        const r = await importWikiPageAction({ title, category, visibility, body, sourcePath: p.path });
        out.push(r.ok ? `✅ ${title}${r.updated ? "（上書き）" : ""}` : `⚠️ ${title}：${r.message ?? "保存できませんでした"}`);
      } catch {
        out.push(`⚠️ ${p.title}：取り込めませんでした`);
      }
      setLog([...out]);
    }
    out.push(`終わりました（${planned.length}ページ・画像${uploaded.size}枚）`);
    setLog([...out]);
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-brand-300 bg-white px-3 py-6 text-sm font-bold text-brand-600 cursor-pointer">
        {busy ? "読み込み中…" : "＋ Notionの書き出し（ZIP）を選ぶ（.md・.csv も可）"}
        <input type="file" accept=".zip,.md,.csv" multiple onChange={onFile} disabled={busy} className="hidden" />
      </label>
      {planned.length > 0 && (
        <div className="card space-y-3">
          <p className="text-sm font-bold text-ink-900">取り込むページ：{planned.length}件（画像 {entries.filter((x) => IMAGE_RE.test(x.path)).length}枚）</p>
          <ul className="max-h-48 overflow-y-auto text-xs text-ink-600 space-y-0.5">
            {planned.map((p) => (
              <li key={p.path}>・{p.title}</li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-bold text-ink-600">
              カテゴリ
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="input !min-h-11 !py-2 !text-sm mt-1">
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-ink-600">
              見られる人
              <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="input !min-h-11 !py-2 !text-sm mt-1">
                <option value="all">全員</option>
                <option value="exec">幹部以上</option>
                {canAdminOnly && <option value="admin">管理者だけ</option>}
              </select>
            </label>
          </div>
          <button type="button" onClick={run} disabled={busy} className="btn-primary w-full">
            {busy ? "取り込んでいます…" : "取り込む"}
          </button>
          <p className="text-[11px] text-ink-500">取り込んだあと、ページごとにカテゴリ・見られる人を直せます。</p>
        </div>
      )}
      {log.length > 0 && (
        <ul className="card-quiet text-xs text-ink-700 space-y-0.5 max-h-64 overflow-y-auto">
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
