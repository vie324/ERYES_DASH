// ENi（ヘアサロン）の報告フォーマット定義。
// 項目の増減・文言変更はこのファイルの修正だけで完結する（回答はJSONで保存しているためDB変更不要）。

import type { AssistantRank } from "@/lib/data/types";

export type EniItemType = "number" | "text" | "textarea" | "radio";

export interface EniFormItem {
  key: string;
  label: string;
  type: EniItemType;
  required: boolean;
  options?: string[]; // radio用
  unit?: string; // number用（人・円・件・分）
  placeholder?: string;
  note?: string;
}

// ---- スタイリスト日報（毎日・スタイリスト） ----
// 客数・稼働率・施術時間の±は「来店ごとの入力」から自動計算する（page側の専用UI）。
// ここでは数字（売上・次回予約）と、ふりかえりのテキスト項目を定義する。
export const STYLIST_REPORT_NUMBERS: EniFormItem[] = [
  { key: "new_clients", label: "新規", type: "number", required: false, unit: "人" },
  { key: "service_sales", label: "技術売上", type: "number", required: false, unit: "円" },
  { key: "retail_sales", label: "店販売上", type: "number", required: false, unit: "円" },
  { key: "next_bookings", label: "次回予約が取れた数", type: "number", required: false, unit: "件" },
];

export const STYLIST_REPORT_TEXTS: EniFormItem[] = [
  {
    key: "good_point",
    label: "今日の良かったこと・楽しかったこと",
    type: "textarea",
    required: false,
    placeholder: "例）カラーの提案を喜んでいただけた",
  },
  {
    key: "self_issue",
    label: "自分自身、課題に感じていることは？",
    type: "textarea",
    required: false,
  },
  {
    key: "improve_idea",
    label: "どんなことをすればよりプラスになりそうですか？",
    type: "textarea",
    required: false,
  },
  {
    key: "onsite_notice",
    label: "現場での何か気付きはありますか？",
    type: "textarea",
    required: false,
  },
  {
    key: "staff_share",
    label: "スタッフへの指導や共有したことメモ",
    type: "textarea",
    required: false,
  },
];

// スタイリスト日報のうち、フォームから素直に検証・保存する項目（数字＋テキスト）
export const STYLIST_REPORT_ITEMS: EniFormItem[] = [
  ...STYLIST_REPORT_NUMBERS,
  ...STYLIST_REPORT_TEXTS,
];

// ---- アシスタント週報（毎週・ランク別） ----
export const RANK_LABEL: Record<AssistantRank, string> = {
  "": "未設定",
  first: "ファースト",
  middle: "ミドル",
  final: "ファイナル",
};

// 全ランク共通で末尾に付く「練習」と「来週の目標」。
// 練習は毎日入力をやめ、週報の中でまとめて振り返る。
const WEEKLY_PRACTICE_ITEMS: EniFormItem[] = [
  {
    key: "practice_minutes",
    label: "今週の練習時間（合計）",
    type: "number",
    required: false,
    unit: "分",
    note: "だいたいの合計でOK（例：90分なら90）",
  },
  {
    key: "practice_content",
    label: "今週の練習内容・ふりかえり",
    type: "textarea",
    required: false,
    placeholder: "例）ワインディング／レイヤーカット／モデル1名 など",
  },
];

const WEEKLY_GOAL_REVIEW: EniFormItem = {
  key: "goal_review",
  label: "今週の目標のふりかえり",
  type: "radio",
  required: true,
  options: ["達成できた", "一部達成できた", "達成できなかった"],
};

const WEEKLY_NEXT_GOAL: EniFormItem = {
  key: "next_goal",
  label: "来週の目標",
  type: "textarea",
  required: true,
  placeholder: "例）ブロー練習を週3回、モデルさん1名",
};

const WEEKLY_ITEMS_BY_RANK: Record<Exclude<AssistantRank, "">, EniFormItem[]> = {
  // ファースト：基礎技術の習得期
  first: [
    WEEKLY_GOAL_REVIEW,
    { key: "basics_done", label: "できるようになった技術・基礎", type: "textarea", required: true, placeholder: "例）シャンプー、ワインディングの基本" },
    { key: "struggle", label: "苦戦していること・つまずき", type: "textarea", required: true },
    ...WEEKLY_PRACTICE_ITEMS,
    WEEKLY_NEXT_GOAL,
    { key: "to_senior", label: "先輩・幹部への相談や共有（任意）", type: "textarea", required: false },
  ],
  // ミドル：モデル施術・デビュー準備期
  middle: [
    WEEKLY_GOAL_REVIEW,
    { key: "model_count", label: "今週のモデル施術数", type: "number", required: false, unit: "人" },
    { key: "growth", label: "伸びた点・お客様/モデルの反応", type: "textarea", required: true },
    { key: "struggle", label: "課題（スピード・仕上がり・提案 等）", type: "textarea", required: true },
    ...WEEKLY_PRACTICE_ITEMS,
    { key: "debut_prep", label: "デビューに向けて今必要だと思うこと", type: "textarea", required: false },
    WEEKLY_NEXT_GOAL,
  ],
  // ファイナル：デビュー直前・経営/数字視点
  final: [
    WEEKLY_GOAL_REVIEW,
    { key: "kpi_view", label: "数字（客数・売上・指名）の意識とふりかえり", type: "textarea", required: true },
    { key: "strengths", label: "自分の強み・差別化できるところ", type: "textarea", required: true },
    { key: "weakness", label: "デビューまでに克服したい弱み", type: "textarea", required: true },
    ...WEEKLY_PRACTICE_ITEMS,
    {
      key: "debut_ready",
      label: "デビューの準備度（自己評価）",
      type: "radio",
      required: false,
      options: ["準備万端", "あと少し", "まだ課題が多い"],
    },
    WEEKLY_NEXT_GOAL,
  ],
};

