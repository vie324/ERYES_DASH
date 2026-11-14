// 依頼5（64・81）：イーリスの日報へのコメント／イーリスの予約LINE
//  デモのアカウント：staff-admin＝管理者／staff-manager＝店舗の管理者（担当＝EREYSの3店舗）／
//                    staff-1・staff-2＝EREYSのスタッフ（store-1）／staff-3〜6＝ENiのスタッフ（store-4）
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getMockStore } from "@/lib/data/mock-store";
import { addDays, jstDayBoundsUtc, todayJst } from "@/lib/date";
import {
  canCommentOnDailyReport,
  canViewDailyReport,
  countUncommentedReports,
  isReportReviewer,
  postDailyReportComment,
  reviewableStaff,
} from "@/lib/eyes/report-comments";
import {
  DEFAULT_LINE_NOTICE_SETTINGS,
  isReservationKeyword,
  jstHourFromSchedule,
  linkCandidates,
  normalizePhone,
  parseLineNoticeSettings,
  renderNotice,
  runScheduledNotices,
  sendAppointmentNotice,
  sendCompletionNotice,
} from "@/lib/line/appointment-notices";
import { getMockSendLogs } from "@/lib/line/client";
import { safeInboxTarget } from "@/lib/inbox";
import { POST as lineWebhook } from "@/app/api/line/webhook/route";
import type { Customer, Staff } from "@/lib/data/types";

const db = getMockStore();
const today = todayJst();

async function staff(id: string): Promise<Staff> {
  const s = await db.getStaff(id);
  if (!s) throw new Error(`${id} がいません`);
  return s;
}

// ---------------------------------------------------------------- 64 日報へのコメント

describe("イーリスの日報へのコメント：判定はロールと担当店舗（名前では判定しない）", () => {
  it("店舗の管理者は担当店舗のスタッフの日報にだけコメントできる", async () => {
    const manager = await staff("staff-manager");
    expect(manager.role).toBe("manager");
    expect(isReportReviewer(manager)).toBe(true);
    expect(canCommentOnDailyReport(manager, await staff("staff-1"))).toBe(true);
    // ENi の店舗（担当外）のスタッフにはコメントできない
    expect(canCommentOnDailyReport(manager, await staff("staff-4"))).toBe(false);
    const targets = reviewableStaff(manager, await db.listStaff()).map((s) => s.id);
    expect(targets).toContain("staff-1");
    expect(targets).not.toContain("staff-3");
  });

  it("同じ人でも、担当店舗を外せばコメントできない（名前ではなく担当店舗で決まる）", async () => {
    const manager = await staff("staff-manager");
    const noStores = { ...manager, managedStoreIds: [] };
    expect(isReportReviewer(noStores)).toBe(false);
    expect(canCommentOnDailyReport(noStores, await staff("staff-1"))).toBe(false);
    // ロールがスタッフなら、担当店舗が入っていてもコメントできない
    const asStaff = { ...manager, role: "staff" as const };
    expect(canCommentOnDailyReport(asStaff, await staff("staff-1"))).toBe(false);
  });

  it("管理者はどの日報にもコメントできる／スタッフ同士は読めない／本人は読める", async () => {
    const admin = await staff("staff-admin");
    const s1 = await staff("staff-1");
    const s2 = await staff("staff-2");
    expect(canCommentOnDailyReport(admin, s1)).toBe(true);
    expect(canViewDailyReport(s2, s1)).toBe(false);
    expect(canCommentOnDailyReport(s2, s1)).toBe(false);
    expect(canViewDailyReport(s1, s1)).toBe(true);
    // 本人の分は「返信」なので、コメントする側には数えない
    expect(canCommentOnDailyReport(s1, s1)).toBe(false);
  });

  it("コメントすると本人にお知らせが届き、本人が返信するとコメントした人に届く", async () => {
    const manager = await staff("staff-manager");
    const s2 = await staff("staff-2");
    const report = (await db.listDailyReports({ staffId: "staff-2", from: addDays(today, -40), to: today }))[0];
    expect(report).toBeTruthy();
    const before2 = await db.countUnreadAppNotifications("staff-2");
    await postDailyReportComment(db, { report, author: s2, poster: manager, body: "丁寧なカウンセリング、素晴らしいです" });
    expect(await db.countUnreadAppNotifications("staff-2")).toBe(before2 + 1);
    const [n] = await db.listAppNotifications("staff-2", 1);
    expect(n.title).toBe("日報にコメントが届きました");
    expect(n.href).toBe(`/staff/daily-reports/${report.id}`);
    // ほかのスタッフには届かない
    expect((await db.listAppNotifications("staff-1", 50)).some((x) => x.refId === report.id)).toBe(false);

    const beforeManager = await db.countUnreadAppNotifications("staff-manager");
    await postDailyReportComment(db, { report, author: s2, poster: s2, body: "ありがとうございます！" });
    expect(await db.countUnreadAppNotifications("staff-manager")).toBe(beforeManager + 1);
    const [reply] = await db.listAppNotifications("staff-manager", 1);
    expect(reply.title).toBe("日報に返信がありました");

    // 開いたら既読になる
    await db.markAppNotificationsRead("staff-2", report.id);
    expect((await db.listAppNotifications("staff-2", 50)).filter((x) => x.refId === report.id && !x.readAt)).toHaveLength(0);
  });

  it("お知らせから移る先はアプリの中の画面だけ（外のサイトへは飛ばさない）", () => {
    expect(safeInboxTarget("/staff/daily-reports/abc")).toBe("/staff/daily-reports/abc");
    expect(safeInboxTarget("/admin/appointments")).toBe("/admin/appointments");
    expect(safeInboxTarget("https://example.com")).toBe("/staff/inbox");
    expect(safeInboxTarget("//example.com/staff")).toBe("/staff/inbox");
    expect(safeInboxTarget("/staffs")).toBe("/staff/inbox");
    expect(safeInboxTarget(null)).toBe("/staff/inbox");
  });

  it("まだコメントのない日報の数（コメントする人のバッジ）は担当店舗の分だけ", async () => {
    const manager = await staff("staff-manager");
    const s1 = await staff("staff-1");
    const n = await countUncommentedReports(db, manager, today);
    expect(n).toBeGreaterThanOrEqual(0);
    expect(await countUncommentedReports(db, s1, today)).toBe(0);
  });
});

