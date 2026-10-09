// 希望休の募集期間・締切の計算（シフト・出勤スケジュール共通）。
// 運用サイクル（2026-09 変更）：
//   「◯ヶ月先の分を、その◯ヶ月前の月の◯日までに出す」
//   既定は3ヶ月先・5日 ＝「9月5日までに12月分」。
//   お客様の2ヶ月先のご予約を確保できるようにするため、先に枠を決めておく。
// 先行月数（requestLeadMonths）と締切日（requestDeadlineDay）は管理者がシフトのルール設定で変更できる。
// 以前は出勤スケジュール側だけ「3ヶ月先・5日」で固定されていて、ルールを変えると2つの締切がずれていた。
// いまはすべてこのファイルの計算（＝ルール設定）に揃えている。

import { addMonths, formatDateJa, monthRange, thisMonthJst, todayJst } from "@/lib/date";
import type { ShiftRules } from "@/lib/data/types";

/** 何ヶ月先の分を募集するか（不正値は既定の3ヶ月に寄せる） */
function leadMonths(rules: ShiftRules): number {
  const n = Math.trunc(rules.requestLeadMonths);
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : 3;
}

/** 締切日（不正値は既定の5日に寄せる） */
function deadlineDay(rules: ShiftRules): number {
  const n = Math.trunc(rules.requestDeadlineDay);
  return Number.isFinite(n) && n >= 1 && n <= 31 ? n : 5;
}

/** 対象月の希望休の締切日（"YYYY-MM-DD"）＝対象月の◯ヶ月前の rules.requestDeadlineDay 日 */
export function requestDeadline(targetMonth: string, rules: ShiftRules): string {
  const month = addMonths(targetMonth, -leadMonths(rules));
  const { to } = monthRange(month);
  const lastDay = Number(to.slice(8));
  const day = Math.min(deadlineDay(rules), lastDay); // 2月などで月末を超えないように
  return `${month}-${String(day).padStart(2, "0")}`;
}

/** 対象月の希望休がまだ提出・修正できるか（締切日まで可能） */
export function isRequestEditable(targetMonth: string, rules: ShiftRules, today = todayJst()): boolean {
  return today <= requestDeadline(targetMonth, rules);
}

/** いま募集している月（◯ヶ月先。締切を過ぎていたらさらに翌月）。スタッフが希望休を出す月 */
export function currentTargetMonth(rules: ShiftRules, today = todayJst()): string {
  const next = addMonths(today.slice(0, 7), leadMonths(rules));
  return isRequestEditable(next, rules, today) ? next : addMonths(next, 1);
}

/** いま作る月（締切を過ぎた、いちばん新しい月）。募集中の月の前月 */
export function buildTargetMonth(rules: ShiftRules, today = todayJst()): string {
  return addMonths(currentTargetMonth(rules, today), -1);
}

/** 締切まであと何日か（締切日当日は0。過ぎていれば負の数） */
export function daysUntilDeadline(targetMonth: string, rules: ShiftRules, today = todayJst()): number {
  const ms = Date.parse(`${requestDeadline(targetMonth, rules)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * 募集のお知らせを出す期間か（締切のある月の前月15日〜締切日）。
 * ホームのお知らせ・メニューの「！」・タスクの「希望休が未提出です」はこの期間だけ出す
 * （提出できる期間ずっと出し続けると、まだ先の話なのに毎日せかされてしまうため）。
 */
export function isNoticePeriod(targetMonth: string, rules: ShiftRules, today = todayJst()): boolean {
  const deadline = requestDeadline(targetMonth, rules);
  const noticeStart = `${addMonths(deadline.slice(0, 7), -1)}-15`;
  return today >= noticeStart && today <= deadline;
}

/** 締切日の表示用文字列（例「9月5日(金)」） */
export function deadlineLabel(targetMonth: string, rules: ShiftRules): string {
  return formatDateJa(requestDeadline(targetMonth, rules));
}

/** 「あと◯日」の表示（当日は「今日まで」） */
export function remainingLabel(targetMonth: string, rules: ShiftRules, today = todayJst()): string {
  const days = daysUntilDeadline(targetMonth, rules, today);
  if (days < 0) return "締切済み";
  if (days === 0) return "今日まで";
  return `あと${days}日`;
}

/** なぜ先の月の分を先に出すのか（画面・通知に出す理由） */
export const REQUEST_LEAD_REASON =
  "お客様の2ヶ月先のご予約を確保していきたいため、先の月のシフトを早めに決めます。";

/** 通知文（毎月15日の自動通知・ホームのお知らせ共通） */
export function noticeMessage(targetMonth: string, rules: ShiftRules): string {
  const [y, m] = targetMonth.split("-").map(Number);
  return `${y}年${m}月分の希望休を出してください（締切：${deadlineLabel(targetMonth, rules)}）`;
}

export { thisMonthJst };
