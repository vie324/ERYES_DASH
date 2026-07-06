import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa, todayJst, weekdayOf } from "@/lib/date";
import { formatWorkTime, resolveScheduleDay } from "@/lib/schedule";
import { PageHeader } from "@/components/ui";
import { saveDailyPlanAction } from "./actions";

// 今日のスケジュール（朝礼ボード）：各自が今日の予定を入力し、全員分を一覧で確認する。
// 出勤スケジュール（勤務時間）も並べて表示する。
export default async function MorningBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const today = todayJst();
  const wd = weekdayOf(today);

  const db = getDataStore();
  const [staffList, plans, patterns, dayoffs, overrides, myIdeals] = await Promise.all([
    db.listStaff(),
    db.listDailyPlans(today),
    db.listWorkPatterns(),
    db.listDayoffRequests({ from: today, to: today }),
    db.listScheduleOverrides({ from: today, to: today }),
    db.listIdealSchedules(session.staffId),
  ]);
  const members = staffList.filter((s) => s.isActive && s.jobType !== "");
  const myPlan = plans.find((p) => p.staffId === session.staffId);
  const idealWeek = myIdeals.find((s) => s.scope === "week")?.content ?? "";

  return (
    <div>
      <PageHeader title="今日のスケジュール" backHref="/staff" />
      <p className="text-sm text-stone-500 font-bold -mt-2 mb-4">{formatDateJa(today, true)}</p>

      {params.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          今日の予定を保存しました
        </p>
      )}

      {/* 自分の予定の入力 */}
      <form action={saveDailyPlanAction} className="card space-y-3 mb-4">
        <label className="label" htmlFor="content">
          自分の今日の予定（朝に入力）
        </label>
        <textarea
          id="content"
          name="content"
          rows={4}
          defaultValue={myPlan?.content ?? ""}
          placeholder={"例）\n午前：営業アシスト\n14:00 モデル施術\n19:00 ワインディング練習1h"}
          className="input min-h-28"
        />
        <button type="submit" className="btn-primary w-full">
          {myPlan ? "上書き保存する" : "今日の予定を保存する"}
        </button>
      </form>

      {idealWeek && (
        <details className="card mb-4">
          <summary className="text-sm font-bold text-stone-500 cursor-pointer">
            自分の理想のスケジュール（週）を見る
          </summary>
          <p className="whitespace-pre-wrap text-sm mt-2 text-ink-700">{idealWeek}</p>
        </details>
      )}

      {/* みんなの今日 */}
      <section className="space-y-3">
        <h2 className="font-bold text-sm text-stone-500">みんなの今日</h2>
        {members.map((m) => {
          const plan = plans.find((p) => p.staffId === m.id);
          const work = resolveScheduleDay(m.id, today, wd, patterns, dayoffs, overrides);
          return (
            <div key={m.id} className="card">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold">
                  {m.name}
                  <span className="text-[10px] font-normal text-stone-400 ml-1.5">
                    {m.jobType === "stylist" ? "スタイリスト" : "アシスタント"}
                  </span>
                </p>
                <span
                  className={`text-xs font-bold ${work.working ? "text-brand-700" : "text-stone-400"}`}
                >
                  {formatWorkTime(work)}
                </span>
              </div>
              {plan?.content ? (
                <p className="whitespace-pre-wrap text-sm mt-2 text-ink-700">{plan.content}</p>
              ) : (
                <p className="text-xs text-stone-400 mt-2">（まだ入力されていません）</p>
              )}
            </div>
          );
        })}
      </section>

      <p className="mt-4 text-center">
        <Link href="/staff/ideal" className="text-sm font-bold text-brand-700 underline">
          理想のスケジュール（週・月）を編集する
        </Link>
      </p>
    </div>
  );
}
