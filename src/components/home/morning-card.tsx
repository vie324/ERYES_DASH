"use client";

// 朝の画面（ENiのホーム）。その日はじめてホームを開いたときに、ホームの上に1枚のカード（下から出るシート）で出す。
// 閉じたらその日は出さない。ホームの「朝のカード」ボタンから開き直せる。
//  ・しもんさんの言葉 …… 管理者が登録した言葉を1日1つ（全員同じ）。登録が無ければ、この部分は出さない
//  ・今日のタスク …… /api/home/brief から本人の分だけを取る（1人1日1回だけ作って保存される）
// 「今日はもう見たか」は、この端末に人ごとに覚える（localStorage）。
// 画面の中身（main）は表示アニメーションで transform がかかり、重なり順と位置の基準が閉じ込められるので、
// カードは document.body の直下に出す（下部タブより前に出す）。

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Icon } from "@/components/icons";

/** ホームのボタンから朝のカードを開き直すためのイベント名 */
export const OPEN_MORNING_CARD_EVENT = "eni:open-morning-card";

interface BriefItem {
  text: string;
  detail: string;
}

type BriefState =
  | { status: "loading" }
  | { status: "ready"; items: BriefItem[]; ai: boolean }
  | { status: "error" };

export function MorningCard({
  staffId,
  today,
  dateLabel,
  word,
}: {
  staffId: string;
  /** 今日（YYYY-MM-DD・日本時間） */
  today: string;
  /** 見出しに出す日付（例：11月14日（土）） */
  dateLabel: string;
  /** しもんさんの言葉（登録が無ければ null） */
  word: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState<BriefState>({ status: "loading" });
  const requested = useRef(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const storageKey = `eni-morning-card:${staffId}`;

  // その日はじめてなら開く。ホームのボタンからも開ける
  useEffect(() => {
    let seenOn = "";
    try {
      seenOn = window.localStorage.getItem(storageKey) ?? "";
    } catch {
      // 保存できない端末（プライベートブラウズなど）では、開くたびに出す
    }
    if (seenOn !== today) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_MORNING_CARD_EVENT, reopen);
    return () => window.removeEventListener(OPEN_MORNING_CARD_EVENT, reopen);
  }, [storageKey, today]);

  // 開いたときに一度だけ、今日のタスクを取る（サーバー側で1人1日1回だけ作って保存している）
  useEffect(() => {
    if (!open || requested.current) return;
    requested.current = true;
    fetch("/api/home/brief", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { items?: BriefItem[]; ai?: boolean }) =>
        setBrief({ status: "ready", items: Array.isArray(data.items) ? data.items : [], ai: Boolean(data.ai) })
      )
      .catch(() => setBrief({ status: "error" }));
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    try {
      window.localStorage.setItem(storageKey, today);
    } catch {
      // 覚えられなくても閉じる
    }
  }, [storageKey, today]);

  // 開いている間：Escで閉じる・後ろの画面をスクロールさせない・閉じるボタンにフォーカス
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, close]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center print:hidden">
      <div className="absolute inset-0 bg-black/35" onClick={close} aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="morning-card-title"
        className="ios-home ios-sheet relative w-full sm:max-w-md max-h-[88dvh] overflow-y-auto overscroll-contain bg-[var(--ios-bg)] px-4 pt-2.5 pb-[calc(16px+env(safe-area-inset-bottom))] sm:pb-5"
      >
        <div className="mx-auto mb-3 h-[5px] w-9 rounded-full bg-black/15 sm:hidden" aria-hidden="true" />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold ios-secondary">{dateLabel}</p>
            <h2 id="morning-card-title" className="text-[24px] font-bold leading-tight">
              おはようございます
            </h2>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={close}
            aria-label="朝のカードを閉じる"
            className="shrink-0 w-8 h-8 rounded-full bg-black/[0.07] grid place-items-center ios-secondary active:opacity-70"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>

        {word && (
          <div className="ios-card mt-4">
            <p className="text-[12px] font-semibold ios-secondary">しもんさんの言葉</p>
            <p className="mt-1.5 text-[17px] font-semibold leading-relaxed whitespace-pre-wrap break-words">{word}</p>
          </div>
        )}

        <div className="mt-5">
          <div className="ios-section-header">
            <span>今日のタスク</span>
            {brief.status === "ready" && (
              <span className="text-[11px] font-semibold ios-secondary">{brief.ai ? "AIのおすすめ" : "今日の一覧"}</span>
            )}
          </div>
          <BriefList brief={brief} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Link
            href="/staff/tasks"
            onClick={close}
            className="h-12 rounded-[12px] bg-[var(--ios-card)] text-[15px] font-semibold text-[var(--ios-accent)] grid place-items-center active:opacity-70"
          >
            タスクを開く
          </Link>
          <button
            type="button"
            onClick={close}
            className="h-12 rounded-[12px] bg-[var(--ios-accent)] text-[15px] font-semibold text-white active:opacity-80"
          >
            閉じる
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function BriefList({ brief }: { brief: BriefState }) {
  if (brief.status === "loading") {
    return (
      <div className="ios-list" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="ios-row">
            <span className="w-6 h-6 rounded-full bg-black/[0.06] shrink-0" />
            <span className="h-3.5 flex-1 rounded bg-black/[0.06] animate-pulse" />
          </div>
        ))}
        <p className="sr-only">今日のタスクを準備しています</p>
      </div>
    );
  }
  if (brief.status === "error") {
    return (
      <div className="ios-card text-[14px] ios-secondary">
        今日のタスクを読み込めませんでした。タスク画面で確認してください。
      </div>
    );
  }
  if (brief.items.length === 0) {
    return <div className="ios-card text-[14px] ios-secondary">今日やり残していることはありません。いい一日を！</div>;
  }
  return (
    <ol className="ios-list">
      {brief.items.map((item, i) => (
        <li key={`${i}-${item.text}`} className="ios-row !items-start">
          <span className="mt-0.5 w-6 h-6 shrink-0 rounded-full bg-[var(--ios-accent)] text-white text-[13px] font-bold grid place-items-center">
            {i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold leading-snug break-words">{item.text}</span>
            {item.detail && <span className="block text-[12px] ios-secondary mt-0.5">{item.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** ホームに置く「朝のカード」ボタン（閉じたあとでも開き直せる） */
export function MorningCardButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_MORNING_CARD_EVENT))}
      className="inline-flex items-center gap-1.5 h-9 rounded-full bg-[var(--ios-card)] px-3.5 text-[13px] font-semibold text-[var(--ios-accent)] shadow-[0_1px_2px_rgba(0,0,0,0.06)] active:opacity-70"
    >
      <Icon name="sun" className="w-4 h-4" />
      朝のカード
    </button>
  );
}
