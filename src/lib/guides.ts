// はじめて開いたときの案内（3〜4枚）と、いつでも見られる「使い方」の文言（依頼12ほか）。
// 文言は管理者が管理画面（/admin/features#guides）で書き換えられる（CLAUDE.md の 5）。空なら下の初期の文。

import { readJsonSetting } from "@/lib/feature-settings";
import type { DataStore } from "@/lib/data/types";

export interface GuideCard {
  title: string;
  body: string;
}

export type GuideKey = "shift" | "shift_manager" | "attendance";

export const GUIDE_LABEL: Record<GuideKey, string> = {
  shift: "シフト（スタッフ向け）",
  shift_manager: "シフト（店長・管理者向け）",
  attendance: "出退勤",
};

export const DEFAULT_GUIDES: Record<GuideKey, GuideCard[]> = {
  shift: [
    { title: "希望休は3か月前の5日まで", body: "例：3月分は12月5日まで。「希望休を出す」でカレンダーをタップして、理由を添えて出します。締切までは何度でも出し直せます。" },
    { title: "締切を過ぎたら承認制", body: "締切後の休みは「締切後の希望休」から申請し、店長の承認をもらいます。承認されると通知が届きます。" },
    { title: "シフトは公開されたら通知", body: "店長がシフトを公開すると全員に通知が届きます。自分のシフトと、店舗全体のシフトをカレンダーで見られます。" },
    { title: "変わったときも通知", body: "公開後にシフトが変わると、本人に通知が届きます。変更の記録も残ります。" },
  ],
  shift_manager: [
    { title: "希望休がそろったら下書き", body: "締切後に「シフト表を自動で作る」で下書きを作ります。希望休が入った状態から始まります。" },
    { title: "必要人数を決めておく", body: "「必要人数」で曜日・日付ごとの人数を決めると、足りない日が赤く出ます。" },
    { title: "勤務パターンで時間を当てはめる", body: "マスをタップすると、「勤務パターン」で登録した時間帯をタップで入れられます。" },
    { title: "公開すると全員に通知", body: "「スタッフに公開する」で確定。公開後の変更は本人に通知され、「変更の履歴」に残ります。" },
  ],
  attendance: [
    { title: "出勤・退勤を打刻", body: "お店の近くで「出勤」「退勤」を押します。その日のシフトと比べて、遅刻・早退・シフト外に印がつきます。" },
    { title: "打刻を忘れたら申請", body: "下の「打刻忘れ・打刻の修正を申請する」から、正しい時刻と理由を出します。店長が承認するとその時刻で数えます。" },
    { title: "月の勤務時間", body: "今月の勤務時間（休憩を引いた時間）と、遅刻・早退の回数が見られます。" },
  ],
};

export const GUIDES_KEY = "guides";

export async function getGuides(db: DataStore): Promise<Record<GuideKey, GuideCard[]>> {
  const saved = await readJsonSetting(db, GUIDES_KEY, DEFAULT_GUIDES);
  const out = { ...DEFAULT_GUIDES };
  for (const k of Object.keys(DEFAULT_GUIDES) as GuideKey[]) {
    const list = Array.isArray(saved[k]) ? saved[k].filter((c) => c && typeof c.title === "string" && c.title.trim()) : [];
    out[k] = list.length > 0 ? list : DEFAULT_GUIDES[k];
  }
  return out;
}

/** 管理画面の入力（「見出し｜本文」を1行ずつ）を案内のカードにする */
export function parseGuideLines(raw: string): GuideCard[] {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [title, ...rest] = l.split(/[｜|]/);
      return { title: title.trim().slice(0, 40), body: rest.join("｜").trim().slice(0, 300) };
    })
    .filter((c) => c.title)
    .slice(0, 6);
}
