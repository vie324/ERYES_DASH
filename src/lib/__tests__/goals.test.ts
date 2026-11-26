// 依頼19：目標・ピラミッド・アクションプラン
import { describe, expect, it } from "vitest";
import { getMockStore } from "@/lib/data/mock-store";
import { fx } from "@/lib/data/tables";
import { goalTreeFor, reflectionsWithoutFeedback, lastWeekKey } from "@/lib/goals";
import { decideSuggestion, fallbackItems, getOrCreateSuggestion } from "@/lib/goals/suggest";

describe("目標のつながりとアクションプラン", () => {
  it("会社・店舗・個人の目標がつながって見え、アクションプランの進み具合が目標に入る", async () => {
    const db = getMockStore();
    const tree = await goalTreeFor(db, "staff-5", "store-4");
    expect(tree.company.length).toBeGreaterThan(0);
    expect(tree.store.length).toBeGreaterThan(0);
    const goal = tree.personal.find((n) => n.goal.title.includes("カットのテスト"))!;
    const task = await db.createStaffTask({ taskType: "task", kind: "routine", title: "テストの練習を3回する", note: "", assigneeStaffId: "staff-5", createdBy: "staff-5", dueDate: "", repeat: "", repeatDays: [], status: "done" });
    await fx().actionPlans.insert({ goalId: goal.goal.id, staffId: "staff-5", title: task.title, taskId: task.id, kind: "task" });
    const again = await goalTreeFor(db, "staff-5", "store-4");
    expect(again.personal.find((n) => n.goal.id === goal.goal.id)?.progress).toBe(100);
  });
});

describe("AIの今週やること", () => {
  it("1人1週1回だけ作って保存し（AIが無いときは決まった作り方）、採用するとタスクになる", async () => {
    const db = getMockStore();
    const s1 = await getOrCreateSuggestion(db, "staff-5", "week");
    const s2 = await getOrCreateSuggestion(db, "staff-5", "week");
    expect(s1?.id).toBe(s2?.id);
    expect(s1?.ai).toBe(false);
    expect(s1!.items.length).toBeGreaterThan(0);
    await decideSuggestion(db, "staff-5", s1!.id, 0, "adopt", "テストの練習を毎日する");
    const saved = await fx().aiSuggestions.get(s1!.id);
    expect(saved?.items[0].status).toBe("adopted");
    const task = (await db.listStaffTasks({ assigneeStaffId: "staff-5" })).find((t) => t.id === saved?.items[0].taskId);
    expect(task?.title).toBe("テストの練習を毎日する");
  });

  it("目標が無い人には「目標を立てる」を出す", () => {
    const items = fallbackItems({ scope: "week", goals: [], practiceMinutes: { thisMonth: 0, lastMonth: 0 }, utilization: null, reportsThisWeek: 0 });
    expect(items[0].text).toContain("目標");
  });
});

describe("上の人のフィードバック", () => {
  it("先週の振り返りで、まだ何も返していないものが分かる", async () => {
    const pending = await reflectionsWithoutFeedback(lastWeekKey());
    expect(pending.some((p) => p.staffId === "staff-5")).toBe(true);
  });
});
