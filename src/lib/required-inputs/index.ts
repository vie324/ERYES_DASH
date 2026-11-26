// 依頼14：毎日の必須入力。
//  ・ロールごとに「その日に必ず入力するもの」を管理画面で決める（初期値：全員＝出退勤・日報、店長＝レジ締め、
//    スタイリスト＝売上、アシスタント＝週報）。当てはまらないもの（アシスタントの日報など）は出さない
//  ・休みの日（シフト・いつもどおりの予定で休み）は出さない（週報は休みに関係なく、その週のうちに）
//  ・未入力はホームのいちばん上に「まだの入力」として出し続け、入力するまで消えない
//  ・決まった時刻（初期値19時＝閉店後）にプッシュ通知でも知らせる（lib/jobs）
//  ・未入力の人と件数は、本人と幹部・管理者に見える
// 判定はまとめて読み込んでから行う（人数ぶんDBを何度も読まない）。

import { fx } from "@/lib/data/tables";
import { addDays, datesOfMonth, jstDateOf, jstDayBoundsUtc, monthRange, todayJst, weekStartOf } from "@/lib/date";
import { readJsonSetting } from "@/lib/feature-settings";
import { loadMonthSchedule } from "@/lib/shift/load";
import { isEyesStore } from "@/lib/viewer";
import type { DataStore, Staff, Store } from "@/lib/data/types";

export type InputKey = "attendance" | "daily_report" | "sales" | "weekly_report" | "cash_closing" | "daily_plan";
export type Audience = "all" | "exec" | "stylist" | "assistant" | "eyes";

export const INPUT_DEFS: Record<InputKey, { label: string; href: string; note: string }> = {
  attendance: { label: "出退勤（打刻）", href: "/staff/attendance", note: "出勤と退勤の打刻（打刻を使う店舗だけ）" },
  daily_report: { label: "日報", href: "/staff/eni-report", note: "ENiのスタイリストの日報／イーリスの日報（アシスタントは週報）" },
  sales: { label: "売上", href: "/staff/eni-report", note: "日報の売上（技術売上・店販売上）" },
  weekly_report: { label: "週報", href: "/staff/weekly-report", note: "アシスタントの週報（その週のうちに）" },
  cash_closing: { label: "レジ締め", href: "/staff/cash", note: "店舗ごとに1日1回（その店舗の店長・副店長のだれか）" },
  daily_plan: { label: "今日の予定", href: "/staff/plan", note: "その日の予定（スケジュール）" },
};

export const AUDIENCE_LABEL: Record<Audience, string> = {
  all: "全員",
  exec: "店長・副店長（幹部）",
  stylist: "スタイリスト",
  assistant: "アシスタント",
  eyes: "イーリスのスタッフ",
};

export const REQUIRED_INPUTS_KEY = "required_inputs";
export interface RequiredInputsSettings {
  enabled: boolean;
  rules: Record<Audience, InputKey[]>;
  /** プッシュ通知の時刻（日本時間） */
  notifyHour: number;
  /** 管理者アカウントにも出すか */
  includeAdmins: boolean;
}
export const DEFAULT_REQUIRED_INPUTS: RequiredInputsSettings = {
  enabled: true,
  rules: {
    all: ["attendance", "daily_report"],
    exec: ["cash_closing"],
    stylist: ["sales"],
    assistant: ["weekly_report"],
    eyes: [],
  },
  notifyHour: 19,
  includeAdmins: false,
};

export async function getRequiredInputsSettings(db: DataStore): Promise<RequiredInputsSettings> {
  const s = await readJsonSetting(db, REQUIRED_INPUTS_KEY, DEFAULT_REQUIRED_INPUTS);
  s.rules = { ...DEFAULT_REQUIRED_INPUTS.rules, ...s.rules };
  return s;
}

export interface MissingInput {
  key: InputKey;
  label: string;
  href: string;
  date: string;
  /** 店舗ごとのもの（レジ締め）は店舗名 */
  storeId?: string;
}

