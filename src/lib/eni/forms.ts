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

// ---- 週報の共通ブロック ----

// ふりかえり部分（全ランク共通の流れ）。ランクで文言だけ少し変える
const weeklyReflection = (doneLabel: string): EniFormItem[] => [
  { key: "done_well", label: doneLabel, type: "textarea", required: true },
  {
    key: "feedback",
    label: "フィードバックしてもらったことや教わったこと",
    type: "textarea",
    required: false,
  },
  { key: "struggle", label: "苦戦していることや自分自身の課題は？", type: "textarea", required: true },
  {
    key: "next_improve",
    label: "来週をさらに良くするためにはどんなことができそう？",
    type: "textarea",
    required: false,
  },
  {
    key: "next_goal",
    label: "来週の目標を具体的に書いてみよう",
    type: "textarea",
    required: true,
    placeholder: "例）ワインディングを15分以内で3回、モデル1名",
  },
  {
    key: "to_senior",
    label: "スタイリストや幹部へ相談やサポートしてほしいこと",
    type: "textarea",
    required: false,
  },
];

// 見てもらった人・サポートしてくれた人（全ランク共通）
const WEEKLY_SUPPORT_ITEMS: EniFormItem[] = [
  {
    key: "watched_by",
    label: "誰に何回見てもらえているのか",
    type: "textarea",
    required: false,
    placeholder: "例）大輝さん3回、結菜さん1回",
  },
  {
    key: "support_people",
    label: "ミーティングなどサポートしてくれた人",
    type: "textarea",
    required: false,
  },
];

// 今週の取り組み状況（ミドル・ファイナル共通の数字）
const WEEKLY_ACTIVITY_ITEMS: EniFormItem[] = [
  { key: "model_count", label: "モデル", type: "number", required: false, unit: "人" },
  { key: "wig_hours", label: "ウィッグ", type: "number", required: false, unit: "時間" },
  { key: "sns_hours", label: "SNS", type: "number", required: false, unit: "時間" },
  { key: "sns_posts", label: "SNS投稿", type: "number", required: false, unit: "投稿" },
  { key: "roleplay_count", label: "ロープレ", type: "number", required: false, unit: "回" },
  { key: "other_hours", label: "撮影・勉強など その他", type: "number", required: false, unit: "時間" },
  {
    key: "other_activity",
    label: "その他の取り組み（自由記入）",
    type: "textarea",
    required: false,
    placeholder: "例）撮影1本、カラー理論の勉強",
  },
];

const WEEKLY_ITEMS_BY_RANK: Record<Exclude<AssistantRank, "">, EniFormItem[]> = {
  // ファースト：基礎の習得期。練習量と、見てもらった回数を大切にする
  first: [
    {
      key: "practice_hours",
      label: "今週の練習時間",
      type: "number",
      required: false,
      unit: "時間",
      note: "だいたいの合計でOK",
    },
    ...WEEKLY_SUPPORT_ITEMS,
    ...weeklyReflection("できるようになったこと・良かったこと"),
  ],
  // ミドル：モデル・SNS・ロープレなど取り組みの量を見える化する
  middle: [
    ...WEEKLY_ACTIVITY_ITEMS,
    ...WEEKLY_SUPPORT_ITEMS,
    ...weeklyReflection("頑張ったこと、嬉しかったこと、人に喜んでもらえたこと"),
  ],
  // ファイナル：ミドルと同じ取り組み＋デビュー設定（設定は週報の先頭に常時表示）
  final: [
    ...WEEKLY_ACTIVITY_ITEMS,
    ...WEEKLY_SUPPORT_ITEMS,
    ...weeklyReflection("頑張ったこと、嬉しかったこと、人に喜んでもらえたこと"),
  ],
};

// 未設定ランク（ランク付け前）のフォールバック
const WEEKLY_ITEMS_DEFAULT: EniFormItem[] = [
  { key: "practice_hours", label: "今週の練習時間", type: "number", required: false, unit: "時間" },
  ...WEEKLY_SUPPORT_ITEMS,
  ...weeklyReflection("できるようになったこと・良かったこと"),
];

// ---- アシスタントの継続設定（週報の先頭に常時表示。随時変更できる） ----

