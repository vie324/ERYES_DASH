/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa, thisMonthJst, todayJst, weekdayOf } from "@/lib/date";
import { formatWorkTime, resolveScheduleDay } from "@/lib/schedule";
import { PageHeader } from "@/components/ui";
import { PhotoInput } from "@/components/photo-input";
import { ScheduleBoard } from "@/components/schedule-board";
import { ScheduleList } from "@/components/schedule-board-view";
import { blocksFromLegacyRows } from "@/lib/eni/schedule-blocks";
import type { DailyPlan, ScheduleBlock } from "@/lib/data/types";
import {
  addSchedulePresetAction,
  deleteSchedulePresetAction,
  markPlanSeenAction,
  saveDailyPlanAction,
} from "./actions";

/** 保存済みの予定を予約表の帯に変換（旧形式の1時間グリッドも読めるようにする） */
function planBlocks(plan: DailyPlan | null | undefined): ScheduleBlock[] {
  if (!plan) return [];
  const blocks = plan.fields.timetableBlocks ?? [];
  return blocks.length > 0 ? blocks : blocksFromLegacyRows(plan.fields.timetableRows);
}

// 今日のスケジュール（朝礼ボード）：目標／ホウレンソウ／やること／予約表（タイムテーブル）を入力するか、
// スケジュール帳の写真を貼る。ペアの先輩は「見ました」マークをつけられる。
export default async function MorningBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; seen?: string; preset?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const today = todayJst();
  const wd = weekdayOf(today);

  const db = getDataStore();
  const [staffList, plans, patterns, dayoffs, overrides, myIdeals, pairs, presets] = await Promise.all([
    db.listStaff(),
    db.listDailyPlans(today),
    db.listWorkPatterns(),
    db.listDayoffRequests({ from: today, to: today }),
    db.listScheduleOverrides({ from: today, to: today }),
    db.listIdealSchedules(session.staffId),
    db.listPracticePairs(thisMonthJst()),
    db.listSchedulePresets(),
  ]);
  const members = staffList.filter((s) => s.isActive && s.jobType !== "");
  const staffMap = new Map(staffList.map((s) => [s.id, s.name]));
  const myPlan = plans.find((p) => p.staffId === session.staffId);
  const goalMonth = myIdeals.find((s) => s.scope === "month_goal")?.content ?? "";
  const isExec = session.role === "admin" || (staffList.find((s) => s.id === session.staffId)?.isExecutive ?? false);
  // 自分がペアの先輩になっている相手（memberStaffId の一覧）
  const myMentees = new Set(pairs.filter((p) => p.partnerStaffId === session.staffId).map((p) => p.memberStaffId));

  const f = myPlan?.fields;
  const presetLabels = presets.map((p) => p.label);
  const noticeMsg =
    params.saved
      ? "今日の予定を保存しました"
      : params.seen
        ? "「見ました」を記録しました"
        : params.preset === "added"
          ? "よくある項目に追加しました"
          : params.preset === "deleted"
            ? "よくある項目を削除しました"
            : "";

  return (
    <div>
      <PageHeader title="今日のスケジュール" backHref="/staff" />
      <p className="text-sm text-stone-500 font-bold -mt-2 mb-4">{formatDateJa(today, true)}</p>

      {noticeMsg && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">{noticeMsg}</p>
      )}

      {goalMonth && (
        <div className="rounded-2xl bg-brand-50 border border-brand-200 p-4 mb-4">
          <p className="text-xs font-bold text-brand-700 mb-1">今月の目標</p>
          <p className="text-sm whitespace-pre-wrap text-ink-800">{goalMonth}</p>
        </div>
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
          <p className="label !mb-2">タイムテーブル（予約表のように、時間の帯で入れる）</p>
          <ScheduleBoard
            name="timetable_blocks"
            initial={planBlocks(myPlan)}
            presets={presetLabels}
            dayLabels={["今日"]}
            startHour={8}
            endHour={22}
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

      {/* よくある項目（みんなで使う候補リスト） */}
      <details className="card mb-4">
        <summary className="cursor-pointer text-sm font-bold text-brand-700">
          よくある項目を登録する（{presetLabels.length}件）
        </summary>
        <div className="mt-3 pt-3 border-t border-stone-100 space-y-3">
          <form action={addSchedulePresetAction} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="label !text-xs" htmlFor="preset_label">項目名</label>
              <input id="preset_label" name="label" className="input !min-h-10 !py-2 text-sm" placeholder="例）朝礼、撮影、ロープレ" required />
            </div>
            <button type="submit" className="btn-secondary !min-h-10 !py-2 !px-4 text-sm">登録</button>
          </form>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 text-xs font-bold rounded-full px-3 py-1.5 border border-stone-300 text-stone-600">
                {p.label}
                {isExec && (
                  <form action={deleteSchedulePresetAction} className="inline">
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" aria-label={`${p.label}を削除`} className="text-red-400 font-bold">×</button>
                  </form>
                )}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-stone-400">
            ここに登録した項目は、今日のスケジュール・理想のスケジュールの両方で選べます（手入力もできます）。
            {isExec && "削除は幹部のみできます。"}
          </p>
        </div>
      </details>

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
          理想のスケジュール（今月の目標・1週間）を編集する
        </Link>
      </p>
    </div>
  );
}

function PlanView({ plan }: { plan: DailyPlan }) {
  const f = plan.fields;
  const blocks = planBlocks(plan);
  const hasFields = f.goal || f.horenso || f.todo || blocks.length > 0 || f.timetable;
  return (
    <div className="mt-2 space-y-1.5 text-sm">
      {f.goal && <p><span className="text-xs font-bold text-brand-700">目標：</span>{f.goal}</p>}
      {f.horenso && <p><span className="text-xs font-bold text-brand-700">ホウレンソウ：</span>{f.horenso}</p>}
      {f.todo && <p><span className="text-xs font-bold text-brand-700">やること：</span>{f.todo}</p>}
      {blocks.length > 0 && (
        <div>
          <p className="text-xs font-bold text-brand-700 mb-1">タイムテーブル</p>
          <ScheduleList blocks={blocks} />
        </div>
      )}
      {blocks.length === 0 && f.timetable && (
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
