import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addMonths, formatDateJa, formatDateTimeJa, formatMonthJa, formatWeekJa, monthRange, thisMonthJst } from "@/lib/date";
import {
  ALL_WEEKLY_ITEMS,
  RANK_LABEL,
  STYLIST_REPORT_NUMBERS,
  STYLIST_REPORT_TEXTS,
  formatEniAnswer,
} from "@/lib/eni/forms";
import { EniAnswersView } from "@/components/eni-form-fields";
import { EmptyState, MonthNav, PageHeader } from "@/components/ui";
import type { AssistantRank } from "@/lib/data/types";
import { commentReportAction } from "./actions";

// スタイリスト日報・アシスタント週報の閲覧。
// スタイリスト・幹部・管理者は日報を、アシスタント・スタイリスト・幹部・管理者は週報を、それぞれ全員分見られる。
// 上司（幹部・スタイリスト・管理者）は各レポートに全体コメントを送れる。
export default async function EniReportsViewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; tab?: string; commented?: string }>;
}) {
  const session = await requireSession();
  const db = getDataStore();
  const me = await db.getStaff(session.staffId);
  const jobType = me?.jobType ?? "";
  const isExec = session.role === "admin" || (me?.isExecutive ?? false);

  const canSeeStylist = isExec || jobType === "stylist";
  const canSeeWeekly = isExec || jobType === "stylist" || jobType === "assistant";
  const canComment = isExec || jobType === "stylist";
  if (!canSeeStylist && !canSeeWeekly) redirect("/staff");

  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : thisMonthJst();
  // 見られるタブに合わせて既定タブを決める
  let tab = params.tab === "weekly" ? "weekly" : "stylist";
  if (tab === "stylist" && !canSeeStylist) tab = "weekly";
  if (tab === "weekly" && !canSeeWeekly) tab = "stylist";
  const { from, to } = monthRange(month);

  const [stylistReports, weeklyReports, staffList] = await Promise.all([
    canSeeStylist ? db.listEniReports("stylist", { from, to }) : Promise.resolve([]),
    canSeeWeekly ? db.listEniReports("weekly", { from, to }) : Promise.resolve([]),
    db.listStaff(),
  ]);
  const staffMap = new Map(staffList.map((s) => [s.id, s.name]));

  const reports = tab === "stylist" ? stylistReports : weeklyReports;

  return (
    <div>
      <PageHeader title="日報・週報を見る" backHref="/staff" />

      {params.commented && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          コメントを送りました
        </p>
      )}

      <div className="flex gap-1.5 mb-4">
        {canSeeStylist && (
          <a
            href={`/staff/eni-reports?month=${month}&tab=stylist`}
            className={`chip flex-1 justify-center !text-sm !py-2 ${
              tab === "stylist" ? "chip-active" : ""
            }`}
          >
            スタイリスト日報（{stylistReports.length}）
          </a>
        )}
        {canSeeWeekly && (
          <a
            href={`/staff/eni-reports?month=${month}&tab=weekly`}
            className={`chip flex-1 justify-center !text-sm !py-2 ${
              tab === "weekly" ? "chip-active" : ""
            }`}
          >
            アシスタント週報（{weeklyReports.length}）
          </a>
        )}
      </div>

      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={`/staff/eni-reports?month=${addMonths(month, -1)}&tab=${tab}`}
        nextHref={`/staff/eni-reports?month=${addMonths(month, 1)}&tab=${tab}`}
      />

      {reports.length === 0 ? (
        <EmptyState message={`この月の${tab === "stylist" ? "日報" : "週報"}はまだありません`} />
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="card">
              <p className="text-xs font-bold text-ink-500 mb-2">
                {tab === "stylist" ? formatDateJa(r.periodKey, true) : formatWeekJa(r.periodKey)} ／{" "}
                <span className="text-ink-900 text-sm">{staffMap.get(r.staffId) ?? "（不明）"}</span>
                {tab === "weekly" && typeof r.answers._rank === "string" && r.answers._rank && (
                  <span className="ml-1 text-brand-600">
                    ［{RANK_LABEL[r.answers._rank as AssistantRank]}］
                  </span>
                )}
              </p>

              {tab === "stylist" ? <StylistView answers={r.answers} /> : (
                <EniAnswersView items={ALL_WEEKLY_ITEMS} answers={r.answers} />
              )}

              {/* 上司からのコメント（表示＋入力） */}
              <div className="mt-3 pt-3 border-t border-ink-100">
                {r.comment && (
                  <div className="rounded-xl bg-brand-50 border border-brand-100 p-3 mb-2">
                    <p className="text-[11px] font-bold text-brand-700">
                      上司コメント{r.commentedBy ? `（${staffMap.get(r.commentedBy) ?? ""}）` : ""}
                    </p>
                    <p className="text-sm whitespace-pre-wrap text-ink-800 mt-0.5">{r.comment}</p>
                  </div>
                )}
                {canComment && (
                  <form action={commentReportAction} className="space-y-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="back" value={`/staff/eni-reports?month=${month}&tab=${tab}`} />
                    <textarea
                      name="comment"
                      rows={2}
                      defaultValue={r.comment}
                      placeholder="全体へのコメント・アドバイスを送る"
                      className="input min-h-16"
                    />
                    <button type="submit" className="btn-secondary w-full !min-h-10 !py-1.5 text-sm">
                      コメントを送る
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** スタイリスト日報の表示（時間のまとめ＋数字＋テキスト） */
function StylistView({ answers }: { answers: Record<string, unknown> }) {
  const numAnswer = (key: string): number | null =>
    typeof answers[key] === "number" && Number.isFinite(answers[key]) ? (answers[key] as number) : null;
  const util = numAnswer("utilization");
  const diff = numAnswer("time_diff");
  const clients = numAnswer("client_count");
  const early = numAnswer("minutes_early");
  const over = numAnswer("minutes_over");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {clients !== null && (
          <span><span className="text-xs text-ink-500">客数</span> <span className="font-bold">{clients}人</span></span>
        )}
        {util !== null && (
          <span><span className="text-xs text-ink-500">稼働率</span> <span className="font-bold text-brand-700">{util}%</span></span>
        )}
        {diff !== null && (
          <span>
            <span className="text-xs text-ink-500">施術時間±</span>{" "}
            <span className={`font-bold ${diff > 0 ? "text-red-500" : diff < 0 ? "text-emerald-600" : ""}`}>
              {diff > 0 ? `+${diff}` : diff}分
            </span>
          </span>
        )}
        {(early !== null || over !== null) && (early ?? 0) + (over ?? 0) > 0 && (
          <span className="text-xs text-ink-500">
            （早く終わり <span className="font-bold text-emerald-700">{early ?? 0}分</span> ／ オーバー{" "}
            <span className="font-bold text-red-500">{over ?? 0}分</span>）
          </span>
        )}
        {STYLIST_REPORT_NUMBERS.map((item) => (
          <span key={item.key}>
            <span className="text-xs text-ink-500">{item.label}</span>{" "}
            <span className="font-bold">{formatEniAnswer(item, answers[item.key])}</span>
          </span>
        ))}
      </div>
      <EniAnswersView items={STYLIST_REPORT_TEXTS} answers={answers} />
    </div>
  );
}
