// 使い方ガイドの中身の型。
// 文章はデータとして持ち、画面（/staff/help・/admin/help）はそれを並べるだけにしている。
// こうしておくと、業態（ENi / EREYS）ごとに別の内容を書いても、画面は1つで済む。

import type { IconName } from "@/components/icons";

/** 1日・1ヶ月の流れ（縦タイムライン） */
export interface HelpStep {
  time: string;
  title: string;
  body: string;
  /** その画面へのリンク（省略可） */
  href?: string;
}

/** 機能ひとつぶんの使い方（折りたたみ） */
export interface HelpTopic {
  icon: IconName;
  title: string;
  summary: string;
  href?: string;
  steps: string[];
  notes?: string[];
}

/** 見出し1つぶん。タイムラインか機能一覧のどちらかを持つ */
export interface HelpBlock {
  heading: string;
  timeline?: HelpStep[];
  topics?: HelpTopic[];
}

/** 最初に1回だけやる設定（管理者ガイド用） */
export interface HelpSetup {
  heading: string;
  lead: string;
  steps: string[];
  /** 目立つ注意書き（省略可） */
  warning?: string;
}

/** 業態×役割ごとの使い方ガイド1つぶん */
export interface HelpGuide {
  title: string;
  /** 見出しの下に出す導入文 */
  intro: string;
  blocks: HelpBlock[];
  faq: { q: string; a: string }[];
  setup?: HelpSetup;
}
