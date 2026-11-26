"use client";

// 追加開発の確認：依頼ごとに「OK／直してほしい／質問」とひとことを残し、まとめてコピーして送れるようにする。
// 書いた内容はこの端末（ブラウザ）にだけ残す。デモは起動し直すとデータが戻るので、サーバーには保存しない。

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ReviewItem } from "@/lib/review/items";

type Status = "" | "ok" | "fix" | "question";
type Entry = { status: Status; comment: string; checked: number[] };

const STORAGE_KEY = "eni-review-10-23";
const STATUS_LABEL: Record<Status, string> = { "": "まだ", ok: "OK", fix: "直してほしい", question: "質問" };

function load(): Record<string, Entry> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, Entry>;
  } catch {
    return {};
  }
}

export function ReviewBoard({ items, reviewer }: { items: ReviewItem[]; reviewer: string }) {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setEntries(load());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // 保存できなくても画面は使える（コピーで送れる）
    }
  }, [entries, ready]);

  const entryOf = (no: string): Entry => entries[no] ?? { status: "", comment: "", checked: [] };
  const update = (no: string, patch: Partial<Entry>) => setEntries((e) => ({ ...e, [no]: { ...entryOf(no), ...patch } }));
  const done = items.filter((i) => entryOf(i.no).status).length;

  const markdown = () =>
    [
      `# 追加開発（依頼10〜23）の確認（${reviewer}・${new Date().toLocaleDateString("ja-JP")}）`,
      "",
      ...items.flatMap((i) => {
        const e = entryOf(i.no);
        const lines = [`## 依頼${i.no} ${i.title}：${STATUS_LABEL[e.status]}`];
        if (e.checked.length) lines.push(`- 確かめた：${e.checked.map((n) => i.checks[n]).join("／")}`);
        if (e.comment.trim()) lines.push(...e.comment.trim().split("\n").map((l) => `- ${l}`));
        return [...lines, ""];
      }),
    ].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
      window.prompt("下の文をコピーしてください", markdown());
    }
  };

  return (
    <div className="space-y-4">
      <div className="card !p-3.5 sticky top-2 z-10 flex items-center gap-3">
        <span className="flex-1 text-sm">
          確認 <b className="tabular-nums">{done}</b>/{items.length}
        </span>
        <button type="button" onClick={() => void copy()} className="btn-primary btn-sm">
          {copied ? "コピーしました" : "まとめてコピー"}
        </button>
      </div>
      {items.map((i) => {
        const e = entryOf(i.no);
        return (
          <section key={i.no} id={`r${i.no}`} className="card !p-3.5 scroll-mt-20">
            <div className="flex items-start gap-2">
              <span className="shrink-0 rounded-lg bg-brand-50 border border-brand-200 text-brand-800 text-xs font-bold px-2 py-1">依頼{i.no}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-ink-900">{i.title}</p>
                <p className="text-[11px] text-ink-500">ENiの依頼 {i.eni}</p>
              </div>
            </div>
            <p className="text-xs text-ink-700 mt-2 leading-relaxed">{i.summary}</p>
            <p className="text-[11px] text-ink-500 mt-2">
              試すアカウント：<b className="text-ink-700">{i.accounts}</b>
            </p>
            <ol className="mt-2 space-y-1.5 list-decimal pl-5">
              {i.steps.map((s, n) => (
                <li key={n} className="text-xs text-ink-800">
                  {s.href ? (
                    <Link href={s.href} className="text-brand-700 underline underline-offset-2">
                      {s.text}
                    </Link>
                  ) : (
                    s.text
                  )}
                </li>
              ))}
            </ol>
            <div className="mt-3 space-y-1">
              {i.checks.map((c, n) => (
                <label key={n} className="flex items-start gap-2 text-xs text-ink-700">
                  <input
                    type="checkbox"
                    className="mt-0.5 w-4 h-4 shrink-0"
                    checked={e.checked.includes(n)}
                    onChange={(ev) => update(i.no, { checked: ev.target.checked ? [...e.checked, n] : e.checked.filter((x) => x !== n) })}
                  />
                  {c}
                </label>
              ))}
            </div>
            {i.todo && i.todo.length > 0 && <p className="text-[11px] text-amber-800 mt-2">ENiの確認待ち：{i.todo.join("／")}</p>}
            <div className="flex gap-1.5 mt-3">
              {(["ok", "fix", "question"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => update(i.no, { status: e.status === s ? "" : s })}
                  className={`chip !min-h-9 ${e.status === s ? "chip-active" : ""}`}
                  aria-pressed={e.status === s}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <textarea
              value={e.comment}
              onChange={(ev) => update(i.no, { comment: ev.target.value })}
              className="input min-h-16 mt-2 text-sm"
              placeholder="気づいたこと・直してほしいこと（どの画面の、どこを）"
            />
          </section>
        );
      })}
    </div>
  );
}
