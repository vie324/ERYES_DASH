import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isExecutive } from "@/lib/eni/access";
import { addDays, formatDateJa, formatDateTimeJa, todayJst } from "@/lib/date";
import { hasExecNotice, isTaskActionable, isTaskDueOn } from "@/lib/tasks";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { RepeatFields, TaskRow } from "@/components/task-ui";
import { createExecTaskAction } from "@/app/staff/tasks/actions";
import { toggleNoticeCheckAction } from "./actions";
import type { EniReport, StaffTask } from "@/lib/data/types";

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
  const tab = params.tab === "notices" ? "notices" : "tasks";
  const db = getDataStore();
  const today = todayJst();

  const [execTasks, staffList, noticeReportsAll, completionsToday] = await Promise.all([
    db.listStaffTasks({ kind: "exec", includeDone: true }),
    db.listStaff(),
    db.listEniReports("stylist", { from: addDays(today, -30), to: today }),
    db.listTaskCompletions({ from: today, to: today }),
  ]);
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
        description="幹部タスクの進捗と、日報の気づき・共有事項の確認"
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

      {/* タブ */}
      <div className="flex gap-1.5 mb-4">
        <a
          href="/staff/exec?tab=tasks"
          className={`chip flex-1 justify-center !text-sm !py-2 ${tab === "tasks" ? "chip-active" : ""}`}
        >
          幹部タスク（{openTasks.length}）
        </a>
        <a
          href="/staff/exec?tab=notices"
          className={`chip flex-1 justify-center !text-sm !py-2 ${tab === "notices" ? "chip-active" : ""}`}
        >
          日報の気づき（{unchecked.length}）
        </a>
      </div>

      {tab === "tasks" ? (
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
