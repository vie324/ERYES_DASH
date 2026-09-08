// 自動割当・割当ボードの共通入力をDBから組み立てる。
// 「希望・勤務可能店舗・前月の割当・職種・段数・ランク・所属店舗・全員参加の日・会議の参加者」を
// 1か所で作り、自動割当（actions）とボードの警告計算（page）で同じ前提が使われるようにする。

import { addMonths, monthRange } from "@/lib/date";
import { isAllHands, participantsOf } from "@/lib/eni/committees";
import { normalizeTiers } from "@/lib/eni/forms";
import type { AssistantRank, DataStore, JobType, Meeting, ShiftPreference, Staff, Store } from "@/lib/data/types";
import type { AssignContext } from "@/lib/shift/assign";

export interface ShiftMonthInputs extends AssignContext {
  stores: Store[];
  staffList: Staff[];
  /** 会議名の参照用（警告文で「幹部会議の参加者」と出すため） */
  meetings: Meeting[];
}

export async function buildShiftMonthInputs(db: DataStore, month: string): Promise<ShiftMonthInputs> {
  const [stores, staffList, requests, available, rules, prevAssignments, meetings, committees, orgMembers] =
    await Promise.all([
      db.listStores(),
      db.listStaff(),
      db.listShiftRequests(month),
      db.listAvailableStores(month),
      db.getShiftRules(),
      db.listShiftAssignments(addMonths(month, -1)),
      db.listMeetings(monthRange(month)),
      db.listCommittees(),
      db.listOrgMembers(),
    ]);

  const prefs = new Map<string, Map<string, ShiftPreference>>();
  for (const r of requests) {
    if (!prefs.has(r.staffId)) prefs.set(r.staffId, new Map());
    prefs.get(r.staffId)!.set(r.date, r.preference);
  }
  const availableStores = new Map<string, Set<string>>();
  for (const a of available) {
    if (!availableStores.has(a.staffId)) availableStores.set(a.staffId, new Set());
    availableStores.get(a.staffId)!.add(a.storeId);
  }
  const prevMonthAssignedDates = new Map<string, Set<string>>();
  for (const a of prevAssignments) {
    if (!prevMonthAssignedDates.has(a.staffId)) prevMonthAssignedDates.set(a.staffId, new Set());
    prevMonthAssignedDates.get(a.staffId)!.add(a.date);
  }

  const activeStaff = staffList.filter((s) => s.isActive);
  const jobTypes = new Map<string, JobType>(staffList.map((s) => [s.id, s.jobType]));
  const tiers = new Map<string, number>(staffList.map((s) => [s.id, normalizeTiers(s.tiers)]));
  const ranks = new Map<string, AssistantRank>(staffList.map((s) => [s.id, s.rank]));
  const homeStores = new Map<string, string>(staffList.map((s) => [s.id, s.storeId]));

  // 全員参加イベントの日（しもん塾・全体会議など）は、なるべく全員を出勤にする
  const committeeByKey = new Map(committees.map((c) => [c.committeeKey, c]));
  const allHandsKeys = new Set(committees.filter(isAllHands).map((c) => c.committeeKey));
  const allHandsDates = new Set<string>();
  // 会議（幹部会議など）の参加者は、その日を休みにしない
  const requiredByDate = new Map<string, Set<string>>();
  for (const m of meetings) {
    if (m.meetingType === "all" || allHandsKeys.has(m.committee)) {
      allHandsDates.add(m.meetingDate);
      continue; // 全員参加は allHandsDates 側で扱う（参加者の警告は出さない）
    }
    const committee = m.committee ? committeeByKey.get(m.committee) : undefined;
    const ids = new Set<string>([
      m.hostStaffId,
      ...(m.guestStaffId ? [m.guestStaffId] : []),
      ...m.participants,
      ...(committee ? participantsOf(committee, orgMembers, activeStaff) : []),
    ]);
    if (!requiredByDate.has(m.meetingDate)) requiredByDate.set(m.meetingDate, new Set());
    for (const id of ids) requiredByDate.get(m.meetingDate)!.add(id);
  }

  return {
    targetMonth: month,
    storeIds: stores.map((s) => s.id),
    staffIds: activeStaff.map((s) => s.id),
    prefs,
    availableStores,
    rules,
    prevMonthAssignedDates,
    jobTypes,
    tiers,
    ranks,
    homeStores,
    allHandsDates,
    requiredByDate,
    stores,
    staffList,
    meetings,
  };
}

/** その日の会議名（警告文用。複数あれば「・」でつなぐ） */
export function meetingNamesOn(meetings: Meeting[], date: string, committeeNames: Map<string, string>): string {
  const names = meetings
    .filter((m) => m.meetingDate === date)
    .map((m) => committeeNames.get(m.committee) || m.title || (m.meetingType === "1on1" ? "1on1" : "ミーティング"));
  return [...new Set(names)].join("・");
}
