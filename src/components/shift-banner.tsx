// シフト希望募集のお知らせバナー（ログイン後のスタッフホームに表示）。
// 毎月15日の自動通知（モック）とは別に、システム内でも常に提出を促せるようにする。

import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { currentTargetMonth, isNoticePeriod, noticeMessage } from "@/lib/shift/period";
import { Icon } from "@/components/icons";

export async function ShiftNoticeBanner({ staffId }: { staffId: string }) {
  const db = getDataStore();
  const rules = await db.getShiftRules();
  const targetMonth = currentTargetMonth(rules);
  const submitted = await db.getShiftRequestMonth(staffId, targetMonth);

  if (submitted) return null;

  // 15日〜締切の告知期間は強調、それ以外の提出可能期間は控えめに表示
  const emphasized = isNoticePeriod(targetMonth, rules);
  return (
    <Link
      href={`/staff/shift/request?month=${targetMonth}`}
      className={`flex items-center gap-3 rounded-2xl border p-4 mb-4 transition-all duration-300 hover:shadow-[0_6px_20px_rgba(93,80,58,0.12)] active:scale-[0.99] ${
        emphasized
          ? "bg-gradient-to-r from-brand-100 to-brand-50 border-brand-300"
          : "bg-amber-50 border-amber-200"
      }`}
    >
      <span
        className={`w-10 h-10 flex items-center justify-center rounded-xl shrink-0 ${
          emphasized ? "bg-white text-brand-600" : "bg-white text-amber-600"
        }`}
      >
        <Icon name="calendar" className="w-5 h-5" />
      </span>
      <span className="min-w-0">
        <span className={`block text-sm font-bold ${emphasized ? "text-brand-800" : "text-amber-800"}`}>
          {noticeMessage(targetMonth, rules)}
        </span>
        <span className="block text-xs text-stone-500 mt-0.5">タップして希望を入力 ›</span>
      </span>
    </Link>
  );
}
