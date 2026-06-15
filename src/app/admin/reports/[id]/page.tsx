import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa } from "@/lib/date";
import { formatYen } from "@/lib/kpi";
import { PageHeader } from "@/components/ui";
import { deleteDailyReportAction, updateDailyReportAction } from "../actions";

// 管理者による日報の修正・削除画面
export default async function AdminReportEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { month } = await searchParams;
  const db = getDataStore();

  const report = await db.getDailyReportById(id);
  if (!report) notFound();
  const staff = await db.getStaff(report.staffId);
  const backMonth = month || report.reportDate.slice(0, 7);

  const numberField = (
    name: string,
    label: string,
    value: number,
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
          defaultValue={value}
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
      <PageHeader title="日報の修正" backHref={`/admin/reports?month=${backMonth}`} backLabel="成績・日報へ戻る" />

      <div className="card mb-4">
        <p className="font-bold text-lg">{staff?.name ?? "（不明なスタッフ）"}</p>
        <p className="text-sm text-stone-500 mt-0.5">{formatDateJa(report.reportDate, true)} の日報</p>
        <p className="text-xs text-stone-400 mt-1">
          ※ スタッフ・日付は変更できません。数値とメモのみ修正できます。
        </p>
      </div>

      <form action={updateDailyReportAction} className="space-y-4">
        <input type="hidden" name="id" value={report.id} />
        <input type="hidden" name="month" value={backMonth} />

        <div className="card">
          <p className="font-bold text-sm text-stone-500 mb-3">お客様の人数</p>
          <div className="grid grid-cols-2 gap-3">
            {numberField("new_clients", "新規", report.newClients, "人")}
            {numberField("repeat_clients", "既存", report.repeatClients, "人")}
            {numberField("next_bookings", "次回予約が取れた数", report.nextBookings, "件", true)}
          </div>
        </div>

        <div className="card">
          <p className="font-bold text-sm text-stone-500 mb-3">売上</p>
          <div className="grid grid-cols-1 gap-3">
            {numberField("service_sales", "技術売上", report.serviceSales, "円")}
            {numberField("option_sales", "オプション売上", report.optionSales, "円")}
            {numberField("retail_sales", "物販売上", report.retailSales, "円")}
          </div>
          <p className="text-xs text-stone-500 mt-3">
            現在の合計：
            {formatYen(report.serviceSales + report.optionSales + report.retailSales)}
          </p>
        </div>

        <div className="card">
          <label className="label" htmlFor="memo">
            メモ
          </label>
          <textarea
            id="memo"
            name="memo"
            rows={2}
            defaultValue={report.memo}
            className="input min-h-20"
          />
        </div>

        <button type="submit" className="btn-primary w-full text-lg">
          この内容で修正を保存
        </button>
      </form>

      {/* 削除（確認チェックつき） */}
      <form action={deleteDailyReportAction} className="card mt-5 space-y-2 border-red-100">
        <input type="hidden" name="id" value={report.id} />
        <input type="hidden" name="month" value={backMonth} />
        <p className="font-bold text-sm text-stone-500">この日報を削除</p>
        <label className="flex items-center gap-2 text-xs font-bold text-red-600">
          <input type="checkbox" name="confirm" className="h-4 w-4 accent-red-500" required />
          削除すると元に戻せません（成績の集計からも除外されます）
        </label>
        <button type="submit" className="btn-danger w-full">日報を削除する</button>
      </form>
    </div>
  );
}
