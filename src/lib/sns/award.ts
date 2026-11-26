// 依頼10：月間サンクス表彰。
// 毎月1日に前月分を自動で集計し（もらった数・送った数・ポイント）、管理者向けに表彰候補の一覧を作る。
// 管理者が受賞者を選んで「発表」を押すと、全体共有ルームとタイムラインに表彰の投稿が出る。
// 集計は自動、発表は人が決める。全員の順位を自動で公開はしない（候補の一覧は管理者だけが見る）。

import { fx } from "@/lib/data/tables";
import type { AwardCandidate, AwardWinner, ThanksAward } from "@/lib/data/tables";
import { addMonths, formatMonthJa, monthRange } from "@/lib/date";
import { adminsOf, notifyStaff } from "@/lib/notify";
import { listThanks } from "@/lib/sns";
import type { DataStore } from "@/lib/data/types";

/** その月の候補を数える（非公開のサンクスも数に入れる。取り込んだ昔のカードは、スタッフと一致したものだけ） */
export async function countAwardCandidates(db: DataStore, month: string): Promise<AwardCandidate[]> {
  const { from, to } = monthRange(month);
  const list = await listThanks(db, { from, to });
  const map = new Map<string, AwardCandidate>();
  const row = (id: string) => {
    let r = map.get(id);
    if (!r) {
      r = { staffId: id, received: 0, sent: 0, pointsReceived: 0, pointsSent: 0 };
      map.set(id, r);
    }
    return r;
  };
  for (const t of list) {
    if (t.toStaffId) {
      const r = row(t.toStaffId);
      r.received++;
      r.pointsReceived += t.points;
    }
    if (t.fromStaffId) {
      const r = row(t.fromStaffId);
      r.sent++;
      r.pointsSent += t.points;
    }
  }
  const active = new Set((await db.listStaff()).filter((s) => s.isActive).map((s) => s.id));
  return [...map.values()]
    .filter((c) => active.has(c.staffId))
    .sort((a, b) => b.received - a.received || b.pointsReceived - a.pointsReceived || b.sent - a.sent);
}

/** その月の表彰（なければ集計して下書きを作る）。発表済みは数え直さない */
export async function ensureAward(db: DataStore, month: string, opts: { recount?: boolean } = {}): Promise<ThanksAward> {
  const f = fx();
  const existing = await f.thanksAwards.find({ month });
  if (existing && (existing.status === "announced" || !opts.recount)) return existing;
  const candidates = await countAwardCandidates(db, month);
  if (existing) {
    return (await f.thanksAwards.update(existing.id, { candidates, computedAt: new Date() })) ?? existing;
  }
  return f.thanksAwards.insert({ month, status: "draft", candidates, winners: [], message: "", computedAt: new Date() });
}

/** 毎月1日の定時実行：前月分を集計して、管理者に「候補ができました」と知らせる */
export async function monthlyAwardJob(db: DataStore, today: string): Promise<string> {
  const month = addMonths(today.slice(0, 7), -1);
  const award = await ensureAward(db, month, { recount: true });
  await notifyStaff(db, await adminsOf(db), {
    kind: "sns",
    title: `${formatMonthJa(month)}の月間サンクス表彰の候補ができました`,
    body: `候補 ${award.candidates.length}人。受賞者を選んで発表してください`,
    href: `/staff/sns/awards?month=${month}`,
    refId: `award-${month}`,
  });
  return `${month}：候補 ${award.candidates.length}人`;
}

/**
 * 発表する：タイムラインに表彰の投稿、全体共有ルームにも投稿し、全員に知らせる。
 * 発表した月の表彰は、もう数え直さない。
 */
export async function announceAward(
  db: DataStore,
  input: { month: string; winners: AwardWinner[]; message: string; announcedBy: string }
): Promise<ThanksAward> {
  const f = fx();
  const award = await ensureAward(db, input.month);
  if (award.status === "announced") return award;
  const staff = await db.listStaff();
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name ?? "（退職したスタッフ）";
  const lines = input.winners.map((w) => `🏆 ${w.title}：${nameOf(w.staffId)}さん${w.comment ? `\n　${w.comment}` : ""}`);
  const body = [`【${formatMonthJa(input.month)} 月間サンクス表彰】`, ...lines, input.message ? `\n${input.message}` : ""]
    .filter(Boolean)
    .join("\n");

  const post = await f.snsPosts.insert({
    kind: "award",
    authorStaffId: input.announcedBy,
    storeId: null,
    category: "表彰",
    body,
    photos: [],
  });

  // 全体共有ルームにも投稿（ルームが無ければ作る）
  try {
    const active = staff.filter((s) => s.isActive).map((s) => s.id);
    const room = await db.ensureAllRoom(active);
    await db.createChatMessage({ roomId: room.id, senderId: input.announcedBy, body, image: "" });
  } catch (e) {
    console.error(`[award] 全体共有ルームへの投稿に失敗: ${e instanceof Error ? e.message : String(e)}`);
  }

  const updated =
    (await f.thanksAwards.update(award.id, {
      status: "announced",
      winners: input.winners,
      message: input.message,
      announcedAt: new Date(),
      announcedBy: input.announcedBy,
      postId: post.id,
    })) ?? award;

  await notifyStaff(db, staff.filter((s) => s.isActive).map((s) => s.id), {
    kind: "sns",
    title: `🏆 ${formatMonthJa(input.month)}の月間サンクス表彰`,
    body: input.winners.map((w) => `${w.title}：${nameOf(w.staffId)}さん`).join("／"),
    href: `/staff/sns/post/${post.id}`,
    refId: post.id,
  });
  return updated;
}
