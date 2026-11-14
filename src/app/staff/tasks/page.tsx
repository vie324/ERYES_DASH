import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { getBrand } from "@/lib/brand";
import { formatDateJa, todayJst, weekStartOf } from "@/lib/date";
import { getDayoffNotice } from "@/lib/shift/requests";
import { getMyTaskSummary, isTaskActionable, isTaskDueOn } from "@/lib/tasks";
import { TASK_FORM_ERROR_MESSAGE } from "@/lib/task-form";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { CompanyTaskLink, DailyItemRow, TaskRow } from "@/components/task-ui";
import { TaskCheckSubmit } from "@/components/task-check";
import { TaskCreateForm } from "@/components/task-create-form";
import { createTaskAction, toggleCompanyMeetingTaskAction } from "./actions";

const BACK = "/staff/tasks";

const SAVED_MESSAGE: Record<string, string> = {
  routine: "ルーティンを登録しました",
  task: "タスクを登録しました",
  request: "タスクを依頼しました",
};

// タスク：「ルーティン（くり返し）」と「タスク（1回きり）」をここで追い切る。
// 誰が決めたか（自分・人からの依頼・幹部）は小さな印で出し、会社ルールのタスク
// （日報・週報・議事録・希望休など）は既存の提出状況から自動で出す。
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const brand = (await getBrand()) ?? "eni";
  const db = getDataStore();
  const today = todayJst();
  const weekStart = weekStartOf(today);

  const me = await db.getStaff(session.staffId);
  const jobType = me?.jobType ?? "";

  // 会社のタスク（自動）：ブランドごとの提出物＋議事録＋希望休
  const [
    summary,
    sentRequests,
    openMeetingTasks,
    staffList,
    dayoffNotice,
    todayEyesReport,
    todayStylistReport,
    thisWeekReport,
    todayPlan,
    missingMinutes,
  ] = await Promise.all([
    getMyTaskSummary(db, session.staffId, today),
    db.listStaffTasks({ createdBy: session.staffId, includeDone: true }),
    db.listOpenMeetingTasks(),
    db.listStaff(),
    // 管理用アカウントには出さない（メニューの「！」・ホームのお知らせと同じ）
    session.role === "admin" ? Promise.resolve(null) : getDayoffNotice(db, session.staffId, today),
    brand === "eyes" ? db.getDailyReport(session.staffId, today) : Promise.resolve(null),
    brand === "eni" && jobType !== "assistant"
      ? db.getEniReport("stylist", session.staffId, today)
      : Promise.resolve(null),
    brand === "eni" && jobType !== "stylist"
      ? db.getEniReport("weekly", session.staffId, weekStart)
      : Promise.resolve(null),
    brand === "eni"
      ? db.listDailyPlans(today).then((p) => p.find((x) => x.staffId === session.staffId) ?? null)
      : Promise.resolve(null),
    brand === "eni" ? db.listMeetingsMissingMinutes(today) : Promise.resolve([]),
  ]);
  const staffNames = new Map(staffList.map((s) => [s.id, s.name]));
  const assigneeOptions = staffList
    .filter((s) => s.isActive && s.id !== session.staffId)
    .map((s) => ({ id: s.id, name: s.name }));

  // 自分が担当のものを、種類（ルーティン／タスク）で分ける
  const myTasks = summary.tasks;
  const doneToday = summary.doneTodayIds;
  const routines = myTasks.filter((t) => t.taskType === "routine");
  const oneOffTasks = myTasks.filter((t) => t.taskType === "task");
  const actionable = myTasks.filter((t) => isTaskActionable(t, today, doneToday));
  const dailyItems = summary.dailyItems;
  const dailyUndone = dailyItems.filter((s) => !s.done);
  // 自分が人に依頼したもの（自分担当は上の一覧に、幹部タスクは幹部メニューに出るので除く）
  const requestedToOthers = sentRequests.filter(
    (t) => t.kind === "request" && t.assigneeStaffId !== session.staffId
  );

  // 会社のタスク（未提出だけ出す）
  const myMissingMinutes = missingMinutes.filter(
    (m) => m.hostStaffId === session.staffId || m.createdBy === session.staffId
  );
  const myMeetingTasks = openMeetingTasks.filter((t) => t.assigneeStaffId === session.staffId);

  const companyLinks: { href: string; label: string; detail?: string }[] = [];
  if (brand === "eyes" && !todayEyesReport) {
    companyLinks.push({ href: "/staff/report", label: "今日の日報が未入力です", detail: "会社のタスク" });
  }
  if (brand === "eni" && jobType !== "assistant" && !todayStylistReport) {
    companyLinks.push({ href: "/staff/eni-report", label: "今日の日報（スタイリスト）が未入力です", detail: "会社のタスク" });
  }
  if (brand === "eni" && jobType !== "stylist" && !thisWeekReport) {
    companyLinks.push({ href: "/staff/weekly-report", label: "今週の週報が未入力です", detail: "会社のタスク" });
  }
  if (brand === "eni" && !todayPlan) {
    companyLinks.push({ href: "/staff/plan", label: "今日のスケジュールが未入力です", detail: "会社のタスク" });
  }
  if (myMissingMinutes.length > 0) {
    companyLinks.push({
      href: "/staff/meetings",
      label: `議事録が未提出のミーティングが ${myMissingMinutes.length} 件あります`,
      detail: "会社のタスク",
    });
  }
  if (dayoffNotice) {
    companyLinks.push({
      href: dayoffNotice.href,
      label: `${Number(dayoffNotice.month.slice(5))}月分の希望休が未提出です`,
      detail: `締切：${dayoffNotice.deadlineLabel}（${dayoffNotice.remaining}）`,
    });
  }

  const todoCount = companyLinks.length + myMeetingTasks.length + actionable.length + dailyUndone.length;
  const errorMessage = params.error ? (TASK_FORM_ERROR_MESSAGE[params.error] ?? TASK_FORM_ERROR_MESSAGE.input) : "";

  return (
    <div className="page-narrow">
      <PageHeader
        title="タスク"
        backHref="/staff"
        description="ルーティン（くり返し）とタスク（1回きり）、会社のタスクをここで追い切ります"
        icon="listTodo"
      />

      {params.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          {SAVED_MESSAGE[params.saved] ?? "登録しました"}
        </p>
      )}
      {errorMessage && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">{errorMessage}</p>
      )}

      {/* ---- 今日やること ---- */}
      <section className="card mb-4">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="section-title !mb-0 flex-1">今日やること</h2>
          {todoCount > 0 ? (
            <StatusBadge label={`残り ${todoCount} 件`} tone="warning" />
          ) : (
            <StatusBadge label="すべて完了" tone="ok" />
          )}
        </div>
        <div className="space-y-2">
          {companyLinks.map((link) => (
            <CompanyTaskLink key={link.href + link.label} {...link} />
          ))}
          {dailyUndone.map((status) => (
            <DailyItemRow key={status.routine.id} status={status} back={BACK} />
          ))}
          {myMeetingTasks.map((t) => (
            <div
              key={t.id}
              className={`rounded-xl border p-3 flex items-start gap-3 ${
                t.dueDate && t.dueDate < today ? "border-red-300 bg-red-50/60" : "border-ink-200 bg-white"
              }`}
            >
              <form action={toggleCompanyMeetingTaskAction} className="shrink-0 pt-0.5">
                <input type="hidden" name="task_id" value={t.id} />
                <input type="hidden" name="done" value="1" />
                <input type="hidden" name="back" value={BACK} />
                <TaskCheckSubmit done={false} label={`${t.title}を完了にする`} />
              </form>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-ink-900 leading-snug">{t.title}</p>
                <div className="flex flex-wrap gap-x-2.5 gap-y-1 mt-1 text-[11px] font-bold">
                  <span className="text-ink-500">議事録のタスク</span>
                  {t.dueDate && (
                    <span className={t.dueDate < today ? "text-red-600" : "text-ink-500"}>
                      期限 {formatDateJa(t.dueDate)}
                      {t.dueDate < today ? "（期限切れ）" : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {actionable.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              today={today}
              done={false}
              back={BACK}
              staffNames={staffNames}
              showCreator
              showKind
              statusControl
            />
          ))}
          {todoCount === 0 && (
            <EmptyState message="今日のやることはすべて完了しています。おつかれさまです！" />
          )}
        </div>
      </section>

      {/* ---- 追加（最初に「ルーティン」か「タスク」かを選ぶ） ---- */}
      <details className="card mb-4 group" open={Boolean(params.error)}>
        <summary className="cursor-pointer list-none flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-brand-700">
            <span className="w-7 h-7 rounded-full bg-brand-500 text-white flex items-center justify-center">
              <Icon name="plus" className="w-4 h-4" />
            </span>
            ルーティン・タスクを追加
          </span>
          <span className="text-brand-400 transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-4">
          <TaskCreateForm
            action={createTaskAction}
            back={BACK}
            idPrefix="new-task"
            meId={session.staffId}
            assignees={assigneeOptions}
          />
        </div>
      </details>

      {/* ---- スタイリストの毎日の業務（今日の分。完了したものも出す） ---- */}
      {dailyItems.length > 0 && (
        <section className="card mb-4">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="section-title !mb-0 flex-1">毎日の業務（スタイリスト）</h2>
            <StatusBadge
              label={`${dailyItems.length - dailyUndone.length}/${dailyItems.length} 完了`}
              tone={dailyUndone.length === 0 ? "ok" : "warning"}
            />
          </div>
          <p className="hint !mt-0 mb-3">全員に共通の業務です。項目は幹部メニューで管理しています。</p>
          <div className="space-y-2">
            {dailyItems.map((status) => (
              <DailyItemRow key={status.routine.id} status={status} back={BACK} />
            ))}
          </div>
        </section>
      )}

      {/* ---- ルーティン（くり返し） ---- */}
      <section className="card mb-4">
        <h2 className="section-title">ルーティン（くり返し）</h2>
        <div className="space-y-2">
          {routines.length === 0 && (
            <p className="text-sm text-ink-500">
              まだありません。「ルーティン・タスクを追加」から、毎日・毎週・毎月のルーティンを登録できます。
            </p>
          )}
          {routines.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              today={today}
              done={doneToday.has(t.id)}
              back={BACK}
              staffNames={staffNames}
              showCreator
              showKind
              canDelete={t.createdBy === session.staffId}
            />
          ))}
          {routines.some((t) => !isTaskDueOn(t, today)) && (
            <p className="hint">今日が実施日でないルーティンもチェックできます（前倒しでやった記録になります）。</p>
          )}
        </div>
      </section>

      {/* ---- タスク（1回きり） ---- */}
      <section className="card mb-4">
        <h2 className="section-title">タスク（1回きり）</h2>
        <div className="space-y-2">
          {oneOffTasks.length === 0 ? (
            <p className="text-sm text-ink-500">いま残っているタスクはありません。</p>
          ) : (
            oneOffTasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                today={today}
                done={false}
                back={BACK}
                staffNames={staffNames}
                showCreator
                showKind
                statusControl
                canDelete={t.createdBy === session.staffId}
              />
            ))
          )}
        </div>

        <h2 className="section-title mt-5">自分が依頼したタスク</h2>
        <div className="space-y-2">
          {requestedToOthers.length === 0 ? (
            <p className="text-sm text-ink-500">まだ依頼はありません。</p>
          ) : (
            requestedToOthers.slice(0, 20).map((t) => (
              <div
                key={t.id}
                className={`rounded-xl border p-3 ${
                  t.status === "done" ? "border-emerald-200 bg-emerald-50/50" : "border-ink-200"
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-bold ${t.status === "done" ? "text-ink-400 line-through" : "text-ink-900"}`}>
                    {t.title}
                  </span>
                  <span className="ml-auto">
                    {t.status === "done" ? (
                      <StatusBadge label="完了" tone="ok" />
                    ) : t.status === "in_progress" ? (
                      <StatusBadge label="進行中" tone="pending" />
                    ) : t.dueDate && t.dueDate < today ? (
                      <StatusBadge label="期限切れ" tone="danger" />
                    ) : (
                      <StatusBadge label="未着手" tone="muted" />
                    )}
                  </span>
                </div>
                <p className="text-xs text-ink-500 mt-1">
                  {staffNames.get(t.assigneeStaffId) ?? "（不明）"}さんへ
                  {t.dueDate && ` ／ 期限 ${formatDateJa(t.dueDate)}`}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
