import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addDays, formatDateJa, todayJst } from "@/lib/date";
import { STYLIST_REPORT_ITEMS } from "@/lib/eni/forms";
import { EniFormFields } from "@/components/eni-form-fields";
import { PageHeader } from "@/components/ui";
import { saveStylistReportAction } from "./actions";

// スタイリスト日報（ENi）：数字＋ふりかえりを毎日入力する。同じ日に保存し直すと上書き。
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
  const [existing, recent] = await Promise.all([
    db.getEniReport("stylist", session.staffId, date),
    db.listEniReports("stylist", {
      staffId: session.staffId,
      from: addDays(today, -14),
      to: today,
    }),
  ]);

  return (
    <div>
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

      <form action={saveStylistReportAction} className="space-y-4">
        <div className="card">
          <label className="label" htmlFor="report_date">
            日付
          </label>
          <input
            id="report_date"
            name="report_date"
            type="date"
            defaultValue={date}
            max={today}
            className="input"
          />
          {existing && (
            <p className="text-xs text-amber-600 font-bold mt-2">
              この日は入力済みです。保存すると上書きされます。
            </p>
          )}
        </div>

        <EniFormFields items={STYLIST_REPORT_ITEMS} answers={existing?.answers ?? {}} />

        <button type="submit" className="btn-primary w-full text-lg">
          {existing ? "上書き保存する" : "日報を保存する"}
        </button>
      </form>

      {recent.length > 0 && (
        <section className="card mt-5">
          <h2 className="font-bold text-sm text-stone-500 mb-2">直近の入力（2週間）</h2>
          <div className="flex flex-wrap gap-1.5">
            {recent.map((r) => (
              <a
                key={r.id}
                href={`/staff/eni-report?date=${r.periodKey}`}
                className={`text-xs font-bold rounded-full px-3 py-1.5 border ${
                  r.periodKey === date
                    ? "bg-brand-600 text-white border-brand-600"
                    : "border-stone-300 text-stone-600"
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