/** その人に当てはまる必須入力（ロール・職種・店舗で決める。当てはまらないものは落とす） */
export function keysFor(staff: Staff, stores: Store[], settings: RequiredInputsSettings): InputKey[] {
  if (!staff.isActive) return [];
  if (staff.role === "admin" && !settings.includeAdmins) return [];
  const store = stores.find((s) => s.id === staff.storeId);
  const eyes = isEyesStore(store);
  const keys = new Set<InputKey>(settings.rules.all);
  if (staff.isExecutive) settings.rules.exec.forEach((k) => keys.add(k));
  if (staff.jobType === "stylist") settings.rules.stylist.forEach((k) => keys.add(k));
  if (staff.jobType === "assistant") settings.rules.assistant.forEach((k) => keys.add(k));
  if (eyes) settings.rules.eyes.forEach((k) => keys.add(k));
  // 当てはまらないもの
  if (staff.jobType === "assistant") {
    keys.delete("daily_report");
    keys.delete("sales");
  }
  if (staff.jobType !== "assistant") keys.delete("weekly_report");
  if (!eyes && staff.jobType === "") {
    // ENiで職種なし（事務など）は日報・売上なし
    keys.delete("daily_report");
    keys.delete("sales");
  }
  if (!store?.attendanceEnabled) keys.delete("attendance");
  if (eyes) keys.delete("daily_plan");
  return [...keys];
}

/** 1つの必須入力（入力済みかどうかつき） */
export interface InputItem extends MissingInput {
  done: boolean;
}

/**
 * 期間（from〜to）の未入力を人ごとに数える。今日より先の日は見ない。
 * 返すのは「まだの入力」だけ（入力済みのものは返さない）。
 */
export async function computeMissing(
  db: DataStore,
  opts: { from: string; to: string; staffIds?: string[] }
): Promise<Map<string, MissingInput[]>> {
  const all = await computeInputItems(db, opts);
  const out = new Map<string, MissingInput[]>();
  for (const [id, items] of all) {
    const missing = items.filter((i) => !i.done).map(({ done: _done, ...rest }) => rest);
    if (missing.length > 0) out.set(id, missing);
  }
  return out;
}

