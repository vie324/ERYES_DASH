// アプリ設定（管理者が画面から変えられる値）の読み書き。
// 「サロンボードのURL」「カミキュラムのURL」「ノーションのURL」など。
// 増えてもここに定義を足すだけで済むようにしている。

import type { AppSetting, DataStore } from "@/lib/data/types";
import { NOTION_DESTINATIONS } from "@/lib/notion";

export interface AppSettingDef {
  key: string;
  label: string;
  note: string;
  placeholder: string;
  fallback: string;
}

export const SALON_BOARD_URL_KEY = "salon_board_url";
export const CURRICULUM_URL_KEY = "curriculum_url";

export const APP_SETTING_DEFS: AppSettingDef[] = [
  {
    key: SALON_BOARD_URL_KEY,
    label: "サロンボードのURL",
    note: "各画面の「サロンボードを開く」ボタンの飛び先。店舗のログインページを貼ってください",
    placeholder: "https://salonboard.com/login/",
    fallback: "https://salonboard.com/login/",
  },
  {
    key: CURRICULUM_URL_KEY,
    label: "カミキュラムのURL",
    note: "スマホの下部タブ「カミキュラム」の飛び先。未入力のままでも既定のログインページ（app.kamiculum.com）を開きます",
    placeholder: "https://app.kamiculum.com/",
    fallback: "https://app.kamiculum.com/",
  },
  // ノーションの接続先（ENiについて／マニュアルまとめ）。定義は lib/notion.ts
  ...NOTION_DESTINATIONS.map(({ key, label, note, placeholder, fallback }) => ({
    key,
    label,
    note,
    placeholder,
    fallback,
  })),
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

/** 外部リンクをまとめて取る（下部タブ・メニュー用）。未設定のものは既定のURLで埋まる */
export async function getAppLinks(db: DataStore): Promise<{ salonBoardUrl: string; curriculumUrl: string }> {
  const map = settingsMap(await db.listAppSettings());
  return { salonBoardUrl: map[SALON_BOARD_URL_KEY], curriculumUrl: map[CURRICULUM_URL_KEY] ?? "" };
}

/** ノーションの接続先（見出し・説明つき）。未設定のものは既定のページを出す */
export async function getNotionLinks(
  db: DataStore
): Promise<{ label: string; summary: string; url: string }[]> {
  const map = settingsMap(await db.listAppSettings());
  return NOTION_DESTINATIONS.map((d) => ({
    label: d.label,
    summary: d.summary,
    url: map[d.key] || d.fallback,
  })).filter((d) => d.url !== "");
}

/** 保存前の検証：http(s) のURLだけ受け付ける（空文字は「既定に戻す」） */
export function normalizeSettingValue(key: string, raw: string): string | null {
  const value = raw.trim().slice(0, 500);
  if (!value) return "";
  // URL系の設定は http(s) で始まるものだけ受け付ける
  if (key.endsWith("_url")) {
    return /^https?:\/\/\S+$/.test(value) ? value : null;
  }
  return value;
}
