import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addDays, formatWeekJa, todayJst, weekStartOf } from "@/lib/date";
import { WEEKLY_REPORT_ITEMS } from "@/lib/eni/forms";
import { formatPracticeMinutes } from "@/lib/eni/access";
import { EniFormFields } from "@/components/eni-form-fields";
import { PageHeader } from "@/components/ui";
import { saveWeeklyReportAction } from "./actions";

// アシスタント週報（ENi）：週1回、ふりかえりと来週の目標を入力する。
// その週の練習時間の合計が自動で表示される（練習記録から集計）。
export default async function WeeklyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const today = todayJst();
  const thisWeek = weekStartOf(today);
  const week =
    /^\d{4}-\d{2}-\d{2}$/.test(params.week ?? "") && weekStartOf(params.week!) === params.week
      ? params.week!
      : thisWeek;
  const weekEnd = addDays(week, 6);

  const db = getDataStore();
  const [existing, practice] = await Promise.all([
    db.getEniReport("weekly", session.staffId, week),
    db.listPracticeRecords({ staffId: session.staffId, from: week, to: weekEnd }),
  ]);
  const practiceTotal = practice.reduce((sum, r) => sum + r.minutes, 0);

  return (
    <div>
      <PageHeader title="週報を入力（アシスタント）" backHref="/staff" />

      {params.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          保存しました（{formatWeekJa(week)} の週報）
        </p>
      )}
      {params.error === "future" && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          未来の週には入力できません
        </p>
      )}
      {params.error === "input" && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          入力内容を確認してください
        </p>
      )}

      {/* 週の切り替え */}
      <div className="flex items-center justify-between card !py-2 mb-4">
        <Link
          href={`/staff/weekly-report?week=${addDays(week, -7)}`}
          className="px-4 py-2 font-bold text-brand-500 text-lg"
          aria-label="前の週"
        >
          ←
        </Link>
        <span className="font-display font-bold text-sm">
          {formatWeekJa(week)}
          {week === thisWeek && <span className="text-brand-600 ml-1">（今週）</span>}
        </span>
        {week < thisWeek ? (
          <Link
            href={`/staff/weekly-report?week=${addDays(week, 7)}`}
            className="px-4 py-2 font-bold text-brand-500 text-lg"
            aria-label="次の週"
          >
            →
          </Link>
        ) : (
          <span className="px-4 py-2 text-stone-300 text-lg">→</span>
        )}
      </div>

      <div className="card mb-4 flex items-center justify-between">
        <span className="text-sm font-bold text-stone-500">この週の練習時間（自動集計）</span>
        <span className="font-display text-xl font-bold text-brand-700">
          {practiceTotal > 0 ? formatPracticeMinutes(practiceTotal) : "0"}
          <span className="text-xs text-stone-400 ml-1">（{practice.length}回）</span>
        </span>
      </div>

      <form action={saveWeeklyReportAction} className="space-y-4">
        <input type="hidden" name="week_start" value={week} />
        {existing && (
          <p className="text-xs text-amber-600 font-bold">
            この週は入力済みです。保存すると上書きされます。
          </p>
        )}

        <EniFormFields items={WEEKLY_REPORT_ITEMS} answers={existing?.answers ?? {}} />

        <button type="submit" className="btn-primary w-full text-lg">
          {existing ? "上書き保存する" : "週報を保存する"}
        </button>
      </form>
    </div>
  );
}
