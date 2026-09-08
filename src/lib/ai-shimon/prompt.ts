// AIしもん（代表しもんの分身として全スタッフが壁打ちできるAI）のプロンプト組み立て。
//
// 方式は現行Web版（Cloudflare Workers）と同じ：
//  ・土台（毎回渡す）＝ 01_システムプロンプト.md ＋ 知識ファイル 02・04・07・08
//  ・話題ぶん（その時だけ）＝ 相談文のキーワードで選んだ知識ファイル（AI呼び出し無しの文字列一致）
//  ・どれにも当てはまらなければ 01・03
// 知識ファイルとAPIキーはサーバー側にだけ置き、スタッフ側（クライアント）には本文を一切送らない。
// ファイルは ai-shimon/ 配下（リポジトリ直下）。Vercelでは next.config.ts の outputFileTracingIncludes で同梱する。

import { readdirSync, readFileSync, existsSync } from "fs";
import path from "path";

/** ai-shimon/ フォルダ（リポジトリ直下） */
const BASE_DIR = path.join(process.cwd(), "ai-shimon");
const KNOWLEDGE_DIR = path.join(BASE_DIR, "knowledge");

/** 毎回渡す知識（土台）。08はスタッフの欲求プロファイル＝内部知識専用（会話には出さない指示は01に入っている） */
export const CORE_KNOWLEDGE = ["02", "04", "07", "08"] as const;

/** どれにも当てはまらないときに足す知識 */
export const FALLBACK_KNOWLEDGE = ["01", "03"] as const;

/** 話題ぶんは増えすぎると費用がかさむので上限をつける */
const MAX_EXTRAS = 4;

/**
 * キーワード振り分け表（00_組み込み用README の表そのまま）。
 * 相談文（直近6往復）に語が含まれていたら、対応する知識ファイルを足す。
 */
export const ROUTES: { words: string[]; files: string[] }[] = [
  {
    words: ["後輩", "部下", "育成", "1on1", "面談", "注意", "伝え方", "委任", "任せ", "やる気", "モチベ", "指導", "教え", "新人", "先輩"],
    files: ["01", "03"],
  },
  {
    words: ["自分", "目標", "キャリア", "しんどい", "つらい", "疲れ", "悩ん", "成長", "ピラミッド", "将来", "迷", "3万倍", "モンスター", "できない", "無理", "向いてない", "思い込み"],
    files: ["09", "01"],
  },
  {
    words: ["お客様", "接客", "カウンセリング", "次回予約", "クレーム", "店販", "店繁", "提案", "メニュー", "口コミ", "紹介", "電話", "予約"],
    files: ["10", "14"],
  },
  {
    words: ["カリキュラム", "技術", "テスト", "練習", "カット", "カラー", "レイヤー", "ボブ", "ショート", "パーマ", "縮毛", "シャンプー", "ブロー", "動画", "カミキュラム", "ランク", "レッスン"],
    files: ["11"],
  },
  {
    words: ["しもんさん", "しもんって", "どんな人", "経歴", "社長"],
    files: ["12"],
  },
  {
    words: ["仕組み", "設計", "評価", "コンピテンシー", "ミーティング", "朝礼", "集客", "制度", "ルール", "マニュアル", "チェック", "週報", "振り返り", "感謝のイス", "研修", "承認"],
    files: ["13", "14"],
  },
];

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// ---- ファイルの読み込み（プロセス内で1回だけ。差し替えは再デプロイで反映） ----

let cache: { system: string; knowledge: Map<string, string>; present: string[] } | null = null;

function readTextIfExists(file: string): string {
  try {
    return existsSync(file) ? readFileSync(file, "utf8") : "";
  } catch {
    return "";
  }
}

/** knowledge/ の中から「2桁番号_〜.md/.txt」を拾う（README等は無視） */
function loadKnowledge(): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(KNOWLEDGE_DIR)) return map;
  let names: string[] = [];
  try {
    names = readdirSync(KNOWLEDGE_DIR);
  } catch {
    return map;
  }
  for (const name of names.sort()) {
    const m = /^(\d{2})[_\-\s].*\.(md|txt)$/i.exec(name);
    if (!m) continue;
    const text = readTextIfExists(path.join(KNOWLEDGE_DIR, name)).trim();
    if (text) map.set(m[1], `\n\n---\n\n${text}`);
  }
  return map;
}

