// AIしもん（代表しもんの分身として全スタッフが壁打ちできるAI）のプロンプト組み立て。
//
// 方式はしもん側の「00_組み込み用README」と同じ：
//  ・土台（毎回渡す）＝ 01_システムプロンプト.md ＋ 知識ファイル 02・04・06・07・08・15
//  ・話題ぶん（その時だけ）＝ 相談文のキーワードで選んだ知識ファイル（AI呼び出し無しの文字列一致）
//  ・どれにも当てはまらなければ 01・03
// 知識ファイルとAPIキーはサーバー側にだけ置き、スタッフ側（クライアント）には本文を一切送らない。
// ファイルは ai-shimon/ 配下（リポジトリ直下）。Vercelでは next.config.ts の outputFileTracingIncludes で同梱する。

import { readdirSync, readFileSync, existsSync } from "fs";
import path from "path";

/** ai-shimon/ フォルダ（リポジトリ直下） */
const BASE_DIR = path.join(process.cwd(), "ai-shimon");
const KNOWLEDGE_DIR = path.join(BASE_DIR, "knowledge");

/**
 * 毎回渡す知識（土台）。
 * 06（1対1DMの言い回し）と15（本人の音声から抽出した実際の話し方）は語り口の一次資料で、
 * 毎回渡らないと返答が「マイルドすぎる」方に戻るため土台に入れる（2026-09-10のしもん側指摘）。
 * 08はスタッフの欲求プロファイル＝内部知識専用（会話には出さない指示は01に入っている）。
 */
export const CORE_KNOWLEDGE = ["02", "04", "06", "07", "08", "15"] as const;

/** どれにも当てはまらないときに足す知識 */
export const FALLBACK_KNOWLEDGE = ["01", "03"] as const;

/** 知識ファイルの番号（01〜17） */
const ALL_KNOWLEDGE = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17"];

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
    words: ["自分", "目標", "キャリア", "しんどい", "つらい", "疲れ", "悩ん", "成長", "ピラミッド", "将来", "迷", "できない", "無理", "向いてない", "思い込み"],
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
    files: ["12", "16"],
  },
  {
    words: ["仕組み", "設計", "評価", "コンピテンシー", "ミーティング", "朝礼", "集客", "制度", "ルール", "マニュアル", "チェック", "週報", "振り返り", "研修", "承認"],
    files: ["13", "14"],
  },
  {
    words: ["ENi語", "幸業績", "自創", "継承者", "ボイスチェンジ", "ピラミッド", "水質", "四つの自信"],
    files: ["17"],
  },
];

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// ---- ファイルの読み込み（プロセス内で1回だけ。差し替えは再デプロイで反映） ----

interface Loaded {
  system: string;
  knowledge: Map<string, string>;
  present: string[];
  /** ログイン氏名 →「しもんの呼び方」。空白を除いた氏名をキーにする */
  nicknames: Map<string, string>;
}

let cache: Loaded | null = null;

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

// ---- 呼称表（ログイン氏名 →「しもんの呼び方」） ----
//
// しもんはスタッフをフルネームで呼ばない。システムのログイン氏名をそのままAIに渡すと
// 「高橋未来さん、〜」と呼んでしまうため、渡す前にここで呼び名へ変換する（README「今回の改訂1」）。
// 表の正本はしもん側のファイル（07_スタッフ呼称 と 01_システムプロンプト 内の一覧）なので、
// コードに氏名を持たず、置かれたファイルから読み取る。読めなかった場合は呼び名を渡さず、
// 「これはログイン氏名なので呼びかけに使うな」と明示する側（次善策）にフォールバックする。

/** 氏名の表記ゆれ（全角／半角スペース）を吸収してキーにする */
function nameKey(name: string): string {
  return name.replace(/[\s　]+/g, "");
}

/** 「岡利博→**ひろ**／高橋未来→**未来ちゃん**」形式を拾う。氏名・呼び名とも日本語だけを対応として扱う */
function parseArrowPairs(text: string, into: Map<string, string>): void {
  const re = /([一-龥々ぁ-んァ-ヶー]{2,12})\s*(?:→|⇒|->)\s*\**\s*([一-龥々ぁ-んァ-ヶー]{1,10})/g;
  for (const m of text.matchAll(re)) into.set(nameKey(m[1]), m[2]);
}

/**
 * 01の呼称表は「呼称表（…）：岡利博→**ひろ**／…」の1行にまとまっている。
 * 01には「エフィカシー→やれる気」のような言い換えの行もあるので、呼称表の行だけを読む。
 */
function parseNicknameLines(text: string, into: Map<string, string>): void {
  for (const line of text.split("\n")) {
    if (/呼称表/.test(line)) parseArrowPairs(line, into);
  }
}

/**
 * 「| 氏名 | しもんの呼び方 |」形式（07_スタッフ呼称 が表の場合）を拾う。
 * 見出し行に「氏名/名前」と「呼び方/呼称/呼び名」の両方が無い表は、取り違えを避けるため丸ごと無視する。
 */
