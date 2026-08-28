// ダッシュボードの配色。スタッフごとに選べるようにして、
// 「自分の画面」という感覚を持ってもらう（数字の意味は色に依存させない）。
//
// 色はCSS変数で流し込む。ダッシュボードの各カードは var(--dash-*) を見るだけなので、
// 新しい配色を足したいときは、この配列に1つ追加すれば画面側の変更は要らない。

export interface DashboardTheme {
  key: string;
  label: string;
  /** 主役の色（数字・棒グラフ・リング） */
  accent: string;
  /** 補助の色（グラデーションの終点） */
  accent2: string;
  /** 面の色（カードの背景・淡い塗り） */
  surface: string;
  /** 罫線 */
  line: string;
  /** 見出し・強調文字 */
  text: string;
}

export const DASHBOARD_THEMES: DashboardTheme[] = [
  {
    key: "",
    label: "ブランド（ゴールド）",
    accent: "#a99668",
    accent2: "#c0ab7e",
    surface: "#faf8f2",
    line: "#e7ddc4",
    text: "#79684a",
  },
  {
    key: "rose",
    label: "ローズ",
    accent: "#c2557a",
    accent2: "#e08aa6",
    surface: "#fdf2f6",
    line: "#f6d4e0",
    text: "#9d3f5f",
  },
  {
    key: "sky",
    label: "スカイ",
    accent: "#3d7fb5",
    accent2: "#71adda",
    surface: "#f1f7fc",
    line: "#cfe3f2",
    text: "#2f6490",
  },
  {
    key: "mint",
    label: "ミント",
    accent: "#2f9c7c",
    accent2: "#6cc6ab",
    surface: "#f0faf6",
    line: "#cbeadf",
    text: "#237a61",
  },
  {
    key: "violet",
    label: "バイオレット",
    accent: "#7a5cc0",
    accent2: "#a691dc",
    surface: "#f6f3fd",
    line: "#ded3f4",
    text: "#5f45a0",
  },
  {
    key: "amber",
    label: "アンバー",
    accent: "#c07f22",
    accent2: "#e0a94f",
    surface: "#fdf7ec",
    line: "#f4e2c2",
    text: "#96631a",
  },
  {
    key: "graphite",
    label: "グラファイト",
    accent: "#4d5566",
    accent2: "#7b8496",
    surface: "#f4f5f7",
    line: "#dcdfe5",
    text: "#3b424f",
  },
];

export function findTheme(key: string | undefined | null): DashboardTheme {
  return DASHBOARD_THEMES.find((t) => t.key === (key ?? "")) ?? DASHBOARD_THEMES[0];
}

/** ダッシュボードを包む要素に付けるCSS変数（style属性にそのまま渡す） */
export function themeVars(key: string | undefined | null): React.CSSProperties {
  const t = findTheme(key);
  return {
    ["--dash-accent" as string]: t.accent,
    ["--dash-accent-2" as string]: t.accent2,
    ["--dash-surface" as string]: t.surface,
    ["--dash-line" as string]: t.line,
    ["--dash-text" as string]: t.text,
  } as React.CSSProperties;
}
