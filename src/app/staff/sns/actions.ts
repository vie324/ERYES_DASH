"use server";

// 依頼10：社内SNS（いい事例・サンクス・いいね・コメント・固定・表彰の発表）の保存。
// 権限は画面だけでなく、ここでももう一度確かめる（URLやフォームを直接たたいても通らない）。

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { requireViewer } from "@/lib/viewer";
import { InputError, attempt, bool, int, resultUrl, str, isMonth } from "@/lib/action-utils";
import { notifyStaff } from "@/lib/notify";
import { shortName } from "@/lib/push/notify";
import { CARD_COLORS, canSeeThanks, getSnsSettings, listThanks, pointsUsedInMonth } from "@/lib/sns";
import { announceAward, ensureAward } from "@/lib/sns/award";
import { thisMonthJst } from "@/lib/date";
import type { AwardWinner } from "@/lib/data/tables";

/** 戻り先（社内SNSの画面の中だけ） */
function backOf(fd: FormData, fallback = "/staff/sns"): string {
  const b = str(fd, "back", 300);
  return /^\/staff\/sns(\/|\?|#|$)/.test(b) ? b : fallback;
}

const MAX_PHOTOS = 4;
const MAX_PHOTO_CHARS = 1_400_000;

/** いい事例を投稿する（写真は端末で縮めた data URL。最大4枚） */
export async function createPostAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const db = getDataStore();
  const settings = await getSnsSettings(db);
  const body = str(fd, "body", 3000);
  const category = str(fd, "category", 40);
  const photos = fd
    .getAll("photos")
    .map(String)
    .filter((p) => p.startsWith("data:image/") && p.length < MAX_PHOTO_CHARS)
    .slice(0, MAX_PHOTOS);
  const announce = bool(fd, "announce") && v.isExec;

  let postId = "";
  const r = await attempt(async () => {
    if (!body && photos.length === 0) throw new InputError("文章か写真を入れてください");
    if (!settings.categories.includes(category)) throw new InputError("カテゴリを選んでください");
    const post = await fx().snsPosts.insert({
      kind: "case",
      authorStaffId: v.staffId,
      storeId: v.me?.storeId ?? null,
      category,
      body,
      photos,
    });
    postId = post.id;
    // 幹部・管理者が「お知らせとして届ける」を選んだら、全員に（開くまで消えない）お知らせを送る
    if (announce) {
      const all = (await db.listStaff()).filter((s) => s.isActive && s.id !== v.staffId).map((s) => s.id);
      await notifyStaff(db, all, {
        kind: "sns",
        title: `📣 ${shortName(v.session.name)}さんからのお知らせ`,
        body: body || "写真が投稿されました",
        href: `/staff/sns/post/${post.id}`,
        refId: post.id,
      });
    }
    return announce ? "投稿して、全員にお知らせしました" : "投稿しました";
  });
  revalidatePath("/staff/sns");
  redirect(resultUrl(r.ok ? `/staff/sns#p-${postId}` : "/staff/sns/new", r));
}

/** 投稿を消す（投稿した本人と管理者だけ） */
export async function deletePostAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const id = str(fd, "id", 80);
  const r = await attempt(async () => {
    const post = await fx().snsPosts.get(id);
    if (!post) throw new InputError("投稿が見つかりません");
    if (post.authorStaffId !== v.staffId && !v.isAdmin) throw new InputError("自分の投稿だけ消せます");
    await fx().snsPosts.update(id, { deleted: true, updatedAt: new Date() });
    return "投稿を消しました";
  });
  revalidatePath("/staff/sns");
  redirect(resultUrl("/staff/sns", r));
}

/** 投稿をいちばん上に固定する・外す（幹部・管理者だけ） */
export async function togglePinAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const id = str(fd, "id", 80);
  const back = backOf(fd);
  const r = await attempt(async () => {
    if (!v.isExec) throw new InputError("固定できるのは幹部と管理者だけです");
    const post = await fx().snsPosts.get(id);
    if (!post || post.deleted) throw new InputError("投稿が見つかりません");
    const pinned = !post.pinnedAt;
    await fx().snsPosts.update(id, { pinnedAt: pinned ? new Date() : null, pinnedBy: pinned ? v.staffId : null });
    return pinned ? "いちばん上に固定しました" : "固定を外しました";
  });
  revalidatePath("/staff/sns");
  redirect(resultUrl(back, r));
}

