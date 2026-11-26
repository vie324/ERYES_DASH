// 依頼10：社内SNS（いい事例の共有）＋サンクス。
// いちばんの目的は LINE グループを減らすこと（8月の打ち合わせ）。ENiとイーリスの全員が1つのタイムラインを見る。
//  ・いい事例 …… sns_posts（写真・カテゴリ）。いいね sns_likes・コメント sns_comments
//  ・サンクス …… 本体は今の thanks_posts（今のサンクスカードのデータをそのまま使う）。
//                スタンプ・ポイント・非公開、取り込んだ昔のカードは thanks_extras
//  ・表彰の発表 … sns_posts（kind=award）。lib/sns/award.ts
// 自分あてのサンクス・コメント・幹部からのお知らせは、アプリ内のお知らせ（見ないと消えない）で届く（lib/notify.ts）。

import { fx } from "@/lib/data/tables";
import type { SnsComment, SnsPost, ThanksExtra } from "@/lib/data/tables";
import { jstDayBoundsUtc, monthRange, toJstDateString } from "@/lib/date";
import { readJsonSetting } from "@/lib/feature-settings";
import { parseCsv } from "@/lib/csv-parse";

export { parseCsv };
import type { DataStore, ThanksComment, ThanksPost } from "@/lib/data/types";

// ---------------------------------------------------------------- 設定（管理画面で変える）

export const SNS_SETTINGS_KEY = "sns_settings";
export interface SnsSettings {
  /** いい事例のカテゴリ */
  categories: string[];
  /** サンクスに添えるスタンプ */
  stamps: string[];
  /** 1人が毎月使えるポイント（サンクスギフト。記録して見えるようにするだけで、お金・商品とは交換しない） */
  monthlyPoints: number;
  /** 1回のサンクスに添えられるポイントの上限 */
  maxPointsPerThanks: number;
  /** 投稿画面の注意書き */
  postNotice: string;
  /** 月間サンクス表彰の賞の名前（候補から選ぶ） */
  awardTitles: string[];
}

export const DEFAULT_SNS_SETTINGS: SnsSettings = {
  categories: ["接客", "技術", "売上", "チームワーク", "そのほか"],
  stamps: ["👏", "🙏", "💐", "✨", "🔥", "😊", "💯", "🎉"],
  monthlyPoints: 100,
  maxPointsPerThanks: 30,
  postNotice: "お客様のお顔・お名前・カルテの中身など、お客様の個人情報は載せないでください（写真もお顔が写らないものを）。",
  awardTitles: ["月間サンクス賞", "ありがとうを届けたで賞", "チームワーク賞"],
};

export async function getSnsSettings(db: DataStore): Promise<SnsSettings> {
  return readJsonSetting(db, SNS_SETTINGS_KEY, DEFAULT_SNS_SETTINGS);
}

/** カードの色（今のサンクスカードと同じ4色） */
export const CARD_COLORS = ["gold", "rose", "sky", "mint"] as const;
export const CARD_COLOR_LABEL: Record<string, string> = { gold: "ゴールド", rose: "ローズ", sky: "スカイ", mint: "ミント" };

// ---------------------------------------------------------------- サンクス（今の thanks_posts ＋ 追加情報）

/** 画面・集計で使うサンクス1件（アプリで送ったもの・取り込んだ昔のカードの両方） */
export interface ThanksEntry {
  /** アプリで送ったもの＝thanks_posts.id／取り込んだもの＝thanks_extras.id */
  id: string;
  kind: "app" | "import";
  fromStaffId: string | null;
  toStaffId: string | null;
  fromName: string;
  toName: string;
  body: string;
  cardColor: string;
  stamp: string;
  points: number;
  isPrivate: boolean;
  /** 送った日（取り込んだカードは元の日付） "YYYY-MM-DD" */
  date: string;
  createdAt: Date;
}

