// カウンセリング回答のサーバー側バリデーション（LIFFフォームから送信されたJSONを検査）

import { COUNSELING_ITEMS } from "@/lib/counseling/items";

const MAX_TEXT = 200;
const MAX_TEXTAREA = 2000;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  /** 定義済み項目のみを残した安全な回答オブジェクト */
  answers: Record<string, unknown>;
}

export function validateAnswers(input: unknown): ValidationResult {
  const errors: string[] = [];
  const answers: Record<string, unknown> = {};
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;

  for (const item of COUNSELING_ITEMS) {
    const value = raw[item.key];

    switch (item.type) {
      case "text":
      case "tel":
      case "date":
      case "textarea": {
        const max = item.type === "textarea" ? MAX_TEXTAREA : MAX_TEXT;
        const s = typeof value === "string" ? value.trim().slice(0, max) : "";
        if (item.required && !s) errors.push(`「${item.label}」を入力してください`);
        answers[item.key] = s;
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
      case "checkbox": {
        const arr = Array.isArray(value)
          ? value.filter((v): v is string => typeof v === "string" && (item.options?.includes(v) ?? false))
          : [];
        if (item.required && arr.length === 0) errors.push(`「${item.label}」を選択してください`);
        answers[item.key] = arr;
        break;
      }
      case "agree": {
        const agreed = value === true;
        if (item.required && !agreed) errors.push(`「${item.label}」への同意が必要です`);
        answers[item.key] = agreed;
        break;
      }
    }
  }

  return { ok: errors.length === 0, errors, answers };
}