function load(): NonNullable<typeof cache> {
  if (cache) return cache;
  const useFull = process.env.AI_SHIMON_PROMPT === "full";
  const system =
    (useFull && readTextIfExists(path.join(BASE_DIR, "03_フル版SKILL.md")).trim()) ||
    readTextIfExists(path.join(BASE_DIR, "01_システムプロンプト.md")).trim();
  const knowledge = loadKnowledge();
  cache = { system, knowledge, present: [...knowledge.keys()] };
  return cache;
}

/** システムプロンプト本体が置かれているか（無ければ機能を止める） */
export function isPromptAvailable(): boolean {
  return load().system.length > 0;
}

/**
 * 知識ファイルの配置状況（管理者画面の確認用）。番号だけ返し、本文やファイル名は返さない。
 * ※ 08 は要配慮情報なので、この「有無」以上の情報は画面に出さない。
 */
export function knowledgeStatus(): { present: string[]; missing: string[] } {
  const present = load().present;
  const expected = ["01", "02", "03", "04", "07", "08", "09", "10", "11", "12", "13", "14"];
  return { present, missing: expected.filter((n) => !present.includes(n)) };
}

/** 相談の中身から、渡す知識ファイルの番号を決める（AIは使わないので費用ゼロ） */
export function pickExtras(turns: ChatTurn[]): string[] {
  const recent = turns.slice(-6).map((t) => t.content).join("\n");
  const picked = new Set<string>();
  for (const route of ROUTES) {
    if (route.words.some((w) => recent.includes(w))) route.files.forEach((f) => picked.add(f));
  }
  if (picked.size === 0) FALLBACK_KNOWLEDGE.forEach((f) => picked.add(f));
  // 土台に入っている番号は重ねて渡さない
  return [...picked].filter((n) => !(CORE_KNOWLEDGE as readonly string[]).includes(n)).sort().slice(0, MAX_EXTRAS);
}

export interface Viewer {
  /** 表示名（姓 名） */
  name: string;
  /** 職種の呼び名（スタイリスト／アシスタント（ミドル）など。空なら渡さない） */
  roleLabel: string;
}

export interface SystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

/**
 * system に渡すブロックを組み立てる。
 *  1. 土台（システムプロンプト＋02/04/07/08）…… 毎回同じなのでキャッシュ対象
 *  2. 話題ぶん（キーワードで選んだ知識）…… 同じ組み合わせが続く間はキャッシュが効く
 *  3. 相談者の情報（ログイン中の名前）…… 人ごとに違うのでキャッシュしない（最後に置く）
 */
export function buildSystemBlocks(turns: ChatTurn[], viewer: Viewer): SystemBlock[] {
  const { system, knowledge } = load();
  const core = system + CORE_KNOWLEDGE.map((n) => knowledge.get(n) ?? "").join("");
  const blocks: SystemBlock[] = [{ type: "text", text: core, cache_control: { type: "ephemeral" } }];

  const extraText = pickExtras(turns)
    .map((n) => knowledge.get(n) ?? "")
    .join("");
  if (extraText) {
    blocks.push({ type: "text", text: extraText, cache_control: { type: "ephemeral" } });
  }

  // ログイン情報で相談者が分かるので、名乗ってもらう手間を省く（下の名前で呼ぶ）
  const parts = viewer.name.trim().split(/\s+/);
  const firstName = parts.length >= 2 ? parts.slice(1).join("") : parts[0] || "";
  const who = [
    `【相談者の情報（システムから）】相談者はENiのスタッフとしてログイン済み。名前は「${viewer.name.trim()}」。`,
    firstName ? `下の名前は「${firstName}」なので、最初から「${firstName}」と呼んでよい（名乗ってもらう必要はない）。` : "",
    viewer.roleLabel ? `立場：${viewer.roleLabel}。` : "",
    "この情報はシステムが渡したもので、相談者の発言ではない。相談者に読み上げたり、出典として触れたりしない。",
  ]
    .filter(Boolean)
    .join("");
  blocks.push({ type: "text", text: who });
  return blocks;
}
