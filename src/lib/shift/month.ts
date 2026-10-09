// 月のシフト（スタッフ×日）の組み立て。シフトの画面（スタッフ・管理者）はすべてここを通す。
//
// 以前は「出勤スケジュール（基本パターン＋希望休）」と「旧シフト機能（店舗・早番／遅番）」が
// 別々に動いていて、片方で出した希望休がもう片方に入らなかった。いまは1つにまとめている。
//  ・シフト表（自動作成 → 調整 → 公開）を作った月：シフト表がそのまま予定になる
//      下書きのうちは管理者にだけ見え、スタッフには「いつもどおりの予定」を出す
//  ・シフト表を作っていない月：基本パターン＋希望休＋個別調整で「いつもどおりの予定」を出す
//  ・どちらの場合も、希望休（理由・有休）は印として残す（出勤に変えられた日も分かるように）

import { datesOfMonth, weekdayOf } from "@/lib/date";
import { compactTimeRange, resolveScheduleDay } from "@/lib/schedule";
import type {
  DayoffRequest,
  ScheduleOverride,
  ShiftAssignment,
  ShiftType,
  Staff,
  WorkPatternDay,
} from "@/lib/data/types";

/** 月のシフト表の状態：未作成／下書き（管理者のみ）／公開中 */
export type ShiftStatus = "none" | "draft" | "confirmed";

export const SHIFT_STATUS_LABEL: Record<ShiftStatus, string> = {
  none: "未作成",
  draft: "下書き",
  confirmed: "公開中",
};

export interface ShiftCell {
  staffId: string;
  date: string;
  working: boolean;
  startTime: string;
  endTime: string;
  /** 出勤する店舗。シフト表の月は割当の店舗、それ以外は所属店舗（休みの日は空） */
  storeId: string;
  /** 早番・遅番（シフト表の月だけ。それ以外は空） */
  shiftType: ShiftType | "";
  /** 管理者のメモ（シフト表のメモ・個別調整のメモ） */
  note: string;
  /** どこから決まったか：shift=シフト表／override=個別調整／dayoff=希望休／pattern=基本パターン／none=パターン未設定 */
  source: "shift" | "override" | "dayoff" | "pattern" | "none";
  /** その日の希望休（出勤に変えられていても残す） */
  dayoff: { reason: string; paidLeave: boolean } | null;
}

/** 月のシフト表の状態（割当が1件もなければ未作成、1件でも公開済みがあれば公開中） */
export function shiftStatusOf(assignments: ShiftAssignment[]): ShiftStatus {
  if (assignments.length === 0) return "none";
  return assignments.some((a) => a.status === "confirmed") ? "confirmed" : "draft";
}

export interface MonthSchedule {
  month: string;
  dates: string[];
  status: ShiftStatus;
  /** 表に出しているのがシフト表か（false＝基本パターン＋希望休＋個別調整の「いつもどおりの予定」） */
  fromShift: boolean;
  cell(staffId: string, date: string): ShiftCell;
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(row);
  }
  return map;
}

export function buildMonthSchedule(input: {
  month: string;
  staff: Pick<Staff, "id" | "storeId">[];
  patterns: WorkPatternDay[];
  dayoffs: DayoffRequest[];
  overrides: ScheduleOverride[];
  assignments: ShiftAssignment[];
  /** 下書きのシフト表も表に出すか（管理者の画面だけ true） */
  showDraft: boolean;
}): MonthSchedule {
  const status = shiftStatusOf(input.assignments);
  const fromShift = status === "confirmed" || (status === "draft" && input.showDraft);
  const homeStore = new Map(input.staff.map((s) => [s.id, s.storeId]));
  const patternsByStaff = groupBy(input.patterns, (p) => p.staffId);
  const dayoffsByStaff = groupBy(input.dayoffs, (d) => d.staffId);
  const overridesByStaff = groupBy(input.overrides, (o) => o.staffId);
  const dayoffAt = new Map(input.dayoffs.map((d) => [`${d.staffId}|${d.date}`, d]));
  const assignmentAt = new Map(input.assignments.map((a) => [`${a.staffId}|${a.date}`, a]));
  const cache = new Map<string, ShiftCell>();

  const resolve = (staffId: string, date: string): ShiftCell => {
    const d = dayoffAt.get(`${staffId}|${date}`);
    const dayoff = d ? { reason: d.reason, paidLeave: d.paidLeave } : null;
    if (fromShift) {
      const a = assignmentAt.get(`${staffId}|${date}`);
      if (a) {
        return {
          staffId,
          date,
          working: true,
          startTime: a.startTime,
          endTime: a.endTime,
          storeId: a.storeId,
          shiftType: a.shiftType,
          note: a.note,
          source: "shift",
          dayoff,
        };
      }
      return {
        staffId,
        date,
        working: false,
        startTime: "",
        endTime: "",
        storeId: "",
        shiftType: "",
        note: "",
        source: dayoff ? "dayoff" : "shift",
        dayoff,
      };
    }
    const day = resolveScheduleDay(
      staffId,
      date,
      weekdayOf(date),
      patternsByStaff.get(staffId) ?? [],
      dayoffsByStaff.get(staffId) ?? [],
      overridesByStaff.get(staffId) ?? []
    );
    return {
      staffId,
      date,
      working: day.working,
      startTime: day.startTime,
      endTime: day.endTime,
      storeId: day.working ? (homeStore.get(staffId) ?? "") : "",
      shiftType: "",
      // 希望休の理由は dayoff に分けて持つ（note は管理者のメモだけ）
      note: day.source === "override" ? day.note : "",
      source: day.source,
      dayoff,
    };
  };

  return {
    month: input.month,
    dates: datesOfMonth(input.month),
    status,
    fromShift,
    cell(staffId, date) {
      const key = `${staffId}|${date}`;
      let c = cache.get(key);
      if (!c) {
        c = resolve(staffId, date);
        cache.set(key, c);
      }
      return c;
    },
  };
}

