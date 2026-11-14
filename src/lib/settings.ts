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
    note: "メニューの「外部サービス」にある「カミキュラム」の飛び先。未入力のままでも既定のログインページ（app.kamiculum.com）を開きます",
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

// ---- 文章の設定（複数行。管理者がマスタ設定で書き換える）----

export interface TextSettingDef {
  key: string;
  label: string;
  note: string;
  /** 未入力（空）のときに出す文面 */
  fallback: string;
  maxLength: number;
  rows: number;
}

/** 幹部メニューのいちばん上に出す「大切にすること」 */
export const EXEC_VALUES_KEY = "exec_values";

/**
 * 「大切にすること」の初期の文面（ENiからいただいたまま。改行もこのとおり）。
 * 6行目の「アンテナを貼り」も原文のまま。直す場合はマスタ設定から書き換える。
 */
export const DEFAULT_EXEC_VALUES = [
  "細かいことでも情報提供し、さらに情報や高い視点の共有を自ら求めにいくこと。",
  "大切にしている想いやさまざまな仕組みや行いの意味意義を視座高く共有し続ける。朝礼時間の発信者であれ。",
  "接客サービス、カウンセリング提案、技術力とスピードと説明力の基準を常に高めていくこと。",
  "営業後フィードバックの時間をとても大切に。",
  "空いている時間も、常にフロアを見て、細かい動きや時間やクオリティのチェックをして伝えられるようにしておくこと。",
  "スタッフの表情や言葉にアンテナを貼り、良い水質づくりの意識を持つ",
].join("\n");

export const TEXT_SETTING_DEFS: TextSettingDef[] = [
  {
    key: EXEC_VALUES_KEY,
    label: "幹部メニューの「大切にすること」",
    note: "幹部メニューを開くと、いちばん上に常に表示されます（見られるのは幹部と管理者だけ）。1行が1項目です。空にして保存すると初期の文面に戻ります",
    fallback: DEFAULT_EXEC_VALUES,
    maxLength: 2000,
    rows: 8,
  },
];

/** 文章の設定を読む（未入力なら初期の文面） */
export function textSettingOf(rows: AppSetting[], key: string): string {
  const def = TEXT_SETTING_DEFS.find((d) => d.key === key);
  const value = rows.find((r) => r.key === key)?.value.trim() ?? "";
  return value || def?.fallback || "";
}

/** 保存前の整え：改行をそろえ、行末の空白と空行を落とし、長さを丸める */
export function normalizeTextSetting(key: string, raw: string): string {
  const def = TEXT_SETTING_DEFS.find((d) => d.key === key);
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "");
  return lines.join("\n").slice(0, def?.maxLength ?? 2000);
}

/** 「大切にすること」を1行ずつ（幹部メニューの最上部に並べる） */
export async function getExecValues(db: DataStore): Promise<string[]> {
  return textSettingOf(await db.listAppSettings(), EXEC_VALUES_KEY)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// ---- 選ぶ設定（管理者がマスタ設定で選択肢から選ぶ）----

export interface ChoiceSettingDef {
  key: string;
  label: string;
  note: string;
  options: { value: string; label: string }[];
  /** 未設定のときの値 */
  fallback: string;
}

/** 全体共有ルームに投稿できる人（all＝全員／exec＝幹部と管理者／admin＝管理者だけ） */
export const ALL_ROOM_POSTERS_KEY = "all_room_posters";
/** 毎朝のリマインドの時刻（日本時間の時。vercel.json の定時実行がある時刻から選ぶ） */
export const MORNING_REMINDER_HOUR_KEY = "morning_reminder_hour";
/**
 * 毎朝のリマインドを送れる時刻（日本時間）。vercel.json に、この時刻ごとの定時実行（1日1回）を登録している。
 * 時刻を足すときは vercel.json にも同じ時刻（UTC＝日本時間−9時間）を足すこと。
 */
export const MORNING_REMINDER_HOURS = [6, 7, 8, 9, 10, 11, 12];

export const CHOICE_SETTING_DEFS: ChoiceSettingDef[] = [
  {
    key: ALL_ROOM_POSTERS_KEY,
    label: "全体共有ルームに投稿できる人",
    note: "全スタッフが自動で参加するルームです。投稿できない人も、読む・「確認しました」を押すことはできます",
    options: [
      { value: "all", label: "全員" },
      { value: "exec", label: "幹部と管理者だけ" },
      { value: "admin", label: "管理者だけ" },
    ],
    fallback: "all",
  },
  {
    key: MORNING_REMINDER_HOUR_KEY,
    label: "毎朝のリマインドの時刻",
    note: "その日の未完了のタスク・ルーティンや未読のトークがある人に通知します（本人が通知の設定で止めていれば送りません）。Vercelの無料プランでは、選んだ時刻の00〜59分のどこかで届きます",
    options: MORNING_REMINDER_HOURS.map((h) => ({ value: String(h), label: `${h}:00` })),
    fallback: "9",
  },
];

/** 選ぶ設定を読む（未設定・選択肢にない値は既定値） */
export function choiceSettingOf(rows: AppSetting[], key: string): string {
  const def = CHOICE_SETTING_DEFS.find((d) => d.key === key);
  const value = rows.find((r) => r.key === key)?.value.trim() ?? "";
  if (!def) return value;
  return def.options.some((o) => o.value === value) ? value : def.fallback;
}

export async function getChoiceSetting(db: DataStore, key: string): Promise<string> {
  return choiceSettingOf(await db.listAppSettings(), key);
}

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

/** 外部リンクをまとめて取る（メニューの「外部サービス」用）。未設定のものは既定のURLで埋まる */
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
