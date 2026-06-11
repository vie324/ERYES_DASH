// シフト希望募集のお知らせバナー（ログイン後のスタッフホームに表示）。
// 毎月15日の自動通知（モック）とは別に、システム内でも常に提出を促せるようにする。

import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { currentTargetMonth, isNoticePeriod, noticeMessage } from "@/lib/shift/period";

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
      className={`block rounded-2xl border p-4 mb-4 active:opacity-80 ${
        emphasized ? "bg-rose-50 border-rose-300" : "bg-amber-50 border-amber-200"
      }`}
    >
      <p className={`text-sm font-bold ${emphasized ? "text-rose-700" : "text-amber-800"}`}>
        📅 {noticeMessage(targetMonth, rules)}
      </p>
      <p className="text-xs text-stone-500 mt-1">タップして希望を入力 ›</p>
    </Link>
  );
}
