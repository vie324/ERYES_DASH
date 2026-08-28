// 予約表（タイムテーブル）の共通ロジック。サーバー・クライアント双方から使う純粋関数だけを置く。
// ScheduleBlock = { d: 曜日index, s: "HH:mm", e: "HH:mm", a: 内容 }

import { weekdayOf } from "@/lib/date";
import type { ScheduleBlock } from "@/lib/data/types";

export const PX_PER_HOUR = 56; // グリッド1時間の高さ（px）
export const SLOT_MIN = 30; // タップしたときに作られる枠の刻み

/** "HH:mm" → 0:00からの分 */
export function toMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** 分 → "HH:mm"（0:00〜24:00にまるめる） */
export function toHM(min: number): string {
  const c = Math.max(0, Math.min(24 * 60, Math.round(min)));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
}

/** 所要時間の表示："90 → 1時間30分" */
export function durationLabel(block: ScheduleBlock): string {
  const min = Math.max(0, toMin(block.e) - toMin(block.s));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * 保存前の正規化。時刻の形式・前後関係・件数・文字数をここで揃える。
 * サーバーアクションからもクライアントからも同じ結果になるようにしておく。
 */
export function normalizeBlocks(input: unknown, dayCount: number): ScheduleBlock[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const d = Number(r.d);
      const s = String(r.s ?? "");
      const e = String(r.e ?? "");
      return {
        d: Number.isInteger(d) && d >= 0 && d < dayCount ? d : 0,
        s: TIME_RE.test(s) ? s : "",
        e: TIME_RE.test(e) || e === "24:00" ? e : "",
        a: String(r.a ?? "").trim().slice(0, 60),
      };
    })
    .filter((b) => b.s && b.e && b.a && toMin(b.e) > toMin(b.s))
    .sort((a, b) => a.d - b.d || toMin(a.s) - toMin(b.s))
    .slice(0, 120);
}

/** JSON文字列 → ScheduleBlock[]（壊れていたら空配列） */
export function parseBlocks(raw: string, dayCount: number): ScheduleBlock[] {
  try {
    return normalizeBlocks(JSON.parse(raw || "[]"), dayCount);
  } catch {
    return [];
  }
}

/** 旧形式（1時間ごとの {t, a}）→ 予約表の帯に変換して表示できるようにする */
export function blocksFromLegacyRows(rows: { t: string; a: string }[] | undefined): ScheduleBlock[] {
  if (!rows || rows.length === 0) return [];
  return normalizeBlocks(
    rows.map((r) => ({ d: 0, s: r.t, e: toHM(toMin(r.t) + 60), a: r.a })),
    1
  );
}

/**
 * 計画スケジュール（1週間）の保存形式。
 * 新：{"v":2,"blocks":[...]} ／ 旧：[{t,a}]（1日ぶんのみ）も読めるようにしておく。
 */
export function parseWeekContent(content: string): ScheduleBlock[] {
  if (!content.trim()) return [];
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return blocksFromLegacyRows(parsed as { t: string; a: string }[]);
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { blocks?: unknown }).blocks)) {
      return normalizeBlocks((parsed as { blocks: unknown }).blocks, 7);
    }
  } catch {
    return [];
  }
  return [];
}

/** 保存用の文字列にする */
export function stringifyWeekContent(blocks: ScheduleBlock[]): string {
  return JSON.stringify({ v: 2, blocks });
}

/** 表示に使う時間帯を、予定の内容に合わせて広げる（早番・遅番どちらでも切れないように） */
export function fitHourRange(
  blocks: ScheduleBlock[],
  defaultStart: number,
  defaultEnd: number
): { startHour: number; endHour: number } {
  let startHour = defaultStart;
  let endHour = defaultEnd;
  for (const b of blocks) {
    startHour = Math.min(startHour, Math.floor(toMin(b.s) / 60));
    endHour = Math.max(endHour, Math.ceil(toMin(b.e) / 60));
  }
  return { startHour: Math.max(0, startHour), endHour: Math.min(24, Math.max(endHour, startHour + 1)) };
}

export interface PlacedBlock {
  block: ScheduleBlock;
  index: number; // 元配列でのindex（編集・削除に使う）
  top: number; // %（列の高さに対する位置）
  height: number; // %
  lane: number; // 重なったときの横位置
  lanes: number; // 重なりの数
}

/**
 * 1列（1日）ぶんの配置を計算する。時間が重なる予定は横に並べる。
 * startHour〜endHour の外にはみ出す分は端で切り詰める。
 */