// ---------------------------------------------------------------- 81 予約LINE

describe("LINEのお知らせの設定：管理画面で変えられ、おかしな値は初期値", () => {
  it("初期値：予約完了・3日前・前日は送る、1週間前は止めている", () => {
    const s = parseLineNoticeSettings(null);
    expect(s.completion.enabled).toBe(true);
    expect(s.three_days.enabled).toBe(true);
    expect(s.day_before.enabled).toBe(true);
    expect(s.week_before.enabled).toBe(false);
    expect(s.keywords).toEqual(["予約確認"]);
  });

  it("保存された値を読み、選べない時刻・空の文面は初期値に戻す", () => {
    const s = parseLineNoticeSettings(
      JSON.stringify({ day_before: { enabled: false, hour: 3, template: "" }, three_days: { hour: 12 }, keywords: [" 予約 ", ""] })
    );
    expect(s.day_before.enabled).toBe(false);
    expect(s.day_before.hour).toBe(DEFAULT_LINE_NOTICE_SETTINGS.day_before.hour);
    expect(s.day_before.template).toBe(DEFAULT_LINE_NOTICE_SETTINGS.day_before.template);
    expect(s.three_days.hour).toBe(12);
    expect(s.keywords).toEqual(["予約"]);
    expect(parseLineNoticeSettings("{壊れた")).toEqual(DEFAULT_LINE_NOTICE_SETTINGS);
  });

  it("差し込み・電話番号・合言葉・定時実行の時刻", () => {
    expect(renderNotice("{店舗名}：{お名前} 様 {日時}", { name: "山田", when: "11月17日", store: "EREYS", selfService: "" })).toBe(
      "EREYS：山田 様 11月17日"
    );
    expect(normalizePhone("０９０－１２３４－５６７８")).toBe("09012345678");
    expect(normalizePhone("+81 90 1234 5678")).toBe("09012345678");
    expect(normalizePhone("山田 花子")).toBe("");
    expect(normalizePhone("1234")).toBe("");
    expect(isReservationKeyword(" 予約確認 ", ["予約確認"])).toBe(true);
    expect(isReservationKeyword("予約確認したいです", ["予約確認"])).toBe(false);
    expect(jstHourFromSchedule("0 10 * * *")).toBe(19);
    expect(jstHourFromSchedule("0 23 * * *")).toBe(8);
  });
});

