// 出勤予定（基本パターン＋希望休＋個別調整）の1日分の解決ロジック。
//
// シフト表をまだ作っていない月は、これで「いつもどおりの予定」を出す。
// 優先順位：個別調整（管理者） ＞ 希望休（スタッフ） ＞ 週の基本パターン
// シフト表を作った月の扱い・月全体の組み立ては lib/shift/month.ts を参照。
// 希望休の締切（何ヶ月先・何日まで）は lib/shift/period.ts（ルール設定）で決まる。

import type { DayoffRequest, ScheduleOverride, WorkPatternDay } from "@/lib/data/types";

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
  const dayoff = dayoffs.find((r) => r.staffId === staffId && r.date === date);
  if (dayoff) {
    // 管理者の表では理由・有休も見えるようにする（重なったときの判断材料）
    const note = `希望休${dayoff.paidLeave ? "（有休）" : ""}${dayoff.reason ? `：${dayoff.reason}` : ""}`;
    return { working: false, startTime: "", endTime: "", source: "dayoff", note };
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

/** 表のマス用の短い時間表記："10:00","19:00" → "10-19"／"10:30","16:30" → "10:30-16:30" */
export function compactTimeRange(start: string, end: string): string {
  if (!start || !end) return "";
  const short = (t: string) => (t.endsWith(":00") ? String(Number(t.slice(0, 2))) : t.replace(/^0/, ""));
  return `${short(start)}-${short(end)}`;
}
