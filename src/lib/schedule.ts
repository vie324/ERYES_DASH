// 出勤スケジュール（基本パターン＋希望休＋個別調整）の解決ロジックと締切ルール。
//
// 優先順位：個別調整（管理者） ＞ 希望休（スタッフ） ＞ 週の基本パターン
// 希望休は「3ヶ月後の月」を対象に、当月の1週目（7日）までに申請する運用。
// （次回予約を2ヶ月先まで受けるため、3ヶ月先の休みを先に確定させる）

import { addMonths } from "@/lib/date";
import type { DayoffRequest, ScheduleOverride, WorkPatternDay } from "@/lib/data/types";

/** 希望休の申請締切日（対象月の3ヶ月前の◯日まで） */
export const DAYOFF_DEADLINE_DAY = 7;
/** 希望休の対象月＝何ヶ月後か */
export const DAYOFF_MONTHS_AHEAD = 3;

/** いま申請を受け付けている対象月（今日から3ヶ月後の月） */
export function defaultDayoffTargetMonth(today: string): string {
  return addMonths(today.slice(0, 7), DAYOFF_MONTHS_AHEAD);
}

/** 対象月の申請締切日（"YYYY-MM-DD"）＝対象月の3ヶ月前の7日 */
export function dayoffDeadline(targetMonth: string): string {
  return `${addMonths(targetMonth, -DAYOFF_MONTHS_AHEAD)}-${String(DAYOFF_DEADLINE_DAY).padStart(2, "0")}`;
}

/** 対象月の希望休がまだ編集できるか（締切前か） */
export function isDayoffEditable(targetMonth: string, today: string): boolean {
  return today <= dayoffDeadline(targetMonth);
}

/** その日の勤務の解決結果 */
export interface ResolvedDay {
  working: boolean;
  startTime: string; // 空文字は時間未設定（終日）
  endTime: string;
  /** どの情報から決まったか（表示の色分け用） */
  source: "pattern" | "dayoff" | "override" | "none";
  note: string;
}

/** パターン・希望休・個別調整を突き合わせて、スタッフ×日付の勤務を決める */
export function resolveScheduleDay(
  staffId: string,
  date: string, // "YYYY-MM-DD"
  weekday: number, // 0=日〜6=土
  patterns: WorkPatternDay[],
  dayoffs: DayoffRequest[],
  overrides: ScheduleOverride[]
): ResolvedDay {
  const override = overrides.find((o) => o.staffId === staffId && o.date === date);
  if (override) {
    return {
      working: override.isWorking,
      startTime: override.startTime,
      endTime: override.endTime,
      source: "override",
      note: override.note,
    };
  }
  if (dayoffs.some((r) => r.staffId === staffId && r.date === date)) {
    return { working: false, startTime: "", endTime: "", source: "dayoff", note: "希望休" };
  }
  const pattern = patterns.find((p) => p.staffId === staffId && p.weekday === weekday);
  if (pattern?.isWorking) {
    return {
      working: true,
      startTime: pattern.startTime,
      endTime: pattern.endTime,
      source: "pattern",
      note: "",
    };
  }
  return {
    working: false,
    startTime: "",
    endTime: "",
    source: pattern ? "pattern" : "none",
    note: "",
  };
}

/** "10:00"〜"16:30" → 表示用 "10:00-16:30"（時間未設定なら "出勤"） */
export function formatWorkTime(day: ResolvedDay): string {
  if (!day.working) return "休";
  return day.startTime && day.endTime ? `${day.startTime}-${day.endTime}` : "出勤";
}
