/* eslint-disable @next/next/no-img-element */
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import {
  addDays,
  formatDateJa,
  thisMonthJst,
  todayJst,
  weekdayJa,
  weekdayOf,
} from "@/lib/date";
import { formatWorkTime, resolveScheduleDay } from "@/lib/schedule";
import { PageHeader } from "@/components/ui";
import { PhotoInput } from "@/components/photo-input";
import { ScheduleBoard } from "@/components/schedule-board";
import { ScheduleList } from "@/components/schedule-board-view";
import { Icon } from "@/components/icons";
import { PLAN_DAYS_AHEAD, normalizePlanDate, planDateBounds } from "@/lib/eni/plan";
import {
  PLAN_WEEK_SCOPES,
  WEEK_DAY_LABELS,
  blocksFromLegacyRows,
  comparePlan,
  minutesLabel,
  parseWeekContent,
  planBlocksForDate,
  planScopeOfDate,
  totalMinutes,
} from "@/lib/eni/schedule-blocks";
import type { DailyPlan, ScheduleBlock } from "@/lib/data/types";
import { DateStrip, type StripDay } from "./date-strip";
import {
  addSchedulePresetAction,
  copyPlanWeekAction,
  deleteSchedulePresetAction,
  markPlanSeenAction,
  saveDayPlanAction,
  saveMonthGoalAction,
  savePlanWeekAction,
} from "./actions";

const WEEK_LABELS: Record<string, string> = {
  week1: "第1週",
  week2: "第2週",
  week3: "第3週",
  week4: "第4週",
};

/** 保存済みの予定を予約表の帯に変換（旧形式の1時間グリッドも読めるようにする） */
function planBlocks(plan: DailyPlan | null | undefined): ScheduleBlock[] {
  if (!plan) return [];
  const blocks = plan.fields.timetableBlocks ?? [];
  return blocks.length > 0 ? blocks : blocksFromLegacyRows(plan.fields.timetableRows);
}

