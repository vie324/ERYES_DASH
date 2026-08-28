// アプリ設定（管理者が画面から変えられる値）の読み書き。
// 今のところ「サロンボードのURL」だけだが、増えてもここに定義を足すだけで済むようにしている。

import type { AppSetting, DataStore } from "@/lib/data/types";

export interface AppSettingDef {
  key: string;
  label: string;
  note: string;
  placeholder: string;
  fallback: string;
}

export const SALON_BOARD_URL_KEY = "salon_board_url";

export const APP_SETTING_DEFS: AppSettingDef[] = [
  {
    key: SALON_BOARD_URL_KEY,
    label: "サロンボードのURL",
    note: "各画面の「サロンボードを開く」ボタンの飛び先。店舗のログインページを貼ってください",
    placeholder: "https://salonboard.com/login/",
    fallback: "https://salonboard.com/login/",
  },
];

/** 設定の一覧を「キー→値」に。未設定は既定値で埋める */
export function settingsMap(rows: AppSetting[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const def of APP_SETTING_DEFS) map[def.key] = def.fallback;
  for (const row of rows) {
    if (row.value.trim()) map[row.key] = row.value.trim();
  }
  return map;
}

/** サロンボードのURL（未設定なら公式のログインページ） */
export async function getSalonBoardUrl(db: DataStore): Promise<string> {
  const rows = await db.listAppSettings();
  return settingsMap(rows)[SALON_BOARD_URL_KEY];
}

/** 保存前の検証：http(s) のURLだけ受け付ける（空文字は「既定に戻す」） */
export function normalizeSettingValue(key: string, raw: string): string | null {
  const value = raw.trim().slice(0, 500);
  if (!value) return "";
  if (key === SALON_BOARD_URL_KEY) {
    return /^https?:\/\/\S+$/.test(value) ? value : null;
  }
  return value;
}
