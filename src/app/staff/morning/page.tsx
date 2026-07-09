/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa, thisMonthJst, todayJst, weekdayOf } from "@/lib/date";
import { formatWorkTime, resolveScheduleDay } from "@/lib/schedule";
import { PageHeader } from "@/components/ui";
import { PhotoInput } from "@/components/photo-input";
import type { DailyPlan } from "@/lib/data/types";
import { markPlanSeenAction, saveDailyPlanAction } from "./actions";

// 今日のスケジュール（朝礼ボード）：目標／ホウレンソウ／やること／タイムテーブルを入力するか、
// スケジュール帳の写真を貼る。ペアの先輩は「見ました」マークをつけられる。
export default async function MorningBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; seen?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const today = todayJst();
  const wd = weekdayOf(today);

  const db = getDataStore();
  const [staffList, plans, patterns, dayoffs, overrides, myIdeals, pairs] = await Promise.all([
    db.listStaff(),
    db.listDailyPlans(today),
    db.listWorkPatterns(),
    db.listDayoffRequests({ from: today, to: today }),
    db.listScheduleOverrides({ from: today, to: today }),
    db.listIdealSchedules(session.staffId),
    db.listPracticePairs(thisMonthJst()),
  ]);
  const members = staffList.filter((s) => s.isActive && s.jobType !== "");
  const staffMap = new Map(staffList.map((s) => [s.id, s.name]));
  const myPlan = plans.find((p) => p.staffId === session.staffId);
  const idealWeek = myIdeals.find((s) => s.scope === "week")?.content ?? "";
  const isExec = session.role === "admin" || (staffList.find((s) => s.id === session.staffId)?.isExecutive ?? false);
  // 自分がペアの先輩になっている相手（memberStaffId の一覧）
  const myMentees = new Set(pairs.filter((p) => p.partnerStaffId === session.staffId).map((p) => p.memberStaffId));

  const f = myPlan?.fields;

  return (
    <div>
      <PageHeader title="今日のスケジュール" backHref="/staff" />
      <p className="text-sm text-stone-500 font-bold -mt-2 mb-4">{formatDateJa(today, true)}</p>

      {params.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          今日の予定を保存しました
        </p>
      )}
      {params.seen && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          「見ました」を記録しました
        </p>
      )}

      {/* 自分の予定の入力（フォーム or 写真） */}
      <form action={saveDailyPlanAction} className="card space-y-4 mb-4">
        <p className="font-bold text-sm text-stone-500">自分の今日の予定（フォーム入力・写真どちらでもOK）</p>
        <div>
          <label className="label" htmlFor="goal">今日の目標</label>
          <textarea id="goal" name="goal" rows={2} defaultValue={f?.goal ?? ""} className="input min-h-16" placeholder="例）ワインディングを時間内に巻き切る" />
        </div>
        <div>
          <label className="label" htmlFor="horenso">ホウレンソウすること（報告・連絡・相談）</label>
          <textarea id="horenso" name="horenso" rows={2} defaultValue={f?.horenso ?? ""} className="input min-h-16" placeholder="例）モデルさんの来店時間を先輩に共有" />
        </div>
        <div>
          <label className="label" htmlFor="todo">やること</label>
          <textarea id="todo" name="todo" rows={2} defaultValue={f?.todo ?? ""} className="input min-h-16" placeholder="例）入客アシスト、閉店後に練習1h" />
        </div>
        <div>
          <label className="label" htmlFor="timetable">タイムテーブル（5:00〜24:00）</label>
          <textarea
            id="timetable"
            name="timetable"
            rows={6}
            defaultValue={f?.timetable ?? ""}
            className="input min-h-32"
            placeholder={"例）\n10:00 開店準備\n11:00 入客アシスト\n14:00 モデル施術\n19:00 練習\n20:30 退勤"}
          />
        </div>
        <div>
          <p className="label !mb-2">スケジュール帳の写真（貼る場合）</p>
          <PhotoInput name="photo" initial={myPlan?.photo ?? ""} label="スケジュール帳を撮影・選択" />
        </div>
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
          const canMarkSeen = m.id !== session.staffId && plan && (myMentees.has(m.id) || isExec);
          return (
            <div key={m.id} className="card">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold">
                  {m.name}
                  <span className="text-[10px] font-normal text-stone-400 ml-1.5">
                    {m.jobType === "stylist" ? "スタイリスト" : "アシスタント"}
                  </span>
                </p>
                <span className={`text-xs font-bold ${work.working ? "text-brand-700" : "text-stone-400"}`}>
                  {formatWorkTime(work)}
                </span>
              </div>

              {plan ? <PlanView plan={plan} /> : (
                <p className="text-xs text-stone-400 mt-2">（まだ入力されていません）</p>
              )}

              {/* 見ました マーク */}
              {plan && (
                <div className="mt-2 flex items-center gap-2">
                  {plan.seenBy ? (
                    <span className="text-[11px] font-bold text-emerald-600">
                      ✓ {staffMap.get(plan.seenBy) ?? ""}さんが確認済み
                    </span>
                  ) : (
                    <span className="text-[11px] text-stone-400">未確認</span>
                  )}
                  {canMarkSeen && !plan.seenBy && (
                    <form action={markPlanSeenAction}>
                      <input type="hidden" name="staff_id" value={m.id} />
                      <input type="hidden" name="plan_date" value={today} />
                      <button type="submit" className="text-[11px] font-bold text-brand-700 border border-brand-300 rounded-full px-2.5 py-1">
                        見ました
                      </button>
                    </form>
                  )}
                </div>
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

function PlanView({ plan }: { plan: DailyPlan }) {
  const f = plan.fields;
  const hasFields = f.goal || f.horenso || f.todo || f.timetable;
  return (
    <div className="mt-2 space-y-1.5 text-sm">
      {f.goal && <p><span className="text-xs font-bold text-brand-700">目標：</span>{f.goal}</p>}
      {f.horenso && <p><span className="text-xs font-bold text-brand-700">ホウレンソウ：</span>{f.horenso}</p>}
      {f.todo && <p><span className="text-xs font-bold text-brand-700">やること：</span>{f.todo}</p>}
      {f.timetable && (
        <div>
          <p className="text-xs font-bold text-brand-700">タイムテーブル</p>
          <p className="whitespace-pre-wrap text-ink-700">{f.timetable}</p>
        </div>
      )}
      {plan.photo && (
        <img src={plan.photo} alt="スケジュール帳" className="w-full max-h-72 object-contain rounded-lg border border-stone-200 bg-white" />
      )}
      {!hasFields && !plan.photo && <p className="text-xs text-stone-400">（内容なし）</p>}
    </div>
  );
}
