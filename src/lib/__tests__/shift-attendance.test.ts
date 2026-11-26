// 依頼12：シフトと出退勤
import { describe, expect, it } from "vitest";
import { getMockStore } from "@/lib/data/mock-store";
import { fx } from "@/lib/data/tables";
import { buildDayRecord, DEFAULT_ATTENDANCE_SETTINGS, totalsOf } from "@/lib/attendance-shift";
import { canApproveFor, decideLateDayoff, requiredStaffFromRules } from "@/lib/shift/extras";
import { jstLocalToUtc } from "@/lib/date";
import type { Attendance } from "@/lib/data/types";
import type { AttendanceCorrection } from "@/lib/data/tables";

function punch(type: "in" | "out", date: string, time: string): Attendance {
  return { id: `${type}${time}`, staffId: "s", storeId: "st", punchType: type, punchedAt: jstLocalToUtc(`${date}T${time}`), lat: 0, lng: 0, distanceM: 0, isValid: true };
}
const planned = { working: true, start: "09:30", end: "18:30", storeId: "st" };

describe("出退勤をシフトにひもづける", () => {
  it("遅刻・早退に印がつき、猶予（5分）以内なら印はつかない", () => {
    const late = buildDayRecord({ date: "2026-11-10", today: "2026-11-20", planned, punches: [punch("in", "2026-11-10", "09:50"), punch("out", "2026-11-10", "18:00")], corrections: [], settings: DEFAULT_ATTENDANCE_SETTINGS });
    expect(late.late).toBe(true);
    expect(late.lateMinutes).toBe(20);
    expect(late.early).toBe(true);
    const ok = buildDayRecord({ date: "2026-11-10", today: "2026-11-20", planned, punches: [punch("in", "2026-11-10", "09:33"), punch("out", "2026-11-10", "18:30")], corrections: [], settings: DEFAULT_ATTENDANCE_SETTINGS });
    expect(ok.late).toBe(false);
    expect(ok.early).toBe(false);
    // 9時間勤務 → 休憩60分を引いて8時間
    expect(ok.netMinutes).toBe(477);
  });

  it("シフトの無い日の打刻は「シフト外」、シフトの日に打刻が無ければ「打刻なし」", () => {
    const off = buildDayRecord({ date: "2026-11-11", today: "2026-11-20", planned: { ...planned, working: false }, punches: [punch("in", "2026-11-11", "10:00")], corrections: [], settings: DEFAULT_ATTENDANCE_SETTINGS });
    expect(off.offShift).toBe(true);
    const missing = buildDayRecord({ date: "2026-11-12", today: "2026-11-20", planned, punches: [], corrections: [], settings: DEFAULT_ATTENDANCE_SETTINGS });
    expect(missing.missing).toBe(true);
    expect(totalsOf([off, missing]).missingCount).toBe(1);
  });

  it("承認された打刻の修正だけ、その時刻で数える", () => {
    const corr = (status: AttendanceCorrection["status"]): AttendanceCorrection => ({
      id: status, staffId: "s", date: "2026-11-13", punchType: "out", time: "18:30", reason: "忘れた", status, decidedBy: "m", decidedAt: new Date(), decisionNote: "", createdAt: new Date(),
    });
    const pending = buildDayRecord({ date: "2026-11-13", today: "2026-11-20", planned, punches: [punch("in", "2026-11-13", "09:30")], corrections: [corr("pending")], settings: DEFAULT_ATTENDANCE_SETTINGS });
    expect(pending.outAt).toBeNull();
    expect(pending.pendingCorrection).toBe(true);
    const approved = buildDayRecord({ date: "2026-11-13", today: "2026-11-20", planned, punches: [punch("in", "2026-11-13", "09:30")], corrections: [corr("approved")], settings: DEFAULT_ATTENDANCE_SETTINGS });
    expect(approved.outCorrected).toBe(true);
    expect(approved.workMinutes).toBe(540);
  });
});

describe("1日ごとの必要人数", () => {
  it("日付の指定 ＞ 曜日の指定 ＞ ルールの最低人数", () => {
    const rules = [
      { id: "1", storeId: "a", weekday: 6, date: "", required: 4, createdAt: new Date() },
      { id: "2", storeId: "a", weekday: -1, date: "2026-12-05", required: 6, createdAt: new Date() },
    ];
    const map = requiredStaffFromRules(rules, "2026-12", ["a"], 2);
    expect(map.get("2026-12-05|a")).toBe(6); // 土曜だが日付の指定が優先
    expect(map.get("2026-12-12|a")).toBe(4); // 土曜
    expect(map.get("2026-12-07|a")).toBe(2); // 月曜（指定なし）
  });
});

describe("締切後の希望休は店長の承認制", () => {
  it("同じ店舗の幹部・管理者だけが承認でき、承認するとその日は休み（個別調整）になる", async () => {
    const db = getMockStore();
    const member = (await db.getStaff("staff-5"))!;
    const manager = (await db.getStaff("staff-3"))!; // ENiの幹部
    const other = (await db.getStaff("staff-1"))!; // EREYSのスタッフ
    expect(canApproveFor(manager, member)).toBe(true);
    expect(canApproveFor(other, member)).toBe(false);
    const req = (await fx().dayoffLateRequests.list({ where: { staffId: "staff-5", status: "pending" } }))[0];
    const res = await decideLateDayoff(db, manager, req.id, "approved", "了解です");
    expect(res.ok).toBe(true);
    const overrides = await db.listScheduleOverrides({ staffId: "staff-5", from: req.date, to: req.date });
    expect(overrides[0]?.isWorking).toBe(false);
    expect((await fx().dayoffLateRequests.get(req.id))?.status).toBe("approved");
  });
});
