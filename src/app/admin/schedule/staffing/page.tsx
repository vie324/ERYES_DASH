import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { fx, shiftStaffingRules } from "@/lib/data/tables";
import { addMonths, formatDateJa, formatMonthJa, thisMonthJst, weekdayJa } from "@/lib/date";
import { isMonth } from "@/lib/action-utils";
import { MonthNav, PageHeader } from "@/components/ui";
import { Flash, Note, NotReadyNotice } from "@/components/feature-ui";
import { saveDateStaffingAction, saveWeekdayStaffingAction } from "../extras-actions";

export const dynamic = "force-dynamic";

// 依頼12：1日ごとの必要人数。曜日ごとの人数と、日付ごとの人数（イベントの日など）を決める。
// シフト表では、足りない日が赤く出る（「気になる所」にも出る）。
export default async function StaffingPage({ searchParams }: { searchParams: Promise<{ month?: string; store?: string; ok?: string; error?: string }> }) {
  const params = await searchParams;
  const db = getDataStore();
  const month = isMonth(params.month ?? "") ? params.month! : thisMonthJst();
  const [stores, rules] = await Promise.all([db.listStores(), db.getShiftRules()]);
  const store = stores.find((s) => s.id === params.store) ?? stores[0];
  const rows = store ? await fx().shiftStaffingRules.list({ where: { storeId: store.id } }) : [];
  const weekday = (wd: number) => rows.find((r) => !r.date && r.weekday === wd)?.required;
  const dated = rows.filter((r) => r.date && r.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="page-narrow">
      <PageHeader title="1日ごとの必要人数" backHref={`/admin/schedule?month=${month}`} backLabel="シフトへ戻る" icon="users" />
      <NotReadyNotice table={shiftStaffingRules} isAdmin />
      <Flash ok={params.ok} error={params.error} />
      <div className="flex gap-2 overflow-x-auto scroll-slim pb-1 mb-3">
        {stores.map((s) => (
          <Link key={s.id} href={`/admin/schedule/staffing?month=${month}&store=${s.id}`} className={`chip shrink-0 ${store?.id === s.id ? "chip-active" : ""}`}>
            {s.name}
          </Link>
        ))}
      </div>
      {store && (
        <>
          <form action={saveWeekdayStaffingAction} className="card space-y-3">
            <input type="hidden" name="store" value={store.id} />
            <input type="hidden" name="month" value={month} />
            <h2 className="section-title">曜日ごと（{store.name}）</h2>
            <div className="grid grid-cols-7 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                <label key={wd} className="text-center">
                  <span className={`block text-xs font-bold mb-1 ${wd === 0 ? "text-red-500" : wd === 6 ? "text-sky-600" : "text-ink-600"}`}>{weekdayJa(wd)}</span>
                  <input
                    name={`wd_${wd}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={50}
                    defaultValue={weekday(wd) ?? ""}
                    placeholder={String(rules.minStaffPerStoreDay)}
                    className="input !min-h-11 !px-1 !py-2 text-center"
                  />
                </label>
              ))}
            </div>
            <Note>空欄の曜日は、シフトのルールの「1店舗1日の最低人数」（{rules.minStaffPerStoreDay}人）になります。定休日は数えません。</Note>
            <button type="submit" className="btn-primary w-full">
              保存する
            </button>
          </form>

          <h2 className="section-title mt-6">日付ごと（曜日の決まりより優先）</h2>
          <MonthNav
            month={month}
            monthLabel={formatMonthJa(month)}
            prevHref={`/admin/schedule/staffing?month=${addMonths(month, -1)}&store=${store.id}`}
            nextHref={`/admin/schedule/staffing?month=${addMonths(month, 1)}&store=${store.id}`}
          />
          <form action={saveDateStaffingAction} className="card !p-3.5 flex gap-2 items-end">
            <input type="hidden" name="store" value={store.id} />
            <input type="hidden" name="month" value={month} />
            <label className="flex-1 text-xs font-bold text-ink-600">
              日付
              <input name="date" type="date" min={`${month}-01`} max={`${month}-31`} required className="input !min-h-11 !py-2 mt-1" />
            </label>
            <label className="w-24 text-xs font-bold text-ink-600">
              人数
              <input name="required" type="number" min={0} max={50} className="input !min-h-11 !py-2 mt-1" placeholder="空で外す" />
            </label>
            <button type="submit" className="btn-secondary !min-h-11 !px-4 !text-sm">
              保存
            </button>
          </form>
          <ul className="mt-3 space-y-1.5">
            {dated.length === 0 ? (
              <li className="text-sm text-ink-500">この月の日付ごとの指定はありません</li>
            ) : (
              dated.map((r) => (
                <li key={r.id} className="card-quiet !p-2.5 flex items-center justify-between text-sm">
                  <span className="font-bold">{formatDateJa(r.date)}</span>
                  <span>{r.required}人</span>
                  <form action={saveDateStaffingAction}>
                    <input type="hidden" name="store" value={store.id} />
                    <input type="hidden" name="month" value={month} />
                    <input type="hidden" name="date" value={r.date} />
                    <input type="hidden" name="required" value="" />
                    <button type="submit" className="text-xs text-red-500 underline">
                      外す
                    </button>
                  </form>
                </li>
              ))
            )}
          </ul>
        </>
      )}
    </div>
  );
}