export function placeBlocks(
  blocks: ScheduleBlock[],
  indices: number[],
  startHour: number,
  endHour: number
): PlacedBlock[] {
  const rangeStart = startHour * 60;
  const rangeEnd = endHour * 60;
  const span = Math.max(1, rangeEnd - rangeStart);

  const items = indices
    .map((index) => ({ index, block: blocks[index] }))
    .map(({ index, block }) => ({
      index,
      block,
      s: Math.max(rangeStart, toMin(block.s)),
      e: Math.min(rangeEnd, toMin(block.e)),
    }))
    .filter((it) => it.e > it.s)
    .sort((a, b) => a.s - b.s || a.e - b.e);

  const placed: PlacedBlock[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -1;

  const flush = () => {
    const laneEnds: number[] = [];
    const laneOf = new Map<number, number>();
    for (const it of cluster) {
      let lane = laneEnds.findIndex((end) => end <= it.s);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.e);
      } else {
        laneEnds[lane] = it.e;
      }
      laneOf.set(it.index, lane);
    }
    for (const it of cluster) {
      placed.push({
        block: it.block,
        index: it.index,
        top: ((it.s - rangeStart) / span) * 100,
        height: ((it.e - it.s) / span) * 100,
        lane: laneOf.get(it.index) ?? 0,
        lanes: laneEnds.length,
      });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const it of items) {
    if (cluster.length > 0 && it.s >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  if (cluster.length > 0) flush();
  return placed;
}

// 内容ごとに色を変えて、ぱっと見で種類が分かるようにする（ブランド配色に馴染む淡色）
const BLOCK_COLORS = [
  "bg-brand-100 border-brand-300 text-brand-900",
  "bg-sky-100 border-sky-300 text-sky-900",
  "bg-emerald-100 border-emerald-300 text-emerald-900",
  "bg-amber-100 border-amber-300 text-amber-900",
  "bg-rose-100 border-rose-300 text-rose-900",
  "bg-violet-100 border-violet-300 text-violet-900",
];

/** 内容の文字列から色を決める（同じ内容はいつも同じ色） */
export function blockColor(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  return BLOCK_COLORS[hash % BLOCK_COLORS.length];
}

/** 曜日ラベル（月はじまり） */
export const WEEK_DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

// ---- 「今日のスケジュール」と「計画スケジュール」を突き合わせるための計算 ----

/** 計画スケジュールの週（第1〜4週）のキー */
export const PLAN_WEEK_SCOPES = ["week1", "week2", "week3", "week4"] as const;
export type PlanWeekScope = (typeof PLAN_WEEK_SCOPES)[number];

/** 日付 "YYYY-MM-DD" → 計画スケジュールの週スコープ（第1〜4週。第5週は第4週を使う） */
export function planScopeOfDate(dateStr: string): PlanWeekScope {
  const day = Number(dateStr.slice(8, 10));
  const index = Math.min(3, Math.max(0, Math.floor((day - 1) / 7)));
  return PLAN_WEEK_SCOPES[index];
}

/** 日付 → 計画スケジュールの列index（月曜=0 〜 日曜=6） */
export function planDayIndexOfDate(dateStr: string): number {
  const weekday = weekdayOf(dateStr); // 0=日
  return (weekday + 6) % 7;
}

/** 計画（1週間ぶん）から、その日にあたる列だけを1日ぶんの帯に取り出す */
export function planBlocksForDate(weekBlocks: ScheduleBlock[], dateStr: string): ScheduleBlock[] {
  const d = planDayIndexOfDate(dateStr);
  return weekBlocks.filter((b) => b.d === d).map((b) => ({ ...b, d: 0 }));
}

/** 帯の合計時間（分） */
export function totalMinutes(blocks: ScheduleBlock[]): number {
  return blocks.reduce((sum, b) => sum + Math.max(0, toMin(b.e) - toMin(b.s)), 0);
}

export interface PlanDiffRow {
  label: string;
  planMin: number;
  actualMin: number;
  diffMin: number;
}

/**
 * 計画と当日の予定を「内容ごとの時間」で突き合わせる。
 * 何にどれだけ時間を使う計画で、実際どうなっているのかを、ひと目で見比べられるようにする。
 */
export function comparePlan(plan: ScheduleBlock[], actual: ScheduleBlock[]): PlanDiffRow[] {
  const minutesByLabel = (blocks: ScheduleBlock[]) => {
    const map = new Map<string, number>();
    for (const b of blocks) {
      const min = Math.max(0, toMin(b.e) - toMin(b.s));
      map.set(b.a, (map.get(b.a) ?? 0) + min);
    }
    return map;
  };
  const planMap = minutesByLabel(plan);
  const actualMap = minutesByLabel(actual);
  const labels = [...new Set([...planMap.keys(), ...actualMap.keys()])];
  return labels
    .map((label) => {
      const planMin = planMap.get(label) ?? 0;
      const actualMin = actualMap.get(label) ?? 0;
      return { label, planMin, actualMin, diffMin: actualMin - planMin };
    })
    .sort((a, b) => Math.max(b.planMin, b.actualMin) - Math.max(a.planMin, a.actualMin));
}

/** 分 → 「1h30」形式（差分表示にも使うので符号は呼び出し側で付ける） */
export function minutesLabel(min: number): string {
  const abs = Math.abs(Math.round(min));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}
