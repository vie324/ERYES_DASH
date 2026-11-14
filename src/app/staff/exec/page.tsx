import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isExecutive } from "@/lib/eni/access";
import { BRAND_INFO, getBrand } from "@/lib/brand";
import { addDays, formatDateJa, formatDateTimeJa, formatMonthJa, formatWeekJa, todayJst } from "@/lib/date";
import { hasExecNotice, isTaskActionable, isTaskDueOn, isTaskOverdue } from "@/lib/tasks";
import { TASK_FORM_ERROR_MESSAGE } from "@/lib/task-form";
import { getExecValues } from "@/lib/settings";
import { brandStoreIds, shortStoreName } from "@/lib/shift/month";
import {
  ROUTINE_AUDIENCES,
  ROUTINE_AUDIENCE_LABEL,
  ROUTINE_AUDIENCE_NOTE,
  ROUTINE_AUDIENCE_SHORT,
  ROUTINE_CYCLES,
  ROUTINE_CYCLE_LABEL,
  ROUTINE_CYCLE_SHORT,
  buildRoutineStatuses,
  countUndone,
  currentPeriodKeys,
  defaultRoutineStoreId,
  type RoutineStatus,
} from "@/lib/eni/routines";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { TaskRow } from "@/components/task-ui";
import { TaskCreateForm } from "@/components/task-create-form";
import { createExecTaskAction } from "@/app/staff/tasks/actions";
import {
  createRoutineAction,
  deleteRoutineAction,
  toggleNoticeCheckAction,
  toggleRoutineAction,
  updateRoutineAction,
} from "./actions";
import type { EniReport, ManagerRoutine, RoutineCycle, Staff, StaffTask, Store } from "@/lib/data/types";

const BACK = "/staff/exec";

