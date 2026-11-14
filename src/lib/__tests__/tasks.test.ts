// 依頼1（追加4）：タスクとルーティンを分ける
import { describe, expect, it } from "vitest";
import {
  getMyTaskSummary,
  inferTaskType,
  isTaskActionable,
  isTaskOverdue,
  normalizeTaskType,
  routineAchievementByAssignee,
} from "@/lib/tasks";
import { parseTaskForm } from "@/lib/task-form";
import { getMockStore } from "@/lib/data/mock-store";
import type { StaffTask, TaskCompletion } from "@/lib/data/types";

function task(partial: Partial<StaffTask>): StaffTask {
  return {
    id: "t",
    taskType: "task",
    kind: "routine",
    title: "テスト",
    note: "",
    assigneeStaffId: "s1",
    createdBy: "s1",
    dueDate: "",
    repeat: "",
    repeatDays: [],
    status: "open",
    doneAt: null,
    createdAt: new Date("2026-11-01T00:00:00+09:00"),
    updatedAt: new Date("2026-11-01T00:00:00+09:00"),
    ...partial,
  };
}

describe("既存タスクの振り分け（DBの移行と同じ決まり）", () => {
  it("くり返しがあるものはルーティン、ないもの・判断できないものはタスク", () => {
    expect(inferTaskType("daily")).toBe("routine");
    expect(inferTaskType("weekly")).toBe("routine");
    expect(inferTaskType("monthly")).toBe("routine");
    expect(inferTaskType("")).toBe("task");
    expect(inferTaskType(null)).toBe("task");
    expect(inferTaskType("yearly")).toBe("task");
  });

  it("種類の列があればその値を、無ければくり返しの有無で決める", () => {
    expect(normalizeTaskType("routine", "")).toBe("routine");
    expect(normalizeTaskType("task", "")).toBe("task");
    expect(normalizeTaskType(undefined, "weekly")).toBe("routine");
    expect(normalizeTaskType("", "")).toBe("task");
  });
});

describe("今日やることの判定", () => {
  const today = "2026-11-14"; // 土曜日
  it("ルーティンは、やる日でまだ完了していなければ出る", () => {
    const daily = task({ id: "r1", taskType: "routine", repeat: "daily" });
    expect(isTaskActionable(daily, today, new Set())).toBe(true);
    expect(isTaskActionable(daily, today, new Set(["r1"]))).toBe(false);
    const monday = task({ id: "r2", taskType: "routine", repeat: "weekly", repeatDays: [1] });
    expect(isTaskActionable(monday, today, new Set())).toBe(false);
  });

  it("タスクは期限切れ・今日までなら出て、完了したら消える", () => {
    expect(isTaskActionable(task({ dueDate: "2026-11-13" }), today, new Set())).toBe(true);
    expect(isTaskActionable(task({ dueDate: today }), today, new Set())).toBe(true);
    expect(isTaskActionable(task({ dueDate: "2026-11-20" }), today, new Set())).toBe(false);
    expect(isTaskActionable(task({ dueDate: "2026-11-13", status: "done" }), today, new Set())).toBe(false);
    // 期限のない依頼（移行前のもの）は完了まで出し続ける
    expect(isTaskActionable(task({ kind: "request" }), today, new Set())).toBe(true);
    expect(isTaskActionable(task({ kind: "routine" }), today, new Set())).toBe(false);
  });

  it("期限切れの判定はタスクだけ", () => {
    expect(isTaskOverdue(task({ dueDate: "2026-11-13" }), today)).toBe(true);
    expect(isTaskOverdue(task({ dueDate: "2026-11-13", status: "done" }), today)).toBe(false);
    expect(isTaskOverdue(task({ taskType: "routine", repeat: "daily" }), today)).toBe(false);
  });
});

