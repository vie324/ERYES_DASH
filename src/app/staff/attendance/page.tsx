import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { formatMinutes } from "@/lib/attendance";
import { minutesLabel, monthAttendanceRecords, totalsOf } from "@/lib/attendance-shift";
import { formatDateJa, formatTimeJa, jstDayBoundsUtc, thisMonthJst, todayJst } from "@/lib/date";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { Flash, Note } from "@/components/feature-ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { FirstGuide } from "@/components/first-guide";
import { PunchPanel } from "./punch-panel";
import { requestCorrectionAction } from "./correction-actions";

export const dynamic = "force-dynamic";

const STATUS = { pending: ["承認待ち", "pending"], approved: ["承認", "ok"], rejected: ["見送り", "muted"] } as const;

// 出勤・退勤の打刻（依頼12：その日のシフトとひもづけて、遅刻・早退・シフト外に印をつける。打刻の修正は承認制）
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
  const db = getDataStore();
  const stores = await db.listStores();
  const attendanceAvailable = stores.some((s) => s.attendanceEnabled);
  const today = todayJst();
  const { start, end } = jstDayBoundsUtc(today);
  const month = thisMonthJst();
  const [todayPunches, records, corrections] = await Promise.all([
    db.listAttendances({ staffId: session.staffId, from: start, to: end }),
    monthAttendanceRecords(db, month, { staffIds: [session.staffId] }),
    fx().attendanceCorrections.list({ where: { staffId: session.staffId }, order: [["createdAt", "desc"]], limit: 20 }),
  ]);
  const days = records.get(session.staffId) ?? [];
  const todayRec = days.find((d) => d.date === today);
  const totals = totalsOf(days);
  const flagged = days.filter((d) => d.late || d.early || d.offShift || d.missing || d.openPunch).reverse();

  return (
    <div className="page-narrow">
      <PageHeader title="出勤・退勤" backHref="/staff" icon="mapPin" />
      <FirstGuide guideKey="attendance" />
      <Flash ok={params.ok} error={params.error} />

      <section className="card mb-4">
        <h2 className="section-title">今日のシフト</h2>
        {todayRec?.planned.working ? (
          <p className="text-lg font-bold text-ink-900">
            {todayRec.planned.start && todayRec.planned.end ? `${todayRec.planned.start} 〜 ${todayRec.planned.end}` : "出勤（時間の指定なし）"}
            <span className="text-sm font-bold text-ink-500 ml-2">{stores.find((s) => s.id === todayRec.planned.storeId)?.name ?? ""}</span>
          </p>
        ) : (
          <p className="text-sm text-ink-600">今日はお休みの予定です（打刻すると「シフト外」の印がつきます）</p>
        )}
        <Link href="/staff/schedule" className="text-xs font-bold text-brand-700 underline">
          シフトを見る
        </Link>
      </section>

      {!attendanceAvailable ? (
        <EmptyState message="打刻は現在オフに設定されています（管理者画面のマスタ設定で変更できます）" />
      ) : (
        <div className="space-y-5">
          <PunchPanel />
          <section className="card">
            <h2 className="section-title">今日の打刻</h2>
            {todayPunches.length === 0 ? (
              <p className="text-sm text-ink-400">まだ打刻はありません</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {todayPunches.map((p) => (
                  <li key={p.id} className="py-2 flex items-center gap-3 text-sm">
                    <span className="font-bold w-12">{p.punchType === "in" ? "出勤" : "退勤"}</span>
                    <span className="font-bold text-lg">{formatTimeJa(p.punchedAt)}</span>
                    <span className="text-ink-400 text-xs">店舗から{p.distanceM}m</span>
                    <span className="ml-auto">{p.isValid ? <StatusBadge label="成立" tone="ok" /> : <StatusBadge label="不成立" tone="danger" />}</span>
                  </li>
                ))}
              </ul>
            )}
            {todayRec && (todayRec.late || todayRec.early) && (
              <p className="mt-2 text-xs font-bold text-amber-700">
                {todayRec.late && `遅刻 ${todayRec.lateMinutes}分 `}
                {todayRec.early && `早退 ${todayRec.earlyMinutes}分`}
              </p>
            )}
          </section>
        </div>
      )}

      <section className="card mt-5">
        <h2 className="section-title">今月の勤務</h2>
        <p className="text-2xl font-bold">
          {formatMinutes(totals.netMinutes)}
          <span className="text-sm text-ink-500 font-bold ml-2">／ {totals.workDays}日出勤（休憩を引いた時間）</span>
        </p>
        <p className="text-xs text-ink-500 mt-1">
          遅刻 {totals.lateCount}回・早退 {totals.earlyCount}回・シフト外 {totals.offShiftCount}回・打刻なし {totals.missingCount}日
        </p>
        {flagged.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {flagged.map((d) => (
              <li key={d.date} className="card-quiet !p-2.5 text-sm flex flex-wrap items-center gap-2">
                <span className="font-bold w-24">{formatDateJa(d.date)}</span>
                <span className="text-xs text-ink-500">
                  予定 {d.planned.working ? `${d.planned.start || "—"}〜${d.planned.end || "—"}` : "休み"}／実際 {d.inAt ? formatTimeJa(d.inAt) : "—"}〜{d.outAt ? formatTimeJa(d.outAt) : "—"}
                </span>
                <span className="flex gap-1 ml-auto">
                  {d.late && <StatusBadge label={`遅刻${d.lateMinutes}分`} tone="warning" />}
                  {d.early && <StatusBadge label={`早退${d.earlyMinutes}分`} tone="warning" />}
                  {d.offShift && <StatusBadge label="シフト外" tone="pending" />}
                  {d.missing && <StatusBadge label="打刻なし" tone="danger" />}
                  {d.openPunch && <StatusBadge label="退勤なし" tone="danger" />}
                  {(d.inCorrected || d.outCorrected) && <StatusBadge label="修正済み" tone="muted" />}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-ink-400 mt-2">実働の目安：{minutesLabel(totals.netMinutes)}（休憩 {minutesLabel(totals.breakMinutes)} を引いています）</p>
      </section>

      <section id="correction" className="card mt-5 scroll-mt-20">
        <h2 className="section-title">打刻忘れ・打刻の修正を申請する</h2>
        <Note>店長が承認すると、その時刻で数えます。元の打刻は消さず、申請と承認の記録が残ります。</Note>
        <form action={requestCorrectionAction} className="grid grid-cols-2 gap-2 mt-3">
          <label className="text-xs font-bold text-ink-600">
            日付
            <input name="date" type="date" max={today} defaultValue={today} required className="input !min-h-11 !py-2 mt-1" />
          </label>
          <label className="text-xs font-bold text-ink-600">
            どちら
            <select name="type" className="input !min-h-11 !py-2 mt-1">
              <option value="in">出勤</option>
              <option value="out">退勤</option>
            </select>
          </label>
          <label className="text-xs font-bold text-ink-600">
            正しい時刻
            <input name="time" type="time" required className="input !min-h-11 !py-2 mt-1" />
          </label>
          <label className="text-xs font-bold text-ink-600">
            理由
            <input name="reason" required maxLength={200} className="input !min-h-11 !py-2 mt-1" placeholder="例）打刻を忘れた" />
          </label>
          <div className="col-span-2">
            <ConfirmSubmit className="btn-primary w-full">店長に申請する</ConfirmSubmit>
          </div>
        </form>
        {corrections.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {corrections.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm">
                <span className="font-bold">{formatDateJa(c.date)}</span>
                <span>
                  {c.punchType === "in" ? "出勤" : "退勤"} {c.time}
                </span>
                <span className="text-xs text-ink-500 truncate flex-1">{c.reason}</span>
                <StatusBadge label={STATUS[c.status][0]} tone={STATUS[c.status][1]} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
