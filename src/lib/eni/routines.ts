// 毎日の業務（幹部＝店長・副店長のルーティン業務／スタイリストの毎日の業務）の共通ロジック。
// 「今どの期間の分をチェックするのか」「誰の・どの店舗の分か」をここで一元化し、
// 幹部メニュー・タスク画面・バッジ・ホームの集計で同じ判定を使う。
//
//  ・幹部の業務 ……… 店舗ごとに1つチェックする（その店舗の幹部の誰かがやればよい）。対象キー＝店舗ID
//  ・スタイリストの業務 … 一人ひとりがチェックする。対象キー＝スタッフID
// マスタ（項目）は全店舗共通なので、項目を足すと全店舗に出る。

import { thisMonthJst, weekStartOf } from "@/lib/date";
import type {
  ManagerRoutine,
  ManagerRoutineCheck,
  RoutineAudience,
  RoutineCycle,
  Staff,
  Store,
} from "@/lib/data/types";

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

export const ROUTINE_AUDIENCES: RoutineAudience[] = ["exec", "stylist"];

export const ROUTINE_AUDIENCE_LABEL: Record<RoutineAudience, string> = {
  exec: "幹部（店長・副店長）",
  stylist: "スタイリスト",
};

/** 狭い場所（選択ボタンなど）に出す短い呼び名 */
export const ROUTINE_AUDIENCE_SHORT: Record<RoutineAudience, string> = {
  exec: "幹部",
  stylist: "スタイリスト",
};

/** だれがチェックするかの説明（追加フォーム・一覧の補足） */
export const ROUTINE_AUDIENCE_NOTE: Record<RoutineAudience, string> = {
  exec: "店舗ごとに、その店舗の幹部の誰かがチェックします",
  stylist: "スタイリスト一人ひとりが、タスク画面の「今日やること」でチェックします",
};

/** 入力・DBの値を RoutineAudience にそろえる（不明な値は幹部の業務として扱う） */
export function normalizeAudience(raw: unknown): RoutineAudience {
  return raw === "stylist" ? "stylist" : "exec";
}

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

/** 実施記録の対象キー：幹部の業務＝店舗ID／スタイリストの業務＝スタッフID */
export function routineSubjectKey(
  audience: RoutineAudience,
  ids: { storeId: string; staffId: string }
): string {
  return audience === "exec" ? ids.storeId : ids.staffId;
}

export interface RoutineStatus {
  routine: ManagerRoutine;
  periodKey: string;
  check: ManagerRoutineCheck | null;
  done: boolean;
}

/**
 * マスタ＋実施記録から「今の期間の状態」を組み立てる。
 * audience の業務（運用中のもの）だけを、subjectKey（幹部＝店舗／スタイリスト＝本人）の分として見る。
 * 店舗の区別が無かった頃の記録（subjectKey が空）は、幹部の業務ならどの店舗の分としても数える
 * （schema.sql を流し直す前のDBでも、チェックが消えたように見えないようにするため）。
 */
export function buildRoutineStatuses(
  routines: ManagerRoutine[],
  checks: ManagerRoutineCheck[],
  today: string,
  opts: { audience: RoutineAudience; subjectKey: string }
): RoutineStatus[] {
  const checkMap = new Map<string, ManagerRoutineCheck>();
  for (const c of checks) {
    if (c.subjectKey === opts.subjectKey || (c.subjectKey === "" && opts.audience === "exec")) {
      const key = `${c.routineId}|${c.periodKey}`;
      // 店舗つきの記録を優先（同じ期間に両方あるときは新しい方の形を見る）
      if (!checkMap.has(key) || c.subjectKey !== "") checkMap.set(key, c);
    }
  }
  return routines
    .filter((r) => r.isActive && r.audience === opts.audience)
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

/** 完了率の材料（完了した数／全体の数）。cycle を渡すとその周期だけ */
export function completionOf(
  statuses: RoutineStatus[],
  cycle?: RoutineCycle
): { done: number; total: number } {
  const rows = statuses.filter((s) => !cycle || s.routine.cycle === cycle);
  return { done: rows.filter((s) => s.done).length, total: rows.length };
}

/**
 * 幹部の業務を最初に開く店舗：自分の所属店舗（業態の店舗に入っていれば）、なければ業態の最初の店舗。
 * 管理者のように所属が別業態の人でも、いま選んでいる業態の店舗が開くようにする。
 */
export function defaultRoutineStoreId(me: Pick<Staff, "storeId"> | null, stores: Pick<Store, "id">[]): string {
  if (me && stores.some((s) => s.id === me.storeId)) return me.storeId;
  return stores[0]?.id ?? "";
}
