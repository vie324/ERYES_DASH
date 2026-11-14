// タスク登録フォームの読み取りと確認（タスク画面・幹部メニューのサーバーアクションで共用）。
// 画面側（components/task-create-form.tsx）でも出し分けているが、確認は必ずサーバー側でもう一度行う。
//  ・ルーティン …… くり返し（毎日／毎週◯曜日／毎月◯日）が必須。期限は持たない
//  ・タスク ……… 期限が必須。くり返しは持たない

import type { TaskRepeat, TaskType } from "@/lib/data/types";

export type TaskFormError = "title" | "repeat" | "weekdays" | "due";

export interface ParsedTaskForm {
  taskType: TaskType;
  title: string;
  note: string;
  repeat: TaskRepeat;
  repeatDays: number[];
  dueDate: string;
  /** 担当に選ばれた人（空文字＝指定なし。呼び出し側で「自分」にする） */
  assigneeId: string;
}

/** 画面に出すエラー文（?error= のキー → 文言） */
export const TASK_FORM_ERROR_MESSAGE: Record<string, string> = {
  title: "やることを入力してください",
  repeat: "くり返し（毎日・毎週・毎月）を選んでください",
  weekdays: "毎週のルーティンは、曜日を1つ以上選んでください",
  due: "タスクの期限を入れてください",
  assignee: "担当者を選び直してください",
  forbidden: "この操作の権限がありません",
  notfound: "対象が見つかりませんでした（すでに削除されたかもしれません）",
  input: "入力内容を確認してください",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseTaskForm(
  formData: FormData
): { ok: true; value: ParsedTaskForm } | { ok: false; error: TaskFormError } {
  const taskType: TaskType = formData.get("task_type") === "routine" ? "routine" : "task";
  const title = String(formData.get("title") ?? "").trim().slice(0, 100);
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  const assigneeId = String(formData.get("assignee") ?? "").trim();
  if (!title) return { ok: false, error: "title" };

  if (taskType === "routine") {
    const raw = String(formData.get("repeat") ?? "");
    if (raw === "daily") {
      return { ok: true, value: { taskType, title, note, repeat: "daily", repeatDays: [], dueDate: "", assigneeId } };
    }
    if (raw === "weekly") {
      const days = [
        ...new Set(
          formData
            .getAll("repeat_weekdays")
            .map(Number)
            .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
        ),
      ].sort((a, b) => a - b);
      if (days.length === 0) return { ok: false, error: "weekdays" };
      return { ok: true, value: { taskType, title, note, repeat: "weekly", repeatDays: days, dueDate: "", assigneeId } };
    }
    if (raw === "monthly") {
      const day = Math.round(Number(formData.get("repeat_monthday")) || 0);
      return {
        ok: true,
        value: {
          taskType,
          title,
          note,
          repeat: "monthly",
          repeatDays: [day >= 1 && day <= 31 ? day : 1],
          dueDate: "",
          assigneeId,
        },
      };
    }
    return { ok: false, error: "repeat" };
  }

  const dueDate = String(formData.get("due_date") ?? "").trim();
  if (!DATE_RE.test(dueDate)) return { ok: false, error: "due" };
  return { ok: true, value: { taskType, title, note, repeat: "", repeatDays: [], dueDate, assigneeId } };
}