/**
 * スケジュール（旧「今日のスケジュール」＋「理想のスケジュール」を1つにまとめた画面）。
 *  ・その日のスケジュール …… 毎朝入れる予定。計画スケジュールを薄く重ねて、比べながら入れられる
 *  ・計画スケジュール ……… 第1〜4週の「こう過ごしたい1週間」。今月の目標もここ
 *  ・みんなの予定 ………… その日の全員の予定と「見ました」
 * 日付は3ヶ月先まで選べるので、先の予定も前もって組める。
 */
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; tab?: string; week?: string; saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const today = todayJst();
  const date = normalizePlanDate(params.date, today);
  const bounds = planDateBounds(today);
  const tab = params.tab === "plan" ? "plan" : params.tab === "team" ? "team" : "day";
  const week = PLAN_WEEK_SCOPES.includes((params.week ?? "") as never)
    ? params.week!
    : planScopeOfDate(date);

  const db = getDataStore();
  const [staffList, plans, patterns, dayoffs, overrides, myIdeals, pairs, presets, nearbyPlans] =
    await Promise.all([
      db.listStaff(),
      db.listDailyPlans(date),
      db.listWorkPatterns(),
      db.listDayoffRequests({ from: date, to: date }),
      db.listScheduleOverrides({ from: date, to: date }),
      db.listIdealSchedules(session.staffId),
      db.listPracticePairs(thisMonthJst()),
      db.listSchedulePresets(),
      // 日付バーの「入力済み」の点を出すため、前後の日も薄く見る
      Promise.all(
        Array.from({ length: 21 }, (_, i) => addDays(date, i - 7)).map((d) =>
          db.listDailyPlans(d).then((rows) => ({
            date: d,
            mine: rows.some((r) => r.staffId === session.staffId),
          }))
        )
      ),
    ]);

  const members = staffList.filter((s) => s.isActive && s.jobType !== "");
  const staffMap = new Map(staffList.map((s) => [s.id, s.name]));
  const myPlan = plans.find((p) => p.staffId === session.staffId) ?? null;
  const goalMonth = myIdeals.find((s) => s.scope === "month_goal")?.content ?? "";
  const isExec =
    session.role === "admin" || (staffList.find((s) => s.id === session.staffId)?.isExecutive ?? false);
  const myMentees = new Set(
    pairs.filter((p) => p.partnerStaffId === session.staffId).map((p) => p.memberStaffId)
  );

  // その日にあたる計画（第◯週の、その曜日）
  const weekOfDate = planScopeOfDate(date);
  const planWeekBlocks = parseWeekContent(
    myIdeals.find((s) => s.scope === weekOfDate)?.content ?? ""
  );
  const plannedForDay = planBlocksForDate(planWeekBlocks, date);
  const actualForDay = planBlocks(myPlan);
  const diffRows = comparePlan(plannedForDay, actualForDay);

  const f = myPlan?.fields;
  const presetLabels = presets.map((p) => p.label);
  const backHref = `/staff/plan?date=${date}&tab=${tab}`;

  const stripDays: StripDay[] = nearbyPlans.map((row) => ({
    date: row.date,
    day: String(Number(row.date.slice(8, 10))),
    weekday: weekdayJa(weekdayOf(row.date)),
    weekdayIndex: weekdayOf(row.date),
    hasPlan: row.mine,
    isToday: row.date === today,
  }));

  const notice =
    params.saved === "day"
      ? "この日の予定を保存しました"
      : params.saved === "seen"
        ? "「見ました」を記録しました"
        : params.saved === "goal"
          ? "今月の目標を保存しました"
          : params.saved === "week"
            ? "計画スケジュールを保存しました"
            : params.saved === "copied"
              ? "他の週からコピーしました（内容を確認して保存してください）"
              : params.saved === "preset"
                ? "よくある項目を更新しました"
                : "";
  const errorMsg =
    params.error === "empty"
      ? "コピー元の週にまだ予定が入っていません"
      : params.error
        ? "入力内容を確認してください"
        : "";

  const tabs = [
    { key: "day", label: "その日の予定", icon: "clock" as const },
    { key: "plan", label: "計画スケジュール", icon: "sparkles" as const },
    { key: "team", label: "みんなの予定", icon: "users" as const },
  ];

  return (
    <div className="page-narrow">
      <PageHeader
        title="スケジュール"
        backHref="/staff"
        description="毎朝の予定と、こう過ごしたいという計画を1つの画面で"
        icon="calendar"
      />

      {notice && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          {notice}
        </p>
      )}
      {errorMsg && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">{errorMsg}</p>
      )}

      {/* タブ（スマホでも指で押しやすい高さ） */}
      <div className="flex gap-1.5 mb-4">
        {tabs.map((t) => (
          <a
            key={t.key}
            href={`/staff/plan?date=${date}&tab=${t.key}`}
            className={`chip flex-1 justify-center !text-xs sm:!text-sm !py-2.5 ${
              tab === t.key ? "chip-active" : ""
            }`}
          >
            <Icon name={t.icon} className="w-3.5 h-3.5" />
            {t.label}
          </a>
        ))}
      </div>

      {goalMonth && tab !== "plan" && (
        <div className="rounded-2xl bg-brand-50 border border-brand-200 p-4 mb-4">
          <p className="text-xs font-bold text-brand-700 mb-1">今月の目標</p>
          <p className="text-sm whitespace-pre-wrap text-ink-800">{goalMonth}</p>
        </div>
      )}

      {tab !== "plan" && (
        <>
          <DateStrip
            days={stripDays}
            selected={date}
            min={bounds.min}
            max={bounds.max}
            hrefOf={`/staff/plan?date=__DATE__&tab=${tab}`}
          />
          <p className="text-sm font-bold text-ink-600 mb-3">
            {formatDateJa(date, true)}
            {date === today && <span className="text-brand-600 ml-1">（今日）</span>}
            {date > today && (
              <span className="text-ink-400 ml-1">（{daysBetween(today, date)}日後の予定）</span>
            )}
          </p>
        </>
      )}

      {/* ---------------- その日の予定 ---------------- */}
      {tab === "day" && (
        <>
          {/* 計画との比較（何にどれだけ時間を使うつもりか／実際どうか） */}
          <PlanCompare
            planned={plannedForDay}
            actual={actualForDay}
            rows={diffRows}
            weekLabel={WEEK_LABELS[weekOfDate]}
            planHref={`/staff/plan?date=${date}&tab=plan&week=${weekOfDate}`}
          />

          <form action={saveDayPlanAction} className="card space-y-4 mb-4">
            <input type="hidden" name="plan_date" value={date} />
            <p className="section-title !mb-0">この日の予定（フォーム入力・写真どちらでもOK）</p>
            <div>
              <label className="label" htmlFor="goal">この日の目標</label>
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
                initial={actualForDay}
                presets={presetLabels}
                dayLabels={[formatDateJa(date)]}
                startHour={8}
                endHour={22}
                ghostBlocks={plannedForDay}
                ghostLabel="計画"
              />
            </div>
            <div>
              <p className="label !mb-2">スケジュール帳の写真（貼る場合）</p>
              <PhotoInput name="photo" initial={myPlan?.photo ?? ""} label="スケジュール帳を撮影・選択" />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary w-full">
                {myPlan ? "上書き保存する" : "この日の予定を保存する"}
              </button>
            </div>
          </form>

          <PresetEditor presets={presets} isExec={isExec} back={backHref} />
        </>
      )}

      {/* ---------------- 計画スケジュール ---------------- */}
      {tab === "plan" && (
        <PlanEditor
          goal={goalMonth}
          week={week}
          ideals={myIdeals.map((s) => ({ scope: s.scope, content: s.content, image: s.image }))}
          presetLabels={presetLabels}
          presets={presets}
          isExec={isExec}
          back={backHref}
        />
      )}

      {/* ---------------- みんなの予定 ---------------- */}
      {tab === "team" && (
        <section className="space-y-3">
          {members.map((m) => {
            const plan = plans.find((p) => p.staffId === m.id);
            const work = resolveScheduleDay(m.id, date, weekdayOf(date), patterns, dayoffs, overrides);
            const canMarkSeen = m.id !== session.staffId && plan && (myMentees.has(m.id) || isExec);
            return (
              <div key={m.id} className="card">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold">
                    {m.name}
                    <span className="text-[10px] font-normal text-ink-400 ml-1.5">
                      {m.jobType === "stylist" ? "スタイリスト" : "アシスタント"}
                    </span>
                  </p>
                  <span className={`text-xs font-bold ${work.working ? "text-brand-700" : "text-ink-400"}`}>
                    {formatWorkTime(work)}
                  </span>
                </div>

                {plan ? (
                  <PlanView plan={plan} />
                ) : (
                  <p className="text-xs text-ink-400 mt-2">（まだ入力されていません）</p>
                )}

                {plan && (
                  <div className="mt-2 flex items-center gap-2">
                    {plan.seenBy ? (
                      <span className="text-[11px] font-bold text-emerald-600">
                        ✓ {staffMap.get(plan.seenBy) ?? ""}さんが確認済み
                      </span>
                    ) : (
                      <span className="text-[11px] text-ink-400">未確認</span>
                    )}
                    {canMarkSeen && !plan.seenBy && (
                      <form action={markPlanSeenAction}>
                        <input type="hidden" name="staff_id" value={m.id} />
                        <input type="hidden" name="plan_date" value={date} />
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
          {members.length === 0 && (
            <p className="text-sm text-ink-400">表示できるメンバーがいません。</p>
          )}
        </section>
      )}

      <p className="text-[11px] text-ink-400 mt-4">
        ※ 計画スケジュールは自分だけが編集できます。その日の予定は最大{PLAN_DAYS_AHEAD}日先まで入力できます。
      </p>
    </div>
  );
}

/** 何日後かを数える（表示用の目安） */
function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** 計画とその日の予定を並べて比べる（合計時間＋内容ごとの差） */
function PlanCompare({
  planned,
  actual,
  rows,
  weekLabel,
  planHref,
}: {
  planned: ScheduleBlock[];
  actual: ScheduleBlock[];
  rows: { label: string; planMin: number; actualMin: number; diffMin: number }[];
  weekLabel: string;
  planHref: string;
}) {
  if (planned.length === 0) {
    return (
      <div className="card mb-4 border-dashed">
        <p className="text-sm text-ink-500">
          この日にあたる計画（{weekLabel}）がまだありません。
          <a href={planHref} className="font-bold text-brand-700 underline ml-1">
            計画スケジュールを作る
          </a>
        </p>
      </div>
    );
  }

  const planTotal = totalMinutes(planned);
  const actualTotal = totalMinutes(actual);
  const diffTotal = actualTotal - planTotal;

  return (
    <details className="card mb-4 border-brand-300" open>
      <summary className="cursor-pointer list-none flex items-center gap-2">
        <span className="section-title !mb-0 flex-1">計画と見比べる（{weekLabel}）</span>
        <span className="text-[11px] font-bold text-ink-400">▾</span>
      </summary>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-ink-50 border border-ink-200 py-2">
          <p className="text-[10px] font-bold text-ink-400">計画</p>
          <p className="font-display text-lg font-bold text-ink-700">{minutesLabel(planTotal)}</p>
        </div>
        <div className="rounded-xl bg-brand-50 border border-brand-200 py-2">
          <p className="text-[10px] font-bold text-brand-600">この日</p>
          <p className="font-display text-lg font-bold text-brand-800">{minutesLabel(actualTotal)}</p>
        </div>
        <div
          className={`rounded-xl border py-2 ${
            diffTotal === 0
              ? "bg-emerald-50 border-emerald-200"
              : diffTotal > 0
                ? "bg-sky-50 border-sky-200"
                : "bg-amber-50 border-amber-200"
          }`}
        >
          <p className="text-[10px] font-bold text-ink-500">差</p>
          <p className="font-display text-lg font-bold text-ink-800">
            {diffTotal === 0 ? "±0" : `${diffTotal > 0 ? "+" : "−"}${minutesLabel(diffTotal)}`}
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-xs">
            <span className="flex-1 min-w-0 truncate font-bold text-ink-700">{r.label}</span>
            <span className="text-ink-400 shrink-0">計画 {minutesLabel(r.planMin)}</span>
            <span className="text-ink-300 shrink-0">→</span>
            <span className="text-ink-700 font-bold shrink-0">{minutesLabel(r.actualMin)}</span>
            <span
              className={`shrink-0 w-14 text-right font-bold ${
                r.diffMin === 0 ? "text-emerald-600" : r.diffMin > 0 ? "text-sky-600" : "text-amber-600"
              }`}
            >
              {r.diffMin === 0 ? "±0" : `${r.diffMin > 0 ? "+" : "−"}${minutesLabel(r.diffMin)}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-ink-400 mt-2">
        計画は下の予約表に薄く重ねて表示されます。「計画をこの日に取り込む」で下書きにできます。
      </p>
    </details>
  );
}

/** 計画スケジュール（今月の目標＋第1〜4週の1週間） */
function PlanEditor({
  goal,
  week,
  ideals,
  presetLabels,
  presets,
  isExec,
  back,
}: {
  goal: string;
  week: string;
  ideals: { scope: string; content: string; image: string }[];
  presetLabels: string[];
  presets: { id: string; label: string }[];
  isExec: boolean;
  back: string;
}) {
  const weekLabel = WEEK_LABELS[week];
  const current = ideals.find((s) => s.scope === week);
  const initialBlocks = parseWeekContent(current?.content ?? "");
  const copySources = PLAN_WEEK_SCOPES.filter(
    (w) =>
      w !== week &&
      parseWeekContent(ideals.find((s) => s.scope === w)?.content ?? "").length > 0
  );

  return (
    <>
      <form action={saveMonthGoalAction} className="card space-y-2 mb-4 border-brand-300 bg-brand-50/40">
        <label className="label" htmlFor="content">
          今月の目標<span className="ml-2 text-[11px] font-normal text-ink-400">まずここから決める</span>
        </label>
        <textarea
          id="content"
          name="content"
          rows={3}
          defaultValue={goal}
          placeholder="例）ワインディングとカラー塗布を安定させる。モデルを月4名。"
          className="input min-h-20"
        />
        <button type="submit" className="btn-primary w-full">今月の目標を保存</button>
      </form>

      <div className="flex gap-1.5 mb-4">
        {PLAN_WEEK_SCOPES.map((w) => {
          const filled =
            parseWeekContent(ideals.find((s) => s.scope === w)?.content ?? "").length > 0;
          return (
            <a
              key={w}
              href={`/staff/plan?tab=plan&week=${w}`}
              className={`flex-1 text-center text-sm font-bold rounded-full px-2 py-2 border ${
                week === w ? "bg-brand-600 text-white border-brand-600" : "border-ink-300 text-ink-600"
              }`}
            >
              {WEEK_LABELS[w]}
              {filled && (
                <span className={`ml-1 text-[10px] ${week === w ? "text-white/80" : "text-emerald-500"}`}>
                  ●
                </span>
              )}
            </a>
          );
        })}
      </div>

      <form action={savePlanWeekAction} className="card space-y-3">
        <input type="hidden" name="scope" value={week} />
        <div className="flex items-center justify-between gap-2">
          <p className="section-title !mb-0">{weekLabel}の計画（1週間）</p>
          {goal && (
            <p className="text-[11px] text-brand-700 font-bold truncate max-w-[50%]">
              目標：{goal.split("\n")[0]}
            </p>
          )}
        </div>

        <ScheduleBoard
          name="timetable_blocks"
          initial={initialBlocks}
          presets={presetLabels}
          dayLabels={WEEK_DAY_LABELS}
          startHour={7}
          endHour={23}
        />

        <div>
          <p className="label !mb-2">画像を貼る（手帳・イメージ図など・任意）</p>
          <PhotoInput name="image" initial={current?.image ?? ""} label="画像を撮影・選択" />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn-primary w-full text-lg">{weekLabel}の計画を保存</button>
        </div>
      </form>

      {copySources.length > 0 && (
        <form action={copyPlanWeekAction} className="card mt-4 flex items-end gap-2">
          <input type="hidden" name="to_scope" value={week} />
          <div className="flex-1">
            <label className="label !text-xs" htmlFor="from_scope">
              他の週の内容を{weekLabel}にコピー
            </label>
            <select
              id="from_scope"
              name="from_scope"
              className="input !min-h-10 !py-2 text-sm"
              defaultValue={copySources[0]}
            >
              {copySources.map((w) => (
                <option key={w} value={w}>
                  {WEEK_LABELS[w]}からコピー
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-secondary !min-h-10 !py-2 !px-4 text-sm">コピー</button>
        </form>
      )}

      <div className="mt-4">
        <PresetEditor presets={presets} isExec={isExec} back={back} />
      </div>
    </>
  );
}

/** タイムテーブルの「よくある項目」の登録（その日の予定・計画のどちらからでも触れる） */
function PresetEditor({
  presets,
  isExec,
  back,
}: {
  presets: { id: string; label: string }[];
  isExec: boolean;
  back: string;
}) {
  return (
    <details className="card">
      <summary className="cursor-pointer text-sm font-bold text-brand-700">
        よくある項目を登録する（{presets.length}件）
      </summary>
      <div className="mt-3 pt-3 border-t border-ink-100 space-y-3">
        <form action={addSchedulePresetAction} className="flex items-end gap-2">
          <input type="hidden" name="back" value={back} />
          <div className="flex-1">
            <label className="label !text-xs" htmlFor="preset_label">項目名</label>
            <input
              id="preset_label"
              name="label"
              className="input !min-h-10 !py-2 text-sm"
              placeholder="例）朝礼、撮影、ロープレ"
              required
            />
          </div>
          <button type="submit" className="btn-secondary !min-h-10 !py-2 !px-4 text-sm">登録</button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <span key={p.id} className="chip">
              {p.label}
              {isExec && (
                <form action={deleteSchedulePresetAction} className="inline">
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="back" value={back} />
                  <button type="submit" aria-label={`${p.label}を削除`} className="text-red-400 font-bold">
                    ×
                  </button>
                </form>
              )}
            </span>
          ))}
        </div>
        <p className="text-[11px] text-ink-400">
          ここに登録した項目は、その日の予定・計画スケジュールの両方で選べます（手入力もできます）。
          {isExec && "削除は幹部のみできます。"}
        </p>
      </div>
    </details>
  );
}

/** 保存済みの予定の読み取り表示（みんなの予定用） */
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
        <img src={plan.photo} alt="スケジュール帳" className="w-full max-h-72 object-contain rounded-lg border border-ink-200 bg-white" />
      )}
      {!hasFields && !plan.photo && <p className="text-xs text-ink-400">（内容なし）</p>}
    </div>
  );
}
