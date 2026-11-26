// 依頼12：出退勤とシフトを一体にする。
//  ・その日のシフト（公開中のシフト表／シフト表の無い月は「いつもどおりの予定」）と、打刻をひもづける
//  ・遅刻・早退・シフト外の出勤・打刻なし に自動で印をつける（猶予の分数は管理画面で変える）
//  ・打刻忘れ・打刻の修正は本人が申請し、店長・管理者が承認したものだけ、その時刻で数える（申請も承認も履歴に残る）
//  ・人ごとの月の勤務時間を集計し、CSVで書き出す（給与計算用）
// これまでの勤怠の集計（lib/attendance.ts）は、修正の無い日はそのまま使う（中抜けがあっても正しく数える）。

import { fx } from "@/lib/data/tables";
import type { AttendanceCorrection } from "@/lib/data/tables";
import { aggregateAttendance } from "@/lib/attendance";
import { datesOfMonth, jstDateOf, jstDayBoundsUtc, jstLocalToUtc, monthRange, todayJst } from "@/lib/date";
import { readJsonSetting } from "@/lib/feature-settings";
import { loadMonthSchedule } from "@/lib/shift/load";
import type { Attendance, DataStore } from "@/lib/data/types";

export const ATTENDANCE_SETTINGS_KEY = "attendance_settings";
export interface AttendanceSettings {
  /** 何分までの遅れ・早い退勤は印をつけないか */
  graceMinutes: number;
  /** 休憩を引く決まり：勤務がこの分数を超えたら */
  breakAfterMinutes: number;
  /** 引く休憩の分数 */
  breakMinutes: number;
}
export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = { graceMinutes: 5, breakAfterMinutes: 360, breakMinutes: 60 };

export async function getAttendanceSettings(db: DataStore): Promise<AttendanceSettings> {
  return readJsonSetting(db, ATTENDANCE_SETTINGS_KEY, DEFAULT_ATTENDANCE_SETTINGS);
}

export interface DayRecord {
  date: string;
  /** その日の予定（シフト）。休みは working=false */
  planned: { working: boolean; start: string; end: string; storeId: string };
  inAt: Date | null;
  outAt: Date | null;
  inCorrected: boolean;
  outCorrected: boolean;
  workMinutes: number;
  breakMinutes: number;
  netMinutes: number;
  late: boolean;
  lateMinutes: number;
  early: boolean;
  earlyMinutes: number;
  /** シフトの無い日に打刻がある */
  offShift: boolean;
  /** シフトの日なのに出勤の打刻が無い（過ぎた日だけ） */
  missing: boolean;
  /** 退勤の打刻が無い */
  openPunch: boolean;
  /** 承認待ちの修正の申請がある */
  pendingCorrection: boolean;
}

export interface MonthTotals {
  workDays: number;
  workMinutes: number;
  breakMinutes: number;
  netMinutes: number;
  lateCount: number;
  earlyCount: number;
  offShiftCount: number;
  missingCount: number;
}

