// 依頼14：入力の必須化／予定を確認しないと進めない形
import { describe, expect, it } from "vitest";
import { getMockStore } from "@/lib/data/mock-store";
import { fx } from "@/lib/data/tables";
import { DEFAULT_REQUIRED_INPUTS, keysFor, computeMissing } from "@/lib/required-inputs";
import { DEFAULT_INCENTIVE_SETTINGS, incentiveDeadline, incentiveReport } from "@/lib/required-inputs/incentive";
import { acknowledge, pendingGateItems } from "@/lib/confirm-gate";
import { addDays, todayJst } from "@/lib/date";

describe("ロールごとの必須入力", () => {
  it("初期値：全員＝出退勤・日報、店長＝レジ締め、スタイリスト＝売上、アシスタント＝週報（日報・売上は出さない）", async () => {
    const db = getMockStore();
    const stores = await db.listStores();
    const exec = (await db.getStaff("staff-3"))!; // ENi スタイリスト・幹部
    const assistant = (await db.getStaff("staff-5"))!;
    const eyes = (await db.getStaff("staff-1"))!;
    const admin = (await db.getStaff("staff-admin"))!;
    expect(keysFor(exec, stores, DEFAULT_REQUIRED_INPUTS).sort()).toEqual(["attendance", "cash_closing", "daily_report", "sales"].sort());
    expect(keysFor(assistant, stores, DEFAULT_REQUIRED_INPUTS).sort()).toEqual(["attendance", "weekly_report"].sort());
    expect(keysFor(eyes, stores, DEFAULT_REQUIRED_INPUTS)).toContain("daily_report");
    expect(keysFor(admin, stores, DEFAULT_REQUIRED_INPUTS)).toEqual([]);
  });

  it("入力するまで「まだの入力」に出続け、入れたら消える", async () => {
    const db = getMockStore();
    const today = todayJst();
    const before = (await computeMissing(db, { from: today, to: today, staffIds: ["staff-1"] })).get("staff-1") ?? [];
    await db.upsertDailyReport({
      staffId: "staff-1", reportDate: today, newClients: 1, repeatClients: 1, nextBookings: 1, serviceSales: 9000, optionSales: 0, retailSales: 0, memo: "", goodPoint: "", improvement: "", message: "",
    });
    const after = (await computeMissing(db, { from: today, to: today, staffIds: ["staff-1"] })).get("staff-1") ?? [];
    expect(after.filter((m) => m.key === "daily_report").length).toBeLessThanOrEqual(before.filter((m) => m.key === "daily_report").length);
    expect(after.some((m) => m.key === "daily_report")).toBe(false);
  });
});

describe("インセンティブとのつながり", () => {
  it("締め日は対象の月の翌月3日（初期値）", () => {
    expect(incentiveDeadline("2026-11", DEFAULT_INCENTIVE_SETTINGS)).toBe("2026-12-03");
    expect(incentiveDeadline("2026-12", DEFAULT_INCENTIVE_SETTINGS)).toBe("2027-01-03");
  });

  it("締め日のあとに入れた日報は「締め日のあと」になり、救済が承認されると使われる", async () => {
    const db = getMockStore();
    const month = addDays(todayJst(), -70).slice(0, 7); // 締め日をとうに過ぎた月
    const first = await incentiveReport(db, month, ["staff-2"]);
    const target = first.summaries[0]?.items.find((i) => i.key === "daily_report" && i.status === "missing");
    if (!target) return; // デモデータで全部入力済みの月なら確かめられない
    await db.upsertDailyReport({
      staffId: "staff-2", reportDate: target.date, newClients: 0, repeatClients: 2, nextBookings: 1, serviceSales: 12000, optionSales: 0, retailSales: 0, memo: "", goodPoint: "", improvement: "", message: "",
    });
    // 締め日のあと（今日）に入れた記録
    await fx().inputSubmissions.insert({ staffId: "staff-2", inputKey: "daily_report", date: target.date, firstSubmittedAt: new Date(), lastSubmittedAt: new Date() });
    const late = await incentiveReport(db, month, ["staff-2"]);
    expect(late.summaries[0].items.find((i) => i.date === target.date && i.key === "daily_report")?.status).toBe("late");
    const salesBefore = late.summaries[0].eligibleSales;
    await fx().incentiveRescues.insert({ staffId: "staff-2", month, inputKey: "daily_report", date: target.date, reason: "入れ忘れ", status: "approved" });
    const again = await incentiveReport(db, month, ["staff-2"]);
    expect(again.summaries[0].items.find((i) => i.date === target.date && i.key === "daily_report")?.status).toBe("rescued");
    expect(again.summaries[0].eligibleSales).toBe(salesBefore + 12000);
  });
});

describe("予定を確認しないと先に進めない", () => {
  it("全員参加の新しい予定は確認が要り、確認すると出なくなる。中身が変わるともう一度出る", async () => {
    const db = getMockStore();
    const today = todayJst();
    const ev = await db.upsertCompanyEvent({ startDate: addDays(today, 5), endDate: addDays(today, 5), startTime: "10:00", title: "全体ミーティング（テスト）", body: "", required: true, createdBy: "staff-admin" });
    const first = await pendingGateItems(db, "staff-5");
    const mine = first.find((i) => i.itemId === ev.id);
    expect(mine).toBeTruthy();
    await acknowledge("staff-5", [mine!]);
    expect((await pendingGateItems(db, "staff-5")).some((i) => i.itemId === ev.id)).toBe(false);
    await db.upsertCompanyEvent({ id: ev.id, startDate: addDays(today, 6), endDate: addDays(today, 6), startTime: "10:00", title: "全体ミーティング（テスト）", body: "", required: true, createdBy: "staff-admin" });
    expect((await pendingGateItems(db, "staff-5")).some((i) => i.itemId === ev.id)).toBe(true);
    // 自分で登録した予定は確認しなくてよい
    expect((await pendingGateItems(db, "staff-admin")).some((i) => i.itemId === ev.id)).toBe(false);
  });
});
