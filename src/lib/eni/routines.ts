// 店長・副店長のルーティン業務（デイリー／ウィークリー／マンスリー）の共通ロジック。
// 「今どの期間の分をチェックするのか」をここで一元化し、幹部メニューとバッジで同じ判定を使う。

import { thisMonthJst, weekStartOf } from "@/lib/date";
import type { ManagerRoutine, ManagerRoutineCheck, RoutineCycle } from "@/lib/data/types";

export const ROUTINE_CYCLES: RoutineCycle[] = ["daily", "weekly", "monthly"];

export const ROUTINE_CYCLE_LABEL: Record<RoutineCycle, string> = {
  daily: "デイリー（毎日）",
  weekly: "ウィークリー（毎週）",
  monthly: "マンスリー（毎月）",
};

export const ROUTINE_CYCLE_SHORT: Record<RoutineCycle, string> = {
  daily: "毎日",
  weekly: "毎週",
  monthly: "毎月",
};

/** その周期の「今の期間キー」。daily=日付 / weekly=週の月曜 / monthly="YYYY-MM" */
export function periodKeyOf(cycle: RoutineCycle, today: string): string {
  if (cycle === "weekly") return weekStartOf(today);
  if (cycle === "monthly") return thisMonthJst();
  return today;
}

/** 今チェックすべき期間キーの一覧（重複なし）。実施記録の取得に使う */
export function currentPeriodKeys(today: string): string[] {
  return [...new Set(ROUTINE_CYCLES.map((c) => periodKeyOf(c, today)))];
}

export interface RoutineStatus {
  routine: ManagerRoutine;
  periodKey: string;
  check: ManagerRoutineCheck | null;
  done: boolean;
}

/** マスタ＋実施記録から「今日の状態」を組み立てる（未完了が先頭に来る順） */
export function buildRoutineStatuses(
  routines: ManagerRoutine[],
  checks: ManagerRoutineCheck[],
  today: string
): RoutineStatus[] {
  const checkMap = new Map(checks.map((c) => [`${c.routineId}|${c.periodKey}`, c]));
  return routines
    .filter((r) => r.isActive)
    .map((routine) => {
      const periodKey = periodKeyOf(routine.cycle, today);
      const check = checkMap.get(`${routine.id}|${periodKey}`) ?? null;
      return { routine, periodKey, check, done: Boolean(check) };
    });
}

/** 未完了の件数（アラート表示・サイドバーのバッジに使う） */
export function countUndone(statuses: RoutineStatus[], cycle?: RoutineCycle): number {
  return statuses.filter((s) => !s.done && (!cycle || s.routine.cycle === cycle)).length;
}