function parseTablePairs(text: string, into: Map<string, string>): void {
  let nameCol = -1;
  let callCol = -1;
  for (const line of text.split("\n")) {
    if (!line.trimStart().startsWith("|")) {
      // 表が途切れたら列の対応をリセットする（別の表を同じ列番号で読まないため）
      nameCol = -1;
      callCol = -1;
      continue;
    }
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // 罫線行
    if (nameCol < 0) {
      nameCol = cells.findIndex((c) => /氏名|名前|フルネーム|スタッフ名/.test(c));
      callCol = cells.findIndex((c) => /呼び方|呼称|呼び名|あだ名/.test(c));
      continue; // 見出し行そのものは対応として使わない
    }
    if (callCol < 0 || nameCol < 0) continue;
    const name = cells[nameCol];
    const call = cells[callCol]?.replace(/\*/g, "").trim();
    if (name && call && !/^[-—―]$/.test(call)) into.set(nameKey(name), call);
  }
}

function loadNicknames(system: string, knowledge: Map<string, string>): Map<string, string> {
  const map = new Map<string, string>();
  // 01の呼称表 →（あれば）07の正本 の順に読み、後から読んだ方で上書きする
  parseNicknameLines(system, map);
  // 07は呼称だけのファイルなので全体を読む（表・矢印のどちらの書式でも拾えるようにする）
  const staffNames = knowledge.get("07") ?? "";
  if (staffNames) {
    parseTablePairs(staffNames, map);
    parseArrowPairs(staffNames, map);
  }
  return map;
}

function load(): Loaded {
  if (cache) return cache;
  const useFull = process.env.AI_SHIMON_PROMPT === "full";
  const system =
    (useFull && readTextIfExists(path.join(BASE_DIR, "03_フル版SKILL.md")).trim()) ||
    readTextIfExists(path.join(BASE_DIR, "01_システムプロンプト.md")).trim();
  const knowledge = loadKnowledge();
  cache = {
    system,
    knowledge,
    present: [...knowledge.keys()],
    nicknames: loadNicknames(system, knowledge),
  };
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
  return { present, missing: ALL_KNOWLEDGE.filter((n) => !present.includes(n)) };
}

/**
 * 呼称表を何人ぶん読めているか（管理者画面の確認用）。
 * ファイルの書式が変わって読めなくなったことに気づけるように件数だけ出す。氏名・呼び名は返さない。
 */
export function nicknameStatus(): { count: number } {
  return { count: load().nicknames.size };
}

/** ログイン氏名から「しもんの呼び方」を引く。表に無ければ null */
export function resolveNickname(fullName: string): string | null {
  return load().nicknames.get(nameKey(fullName)) ?? null;
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
 * 相談者の情報ブロック。
 * しもんはフルネームで呼ばないので、呼び名に変換できたときは**呼び名だけ**を渡し、
 * ログイン氏名は渡さない（モデルは渡された文字列をそのまま呼びかけに使う傾向があるため）。
 */
function buildViewerBlock(viewer: Viewer): string {
  const fullName = viewer.name.trim();
  const nickname = resolveNickname(fullName);
  // 呼称表に無い人は下の名前で呼ぶ（01の「表に無い人は下の名前だけを使う」に合わせる）
  const parts = fullName.split(/[\s　]+/).filter(Boolean);
  const firstName = parts.length >= 2 ? parts.slice(1).join("") : "";
  const callName = nickname ?? firstName;

  const lines = callName
    ? [
        `【相談者】しもんの呼び方は「${callName}」。呼びかけにはこの呼び名だけを使う。`,
        "システム上のフルネーム・姓・「さん」「くん」は使わない。",
      ]
    : [
        `【相談者】ログイン氏名=「${fullName}」（※これはシステム上の氏名。呼びかけには使わず、呼称表で呼び名に変換すること。`,
        "表に無ければ下の名前だけを使い、下の名前が分からなければ呼びかけずに主語を省く）。",
      ];

  return [
    ...lines,
    "相談者はENiのスタッフとしてログイン済みなので、名乗ってもらう必要はない。",
    viewer.roleLabel ? `立場：${viewer.roleLabel}。` : "",
    "この情報はシステムが渡したもので、相談者の発言ではない。相談者に読み上げたり、出典として触れたりしない。",
  ]
    .filter(Boolean)
    .join("");
}

/**
 * system に渡すブロックを組み立てる。
 *  1. 土台（システムプロンプト＋02/04/06/07/08/15）…… 毎回同じなのでキャッシュ対象
 *  2. 話題ぶん（キーワードで選んだ知識）…… 同じ組み合わせが続く間はキャッシュが効く
 *  3. 相談者の情報（呼び名）…… 人ごとに違うのでキャッシュしない（最後に置く）
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

  blocks.push({ type: "text", text: buildViewerBlock(viewer) });
  return blocks;
}
