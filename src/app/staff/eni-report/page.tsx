import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addDays, formatDateJa, todayJst, weekdayOf } from "@/lib/date";
import { STYLIST_REPORT_NUMBERS, STYLIST_REPORT_TEXTS, type ClientEntry } from "@/lib/eni/forms";
import { resolveScheduleDay } from "@/lib/schedule";
import { EniFormFields } from "@/components/eni-form-fields";
import { PageHeader } from "@/components/ui";
import { StylistClients } from "./stylist-clients";
import { saveStylistReportAction } from "./actions";

function minutesFromTimes(start: string, end: string): number {
  const m = (t: string) => {
    const [h, mm] = t.split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(mm) ? h * 60 + mm : 0;
  };
  const diff = m(end) - m(start);
  return diff > 0 ? diff : 0;
}

// スタイリスト日報（ENi）：来店ごとの時間から稼働率・施術時間の±を自動計算し、
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
  const [existing, recent, patterns, dayoffs, overrides] = await Promise.all([
    db.getEniReport("stylist", session.staffId, date),
    db.listEniReports("stylist", { staffId: session.staffId, from: addDays(today, -14), to: today }),
    db.listWorkPatterns(session.staffId),
    db.listDayoffRequests({ staffId: session.staffId, from: date, to: date }),
    db.listScheduleOverrides({ staffId: session.staffId, from: date, to: date }),
  ]);

  const sched = resolveScheduleDay(session.staffId, date, weekdayOf(date), patterns, dayoffs, overrides);
  const defaultWorkMinutes = sched.working ? minutesFromTimes(sched.startTime, sched.endTime) : 0;

  const answers = existing?.answers ?? {};
  const initialClients = Array.isArray(answers.clients) ? (answers.clients as ClientEntry[]) : [];
  const initialWorkMinutes = typeof answers.work_minutes === "number" ? answers.work_minutes : 0;

  return (
    <div className="page-narrow">
      <PageHeader title="日報を入力（スタイリスト）" backHref="/staff" />

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

        <StylistClients
          initialClients={initialClients}
          initialWorkMinutes={initialWorkMinutes}
          defaultWorkMinutes={defaultWorkMinutes}
        />

        <EniFormFields items={STYLIST_REPORT_NUMBERS} answers={answers} />
        <EniFormFields items={STYLIST_REPORT_TEXTS} answers={answers} />

        <button type="submit" className="btn-primary w-full text-lg">
          {existing ? "上書き保存する" : "日報を保存する"}
        </button>
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
