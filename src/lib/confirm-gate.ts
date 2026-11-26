// 依頼14：予定を確認しないと先に進めない形。
// 全体スケジュール・シフト・チームの予定（自分が出る会議・面接）に新しいもの・変更があると、アプリを開いたときに
// 確認の画面が出て、「確認しました」を押すまでほかの画面に進めない。確認するだけなので数秒で終わる。
//  ・どの予定を確認必須にするかは管理画面で選ぶ（confirm_gate）
//  ・中身が変わったかは「版」（予定の中身から作る短い印）で見る。変わったら、もう一度確認が要る
//  ・誰がいつ確認したかは schedule_acks に残し、幹部・管理者が見られる（/staff/confirmations）
//  ・自分で登録した予定は確認しなくてよい

import { createHash } from "crypto";
import { fx } from "@/lib/data/tables";
import { addDays, addMonths, formatDateJa, formatMonthJa, thisMonthJst, todayJst } from "@/lib/date";
import { readJsonSetting } from "@/lib/feature-settings";
import type { DataStore } from "@/lib/data/types";

export type GateItemType = "company_event" | "shift" | "meeting" | "personal";

export const CONFIRM_GATE_KEY = "confirm_gate";
export interface ConfirmGateSettings {
  enabled: boolean;
  /** 全体スケジュール：all＝すべて／required＝全員参加の予定だけ／off＝確認しない */
  companyEvents: "all" | "required" | "off";
  /** 自分のシフト（公開・変更されたとき） */
  myShift: boolean;
  /** 自分が出る会議（ミーティング） */
  myMeetings: boolean;
  /** 自分の予定に入った面接など */
  personalEvents: boolean;
  /** 何日先までの予定を見るか */
  windowDays: number;
}
export const DEFAULT_CONFIRM_GATE: ConfirmGateSettings = {
  enabled: true,
  companyEvents: "required",
  myShift: true,
  myMeetings: false,
  personalEvents: true,
  windowDays: 60,
};

export async function getConfirmGateSettings(db: DataStore): Promise<ConfirmGateSettings> {
  return readJsonSetting(db, CONFIRM_GATE_KEY, DEFAULT_CONFIRM_GATE);
}

export interface GateItem {
  itemType: GateItemType;
  itemId: string;
  version: string;
  title: string;
  detail: string;
}

function versionOf(v: unknown): string {
  return createHash("sha1").update(JSON.stringify(v)).digest("hex").slice(0, 16);
}

/** 確認が要る予定の一覧（その人の分。まだ確認していない版だけ） */
export async function pendingGateItems(db: DataStore, staffId: string): Promise<GateItem[]> {
  const settings = await getConfirmGateSettings(db);
  if (!settings.enabled) return [];
  const items = await gateItemsFor(db, staffId, settings);
  if (items.length === 0) return [];
  const acks = await fx().scheduleAcks.list({ where: { staffId, itemId: { in: items.map((i) => i.itemId) } } });
  return items.filter((i) => !acks.some((a) => a.itemType === i.itemType && a.itemId === i.itemId && a.version === i.version));
}

/** その人に関係する、確認の対象の予定（確認済みかどうかは見ない） */
export async function gateItemsFor(db: DataStore, staffId: string, settings: ConfirmGateSettings): Promise<GateItem[]> {
  const today = todayJst();
  const until = addDays(today, Math.max(1, Math.min(180, settings.windowDays)));
  const items: GateItem[] = [];

  if (settings.companyEvents !== "off") {
    const events = await db.listCompanyEvents({ from: today, to: until });
    for (const e of events) {
      if (settings.companyEvents === "required" && !e.required) continue;
      if (e.createdBy === staffId) continue;
      items.push({
        itemType: "company_event",
        itemId: e.id,
        version: versionOf([e.startDate, e.endDate, e.startTime, e.title, e.body, e.required]),
        title: `📅 ${e.title}`,
        detail: `${formatDateJa(e.startDate)}${e.endDate !== e.startDate ? `〜${formatDateJa(e.endDate)}` : ""}${e.startTime ? ` ${e.startTime}〜` : ""}${e.required ? "（全員参加）" : ""}`,
      });
    }
  }

  if (settings.myShift) {
    const month = thisMonthJst();
    for (const m of [month, addMonths(month, 1), addMonths(month, 2)]) {
      const mine = (await db.listShiftAssignments(m, staffId)).filter((a) => a.status === "confirmed");
      if (mine.length === 0) continue;
      // 過ぎた日の変更では確認を出さない（今日以降の分で版を作る）
      const future = mine.filter((a) => a.date >= today).sort((a, b) => a.date.localeCompare(b.date));
      if (future.length === 0) continue;
      items.push({
        itemType: "shift",
        itemId: `shift:${m}`,
        version: versionOf(future.map((a) => [a.date, a.startTime, a.endTime, a.storeId])),
        title: `🗓 ${formatMonthJa(m)}のシフト`,
        detail: `出勤 ${mine.length}日（公開・変更されました）`,
      });
    }
  }

  if (settings.myMeetings) {
    const meetings = await db.listMeetings({ from: today, to: until });
    for (const mt of meetings) {
      const member = mt.hostStaffId === staffId || mt.guestStaffId === staffId || mt.participants.includes(staffId);
      if (!member || mt.createdBy === staffId) continue;
      items.push({
        itemType: "meeting",
        itemId: mt.id,
        version: versionOf([mt.meetingDate, mt.startTime, mt.title, mt.committee, mt.participants]),
        title: `👥 ${mt.title || "ミーティング"}`,
        detail: `${formatDateJa(mt.meetingDate)}${mt.startTime ? ` ${mt.startTime}〜` : ""}`,
      });
    }
  }

  if (settings.personalEvents) {
    const rows = await fx().personalEvents.list({ where: { staffId, date: { gte: today, lte: until } } });
    for (const p of rows) {
      items.push({
        itemType: "personal",
        itemId: p.id,
        version: versionOf([p.date, p.startTime, p.endTime, p.title]),
        title: `📌 ${p.title}`,
        detail: `${formatDateJa(p.date)}${p.startTime ? ` ${p.startTime}〜${p.endTime}` : ""}`,
      });
    }
  }
  return items;
}

/** 確認した（まとめて記録） */
export async function acknowledge(staffId: string, items: Pick<GateItem, "itemType" | "itemId" | "version" | "title">[]): Promise<void> {
  const f = fx();
  for (const i of items) {
    const exists = await f.scheduleAcks.find({ staffId, itemType: i.itemType, itemId: i.itemId, version: i.version });
    if (!exists) await f.scheduleAcks.insert({ staffId, itemType: i.itemType, itemId: i.itemId, version: i.version, title: i.title.slice(0, 200), ackedAt: new Date() });
  }
}