// 幹部メニュー：幹部と管理者だけが入れる（それ以外はURLを直接開いてもホームへ戻す）。
//  ・いちばん上 …… 「大切にすること」（文面は管理者がマスタ設定で編集）
//  ・幹部タスク …… 作成・進捗・繰り返し・メンバー別の未完了の追跡（期限切れはアラート表示）
//  ・ルーティン …… 店長・副店長の業務を店舗ごとにチェック／スタイリストの毎日の業務の状況とマスタ
//  ・日報の気づき … スタイリスト日報の「現場での気づき」「スタッフへの指導・共有」を確認して流す
export default async function ExecPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; store?: string; saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  if (!(await isExecutive(session))) redirect("/staff");

  const params = await searchParams;
  const tab =
    params.tab === "notices" ? "notices" : params.tab === "routines" ? "routines" : "tasks";
  const db = getDataStore();
  const today = todayJst();
  const brand = (await getBrand()) ?? "eni";

  const [execTasks, staffList, noticeReportsAll, completionsToday, routines, routineChecks, stores, execValues] =
    await Promise.all([
      db.listStaffTasks({ kind: "exec", includeDone: true }),
      db.listStaff(),
      db.listEniReports("stylist", { from: addDays(today, -30), to: today }),
      db.listTaskCompletions({ from: today, to: today }),
      db.listManagerRoutines(),
      db.listManagerRoutineChecks(currentPeriodKeys(today)),
      db.listStores(),
      getExecValues(db),
    ]);
  const me = staffList.find((s) => s.id === session.staffId) ?? null;

  // ルーティンは店舗ごと。いま選んでいる業態の店舗から選ぶ（最初は自分の店舗）
  const brandIds = new Set(brandStoreIds(stores, BRAND_INFO[brand].label));
  const routineStores = stores.filter((s) => brandIds.has(s.id));
  const storeId =
    params.store && routineStores.some((s) => s.id === params.store)
      ? params.store
      : defaultRoutineStoreId(me, routineStores);
  const store = routineStores.find((s) => s.id === storeId) ?? null;
  const execStatuses = buildRoutineStatuses(routines, routineChecks, today, { audience: "exec", subjectKey: storeId });
  const routineUndone = countUndone(execStatuses);
  const dailyUndone = countUndone(execStatuses, "daily");

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
  const overdue = openTasks.filter((t) => isTaskOverdue(t, today));
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

  const errorMessage = params.error
    ? params.error === "confirm"
      ? "削除するには確認のチェックを入れてください"
      : (TASK_FORM_ERROR_MESSAGE[params.error] ?? TASK_FORM_ERROR_MESSAGE.input)
    : "";

  return (
    <div className="page-narrow">
      <PageHeader
        title="幹部メニュー"
        backHref="/staff"
        description="大切にすること・幹部タスク・ルーティン業務・日報の気づき"
        icon="crown"
      />

      {/* 大切にすること（幹部メニューを開くと、いつもいちばん上に出る） */}
      <ExecValuesCard lines={execValues} canEdit={session.role === "admin"} />

      {params.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          {params.saved === "deleted" ? "削除しました" : "保存しました"}
        </p>
      )}
      {errorMessage && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">{errorMessage}</p>
      )}

      {/* 今日のルーティンが残っているときは、どのタブにいても知らせる */}
      {dailyUndone > 0 && tab !== "routines" && (
        <a
          href={`/staff/exec?tab=routines&store=${storeId}`}
          className="card !p-3.5 mb-4 flex items-center gap-2 border-red-300 bg-red-50"
        >
          <Icon name="alertTriangle" className="w-4 h-4 text-red-600 shrink-0" />
          <span className="flex-1 min-w-0 text-sm font-bold text-red-700">
            {store ? `${shortStoreName(store.name)}の` : ""}今日のルーティン業務が {dailyUndone} 件のこっています
          </span>
          <Icon name="chevronRight" className="w-4 h-4 text-red-400 shrink-0" />
        </a>
      )}

      {/* タブ */}
      <div className="segmented mb-4" role="tablist">
        {(
          [
            ["tasks", "幹部タスク", openTasks.length],
            ["routines", "ルーティン", routineUndone],
            ["notices", "日報の気づき", unchecked.length],
          ] as const
        ).map(([key, label, count]) => (
          <a
            key={key}
            role="tab"
            aria-selected={tab === key}
            href={key === "routines" ? `/staff/exec?tab=routines&store=${storeId}` : `/staff/exec?tab=${key}`}
            className={`segmented-item !py-2 ${tab === key ? "segmented-item-active" : ""}`}
          >
            <span className="block text-xs sm:text-sm font-bold">{label}</span>
            <span className="block text-[11px] opacity-70">{count}件</span>
          </a>
        ))}
      </div>

      {tab === "routines" ? (
        <RoutinesTab
          routines={routines}
          execStatuses={execStatuses}
          checks={routineChecks}
          today={today}
          staffList={staffList}
          staffNames={staffNames}
          stores={routineStores}
          storeId={storeId}
        />
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
                    done={t.taskType === "routine" ? doneTodayIds.has(t.id) : false}
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
                    const memberOverdue = tasks.filter((t) => isTaskOverdue(t, today)).length;
                    const todayDue = tasks.filter(
                      (t) => t.taskType === "routine" && isTaskDueOn(t, today) && !doneTodayIds.has(t.id)
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
                              done={t.taskType === "routine" ? doneTodayIds.has(t.id) : false}
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

          {/* 作成フォーム（最初に「ルーティン」か「タスク」かを選ぶ） */}
          <section className="card mb-4">
            <h2 className="section-title flex items-center gap-1.5">
              <Icon name="plus" className="w-4 h-4 text-brand-600" />
              幹部タスクを追加
            </h2>
            <TaskCreateForm
              action={createExecTaskAction}
              back={BACK}
              idPrefix="exec"
              meId={session.staffId}
              assignees={activeStaff.map((s) => ({ id: s.id, name: s.name }))}
              routineAssignable
              initialType="task"
              titlePlaceholder={{ routine: "例）月次の数字まとめを共有", task: "例）採用媒体の原稿を更新する" }}
            />
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

/** 「大切にすること」：幹部メニューのいちばん上に常に出す（1行＝1項目。文面はマスタ設定で編集） */
function ExecValuesCard({ lines, canEdit }: { lines: string[]; canEdit: boolean }) {
  if (lines.length === 0) return null;
  return (
    <section className="card mb-4 !p-0 overflow-hidden" aria-labelledby="exec-values-title">
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5 border-b border-brand-100 bg-brand-50/60">
        <Icon name="sparkles" className="w-4 h-4 text-brand-600 shrink-0" />
        <h2 id="exec-values-title" className="flex-1 text-sm font-bold text-ink-800">
          大切にすること
        </h2>
        {canEdit && (
          <Link href="/admin/settings#exec_values" className="text-[11px] font-bold text-brand-700 underline">
            編集する
          </Link>
        )}
      </div>
      <ol className="divide-y divide-brand-100">
        {lines.map((line, i) => (
          <li key={i} className="flex gap-3 px-4 py-2.5">
            <span className="shrink-0 w-5 h-5 mt-0.5 rounded-full bg-brand-100 text-brand-700 text-[11px] font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <span className="text-sm leading-relaxed text-ink-800">{line}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** その周期の「今どの期間の分か」を日本語で出す */
function periodLabel(cycle: RoutineCycle, periodKey: string): string {
  return cycle === "daily"
    ? formatDateJa(periodKey, true)
    : cycle === "weekly"
      ? formatWeekJa(periodKey)
      : formatMonthJa(periodKey);
}

/**
 * ルーティン業務。
 *  ・幹部（店長・副店長）の業務 …… 店舗ごとに「今の期間ぶん」をチェックしていく（その店舗の誰かがやればよい）
 *  ・スタイリストの毎日の業務 …… 一人ひとりがタスク画面でチェックする。ここでは店舗のスタイリストの状況を見る
 * 項目（マスタ）は全店舗共通で、この画面から追加・編集・停止できる（管理者・幹部）。
 */
function RoutinesTab({
  routines,
  execStatuses,
  checks,
  today,
  staffList,
  staffNames,
  stores,
  storeId,
}: {
  routines: ManagerRoutine[];
  execStatuses: RoutineStatus[];
  checks: Parameters<typeof buildRoutineStatuses>[1];
  today: string;
  staffList: Staff[];
  staffNames: Map<string, string>;
  stores: Store[];
  storeId: string;
}) {
  const store = stores.find((s) => s.id === storeId) ?? null;
  const byCycle = (cycle: RoutineCycle) => execStatuses.filter((s) => s.routine.cycle === cycle);
  // この店舗のスタイリスト（毎日の業務の状況を一人ずつ出す）
  const stylists = staffList.filter((s) => s.isActive && s.jobType === "stylist" && s.storeId === storeId);
  const stylistRoutines = routines.filter((r) => r.isActive && r.audience === "stylist");
  const stylistStatuses = stylists.map((s) => ({
    staff: s,
    statuses: buildRoutineStatuses(routines, checks, today, { audience: "stylist", subjectKey: s.id }),
  }));
  const stopped = routines.filter((r) => !r.isActive);

  return (
    <>
      {/* 店舗の切り替え（店舗ごとにチェックする） */}
      {stores.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto scroll-slim -mx-1 px-1 pb-1 mb-3">
          {stores.map((s) => (
            <a
              key={s.id}
              href={`/staff/exec?tab=routines&store=${s.id}`}
              className={`chip shrink-0 ${s.id === storeId ? "chip-active" : ""}`}
            >
              {shortStoreName(s.name)}
            </a>
          ))}
        </div>
      )}

      <p className="text-xs text-ink-500 mb-3">
        {store ? `${shortStoreName(store.name)}の` : ""}店長・副店長の業務です。終わったらチェックしてください
        （店舗ごとに記録します。その店舗の幹部の誰かがやれば完了です）。
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
                      <input type="hidden" name="store_id" value={storeId} />
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
                  <RoutineEditor routine={routine} storeId={storeId} />
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {execStatuses.length === 0 && (
        <EmptyState message="店長・副店長の業務がまだ登録されていません。下から追加してください" />
      )}

      {/* スタイリストの毎日の業務（一人ひとりがタスク画面でチェックする） */}
      <section className="card mb-4">
        <h2 className="section-title">スタイリストの毎日の業務</h2>
        <p className="text-xs text-ink-500 mb-3">
          {ROUTINE_AUDIENCE_NOTE.stylist}。ここでは{store ? `${shortStoreName(store.name)}の` : ""}スタイリストの今日の状況を見られます。
        </p>
        {stylistRoutines.length === 0 ? (
          <p className="text-sm text-ink-500">まだ登録されていません。下の「業務を追加」で「スタイリスト」を選んで追加できます。</p>
        ) : (
          <>
            {stylistStatuses.length > 0 ? (
              <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100 mb-3">
                {stylistStatuses.map(({ staff, statuses }) => {
                  const done = statuses.filter((s) => s.done).length;
                  return (
                    <li key={staff.id} className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-sm font-bold text-ink-800">{staff.name}</span>
                        <StatusBadge
                          label={`${done}/${statuses.length}`}
                          tone={done === statuses.length ? "ok" : "warning"}
                        />
                      </div>
                      <p className="text-[11px] text-ink-500 mt-1">
                        {statuses.map((s) => `${s.done ? "✓" : "・"}${s.routine.title}`).join("　")}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-ink-400 mb-3">この店舗にスタイリストが登録されていません。</p>
            )}
            <div className="space-y-2">
              {stylistRoutines.map((routine) => (
                <div key={routine.id} className="rounded-xl border border-ink-200 p-3">
                  <p className="text-sm font-bold text-ink-900">
                    {routine.title}
                    <span className="ml-2 text-[11px] text-brand-700">{ROUTINE_CYCLE_SHORT[routine.cycle]}</span>
                  </p>
                  {routine.note && <p className="text-xs text-ink-500 mt-0.5">{routine.note}</p>}
                  <RoutineEditor routine={routine} storeId={storeId} />
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* 止めている業務（運用中に戻すとき用） */}
      {stopped.length > 0 && (
        <details className="card mb-4 group">
          <summary className="cursor-pointer list-none text-sm font-bold text-ink-500 flex items-center justify-between">
            止めている業務（{stopped.length}件）
            <span className="text-ink-300 transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="space-y-2 mt-3">
            {stopped.map((routine) => (
              <div key={routine.id} className="rounded-xl border border-ink-200 bg-ink-50/60 p-3">
                <p className="text-sm font-bold text-ink-500">
                  {routine.title}
                  <span className="ml-2 text-[11px]">
                    {ROUTINE_AUDIENCE_LABEL[routine.audience]}・{ROUTINE_CYCLE_SHORT[routine.cycle]}
                  </span>
                </p>
                <RoutineEditor routine={routine} storeId={storeId} />
              </div>
            ))}
          </div>
        </details>
      )}

      {/* 追加 */}
      <section className="card">
        <h2 className="section-title flex items-center gap-1.5">
          <Icon name="plus" className="w-4 h-4 text-brand-600" />
          業務を追加
        </h2>
        <form action={createRoutineAction} className="space-y-3">
          <input type="hidden" name="store_id" value={storeId} />
          <div>
            <p className="label !mb-2">だれの業務か</p>
            <p className="hint !mt-0 mb-2">幹部＝店長・副店長（店舗ごとに1つチェック）／スタイリスト＝一人ひとりがチェック</p>
            <div className="grid grid-cols-2 gap-2">
              {ROUTINE_AUDIENCES.map((a) => (
                <label
                  key={a}
                  className="flex items-center justify-center gap-2 rounded-xl border border-ink-200 px-3 py-2.5 text-sm font-bold has-checked:border-brand-400 has-checked:bg-brand-50"
                >
                  <input
                    type="radio"
                    name="audience"
                    value={a}
                    defaultChecked={a === "exec"}
                    className="h-4 w-4 accent-brand-500"
                  />
                  {ROUTINE_AUDIENCE_SHORT[a]}
                </label>
              ))}
            </div>
          </div>
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
          ※ 項目は全店舗に共通です。追加すると、すべての店舗（スタイリストの業務はスタイリスト全員）に出ます。
        </p>
      </section>
    </>
  );
}

/** 業務マスタの編集（内容・対象・周期・並び順・運用中/停止・削除）。管理者・幹部が使う */
function RoutineEditor({ routine, storeId }: { routine: ManagerRoutine; storeId: string }) {
  return (
    <details className="mt-2 pt-2 border-t border-ink-100">
      <summary className="cursor-pointer text-[11px] font-bold text-ink-400">この業務の内容を編集する</summary>
      <form action={updateRoutineAction} className="mt-2 space-y-2">
        <input type="hidden" name="routine_id" value={routine.id} />
        <input type="hidden" name="store_id" value={storeId} />
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
            <label className="label !text-xs" htmlFor={`${routine.id}-audience`}>だれの業務か</label>
            <select
              id={`${routine.id}-audience`}
              name="audience"
              defaultValue={routine.audience}
              className="input !min-h-10 !py-2 text-sm"
            >
              {ROUTINE_AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {ROUTINE_AUDIENCE_LABEL[a]}
                </option>
              ))}
            </select>
          </div>
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
        <label className="flex items-center gap-2 text-xs font-bold text-ink-600">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={routine.isActive}
            className="h-4 w-4 accent-brand-500"
          />
          運用中（外すと止まり、一覧から隠れます。「止めている業務」から戻せます）
        </label>
        <button type="submit" className="btn-secondary w-full !min-h-10 !py-2 text-sm">この内容で更新</button>
      </form>
      <form action={deleteRoutineAction} className="mt-2 pt-2 border-t border-red-100 space-y-2">
        <input type="hidden" name="routine_id" value={routine.id} />
        <input type="hidden" name="store_id" value={storeId} />
        <label className="flex items-center gap-2 text-xs font-bold text-red-600">
          <input type="checkbox" name="confirm" className="h-4 w-4 accent-red-500" />
          この業務を削除する（これまでの記録も消えます。止めるだけなら上の「運用中」を外してください）
        </label>
        <button type="submit" className="btn-danger w-full">削除</button>
      </form>
    </details>
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
