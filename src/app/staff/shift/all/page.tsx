import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addMonths, datesOfMonth, formatMonthJa, thisMonthJst, weekdayJa, weekdayOf } from "@/lib/date";
import { SHIFT_TYPE_LABEL } from "@/lib/shift/labels";
import { EmptyState, MonthNav, PageHeader } from "@/components/ui";

// 全体シフト（確定後のみ全スタッフが閲覧できる）。誰がどの店舗に出勤するかの一覧表
export default async function StaffShiftAllPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : thisMonthJst();

  const db = getDataStore();
  const [assignments, stores, staffList] = await Promise.all([
    db.listShiftAssignments(month),
    db.listStores(),
    db.listStaff(),
  ]);
  const staffMap = new Map(staffList.map((s) => [s.id, s]));

  // 確定前のシフトはスタッフには見せない（下書きは管理者のみ）
  const isConfirmed = assignments.some((a) => a.status === "confirmed");

  const byDateStore = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const key = `${a.date}|${a.storeId}`;
    if (!byDateStore.has(key)) byDateStore.set(key, []);
    byDateStore.get(key)!.push(a);
  }

  return (
    <div>
      <PageHeader title="全体シフト" backHref={`/staff/shift?month=${month}`} backLabel="自分のシフトへ戻る" />
      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={`/staff/shift/all?month=${addMonths(month, -1)}`}
        nextHref={`/staff/shift/all?month=${addMonths(month, 1)}`}
      />

      {!isConfirmed ? (
        <EmptyState message="この月の全体シフトはまだ確定していません。確定後に表示されます。" />
      ) : (
        <div className="card !p-2 overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white">日付</th>
                {stores.map((s) => (
                  <th key={s.id}>{s.name.replace(/^EREYS\s*/, "")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datesOfMonth(month).map((date) => {
                const wd = weekdayOf(date);
                const dayClass = wd === 0 ? "text-red-400" : wd === 6 ? "text-sky-500" : "";
                return (
                  <tr key={date} className={wd === 0 || wd === 6 ? "bg-stone-50" : ""}>
                    <td className={`sticky left-0 bg-inherit font-bold whitespace-nowrap ${dayClass}`}>
                      {Number(date.slice(8))}({weekdayJa(wd)})
                    </td>
                    {stores.map((store) => {
                      const cell = byDateStore.get(`${date}|${store.id}`) ?? [];
                      return (
                        <td key={store.id} className="align-top">
                          {cell.length === 0 ? (
                            <span className="text-stone-300">−</span>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              {cell.map((a) => (
                                <span
                                  key={a.id}
                                  className={`text-xs whitespace-nowrap ${
                                    a.staffId === session.staffId
                                      ? "font-bold text-brand-700"
                                      : "text-stone-600"
                                  }`}
                                >
                                  {staffMap.get(a.staffId)?.name ?? "？"}
                                  <span className="text-stone-400">
                                    ({SHIFT_TYPE_LABEL[a.shiftType]})
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-stone-400 px-2 py-2">
            (早)=早番 (遅)=遅番 ／ 自分の名前は<span className="text-brand-700 font-bold">ゴールドの太字</span>で表示されます
          </p>
        </div>
      )}
    </div>
  );
}
