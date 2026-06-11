import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addMonths, formatDateJa, formatMonthJa, thisMonthJst } from "@/lib/date";
import { SHIFT_TYPE_CLASS, SHIFT_TYPE_LABEL } from "@/lib/shift/labels";
import { currentTargetMonth, deadlineLabel, isRequestEditable } from "@/lib/shift/period";
import { EmptyState, MonthNav, PageHeader, StatusBadge } from "@/components/ui";

// 自分のシフト：確定したシフトの確認と、希望提出への入口
export default async function StaffShiftPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : thisMonthJst();

  const db = getDataStore();
  const rules = await db.getShiftRules();
  const [assignments, stores] = await Promise.all([
    db.listShiftAssignments(month),
    db.listStores(),
  ]);
  const storeMap = new Map(stores.map((s) => [s.id, s]));

  const isConfirmed = assignments.some((a) => a.status === "confirmed");
  const own = assignments.filter((a) => a.staffId === session.staffId);

  // 希望提出への導線（募集中の月）
  const targetMonth = currentTargetMonth(rules);
  const editable = isRequestEditable(targetMonth, rules);
  const submitted = await db.getShiftRequestMonth(session.staffId, targetMonth);

  return (
    <div>
      <PageHeader title="シフト" backHref="/staff" />

      {editable && (
        <Link
          href={`/staff/shift/request?month=${targetMonth}`}
          className={`card flex items-center gap-3 mb-4 active:bg-rose-50 ${submitted ? "" : "border-rose-300 bg-rose-50"}`}
        >
          <span className="text-2xl">📝</span>
          <span className="flex-1">
            <span className="block font-bold">
              {formatMonthJa(targetMonth)}の希望を{submitted ? "修正する" : "提出する"}
            </span>
            <span className="block text-xs text-stone-500 mt-0.5">
              締切：{deadlineLabel(targetMonth, rules)}
              {submitted ? "（提出済み）" : "（未提出）"}
            </span>
          </span>
          {!submitted && <StatusBadge label="未提出" tone="pending" />}
          <span className="text-stone-300 text-xl">›</span>
        </Link>
      )}

      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={`/staff/shift?month=${addMonths(month, -1)}`}
        nextHref={`/staff/shift?month=${addMonths(month, 1)}`}
      />

      {!isConfirmed ? (
        <EmptyState
          message={
            assignments.length > 0
              ? "この月のシフトは調整中です。確定するとここに表示されます。"
              : "この月のシフトはまだ作成されていません。"
          }
        />
      ) : (
        <>
          <section className="card mb-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-sm text-stone-500">あなたのシフト</h2>
              <span className="text-sm font-bold text-rose-600">出勤 {own.length}日</span>
            </div>
            {own.length === 0 ? (
              <p className="text-sm text-stone-400">この月の出勤はありません</p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {own.map((a) => (
                  <li key={a.id} className="py-2.5 flex items-center gap-3 text-sm">
                    <span className="font-bold w-24">{formatDateJa(a.date)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${SHIFT_TYPE_CLASS[a.shiftType]}`}
                    >
                      {SHIFT_TYPE_LABEL[a.shiftType]}番
                    </span>
                    <span className="flex-1 truncate">
                      {storeMap.get(a.storeId)?.name ?? "（不明な店舗）"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Link href={`/staff/shift/all?month=${month}`} className="btn-secondary w-full">
            全体シフトを見る（誰がどの店舗か）
          </Link>
        </>
      )}
    </div>
  );
}
