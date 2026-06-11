import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { aggregateAttendance, formatMinutes } from "@/lib/attendance";
import { formatTimeJa, jstDayBoundsUtc, monthRange, thisMonthJst, todayJst } from "@/lib/date";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { PunchPanel } from "./punch-panel";

// 出勤・退勤の打刻画面（勤怠は任意運用。打刻しなくても他の業務は進められる）
export default async function AttendancePage() {
  const session = await requireSession();
  const db = getDataStore();
  const stores = await db.listStores();
  const attendanceAvailable = stores.some((s) => s.attendanceEnabled);
  const today = todayJst();

  const { start, end } = jstDayBoundsUtc(today);
  const month = thisMonthJst();
  const { from, to } = monthRange(month);
  const [todayPunches, monthPunches] = await Promise.all([
    db.listAttendances({ staffId: session.staffId, from: start, to: end }),
    db.listAttendances({
      staffId: session.staffId,
      from: jstDayBoundsUtc(from).start,
      to: jstDayBoundsUtc(to).end,
    }),
  ]);
  const monthly = aggregateAttendance(monthPunches);

  return (
    <div>
      <PageHeader title="出勤・退勤の打刻" backHref="/staff" />

      {!attendanceAvailable ? (
        <EmptyState message="勤怠機能は現在オフに設定されています（管理者画面のマスタ設定で変更できます）" />
      ) : (
        <div className="space-y-5">
          <PunchPanel />

          <section className="card">
            <h2 className="font-bold text-sm text-stone-500 mb-2">本日の打刻</h2>
            {todayPunches.length === 0 ? (
              <p className="text-sm text-stone-400">まだ打刻はありません</p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {todayPunches.map((p) => (
                  <li key={p.id} className="py-2 flex items-center gap-3 text-sm">
                    <span className="font-bold w-12">{p.punchType === "in" ? "出勤" : "退勤"}</span>
                    <span className="font-bold text-lg">{formatTimeJa(p.punchedAt)}</span>
                    <span className="text-stone-400 text-xs">店舗から{p.distanceM}m</span>
                    <span className="ml-auto">
                      {p.isValid ? (
                        <StatusBadge label="成立" tone="ok" />
                      ) : (
                        <StatusBadge label="不成立" tone="danger" />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2 className="font-bold text-sm text-stone-500 mb-2">今月の勤務（参考）</h2>
            <p className="text-2xl font-bold">
              {formatMinutes(monthly.totalMinutes)}
              <span className="text-sm text-stone-500 font-bold ml-2">／ {monthly.workDays}日出勤</span>
            </p>
            <p className="text-xs text-stone-400 mt-1">
              ※ 勤怠の利用は任意です。打刻を忘れても業務には影響しません。
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
