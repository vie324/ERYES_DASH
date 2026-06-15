// カウンセリング項目の定義（現行シート2種＝まつげエクステ/パーマ用・眉/アイブロウ用 を統合）。
// 項目の増減はこのファイルの修正だけで完結する（回答はJSONで保存しているためDB変更不要）。
//
// 仕組み：
//  - section …… 画面の見出しでグルーピングする
//  - menu …… "lash"（まつげ）/"brow"（眉）専用項目。未指定は共通（常に表示）。
//             先頭の「ご希望メニュー」での選択に応じて該当セクションだけ表示する。

export type CounselingItemType = "text" | "tel" | "date" | "radio" | "checkbox" | "textarea" | "agree";
export type CounselingMenu = "lash" | "brow";

export interface CounselingItem {
  key: string; // answers JSON のキー
  label: string;
  type: CounselingItemType;
  required: boolean;
  section: string;
  menu?: CounselingMenu; // 指定時はそのメニュー選択時のみ表示
  options?: string[]; // radio / checkbox 用
  placeholder?: string;
  note?: string; // 入力欄の下に出す補足
}

// 「ご希望メニュー」の選択肢。値に "まつげ"/"眉" を含めることで lash/brow を判定する。
export const MENU_OPTIONS = ["まつげエクステ", "まつげパーマ・カール", "眉（アイブロウ）"] as const;
export const MENU_KEY = "menu";

export function selectedMenus(menuValue: unknown): { lash: boolean; brow: boolean } {
  const arr = Array.isArray(menuValue) ? menuValue.map(String) : [];
  return {
    lash: arr.some((v) => v.includes("まつげ")),
    brow: arr.some((v) => v.includes("眉")),
  };
}

/** 選択メニューに応じて、表示すべき項目だけに絞る */
export function visibleItems(menuValue: unknown): CounselingItem[] {
  const { lash, brow } = selectedMenus(menuValue);
  return COUNSELING_ITEMS.filter((item) => {
    if (!item.menu) return true;
    if (item.menu === "lash") return lash;
    if (item.menu === "brow") return brow;
    return true;
  });
}

const S_MENU = "ご希望メニュー";
const S_PROFILE = "お客様情報";
const S_VISIT = "ご来店のきっかけ";
const S_HEALTH = "健康・アレルギー・体質";
const S_LASH = "まつげメニューの方へ";
const S_BROW = "眉（アイブロウ）メニューの方へ";
const S_CONFIRM = "ご要望・ご確認";

