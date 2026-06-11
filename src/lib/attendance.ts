// 勤怠の集計ロジック：有効打刻（is_valid）を日ごとに出勤→退勤でペアにして労働時間を計算する。
// TODO: 残業の定義は仮置き（1日8時間を超えた分を残業として月次累計）。
//       休憩控除・所定労働時間の扱いはクライアント確認後に調整する。

import { jstDateOf, formatTimeJa } from "@/lib/date";
import type { Attendance } from "@/lib/data/types";

const STANDARD_HOURS_PER_DAY = 8;

export interface DayAttendance {
  date: string; // "YYYY-MM-DD"（JST）
  inAt: Date | null;
  outAt: Date | null;
  workMinutes: number; // ペア成立分の合計
  hasOpenPunch: boolean; // 退勤打刻が無い出勤がある
}

export interface MonthlyAttendance {
  days: DayAttendance[];
  workDays: number;
  totalMinutes: number;
  overtimeMinutes: number; // Σ max(0, 日の労働時間 - 8h)
}

/** 1スタッフ分の打刻リスト（時刻昇順）を日次・月次に集計する */
export function aggregateAttendance(punches: Attendance[]): MonthlyAttendance {
  const valid = punches
    .filter((p) => p.isValid)
    .sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());

  const byDay = new Map<string, Attendance[]>();
  for (const p of valid) {
    const d = jstDateOf(p.punchedAt);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(p);
  }

  const days: DayAttendance[] = [];
  let totalMinutes = 0;
  let overtimeMinutes = 0;

  for (const [date, list] of [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    let workMinutes = 0;
    let openIn: Date | null = null;
    let firstIn: Date | null = null;
    let lastOut: Date | null = null;
    let hasOpenPunch = false;

    // 出勤→退勤を順番にペアリング。複数回の出退勤（中抜け）にも対応
    for (const p of list) {
      if (p.punchType === "in") {
        if (openIn) hasOpenPunch = true; // 出勤が連続（退勤忘れ）
        openIn = p.punchedAt;
        if (!firstIn) firstIn = p.punchedAt;
      } else {
        if (openIn) {
          workMinutes += Math.max(
            0,
            Math.round((p.punchedAt.getTime() - openIn.getTime()) / 60000)
          );
          openIn = null;
        }
        lastOut = p.punchedAt;
      }
    }
    if (openIn) hasOpenPunch = true; // 退勤打刻がまだ無い

    totalMinutes += workMinutes;
    overtimeMinutes += Math.max(0, workMinutes - STANDARD_HOURS_PER_DAY * 60);
    days.push({ date, inAt: firstIn, outAt: lastOut, workMinutes, hasOpenPunch });
  }

  return { days, workDays: days.length, totalMinutes, overtimeMinutes };
}

/** 固定残業時間に対する状態。"over"=超過 / "warning"=超過しそう（80%以上） / "ok" */
export function overtimeStatus(
  overtimeMinutes: number,
  fixedOvertimeHours: number
): "over" | "warning" | "ok" {
  const limit = fixedOvertimeHours * 60;
  if (limit <= 0) return overtimeMinutes > 0 ? "over" : "ok";
  if (overtimeMinutes >= limit) return "over";
  if (overtimeMinutes >= limit * 0.8) return "warning";
  return "ok";
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}時間${String(m).padStart(2, "0")}分`;
}

export function formatPunchTime(d: Date | null): string {
  return d ? formatTimeJa(d) : "−";
}