function entryFromPost(p: ThanksPost, extra: ThanksExtra | undefined): ThanksEntry {
  return {
    id: p.id,
    kind: "app",
    fromStaffId: p.fromStaffId,
    toStaffId: p.toStaffId,
    fromName: "",
    toName: "",
    body: p.body,
    cardColor: p.cardColor,
    stamp: extra?.stamp ?? "",
    points: extra?.points ?? 0,
    isPrivate: extra?.isPrivate ?? false,
    date: toJstDateString(p.createdAt),
    createdAt: p.createdAt,
  };
}

function entryFromImport(x: ThanksExtra): ThanksEntry {
  const date = x.originalDate || toJstDateString(x.createdAt);
  return {
    id: x.id,
    kind: "import",
    fromStaffId: x.fromStaffId,
    toStaffId: x.toStaffId,
    fromName: x.fromName,
    toName: x.toName,
    body: x.body,
    cardColor: x.cardColor || "gold",
    stamp: x.stamp,
    points: x.points,
    isPrivate: x.isPrivate,
    date,
    // 取り込んだカードは、元の日付の正午として並べる
    createdAt: new Date(`${date}T03:00:00Z`),
  };
}

/**
 * 期間のサンクス（from〜to は "YYYY-MM-DD"、両端を含む。省略で直近）。新しい順。
 * ホームの「ありがとう」・月間表彰・タイムラインはすべてここを通す（数字がそろうように）。
 */
