// 依頼3（追加7・60・26）：ロールごとに見える・見えないを確かめる
//  デモのアカウント：staff-admin＝管理者／staff-3＝幹部のスタイリスト／staff-4＝スタイリスト／
//                    staff-5・staff-6＝アシスタント
import { describe, expect, it } from "vitest";
import { canAccessOrgChart, canEditMinutes, canViewMinutes, isExecutive, visibleCommittees } from "@/lib/eni/access";
import { buildNav } from "@/lib/nav";
import { canSeeViewStats, recordWeeklyReportView, summarizeWeeklyViews, VIEW_TARGETS } from "@/lib/views";
import { getMockStore } from "@/lib/data/mock-store";
import type { Session } from "@/lib/auth/session";
import type { Committee, EniReport, Meeting, OrgMember, Staff } from "@/lib/data/types";

const session = (staffId: string, role: "admin" | "staff" = "staff"): Session => ({
  staffId,
  name: staffId,
  role,
  exp: Math.floor(Date.now() / 1000) + 3600,
});

const meeting = (p: Partial<Meeting>): Meeting => ({
  id: "m",
  meetingType: "1on1",
  committee: "",
  title: "",
  agenda: "",
  meetingDate: "2026-11-10",
  startTime: "",
  hostStaffId: "staff-4",
  guestStaffId: "staff-5",
  participants: [],
  minutesText: "1on1の中身",
  minutesPhoto: "",
  minutesFile: "",
  minutesFileName: "",
  minutesAi: false,
  minutesDone: true,
  createdBy: "staff-4",
  createdAt: new Date(),
  ...p,
});

const committee = (p: Partial<Committee>): Committee => ({
  id: p.committeeKey ?? "c",
  committeeKey: "exec-meeting",
  name: "幹部会議",
  purpose: "",
  cadence: "",
  durationMin: 60,
  participantsHint: "",
  orgTeams: [],
  memberStaffIds: [],
  agenda: "",
  prechecks: [],
  sortOrder: 0,
  isActive: true,
  ...p,
});

describe("議事録（追加7）：幹部・管理者は全員の議事録を読める／直せるのは関係者だけ", () => {
  const committees: Committee[] = [committee({ committeeKey: "exec-meeting", memberStaffIds: ["staff-3"] })];
  const oneOnOne = meeting({}); // スタイリスト staff-4 × アシスタント staff-5 の1on1

  it("管理者・幹部は、出ていない1on1の議事録も読める", () => {
    expect(canViewMinutes(oneOnOne, "staff-admin", { isExec: true, committees })).toBe(true);
    expect(canViewMinutes(oneOnOne, "staff-3", { isExec: true, committees })).toBe(true);
  });

  it("関係者でないスタイリスト・アシスタントは読めない（これまでどおり）", () => {
    expect(canViewMinutes(oneOnOne, "staff-6", { isExec: false, committees })).toBe(false);
    expect(canViewMinutes(meeting({ hostStaffId: "staff-3", guestStaffId: "staff-6", createdBy: "staff-3" }), "staff-4", { isExec: false, committees })).toBe(false);
  });

  it("関係者は読める・直せる。幹部・管理者でも出ていない会議は直せない", () => {
    expect(canViewMinutes(oneOnOne, "staff-5", { isExec: false, committees })).toBe(true);
    expect(canEditMinutes(oneOnOne, "staff-5")).toBe(true);
    expect(canEditMinutes(oneOnOne, "staff-3")).toBe(false);
    expect(canEditMinutes(oneOnOne, "staff-admin")).toBe(false);
  });

  it("全体ミーティングは全員が読める", () => {
    const all = meeting({ meetingType: "all", guestStaffId: null });
    expect(canViewMinutes(all, "staff-6", { isExec: false, committees })).toBe(true);
  });
});

describe("組織図・組織メニュー・幹部メニュー（60）：幹部と管理者だけ", () => {
  it("URLを直接開いたときの判定（サーバー側）", async () => {
    expect(await canAccessOrgChart(session("staff-admin", "admin"))).toBe(true);
    expect(await canAccessOrgChart(session("staff-3"))).toBe(true);
    expect(await canAccessOrgChart(session("staff-4"))).toBe(false);
    expect(await canAccessOrgChart(session("staff-5"))).toBe(false);
    expect(await isExecutive(session("staff-6"))).toBe(false);
  });

  it("メニューに出るのは幹部・管理者だけ", () => {
    const hrefs = (ctx: Parameters<typeof buildNav>[0]) => buildNav(ctx).flatMap((g) => g.items.map((i) => i.href));
    const stylist = hrefs({ role: "staff", brand: "eni", jobType: "stylist", isExecutive: false });
    const assistant = hrefs({ role: "staff", brand: "eni", jobType: "assistant", isExecutive: false });
    const exec = hrefs({ role: "staff", brand: "eni", jobType: "stylist", isExecutive: true });
    const admin = hrefs({ role: "admin", brand: "eni", isExecutive: true });
    for (const menu of [stylist, assistant]) {
      expect(menu).not.toContain("/staff/org");
      expect(menu).not.toContain("/staff/exec");
    }
    for (const menu of [exec, admin]) {
      expect(menu).toContain("/staff/org");
      expect(menu).toContain("/staff/exec");
    }
  });
});

