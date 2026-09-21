// ホームのメニュー1つ1つに持たせる色。
// ブランドはアイボリー×シャンパンゴールドなので、原色ではなく少し落ち着いた
// （彩度をおさえた）10色にそろえて、並べても品よく・でも気分が上がるようにしている。
// 明度はすべて「白のアイコンを置いて 3:1 以上のコントラストが出る」範囲でそろえた。

import type { CSSProperties } from "react";

export type MenuAccent =
  | "rose"
  | "coral"
  | "gold"
  | "sage"
  | "teal"
  | "sky"
  | "indigo"
  | "lavender"
  | "plum"
  | "clay";

export const MENU_ACCENTS: Record<MenuAccent, string> = {
  rose: "#bc6a76", // ローズ
  coral: "#c9713f", // コーラル
  gold: "#a1803a", // ゴールド（ブランド色より少し濃いめ）
  sage: "#6e8f57", // セージ
  teal: "#3f8f89", // ティール
  sky: "#4a83bc", // スカイ
  indigo: "#6e73bc", // インディゴ
  lavender: "#8f6bb5", // ラベンダー
  plum: "#ac6095", // プラム
  clay: "#9c7150", // クレイ
};

/**
 * カード側は --accent だけを見て、地の色・枠・影をCSSで作る（globals.css）。
 * 色を足すときはこのファイルに1行足すだけで済む。
 */
export function accentStyle(accent?: MenuAccent): CSSProperties | undefined {
  if (!accent) return undefined;
  return { "--accent": MENU_ACCENTS[accent] } as CSSProperties;
}
