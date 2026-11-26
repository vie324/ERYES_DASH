// 依頼11（68）：ENi Wikipedia（マニュアル・ルールを、Notionではなくアプリの中に置く）。
//  ・カテゴリで整理し、ページごとに見られる範囲（全員／幹部以上／管理者だけ）を決める
//  ・作成・編集は幹部・管理者（と、権限「ENi Wikipediaを編集できる」を付けた人）。変更のたびに履歴を残す
//  ・検索は、ページが少ないうちは全文検索（2文字ずつの一致）で候補を出して Claude に答えさせる（lib/wiki/ask.ts）。
//    ページが増えたら、意味で探す検索（ベクトル検索）を WikiRetriever として足せる作りにしている
//  ・見る権限のないページは、一覧・検索・AIの根拠のどれにも使わない

import { fx } from "@/lib/data/tables";
import type { WikiPage, WikiVisibility } from "@/lib/data/tables";
import { readJsonSetting } from "@/lib/feature-settings";
import { staffHasPermission } from "@/lib/permissions";
import type { DataStore, Staff } from "@/lib/data/types";

export const WIKI_SETTINGS_KEY = "wiki_settings";
export interface WikiSettings {
  categories: string[];
}
export const DEFAULT_WIKI_SETTINGS: WikiSettings = {
  categories: ["接客", "技術", "店舗運営", "就業ルール", "そのほか"],
};
export async function getWikiSettings(db: DataStore): Promise<WikiSettings> {
  return readJsonSetting(db, WIKI_SETTINGS_KEY, DEFAULT_WIKI_SETTINGS);
}

export const VISIBILITY_LABEL: Record<WikiVisibility, string> = {
  all: "全員",
  exec: "幹部以上",
  admin: "管理者だけ",
};

export interface WikiViewer {
  isAdmin: boolean;
  /** 幹部・管理者・店舗の管理者 */
  isExec: boolean;
}

export function canSeePage(page: Pick<WikiPage, "visibility" | "deleted">, v: WikiViewer): boolean {
  if (page.deleted) return false;
  if (page.visibility === "admin") return v.isAdmin;
  if (page.visibility === "exec") return v.isExec || v.isAdmin;
  return true;
}

/** 編集できるか（幹部・管理者、または権限を付けた人） */
export async function canEditWiki(me: Staff | null, v: WikiViewer): Promise<boolean> {
  if (v.isAdmin || v.isExec) return true;
  return staffHasPermission(me, "wiki_edit");
}

export async function listVisiblePages(v: WikiViewer): Promise<WikiPage[]> {
  const pages = await fx().wikiPages.list({ where: { deleted: false }, order: [["category", "asc"], ["title", "asc"]] });
  return pages.filter((p) => canSeePage(p, v));
}

// ---------------------------------------------------------------- 検索（全文検索）

/** 記号・空白を落として、検索用にそろえる（全角英数は半角に、英字は小文字に） */
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　、。，．,.!！?？「」『』（）()【】\[\]・:：;；"'`~\-_*#>|]/g, "");
}

/** 2文字ずつ（日本語は単語の区切りが無いので、2文字の並びで一致を見る） */
export function bigrams(text: string): string[] {
  const t = normalizeForSearch(text);
  if (t.length <= 1) return t ? [t] : [];
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return [...out];
}

export interface SearchHit {
  page: WikiPage;
  score: number;
  /** 一致したあたりの抜き出し */
  excerpt: string;
}

/** 検索のしくみ（あとから意味で探す検索に差し替えられるように、形だけ決めておく） */
export interface WikiRetriever {
  search(query: string, pages: WikiPage[], limit: number): Promise<SearchHit[]>;
}

export const bigramRetriever: WikiRetriever = {
  async search(query, pages, limit) {
    const q = bigrams(query);
    if (q.length === 0) return [];
    const hits: SearchHit[] = [];
    for (const page of pages) {
      const title = normalizeForSearch(page.title);
      const body = normalizeForSearch(`${page.category}${page.body}`);
      let score = 0;
      for (const g of q) {
        if (title.includes(g)) score += 3;
        else if (body.includes(g)) score += 1;
      }
      // 質問の2文字の並びのうち、どれだけ当たったか（短い質問で1つだけ当たったものは落とす）
      const coverage = score / (q.length * 3);
      if (score >= 2 && coverage >= 0.12) hits.push({ page, score: Math.round(coverage * 1000) / 10, excerpt: excerptOf(page.body, query) });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  },
};

/** 検索語の近くを抜き出す（見つからなければ先頭） */
export function excerptOf(body: string, query: string, size = 120): string {
  const flat = body.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/[#*>|`]/g, "").replace(/\s+/g, " ").trim();
  const g = bigrams(query)[0];
  let at = 0;
  if (g) {
    const idx = normalizeForSearch(flat).indexOf(g);
    if (idx > 0) at = Math.max(0, Math.round(idx * (flat.length / Math.max(1, normalizeForSearch(flat).length))) - 20);
  }
  const s = flat.slice(at, at + size);
  return `${at > 0 ? "…" : ""}${s}${at + size < flat.length ? "…" : ""}`;
}

export async function searchWiki(query: string, v: WikiViewer, limit = 8): Promise<SearchHit[]> {
  return bigramRetriever.search(query, await listVisiblePages(v), limit);
}

// ---------------------------------------------------------------- 保存・履歴

export async function savePage(input: {
  id?: string;
  title: string;
  category: string;
  body: string;
  visibility: WikiVisibility;
  sourcePath?: string;
  editedBy: string;
  note?: string;
}): Promise<WikiPage> {
  const f = fx();
  let page: WikiPage | null = null;
  if (input.id) {
    page = await f.wikiPages.update(input.id, {
      title: input.title,
      category: input.category,
      body: input.body,
      visibility: input.visibility,
      updatedBy: input.editedBy,
      updatedAt: new Date(),
    });
  }
  if (!page) {
    page = await f.wikiPages.insert({
      title: input.title,
      category: input.category,
      body: input.body,
      visibility: input.visibility,
      sourcePath: input.sourcePath ?? "",
      createdBy: input.editedBy,
      updatedBy: input.editedBy,
    });
  }
  await f.wikiRevisions.insert({
    pageId: page.id,
    title: page.title,
    category: page.category,
    body: page.body,
    visibility: page.visibility,
    note: input.note ?? (input.id ? "編集" : "作成"),
    editedBy: input.editedBy,
  });
  return page;
}

export async function restorePageRevision(revisionId: string, editedBy: string): Promise<WikiPage | null> {
  const rev = await fx().wikiRevisions.get(revisionId);
  if (!rev) return null;
  const visibility = (["all", "exec", "admin"] as const).includes(rev.visibility as WikiVisibility)
    ? (rev.visibility as WikiVisibility)
    : "all";
  return savePage({
    id: rev.pageId,
    title: rev.title,
    category: rev.category,
    body: rev.body,
    visibility,
    editedBy,
    note: "履歴から戻した",
  });
}

// Notionの書き出しの取り込みで使う文字の加工は、画面（端末）でも使うため lib/wiki/text.ts に分けた
export { cleanNotionTitle, csvToMarkdownTable, rewriteImageLinks, splitTitle } from "@/lib/wiki/text";
