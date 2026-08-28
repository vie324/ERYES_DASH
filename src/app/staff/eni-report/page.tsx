import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addDays, formatDateJa, todayJst } from "@/lib/date";
import { STYLIST_REPORT_NUMBERS, STYLIST_REPORT_TEXTS } from "@/lib/eni/forms";
import { EniFormFields } from "@/components/eni-form-fields";
import { PageHeader } from "@/components/ui";
import { StylistTimeSummary } from "./stylist-time";
import { saveStylistReportAction } from "./actions";

// スタイリスト日報（ENi）：客数・入客時間から稼働率と次回予約率を自動計算し、
// 数字とふりかえりを記録する。同じ日に保存し直すと上書き。
export default async function StylistReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const today = todayJst();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : today;

  const db = getDataStore();
  const [existing, recent, me] = await Promise.all([
    db.getEniReport("stylist", session.staffId, date),
    db.listEniReports("stylist", { staffId: session.staffId, from: addDays(today, -14), to: today }),
    db.getStaff(session.staffId),
  ]);

  const answers = existing?.answers ?? {};
  const numAnswer = (key: string): number =>
    typeof answers[key] === "number" && Number.isFinite(answers[key]) ? (answers[key] as number) : 0;

  return (
    <div className="page-narrow">
      <PageHeader
        title="日報を入力（スタイリスト）"
        backHref="/staff"
        actions={
          <Link href="/staff/eni-reports?tab=stylist" className="chip !py-2.5 !px-4">
            みんなの日報・週報を見る
          </Link>
        }
      />

      {params.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          保存しました（{formatDateJa(date)} の日報）
        </p>
      )}
      {params.error === "date" && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          未来の日付には入力できません
        </p>
      )}
      {params.error === "input" && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          入力内容を確認してください（数字は0以上の整数）
        </p>
      )}
      {params.error === "util" && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          稼働率の計算に必要な「入客時間の合計」を入力してください（必須）
        </p>
      )}

      {existing?.comment && (
        <div className="rounded-2xl bg-brand-50 border border-brand-200 p-4 mb-4">
          <p className="text-xs font-bold text-brand-700 mb-1">上司からのコメント</p>
          <p className="text-sm whitespace-pre-wrap text-ink-800">{existing.comment}</p>
        </div>
      )}

      <form action={saveStylistReportAction} className="space-y-4">
        <div className="card">
          <label className="label" htmlFor="report_date">
            日付
          </label>
          <input id="report_date" name="report_date" type="date" defaultValue={date} max={today} className="input" />
          {existing && (
            <p className="text-xs text-amber-600 font-bold mt-2">
              この日は入力済みです。保存すると上書きされます。
            </p>
          )}
        </div>

        <StylistTimeSummary
          initialClientCount={numAnswer("client_count")}
          initialServiceMinutes={numAnswer("service_minutes")}
          initialNextBookings={numAnswer("next_bookings")}
          tiers={me?.tiers ?? 1}
        />

        <EniFormFields items={STYLIST_REPORT_NUMBERS} answers={answers} />
        <EniFormFields items={STYLIST_REPORT_TEXTS} answers={answers} />

        <div className="form-actions">
          <button type="submit" className="btn-primary w-full text-lg">
            {existing ? "上書き保存する" : "日報を保存する"}
          </button>
        </div>
      </form>

      {recent.length > 0 && (
        <section className="card mt-5">
          <h2 className="section-title">直近の入力（2週間）</h2>
          <div className="flex flex-wrap gap-1.5">
            {recent.map((r) => (
              <a
                key={r.id}
                href={`/staff/eni-report?date=${r.periodKey}`}
                className={`chip ${
                  r.periodKey === date
                    ? "chip-active"
                    : ""
                }`}
              >
                {formatDateJa(r.periodKey)}
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
