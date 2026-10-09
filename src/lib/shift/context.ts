// シフト表の自動作成・警告計算の共通入力をDBから組み立てる。
// 「希望休・勤務できる店舗・基本パターン・個別調整・前月の出勤・職種・段数・ランク・所属店舗・
//   全員参加の日・会議の参加者」を1か所で作り、自動作成（actions）とシフト画面の警告（page）で
// 同じ前提が使われるようにする。

import { addMonths, monthRange } from "@/lib/date";
import { isAllHands, participantsOf } from "@/lib/eni/committees";
import { normalizeTiers } from "@/lib/eni/forms";
import { buildMonthSchedule, workingDatesOf } from "@/lib/shift/month";
import { listRequestStatuses, type RequestStatus } from "@/lib/shift/requests";
import type {
  AssistantRank,
  DataStore,
  DayoffRequest,
  JobType,
  Meeting,
  ScheduleOverride,
  ShiftAssignment,
  ShiftPreference,
  Staff,
  Store,
  WorkPatternDay,
} from "@/lib/data/types";
import type { AssignContext, OverrideDay, PatternDay } from "@/lib/shift/assign";

export interface ShiftMonthInputs extends AssignContext {
  /** 基本パターン（出勤する曜日がある人だけ）・個別調整（自動作成の前提として必ず持つ） */
  patterns: Map<string, Map<number, PatternDay>>;
  overrides: Map<string, Map<string, OverrideDay>>;
  stores: Store[];
  staffList: Staff[];
  /** 在籍中のスタッフ（表の列） */
  activeStaff: Staff[];
  /** 会議名の参照用（警告文で「幹部会議の参加者」と出すため） */
  meetings: Meeting[];
  /** 自動作成の対象外（基本パターンも希望休の提出も個別調整の出勤もない人） */
  excludedStaffIds: string[];
  /** 自動作成の対象だが、希望休をまだ出していない人（基本パターンどおりで作る） */
  unsubmittedStaffIds: string[];
  /** 勤務できる店舗を本人が選んだ人（それ以外は所属店舗に入れる） */
  explicitStores: Set<string>;
  /** 希望休の提出状況（staffId → 状況。未提出の人はキーが無い） */
  requestStatuses: Map<string, RequestStatus>;
  /** 画面表示用の元データ */
  assignments: ShiftAssignment[];
  dayoffs: DayoffRequest[];
  patternRows: WorkPatternDay[];
  overrideRows: ScheduleOverride[];
}

