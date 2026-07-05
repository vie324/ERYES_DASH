// ENi（ヘアサロン）の報告フォーマット定義。
// 項目の増減・文言変更はこのファイルの修正だけで完結する（回答はJSONで保存しているためDB変更不要）。

export type EniItemType = "number" | "text" | "textarea" | "radio";

export interface EniFormItem {
  key: string;
  label: string;
  type: EniItemType;
  required: boolean;
  options?: string[]; // radio用
  unit?: string; // number用（人・円・件）
  placeholder?: string;
  note?: string;
}

// ---- スタイリスト日報（毎日・スタイリスト4名） ----
export const STYLIST_REPORT_ITEMS: EniFormItem[] = [
  { key: "clients_total", label: "総客数", type: "number", required: true, unit: "人" },
  { key: "clients_new", label: "新規", type: "number", required: true, unit: "人" },
  { key: "clients_shimei", label: "指名", type: "number", required: true, unit: "人" },
  { key: "service_sales", label: "技術売上", type: "number", required: true, unit: "円" },
  { key: "retail_sales", label: "店販売上", type: "number", required: true, unit: "円" },
  { key: "next_bookings", label: "次回予約が取れた数", type: "number", required: true, unit: "件" },
  {
    key: "highlight",
    label: "今日良かったこと・お客様の反応",
    type: "textarea",
    required: false,
    placeholder: "例）カラーの提案を喜んでいただけた",
  },
  {
    key: "issue",
    label: "課題・改善したいこと",
    type: "textarea",
    required: false,
  },
  {
    key: "share",
    label: "スタッフへの共有・アシスタントへの指導メモ（任意）",
    type: "textarea",
    required: false,
  },
];

// ---- アシスタント週報（毎週・アシスタント全員） ----
export const WEEKLY_REPORT_ITEMS: EniFormItem[] = [
  {
    key: "goal_review",
    label: "今週の目標のふりかえり",
    type: "radio",
    required: true,
    options: ["達成できた", "一部達成できた", "達成できなかった"],
  },
  {
    key: "done_well",
    label: "できるようになったこと・良かったこと",
    type: "textarea",
    required: true,
    placeholder: "例）ワインディングが時間内に巻けるようになった",
  },
  {
    key: "struggle",
    label: "苦戦していること・課題",
    type: "textarea",
    required: true,
  },
  {
    key: "learned",
    label: "練習・営業から学んだこと",
    type: "textarea",
    required: false,
  },
  {
    key: "next_goal",
    label: "来週の目標",
    type: "textarea",
    required: true,
    placeholder: "例）ブロー練習を週3回、モデルさん1名",
  },
  {
    key: "request",
    label: "スタイリスト・幹部への相談や共有（任意）",
    type: "textarea",
    required: false,
  },
];

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
