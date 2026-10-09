// 希望休の募集のお知らせ（スタッフのホームに出す）。
// 締切の前の月の15日〜締切日に、まだ出していない人にだけ出す（出したら消える）。
// 以前は旧「シフト希望」の提出を見ていたので、希望休を出してもお知らせが消えなかった。

import Link from "next/link";
import type { DayoffNotice } from "@/lib/shift/requests";
import { Icon } from "@/components/icons";

export function DayoffNoticeBanner({ notice }: { notice: DayoffNotice | null }) {
  if (!notice) return null;
  return (
    <Link
      href={notice.href}
      className="flex items-center gap-3 rounded-2xl border p-4 mb-4 transition-all duration-300 hover:shadow-[0_6px_20px_rgba(93,80,58,0.12)] active:scale-[0.99] bg-gradient-to-r from-brand-100 to-brand-50 border-brand-300"
    >
      <span className="w-10 h-10 flex items-center justify-center rounded-xl shrink-0 bg-white text-brand-600">
        <Icon name="calendar" className="w-5 h-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-brand-800">{notice.message}</span>
        <span className="block text-xs text-ink-500 mt-0.5">
          締切 {notice.deadlineLabel}（{notice.remaining}）・タップして入力 ›
        </span>
      </span>
    </Link>
  );
}
