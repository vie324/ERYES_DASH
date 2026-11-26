// 依頼11（68）：ENi Wikipedia の AI 検索。
// 質問すると、見られるページの中から全文検索で候補を出し、その中身「だけ」を根拠に Claude が答える。
// 元のページへのリンクを付ける。根拠が無ければ「見つかりません」と答え、作り話をしない。
// 候補が1件も無いときは AI を呼ばない（費用をかけない）。同じ質問・同じページの版なら、保存した答えを使い回す。

import { runAiJson, cacheKeyOf } from "@/lib/ai/run";
import { searchWiki, type SearchHit, type WikiViewer } from "@/lib/wiki";
import type { DataStore } from "@/lib/data/types";

export interface WikiAnswer {
  found: boolean;
  /** AIの答え（AIを使えないときは空） */
  answer: string;
  /** 根拠にしたページ（リンクを付ける） */
  sources: { id: string; title: string; category: string }[];
  /** 全文検索の候補（AIの答えの下に出す） */
  hits: { id: string; title: string; category: string; excerpt: string }[];
  ai: boolean;
  /** AIを使えなかった理由（画面の小さな注記） */
  note: string;
}

const SYSTEM = `あなたは美容室ENi（ヘアサロン）とアイラッシュサロン「イーリス」のスタッフ向け社内Wiki「ENi Wikipedia」の案内係です。
スタッフの質問に、渡された「ページ」の内容だけを根拠にして、短く分かりやすく日本語で答えてください。
- ページに書かれていないことは、推測で補ったり作ったりしないでください。根拠が無いときは found を false にし、answer は「Wikiの中には見つかりませんでした。」としてください。
- 根拠にしたページのIDを sources に入れてください（渡されたIDだけを使う）。
- 答えはスマホで読みやすいよう、3〜6行ほど。手順は番号付きの箇条書きにしてください。
- 個人の名前やお客様の情報は答えに入れないでください。`;

const SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    answer: { type: "string" },
    sources: { type: "array", items: { type: "string" } },
  },
  required: ["found", "answer", "sources"],
  additionalProperties: false,
} as const;

/** 候補のページを AI に渡す文にする（1ページは長すぎないように切る） */
function pagesPrompt(question: string, hits: SearchHit[]): string {
  const blocks = hits.map(
    (h) => `<page id="${h.page.id}" title="${h.page.title.replace(/"/g, "'")}" category="${h.page.category}">\n${h.page.body.slice(0, 3500)}\n</page>`
  );
  return `質問：${question}\n\n${blocks.join("\n\n")}`;
}

export async function askWiki(
  db: DataStore,
  input: { question: string; staffId: string; viewer: WikiViewer }
): Promise<WikiAnswer> {
  const question = input.question.trim().slice(0, 300);
  const hits = await searchWiki(question, input.viewer, 5);
  const hitList = hits.map((h) => ({ id: h.page.id, title: h.page.title, category: h.page.category, excerpt: h.excerpt }));
  if (!question || hits.length === 0) {
    return { found: false, answer: "", sources: [], hits: [], ai: false, note: "Wikiの中には見つかりませんでした。" };
  }

  // 同じ質問・同じ候補（ページの版まで同じ）なら、保存した答えを使う
  const key = cacheKeyOf(
    "wiki_search",
    question.normalize("NFKC").replace(/\s+/g, ""),
    ...hits.map((h) => `${h.page.id}@${h.page.updatedAt.getTime()}`)
  );
  const ids = new Set(hits.map((h) => h.page.id));
  const result = await runAiJson(db, {
    feature: "wiki_search",
    staffId: input.staffId,
    system: SYSTEM,
    prompt: pagesPrompt(question, hits),
    schema: SCHEMA,
    cacheKey: key,
    maxTokens: 6000,
    effort: "low",
    parse: (raw) => {
      const r = (raw ?? {}) as { found?: unknown; answer?: unknown; sources?: unknown };
      if (typeof r.answer !== "string") return null;
      return {
        found: r.found === true,
        answer: r.answer.trim().slice(0, 2000),
        // 見られるページ（今回の候補）のIDだけを根拠として残す
        sources: (Array.isArray(r.sources) ? r.sources : []).map(String).filter((id) => ids.has(id)),
      };
    },
  });

  if (!result.ok) {
    const note =
      result.reason === "limit"
        ? "今日のAI検索の上限に達したため、候補のページだけを出しています。"
        : result.reason === "not_configured"
          ? "AIが使えないため、候補のページだけを出しています。"
          : "AIがうまく答えられなかったため、候補のページだけを出しています。";
    return { found: hits.length > 0, answer: "", sources: [], hits: hitList, ai: false, note };
  }
  const byId = new Map(hits.map((h) => [h.page.id, h.page]));
  const sources = result.data.sources
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({ id: p.id, title: p.title, category: p.category }));
  const found = result.data.found && sources.length > 0;
  return {
    found,
    answer: found ? result.data.answer : "Wikiの中には見つかりませんでした。",
    sources: found ? sources : [],
    hits: hitList,
    ai: true,
    note: "",
  };
}

/**
 * AIしもんの相談で、ルールに関する質問のときに示すページ（見られるページだけ・最大3件）。
 * AIは呼ばない（全文検索だけ）。強く当たったものだけを出す。
 */
export async function relatedWikiPages(question: string, viewer: WikiViewer): Promise<SearchHit[]> {
  const hits = await searchWiki(question, viewer, 3);
  return hits.filter((h) => h.score >= 35);
}
