import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa, todayJst } from "@/lib/date";
import { formatYen } from "@/lib/kpi";
import { PageHeader } from "@/components/ui";
import { saveDailyReportAction } from "./actions";

// 日報入力：1分で終わるよう項目は7つだけ。同じ日に保存し直すと上書きされる。
export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const today = todayJst();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : today;

  const existing = await getDataStore().getDailyReport(session.staffId, date);

  const numberField = (
    name: string,
    label: string,
    value: number | undefined,
    unit: string,
    big = false
  ) => (
    <div className={big ? "col-span-2" : ""}>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          defaultValue={value === undefined || value === 0 ? "" : value}
          placeholder="0"
          className="input pr-12 text-right text-lg font-bold"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-stone-400 font-bold">
          {unit}
        </span>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title="日報を入力" backHref="/staff" />

      {params.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          保存しました（{formatDateJa(date)} の日報）
        </p>
      )}
      {params.error === "future" && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          未来の日付には入力できません
        </p>
      )}

      <form action={saveDailyReportAction} className="space-y-4">
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

        <div className="card">
          <p className="font-bold text-sm text-stone-500 mb-3">お客様の人数</p>
          <div className="grid grid-cols-2 gap-3">
            {numberField("new_clients", "新規", existing?.newClients, "人")}
            {numberField("repeat_clients", "既存", existing?.repeatClients, "人")}
            {numberField("next_bookings", "次回予約が取れた数", existing?.nextBookings, "件", true)}
          </div>
        </div>

        <div className="card">
          <p className="font-bold text-sm text-stone-500 mb-3">売上</p>
          <div className="grid grid-cols-1 gap-3">
            {numberField("service_sales", "技術売上", existing?.serviceSales, "円")}
            {numberField("option_sales", "オプション売上", existing?.optionSales, "円")}
            {numberField("retail_sales", "物販売上", existing?.retailSales, "円")}
          </div>
          {existing && (
            <p className="text-xs text-stone-500 mt-3">
              前回保存時の合計：
              {formatYen(existing.serviceSales + existing.optionSales + existing.retailSales)}
            </p>
          )}
        </div>

        <div className="card">
          <label className="label" htmlFor="memo">
            メモ（任意）
          </label>
          <textarea
            id="memo"
            name="memo"
            rows={2}
            defaultValue={existing?.memo ?? ""}
            placeholder="例）ご紹介のお客様あり"
            className="input min-h-20"
          />
        </div>

        <button type="submit" className="btn-primary w-full text-lg">
          {existing ? "上書き保存する" : "日報を保存する"}
        </button>
      </form>
    </div>
  );
}
