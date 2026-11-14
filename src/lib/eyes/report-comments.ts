// イーリスの日報（daily_reports）へのコメント・返信（ENiの要望64）。
// 判定は名前ではなく、ロールと担当店舗で行う：
//  ・管理者（admin）…………………… どの日報にもコメントできる
//  ・店舗の管理者（manager）……… 担当店舗（managedStoreIds）に所属するスタッフの日報にコメントできる（例：イーリスを見る管理者）
//  ・書いた本人 ………………………… 自分の日報についたコメントを読み、返信できる
// それ以外の人は、画面でもサーバーの処理でも読めない・書けない。
// コメントがつくと本人に、本人が返信するとコメントした人に、アプリ内のお知らせとプッシュ通知を送る。

import { notifyQuietly, pushPreview, shortName } from "@/lib/push/notify";
import { openNotificationHref } from "@/lib/inbox";
import type { DailyReport, DailyReportComment, DataStore, Staff } from "@/lib/data/types";

type Viewer = Pick<Staff, "id" | "role" | "managedStoreIds">;
type Author = Pick<Staff, "id" | "storeId">;

/** 日報にコメントする側か（管理者、または担当店舗のある店舗の管理者） */
export function isReportReviewer(viewer: Viewer): boolean {
  return viewer.role === "admin" || (viewer.role === "manager" && viewer.managedStoreIds.length > 0);
}

/** その人の日報にコメントできるか（本人の分は「返信」なので含めない） */
export function canCommentOnDailyReport(viewer: Viewer, author: Author): boolean {
  if (viewer.id === author.id) return false;
  if (viewer.role === "admin") return true;
  return viewer.role === "manager" && viewer.managedStoreIds.includes(author.storeId);
}

/** その日報とコメントを読めるか（本人・コメントできる人） */
export function canViewDailyReport(viewer: Viewer, author: Author): boolean {
  return viewer.id === author.id || canCommentOnDailyReport(viewer, author);
}

/** コメント・返信を書けるか（コメントできる人と、本人の返信） */
export function canPostOnDailyReport(viewer: Viewer, author: Author): boolean {
  return canViewDailyReport(viewer, author);
}

/** コメントできる相手（一覧に出すスタッフ）：管理者は全員、店舗の管理者は担当店舗の人 */
export function reviewableStaff(viewer: Viewer, staff: Staff[]): Staff[] {
  return staff.filter((s) => s.id !== viewer.id && canCommentOnDailyReport(viewer, s));
}

/** コメント1件の長さの上限 */
export const REPORT_COMMENT_MAX = 1000;

/** 日報のスレッド（コメントと返信）を開く画面 */
export function reportThreadHref(reportId: string): string {
  return `/staff/daily-reports/${reportId}`;
}

/**
 * コメント・返信を書いて、相手に知らせる。
 *  ・コメントできる人が書いた → 本人へ「日報にコメントが届きました」
 *  ・本人が返信した → これまでにコメントした人（いまもコメントできる人だけ）へ「日報に返信がありました」
 * 権限は呼び出し側（サーバーアクション）で canPostOnDailyReport を確かめてから呼ぶ。
 */
export async function postDailyReportComment(
  db: DataStore,
  input: { report: DailyReport; author: Staff; poster: Staff; body: string }
): Promise<DailyReportComment> {
  const { report, author, poster } = input;
  const body = input.body.replace(/\r\n?/g, "\n").trim().slice(0, REPORT_COMMENT_MAX);
  const comment = await db.addDailyReportComment(report.id, poster.id, body);

  const isReply = poster.id === author.id;
  let recipients: string[];
  if (isReply) {
    const [comments, staff] = await Promise.all([db.listDailyReportComments([report.id]), db.listStaff()]);
    const byId = new Map(staff.map((s) => [s.id, s]));
    recipients = [...new Set(comments.map((c) => c.staffId))].filter((id) => {
      const s = byId.get(id);
      return Boolean(s && s.isActive && id !== author.id && canCommentOnDailyReport(s, author));
    });
  } else {
    recipients = author.isActive ? [author.id] : [];
  }
  if (recipients.length === 0) return comment;

  const title = isReply ? "日報に返信がありました" : "日報にコメントが届きました";
  const text = `${shortName(poster.name)}さん：${pushPreview(body, 60)}`;
  const href = reportThreadHref(report.id);
  await db
    .createAppNotifications(
      recipients.map((staffId) => ({
        staffId,
        kind: isReply ? "report_reply" : "report_comment",
        title,
        body: text,
        href,
        refId: report.id,
      }))
    )
    .catch((e) => console.error("[report-comments] お知らせの作成に失敗:", e instanceof Error ? e.message : e));
  // 通知をタップしたら、既読にしてからスレッドを開く（開いた画面のベルの数字がすぐ消えるように）
  await notifyQuietly(db, recipients, {
    title,
    body: text,
    url: openNotificationHref({ refId: report.id, href }),
    tag: `report-${report.id}`,
    kind: "report",
  });
  return comment;
}

/** コメントを待っている日報を数える日数（今日を含む） */
export const REVIEW_LOOKBACK_DAYS = 3;

/**
 * まだコメントのついていない日報の件数（コメントする人のメニュー・ホームの小さな数字）。
 * 直近 REVIEW_LOOKBACK_DAYS 日の、コメントできる相手の日報だけを数える。
 */
export async function countUncommentedReports(db: DataStore, viewer: Viewer, today: string): Promise<number> {
  if (!isReportReviewer(viewer)) return 0;
  const from = new Date(`${today}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - (REVIEW_LOOKBACK_DAYS - 1));
  const [staff, reports] = await Promise.all([
    db.listStaff(),
    db.listDailyReports({ from: from.toISOString().slice(0, 10), to: today }),
  ]);
  const targetIds = new Set(reviewableStaff(viewer, staff).map((s) => s.id));
  const mine = reports.filter((r) => targetIds.has(r.staffId));
  if (mine.length === 0) return 0;
  const commented = new Set((await db.listDailyReportComments(mine.map((r) => r.id))).map((c) => c.reportId));
  return mine.filter((r) => !commented.has(r.id)).length;
}
