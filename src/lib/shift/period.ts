// シフト希望の募集期間・締切の計算。
// 運用サイクル：毎月15日に「翌月分」の募集を通知 → 前月◯日（既定25日）締切 → 割当 → 確定公開。

import { addMonths, formatDateJa, monthRange, thisMonthJst, todayJst } from "@/lib/date";
import type { ShiftRules } from "@/lib/data/types";

/** 対象月の希望提出締切日（"YYYY-MM-DD"）＝対象月の前月の rules.requestDeadlineDay 日 */
export function requestDeadline(targetMonth: string, rules: ShiftRules): string {
  const prev = addMonths(targetMonth, -1);
  const { to } = monthRange(prev);
  const lastDay = Number(to.slice(8));
  const day = Math.min(rules.requestDeadlineDay, lastDay); // 2月などで月末を超えないように
  return `${prev}-${String(day).padStart(2, "0")}`;
}

/** 対象月の希望がまだ提出・修正できるか（締切日まで可能） */
export function isRequestEditable(targetMonth: string, rules: ShiftRules, today = todayJst()): boolean {
  return today <= requestDeadline(targetMonth, rules);
}

/** いま募集対象となる月（翌月。締切を過ぎていたら翌々月） */
export function currentTargetMonth(rules: ShiftRules, today = todayJst()): string {
  const next = addMonths(today.slice(0, 7), 1);
  return isRequestEditable(next, rules, today) ? next : addMonths(next, 1);
}

/** 募集の告知期間中か（毎月15日〜締切日。ログインバナーの強調表示に使用） */
export function isNoticePeriod(targetMonth: string, rules: ShiftRules, today = todayJst()): boolean {
  const prev = addMonths(targetMonth, -1);
  const noticeStart = `${prev}-15`;
  return today >= noticeStart && today <= requestDeadline(targetMonth, rules);
}

/** 締切日の表示用文字列（例「6月25日(木)」） */
export function deadlineLabel(targetMonth: string, rules: ShiftRules): string {
  return formatDateJa(requestDeadline(targetMonth, rules));
}

/** 通知文（毎月15日の自動通知・ログインバナー共通） */
export function noticeMessage(targetMonth: string, rules: ShiftRules): string {
  const [y, m] = targetMonth.split("-").map(Number);
  return `${y}年${m}月分のシフト希望を提出してください（締切：${deadlineLabel(targetMonth, rules)}）`;
}

export { thisMonthJst };