describe("会議体の一覧（60）：その会議体の参加者だけ。管理者はすべて", () => {
  const staff = (id: string): Staff =>
    ({ id, isActive: true, name: id, storeId: "s", loginId: id, role: "staff" }) as Staff;
  const activeStaff = ["staff-3", "staff-4", "staff-5", "staff-6"].map(staff);
  const orgMembers: OrgMember[] = [{ id: "o1", teamKey: "edu", staffId: "staff-4", roleLabel: "", sortOrder: 0 }];
  const committees = [
    committee({ committeeKey: "exec-meeting", name: "幹部会議", memberStaffIds: ["staff-3"] }),
    committee({ committeeKey: "edu", name: "教育チーム", orgTeams: ["edu"] }),
    committee({ committeeKey: "juku", name: "しもん塾" }), // 全員参加
    committee({ committeeKey: "old", name: "停止中の会議", memberStaffIds: ["staff-5"], isActive: false }),
  ];
  const keys = (staffId: string, isAdmin = false) =>
    visibleCommittees(committees, { staffId, isAdmin }, { orgMembers, activeStaff, meetings: [] }).map(
      (r) => r.committee.committeeKey
    );

  it("参加していない会議体は一覧に出ない", () => {
    expect(keys("staff-5")).toEqual(["juku"]);
    expect(keys("staff-4")).toEqual(["edu", "juku"]);
    expect(keys("staff-3")).toEqual(["exec-meeting", "juku"]);
  });

  it("管理者は停止中も含めてすべて見える", () => {
    expect(keys("staff-admin", true)).toEqual(["exec-meeting", "edu", "juku", "old"]);
  });

  it("実際に開かれた回に入っていた人も参加者として見える", () => {
    const held = [meeting({ committee: "exec-meeting", meetingType: "other", hostStaffId: "staff-3", guestStaffId: null, participants: ["staff-6"] })];
    const rows = visibleCommittees(committees, { staffId: "staff-6", isAdmin: false }, { orgMembers, activeStaff, meetings: held });
    expect(rows.map((r) => r.committee.committeeKey)).toContain("exec-meeting");
  });
});

describe("週報の閲覧状況（26）", () => {
  const report = (id: string, staffId: string): EniReport => ({
    id,
    staffId,
    periodKey: "2026-11-09",
    answers: {},
    comment: "",
    commentedBy: null,
    updatedAt: new Date(),
  });

  it("閲覧状況を見られるのは幹部・管理者だけ", () => {
    expect(canSeeViewStats({ isExec: true })).toBe(true);
    expect(canSeeViewStats({ isExec: false })).toBe(false);
  });

  it("自分の週報を見た分は数えず、同じ人の見直しは10分以内なら1回", async () => {
    const db = getMockStore();
    const r = report("wr-1", "staff-5");
    expect(await recordWeeklyReportView(db, "staff-5", r)).toBe(false);
    expect(await recordWeeklyReportView(db, "staff-3", r)).toBe(true);
    expect(await recordWeeklyReportView(db, "staff-3", r)).toBe(false);
    expect(await recordWeeklyReportView(db, "staff-4", r)).toBe(true);
    const logs = await db.listViewLogs({ targetType: VIEW_TARGETS.weeklyReport, periodKeys: ["2026-11-09"] });
    expect(logs.map((l) => l.viewerStaffId).sort()).toEqual(["staff-3", "staff-4"]);
  });

  it("週ごとに、見た人ごとの件数・相手・最後に見た日時と、誰にも見られていない週報を出す", () => {
    const reports = [report("a", "staff-5"), report("b", "staff-6")];
    const at = (h: number) => new Date(`2026-11-14T0${h}:00:00Z`);
    const log = (targetId: string, viewer: string, h: number) => ({
      id: `${targetId}-${viewer}-${h}`,
      targetType: VIEW_TARGETS.weeklyReport,
      targetId,
      ownerStaffId: targetId === "a" ? "staff-5" : "staff-6",
      periodKey: "2026-11-09",
      viewerStaffId: viewer,
      viewedAt: at(h),
    });
    const summary = summarizeWeeklyViews(reports, [
      log("a", "staff-3", 1),
      log("a", "staff-3", 3),
      log("a", "staff-4", 2),
      log("a", "staff-5", 4), // 本人（数えない）
    ]);
    expect(summary.unviewed.map((r) => r.id)).toEqual(["b"]);
    const exec = summary.byViewer.find((v) => v.viewerStaffId === "staff-3")!;
    expect(exec).toMatchObject({ reportCount: 1, totalViews: 2, ownerStaffIds: ["staff-5"] });
    expect(exec.lastViewedAt).toEqual(at(3));
    expect(summary.byViewer.some((v) => v.viewerStaffId === "staff-5")).toBe(false);
    expect(summary.viewersByReport.get("a")?.map((v) => v.viewerStaffId)).toEqual(["staff-3", "staff-4"]);
  });
});
