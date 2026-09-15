import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addMonths, formatDateJa, formatDateTimeJa, formatMonthJa, formatWeekJa, monthRange, thisMonthJst } from "@/lib/date";
import {
  ALL_WEEKLY_ITEMS,
  RANK_LABEL,
  STYLIST_REPORT_NUMBERS,
  STYLIST_REPORT_TEXTS,
  capacityMinutes,
  formatEniAnswer,
  formatMinutesJa,
  normalizeTiers,
  rebookRateOf,
  utilizationOf,
} from "@/lib/eni/forms";
import { EniAnswersView } from "@/components/eni-form-fields";
import { EmptyState, MonthNav, PageHeader } from "@/components/ui";
import type { AssistantRank } from "@/lib/data/types";
import { commentReportAction, deleteReportCommentAction } from "./actions";

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

  const [stylistReports, weeklyReports, staffList, practiceRecords] = await Promise.all([
    canSeeStylist ? db.listEniReports("stylist", { from, to }) : Promise.resolve([]),
    canSeeWeekly ? db.listEniReports("weekly", { from, to }) : Promise.resolve([]),
    db.listStaff(),
    // 「どの先輩がどれだけ見てくれているか」の集計に使う（幹部のみ）
    isExec ? db.listPracticeRecords({ from, to }) : Promise.resolve([]),
  ]);
  // コメントは複数人ぶんあるので、表示するレポートのぶんをまとめて読む
  const shownReports = tab === "stylist" ? stylistReports : weeklyReports;
  const comments = await db.listEniReportComments(shownReports.map((r) => r.id));
  const commentsByReport = new Map<string, typeof comments>();
  for (const c of comments) {
    const list = commentsByReport.get(c.reportId) ?? [];
    list.push(c);
    commentsByReport.set(c.reportId, list);
  }
  const staffMap = new Map(staffList.map((s) => [s.id, s.name]));
  // 稼働率は「段数×8時間」を分母に出し直す（マスタで段数を変えたら過去分も揃う）
  const tiersMap = new Map(staffList.map((s) => [s.id, normalizeTiers(s.tiers)]));

  const reports = shownReports;

  // 先輩の指導状況（幹部のみ・週報タブ）。練習記録の「見てくれた人」を先輩ごとにまとめる
  const mentorRows = (() => {
    if (!isExec || tab !== "weekly") return [];
    const byMentor = new Map<string, { count: number; minutes: number; members: Set<string> }>();
    for (const r of practiceRecords) {
      if (!r.partnerStaffId) continue;
      const row = byMentor.get(r.partnerStaffId) ?? { count: 0, minutes: 0, members: new Set<string>() };
      row.count += 1;
      row.minutes += r.minutes;
      row.members.add(r.staffId);
      byMentor.set(r.partnerStaffId, row);
    }
    return [...byMentor.entries()]
      .map(([staffId, v]) => ({ staffId, ...v }))
      .sort((a, b) => b.minutes - a.minutes || b.count - a.count);
  })();

  // アシスタントは週報だけ、スタイリスト以上は日報・週報の両方
  const title = canSeeStylist ? "みんなの日報・週報を見る" : "みんなの週報を見る";
  const backHref = canSeeStylist ? "/staff/eni-report" : "/staff/weekly-report";
  const backLabel = canSeeStylist ? "日報の入力へ戻る" : "週報の入力へ戻る";

  return (
    <div>
      <PageHeader title={title} backHref={backHref} backLabel={backLabel} icon="fileText" />

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

      {/* 先輩の指導状況（幹部のみ）。練習記録の「見てくれた人」から集計する */}
      {mentorRows.length > 0 && (
        <details className="card mb-4" open>
          <summary className="cursor-pointer text-sm font-bold text-brand-700">
            先輩の指導状況（{formatMonthJa(month)}・幹部のみ）
          </summary>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm min-w-[22rem]">
              <thead>
                <tr className="text-left text-xs text-ink-500 border-b border-ink-100">
                  <th className="py-1.5 pr-3 font-bold">先輩</th>
                  <th className="py-1.5 pr-3 font-bold text-right">回数</th>
                  <th className="py-1.5 pr-3 font-bold text-right">合計</th>
                  <th className="py-1.5 font-bold text-right">見た人数</th>
                </tr>
              </thead>
              <tbody>
                {mentorRows.map((row) => (
                  <tr key={row.staffId} className="border-b border-ink-50 last:border-0">
                    <td className="py-1.5 pr-3 font-bold">{staffMap.get(row.staffId) ?? "（不明）"}</td>
                    <td className="py-1.5 pr-3 text-right">{row.count}回</td>
                    <td className="py-1.5 pr-3 text-right font-bold">{formatMinutesJa(row.minutes)}</td>
                    <td className="py-1.5 text-right">{row.members.size}人</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-ink-400 mt-2">
            練習記録の「見てくれた人」を集計したものです。週報の「誰に何回見てもらえているのか」は、
            各週報の中で本人の言葉として見られます。
          </p>
        </details>
      )}

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

              {tab === "stylist" ? (
                <StylistView answers={r.answers} tiers={tiersMap.get(r.staffId) ?? 1} />
              ) : (
                <EniAnswersView items={ALL_WEEKLY_ITEMS} answers={r.answers} />
              )}

              {/* コメント（何人でも書ける。前の人のコメントは消えない） */}
              <div className="mt-3 pt-3 border-t border-ink-100 space-y-2">
                {/* 旧データ：1枠しか無かった頃のコメント */}
                {r.comment && (
                  <div className="rounded-xl bg-brand-50 border border-brand-100 p-3">
                    <p className="text-[11px] font-bold text-brand-700">
                      コメント{r.commentedBy ? `（${staffMap.get(r.commentedBy) ?? ""}）` : ""}
                    </p>
                    <p className="text-sm whitespace-pre-wrap text-ink-800 mt-0.5">{r.comment}</p>
                  </div>
                )}
                {(commentsByReport.get(r.id) ?? []).map((c) => (
                  <div key={c.id} className="rounded-xl bg-brand-50 border border-brand-100 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[11px] font-bold text-brand-700">
                        {staffMap.get(c.staffId) ?? "（不明）"}
                        <span className="text-ink-400 font-normal ml-1.5">
                          {formatDateTimeJa(c.createdAt, true)}
                        </span>
                      </p>
                      {c.staffId === session.staffId && (
                        <form action={deleteReportCommentAction}>
                          <input type="hidden" name="comment_id" value={c.id} />
                          <input type="hidden" name="back" value={`/staff/eni-reports?month=${month}&tab=${tab}`} />
                          <button type="submit" className="text-[11px] text-ink-400 underline" aria-label="コメントを削除">
                            削除
                          </button>
                        </form>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap text-ink-800 mt-0.5">{c.body}</p>
                  </div>
                ))}
                {canComment && (
                  <form action={commentReportAction} className="space-y-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="back" value={`/staff/eni-reports?month=${month}&tab=${tab}`} />
                    <textarea
                      name="comment"
                      rows={2}
                      placeholder="コメント・アドバイスを送る（前の人のコメントは消えません）"
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

/** %の小さなメーター表示（稼働率・次回予約率で共用） */
function RateBadge({
  label,
  rate,
  goodFrom,
}: {
  label: string;
  rate: number | null;
  /** この%以上なら緑で表示 */
  goodFrom: number;
}) {
  const tone =
    rate === null
      ? "text-ink-400"
      : rate >= goodFrom
        ? "text-emerald-600"
        : rate >= goodFrom * 0.6
          ? "text-brand-700"
          : "text-red-500";
  const barTone =
    rate === null
      ? "bg-ink-200"
      : rate >= goodFrom
        ? "bg-emerald-500"
        : rate >= goodFrom * 0.6
          ? "bg-brand-500"
          : "bg-red-400";
  return (
    <div className="flex-1 min-w-32 rounded-xl bg-brand-50/70 border border-brand-100 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold text-ink-500">{label}</span>
        <span className={`font-display text-lg font-bold ${tone}`}>
          {rate === null ? "—" : `${rate}%`}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-white overflow-hidden">
        <div
          className={`h-full rounded-full ${barTone}`}
          style={{ width: `${Math.min(100, Math.max(0, rate ?? 0))}%` }}
        />
      </div>
    </div>
  );
}

/** スタイリスト日報の表示（稼働率・次回予約率＋数字＋テキスト） */
function StylistView({ answers, tiers }: { answers: Record<string, unknown>; tiers: number }) {
  const numAnswer = (key: string): number | null =>
    typeof answers[key] === "number" && Number.isFinite(answers[key]) ? (answers[key] as number) : null;
  const util = utilizationOf(answers, tiers);
  const clients = numAnswer("client_count");
  const nextBookings = numAnswer("next_bookings");
  const service = numAnswer("service_minutes");
  const rebookRate = rebookRateOf(answers);
  const capacityHours = capacityMinutes(tiers) / 60;

  return (
    <div className="space-y-2.5">
      {/* 稼働率・次回予約率をひと目で */}
      <div className="flex flex-wrap gap-2">
        <RateBadge label={`稼働率（÷${tiers}段×8h＝${capacityHours}h）`} rate={util} goodFrom={70} />
        <RateBadge label="次回予約率" rate={rebookRate} goodFrom={50} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {clients !== null && (
          <span><span className="text-xs text-ink-500">客数</span> <span className="font-bold">{clients}人</span></span>
        )}
        {nextBookings !== null && (
          <span><span className="text-xs text-ink-500">次回予約</span> <span className="font-bold">{nextBookings}件</span></span>
        )}
        {service !== null && service > 0 && (
          <span><span className="text-xs text-ink-500">入客時間</span> <span className="font-bold">{formatMinutesJa(service)}</span></span>
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
