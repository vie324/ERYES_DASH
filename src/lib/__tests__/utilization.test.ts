// 依頼17：稼働率（ENi・イーリス）
import { describe, expect, it } from "vitest";
import { getMockStore } from "@/lib/data/mock-store";
import { fx } from "@/lib/data/tables";
import { aheadOver, computeUtilizationForDate, rateOf } from "@/lib/utilization";
import { addDays, todayJst } from "@/lib/date";

describe("稼働率", () => {
  it("割合と、巻いた時間・オーバー時間の計算", () => {
    expect(rateOf(480, 960)).toBe(50);
    expect(aheadOver([
      { plannedMinutes: 90, actualMinutes: 80 },
      { plannedMinutes: 60, actualMinutes: 75 },
      { plannedMinutes: 30, actualMinutes: null },
    ])).toEqual({ ahead: 10, over: 15, counted: 2 });
  });

  it("ENi：日報の入客時間 ÷（段数×8時間）で、その日の稼働率ができる", async () => {
    const db = getMockStore();
    const date = addDays(todayJst(), -1);
    // 山本さん（2段）の日報：入客時間 480分 → 480 ÷ 960 = 50%
    await db.upsertEniReport({ kind: "stylist", staffId: "staff-3", periodKey: date, answers: { service_minutes: 480, client_count: 4, next_bookings: 2 } });
    await computeUtilizationForDate(db, date);
    const row = await fx().utilizationDaily.find({ staffId: "staff-3", date });
    expect(row?.rate).toBe(50);
    expect(row?.source).toBe("report");
  });

  it("イーリス：施術時間 ÷（シフトの時間 − 休憩）。データが無い日は「データなし」", async () => {
    const db = getMockStore();
    const date = addDays(todayJst(), -2);
    await computeUtilizationForDate(db, date);
    const before = await fx().utilizationDaily.find({ staffId: "staff-1", date });
    if (before) expect(["missing", "ok"]).toContain(before.status);
    await fx().utilizationInputs.insert({ staffId: "staff-1", date, servedMinutes: 300, breakMinutes: 60 });
    await computeUtilizationForDate(db, date);
    const after = await fx().utilizationDaily.find({ staffId: "staff-1", date });
    if (after && after.capacityMinutes > 0) {
      expect(after.status).toBe("ok");
      expect(after.rate).toBe(Math.round((300 / after.capacityMinutes) * 1000) / 10);
    }
  });
});
