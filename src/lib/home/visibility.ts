// ホームの「見える化」5項目の、誰に何を見せるかの設定。
// 管理者が管理画面（ホームの設定）で項目ごとに変えられる。保存先は app_settings の home_visibility。
// 初期値は酒井案（ENiの確認待ち）：
//
// | 項目 | 全員 | 本人 | 幹部・管理者 |
// | ①ありがとうを送った人・もらった人 | 名前で表示 | ○ | ○（名前） |
// | ②前の週の週報が未完了の人 | 店舗ごとの提出率だけ | 自分の分 | 名前で表示 |
// | ③未完了タスクがある人 | 店舗ごとの件数だけ | 自分の分 | 名前で表示 |
// | ④トーク通知の未読者 | 既読率だけ | 自分の分 | 名前で表示 |
// | ⑤店舗ごとの幹部ルーティンの状況 | 出さない | 自分の分 | 幹部・管理者で共有（名前） |
//
// 名前つきのデータは、見る権限のない人には集計の段階で外す（lib/home/insights.ts）。画面で隠すだけにはしない。

export type InsightKey = "thanks" | "weeklyReports" | "tasks" | "unread" | "routines";

/**
 * 見せ方。
 *  ・names＝名前（中身）まで出す
 *  ・summary＝集計だけ（提出率・件数・既読率など。名前は出さない）
 *  ・none＝出さない
 */
export type InsightLevel = "names" | "summary" | "none";

export interface InsightVisibility {
  /** 幹部・管理者以外の全員に */
  all: InsightLevel;
  /** 本人に「自分の分」を出すか */
  self: boolean;
  /** 幹部・管理者に */
  exec: InsightLevel;
}

export interface InsightDef {
  key: InsightKey;
  title: string;
  /** 集計の決め方（画面の小さな説明・管理画面の説明に出す） */
  definition: string;
  /** 「集計だけ」のときに出すもの */
  summaryLabel: string;
}

export const INSIGHT_DEFS: InsightDef[] = [
  {
    key: "thanks",
    title: "ありがとうを送った人・もらった人",
    definition: "今週（月〜日）にサンクスカードを送った人・もらった人",
    summaryLabel: "人数・枚数",
  },
  {
    key: "weeklyReports",
    title: "前の週の週報が未完了の人",
    definition: "週報の提出が必要な人（アシスタント）のうち、前の週の分を出していない人",
    summaryLabel: "店舗ごとの提出率",
  },
  {
    key: "tasks",
    title: "未完了タスクがある人",
    definition: "期限を過ぎた未完了のタスク、または前日までの7日間にやり残したルーティンがある人",
    summaryLabel: "店舗ごとの件数",
  },
  {
    key: "unread",
    title: "トーク通知の未読者",
    definition: "入っているトークで、投稿から24時間たっても未読のままの人",
    summaryLabel: "既読率",
  },
  {
    key: "routines",
    title: "店舗ごとの幹部ルーティンの状況",
    definition: "店舗ごとの、今日の幹部（店長・副店長）の毎日のルーティンの完了率",
    summaryLabel: "店舗ごとの完了率",
  },
];

export const INSIGHT_LEVEL_LABEL: Record<InsightLevel, string> = {
  names: "名前で表示",
  summary: "集計だけ",
  none: "出さない",
};

/** 酒井案（初期値） */
export const DEFAULT_INSIGHT_VISIBILITY: Record<InsightKey, InsightVisibility> = {
  thanks: { all: "names", self: true, exec: "names" },
  weeklyReports: { all: "summary", self: true, exec: "names" },
  tasks: { all: "summary", self: true, exec: "names" },
  unread: { all: "summary", self: true, exec: "names" },
  routines: { all: "none", self: true, exec: "names" },
};

export const HOME_VISIBILITY_KEY = "home_visibility";

function isLevel(v: unknown): v is InsightLevel {
  return v === "names" || v === "summary" || v === "none";
}

/** 保存されたJSONを読む（足りない項目・壊れた値は初期値で埋める） */
export function parseInsightVisibility(raw: string | undefined | null): Record<InsightKey, InsightVisibility> {
  const result: Record<InsightKey, InsightVisibility> = JSON.parse(JSON.stringify(DEFAULT_INSIGHT_VISIBILITY));
  if (!raw) return result;
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<Record<keyof InsightVisibility, unknown>>>;
    for (const def of INSIGHT_DEFS) {
      const row = parsed[def.key];
      if (!row || typeof row !== "object") continue;
      if (isLevel(row.all)) result[def.key].all = row.all;
      if (isLevel(row.exec)) result[def.key].exec = row.exec;
      if (typeof row.self === "boolean") result[def.key].self = row.self;
    }
  } catch {
    // 壊れた設定は初期値に戻す
  }
  return result;
}

/** 見ている人に、その項目をどこまで出すか（幹部・管理者は exec、それ以外は all） */
export function levelFor(visibility: InsightVisibility, viewer: { isExec: boolean }): InsightLevel {
  return viewer.isExec ? visibility.exec : visibility.all;
}