export const COUNSELING_ITEMS: CounselingItem[] = [
  // ---- ご希望メニュー ----
  {
    key: MENU_KEY,
    label: "ご希望のメニュー（複数選択可）",
    type: "checkbox",
    required: true,
    section: S_MENU,
    options: [...MENU_OPTIONS],
    note: "選んだメニューに応じて、必要な質問だけが表示されます",
  },

  // ---- お客様情報 ----
  {
    key: "full_name",
    label: "お名前",
    type: "text",
    required: true,
    section: S_PROFILE,
    placeholder: "例）山田 花子",
    note: "LINE登録時のお名前が自動で入ります",
  },
  { key: "furigana", label: "フリガナ", type: "text", required: true, section: S_PROFILE, placeholder: "例）ヤマダ ハナコ" },
  { key: "birthday", label: "生年月日", type: "date", required: false, section: S_PROFILE },
  { key: "gender", label: "性別", type: "radio", required: false, section: S_PROFILE, options: ["女性", "男性", "その他・回答しない"] },
  { key: "phone", label: "電話番号", type: "tel", required: true, section: S_PROFILE, placeholder: "例）090-1234-5678" },
  { key: "email", label: "メールアドレス", type: "text", required: false, section: S_PROFILE, placeholder: "例）example@mail.com" },
  { key: "address", label: "ご住所", type: "text", required: false, section: S_PROFILE, placeholder: "例）東京都目黒区自由が丘1-1-1" },

  // ---- ご来店のきっかけ ----
  {
    key: "know_source",
    label: "当店を何でお知りになりましたか？",
    type: "checkbox",
    required: false,
    section: S_VISIT,
    options: [
      "ホットペッパービューティー",
      "楽天ビューティー",
      "Google",
      "Yahoo検索",
      "ホームページ",
      "看板",
      "Instagram",
      "Facebook",
      "LINE",
      "ご紹介",
      "その他",
    ],
  },
  { key: "referrer", label: "ご紹介者のお名前（ご紹介の場合）", type: "text", required: false, section: S_VISIT },
  {
    key: "visit_reason",
    label: "ご来店のきっかけ",
    type: "checkbox",
    required: false,
    section: S_VISIT,
    options: [
      "サロンの変更",
      "施術が初めて",
      "口コミを見て",
      "価格が安い",
      "5日間のお直しシステム",
      "他店舗に通っていた",
      "その他",
    ],
  },

  // ---- 健康・アレルギー・体質（共通）----
  {
    key: "allergy",
    label: "アレルギーはありますか？",
    type: "radio",
    required: true,
    section: S_HEALTH,
    options: ["なし", "あり"],
    note: "「あり」の場合は下の項目で内容を選んでください",
  },
  {
    key: "allergy_detail",
    label: "アレルギーの内容（複数選択可）",
    type: "checkbox",
    required: false,
    section: S_HEALTH,
    options: ["アルコール", "金属", "花粉", "食品", "薬品", "ヒアルロン酸", "絆創膏", "その他"],
  },
  {
    key: "pregnant",
    label: "妊娠中・妊娠の可能性・生理中のいずれかに該当しますか？",
    type: "radio",
    required: true,
    section: S_HEALTH,
    options: ["いいえ", "はい（いずれかに該当）"],
  },
  {
    key: "dermatology",
    label: "通院中の病名・皮膚疾患・既往（アトピー・ケロイド体質等）があればご記入ください",
    type: "textarea",
    required: false,
    section: S_HEALTH,
  },
  { key: "medication", label: "常用しているお薬があればご記入ください", type: "textarea", required: false, section: S_HEALTH },
  {
    key: "surgery_history",
    label: "手術・病歴があればご記入ください（時期も）",
    type: "textarea",
    required: false,
    section: S_HEALTH,
  },
  {
    key: "contact_lens",
    label: "コンタクトレンズの使用",
    type: "radio",
    required: false,
    section: S_HEALTH,
    options: ["使用していない", "ソフト", "ハード"],
  },
  {
    key: "eye_sensitivity",
    label: "目元は敏感ですか？",
    type: "radio",
    required: false,
    section: S_HEALTH,
    options: ["敏感", "普通", "敏感ではない"],
  },

  // ---- まつげメニューの方へ（lash）----
  {
    key: "lash_ext_experience",
    label: "過去にまつげエクステの経験はありますか？",
    type: "radio",
    required: false,
    section: S_LASH,
    menu: "lash",
    options: ["いいえ（初めて）", "はい（2回目）", "はい（3回目以上）"],
  },
  {
    key: "lash_perm_experience",
    label: "まつげパーマの経験はありますか？",
    type: "radio",
    required: false,
    section: S_LASH,
    menu: "lash",
    options: ["いいえ", "1ヶ月以内にあり", "3ヶ月以内にあり", "半年以上前にあり"],
  },
  {
    key: "eye_surgery",
    label: "目元の手術を受けたことがありますか？（複数選択可）",
    type: "checkbox",
    required: false,
    section: S_LASH,
    menu: "lash",
    options: ["レーシック", "目元の美容整形", "ない"],
  },
  {
    key: "patch_test",
    label: "本日パッチテスト（無料）はご希望されますか？",
    type: "radio",
    required: false,
    section: S_LASH,
    menu: "lash",
    options: ["いいえ", "はい"],
  },
  {
    key: "bridal",
    label: "ブライダルでのご利用ですか？",
    type: "radio",
    required: false,
    section: S_LASH,
    menu: "lash",
    options: ["いいえ", "はい"],
  },
  {
    key: "lash_image_ext",
    label: "ご希望の仕上がり（エクステの方・複数選択可）",
    type: "checkbox",
    required: false,
    section: S_LASH,
    menu: "lash",
    options: ["ナチュラル", "ぱっちり", "たれ目", "切れ長", "華やか", "ボリュームアップ"],
  },
  {
    key: "lash_image_curl",
    label: "ご希望の仕上がり（まつげカールの方）",
    type: "checkbox",
    required: false,
    section: S_LASH,
    menu: "lash",
    options: ["根本からしっかり立ち上げる", "丸みのある自然な仕上がり"],
  },

  // ---- 眉（アイブロウ）メニューの方へ（brow）----
  {
    key: "brow_self_care",
    label: "眉の自己処理方法（複数選択可）",
    type: "checkbox",
    required: false,
    section: S_BROW,
    menu: "brow",
    options: ["毛抜き", "シェービング", "カット", "脱色", "その他"],
  },
  { key: "brow_last_care_date", label: "直前の自己処理日", type: "date", required: false, section: S_BROW, menu: "brow" },
  {
    key: "skin_type",
    label: "肌タイプ",
    type: "radio",
    required: false,
    section: S_BROW,
    menu: "brow",
    options: ["ノーマル", "オイリー", "ドライ", "混合", "敏感"],
  },
  {
    key: "skin_trouble",
    label: "肌トラブルはありますか？（あれば箇所を備考にご記入ください）",
    type: "radio",
    required: false,
    section: S_BROW,
    menu: "brow",
    options: ["なし", "あり"],
  },
  {
    key: "wax_experience",
    label: "ワックス脱毛をしたことがありますか？",
    type: "radio",
    required: false,
    section: S_BROW,
    menu: "brow",
    options: ["なし", "あり"],
  },
  {
    key: "brow_image",
    label: "眉のお悩み・なりたいイメージ",
    type: "textarea",
    required: false,
    section: S_BROW,
    menu: "brow",
    placeholder: "例）平行眉にしたい／左右差が気になる など",
  },

  // ---- ご要望・ご確認 ----
  {
    key: "remarks",
    label: "その他ご要望・気になる点（自由記入）",
    type: "textarea",
    required: false,
    section: S_CONFIRM,
  },
  {
    key: "agreement",
    label: "注意事項への同意",
    type: "agree",
    required: true,
    section: S_CONFIRM,
    note: "施術前後の注意事項の説明を受け、内容に同意します（安全な施術のため、カウンセリング項目には正しい内容でお答えください）",
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