export interface AssistantSettingDef {
  key: string;
  label: string;
  note?: string;
  placeholder?: string;
  /** 見出しに「〇〇の」と名前を入れるか */
  withName?: boolean;
}

/** 3段のピラミッド（下から：大切にしたい価値観 → 理想の未来像 → 目標） */
export const PYRAMID_SETTINGS: AssistantSettingDef[] = [
  { key: "pyramid_goal", label: "目標", placeholder: "例）来年3月にデビューして指名を10名いただく" },
  { key: "pyramid_future", label: "理想の未来像", placeholder: "例）お客様の人生が明るくなる美容師" },
  { key: "pyramid_value", label: "大切にしたい価値観", placeholder: "例）誠実さ・感謝・素直さ" },
];

const PROMISE_SETTING: AssistantSettingDef = {
  key: "promise",
  label: "自分との約束【習慣化行動目標】",
  note: "変更は随時できます",
  placeholder: "例）毎朝10分ウィッグに触る／営業後に必ず1回練習する",
  withName: true,
};

/** ランクごとの「常時表示される設定」 */
export function getAssistantSettingDefs(rank: AssistantRank): AssistantSettingDef[] {
  if (rank === "middle") {
    return [
      { key: "year_goal", label: "年内の目標設定", note: "変更は随時できます", withName: true },
      PROMISE_SETTING,
    ];
  }
  if (rank === "final") {
    return [
      {
        key: "debut_plan",
        label: "デビュー／デビュー後3ヶ月の設定",
        note: "何月何日にデビュー／デビュー後3ヶ月までに達成したい状況を細かく",
        placeholder: "例）4月1日デビュー。3ヶ月で指名20名／客単価12,000円",
        withName: true,
      },
      { key: "goal_1m", label: "1ヶ月後の目標", note: "月の頭に見直す" },
      { key: "goal_3m", label: "3ヶ月後の目標", note: "月の頭に見直す" },
      { key: "goal_5m", label: "5ヶ月後の目標", note: "月の頭に見直す" },
      PROMISE_SETTING,
    ];
  }
  return [];
}

/** ピラミッドを表示するランク（ミドル・ファイナル） */
export function hasPyramid(rank: AssistantRank): boolean {
  return rank === "middle" || rank === "final";
}

/** 設定キーの一覧（保存時の検証に使う） */
export function allAssistantSettingKeys(): string[] {
  const keys = new Set<string>(PYRAMID_SETTINGS.map((s) => s.key));
  for (const rank of ["middle", "final"] as const) {
    for (const def of getAssistantSettingDefs(rank)) keys.add(def.key);
  }
  return [...keys];
}

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

// ---- スタイリスト日報の時間まとめ ----
// お客様1人ずつの±を書くのは手間なので、その日の合計（早く終わった／オーバー）を本人が記入する。
// 稼働率は「施術時間の合計」を入れたときだけ出す（任意項目）。

export interface StylistTimeInput {
  /** 今日の客数（人） */
  clientCount: number;
  /** 予定より早く終わった時間の合計（分） */
  minutesEarly: number;
  /** 予定をオーバーした時間の合計（分） */
  minutesOver: number;
  /** 今日の勤務時間（分）。シフトから自動で入る */
  workMinutes: number;
  /** 施術時間の合計（分）。任意。入れると稼働率を計算する */
  serviceMinutes: number;
}

export interface StylistCalc {
  /** 施術時間の合計±（分）。＋はオーバー、−は早く終わった */
  timeDiff: number;
  /** 稼働率（%）。施術時間の合計が未入力なら null */
  utilization: number | null;
}

/**
 * 施術時間の合計± ＝ オーバー − 早く終わった
 * 稼働率 ＝（施術時間の合計 − 客数×60分）÷ 勤務時間
 *   ※ 1人あたり前後30分（受付・仕上げ・お会計＝アシスタント対応分）を除く、という従来の考え方
 */
export function computeStylistCalc(input: StylistTimeInput): StylistCalc {
  const timeDiff = input.minutesOver - input.minutesEarly;
  const busy = Math.max(0, input.serviceMinutes - input.clientCount * 60);
  const utilization =
    input.serviceMinutes > 0 && input.workMinutes > 0
      ? Math.round((busy / input.workMinutes) * 1000) / 10
      : null;
  return { timeDiff, utilization };
}