export async function listThanks(
  db: DataStore,
  range: { from?: string; to?: string; limit?: number } = {}
): Promise<ThanksEntry[]> {
  const limit = range.limit ?? 5000;
  const posts = await db.listThanksPosts({
    from: range.from ? jstDayBoundsUtc(range.from).start : undefined,
    to: range.to ? jstDayBoundsUtc(range.to).end : undefined,
    limit,
  });
  const f = fx();
  const [extras, imports] = await Promise.all([
    f.thanksExtras.list({ where: { thanksId: { in: posts.map((p) => p.id) } } }),
    f.thanksExtras.list({
      where: {
        source: "import",
        ...(range.from || range.to ? { originalDate: { gte: range.from, lte: range.to } } : {}),
      },
      order: [["originalDate", "desc"]],
      limit,
    }),
  ]);
  const byThanks = new Map(extras.map((x) => [x.thanksId ?? "", x]));
  return [...posts.map((p) => entryFromPost(p, byThanks.get(p.id))), ...imports.map(entryFromImport)]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

/** その人がその月に使ったポイント（送ったサンクスに添えた分の合計） */
export async function pointsUsedInMonth(db: DataStore, staffId: string, month: string): Promise<number> {
  const { from, to } = monthRange(month);
  const list = await listThanks(db, { from, to });
  return list.filter((t) => t.fromStaffId === staffId).reduce((sum, t) => sum + t.points, 0);
}

/** そのサンクスを見られるか（非公開は送った人・もらった人・管理者だけ） */
export function canSeeThanks(t: Pick<ThanksEntry, "isPrivate" | "fromStaffId" | "toStaffId">, viewerId: string, isAdmin: boolean): boolean {
  if (!t.isPrivate) return true;
  return isAdmin || t.fromStaffId === viewerId || t.toStaffId === viewerId;
}

// ---------------------------------------------------------------- タイムライン

export type TimelineTab = "all" | "cases" | "thanks" | "awards";

export type TimelineItem =
  | {
      type: "post";
      id: string;
      createdAt: Date;
      post: SnsPost;
      likeCount: number;
      liked: boolean;
      comments: SnsComment[];
    }
  | {
      type: "thanks";
      id: string;
      createdAt: Date;
      thanks: ThanksEntry;
      likeCount: number;
      liked: boolean;
      comments: ThanksComment[];
    };

export interface TimelineFilter {
  tab: TimelineTab;
  storeId?: string;
  category?: string;
  limit?: number;
}

/**
 * タイムラインを組み立てる。固定した投稿がいちばん上、あとは新しい順。
 * 店舗の絞り込みは、投稿＝投稿した人の店舗（投稿に記録した店舗）、サンクス＝もらった人の所属店舗で見る。
 */
export async function buildTimeline(
  db: DataStore,
  viewer: { staffId: string; isAdmin: boolean },
  filter: TimelineFilter
): Promise<{ pinned: TimelineItem[]; items: TimelineItem[] }> {
  const limit = filter.limit ?? 60;
  const f = fx();
  const staff = await db.listStaff();
  const storeOf = new Map(staff.map((s) => [s.id, s.storeId]));

  const wantPosts = filter.tab !== "thanks";
  const wantThanks = (filter.tab === "all" || filter.tab === "thanks") && !filter.category;

  const posts = wantPosts
    ? (
        await f.snsPosts.list({
          where: {
            deleted: false,
            ...(filter.tab === "cases" ? { kind: "case" as const } : filter.tab === "awards" ? { kind: "award" as const } : {}),
            ...(filter.category ? { category: filter.category } : {}),
          },
          order: [["createdAt", "desc"]],
          limit: limit + 20,
        })
      ).filter((p) => !filter.storeId || p.storeId === filter.storeId || p.kind === "award")
    : [];

  const thanks = wantThanks
    ? (await listThanks(db, { limit: limit + 20 }))
        .filter((t) => canSeeThanks(t, viewer.staffId, viewer.isAdmin))
        .filter((t) => !filter.storeId || (t.toStaffId && storeOf.get(t.toStaffId) === filter.storeId))
    : [];

  const postIds = posts.map((p) => p.id);
  const appThanksIds = thanks.filter((t) => t.kind === "app").map((t) => t.id);
  const [postLikes, postComments, thanksLikes, thanksComments] = await Promise.all([
    f.snsLikes.list({ where: { postId: { in: postIds } } }),
    f.snsComments.list({ where: { postId: { in: postIds }, deleted: false }, order: [["createdAt", "asc"]] }),
    appThanksIds.length > 0 ? db.listThanksLikes(appThanksIds) : Promise.resolve([]),
    appThanksIds.length > 0 ? db.listThanksComments(appThanksIds) : Promise.resolve([]),
  ]);

  const items: TimelineItem[] = [
    ...posts.map(
      (post): TimelineItem => ({
        type: "post",
        id: post.id,
        createdAt: post.createdAt,
        post,
        likeCount: postLikes.filter((l) => l.postId === post.id).length,
        liked: postLikes.some((l) => l.postId === post.id && l.staffId === viewer.staffId),
        comments: postComments.filter((c) => c.postId === post.id),
      })
    ),
    ...thanks.map(
      (t): TimelineItem => ({
        type: "thanks",
        id: t.id,
        createdAt: t.createdAt,
        thanks: t,
        likeCount: thanksLikes.filter((l) => l.postId === t.id).length,
        liked: thanksLikes.some((l) => l.postId === t.id && l.staffId === viewer.staffId),
        comments: thanksComments.filter((c) => c.postId === t.id),
      })
    ),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const pinned = items
    .filter((i) => i.type === "post" && i.post.pinnedAt)
    .sort((a, b) => {
      const pa = a.type === "post" ? (a.post.pinnedAt?.getTime() ?? 0) : 0;
      const pb = b.type === "post" ? (b.post.pinnedAt?.getTime() ?? 0) : 0;
      return pb - pa;
    });
  const rest = items.filter((i) => !(i.type === "post" && i.post.pinnedAt)).slice(0, limit);
  return { pinned, items: rest };
}

/** 1件だけ（詳細画面）。見られないものは null */
export async function getTimelineItem(
  db: DataStore,
  viewer: { staffId: string; isAdmin: boolean },
  type: "post" | "thanks",
  id: string
): Promise<TimelineItem | null> {
  const f = fx();
  if (type === "post") {
    const post = await f.snsPosts.get(id);
    if (!post || post.deleted) return null;
    const [likes, comments] = await Promise.all([
      f.snsLikes.list({ where: { postId: id } }),
      f.snsComments.list({ where: { postId: id, deleted: false }, order: [["createdAt", "asc"]] }),
    ]);
    return {
      type: "post",
      id,
      createdAt: post.createdAt,
      post,
      likeCount: likes.length,
      liked: likes.some((l) => l.staffId === viewer.staffId),
      comments,
    };
  }
  // サンクス：アプリで送ったもの（thanks_posts）か、取り込んだもの（thanks_extras）
  const recent = await listThanks(db, { limit: 5000 });
  const t = recent.find((x) => x.id === id);
  if (!t || !canSeeThanks(t, viewer.staffId, viewer.isAdmin)) return null;
  const [likes, comments] =
    t.kind === "app" ? await Promise.all([db.listThanksLikes([id]), db.listThanksComments([id])]) : [[], []];
  return {
    type: "thanks",
    id,
    createdAt: t.createdAt,
    thanks: t,
    likeCount: likes.length,
    liked: likes.some((l) => l.staffId === viewer.staffId),
    comments,
  };
}

/** 未読のお知らせが残っている投稿・サンクス（タイムラインで「未読」の印を付ける） */
export async function unreadRefIds(db: DataStore, staffId: string): Promise<Set<string>> {
  const list = await db.listAppNotifications(staffId, 100);
  return new Set(list.filter((n) => n.readAt === null && (n.kind === "sns" || n.kind === "thanks")).map((n) => n.refId));
}

// ---------------------------------------------------------------- 昔のサンクスカードの取り込み（CSV）

export interface ThanksImportRow {
  date: string;
  from: string;
  to: string;
  body: string;
}

/** CSVの1行目を見出しとして、日付・送った人・もらった人・メッセージの列を探す（列の順番は自由） */
export function parseThanksCsv(text: string): { rows: ThanksImportRow[]; errors: string[] } {
  const lines = parseCsv(text.replace(/^﻿/, ""));
  if (lines.length < 2) return { rows: [], errors: ["1行目に見出し、2行目からデータを入れてください"] };
  const head = lines[0].map((h) => h.trim());
  const col = (names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const ci = {
    date: col(["日付", "日", "date"]),
    from: col(["送った", "送り主", "差出", "from"]),
    to: col(["もらった", "受け取", "宛", "to"]),
    body: col(["メッセージ", "本文", "内容", "message"]),
  };
  const errors: string[] = [];
  if (ci.from < 0 || ci.to < 0 || ci.body < 0) {
    return { rows: [], errors: ["見出しに「送った人」「もらった人」「メッセージ」（と「日付」）の列が必要です"] };
  }
  const rows: ThanksImportRow[] = [];
  lines.slice(1).forEach((cells, i) => {
    const get = (k: keyof typeof ci) => (ci[k] >= 0 ? (cells[ci[k]] ?? "").trim() : "");
    const body = get("body");
    if (!body) return;
    const date = normalizeDate(get("date"));
    if (get("date") && !date) errors.push(`${i + 2}行目：日付が読めません（${get("date")}）`);
    rows.push({ date: date ?? "", from: get("from"), to: get("to"), body: body.slice(0, 1000) });
  });
  return { rows, errors };
}

/** "2026/3/5"・"2026-03-05"・"2026年3月5日" を "2026-03-05" に */
export function normalizeDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{4})[/\-年.](\d{1,2})[/\-月.](\d{1,2})日?/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return Number.isNaN(new Date(`${date}T00:00:00Z`).getTime()) ? null : date;
}

/** 名前の照合（空白を無視。呼び名でも当てる） */
export function matchStaffByName<T extends { id: string; name: string; nickname: string }>(staff: T[], raw: string): T | null {
  const key = raw.replace(/[\s　]/g, "");
  if (!key) return null;
  const hits = staff.filter((s) => s.name.replace(/[\s　]/g, "") === key || (s.nickname && s.nickname === key));
  return hits.length === 1 ? hits[0] : null;
}
