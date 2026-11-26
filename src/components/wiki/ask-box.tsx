"use client";

// ENi Wikipedia の AI 検索。質問すると、Wikiの中身だけを根拠に答え、元のページへのリンクを付ける。
// 答えが無いときは「見つかりません」。AIが使えないときは、全文検索の候補だけを出す。

import Link from "next/link";
import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { askWikiAction } from "@/app/staff/wiki/actions";
import type { WikiAnswer } from "@/lib/wiki/ask";

export function WikiAskBox() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<WikiAnswer | null>(null);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const question = q.trim();
    if (!question) return;
    start(async () => setRes(await askWikiAction(question)));
  };
  return (
    <section className="card !border-violet-200 !bg-violet-50/40">
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input flex-1 !min-h-11"
          placeholder="例）遅刻しそうなときの連絡は？"
          maxLength={300}
          aria-label="Wikiに質問する"
        />
        <button type="submit" disabled={pending} className="btn-primary !min-h-11 !px-4 !text-sm shrink-0">
          {pending ? "…" : (
            <>
              <Icon name="sparkles" className="w-4 h-4" />
              聞く
            </>
          )}
        </button>
      </form>
      <p className="text-[11px] text-ink-500 mt-1.5">AIがWikiの中身だけを根拠に答えます。見つからないときは「見つかりません」と出ます。</p>
      {pending && <p className="text-sm text-ink-500 mt-3">探しています…</p>}
      {res && !pending && (
        <div className="mt-3 space-y-3">
          {res.ai && (
            <div className="rounded-xl bg-white border border-violet-200 p-3">
              <p className="mb-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 border border-violet-200 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                  <Icon name="sparkles" className="w-3 h-3" />
                  AIの答え
                </span>
              </p>
              <p className="text-sm text-ink-800 whitespace-pre-wrap leading-relaxed">{res.answer}</p>
              {res.sources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="w-full text-[11px] font-bold text-ink-500">根拠のページ</span>
                  {res.sources.map((s) => (
                    <Link key={s.id} href={`/staff/wiki/${s.id}`} className="chip !min-h-8 !py-1">
                      <Icon name="book" className="w-3.5 h-3.5" />
                      {s.title}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
          {!res.ai && res.note && <p className="text-sm font-bold text-ink-600">{res.note}</p>}
          {res.hits.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-ink-500 mb-1">関係しそうなページ</p>
              <ul className="space-y-1.5">
                {res.hits.map((h) => (
                  <li key={h.id}>
                    <Link href={`/staff/wiki/${h.id}`} className="block rounded-xl bg-white border border-ink-100 px-3 py-2">
                      <span className="block text-sm font-bold text-ink-900">{h.title}</span>
                      <span className="block text-[11px] text-ink-500 line-clamp-2">{h.excerpt}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
