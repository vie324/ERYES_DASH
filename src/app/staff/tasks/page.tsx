import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { getBrand } from "@/lib/brand";
import { formatDateJa, monthRange, todayJst, weekStartOf } from "@/lib/date";
import { defaultDayoffTargetMonth, dayoffDeadline, isDayoffEditable } from "@/lib/schedule";
import { getMyTaskSummary, isTaskActionable, isTaskDueOn } from "@/lib/tasks";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { CompanyTaskLink, RepeatFields, TaskCheckButton, TaskRow } from "@/components/task-ui";
import {
  createRequestTaskAction,
  createRoutineTaskAction,
  toggleCompanyMeetingTaskAction,
} from "./actions";

const BACK = "/staff/tasks";

// タスク：3種類（自分で決めたルーティン／依頼されたタスク／会社のタスク）をここで追い切る。
// 会社のタスク（日報・週報・議事録・希望休など）は既存の提出状況から自動で出す。
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

  // 会社のタスク（自動）：ブランドごとの提出物＋議事録
  const dayoffTarget = defaultDayoffTargetMonth(today);
  const dayoffEditable = isDayoffEditable(dayoffTarget, today);
  const [
    summary,
    sentRequests,
    openMeetingTasks,
    staffList,
    myDayoffs,
    todayEyesReport,
    todayStylistReport,
    thisWeekReport,
    todayPlan,
    missingMinutes,
  ] = await Promise.all([
    getMyTaskSummary(db, session.staffId, today),
    db.listStaffTasks({ kind: "request", createdBy: session.staffId, includeDone: true }),
    db.listOpenMeetingTasks(),
    db.listStaff(),
    dayoffEditable
      ? db.listDayoffRequests({ staffId: session.staffId, ...monthRange(dayoffTarget) })
      : Promise.resolve([]),
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
  const activeStaff = staffList.filter((s) => s.isActive && s.id !== session.staffId);

  // 自分の担当タスクを種類ごとに分ける
  const myTasks = summary.tasks;
  const doneToday = summary.doneTodayIds;
  const routines = myTasks.filter((t) => t.kind === "routine");
  const receivedRequests = myTasks.filter((t) => t.kind === "request");
  const myExecTasks = myTasks.filter((t) => t.kind === "exec");
  const actionable = myTasks.filter((t) => isTaskActionable(t, today, doneToday));

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
    companyLinks.push({ href: "/staff/morning", label: "今日のスケジュールが未入力です", detail: "会社のタスク" });
  }
  if (myMissingMinutes.length > 0) {
    companyLinks.push({
      href: "/staff/meetings",
      label: `議事録が未提出のミーティングが ${myMissingMinutes.length} 件あります`,
      detail: "会社のタスク",
    });
  }
  if (dayoffEditable && myDayoffs.length === 0) {
    companyLinks.push({
      href: "/staff/schedule/dayoff",
      label: `${Number(dayoffTarget.slice(5))}月の希望休が未提出です`,
      detail: `締切：${formatDateJa(dayoffDeadline(dayoffTarget), true)}`,
    });
  }

  const todoCount = companyLinks.length + myMeetingTasks.length + actionable.length;

  return (
    <div className="page-narrow">
      <PageHeader
        title="タスク"
        backHref="/staff"
        description="ルーティン・依頼されたタスク・会社のタスクをここで追い切ります"
        icon="listTodo"
      />

      {params.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          {params.saved === "request" ? "タスクを依頼しました" : "タスクを登録しました"}
        </p>
      )}
      {params.error && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          {params.error === "forbidden" ? "この操作の権限がありません" : "入力内容を確認してください"}
        </p>
      )}

      {/* ---- 今日のやること ---- */}
      <section className="card mb-4">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="section-title !mb-0 flex-1">今日のやること</h2>
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
                <button
                  type="submit"
                  aria-label="完了にする"
                  className="w-7 h-7 rounded-full border-2 bg-white border-ink-300 text-transparent hover:border-brand-400 flex items-center justify-center"
                >
                  <Icon name="checkCircle" className="w-4 h-4" />
                </button>
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
              statusControl
            />
          ))}
          {todoCount === 0 && (
            <EmptyState message="今日のやることはすべて完了しています。おつかれさまです！" />
          )}
        </div>
      </section>

      {/* ---- ルーティン ---- */}
      <section className="card mb-4">
        <h2 className="section-title">自分で決めたルーティン</h2>
        <div className="space-y-2">
          {routines.length === 0 && (
            <p className="text-sm text-ink-500">
              まだありません。下のフォームから毎日・毎週のルーティンを登録できます。
            </p>
          )}
          {routines.map((t) => (
            <div key={t.id} className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <TaskRow
                  task={t}
                  today={today}
                  done={t.repeat ? doneToday.has(t.id) : t.status === "done"}
                  back={BACK}
                  staffNames={staffNames}
                  canDelete
                />
              </div>
            </div>
          ))}
          {routines.some((t) => t.repeat && !isTaskDueOn(t, today)) && (
            <p className="hint">今日が実施日でないルーティンもチェックできます（前倒しでやった記録になります）。</p>
          )}
        </div>

        <details className="mt-3 rounded-xl border border-brand-100 bg-brand-50/40 px-3.5 py-2.5 group">
          <summary className="text-sm font-bold text-brand-700 cursor-pointer list-none flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="plus" className="w-4 h-4" />
              ルーティン・自分のタスクを追加
            </span>
            <span className="text-brand-400 transition-transform group-open:rotate-180">▾</span>
          </summary>
          <form action={createRoutineTaskAction} className="mt-3 space-y-3">
            <input type="hidden" name="back" value={BACK} />
            <div>
              <label className="label" htmlFor="routine-title">
                やること
              </label>
              <input
                id="routine-title"
                name="title"
                className="input"
                placeholder="例）インスタのストーリーを1本投稿"
                required
              />
            </div>
            <RepeatFields idPrefix="routine" />
            <div>
              <label className="label" htmlFor="routine-due">
                期限（繰り返しなしのときだけ・任意）
              </label>
              <input id="routine-due" name="due_date" type="date" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="routine-note">
                メモ（任意）
              </label>
              <input id="routine-note" name="note" className="input" placeholder="補足があれば" />
            </div>
            <button type="submit" className="btn-primary w-full">
              登録する
            </button>
          </form>
        </details>
      </section>

      {/* ---- 依頼 ---- */}
      <section className="card mb-4">
        <h2 className="section-title">依頼されたタスク</h2>
        <div className="space-y-2">
          {receivedRequests.length === 0 ? (
            <p className="text-sm text-ink-500">いま依頼されているタスクはありません。</p>
          ) : (
            receivedRequests.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                today={today}
                done={false}
                back={BACK}
                staffNames={staffNames}
                showCreator
                statusControl
              />
            ))
          )}
        </div>

        <h2 className="section-title mt-5">自分が依頼したタスク</h2>
        <div className="space-y-2">
          {sentRequests.filter((t) => t.assigneeStaffId !== session.staffId).length === 0 ? (
            <p className="text-sm text-ink-500">まだ依頼はありません。</p>
          ) : (
            sentRequests
              .filter((t) => t.assigneeStaffId !== session.staffId)
              .slice(0, 20)
              .map((t) => (
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

        <details className="mt-3 rounded-xl border border-brand-100 bg-brand-50/40 px-3.5 py-2.5 group">
          <summary className="text-sm font-bold text-brand-700 cursor-pointer list-none flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="send" className="w-4 h-4" />
              タスクを依頼する
            </span>
            <span className="text-brand-400 transition-transform group-open:rotate-180">▾</span>
          </summary>
          <form action={createRequestTaskAction} className="mt-3 space-y-3">
            <input type="hidden" name="back" value={BACK} />
            <div>
              <label className="label" htmlFor="request-assignee">
                誰に
              </label>
              <select id="request-assignee" name="assignee" className="input" required defaultValue="">
                <option value="" disabled>
                  選んでください
                </option>
                {activeStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="request-title">
                何を
              </label>
              <input
                id="request-title"
                name="title"
                className="input"
                placeholder="例）来月のポップを作成"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="request-due">
                いつまでに（任意）
              </label>
              <input id="request-due" name="due_date" type="date" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="request-note">
                メモ（任意）
              </label>
              <input id="request-note" name="note" className="input" placeholder="補足・参考リンクなど" />
            </div>
            <button type="submit" className="btn-primary w-full">
              この内容で依頼する
            </button>
          </form>
        </details>
      </section>

      {/* ---- 幹部タスク（自分の担当分） ---- */}
      {myExecTasks.length > 0 && (
        <section className="card mb-4">
          <h2 className="section-title">幹部タスク（自分の担当）</h2>
          <div className="space-y-2">
            {myExecTasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                today={today}
                done={t.repeat ? doneToday.has(t.id) : false}
                back={BACK}
                staffNames={staffNames}
                showCreator
                statusControl
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