/** いいね（投稿・サンクスの両方） */
export async function toggleLikeAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const db = getDataStore();
  const type = str(fd, "type", 10);
  const id = str(fd, "id", 80);
  const back = backOf(fd);
  if (type === "post") {
    const f = fx();
    const post = await f.snsPosts.get(id);
    if (post && !post.deleted) {
      const mine = await f.snsLikes.find({ postId: id, staffId: v.staffId });
      if (mine) await f.snsLikes.remove(mine.id);
      else await f.snsLikes.insert({ postId: id, staffId: v.staffId }).catch(() => undefined);
    }
  } else if (type === "thanks") {
    const t = (await listThanks(db, { limit: 5000 })).find((x) => x.id === id);
    if (t && t.kind === "app" && canSeeThanks(t, v.staffId, v.isAdmin)) await db.toggleThanksLike(id, v.staffId);
  }
  revalidatePath("/staff/sns");
  redirect(back);
}

/** コメント（投稿・サンクスの両方）。書かれた人には、開くまで消えないお知らせで届く */
export async function addCommentAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const db = getDataStore();
  const type = str(fd, "type", 10);
  const id = str(fd, "id", 80);
  const body = str(fd, "body", 500);
  const back = backOf(fd, type === "post" ? `/staff/sns/post/${id}` : `/staff/sns/thanks/${id}`);
  const r = await attempt(async () => {
    if (!body) throw new InputError("コメントを入れてください");
    if (type === "post") {
      const post = await fx().snsPosts.get(id);
      if (!post || post.deleted) throw new InputError("投稿が見つかりません");
      await fx().snsComments.insert({ postId: id, staffId: v.staffId, body });
      if (post.authorStaffId !== v.staffId) {
        await notifyStaff(db, [post.authorStaffId], {
          kind: "sns",
          title: `💬 ${shortName(v.session.name)}さんがコメントしました`,
          body,
          href: `/staff/sns/post/${id}`,
          refId: id,
        });
      }
    } else {
      const t = (await listThanks(db, { limit: 5000 })).find((x) => x.id === id);
      if (!t || t.kind !== "app" || !canSeeThanks(t, v.staffId, v.isAdmin)) throw new InputError("サンクスが見つかりません");
      await db.createThanksComment({ postId: id, staffId: v.staffId, body });
      const to = [t.fromStaffId, t.toStaffId].filter((x): x is string => Boolean(x) && x !== v.staffId);
      await notifyStaff(db, to, {
        kind: "sns",
        title: `💬 ${shortName(v.session.name)}さんがサンクスにコメントしました`,
        body,
        href: `/staff/sns/thanks/${id}`,
        refId: id,
      });
    }
    return "コメントしました";
  });
  revalidatePath("/staff/sns");
  redirect(resultUrl(back, r));
}

/** コメントを消す（書いた本人と管理者。いい事例のコメントだけ） */
export async function deleteCommentAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const id = str(fd, "id", 80);
  const back = backOf(fd);
  const r = await attempt(async () => {
    const c = await fx().snsComments.get(id);
    if (!c) throw new InputError("コメントが見つかりません");
    if (c.staffId !== v.staffId && !v.isAdmin) throw new InputError("自分のコメントだけ消せます");
    await fx().snsComments.update(id, { deleted: true });
    return "コメントを消しました";
  });
  redirect(resultUrl(back, r));
}

/**
 * サンクスを送る（相手・ひとこと・スタンプ・カードの色・ポイント・非公開）。
 * 本体は今のサンクスカード（thanks_posts）に入れるので、これまでの集計・ホームの数字とそろう。
 */
