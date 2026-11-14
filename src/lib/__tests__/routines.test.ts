// 依頼1（追加5・36）：幹部の毎日のルーティンは店舗ごと、スタイリストの毎日の業務は一人ひとり
import { describe, expect, it } from "vitest";
import { buildRoutineStatuses, countUndone, defaultRoutineStoreId, routineSubjectKey } from "@/lib/eni/routines";
import { getMockStore } from "@/lib/data/mock-store";
import type { ManagerRoutine, ManagerRoutineCheck } from "@/lib/data/types";

const routines: ManagerRoutine[] = [
  { id: "e1", title: "口コミ返信チェック", cycle: "daily", note: "", sortOrder: 10, isActive: true, audience: "exec" },
  { id: "e2", title: "カルテ記入チェック", cycle: "daily", note: "", sortOrder: 20, isActive: true, audience: "exec" },
  { id: "e3", title: "止めた業務", cycle: "daily", note: "", sortOrder: 30, isActive: false, audience: "exec" },
  { id: "s1", title: "営業フィードバック", cycle: "daily", note: "", sortOrder: 10, isActive: true, audience: "stylist" },
];
const today = "2026-11-14";
const check = (routineId: string, subjectKey: string): ManagerRoutineCheck => ({
  id: `${routineId}-${subjectKey}`,
  routineId,
  periodKey: today,
  staffId: "x",
  subjectKey,
  storeId: subjectKey.startsWith("store") ? subjectKey : null,
  checkedAt: new Date(),
});

describe("毎日の業務の状態", () => {
  it("幹部の業務は店舗ごとに数える（ほかの店舗のチェックは混ざらない）", () => {
    const checks = [check("e1", "store-a")];
    const a = buildRoutineStatuses(routines, checks, today, { audience: "exec", subjectKey: "store-a" });
    const b = buildRoutineStatuses(routines, checks, today, { audience: "exec", subjectKey: "store-b" });
    expect(a.map((s) => [s.routine.id, s.done])).toEqual([
      ["e1", true],
      ["e2", false],
    ]);
    expect(countUndone(b)).toBe(2);
  });

  it("止めた業務・スタイリストの業務は、幹部の一覧に出ない", () => {
    const rows = buildRoutineStatuses(routines, [], today, { audience: "exec", subjectKey: "store-a" });
    expect(rows.map((r) => r.routine.id)).toEqual(["e1", "e2"]);
  });

  it("スタイリストの業務は本人の分だけを見る", () => {
    const checks = [check("s1", "stylist-1")];
    const mine = buildRoutineStatuses(routines, checks, today, { audience: "stylist", subjectKey: "stylist-1" });
    const other = buildRoutineStatuses(routines, checks, today, { audience: "stylist", subjectKey: "stylist-2" });
    expect(mine.map((s) => s.done)).toEqual([true]);
    expect(other.map((s) => s.done)).toEqual([false]);
  });

  it("店舗の区別が無かった頃の記録は、幹部の業務ならどの店舗の分としても数える", () => {
    const checks = [check("e1", "")];
    const rows = buildRoutineStatuses(routines, checks, today, { audience: "exec", subjectKey: "store-b" });
    expect(rows.find((r) => r.routine.id === "e1")?.done).toBe(true);
    const stylist = buildRoutineStatuses(routines, [check("s1", "")], today, { audience: "stylist", subjectKey: "x" });
    expect(stylist[0].done).toBe(false);
  });

  it("対象キーは幹部＝店舗、スタイリスト＝本人", () => {
    expect(routineSubjectKey("exec", { storeId: "store-a", staffId: "p" })).toBe("store-a");
    expect(routineSubjectKey("stylist", { storeId: "store-a", staffId: "p" })).toBe("p");
  });

  it("最初に開く店舗は、自分の店舗が業態の店舗に入っていればそこ、なければ最初の店舗", () => {
    const stores = [{ id: "store-a" }, { id: "store-b" }];
    expect(defaultRoutineStoreId({ storeId: "store-b" }, stores)).toBe("store-b");
    expect(defaultRoutineStoreId({ storeId: "store-z" }, stores)).toBe("store-a");
    expect(defaultRoutineStoreId(null, [])).toBe("");
  });
});

describe("初期データ（デモ）", () => {
  it("幹部の毎日の業務に口コミ返信・カルテ記入、スタイリストにカルテ記入・営業フィードバックが入っている", async () => {
    const all = await getMockStore().listManagerRoutines();
    const daily = (audience: string) =>
      all.filter((r) => r.audience === audience && r.cycle === "daily" && r.isActive).map((r) => r.title);
    expect(daily("exec")).toEqual(expect.arrayContaining(["口コミ返信チェック", "カルテ記入チェック"]));
    expect(daily("stylist")).toEqual(["カルテ記入チェック", "営業フィードバック"]);
  });

  it("店舗ごとに付け外しでき、別の店舗には影響しない", async () => {
    const db = getMockStore();
    const routine = (await db.listManagerRoutines()).find((r) => r.title === "口コミ返信チェック")!;
    await db.setManagerRoutineChecked({
      routineId: routine.id,
      periodKey: today,
      subjectKey: "store-4",
      storeId: "store-4",
      staffId: "staff-3",
      checked: true,
    });
    const checks = await db.listManagerRoutineChecks([today]);
    const all = await db.listManagerRoutines();
    const store4 = buildRoutineStatuses(all, checks, today, { audience: "exec", subjectKey: "store-4" });
    const store1 = buildRoutineStatuses(all, checks, today, { audience: "exec", subjectKey: "store-1" });
    expect(store4.find((s) => s.routine.id === routine.id)?.done).toBe(true);
    expect(store1.find((s) => s.routine.id === routine.id)?.done).toBe(false);
  });
});