describe("登録フォームの確認", () => {
  const form = (entries: [string, string][]) => {
    const fd = new FormData();
    for (const [k, v] of entries) fd.append(k, v);
    return fd;
  };

  it("ルーティンはくり返しが必須で、期限は持たない", () => {
    const ok = parseTaskForm(form([["task_type", "routine"], ["title", "掃除"], ["repeat", "daily"], ["due_date", "2026-11-20"]]));
    expect(ok).toEqual({
      ok: true,
      value: expect.objectContaining({ taskType: "routine", repeat: "daily", dueDate: "", repeatDays: [] }),
    });
    expect(parseTaskForm(form([["task_type", "routine"], ["title", "掃除"]]))).toEqual({ ok: false, error: "repeat" });
    expect(parseTaskForm(form([["task_type", "routine"], ["title", "掃除"], ["repeat", "weekly"]]))).toEqual({
      ok: false,
      error: "weekdays",
    });
    const weekly = parseTaskForm(
      form([["task_type", "routine"], ["title", "掃除"], ["repeat", "weekly"], ["repeat_weekdays", "4"], ["repeat_weekdays", "1"]])
    );
    expect(weekly.ok && weekly.value.repeatDays).toEqual([1, 4]);
    const monthly = parseTaskForm(form([["task_type", "routine"], ["title", "締め"], ["repeat", "monthly"], ["repeat_monthday", "40"]]));
    expect(monthly.ok && monthly.value.repeatDays).toEqual([1]);
  });

  it("タスクは期限が必須で、くり返しは持たない", () => {
    expect(parseTaskForm(form([["task_type", "task"], ["title", "ポップ作成"]]))).toEqual({ ok: false, error: "due" });
    const ok = parseTaskForm(form([["task_type", "task"], ["title", "ポップ作成"], ["due_date", "2026-11-20"], ["repeat", "daily"]]));
    expect(ok).toEqual({ ok: true, value: expect.objectContaining({ taskType: "task", repeat: "", dueDate: "2026-11-20" }) });
    expect(parseTaskForm(form([["task_type", "task"], ["title", "  "], ["due_date", "2026-11-20"]]))).toEqual({
      ok: false,
      error: "title",
    });
  });
});

describe("達成率の集計（ホームで使う）", () => {
  it("ルーティンのやる日と完了から、担当者ごとの達成率の材料を出す", () => {
    const routine = task({ id: "r1", taskType: "routine", repeat: "daily", assigneeStaffId: "a" });
    const oneOff = task({ id: "t1", assigneeStaffId: "a", dueDate: "2026-11-03" });
    const completions: TaskCompletion[] = [
      { id: "c1", taskId: "r1", date: "2026-11-02", doneBy: "a", doneAt: new Date() },
      { id: "c2", taskId: "r1", date: "2026-11-04", doneBy: "a", doneAt: new Date() },
    ];
    const result = routineAchievementByAssignee([routine, oneOff], completions, "2026-11-02", "2026-11-05");
    expect(result.get("a")).toEqual({ due: 4, done: 2 });
  });
});

describe("自分のタスクのまとめ（バッジの数）", () => {
  it("スタイリストには毎日の業務（カルテ記入チェック・営業フィードバック）が今日やることとして数えられる", async () => {
    const db = getMockStore();
    const today = "2026-11-14";
    const summary = await getMyTaskSummary(db, "staff-4", today);
    const titles = summary.dailyItems.map((s) => s.routine.title);
    expect(titles).toEqual(expect.arrayContaining(["カルテ記入チェック", "営業フィードバック"]));
    expect(summary.dailyItems.every((s) => s.routine.audience === "stylist")).toBe(true);
    const undone = summary.dailyItems.filter((s) => !s.done).length;
    expect(summary.dueCount).toBeGreaterThanOrEqual(undone);
  });

  it("アシスタントには毎日の業務（スタイリスト向け）は出ない", async () => {
    const summary = await getMyTaskSummary(getMockStore(), "staff-5", "2026-11-14");
    expect(summary.dailyItems).toEqual([]);
  });
});
