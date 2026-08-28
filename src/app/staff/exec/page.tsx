import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isExecutive } from "@/lib/eni/access";
import { addDays, formatDateJa, formatDateTimeJa, formatMonthJa, formatWeekJa, todayJst } from "@/lib/date";
import { hasExecNotice, isTaskActionable, isTaskDueOn } from "@/lib/tasks";
import {
  ROUTINE_CYCLES,
  ROUTINE_CYCLE_LABEL,
  ROUTINE_CYCLE_SHORT,
  buildRoutineStatuses,
  countUndone,
  currentPeriodKeys,
  type RoutineStatus,
} from "@/lib/eni/routines";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { RepeatFields, TaskRow } from "@/components/task-ui";
import { createExecTaskAction } from "@/app/staff/tasks/actions";
import {
  createRoutineAction,
  deleteRoutineAction,
  toggleNoticeCheckAction,
  toggleRoutineAction,
  updateRoutineAction,
} from "./actions";
import type { EniReport, ManagerRoutine, RoutineCycle, StaffTask } from "@/lib/data/types";

const BACK = "/staff/exec";

// 幹部メニュー：幹部のみが入れる。
//  ・タスク：幹部タスクの作成・進捗・繰り返し・メンバー別の未完了の追跡（期限切れはアラート表示）
//  ・気づき：スタイリスト日報の「現場での気づき」「スタッフへの指導・共有」を一覧で確認し、
//    確認したらチェックで流す（全員分の共有事項を見逃さない）
export default async function ExecPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  if (!(await isExecutive(session))) redirect("/staff");

  const params = await searchParams;
  const tab =
    params.tab === "notices" ? "notices" : params.tab === "routines" ? "routines" : "tasks";
  const db = getDataStore();
  const today = todayJst();

  const [execTasks, staffList, noticeReportsAll, completionsToday, routines, routineChecks] =
    await Promise.all([
      db.listStaffTasks({ kind: "exec", includeDone: true }),
      db.listStaff(),
      db.listEniReports("stylist", { from: addDays(today, -30), to: today }),
      db.listTaskCompletions({ from: today, to: today }),
      db.listManagerRoutines(),
      db.listManagerRoutineChecks(currentPeriodKeys(today)),
    ]);
  // 店長・副店長のルーティン（今日／今週／今月の分）
  const routineStatuses = buildRoutineStatuses(routines, routineChecks, today);
  const routineUndone = countUndone(routineStatuses);
  const dailyUndone = countUndone(routineStatuses, "daily");
  const staffNames = new Map(staffList.map((s) => [s.id, s.name]));
  const activeStaff = staffList.filter((s) => s.isActive);
  const doneTodayIds = new Set(completionsToday.map((c) => c.taskId));

  // 気づきのあるレポートと確認状況
  const noticeReports = noticeReportsAll
    .filter((r) => hasExecNotice(r.answers))
    .sort((a, b) => b.periodKey.localeCompare(a.periodKey));
  const checks = await db.listExecNoticeChecks(noticeReports.map((r) => r.id));
  const checkMap = new Map(checks.map((c) => [c.reportId, c]));
  const unchecked = noticeReports.filter((r) => !checkMap.has(r.id));
  const checkedReports = noticeReports.filter((r) => checkMap.has(r.id));

  const openTasks = execTasks.filter((t) => t.status !== "done");
  const doneTasks = execTasks.filter((t) => t.status === "done").slice(0, 10);
  const overdue = openTasks.filter((t) => !t.repeat && t.dueDate && t.dueDate < today);
  const myOpen = openTasks.filter(
    (t) => t.assigneeStaffId === session.staffId && isTaskActionable(t, today, doneTodayIds)
  );

  // メンバー別の未完了（誰が何をやっているか）
  const byAssignee = new Map<string, StaffTask[]>();
  for (const t of openTasks) {
    const list = byAssignee.get(t.assigneeStaffId) ?? [];
    list.push(t);
    byAssignee.set(t.assigneeStaffId, list);
  }

  return (
    <div className="page-narrow">
      <PageHeader
        title="幹部メニュー"
        backHref="/staff"
        description="幹部タスク・店長/副店長のルーティン業務・日報の気づきの確認"
        icon="crown"
      />

      {params.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          保存しました
        </p>
      )}
      {params.error && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          {params.error === "forbidden" ? "この操作の権限がありません" : "入力内容を確認してください"}
        </p>
      )}

      {/* 今日のルーティンが残っているときは、どのタブにいても知らせる */}
      {dailyUndone > 0 && tab !== "routines" && (
        <a
          href="/staff/exec?tab=routines"
          className="card !p-3.5 mb-4 flex items-center gap-2 border-red-300 bg-red-50"
        >
          <Icon name="alertTriangle" className="w-4 h-4 text-red-600 shrink-0" />
          <span className="flex-1 min-w-0 text-sm font-bold text-red-700">
            今日のルーティン業務が {dailyUndone} 件のこっています
          </span>
          <Icon name="chevronRight" className="w-4 h-4 text-red-400 shrink-0" />
        </a>
      )}

      {/* タブ */}
      <div className="flex gap-1.5 mb-4">
        <a
          href="/staff/exec?tab=tasks"
          className={`chip flex-1 justify-center !text-xs sm:!text-sm !py-2.5 ${tab === "tasks" ? "chip-active" : ""}`}
        >
          幹部タスク（{openTasks.length}）
        </a>
        <a
          href="/staff/exec?tab=routines"
          className={`chip flex-1 justify-center !text-xs sm:!text-sm !py-2.5 ${tab === "routines" ? "chip-active" : ""}`}
        >
          ルーティン（{routineUndone}）
        </a>
        <a
          href="/staff/exec?tab=notices"
          className={`chip flex-1 justify-center !text-xs sm:!text-sm !py-2.5 ${tab === "notices" ? "chip-active" : ""}`}
        >
          日報の気づき（{unchecked.length}）
        </a>
      </div>

      {tab === "routines" ? (
        <RoutinesTab statuses={routineStatuses} today={today} staffNames={staffNames} />
      ) : tab === "tasks" ? (
        <>
          {/* アラート：期限切れ */}
          {overdue.length > 0 && (
            <div className="rounded-2xl border border-red-300 bg-red-50 p-4 mb-4">
              <p className="text-sm font-bold text-red-700 flex items-center gap-1.5">
                <Icon name="alertTriangle" className="w-4 h-4" />
                期限切れのタスクが {overdue.length} 件あります
              </p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-red-600 font-bold">
                {overdue.slice(0, 5).map((t) => (
                  <li key={t.id}>
                    ・{t.title}（{staffNames.get(t.assigneeStaffId) ?? "？"}／期限{" "}
                    {formatDateJa(t.dueDate)}）
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 自分の未完了 */}
          <section className="card mb-4">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="section-title !mb-0 flex-1">自分の未完了</h2>
              {myOpen.length > 0 ? (
                <StatusBadge label={`残り ${myOpen.length} 件`} tone="warning" />
              ) : (
                <StatusBadge label="今日はすべて対応済み" tone="ok" />
              )}
            </div>
            <div className="space-y-2">
              {openTasks
                .filter((t) => t.assigneeStaffId === session.staffId)
                .map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    today={today}
                    done={t.repeat ? doneTodayIds.has(t.id) : false}
                    back={BACK}
                    staffNames={staffNames}
                    statusControl
                    canDelete
                  />
                ))}
              {openTasks.filter((t) => t.assigneeStaffId === session.staffId).length === 0 && (
                <p className="text-sm text-ink-500">自分の担当タスクはありません。</p>
              )}
            </div>
          </section>

          {/* メンバー別の進捗（誰が何をやっているか） */}
          <section className="card mb-4">
            <h2 className="section-title">メンバー別の未完了（誰が何をやっているか）</h2>
            {byAssignee.size === 0 ? (
              <EmptyState message="未完了の幹部タスクはありません" />
            ) : (
              <div className="space-y-4">
                {[...byAssignee.entries()]
                  .sort((a, b) => b[1].length - a[1].length)
                  .map(([staffId, tasks]) => {
                    const memberOverdue = tasks.filter(
                      (t) => !t.repeat && t.dueDate && t.dueDate < today
                    ).length;
                    const todayDue = tasks.filter(
                      (t) => t.repeat && isTaskDueOn(t, today) && !doneTodayIds.has(t.id)
                    ).length;
                    return (
                      <div key={staffId}>
                        <p className="text-sm font-bold text-ink-800 mb-1.5 flex items-center gap-2">
                          {staffNames.get(staffId) ?? "（不明）"}
                          <span className="text-xs text-ink-400 font-bold">{tasks.length}件</span>
                          {memberOverdue > 0 && (
                            <StatusBadge label={`期限切れ ${memberOverdue}`} tone="danger" />
                          )}
                          {todayDue > 0 && <StatusBadge label={`今日 ${todayDue}`} tone="warning" />}
                        </p>
                        <div className="space-y-2">
                          {tasks.map((t) => (
                            <TaskRow
                              key={t.id}
                              task={t}
                              today={today}
                              done={t.repeat ? doneTodayIds.has(t.id) : false}
                              back={BACK}
                              staffNames={staffNames}
                              statusControl
                              canDelete
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </section>

          {/* 作成フォーム */}
          <section className="card mb-4">
            <h2 className="section-title flex items-center gap-1.5">
              <Icon name="plus" className="w-4 h-4 text-brand-600" />
              幹部タスクを追加
            </h2>
            <form action={createExecTaskAction} className="space-y-3">
              <input type="hidden" name="back" value={BACK} />
              <div>
                <label className="label" htmlFor="exec-title">
                  何を
                </label>
                <input
                  id="exec-title"
                  name="title"
                  className="input"
                  placeholder="例）採用媒体の原稿を更新する"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="exec-assignee">
                    誰が
                  </label>
                  <select id="exec-assignee" name="assignee" className="input" required defaultValue={session.staffId}>
                    {activeStaff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="exec-due">
                    いつまでに（任意）
                  </label>
                  <input id="exec-due" name="due_date" type="date" className="input" />
                </div>
              </div>
              <RepeatFields idPrefix="exec" />
              <div>
                <label className="label" htmlFor="exec-note">
                  メモ（任意）
                </label>
                <input id="exec-note" name="note" className="input" placeholder="補足・決定事項など" />
              </div>
              <button type="submit" className="btn-primary w-full">
                タスクを追加する
              </button>
            </form>
          </section>

          {/* 完了済み（直近） */}
          {doneTasks.length > 0 && (
            <section className="card">
              <h2 className="section-title">完了済み（直近10件）</h2>
              <div className="space-y-1.5">
                {doneTasks.map((t) => (
                  <p key={t.id} className="text-sm text-ink-500 flex items-center gap-2">
                    <Icon name="checkCircle" className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="line-through flex-1 min-w-0">{t.title}</span>
                    <span className="text-xs shrink-0">
                      {staffNames.get(t.assigneeStaffId) ?? ""}
                      {t.doneAt && ` ／ ${formatDateJa(t.doneAt.toISOString().slice(0, 10))}`}
                    </span>
                  </p>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <>
          {/* ---- 日報の気づき ---- */}
          <p className="text-xs text-ink-500 mb-3">
            スタイリスト日報の「現場での気づき」「スタッフへの指導・共有」を直近30日分まとめています。
            内容を確認したらチェックすると下の「確認済み」に流れます。
          </p>

          <section className="space-y-3 mb-5">
            {unchecked.length === 0 ? (
              <EmptyState message="未確認の気づきはありません。すべて確認済みです！" />
            ) : (
              unchecked.map((r) => (
                <NoticeCard key={r.id} report={r} staffNames={staffNames} checked={false} />
              ))
            )}
          </section>

          {checkedReports.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none text-sm font-bold text-ink-500 flex items-center gap-1.5 mb-3">
                <Icon name="checkCircle" className="w-4 h-4 text-emerald-500" />
                確認済み（{checkedReports.length}件）
                <span className="text-ink-300 transition-transform group-open:rotate-180">▾</span>
              </summary>
              <div className="space-y-3 opacity-70">
                {checkedReports.map((r) => {
                  const check = checkMap.get(r.id)!;
                  return (
                    <NoticeCard
                      key={r.id}
                      report={r}
                      staffNames={staffNames}
                      checked
                      checkedLabel={`${staffNames.get(check.checkedBy) ?? ""}が確認（${formatDateTimeJa(check.checkedAt)}）`}
                    />
                  );
                })}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/**
 * 店長・副店長のルーティン業務。
 * デイリー／ウィークリー／マンスリーごとに「今の期間ぶん」をチェックしていく。
 * 未完了はアラートで知らせ、マスタ（項目そのもの）もこの画面から追加・編集できる。
 */
function RoutinesTab({
  statuses,
  today,
  staffNames,
}: {
  statuses: RoutineStatus[];
  today: string;
  staffNames: Map<string, string>;
}) {
  const byCycle = (cycle: RoutineCycle) => statuses.filter((s) => s.routine.cycle === cycle);
  /** その周期の「今どの期間の分か」を日本語で出す */
  const periodLabel = (cycle: RoutineCycle, periodKey: string) =>
    cycle === "daily"
      ? formatDateJa(periodKey, true)
      : cycle === "weekly"
        ? formatWeekJa(periodKey)
        : formatMonthJa(periodKey);

  return (
    <>
      <p className="text-xs text-ink-500 mb-3">
        店長・副店長が毎回やる業務です。終わったらチェックしてください。
        未完了はこの画面と幹部メニューの入口でお知らせします。
      </p>

      {ROUTINE_CYCLES.map((cycle) => {
        const rows = byCycle(cycle);
        if (rows.length === 0) return null;
        const undone = rows.filter((r) => !r.done).length;
        const periodKey = rows[0].periodKey;

        return (
          <section key={cycle} className="card mb-4">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="section-title !mb-0 flex-1">{ROUTINE_CYCLE_LABEL[cycle]}</h2>
              {undone > 0 ? (
                <StatusBadge label={`未完了 ${undone}`} tone="danger" />
              ) : (
                <StatusBadge label="完了" tone="ok" />
              )}
            </div>
            <p className="text-[11px] text-ink-400 mb-3">対象：{periodLabel(cycle, periodKey)}</p>

            {undone > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 mb-3 flex items-center gap-2">
                <Icon name="alertTriangle" className="w-4 h-4 text-red-600 shrink-0" />
                <span className="text-xs font-bold text-red-700">
                  {ROUTINE_CYCLE_SHORT[cycle]}のチェックが {undone} 件のこっています
                </span>
              </div>
            )}

            <div className="space-y-2">
              {rows.map(({ routine, periodKey: key, check, done }) => (
                <div
                  key={routine.id}
                  className={`rounded-xl border p-3 ${
                    done ? "border-emerald-200 bg-emerald-50/60" : "border-ink-200 bg-white"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <form action={toggleRoutineAction} className="shrink-0">
                      <input type="hidden" name="routine_id" value={routine.id} />
                      <input type="hidden" name="period_key" value={key} />
                      <input type="hidden" name="done" value={done ? "0" : "1"} />
                      <button
                        type="submit"
                        aria-label={done ? `${routine.title}のチェックを外す` : `${routine.title}をチェックする`}
                        className={`w-11 h-11 rounded-xl border-2 flex items-center justify-center transition-colors ${
                          done
                            ? "border-emerald-400 bg-emerald-100 text-emerald-600"
                            : "border-ink-300 bg-white text-ink-300 hover:border-brand-400 hover:text-brand-600"
                        }`}
                      >
                        <Icon name="checkCircle" className="w-6 h-6" />
                      </button>
                    </form>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-bold ${done ? "text-emerald-700" : "text-ink-900"}`}>
                        {routine.title}
                      </p>
                      {routine.note && <p className="text-xs text-ink-500 mt-0.5">{routine.note}</p>}
                      {check && (
                        <p className="text-[11px] text-emerald-600 font-bold mt-1">
                          {staffNames.get(check.staffId) ?? ""}が確認（{formatDateTimeJa(check.checkedAt)}）
                        </p>
                      )}
                    </div>
                  </div>

                  {/* マスタの編集（内容・周期・並び順） */}
                  <details className="mt-2 pt-2 border-t border-ink-100">
                    <summary className="cursor-pointer text-[11px] font-bold text-ink-400">
                      この業務の内容を編集する
                    </summary>
                    <RoutineFields routine={routine} />
                    <form action={deleteRoutineAction} className="mt-2 pt-2 border-t border-red-100 space-y-2">
                      <input type="hidden" name="routine_id" value={routine.id} />
                      <label className="flex items-center gap-2 text-xs font-bold text-red-600">
                        <input type="checkbox" name="confirm" className="h-4 w-4 accent-red-500" />
                        この業務を削除する（これまでの記録も消えます）
                      </label>
                      <button type="submit" className="btn-danger w-full">削除</button>
                    </form>
                  </details>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {statuses.length === 0 && (
        <EmptyState message="ルーティン業務がまだ登録されていません。下から追加してください" />
      )}

      {/* 追加 */}
      <section className="card">
        <h2 className="section-title flex items-center gap-1.5">
          <Icon name="plus" className="w-4 h-4 text-brand-600" />
          ルーティン業務を追加
        </h2>
        <form action={createRoutineAction} className="space-y-3">
          <div>
            <label className="label" htmlFor="routine-title">やること</label>
            <input
              id="routine-title"
              name="title"
              className="input"
              placeholder="例）公式LINEチェック"
              required
            />
          </div>
          <div>
            <p className="label !mb-2">どれくらいの頻度で</p>
            <div className="flex gap-2">
              {ROUTINE_CYCLES.map((c) => (
                <label
                  key={c}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-ink-200 px-3 py-2.5 text-sm font-bold has-checked:border-brand-400 has-checked:bg-brand-50"
                >
                  <input
                    type="radio"
                    name="cycle"
                    value={c}
                    defaultChecked={c === "daily"}
                    className="h-4 w-4 accent-brand-500"
                  />
                  {ROUTINE_CYCLE_SHORT[c]}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="routine-note">メモ（任意）</label>
            <input
              id="routine-note"
              name="note"
              className="input"
              placeholder="例）返信もれが残っていないか"
            />
          </div>
          <button type="submit" className="btn-primary w-full">この業務を追加する</button>
        </form>
        <p className="text-[11px] text-ink-400 mt-2">
          ※ 追加・編集した内容はこの「ルーティン」タブにそのまま出ます（{today.slice(0, 4)}年以降もずっと使えます）。
        </p>
      </section>
    </>
  );
}

/** ルーティン業務マスタの入力欄（編集用） */
function RoutineFields({ routine }: { routine: ManagerRoutine }) {
  return (
    <form action={updateRoutineAction} className="mt-2 space-y-2">
      <input type="hidden" name="routine_id" value={routine.id} />
      <div>
        <label className="label !text-xs" htmlFor={`${routine.id}-title`}>やること</label>
        <input
          id={`${routine.id}-title`}
          name="title"
          defaultValue={routine.title}
          className="input !min-h-10 !py-2 text-sm"
          required
        />
      </div>
      <div>
        <label className="label !text-xs" htmlFor={`${routine.id}-note`}>メモ</label>
        <input
          id={`${routine.id}-note`}
          name="note"
          defaultValue={routine.note}
          className="input !min-h-10 !py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label !text-xs" htmlFor={`${routine.id}-cycle`}>頻度</label>
          <select
            id={`${routine.id}-cycle`}
            name="cycle"
            defaultValue={routine.cycle}
            className="input !min-h-10 !py-2 text-sm"
          >
            {ROUTINE_CYCLES.map((c) => (
              <option key={c} value={c}>
                {ROUTINE_CYCLE_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label !text-xs" htmlFor={`${routine.id}-sort`}>並び順</label>
          <input
            id={`${routine.id}-sort`}
            name="sort_order"
            type="number"
            min={0}
            step={10}
            defaultValue={routine.sortOrder}
            className="input !min-h-10 !py-2 text-sm"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs font-bold text-ink-600">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={routine.isActive}
          className="h-4 w-4 accent-brand-500"
        />
        運用中（外すと一覧から隠れます）
      </label>
      <button type="submit" className="btn-secondary w-full !min-h-10 !py-2 text-sm">この内容で更新</button>
    </form>
  );
}

/** 気づき1件のカード（日報の2項目＋確認チェック） */
function NoticeCard({
  report,
  staffNames,
  checked,
  checkedLabel,
}: {
  report: EniReport;
  staffNames: Map<string, string>;
  checked: boolean;
  checkedLabel?: string;
}) {
  const text = (key: string) =>
    typeof report.answers[key] === "string" ? (report.answers[key] as string).trim() : "";
  const notice = text("onsite_notice");
  const share = text("staff_share");

  return (
    <div className={`card ${checked ? "" : "border-brand-300"}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-ink-500">
            {formatDateJa(report.periodKey, true)} ／{" "}
            <span className="text-sm text-ink-900">{staffNames.get(report.staffId) ?? "（不明）"}</span>
          </p>
          {notice && (
            <div className="mt-2">
              <p className="text-[11px] font-bold text-brand-700">現場での気づき</p>
              <p className="text-sm text-ink-800 whitespace-pre-wrap mt-0.5">{notice}</p>
            </div>
          )}
          {share && (
            <div className="mt-2">
              <p className="text-[11px] font-bold text-brand-700">スタッフへの指導・共有したこと</p>
              <p className="text-sm text-ink-800 whitespace-pre-wrap mt-0.5">{share}</p>
            </div>
          )}
          {checkedLabel && <p className="text-[11px] text-emerald-600 font-bold mt-2">{checkedLabel}</p>}
        </div>
        <form action={toggleNoticeCheckAction} className="shrink-0">
          <input type="hidden" name="report_id" value={report.id} />
          <input type="hidden" name="checked" value={checked ? "0" : "1"} />
          <button
            type="submit"
            aria-label={checked ? "確認済みを取り消す" : "確認済みにする"}
            className={`flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-2 text-[11px] font-bold transition-colors ${
              checked
                ? "border-emerald-300 bg-emerald-50 text-emerald-600"
                : "border-ink-300 bg-white text-ink-500 hover:border-brand-400 hover:text-brand-700"
            }`}
          >
            <Icon name="checkCircle" className="w-5 h-5" />
            {checked ? "確認済み" : "確認した"}
          </button>
        </form>
      </div>
    </div>
  );
}