describe("LINEとつなぐ候補：同じ電話番号でも自動ではつながない", () => {
  const c = (p: Partial<Customer>): Customer => ({ id: "x", lineUserId: null, fullName: "", phone: "", createdAt: new Date(), ...p });
  it("店舗が入れた未連携のお客様と、同じ電話番号のLINEのお客様だけが候補", () => {
    const list = linkCandidates([
      c({ id: "line-a", lineUserId: "U1", fullName: "鈴木 あや", phone: "08033334444" }),
      c({ id: "shop-a", fullName: "鈴木あや", phone: "08033334444" }),
      c({ id: "shop-b", fullName: "別の人", phone: "09000000000" }),
      c({ id: "line-c", lineUserId: "U3", fullName: "伊藤 まな", phone: "" }),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].lineCustomer.id).toBe("line-a");
    expect(list[0].unlinked.id).toBe("shop-a");
    expect(list[0].nameMatches).toBe(true);
  });

  it("つなぐと予約がLINEのお客様に移り、未連携の記録は消える", async () => {
    const before = await db.listNextAppointments({ customerId: "cust-4" });
    expect(before.length).toBeGreaterThan(0);
    await db.mergeCustomers("cust-2", "cust-4");
    expect(await db.getCustomer("cust-4")).toBeNull();
    const moved = await db.listNextAppointments({ customerId: "cust-2" });
    expect(moved.some((a) => a.id === before[0].id)).toBe(true);
  });
});

describe("予約のお知らせ：二重に送らない・対象日と時刻・LINE未連携には送らない", () => {
  const settings = parseLineNoticeSettings(null);

  it("同じお知らせは2回送らない（送信の札）", async () => {
    const appointment = await db.createNextAppointment({
      customerId: "cust-1",
      scheduledAt: new Date(jstDayBoundsUtc(addDays(today, 10)).start.getTime() + 13 * 3600e3),
      staffId: null,
    });
    expect(await sendCompletionNotice(db, appointment, settings)).toBe("sent");
    expect(await sendCompletionNotice(db, appointment, settings)).toBe("duplicate");
    const logs = await db.listAppointmentNoticeLogs({ appointmentIds: [appointment.id] });
    expect(logs.filter((l) => l.status === "sent")).toHaveLength(1);
    expect(logs[0].mode).toBe("mock"); // LINEのキーが未設定＝実際には送っていない
  });

  it("LINE未連携のお客様には送らず、「送らなかった」を1回だけ残す", async () => {
    const shop = await db.createCustomer({ lineUserId: null, fullName: "店舗で入れた人", phone: "09099998888" });
    const appointment = await db.createNextAppointment({
      customerId: shop.id,
      scheduledAt: new Date(Date.now() + 5 * 86400e3),
      staffId: null,
    });
    const store = await db.getStore();
    const args = { appointment, customer: shop, kind: "completion" as const, template: "x", storeName: store.name };
    expect(await sendAppointmentNotice(db, args)).toBe("skipped");
    expect(await sendAppointmentNotice(db, args)).toBe("skipped");
    const logs = await db.listAppointmentNoticeLogs({ appointmentIds: [appointment.id] });
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("skipped");
  });

  it("前日の確認は「送る時刻」の回から送り、それより前の回では送らない。日時を変えたら送り直せる", async () => {
    const tomorrowAt = new Date(jstDayBoundsUtc(addDays(today, 1)).start.getTime() + 15 * 3600e3);
    const appointment = await db.createNextAppointment({ customerId: "cust-3", scheduledAt: tomorrowAt, staffId: null });
    const early = await runScheduledNotices(db, { today, slotHour: 10, settings });
    expect(early.find((s) => s.kind === "day_before")).toBeUndefined();
    await runScheduledNotices(db, { today, slotHour: 19, settings });
    await runScheduledNotices(db, { today, slotHour: 20, settings }); // 後の回（拾い直し）でも二重には送らない
    let logs = await db.listAppointmentNoticeLogs({ appointmentIds: [appointment.id] });
    expect(logs.filter((l) => l.kind === "day_before" && l.status === "sent")).toHaveLength(1);
    expect((await db.getNextAppointment(appointment.id))!.reminderSentAt).not.toBeNull();

    // 日時を変えた（翌日の別の時間）→ 新しい日時の分はもう一度送る
    const changed = new Date(tomorrowAt.getTime() + 3600e3);
    await db.updateNextAppointment(appointment.id, { scheduledAt: changed });
    await runScheduledNotices(db, { today, slotHour: 19, settings });
    logs = await db.listAppointmentNoticeLogs({ appointmentIds: [appointment.id] });
    expect(logs.filter((l) => l.kind === "day_before" && l.status === "sent")).toHaveLength(2);
  });

  it("3日前のお知らせは3日後の予約だけ。キャンセルされた予約には送らない", async () => {
    const at = new Date(jstDayBoundsUtc(addDays(today, 3)).start.getTime() + 12 * 3600e3);
    const kept = await db.createNextAppointment({ customerId: "cust-1", scheduledAt: at, staffId: null });
    const cancelled = await db.createNextAppointment({ customerId: "cust-1", scheduledAt: new Date(at.getTime() + 3600e3), staffId: null });
    await db.updateNextAppointment(cancelled.id, { status: "cancelled" });
    await runScheduledNotices(db, { today, slotHour: 19, settings });
    const logs = await db.listAppointmentNoticeLogs({ appointmentIds: [kept.id, cancelled.id] });
    expect(logs.some((l) => l.appointmentId === kept.id && l.kind === "three_days" && l.status === "sent")).toBe(true);
    expect(logs.some((l) => l.appointmentId === cancelled.id)).toBe(false);
  });

  it("止めた種類は送らない", async () => {
    const off = parseLineNoticeSettings(JSON.stringify({ three_days: { enabled: false } }));
    const summary = await runScheduledNotices(db, { today, slotHour: 21, settings: off });
    expect(summary.find((s) => s.kind === "three_days")).toBeUndefined();
  });
});