function timeOnDate(date: string, time: string): Date | null {
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(":").map(Number);
  // 24時を過ぎる時刻（"25:30"）は翌日
  if (h >= 24) {
    const next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return jstLocalToUtc(`${next.toISOString().slice(0, 10)}T${String(h - 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return jstLocalToUtc(`${date}T${time}`);
}

/** 1人・1日の記録を組み立てる（テストしやすいよう、DBを読まない形にしている） */
export function buildDayRecord(input: {
  date: string;
  today: string;
  planned: DayRecord["planned"];
  punches: Attendance[];
  corrections: AttendanceCorrection[];
  settings: AttendanceSettings;
}): DayRecord {
  const { date, planned, settings } = input;
  const valid = input.punches.filter((p) => p.isValid).sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());
  const approved = input.corrections.filter((c) => c.status === "approved");
  const latest = (type: "in" | "out") =>
    approved.filter((c) => c.punchType === type).sort((a, b) => (b.decidedAt?.getTime() ?? 0) - (a.decidedAt?.getTime() ?? 0))[0];
  const cin = latest("in");
  const cout = latest("out");
  const firstIn = valid.find((p) => p.punchType === "in")?.punchedAt ?? null;
  const lastOut = [...valid].reverse().find((p) => p.punchType === "out")?.punchedAt ?? null;
  const inAt = cin ? timeOnDate(date, cin.time) : firstIn;
  const outAt = cout ? timeOnDate(date, cout.time) : lastOut;

  let workMinutes = 0;
  let openPunch = false;
  if (!cin && !cout) {
    const agg = aggregateAttendance(valid);
    workMinutes = agg.totalMinutes;
    openPunch = agg.days.some((d) => d.hasOpenPunch);
  } else if (inAt && outAt && outAt > inAt) {
    workMinutes = Math.round((outAt.getTime() - inAt.getTime()) / 60000);
  } else if (inAt && !outAt) {
    openPunch = true;
  }
  const breakMinutes = workMinutes > settings.breakAfterMinutes ? settings.breakMinutes : 0;

  const pStart = planned.working ? timeOnDate(date, planned.start) : null;
  const pEnd = planned.working ? timeOnDate(date, planned.end) : null;
  const lateMinutes = pStart && inAt ? Math.round((inAt.getTime() - pStart.getTime()) / 60000) : 0;
  const earlyMinutes = pEnd && outAt ? Math.round((pEnd.getTime() - outAt.getTime()) / 60000) : 0;
  return {
    date,
    planned,
    inAt,
    outAt,
    inCorrected: Boolean(cin),
    outCorrected: Boolean(cout),
    workMinutes,
    breakMinutes,
    netMinutes: Math.max(0, workMinutes - breakMinutes),
    late: lateMinutes > settings.graceMinutes,
    lateMinutes: Math.max(0, lateMinutes),
    early: earlyMinutes > settings.graceMinutes,
    earlyMinutes: Math.max(0, earlyMinutes),
    offShift: !planned.working && Boolean(inAt || outAt),
    missing: planned.working && date < input.today && !inAt,
    openPunch: openPunch && date < input.today,
    pendingCorrection: input.corrections.some((c) => c.status === "pending"),
  };
}

export function totalsOf(days: DayRecord[]): MonthTotals {
  return days.reduce<MonthTotals>(
    (t, d) => ({
      workDays: t.workDays + (d.workMinutes > 0 || d.inAt ? 1 : 0),
      workMinutes: t.workMinutes + d.workMinutes,
      breakMinutes: t.breakMinutes + d.breakMinutes,
      netMinutes: t.netMinutes + d.netMinutes,
      lateCount: t.lateCount + (d.late ? 1 : 0),
      earlyCount: t.earlyCount + (d.early ? 1 : 0),
      offShiftCount: t.offShiftCount + (d.offShift ? 1 : 0),
      missingCount: t.missingCount + (d.missing ? 1 : 0),
    }),
    { workDays: 0, workMinutes: 0, breakMinutes: 0, netMinutes: 0, lateCount: 0, earlyCount: 0, offShiftCount: 0, missingCount: 0 }
  );
}

/** その月の、人ごとの日別の記録（今日までの日だけ） */
export async function monthAttendanceRecords(
  db: DataStore,
  month: string,
  opts: { staffIds?: string[] } = {}
): Promise<Map<string, DayRecord[]>> {
  const today = todayJst();
  const { from, to } = monthRange(month);
  const [loaded, punches, corrections, settings] = await Promise.all([
    loadMonthSchedule(db, month, false),
    db.listAttendances({ from: jstDayBoundsUtc(from).start, to: jstDayBoundsUtc(to).end }),
    fx().attendanceCorrections.list({ where: { date: { gte: from, lte: to } } }),
    getAttendanceSettings(db),
  ]);
  const ids = opts.staffIds ?? loaded.activeStaff.map((s) => s.id);
  const dates = datesOfMonth(month).filter((d) => d <= today);
  const out = new Map<string, DayRecord[]>();
  for (const staffId of ids) {
    const mine = punches.filter((p) => p.staffId === staffId);
    const myCorr = corrections.filter((c) => c.staffId === staffId);
    out.set(
      staffId,
      dates.map((date) => {
        const cell = loaded.schedule.cell(staffId, date);
        return buildDayRecord({
          date,
          today,
          planned: { working: cell.working, start: cell.startTime, end: cell.endTime, storeId: cell.storeId },
          punches: mine.filter((p) => jstDateOf(p.punchedAt) === date),
          corrections: myCorr.filter((c) => c.date === date),
          settings,
        });
      })
    );
  }
  return out;
}

export function minutesLabel(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}:${String(r).padStart(2, "0")}`;
}

/** CSVの1セル（Excelで開けるように、" とカンマ・改行を囲む） */
export function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number)[][]): string {
  return `﻿${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