/** 期間の必須入力を、入力済みのものも含めて人ごとに出す（インセンティブの集計にも使う） */
export async function computeInputItems(
  db: DataStore,
  opts: { from: string; to: string; staffIds?: string[] }
): Promise<Map<string, InputItem[]>> {
  const today = todayJst();
  const to = opts.to > today ? today : opts.to;
  const out = new Map<string, InputItem[]>();
  if (opts.from > to) return out;
  const settings = await getRequiredInputsSettings(db);
  if (!settings.enabled) return out;
  const [staffList, stores] = await Promise.all([db.listStaff(), db.listStores()]);
  const targets = staffList.filter((s) => (!opts.staffIds || opts.staffIds.includes(s.id)) && s.isActive);
  const keysOf = new Map(targets.map((s) => [s.id, keysFor(s, stores, settings)]));
  const need = new Set([...keysOf.values()].flat());
  if (need.size === 0) return out;

  const weekFrom = weekStartOf(opts.from);
  const range = { from: opts.from, to };
  const months = [...new Set(datesBetween(opts.from, to).map((d) => d.slice(0, 7)))];
  const [stylistReports, weeklyReports, dailyReports, punches, corrections, closings, legacyCash, plans, schedules] = await Promise.all([
    need.has("daily_report") || need.has("sales") ? db.listEniReports("stylist", range) : Promise.resolve([]),
    need.has("weekly_report") ? db.listEniReports("weekly", { from: weekFrom, to }) : Promise.resolve([]),
    need.has("daily_report") || need.has("sales") ? db.listDailyReports(range) : Promise.resolve([]),
    need.has("attendance") ? db.listAttendances({ from: jstDayBoundsUtc(opts.from).start, to: jstDayBoundsUtc(to).end }) : Promise.resolve([]),
    need.has("attendance") ? fx().attendanceCorrections.list({ where: { status: "approved", date: { gte: opts.from, lte: to } } }) : Promise.resolve([]),
    need.has("cash_closing") ? fx().registerClosings.list({ where: { date: { gte: opts.from, lte: to } } }) : Promise.resolve([]),
    need.has("cash_closing") ? db.listCashReports(range) : Promise.resolve([]),
    need.has("daily_plan") ? Promise.all(datesBetween(opts.from, to).map((d) => db.listDailyPlans(d))).then((x) => x.flat()) : Promise.resolve([]),
    Promise.all(months.map((m) => loadMonthSchedule(db, m, false))),
  ]);
  const scheduleOf = (date: string) => schedules[months.indexOf(date.slice(0, 7))]?.schedule;
  const working = (staffId: string, date: string) => scheduleOf(date)?.cell(staffId, date).working ?? true;

  for (const s of targets) {
    const keys = keysOf.get(s.id) ?? [];
    const store = stores.find((x) => x.id === s.storeId);
    const eyes = isEyesStore(store);
    const list: InputItem[] = [];
    for (const date of datesBetween(opts.from, to)) {
      const isWorking = working(s.id, date);
      for (const key of keys) {
        if (key === "weekly_report") continue;
        if (!isWorking) continue;
        const def = INPUT_DEFS[key];
        let done = true;
        if (key === "attendance") {
          const mine = punches.filter((p) => p.staffId === s.id && p.isValid && jstDateOf(p.punchedAt) === date);
          const corr = corrections.filter((c) => c.staffId === s.id && c.date === date);
          const hasIn = mine.some((p) => p.punchType === "in") || corr.some((c) => c.punchType === "in");
          const hasOut = mine.some((p) => p.punchType === "out") || corr.some((c) => c.punchType === "out");
          // 今日は出勤の打刻があれば、退勤は閉店後まで待つ
          done = date === today ? hasIn : hasIn && hasOut;
        } else if (key === "daily_report") {
          done = eyes
            ? dailyReports.some((r) => r.staffId === s.id && r.reportDate === date)
            : stylistReports.some((r) => r.staffId === s.id && r.periodKey === date);
        } else if (key === "sales") {
          done = eyes
            ? dailyReports.some((r) => r.staffId === s.id && r.reportDate === date)
            : stylistReports.some((r) => r.staffId === s.id && r.periodKey === date && hasSales(r.answers));
        } else if (key === "cash_closing") {
          done =
            closings.some((c) => c.storeId === s.storeId && c.date === date) ||
            legacyCash.some((c) => c.storeId === s.storeId && c.reportDate === date);
        } else if (key === "daily_plan") {
          done = plans.some((p) => p.staffId === s.id && p.planDate === date);
        }
        {
          list.push({
            done,
            key,
            label: def.label,
            href: key === "daily_report" && eyes ? `/staff/report?date=${date}` : key === "cash_closing" ? `/staff/cash?store=${s.storeId}&date=${date}` : key === "attendance" ? def.href : `${def.href}?date=${date}`,
            date,
            ...(key === "cash_closing" ? { storeId: s.storeId } : {}),
          });
        }
      }
    }
    // 週報：期間に含まれる週ごと（その週の日曜を過ぎたら未入力。今週はその週のうちは「まだ」として出す）
    if (keys.includes("weekly_report")) {
      for (let w = weekFrom; w <= to; w = addDays(w, 7)) {
        const done = weeklyReports.some((r) => r.staffId === s.id && r.periodKey === w);
        list.push({ done, key: "weekly_report", label: INPUT_DEFS.weekly_report.label, href: `/staff/weekly-report?week=${w}`, date: w });
      }
    }
    if (list.length > 0) out.set(s.id, list);
  }
  return out;
}

function hasSales(answers: Record<string, unknown>): boolean {
  return ["service_sales", "retail_sales"].some((k) => answers[k] !== undefined && answers[k] !== "" && answers[k] !== null);
}

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** ホーム：今日と、この月のこれまでの未入力（入力するまで消えない） */
export async function myMissingInputs(db: DataStore, staffId: string): Promise<{ today: MissingInput[]; past: MissingInput[] }> {
  const today = todayJst();
  const from = monthRange(today.slice(0, 7)).from;
  const list = (await computeMissing(db, { from, to: today, staffIds: [staffId] })).get(staffId) ?? [];
  return {
    today: list.filter((m) => m.date === today || (m.key === "weekly_report" && m.date === weekStartOf(today))),
    past: list.filter((m) => !(m.date === today || (m.key === "weekly_report" && m.date === weekStartOf(today)))),
  };
}

/** 月の日付（今日まで） */
export function monthDatesUntilToday(month: string): string[] {
  const today = todayJst();
  return datesOfMonth(month).filter((d) => d <= today);
}
