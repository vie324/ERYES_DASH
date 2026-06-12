import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addDays, formatDateJa, todayJst } from "@/lib/date";
import { formatYen } from "@/lib/kpi";
import { PageHeader, StatusBadge } from "@/components/ui";
import { saveCashReportAction } from "./actions";

// レジ締め・現金管理：店舗ごとに1日1件（再保存は上書き）。
// スタッフ個人の日報とは別レコードで、閉店時にレジを締めた人が入力する想定。
export default async function CashReportPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; store?: string; saved?: string; error?: string }>;
}) {
  await requireSession();
  const params = await searchParams;
  const db = getDataStore();
  const today = todayJst();

  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : today;
  const stores = await db.listStores();
  const storeId = stores.some((s) => s.id === params.store) ? params.store! : stores[0].id;

  const [existing, dayReports] = await Promise.all([
    db.getCashReport(storeId, date),
    db.listCashReports({ from: date, to: date }),
  ]);
  const enteredStoreIds = new Set(dayReports.map((r) => r.storeId));

  // 検算：レジ現金残高 ＝ おつり準備金 ＋ 金庫へ移動額 になっているか（ズレは表示のみ）
  const diff = existing
    ? existing.registerBalance - (existing.changeFund + existing.movedToSafe)
    : 0;

  const yenInput = (name: string, label: string, value: number | undefined, note?: string) => (
    <div>
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
          円
        </span>
      </div>
      {note && <p className="text-xs text-stone-400 mt-1">{note}</p>}
    </div>
  );

  return (
    <div>
      <PageHeader title="レジ締め・現金管理" backHref="/staff" />

      {params.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          保存しました（{formatDateJa(date)}・{stores.find((s) => s.id === storeId)?.name}）
        </p>
      )}
      {params.error === "future" && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          未来の日付には入力できません
        </p>
      )}

      {/* 日付の切り替え（前日・今日） */}
      <div className="flex items-center justify-between card !py-2 mb-3">
        <Link
          href={`/staff/cash?date=${addDays(date, -1)}&store=${storeId}`}
          className="px-4 py-2 font-bold text-brand-500 text-lg"
          aria-label="前日"
        >
          ←
        </Link>
        <span className="font-display font-bold">{formatDateJa(date, true)}</span>
        {date < today ? (
          <Link
            href={`/staff/cash?date=${addDays(date, 1)}&store=${storeId}`}
            className="px-4 py-2 font-bold text-brand-500 text-lg"
            aria-label="翌日"
          >
            →
          </Link>
        ) : (
          <span className="px-4 py-2 text-stone-300 text-lg">→</span>
        )}
      </div>

      {/* 店舗の切り替え（入力済みの店舗にはチェック表示） */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {stores.map((s) => (
          <Link
            key={s.id}
            href={`/staff/cash?date=${date}&store=${s.id}`}
            className={`text-sm font-bold rounded-full px-4 py-2.5 border ${
              s.id === storeId
                ? "bg-brand-600 text-white border-brand-600"
                : "border-brand-300 text-stone-600 bg-white"
            }`}
          >
            {enteredStoreIds.has(s.id) ? "✓ " : ""}
            {s.name.replace(/^EREYS\s*/, "")}
          </Link>
        ))}
      </div>

      {existing && (
        <p className="text-xs text-amber-600 font-bold mb-3">
          この日のこの店舗は入力済みです。保存すると上書きされます。
          {diff !== 0 && (
            <span className="block text-red-600 mt-0.5">
              ※ 検算：レジ現金残高と「おつり準備金＋金庫へ移動額」が {formatYen(Math.abs(diff))}{" "}
              合いません（過不足の確認をおすすめします）
            </span>
          )}
        </p>
      )}

      <form action={saveCashReportAction} className="space-y-4">
        <input type="hidden" name="store_id" value={storeId} />
        <input type="hidden" name="report_date" value={date} />

        <div className="card space-y-3">
          <p className="font-bold text-sm text-stone-500">本日の現金</p>
          {yenInput("cash_sales", "本日の現金売上高", existing?.cashSales)}
          {yenInput(
            "register_balance",
            "レジ現金残高（締め時点で数えた額）",
            existing?.registerBalance
          )}
        </div>

        <div className="card space-y-3">
          <p className="font-bold text-sm text-stone-500">レジから金庫へ</p>
          {yenInput("moved_to_safe", "金庫へ移動額", existing?.movedToSafe)}
          {yenInput(
            "change_fund",
            "レジおつり金の残高（おつり準備金）",
            existing?.changeFund,
            "金庫へ移した後にレジへ残す、翌日のおつり用の金額です"
          )}
        </div>

        <div className="card space-y-3">
          <p className="font-bold text-sm text-stone-500">金庫・銀行</p>
          {yenInput("safe_balance", "金庫現金残高", existing?.safeBalance)}
          {yenInput("bank_deposit", "銀行への預入額（ない日は空欄）", existing?.bankDeposit)}
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
            placeholder="例）千円札が不足気味。両替が必要"
            className="input min-h-20"
          />
        </div>

        <button type="submit" className="btn-primary w-full text-lg">
          {existing ? "上書き保存する" : "レジ締めを保存する"}
        </button>
      </form>

      <div className="mt-4 text-center">
        <StatusBadge
          label={`この日の入力状況：${enteredStoreIds.size} / ${stores.length}店舗`}
          tone={enteredStoreIds.size === stores.length ? "ok" : "muted"}
        />
      </div>
    </div>
  );
}
