// タスク管理の共通部品（タスク画面・幹部画面で共用）。
// チェックはサーバーアクションのフォーム送信で行う（JS不要・スマホでも確実に動く）。

import Link from "next/link";
import { Icon } from "@/components/icons";
import { StatusBadge } from "@/components/ui";
import { repeatLabel } from "@/lib/tasks";
import { formatDateJa, weekdayJa } from "@/lib/date";
import type { StaffTask } from "@/lib/data/types";
import {
  deleteTaskAction,
  setTaskStatusAction,
  toggleTaskDoneAction,
} from "@/app/staff/tasks/actions";

/** 丸いチェックボタン（押すと完了／取り消しが切り替わる） */
export function TaskCheckButton({
  taskId,
  date,
  done,
  back,
}: {
  taskId: string;
  date: string;
  done: boolean;
  back: string;
}) {
  return (
    <form action={toggleTaskDoneAction} className="shrink-0">
      <input type="hidden" name="task_id" value={taskId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="done" value={done ? "0" : "1"} />
      <input type="hidden" name="back" value={back} />
      <button
        type="submit"
        aria-label={done ? "完了を取り消す" : "完了にする"}
        className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${
          done
            ? "bg-emerald-500 border-emerald-500 text-white"
            : "bg-white border-ink-300 text-transparent hover:border-brand-400"
        }`}
      >
        <Icon name="checkCircle" className="w-4 h-4" />
      </button>
    </form>
  );
}

/** タスク1行の表示（チェック＋タイトル＋補足チップ） */
export function TaskRow({
  task,
  today,
  done,
  back,
  staffNames,
  showAssignee = false,
  showCreator = false,
  canDelete = false,
  statusControl = false,
}: {
  task: StaffTask;
  today: string;
  /** 表示上の完了（繰り返し＝今日完了済み／単発＝status done） */
  done: boolean;
  back: string;
  staffNames: Map<string, string>;
  /** 担当者名を出す（幹部のメンバー別一覧など） */
  showAssignee?: boolean;
  /** 依頼者名を出す（受けた依頼） */
  showCreator?: boolean;
  canDelete?: boolean;
  /** 単発タスクの「進行中」切り替えを出す */
  statusControl?: boolean;
}) {
  const overdue = !task.repeat && task.status !== "done" && task.dueDate && task.dueDate < today;
  const dueToday = !task.repeat && task.status !== "done" && task.dueDate === today;

  return (
    <div
      className={`rounded-xl border p-3 flex items-start gap-3 ${
        overdue
          ? "border-red-300 bg-red-50/60"
          : dueToday
            ? "border-amber-300 bg-amber-50/60"
            : "border-ink-200 bg-white"
      }`}
    >
      <div className="pt-0.5">
        <TaskCheckButton taskId={task.id} date={today} done={done} back={back} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold leading-snug ${done ? "text-ink-400 line-through" : "text-ink-900"}`}>
          {task.title}
        </p>
        {task.note && <p className="text-xs text-ink-500 mt-0.5 whitespace-pre-wrap">{task.note}</p>}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5 text-[11px] font-bold">
          {task.repeat && (
            <span className="inline-flex items-center gap-1 text-brand-700">
              <Icon name="repeat" className="w-3 h-3" />
              {repeatLabel(task)}
            </span>
          )}
          {!task.repeat && task.dueDate && (
            <span className={overdue ? "text-red-600" : dueToday ? "text-amber-700" : "text-ink-500"}>
              期限 {formatDateJa(task.dueDate)}
              {overdue ? "（期限切れ）" : dueToday ? "（今日まで）" : ""}
            </span>
          )}
          {showAssignee && (
            <span className="text-ink-500">
              担当：{staffNames.get(task.assigneeStaffId) ?? "（不明）"}
            </span>
          )}
          {showCreator && task.createdBy !== task.assigneeStaffId && (
            <span className="text-ink-500">
              依頼：{staffNames.get(task.createdBy) ?? "（不明）"}さんから
            </span>
          )}
          {!task.repeat && task.status === "in_progress" && (
            <StatusBadge label="進行中" tone="pending" />
          )}
          {overdue && <StatusBadge label="要対応" tone="danger" />}
        </div>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1.5">
        {statusControl && !task.repeat && task.status !== "done" && (
          <form action={setTaskStatusAction}>
            <input type="hidden" name="task_id" value={task.id} />
            <input type="hidden" name="back" value={back} />
            <input
              type="hidden"
              name="status"
              value={task.status === "in_progress" ? "open" : "in_progress"}
            />
            <button
              type="submit"
              className="text-[11px] font-bold text-brand-700 underline whitespace-nowrap"
            >
              {task.status === "in_progress" ? "未着手に戻す" : "進行中にする"}
            </button>
          </form>
        )}
        {canDelete && (
          <form action={deleteTaskAction}>
            <input type="hidden" name="task_id" value={task.id} />
            <input type="hidden" name="back" value={back} />
            <button type="submit" className="text-[11px] font-bold text-ink-400 underline whitespace-nowrap">
              削除
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/** 会社のタスク（未提出の日報など、他の画面で完了させる項目）への案内行 */
export function CompanyTaskLink({
  href,
  label,
  detail,
}: {
  href: string;
  label: string;
  detail?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50/70 p-3 transition-colors hover:bg-amber-50"
    >
      <span className="w-7 h-7 shrink-0 rounded-full bg-white border-2 border-amber-300 flex items-center justify-center text-amber-500">
        <Icon name="alertTriangle" className="w-3.5 h-3.5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-ink-900">{label}</span>
        {detail && <span className="block text-xs text-ink-500 mt-0.5">{detail}</span>}
      </span>
      <Icon name="chevronRight" className="w-4 h-4 shrink-0 text-amber-400" />
    </Link>
  );
}

/** 繰り返し設定の入力（作成フォームで共用。JSなしで動くよう常時表示） */
export function RepeatFields({ idPrefix }: { idPrefix: string }) {
  return (
    <div className="space-y-2">
      <div>
        <label className="label" htmlFor={`${idPrefix}-repeat`}>
          繰り返し
        </label>
        <select id={`${idPrefix}-repeat`} name="repeat" className="input" defaultValue="">
          <option value="">なし（1回だけ）</option>
          <option value="daily">毎日</option>
          <option value="weekly">毎週（下の曜日）</option>
          <option value="monthly">毎月（下の日にち）</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[0, 1, 2, 3, 4, 5, 6].map((wd) => (
          <label
            key={wd}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-2.5 py-1.5 text-xs font-bold text-ink-600 has-checked:border-brand-400 has-checked:bg-brand-50 has-checked:text-brand-800"
          >
            <input
              type="checkbox"
              name="repeat_weekdays"
              value={wd}
              className="h-3.5 w-3.5 accent-brand-500"
            />
            {weekdayJa(wd)}
          </label>
        ))}
        <div className="relative">
          <input
            type="number"
            name="repeat_monthday"
            min={1}
            max={31}
            placeholder="毎月の日にち"
            className="input !py-1.5 !text-xs w-28 text-right pr-7"
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-400">
            日
          </span>
        </div>
      </div>
      <p className="hint">「毎週」は曜日にチェック、「毎月」は日にちを入力してください。</p>
    </div>
  );
}
