"use client";

// タスクの登録フォーム（タスク画面・幹部メニューで共用）。
// 最初に「ルーティン」か「タスク（1回きり）」かを選び、その種類に要る項目だけを出す。
//  ・ルーティン …… くり返し（毎日／毎週◯曜日／毎月◯日）。該当日に「今日やること」に出て、日ごとに完了をつける
//  ・タスク ……… 期限と担当者を決める。完了したら終わり（ほかの人を選ぶと依頼になり、通知が届く）
// 送信先はサーバーアクション（呼び出し側で渡す）。入力の確認はサーバー側でも必ず行う（lib/task-form.ts）。

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { TaskType } from "@/lib/data/types";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

type RepeatChoice = "daily" | "weekly" | "monthly";

export interface AssigneeOption {
  id: string;
  name: string;
}

export function TaskCreateForm({
  action,
  back,
  idPrefix,
  meId,
  assignees,
  routineAssignable = false,
  initialType = "routine",
  titlePlaceholder,
}: {
  action: (formData: FormData) => Promise<void>;
  back: string;
  idPrefix: string;
  /** 自分のスタッフID（担当の初期値。「自分」と表示する） */
  meId: string;
  /** 担当者の候補（自分は含めなくてよい。先頭に「自分」を足す） */
  assignees: AssigneeOption[];
  /** ルーティンも担当者を選べるか（幹部タスク）。false なら自分のルーティンだけ */
  routineAssignable?: boolean;
  initialType?: TaskType;
  titlePlaceholder?: { routine: string; task: string };
}) {
  const [taskType, setTaskType] = useState<TaskType>(initialType);
  const [repeat, setRepeat] = useState<RepeatChoice>("daily");
  const [assignee, setAssignee] = useState(meId);
  const others = assignees.filter((a) => a.id !== meId);
  const showAssignee = taskType === "task" || routineAssignable;
  const isRequest = taskType === "task" && assignee !== meId;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="task_type" value={taskType} />

      {/* 種類（最初に選ぶ） */}
      <div>
        <p className="label !mb-2">種類</p>
        <div className="segmented" role="radiogroup" aria-label="種類">
          {(
            [
              ["routine", "ルーティン", "くり返し"],
              ["task", "タスク", "1回きり"],
            ] as const
          ).map(([value, label, sub]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={taskType === value}
              onClick={() => setTaskType(value)}
              className={`segmented-item ${taskType === value ? "segmented-item-active" : ""}`}
            >
              <span className="block text-sm font-bold">{label}</span>
              <span className="block text-[11px] opacity-70">{sub}</span>
            </button>
          ))}
        </div>
        <p className="hint">
          {taskType === "routine"
            ? "くり返す日に「今日やること」に出て、その日ごとに完了をつけます。"
            : "期限と担当者を決めます。完了したら終わりです。"}
        </p>
      </div>

      <div>
        <label className="label" htmlFor={`${idPrefix}-title`}>
          やること
        </label>
        <input
          id={`${idPrefix}-title`}
          name="title"
          className="input"
          maxLength={100}
          placeholder={
            taskType === "routine"
              ? (titlePlaceholder?.routine ?? "例）インスタのストーリーを1本投稿")
              : (titlePlaceholder?.task ?? "例）来月のポップを作成")
          }
          required
        />
      </div>

      {/* key で種類ごとに作り直す（同じ位置の入力欄が使い回されて値が混ざらないように） */}
      {taskType === "routine" ? (
        <div key="routine-fields">
          <p className="label !mb-2">くり返し</p>
          <input type="hidden" name="repeat" value={repeat} />
          <div className="segmented" role="radiogroup" aria-label="くり返し">
            {(
              [
                ["daily", "毎日"],
                ["weekly", "毎週"],
                ["monthly", "毎月"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={repeat === value}
                onClick={() => setRepeat(value)}
                className={`segmented-item !py-2 ${repeat === value ? "segmented-item-active" : ""}`}
              >
                <span className="text-sm font-bold">{label}</span>
              </button>
            ))}
          </div>
          {repeat === "weekly" && (
            <div className="mt-3">
              <p className="text-xs font-bold text-ink-500 mb-1.5">曜日（複数選べます）</p>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((label, wd) => (
                  <label
                    key={wd}
                    className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-ink-200 text-sm font-bold text-ink-600 has-checked:border-brand-500 has-checked:bg-brand-500 has-checked:text-white"
                  >
                    <input type="checkbox" name="repeat_weekdays" value={wd} className="sr-only" />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}
          {repeat === "monthly" && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm font-bold text-ink-600">毎月</span>
              <select
                name="repeat_monthday"
                defaultValue="1"
                className="input !w-24 !min-h-10 !py-1.5 text-center"
                aria-label="毎月の日にち"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <span className="text-sm font-bold text-ink-600">日</span>
              <span className="hint !mt-0">（月末より後の日は月末に）</span>
            </div>
          )}
        </div>
      ) : (
        <div key="task-fields">
          <label className="label" htmlFor={`${idPrefix}-due`}>
            期限
          </label>
          <input id={`${idPrefix}-due`} name="due_date" type="date" className="input" required />
        </div>
      )}

      {showAssignee ? (
        <div>
          <label className="label" htmlFor={`${idPrefix}-assignee`}>
            担当
          </label>
          <select
            id={`${idPrefix}-assignee`}
            name="assignee"
            className="input"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value={meId}>自分</option>
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {isRequest && <p className="hint">依頼として登録され、担当の人に通知が届きます。</p>}
        </div>
      ) : (
        <input type="hidden" name="assignee" value={meId} />
      )}

      <div>
        <label className="label" htmlFor={`${idPrefix}-note`}>
          メモ（任意）
        </label>
        <input id={`${idPrefix}-note`} name="note" className="input" maxLength={500} placeholder="補足・参考リンクなど" />
      </div>

      <SubmitButton label={taskType === "routine" ? "ルーティンを登録する" : isRequest ? "この内容で依頼する" : "タスクを登録する"} />
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full disabled:opacity-60" disabled={pending}>
      {pending ? "登録しています…" : label}
    </button>
  );
}