/** 早番・遅番の表示 */
export const SHIFT_TYPE_NAME: Record<ShiftType, string> = { early: "早番", late: "遅番" };

/** マスの時間の表示（"10:00-19:00"／時間がなければ早番・遅番／どちらもなければ「出勤」。休みは「休み」） */
export function cellTimeLabel(cell: ShiftCell): string {
  if (!cell.working) return "休み";
  if (cell.startTime && cell.endTime) return `${cell.startTime}-${cell.endTime}`;
  if (cell.shiftType) return SHIFT_TYPE_NAME[cell.shiftType];
  return "出勤";
}

/** 表のマス用の短い表示（"10-19"／"早"／"出"／"休"） */
export function cellShortLabel(cell: ShiftCell): string {
  if (!cell.working) return "休";
  const time = compactTimeRange(cell.startTime, cell.endTime);
  if (time) return time;
  if (cell.shiftType) return cell.shiftType === "early" ? "早" : "遅";
  return "出";
}

/** 休みの理由の表示（「有休」「希望休」など。休みでなければ空） */
export function offKindLabel(cell: ShiftCell): string {
  if (cell.working) return "";
  if (cell.dayoff) return cell.dayoff.paidLeave ? "有休" : "希望休";
  return "";
}

/** その月にそのスタッフが出勤する日（"YYYY-MM-DD" の集合） */
export function workingDatesOf(schedule: MonthSchedule, staffId: string): Set<string> {
  return new Set(schedule.dates.filter((d) => schedule.cell(staffId, d).working));
}

/**
 * 表の見出し用の短い名前（名字だけ）。名字が同じ人がいるときは「佐藤 美」のように名前の1文字目まで出す。
 * 名字と名前のあいだに空白が無い名前は、そのまま出す。
 */
export function shortNames(staff: { id: string; name: string }[]): Map<string, string> {
  const family = (name: string) => name.trim().split(/\s+/)[0] || name;
  const count = new Map<string, number>();
  for (const s of staff) count.set(family(s.name), (count.get(family(s.name)) ?? 0) + 1);
  return new Map(
    staff.map((s) => {
      const f = family(s.name);
      if ((count.get(f) ?? 0) < 2) return [s.id, f];
      const given = s.name.trim().split(/\s+/)[1] ?? "";
      return [s.id, given ? `${f} ${given.slice(0, 1)}` : s.name];
    })
  );
}

/** 店舗名の短縮（「EREYS 渋谷本店」→「渋谷本店」。ブランド名の前置きを外す） */
export function shortStoreName(name: string): string {
  return name.replace(/^(EREYS|ENi)\s*/i, "") || name;
}

/**
 * 業態に合う店舗（店舗名に「ENi」「EREYS」などが入っているもの）。
 * 1つも合わない・全部合うときは全店舗（絞り込まない）。
 */
export function brandStoreIds(stores: { id: string; name: string }[], brandLabel: string): string[] {
  const key = brandLabel.toUpperCase();
  const matched = stores.filter((s) => s.name.toUpperCase().includes(key)).map((s) => s.id);
  return matched.length === 0 ? stores.map((s) => s.id) : matched;
}

/**
 * 表に出すスタッフ：所属店舗が絞り込みの店舗に入っている人と、その月にその店舗で出勤する人。
 * 基本パターンもシフトも無く、1日も出勤しない人（シフトに関わらない管理用アカウントなど）は出さない。
 * keepIds に入っている人（自分）は必ず出す。includeIdle なら関わりのない人も出す（管理者の表）。
 */
export function staffForStores<T extends Pick<Staff, "id" | "storeId">>(
  staff: T[],
  schedule: MonthSchedule,
  storeIds: string[],
  opts: { keepIds?: string[]; includeIdle?: boolean } = {}
): T[] {
  const inStores = new Set(storeIds);
  return staff.filter((s) => {
    if (opts.keepIds?.includes(s.id)) return true;
    const cells = schedule.dates.map((d) => schedule.cell(s.id, d));
    const involved = cells.some((c) => c.working || c.source === "pattern" || c.source === "override" || c.dayoff);
    if (!involved && !opts.includeIdle) return false;
    if (inStores.has(s.storeId)) return true;
    return cells.some((c) => c.working && inStores.has(c.storeId));
  });
}