describe("LINEの「予約確認」：そのLINEのお客様の予約だけを返す", () => {
  async function send(userId: string, text: string): Promise<string> {
    const replyToken = `token-${userId}-${Math.random().toString(36).slice(2)}`;
    const req = new NextRequest("http://localhost/api/line/webhook", {
      method: "POST",
      body: JSON.stringify({ events: [{ type: "message", replyToken, source: { type: "user", userId }, message: { type: "text", text } }] }),
    });
    await lineWebhook(req);
    return getMockSendLogs().find((l) => l.to === replyToken)?.text ?? "";
  }

  it("つながっているお客様には、自分の次の予約を返す", async () => {
    const reply = await send("mock-user-1", "予約確認");
    expect(reply).toContain("高橋 ゆい 様");
    expect(reply).toMatch(/・\d{4}年\d+月\d+日/);
    // ほかのお客様の名前は入らない
    expect(reply).not.toContain("鈴木");
    expect(reply).not.toContain("伊藤");
  });

  it("知らないLINEから「予約確認」が来ても、名前として登録せず、まずお名前をお願いする", async () => {
    const before = (await db.listCustomers()).length;
    const reply = await send("unknown-user", "予約確認");
    expect(reply).toContain("フルネーム");
    expect((await db.listCustomers()).length).toBe(before);
    expect(await db.getCustomerByLineUserId("unknown-user")).toBeNull();
  });

  it("お名前を登録すると電話番号をお願いし、電話番号を送ると記録に入る（ほかの人の記録の有無は返事で分からない）", async () => {
    const r1 = await send("new-user", "山本 さくら");
    expect(r1).toContain("お電話番号");
    const r2 = await send("new-user", "080-3333-4444");
    expect(r2).toBe(DEFAULT_LINE_NOTICE_SETTINGS.phoneSaved);
    expect((await db.getCustomerByLineUserId("new-user"))?.phone).toBe("08033334444");
  });
});
