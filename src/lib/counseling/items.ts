// カウンセリング項目の定義。
// TODO: 仮項目で実装中。現行カウンセリングシートの項目を受領したらここを書き換える。
// 項目の増減はこのファイルの修正だけで完結する（回答はJSONで保存しているためDB変更不要）。

export type CounselingItemType = "text" | "tel" | "date" | "radio" | "checkbox" | "textarea" | "agree";

export interface CounselingItem {
  key: string; // answers JSON のキー
  label: string;
  type: CounselingItemType;
  required: boolean;
  options?: string[]; // radio / checkbox 用
  placeholder?: string;
  note?: string; // 入力欄の下に出す補足
}

export const COUNSELING_ITEMS: CounselingItem[] = [
  {
    key: "full_name",
    label: "氏名",
    type: "text",
    required: true,
    placeholder: "例）山田 花子",
    note: "LINE登録時のお名前が自動で入ります",
  },
  { key: "furigana", label: "フリガナ", type: "text", required: true, placeholder: "例）ヤマダ ハナコ" },
  { key: "birthday", label: "生年月日", type: "date", required: false },
  { key: "phone", label: "電話番号", type: "tel", required: true, placeholder: "例）090-1234-5678" },
  {
    key: "visit_reason",
    label: "来店きっかけ",
    type: "radio",
    required: true,
    options: ["ホットペッパービューティー", "Instagram", "ご紹介", "通りがかり", "その他"],
  },
  {
    key: "concerns",
    label: "目元・眉のお悩み",
    type: "checkbox",
    required: false,
    options: [
      "まつ毛が短い・少ない",
      "まつ毛が下がっている",
      "左右差が気になる",
      "眉の形が決まらない",
      "自分でのお手入れが大変",
      "その他",
    ],
  },
  {
    key: "allergy",
    label: "アレルギー・皮膚疾患の有無",
    type: "radio",
    required: true,
    options: ["なし", "あり"],
    note: "「あり」の場合は最後の備考欄に内容をご記入ください",
  },
  { key: "contact_lens", label: "コンタクトレンズの使用", type: "radio", required: true, options: ["使用していない", "ソフト", "ハード"] },
  {
    key: "experience",
    label: "まつ毛エクステ・パーマの経験",
    type: "radio",
    required: true,
    options: ["初めて", "1年以内にあり", "1年以上前にあり"],
  },
  { key: "pregnant", label: "妊娠中ですか", type: "radio", required: true, options: ["いいえ", "はい", "可能性あり"] },
  {
    key: "desired_image",
    label: "希望の仕上がりイメージ",
    type: "textarea",
    required: false,
    placeholder: "例）ナチュラルに、目尻長めなど",
  },
  { key: "remarks", label: "備考（アレルギー内容など）", type: "textarea", required: false },
  {
    key: "agreement",
    label: "注意事項への同意",
    type: "agree",
    required: true,
    note: "施術前後の注意事項の説明を受け、同意します",
  },
];

/** answers JSON の値を表示用の文字列にする */
export function formatAnswer(item: CounselingItem, value: unknown): string {
  if (value === undefined || value === null || value === "") return "（未回答）";
  if (item.type === "checkbox" && Array.isArray(value)) {
    return value.length > 0 ? value.join("、") : "（未回答）";
  }
  if (item.type === "agree") return value ? "同意済み" : "未同意";
  return String(value);
}
