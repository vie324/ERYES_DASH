import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateTimeJa } from "@/lib/date";
import { canCommentOnDailyReport, canViewDailyReport, REPORT_COMMENT_MAX } from "@/lib/eyes/report-comments";
import { PageHeader } from "@/components/ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { DailyReportSummary, reportDateLabel } from "@/components/daily-report-summary";
import { deleteReportCommentAction, postReportCommentAction } from "../actions";

// イーリスの日報1件と、コメント・返信のスレッド。
// 見られるのは、書いた本人・管理者・その店舗を担当する店舗の管理者だけ（それ以外の人には「見つかりません」）。
// 開いた人の、この日報についてのお知らせは既読にする。
export default async function DailyReportThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ posted?: string; error?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const flash = await searchParams;
  const db = getDataStore();

  const report = await db.getDailyReportById(id);
  if (!report) notFound();
  const [author, me, staffList, comments] = await Promise.all([
    db.getStaff(report.staffId),
    db.getStaff(session.staffId),
    db.listStaff(),
    db.listDailyReportComments([report.id]),
  ]);
  // 見る権限のない人には、日報があることも分からないようにする
  if (!author || !me || !canViewDailyReport(me, author)) notFound();
  await db.markAppNotificationsRead(me.id, report.id);

  const isAuthor = me.id === author.id;
  const canComment = canCommentOnDailyReport(me, author);
  const nameOf = (staffId: string) => staffList.find((s) => s.id === staffId)?.name ?? "（不明）";
  const month = report.reportDate.slice(0, 7);

  return (
    <div className="page-narrow">
      <PageHeader
        title={isAuthor ? "日報へのコメント" : `${author.name}さんの日報`}
        backHref={isAuthor ? `/staff/reports?month=${month}` : `/staff/daily-reports?month=${month}`}
        backLabel={isAuthor ? "過去の日報へ戻る" : "日報の一覧へ戻る"}
      />

      {flash.posted && (
        <p role="status" className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          {isAuthor ? "返信しました（コメントした人に通知が届きます）" : "コメントしました（本人に通知が届きます）"}
        </p>
      )}
      {flash.error === "empty" && (
        <p role="alert" className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          コメントを入力してください
        </p>
      )}

      <section className="card mb-4">
        <p className="font-bold mb-2">
          {reportDateLabel(report)}
          {!isAuthor && <span className="text-xs text-ink-500 font-normal ml-2">{author.name}</span>}
        </p>
        <DailyReportSummary report={report} />
      </section>

      <section id="comments" className="scroll-mt-20">
        <h2 className="section-title">コメント（{comments.length}件）</h2>
        {comments.length === 0 ? (
          <p className="text-sm text-ink-500 mb-4">
            {isAuthor ? "まだコメントはありません。" : "まだコメントはありません。最初のひとことを送りましょう。"}
          </p>
        ) : (
          <ol className="space-y-2 mb-4">
            {comments.map((c) => {
              const byAuthor = c.staffId === author.id;
              return (
                <li
                  key={c.id}
                  className={`rounded-2xl border p-4 ${byAuthor ? "bg-white border-ink-100 ml-6" : "bg-brand-50 border-brand-200 mr-6"}`}
                >
                  <p className="text-[11px] font-bold text-brand-700">
                    {nameOf(c.staffId)}
                    {byAuthor && <span className="text-ink-400 font-normal ml-1">（本人）</span>}
                    <span className="text-ink-400 font-normal ml-1.5">{formatDateTimeJa(c.createdAt, true)}</span>
                  </p>
                  <p className="text-sm whitespace-pre-wrap break-words text-ink-800 mt-0.5">{c.body}</p>
                  {c.staffId === me.id && (
                    <form action={deleteReportCommentAction} className="mt-1 text-right">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="report_id" value={report.id} />
                      <ConfirmSubmit message="このコメントを取り消しますか？" className="text-[11px] font-bold text-ink-400 underline">
                        取り消す
                      </ConfirmSubmit>
                    </form>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <form action={postReportCommentAction} className="card space-y-3">
          <input type="hidden" name="report_id" value={report.id} />
          <label htmlFor="comment-body" className="label">
            {isAuthor ? "返信する" : canComment ? "コメントする" : "書き込む"}
          </label>
          <textarea
            id="comment-body"
            name="body"
            rows={3}
            maxLength={REPORT_COMMENT_MAX}
            required
            className="input leading-relaxed"
            placeholder={isAuthor ? "コメントへのお返事" : "よかったところ・次に向けたひとこと"}
          />
          <ConfirmSubmit className="btn-primary w-full" pendingLabel="送っています…">
            {isAuthor ? "返信を送る" : "コメントを送る"}
          </ConfirmSubmit>
          <p className="hint !mt-0">
            {isAuthor
              ? "送ると、コメントした人にアプリのお知らせと通知が届きます。"
              : "送ると、本人にアプリのお知らせと通知が届きます。"}
          </p>
        </form>
      </section>
    </div>
  );
}
