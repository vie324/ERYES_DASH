// 依頼2（51・17）：全体共有ルーム（投稿できる人・確認しました）と通知（種類ごとのオン・オフ・毎朝の時刻）
import { describe, expect, it } from "vitest";
import { acknowledgementStatus, canPostToAllRoom, syncAllRoomMembers, ALL_ROOM_KEY } from "@/lib/chat";
import { filterByPreference, normalizeDisabledKinds } from "@/lib/push/kinds";
import { currentJstHour, jstHourFromCronSchedule, shouldSendMorningReminder } from "@/lib/push/morning";
import { ALL_ROOM_POSTERS_KEY, MORNING_REMINDER_HOUR_KEY, choiceSettingOf } from "@/lib/settings";
import { getMockStore } from "@/lib/data/mock-store";
import type { Staff } from "@/lib/data/types";

const person = (id: string, isActive = true): Staff => ({
  id,
  storeId: "store-4",
  name: id,
  loginId: id,
  role: "staff",
  jobType: "",
  rank: "",
  isExecutive: false,
  isOwner: false,
  mission: "",
  tiers: 1,
  themeColor: "",
  fixedOvertimeHours: 20,
  isActive,
});

describe("全体共有に投稿できる人", () => {
  const staff = { isAdmin: false, isExec: false };
  const exec = { isAdmin: false, isExec: true };
  const admin = { isAdmin: true, isExec: true };
  it("初期値（全員）なら誰でも投稿できる", () => {
    expect(canPostToAllRoom("all", staff)).toBe(true);
  });
  it("「幹部と管理者だけ」「管理者だけ」に絞れる", () => {
    expect(canPostToAllRoom("exec", staff)).toBe(false);
    expect(canPostToAllRoom("exec", exec)).toBe(true);
    expect(canPostToAllRoom("admin", exec)).toBe(false);
    expect(canPostToAllRoom("admin", admin)).toBe(true);
  });
  it("設定が無い・選択肢にない値は初期値（全員）として読む", () => {
    expect(choiceSettingOf([], ALL_ROOM_POSTERS_KEY)).toBe("all");
    expect(choiceSettingOf([{ key: ALL_ROOM_POSTERS_KEY, value: "everyone" }], ALL_ROOM_POSTERS_KEY)).toBe("all");
    expect(choiceSettingOf([{ key: ALL_ROOM_POSTERS_KEY, value: "exec" }], ALL_ROOM_POSTERS_KEY)).toBe("exec");
  });
});

describe("確認しました", () => {
  it("送った本人と退職者を除いて、押した人・まだの人に分ける", () => {
    const members = [person("a"), person("b"), person("c"), person("x", false)];
    const status = acknowledgementStatus({ id: "m1", senderId: "a" }, members, [
      { messageId: "m1", staffId: "c", acknowledgedAt: new Date("2026-11-14T01:00:00Z") },
      { messageId: "m2", staffId: "b", acknowledgedAt: new Date() },
    ]);
    expect(status.done.map((d) => d.staff.id)).toEqual(["c"]);
    expect(status.pending.map((s) => s.id)).toEqual(["b"]);
  });

  it("同じ人が何度押しても1件", async () => {
    const db = getMockStore();
    await db.acknowledgeChatMessage("msg-x", "staff-4");
    await db.acknowledgeChatMessage("msg-x", "staff-4");
    expect(await db.listChatAcknowledgements(["msg-x"])).toHaveLength(1);
  });
});

describe("全体共有ルームへの自動参加", () => {
  it("新しく入ったスタッフも全体共有に入る（退出の操作はない）", async () => {
    const db = getMockStore();
    const created = await db.createStaff({
      storeId: "store-4",
      name: "新人 テスト",
      loginId: `new-${Date.now()}`,
      passwordHash: "x",
      role: "staff",
      fixedOvertimeHours: 20,
    });
    await syncAllRoomMembers(db);
    const rooms = await db.listChatRooms(created.id);
    expect(rooms.some((r) => r.roomKey === ALL_ROOM_KEY)).toBe(true);
  });
});

describe("通知の種類ごとのオン・オフ", () => {
  it("止めている人には送らない（設定の無い人には送る）", () => {
    const prefs = [
      { staffId: "a", disabledKinds: ["chat"] },
      { staffId: "b", disabledKinds: ["morning"] },
    ];
    expect(filterByPreference(["a", "b", "c"], prefs, "chat")).toEqual(["b", "c"]);
    expect(filterByPreference(["a", "b", "c"], prefs, "morning")).toEqual(["a", "c"]);
    // 種類を付けない通知（テスト通知など）は全員に送る
    expect(filterByPreference(["a", "b", "c"], prefs, undefined)).toEqual(["a", "b", "c"]);
  });

  it("保存前に、知らない種類は落とす", () => {
    expect(normalizeDisabledKinds(["chat", "chat", "unknown", 3])).toEqual(["chat"]);
  });

  it("設定はユーザーごとに保存され、入れ替えできる", async () => {
    const db = getMockStore();
    await db.setPushPreference("staff-5", ["chat", "thanks"]);
    await db.setPushPreference("staff-5", ["thanks"]);
    expect((await db.listPushPreferences(["staff-5"]))[0].disabledKinds).toEqual(["thanks"]);
  });
});

describe("毎朝のリマインドの時刻", () => {
  it("定時実行の式（UTC）から日本時間の時を読む", () => {
    expect(jstHourFromCronSchedule("0 0 * * *")).toBe(9);
    expect(jstHourFromCronSchedule("0 21 * * *")).toBe(6);
    expect(jstHourFromCronSchedule("0 3 * * *")).toBe(12);
    expect(jstHourFromCronSchedule(null)).toBeNull();
    expect(jstHourFromCronSchedule("bad")).toBeNull();
    expect(currentJstHour(new Date("2026-11-14T00:30:00Z"))).toBe(9);
  });

  it("選んだ時刻の回で1日1回だけ送る（届かなかった回は次の回で送る）", () => {
    const base = { configuredHour: 9, lastSentOn: "", today: "2026-11-14" };
    expect(shouldSendMorningReminder({ ...base, slotHour: 8 })).toBe(false);
    expect(shouldSendMorningReminder({ ...base, slotHour: 9 })).toBe(true);
    expect(shouldSendMorningReminder({ ...base, slotHour: 10 })).toBe(true);
    expect(shouldSendMorningReminder({ ...base, slotHour: 10, lastSentOn: "2026-11-14" })).toBe(false);
    expect(shouldSendMorningReminder({ ...base, slotHour: 9, lastSentOn: "2026-11-13" })).toBe(true);
  });

  it("時刻の設定は初期値9時で、選択肢にない値は使わない", () => {
    expect(choiceSettingOf([], MORNING_REMINDER_HOUR_KEY)).toBe("9");
    expect(choiceSettingOf([{ key: MORNING_REMINDER_HOUR_KEY, value: "7" }], MORNING_REMINDER_HOUR_KEY)).toBe("7");
    expect(choiceSettingOf([{ key: MORNING_REMINDER_HOUR_KEY, value: "3" }], MORNING_REMINDER_HOUR_KEY)).toBe("9");
  });
});
