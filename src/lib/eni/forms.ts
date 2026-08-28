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
  /** 入力欄の下に薄く出す例示・補足 */
  note?: string;
  /** 数字項目をまとめる見出し（同じ見出しの項目が1つの枠に並ぶ） */
  group?: string;
}

// ---- スタイリスト日報（毎日・スタイリスト） ----
// 客数・入客時間・次回予約は page 側の専用UI（稼働率・次回予約率を自動計算して見せる）。
// ここでは数字（売上）と、ふりかえりのテキスト項目を定義する。
export const STYLIST_REPORT_NUMBERS: EniFormItem[] = [
  { key: "new_clients", label: "新規", type: "number", required: false, unit: "人" },
  { key: "service_sales", label: "技術売上", type: "number", required: false, unit: "円" },
  { key: "retail_sales", label: "店販売上", type: "number", required: false, unit: "円" },
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
    placeholder: "例）〇〇さん3回、〇〇さん1回",
  },
  {
    key: "support_people",
    label: "ミーティングなどサポートしてくれた人",
    type: "textarea",
    required: false,
  },
];

// 今週の練習時間。「何に時間を使ったか」が分かるよう3本に分ける（全ランク共通）。
// note は入力欄の下に薄く出る例示。何を書けばよいか迷わないようにするためのもの。
export const WEEKLY_PRACTICE_GROUP = "今週の練習時間";

export const WEEKLY_PRACTICE_ITEMS: EniFormItem[] = [
  {
    key: "practice_hours",
    label: "練習",
    type: "number",
    required: false,
    unit: "時間",
    note: "例）ウィッグ練習やモデル練習など",
    group: WEEKLY_PRACTICE_GROUP,
  },
  {
    key: "sns_hours",
    label: "SNS",
    type: "number",
    required: false,
    unit: "時間",
    note: "例）何時間更新作業や投稿作成に使用したか",
    group: WEEKLY_PRACTICE_GROUP,
  },
  {
    key: "other_hours",
    label: "その他",
    type: "number",
    required: false,
    unit: "時間",
    note: "例）まとめ作業・スケジュール作成・振り返り・整理の時間など",
    group: WEEKLY_PRACTICE_GROUP,
  },
];

/** 週報の「今週の練習時間」に含めるキー（ダッシュボードの集計と揃える） */
export const WEEKLY_PRACTICE_KEYS = WEEKLY_PRACTICE_ITEMS.map((i) => i.key);

/** 回答から今週の練習時間の合計（時間）を出す */
export function practiceHoursOf(answers: Record<string, unknown>): number {
  return WEEKLY_PRACTICE_KEYS.reduce((sum, key) => {
    const v = answers[key];
    return sum + (typeof v === "number" && Number.isFinite(v) ? v : 0);
  }, 0);
}

/** 内訳（練習・SNS・その他）を表示用に取り出す */
export function practiceBreakdownOf(
  answers: Record<string, unknown>
): { label: string; hours: number }[] {
  return WEEKLY_PRACTICE_ITEMS.map((item) => ({
    label: item.label,
    hours: typeof answers[item.key] === "number" ? (answers[item.key] as number) : 0,
  }));
}

// 今週の取り組み状況（ミドル・ファイナル共通の数字）。
// 時間の内訳は「今週の練習時間」（練習／SNS／その他）に集約したので、ここでは件数・人数だけを聞く。
const WEEKLY_ACTIVITY_ITEMS: EniFormItem[] = [
  { key: "model_count", label: "モデル", type: "number", required: false, unit: "人" },
  { key: "wig_hours", label: "ウィッグ", type: "number", required: false, unit: "時間" },
  { key: "sns_posts", label: "SNS投稿", type: "number", required: false, unit: "投稿" },
  { key: "roleplay_count", label: "ロープレ", type: "number", required: false, unit: "回" },
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
    ...WEEKLY_PRACTICE_ITEMS,
    ...WEEKLY_SUPPORT_ITEMS,
    ...weeklyReflection("できるようになったこと・良かったこと"),
  ],
  // ミドル：モデル・SNS・ロープレなど取り組みの量を見える化する
  middle: [
    ...WEEKLY_PRACTICE_ITEMS,
    ...WEEKLY_ACTIVITY_ITEMS,
    ...WEEKLY_SUPPORT_ITEMS,
    ...weeklyReflection("頑張ったこと、嬉しかったこと、人に喜んでもらえたこと"),
  ],
  // ファイナル：ミドルと同じ取り組み＋デビュー設定（設定は週報の先頭に常時表示）
  final: [
    ...WEEKLY_PRACTICE_ITEMS,
    ...WEEKLY_ACTIVITY_ITEMS,
    ...WEEKLY_SUPPORT_ITEMS,
    ...weeklyReflection("頑張ったこと、嬉しかったこと、人に喜んでもらえたこと"),
  ],
};