export async function sendThanksAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const db = getDataStore();
  const settings = await getSnsSettings(db);
  const toId = str(fd, "to", 80);
  const body = str(fd, "body", 500);
  const stamp = str(fd, "stamp", 8);
  const colorRaw = str(fd, "card_color", 10);
  const cardColor = (CARD_COLORS as readonly string[]).includes(colorRaw) ? colorRaw : "gold";
  const points = Math.max(0, int(fd, "points", 0));
  const isPrivate = bool(fd, "private");

  let thanksId = "";
  const r = await attempt(async () => {
    const to = await db.getStaff(toId);
    if (!to || !to.isActive || to.id === v.staffId) throw new InputError("送る相手を選んでください（自分には送れません）");
    if (!body) throw new InputError("ひとことを入れてください");
    if (stamp && !settings.stamps.includes(stamp)) throw new InputError("スタンプを選び直してください");
    if (points > settings.maxPointsPerThanks) throw new InputError(`1回に添えられるポイントは${settings.maxPointsPerThanks}までです`);
    if (points > 0) {
      const used = await pointsUsedInMonth(db, v.staffId, thisMonthJst());
      if (used + points > settings.monthlyPoints) {
        throw new InputError(`今月のポイントが足りません（残り ${Math.max(0, settings.monthlyPoints - used)}）`);
      }
    }
    const post = await db.createThanksPost({ fromStaffId: v.staffId, toStaffId: to.id, body, cardColor });
    thanksId = post.id;
    // スタンプ・ポイント・非公開は追加のテーブルへ（DBの準備前でも、サンクスそのものは届く）
    if (stamp || points > 0 || isPrivate) {
      try {
        await fx().thanksExtras.insert({
          thanksId: post.id,
          fromStaffId: v.staffId,
          toStaffId: to.id,
          stamp,
          points,
          isPrivate,
          source: "app",
        });
      } catch (e) {
        console.error(`[sns] サンクスの追加情報の保存に失敗: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await notifyStaff(db, [to.id], {
      kind: "thanks",
      title: `💛 ${shortName(v.session.name)}さんからサンクスが届きました`,
      body: `${stamp ? `${stamp} ` : ""}${body}${points > 0 ? `（${points}pt）` : ""}`,
      href: `/staff/sns/thanks/${post.id}`,
      refId: post.id,
      tag: "thanks",
    });
    return isPrivate ? "サンクスを送りました（タイムラインには出ません）" : "サンクスを送りました🎉";
  });
  revalidatePath("/staff/sns");
  redirect(resultUrl(r.ok ? `/staff/sns?tab=thanks#t-${thanksId}` : "/staff/sns/thanks/new", r));
}

// ---------------------------------------------------------------- 月間サンクス表彰（管理者だけ）

/** 候補を数え直す */
export async function recountAwardAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const month = str(fd, "month", 7);
  const r = await attempt(async () => {
    if (!v.isAdmin) throw new InputError("管理者だけが使えます");
    if (!isMonth(month)) throw new InputError("月が正しくありません");
    const award = await ensureAward(getDataStore(), month, { recount: true });
    if (award.status === "announced") throw new InputError("発表済みの月は数え直せません");
    return `数え直しました（候補 ${award.candidates.length}人）`;
  });
  redirect(resultUrl(`/staff/sns/awards?month=${month}`, r));
}

/** 受賞者を選んで発表する */
export async function announceAwardAction(fd: FormData): Promise<void> {
  const v = await requireViewer();
  const month = str(fd, "month", 7);
  const message = str(fd, "message", 1000);
  const winners: AwardWinner[] = fd
    .getAll("winner")
    .map(String)
    .map((staffId) => ({
      staffId,
      title: str(fd, `title_${staffId}`, 40) || "月間サンクス賞",
      comment: str(fd, `comment_${staffId}`, 300),
    }));
  const r = await attempt(async () => {
    if (!v.isAdmin) throw new InputError("発表できるのは管理者だけです");
    if (!isMonth(month)) throw new InputError("月が正しくありません");
    if (winners.length === 0) throw new InputError("受賞者を1人以上選んでください");
    const db = getDataStore();
    const award = await ensureAward(db, month);
    if (award.status === "announced") throw new InputError("この月はもう発表しています");
    const ids = new Set(award.candidates.map((c) => c.staffId));
    const staff = await db.listStaff();
    if (winners.some((w) => !ids.has(w.staffId) && !staff.some((s) => s.id === w.staffId && s.isActive))) {
      throw new InputError("受賞者を選び直してください");
    }
    await announceAward(db, { month, winners, message, announcedBy: v.staffId });
    return "発表しました。全体共有ルームとタイムラインに投稿しました";
  });
  revalidatePath("/staff/sns");
  redirect(resultUrl(`/staff/sns/awards?month=${month}`, r));
}
