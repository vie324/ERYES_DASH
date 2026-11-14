// 依頼2（追加3）：全体スケジュール（ホームに出す直近の予定の取り出し）
import { describe, expect, it } from "vitest";
import { eventPeriodLabel, eventsOnDate, listUpcomingCompanyEvents, withQuery } from "@/lib/company-events";
import { getMockStore } from "@/lib/data/mock-store";
import type { CompanyEvent } from "@/lib/data/types";

const event = (p: Partial<CompanyEvent>): CompanyEvent => ({
  id: p.id ?? "e",
  startDate: "2026-11-20",
  endDate: "2026-11-20",
  startTime: "",
  title: "全体ミーティング",
  body: "",
  required: true,
  createdBy: "staff-admin",
  createdAt: new Date(),
  ...p,
});

describe("全体スケジュール", () => {
  it("今日以降に終わる予定を、開始日・時刻の順に直近から出す", async () => {
    const db = getMockStore();
    await db.upsertCompanyEvent({ ...event({}), id: undefined, title: "研修", startDate: "2026-11-25", endDate: "2026-11-25", startTime: "10:00" });
    await db.upsertCompanyEvent({ ...event({}), id: undefined, title: "しもん塾", startDate: "2026-11-18", endDate: "2026-11-18", startTime: "19:00" });
    await db.upsertCompanyEvent({ ...event({}), id: undefined, title: "終わった会", startDate: "2026-11-01", endDate: "2026-11-02" });
    const upcoming = await listUpcomingCompanyEvents(db, "2026-11-14", { limit: 5 });
    const titles = upcoming.map((e) => e.title);
    expect(titles.indexOf("しもん塾")).toBeLessThan(titles.indexOf("研修"));
    expect(titles).not.toContain("終わった会");
  });

  it("その日にかかっている予定（数日にまたがる予定を含む）", () => {
    const events = [
      event({ id: "a", startDate: "2026-11-19", endDate: "2026-11-21", title: "研修旅行" }),
      event({ id: "b", startDate: "2026-11-20", startTime: "19:00", title: "全体会議" }),
      event({ id: "c", startDate: "2026-11-22", endDate: "2026-11-22" }),
    ];
    expect(eventsOnDate(events, "2026-11-20").map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("期間と時刻の表示", () => {
    expect(eventPeriodLabel({ startDate: "2026-11-20", endDate: "2026-11-20", startTime: "19:00" })).toContain("19:00〜");
    expect(eventPeriodLabel({ startDate: "2026-11-20", endDate: "2026-11-22", startTime: "" })).toContain("〜");
  });

  it("URLのクエリのつなぎ方", () => {
    expect(withQuery("/staff/plan?tab=all", { month: "2026-11" })).toBe("/staff/plan?tab=all&month=2026-11");
    expect(withQuery("/staff/events", { month: "2026-11" })).toBe("/staff/events?month=2026-11");
  });
});