export async function buildShiftMonthInputs(db: DataStore, month: string): Promise<ShiftMonthInputs> {
  const range = monthRange(month);
  const prevMonth = addMonths(month, -1);
  const prevRange = monthRange(prevMonth);
  const [
    stores,
    staffList,
    legacyRequests,
    available,
    rules,
    patternRows,
    dayoffs,
    overrideRows,
    requestStatuses,
    assignments,
    prevAssignments,
    prevDayoffs,
    prevOverrides,
    meetings,
    committees,
    orgMembers,
  ] = await Promise.all([
    db.listStores(),
    db.listStaff(),
    db.listShiftRequests(month),
    db.listAvailableStores(month),
    db.getShiftRules(),
    db.listWorkPatterns(),
    db.listDayoffRequests(range),
    db.listScheduleOverrides(range),
    listRequestStatuses(db, month),
    db.listShiftAssignments(month),
    db.listShiftAssignments(prevMonth),
    db.listDayoffRequests(prevRange),
    db.listScheduleOverrides(prevRange),
    db.listMeetings(range),
    db.listCommittees(),
    db.listOrgMembers(),
  ]);

  const activeStaff = staffList.filter((s) => s.isActive);
  const storeIdSet = new Set(stores.map((s) => s.id));

  // 希望：希望休（休み）＋旧シフト希望の名残（早番・遅番。休みもあれば休みとして扱う）
  const prefs = new Map<string, Map<string, ShiftPreference>>();
  const setPref = (staffId: string, date: string, pref: ShiftPreference) => {
    if (!prefs.has(staffId)) prefs.set(staffId, new Map());
    const cur = prefs.get(staffId)!.get(date);
    if (cur !== "off") prefs.get(staffId)!.set(date, pref);
  };
  for (const r of legacyRequests) setPref(r.staffId, r.date, r.preference);
  for (const d of dayoffs) setPref(d.staffId, d.date, "off");

  // 基本パターン（出勤する曜日が1つでもある人だけ。全部お休みのパターンは「未設定」と同じに扱う）
  const patterns = new Map<string, Map<number, PatternDay>>();
  for (const p of patternRows) {
    if (!patterns.has(p.staffId)) patterns.set(p.staffId, new Map());
    patterns.get(p.staffId)!.set(p.weekday, { isWorking: p.isWorking, startTime: p.startTime, endTime: p.endTime });
  }
  for (const [staffId, days] of patterns) {
    if (![...days.values()].some((d) => d.isWorking)) patterns.delete(staffId);
  }

  // 個別調整（シフト表を作る前に管理者が決めた日）
  const overrides = new Map<string, Map<string, OverrideDay>>();
  for (const o of overrideRows) {
    if (!overrides.has(o.staffId)) overrides.set(o.staffId, new Map());
    overrides.get(o.staffId)!.set(o.date, {
      isWorking: o.isWorking,
      startTime: o.startTime,
      endTime: o.endTime,
      note: o.note,
    });
  }

  // 自動作成の対象：希望休を出した人・基本パターンのある人・個別調整で出勤の日がある人
  const submitted = (id: string) => requestStatuses.get(id)?.submitted ?? false;
  const inRoster = (s: Staff) =>
    submitted(s.id) ||
    patterns.has(s.id) ||
    [...(overrides.get(s.id)?.values() ?? [])].some((o) => o.isWorking);
  const roster = activeStaff.filter(inRoster);
  const excludedStaffIds = activeStaff.filter((s) => !inRoster(s)).map((s) => s.id);
  const unsubmittedStaffIds = roster.filter((s) => !submitted(s.id)).map((s) => s.id);

  // 勤務できる店舗：本人が選んだ店舗。選んでいなければ所属店舗（所属店舗が無効なら全店舗）
  const explicit = new Map<string, Set<string>>();
  for (const a of available) {
    if (!storeIdSet.has(a.storeId)) continue;
    if (!explicit.has(a.staffId)) explicit.set(a.staffId, new Set());
    explicit.get(a.staffId)!.add(a.storeId);
  }
  const availableStores = new Map<string, Set<string>>();
  for (const s of roster) {
    const chosen = explicit.get(s.id);
    if (chosen && chosen.size > 0) availableStores.set(s.id, chosen);
    else if (storeIdSet.has(s.storeId)) availableStores.set(s.id, new Set([s.storeId]));
    else availableStores.set(s.id, new Set(storeIdSet));
  }
  const explicitStores = new Set([...explicit.keys()].filter((id) => (explicit.get(id)?.size ?? 0) > 0));

  // 前月に出勤した日（月またぎの連勤判定）。前月にシフト表が無ければ「いつもどおりの予定」で数える
  const prevSchedule = buildMonthSchedule({
    month: prevMonth,
    staff: activeStaff,
    patterns: patternRows,
    dayoffs: prevDayoffs,
    overrides: prevOverrides,
    assignments: prevAssignments,
    showDraft: true,
  });
  const prevMonthAssignedDates = new Map<string, Set<string>>();
  for (const s of activeStaff) prevMonthAssignedDates.set(s.id, workingDatesOf(prevSchedule, s.id));

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
    staffIds: roster.map((s) => s.id),
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
    patterns,
    overrides,
    stores,
    staffList,
    activeStaff,
    meetings,
    excludedStaffIds,
    unsubmittedStaffIds,
    explicitStores,
    requestStatuses,
    assignments,
    dayoffs,
    patternRows,
    overrideRows,
  };
}

/** その日の会議名（警告文用。複数あれば「・」でつなぐ） */
export function meetingNamesOn(meetings: Meeting[], date: string, committeeNames: Map<string, string>): string {
  const names = meetings
    .filter((m) => m.meetingDate === date)
    .map((m) => committeeNames.get(m.committee) || m.title || (m.meetingType === "1on1" ? "1on1" : "ミーティング"));
  return [...new Set(names)].join("・");
}