// 未設定ランク（ランク付け前）のフォールバック
const WEEKLY_ITEMS_DEFAULT: EniFormItem[] = [
  ...WEEKLY_PRACTICE_ITEMS,
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

// ---- スタイリスト日報の稼働率・次回予約率 ----
// 稼働率は「その人が回せる枠のうち、どれだけお客様で埋まっていたか」。
// 回せる枠 ＝ 段数（同時に回す席数）× 8時間 なので、
//   稼働率 ＝ 入客時間 ÷（段数 × 8時間）
// 2段の人は16時間ぶん回せる前提になるため、1段の人と同じ入客時間なら稼働率は半分になる。
// 次回予約率 ＝ 次回予約が取れた数 ÷ 客数。どちらも自動計算して%で見せる。

/** 稼働率の基準時間（1段あたり8時間＝480分） */
export const STYLIST_STANDARD_MINUTES = 480;

/** 段数の既定値・上限（マスタ未設定のスタッフは1段として扱う） */
export const DEFAULT_TIERS = 1;
export const MAX_TIERS = 6;

/** 段数を1〜MAX_TIERSの整数に丸める（未設定・壊れた値は1段） */
export function normalizeTiers(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_TIERS;
  return Math.min(MAX_TIERS, n);
}

/** その段数で1日に回せる時間（分）＝ 段数 × 8時間 */
export function capacityMinutes(tiers: number): number {
  return normalizeTiers(tiers) * STYLIST_STANDARD_MINUTES;
}

export interface StylistTimeInput {
  /** 今日の客数（人） */
  clientCount: number;
  /** 入客時間の合計（分）。必須。稼働率の分子になる */
  serviceMinutes: number;
  /** 次回予約が取れた数（件） */
  nextBookings: number;
  /** 段数（同時に回す席数）。稼働率の分母 ＝ 段数 × 8時間 */
  tiers: number;
}

export interface StylistCalc {
  /** 稼働率（%）＝ 入客時間 ÷（段数 × 8時間） */
  utilization: number;
  /** 次回予約率（%）。客数0のときは null */
  rebookRate: number | null;
}

export function computeStylistCalc(input: StylistTimeInput): StylistCalc {
  const utilization =
    Math.round((Math.max(0, input.serviceMinutes) / capacityMinutes(input.tiers)) * 1000) / 10;
  const rebookRate =
    input.clientCount > 0
      ? Math.round((Math.max(0, input.nextBookings) / input.clientCount) * 1000) / 10
      : null;
  return { utilization, rebookRate };
}

/** 保存済みの日報から稼働率を出し直す（段数を後から変えても閲覧側の数字が揃うように） */
export function utilizationOf(answers: Record<string, unknown>, tiers: number): number | null {
  const minutes = answers.service_minutes;
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) {
    // 入客時間が無い古いデータは、保存済みの稼働率をそのまま見せる
    return typeof answers.utilization === "number" ? answers.utilization : null;
  }
  return Math.round((Math.max(0, minutes) / capacityMinutes(tiers)) * 1000) / 10;
}

/** 保存済みの日報から次回予約率を計算（閲覧画面用。旧データも next_bookings/client_count から出せる） */
export function rebookRateOf(answers: Record<string, unknown>): number | null {
  const num = (key: string) =>
    typeof answers[key] === "number" && Number.isFinite(answers[key]) ? (answers[key] as number) : 0;
  const clients = num("client_count");
  if (clients <= 0) return null;
  return Math.round((num("next_bookings") / clients) * 1000) / 10;
}
