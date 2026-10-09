// シフトの表示部品（読み取り専用。サーバーコンポーネントのまま使える）。
//  ・MyShiftList …… 自分の1ヶ月（スマホで縦に読む一覧）
//  ・ShiftPersonTable …… みんなのシフト（日付×人。自分の列を左端に）
//  ・ShiftStoreTable …… 店舗ごと（日付×店舗。誰がどの店舗か）
// 管理者のシフト表（タップで直せる表）は app/admin/schedule/shift-board.tsx。

import { todayJst, weekdayJa, weekdayOf } from "@/lib/date";
import {
  cellShortLabel,
  cellTimeLabel,
  offKindLabel,
  shortNames,
  shortStoreName,
  type MonthSchedule,
} from "@/lib/shift/month";
import { storeColor, weekdayTextClass } from "@/lib/shift/labels";
import type { Staff, Store } from "@/lib/data/types";

/** 店舗の小さな色ラベル */
export function StoreTag({ store, index }: { store: Store | undefined; index: number }) {
  if (!store) return null;
  return (
    <span className={`inline-flex items-center rounded border px-1 text-[10px] font-bold leading-4 ${storeColor(index).chip}`}>
      {shortStoreName(store.name)}
    </span>
  );
}

/** 自分の1ヶ月（休みの日も含めて日付順に並べる） */
export function MyShiftList({
  schedule,
  staffId,
  stores,
  showStore,
  homeStoreId,
}: {
  schedule: MonthSchedule;
  staffId: string;
  stores: Store[];
  /** 店舗名を出すか（店舗が2つ以上のとき） */
  showStore: boolean;
  /** 所属店舗（いつもと違う店舗に出る月だけ店舗名を出すため） */
  homeStoreId: string;
}) {
  const today = todayJst();
  const storeIndex = new Map(stores.map((s, i) => [s.id, i]));
  // 店舗名は、2つ以上の店舗で出勤する月・所属店舗以外に出る月だけ出す（いつも同じ店舗なら毎日出しても邪魔なので）
  const myStores = new Set(schedule.dates.map((d) => schedule.cell(staffId, d)).filter((c) => c.working).map((c) => c.storeId));
  const storeVaries = showStore && (myStores.size > 1 || [...myStores].some((id) => id !== homeStoreId));
  return (
    <ul className="divide-y divide-brand-100 rounded-xl border border-brand-100 overflow-hidden">
      {schedule.dates.map((date) => {
        const cell = schedule.cell(staffId, date);
        const wd = weekdayOf(date);
        const isToday = date === today;
        const past = date < today;
        const off = offKindLabel(cell);
        return (
          <li
            key={date}
            id={isToday ? "today" : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 text-sm ${
              isToday ? "bg-brand-100/70" : cell.working ? "bg-white" : "bg-ink-50/60"
            } ${past && !isToday ? "opacity-60" : ""}`}
          >
            <span className={`w-[4.25rem] shrink-0 font-bold tabular-nums whitespace-nowrap ${weekdayTextClass(wd)}`}>
              {Number(date.slice(8))}日({weekdayJa(wd)})
            </span>
            {cell.working ? (
              <span className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-bold text-ink-900 tabular-nums">{cellTimeLabel(cell)}</span>
                {storeVaries && (
                  <StoreTag store={stores.find((s) => s.id === cell.storeId)} index={storeIndex.get(cell.storeId) ?? 0} />
                )}
                {cell.dayoff && <span className="text-[11px] font-bold text-rose-600">希望休でしたが出勤</span>}
              </span>
            ) : (
              <span className="flex-1 min-w-0 text-ink-400 font-bold">
                休み
                {off && (
                  <span className="ml-2 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[11px] text-rose-600">
                    {off}
                  </span>
                )}
              </span>
            )}
            {isToday && <span className="shrink-0 text-[11px] font-bold text-brand-700">今日</span>}
            {cell.note && <span className="shrink-0 max-w-[30%] truncate text-[11px] text-ink-500">{cell.note}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** みんなのシフト（日付×人） */
export function ShiftPersonTable({
  schedule,
  staff,
  stores,
  viewerId,
  showStore,
}: {
  schedule: MonthSchedule;
  staff: Pick<Staff, "id" | "name">[];
  stores: Store[];
  viewerId: string;
  showStore: boolean;
}) {
  const today = todayJst();
  const storeIndex = new Map(stores.map((s, i) => [s.id, i]));
  const names = shortNames(staff);
  return (
    <div className="table-wrap">
      <table className="table-base">
        <thead>
          <tr>
            <th>日付</th>
            {staff.map((s) => (
              <th key={s.id} className={`text-center ${s.id === viewerId ? "!text-brand-800" : ""}`} title={s.name}>
                {names.get(s.id)}
                {s.id === viewerId && <span className="block text-[10px] font-bold text-brand-600">自分</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {schedule.dates.map((date) => {
            const wd = weekdayOf(date);
            return (
              <tr key={date} className={date === today ? "!bg-brand-100/70" : wd === 0 || wd === 6 ? "!bg-ink-50/70" : ""}>
                <td className={`font-bold tabular-nums ${weekdayTextClass(wd)}`}>
                  {Number(date.slice(8))}({weekdayJa(wd)})
                </td>
                {staff.map((s) => {
                  const cell = schedule.cell(s.id, date);
                  const mine = s.id === viewerId;
                  const off = offKindLabel(cell);
                  return (
                    <td key={s.id} className={`text-center !px-1.5 text-xs ${mine ? "bg-brand-50/70" : ""}`}>
                      {cell.working ? (
                        <span className={`block font-bold tabular-nums ${mine ? "text-brand-800" : "text-ink-800"}`}>
                          {cellShortLabel(cell)}
                          {showStore && (
                            <span
                              className={`ml-0.5 inline-block w-1.5 h-1.5 rounded-full align-middle ${storeColor(storeIndex.get(cell.storeId) ?? 0).dot}`}
                              title={stores.find((st) => st.id === cell.storeId)?.name}
                            />
                          )}
                        </span>
                      ) : (
                        <span className="block text-ink-300 font-bold">
                          休{off && <span className="ml-0.5 text-[10px] text-rose-500">{off === "有休" ? "有" : "希"}</span>}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 店舗ごと（日付×店舗。その日その店舗に出る人） */
export function ShiftStoreTable({
  schedule,
  staff,
  stores,
  viewerId,
}: {
  schedule: MonthSchedule;
  staff: Pick<Staff, "id" | "name">[];
  stores: Store[];
  viewerId: string;
}) {
  const today = todayJst();
  const names = shortNames(staff);
  return (
    <div className="table-wrap">
      <table className="table-base">
        <thead>
          <tr>
            <th>日付</th>
            {stores.map((s, i) => (
              <th key={s.id} className="min-w-28">
                <span className={`inline-block w-2 h-2 rounded-full mr-1 ${storeColor(i).dot}`} />
                {shortStoreName(s.name)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {schedule.dates.map((date) => {
            const wd = weekdayOf(date);
            return (
              <tr key={date} className={date === today ? "!bg-brand-100/70" : wd === 0 || wd === 6 ? "!bg-ink-50/70" : ""}>
                <td className={`font-bold tabular-nums align-top ${weekdayTextClass(wd)}`}>
                  {Number(date.slice(8))}({weekdayJa(wd)})
                </td>
                {stores.map((store) => {
                  const here = staff
                    .map((s) => ({ s, cell: schedule.cell(s.id, date) }))
                    .filter(({ cell }) => cell.working && cell.storeId === store.id);
                  return (
                    <td key={store.id} className="align-top !py-2">
                      {here.length === 0 ? (
                        <span className="text-ink-300">−</span>
                      ) : (
                        <span className="flex flex-col gap-0.5">
                          {here.map(({ s, cell }) => (
                            <span
                              key={s.id}
                              className={`text-xs ${s.id === viewerId ? "font-bold text-brand-800" : "text-ink-700"}`}
                            >
                              {names.get(s.id)}
                              <span className="ml-1 text-[10px] text-ink-400 tabular-nums">{cellShortLabel(cell)}</span>
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