// 未設定ランク（ランク付け前）のフォールバック
const WEEKLY_ITEMS_DEFAULT: EniFormItem[] = [
  WEEKLY_GOAL_REVIEW,
  { key: "done_well", label: "できるようになったこと・良かったこと", type: "textarea", required: true },
  { key: "struggle", label: "苦戦していること・課題", type: "textarea", required: true },
  ...WEEKLY_PRACTICE_ITEMS,
  WEEKLY_NEXT_GOAL,
  { key: "request", label: "スタイリスト・幹部への相談（任意）", type: "textarea", required: false },
];

/** ランクに応じた週報の項目一覧 */
export function getWeeklyItems(rank: AssistantRank): EniFormItem[] {
  return rank ? WEEKLY_ITEMS_BY_RANK[rank] : WEEKLY_ITEMS_DEFAULT;
}

// 過去の週報を正しく表示できるよう、全ランクの項目キーの和集合も用意する（閲覧側で使用）
export const ALL_WEEKLY_ITEMS: EniFormItem[] = (() => {
  const seen = new Set<string>();
  const all: EniFormItem[] = [];
  for (const items of [WEEKLY_ITEMS_DEFAULT, ...Object.values(WEEKLY_ITEMS_BY_RANK)]) {
    for (const item of items) {
      if (!seen.has(item.key)) {
        seen.add(item.key);
        all.push(item);
      }
    }
  }
  return all;
})();

const MAX_TEXT = 200;
const MAX_TEXTAREA = 2000;

export interface EniValidationResult {
  ok: boolean;
  errors: string[];
  answers: Record<string, unknown>;
}

/** フォーム回答のサーバー側バリデーション（定義済み項目のみ残す） */
export function validateEniAnswers(items: EniFormItem[], input: unknown): EniValidationResult {
  const errors: string[] = [];
  const answers: Record<string, unknown> = {};
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;

  for (const item of items) {
    const value = raw[item.key];
    switch (item.type) {
      case "number": {
        const n = Number(String(value ?? "").trim() || 0);
        if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
          errors.push(`「${item.label}」は0以上の整数で入力してください`);
          answers[item.key] = 0;
        } else {
          answers[item.key] = n;
        }
        break;
      }
      case "radio": {
        const s = typeof value === "string" ? value : "";
        if (s && !item.options?.includes(s)) {
          errors.push(`「${item.label}」の選択値が不正です`);
        } else if (item.required && !s) {
          errors.push(`「${item.label}」を選択してください`);
        }
        answers[item.key] = s;
        break;
      }
      default: {
        const max = item.type === "textarea" ? MAX_TEXTAREA : MAX_TEXT;
        const s = typeof value === "string" ? value.trim().slice(0, max) : "";
        if (item.required && !s) errors.push(`「${item.label}」を入力してください`);
        answers[item.key] = s;
        break;
      }
    }
  }
  return { ok: errors.length === 0, errors, answers };
}

/** 回答の表示用文字列 */
export function formatEniAnswer(item: EniFormItem, value: unknown): string {
  if (value === undefined || value === null || value === "") return "（未記入）";
  if (item.type === "number") return `${Number(value).toLocaleString()}${item.unit ?? ""}`;
  return String(value);
}

// ---- スタイリスト日報の稼働率・施術時間の自動計算 ----

export interface ClientEntry {
  booked: number; // 予約（約束）時間・分
  actual: number; // 実際の施術時間・分
}

export interface StylistCalc {
  clientCount: number;
  utilization: number; // 稼働率（%）
  timeDiff: number; // 施術時間の合計（実 − 予約）分。マイナスなら早い
}

/** 稼働率＝各予約の前後30分（受付/仕上げ/お会計＝アシスタント対応分）を除いた拘束時間 ÷ 勤務時間 */
export function computeStylistCalc(entries: ClientEntry[], workMinutes: number): StylistCalc {
  const valid = entries.filter((e) => e.booked > 0 || e.actual > 0);
  const busy = valid.reduce((sum, e) => sum + Math.max(0, e.booked - 60), 0);
  const utilization = workMinutes > 0 ? Math.round((busy / workMinutes) * 1000) / 10 : 0;
  const timeDiff = valid.reduce((sum, e) => sum + (e.actual - e.booked), 0);
  return { clientCount: valid.length, utilization, timeDiff };
}
