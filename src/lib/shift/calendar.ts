// シフトのカレンダー（月曜はじまり）と、「休みの数で作る」自動作成。
//
// 決まり（店舗ごとに管理者が決める。マスタの店舗・シフトのルール画面）
//  ・定休日の曜日（例：月曜）……… その日はお店の休み。シフトを入れない
//  ・月の休みの数（例：8）………… 1人の月の休み。定休日を含めて数える（月曜定休4日＋各自4日＝8休）
//  ・日ごとのお店の休み（例：1/1〜1/3 特別休暇）…… 「休みの数に入れる」をオフにすると、休みの数に数えない
//  ・日ごとの行事メモ（例：ENi初詣（昼から））…… カレンダーに赤字で出す
//
// 休みの数で作る（月の休みの数が決まっている店舗）
//  ・希望休を出していない人も含めて、全員が対象（以前の「シフトの組み方v2」と同じく在籍スタッフ全員）
//  ・定休日＋希望休＋管理者が入れた休みを数えて、足りない分だけ自動で休みを入れる
//  ・休み以外の日は全員出勤（人数を絞らない）。出勤人数と段数の差は、カレンダーで日ごとに見せる
//  ・自動で入れる休みは、土日・全員参加の日・自分が出る会議の日を避け、スタイリスト同士は重ねず
//    （3段同士は同じ日にしない）、出勤人数が段数より多い日に寄せ、週ごとに散らす。連勤上限も守る

import { addDays, datesOfMonth, weekStartOf, weekdayOf } from "@/lib/date";
import { normalizeTiers } from "@/lib/eni/forms";
import { shortNames } from "@/lib/shift/month";
import { TOP_TIER, type OverrideDay, type PatternDay } from "@/lib/shift/assign";
import type {
  AssistantRank,
  CompanyEvent,
  Meeting,
  NewShiftAssignment,
  ShiftPreference,
  Staff,
  Store,
  StoreCalendarDay,
} from "@/lib/data/types";

/** お店の休み（定休日・特別休暇など） */
export interface Closure {
  label: string;
  /** 月の休みの数に入れるか（定休日は入れる。特別休暇は入れない） */
  counts: boolean;
}

/** 出勤人数と段数の差が、これを超えたら「人が多い」（出勤人数＋お客様が1〜2人までは適切） */
export const BALANCE_MARGIN = 2;

/** その日のお店の休み（null＝営業）。日ごとの設定 ＞ 定休日の曜日 */
export function closureOn(
  store: Pick<Store, "closedWeekdays">,
  day: Pick<StoreCalendarDay, "dayStatus" | "closedLabel" | "countsAsDayOff"> | undefined,
  date: string
): Closure | null {
  if (day?.dayStatus === "closed") return { label: day.closedLabel.trim() || "お店の休み", counts: day.countsAsDayOff };
  if (day?.dayStatus === "open") return null;
  if (store.closedWeekdays.includes(weekdayOf(date))) return { label: "定休日", counts: true };
  return null;
}

/** 月のお店の休み（date → 休み） */
export function monthClosures(
  store: Pick<Store, "id" | "closedWeekdays">,
  days: StoreCalendarDay[],
  month: string
): Map<string, Closure> {
  const byDate = new Map(days.filter((d) => d.storeId === store.id).map((d) => [d.date, d]));
  const map = new Map<string, Closure>();
  for (const date of datesOfMonth(month)) {
    const c = closureOn(store, byDate.get(date), date);
    if (c) map.set(date, c);
  }
  return map;
}

/** 店舗ごとの月のお店の休み（storeId → date → 休み） */
export function closuresByStore(
  stores: Pick<Store, "id" | "closedWeekdays">[],
  days: StoreCalendarDay[],
  month: string
): Map<string, Map<string, Closure>> {
  return new Map(stores.map((s) => [s.id, monthClosures(s, days, month)]));
}

/**
 * 1人が自分で取る休みの数（月の休みの数 − 休みの数に入れるお店の休み）。
 * 月の休みの数を決めていない店舗は null（休みの数で作らない）。
 */
export function personalDaysOffTarget(
  store: Pick<Store, "monthlyDaysOff">,
  closures: Map<string, Closure>
): number | null {
  if (!(store.monthlyDaysOff > 0)) return null;
  const counted = [...closures.values()].filter((c) => c.counts).length;
  return Math.max(0, store.monthlyDaysOff - counted);
}

/**
 * カレンダー・休みの数で作るときの対象の人：表に出ている人のうち、管理用のアカウントを除いた人
 * （職種が無く、希望休も基本パターンも出勤の個別調整もない管理者は、シフトに入れない）。
 */
export function quotaRosterOf<T extends Pick<Staff, "id" | "role" | "jobType">>(members: T[], rosterIds: Set<string>): T[] {
  return members.filter((s) => s.jobType !== "" || s.role !== "admin" || rosterIds.has(s.id));
}

/** カレンダーに出す名前：呼び名 ＞ 名字（同じ名字の人がいれば名前の1文字目まで） */
export function displayNames(staff: Pick<Staff, "id" | "name" | "nickname">[]): Map<string, string> {
  const short = shortNames(staff);
  return new Map(staff.map((s) => [s.id, s.nickname.trim() || short.get(s.id) || s.name]));
}

/** 決まりの説明（例：月曜定休（定休日を含めて1人8休）） */
export function storeRulesSummary(store: Pick<Store, "closedWeekdays" | "monthlyDaysOff">): string {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const names = ["日", "月", "火", "水", "木", "金", "土"];
  const closed = order.filter((wd) => store.closedWeekdays.includes(wd)).map((wd) => names[wd]);
  const closedText = closed.length > 0 ? `${closed.join("・")}曜定休` : "定休日なし";
  if (!(store.monthlyDaysOff > 0)) return `${closedText}・月の休みの数は決めていない`;
  return closed.length > 0
    ? `${closedText}（定休日を含めて1人${store.monthlyDaysOff}休）`
    : `${closedText}・1人${store.monthlyDaysOff}休`;
}

/** アシスタントの年数の目安（ランク）。ファイナル＞ミドル＞ファースト */
const RANK_SENIORITY: Record<AssistantRank, number> = { "": 0, first: 0, middle: 1, final: 2 };

// ---------------------------------------------------------------- 休みの数で作る

export interface QuotaPerson {
  id: string;
  isStylist: boolean;
  /** 段数（スタイリストの段数の合計が、その日に受けられるお客様の目安） */
  tiers: number;
  /** アシスタントの年数の目安（先に休みを選ぶ） */
  seniority: number;
  /** 働く店舗 */
  storeId: string;
}

export interface QuotaPlanInput {
  dates: string[];
  people: QuotaPerson[];
  /** storeId → date → お店の休み */
  closures: Map<string, Map<string, Closure>>;
  /** staffId → 自分で取る休みの数 */
  targets: Map<string, number>;
  /** staffId → 決まっている休み（希望休・管理者が入れた休み・基本パターンで出ない曜日） */
  fixedOff: Map<string, Set<string>>;
  /** staffId → 管理者が出勤にした日（休みにしない） */
  forcedOn: Map<string, Set<string>>;
  /** その人がその日は休みにできないか（会議の参加者・全員参加の日） */
  mustWork: (staffId: string, date: string) => boolean;
  /** 休みを避けたい日の重み（土日など）。0 なら避けない */
  avoidWeight: (date: string) => number;
  maxConsecutiveDays: number;
  /** staffId → 前の月に出勤した日（月またぎの連勤） */
  prevWorked: Map<string, Set<string>>;
}

export interface QuotaPlan {
  /** staffId → 休み（営業日だけ。決まっている休み＋自動で入れた休み） */
  off: Map<string, Set<string>>;
  /** staffId → 自動で入れた休み */
  auto: Map<string, Set<string>>;
  /** staffId → 入れられなかった休みの数（会議・全員参加の日ばかりで空きが無いときなど） */
  shortfall: Map<string, number>;
}

/** 自動で入れる休みの重み。運用に合わなければ、ここの数字だけを変える */
export const QUOTA_WEIGHTS = {
  /** その日すでに休みの人数（1人あたり。休みを日に散らす） */
  crowd: 12,
  /** スタイリスト：ほかのスタイリストが休みの日（1人あたり。スタイリストの休みは重ねない） */
  stylistOverlap: 40,
  /** 3段のスタイリスト同士が同じ日に休む（ほぼ選ばない） */
  topOverlap: 1000,
  /** アシスタント：その日の「出勤人数 − 段数」（1人あたり。多い日ほど休みやすい） */
  balance: 15,
  /** 同じ週に自分の休みがすでにある（1日あたり。休みを週ごとに散らす） */
  sameWeek: 25,
  /** 前後の日が自分の休み（休みを散らす。連休を作りたいときは管理者が入れる） */
  adjacent: 8,
  /** 休みにしたあとも連勤の上限を超える（1日あたり） */
  overRun: 60,
  /** 長い連勤を切る日を少し優先する（最長連勤1日あたり） */
  runLength: 2,
} as const;

/**
 * 自動で入れる休みを決める（貪欲法）。スタイリスト（段数の多い順）→ アシスタント（年数の高い順）の順に、
 * 1人ずつ足りない休みを1日ずつ選ぶ。選べる日：営業日で、決まっている休み・出勤の指定・会議の参加・全員参加の日でない日。
 */
export function planDaysOff(input: QuotaPlanInput): QuotaPlan {
  const { dates, people } = input;
  const dateIndex = new Map(dates.map((d, i) => [d, i]));
  const closedFor = (p: QuotaPerson, d: string) => input.closures.get(p.storeId)?.has(d) ?? false;
  const openDates = new Map(people.map((p) => [p.id, dates.filter((d) => !closedFor(p, d))]));

  const off = new Map<string, Set<string>>();
  const auto = new Map<string, Set<string>>();
  const shortfall = new Map<string, number>();
  for (const p of people) {
    const open = new Set(openDates.get(p.id));
    off.set(p.id, new Set([...(input.fixedOff.get(p.id) ?? [])].filter((d) => open.has(d))));
    auto.set(p.id, new Set());
  }

  // 店舗×日の出勤人数・段数（スタイリストの段数の合計）・休みの人数
  const key = (storeId: string, d: string) => `${storeId}|${d}`;
  const heads = new Map<string, number>();
  const tiers = new Map<string, number>();
  const offs = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
  for (const p of people) {
    for (const d of openDates.get(p.id)!) {
      const k = key(p.storeId, d);
      if (off.get(p.id)!.has(d)) {
        bump(offs, k, 1);
      } else {
        bump(heads, k, 1);
        if (p.isStylist) bump(tiers, k, p.tiers);
      }
    }
  }

  /** その人の最長連勤（前の月からの続きを含む）。extraOff の日も休みとして数える */
  const longestRun = (p: QuotaPerson, extraOff: string): number => {
    const own = off.get(p.id)!;
    const prev = input.prevWorked.get(p.id) ?? new Set<string>();
    let run = 0;
    for (let d = addDays(dates[0], -1); prev.has(d); d = addDays(d, -1)) run++;
    let best = run;
    for (const d of dates) {
      if (closedFor(p, d) || own.has(d) || d === extraOff) run = 0;
      else run++;
      if (run > best) best = run;
    }
    return best;
  };

  const order = people
    .map((p, i) => ({ p, i }))
    .sort(
      (a, b) =>
        Number(b.p.isStylist) - Number(a.p.isStylist) ||
        (a.p.isStylist ? b.p.tiers - a.p.tiers : b.p.seniority - a.p.seniority) ||
        a.i - b.i
    );
  const stylists = people.filter((p) => p.isStylist);

  order.forEach(({ p }, personIndex) => {
    const own = off.get(p.id)!;
    const need = Math.max(0, (input.targets.get(p.id) ?? 0) - own.size);
    for (let n = 0; n < need; n++) {
      let best: string | null = null;
      let bestCost = Number.POSITIVE_INFINITY;
      for (const d of openDates.get(p.id)!) {
        if (own.has(d) || input.forcedOn.get(p.id)?.has(d) || input.mustWork(p.id, d)) continue;
        const k = key(p.storeId, d);
        let cost = input.avoidWeight(d) + QUOTA_WEIGHTS.crowd * (offs.get(k) ?? 0);
        if (p.isStylist) {
          const others = stylists.filter((o) => o.id !== p.id && o.storeId === p.storeId && off.get(o.id)!.has(d));
          cost += QUOTA_WEIGHTS.stylistOverlap * others.length;
          if (p.tiers >= TOP_TIER && others.some((o) => o.tiers >= TOP_TIER)) cost += QUOTA_WEIGHTS.topOverlap;
        } else {
          cost -= QUOTA_WEIGHTS.balance * ((heads.get(k) ?? 0) - (tiers.get(k) ?? 0));
        }
        const week = weekStartOf(d);
        cost += QUOTA_WEIGHTS.sameWeek * [...own].filter((x) => weekStartOf(x) === week).length;
        if (own.has(addDays(d, -1)) || own.has(addDays(d, 1))) cost += QUOTA_WEIGHTS.adjacent;
        const run = longestRun(p, d);
        cost += QUOTA_WEIGHTS.overRun * Math.max(0, run - input.maxConsecutiveDays) + QUOTA_WEIGHTS.runLength * run;
        // 同じくらいなら、人ごとに選ぶ日をずらす（全員が月の初めに寄らないように）
        cost += (((dateIndex.get(d) ?? 0) + personIndex * 5) % 7) * 0.01;
        if (cost < bestCost) {
          bestCost = cost;
          best = d;
        }
      }
      if (best === null) {
        shortfall.set(p.id, need - n);
        break;
      }
      own.add(best);
      auto.get(p.id)!.add(best);
      const k = key(p.storeId, best);
      bump(offs, k, 1);
      bump(heads, k, -1);
      if (p.isStylist) bump(tiers, k, -p.tiers);
    }
  });

  return { off, auto, shortfall };
}

/** 休みの数で作るときの、ひとり分の前提（シフトの前提データから作る） */
export interface QuotaShiftInput {
  month: string;
  people: QuotaPerson[];
  closures: Map<string, Map<string, Closure>>;
  /** storeId → 自分で取る休みの数（月の休みの数を決めていない店舗はキーが無い） */
  targetByStore: Map<string, number>;
  prefs: Map<string, Map<string, ShiftPreference>>;
  patterns: Map<string, Map<number, PatternDay>>;
  overrides: Map<string, Map<string, OverrideDay>>;
  /** 全員参加の日（全体ミーティング・しもん塾・全員参加の会社のイベント） */
  allHandsDates: Set<string>;
  /** 日付 → その日の会議の参加者 */
  requiredByDate: Map<string, Set<string>>;
  maxConsecutiveDays: number;
  prevWorked: Map<string, Set<string>>;
}

/** 土日（休みを避ける日） */
const WEEKEND_WEIGHT = 100;

/**
 * 休みの数で作る：休みを決めて、休み以外の営業日はすべて出勤にする。
 * 時間は個別調整（出勤）＞基本パターンの時間。早番・遅番は日ごと・店舗ごとに少ない方へ入れて釣り合わせる。
 */
export function buildQuotaShift(input: QuotaShiftInput): { assignments: NewShiftAssignment[]; plan: QuotaPlan } {
  const dates = datesOfMonth(input.month);
  const fixedOff = new Map<string, Set<string>>();
  const forcedOn = new Map<string, Set<string>>();
  for (const p of input.people) {
    const offSet = new Set<string>();
    const onSet = new Set<string>();
    const pattern = input.patterns.get(p.id);
    for (const d of dates) {
      const o = input.overrides.get(p.id)?.get(d);
      if (o) {
        (o.isWorking ? onSet : offSet).add(d);
        continue;
      }
      if (input.prefs.get(p.id)?.get(d) === "off") offSet.add(d);
      else if (pattern && !(pattern.get(weekdayOf(d))?.isWorking ?? false)) offSet.add(d);
    }
    fixedOff.set(p.id, offSet);
    forcedOn.set(p.id, onSet);
  }
  const plan = planDaysOff({
    dates,
    people: input.people,
    closures: input.closures,
    targets: new Map(input.people.map((p) => [p.id, input.targetByStore.get(p.storeId) ?? 0])),
    fixedOff,
    forcedOn,
    mustWork: (id, d) => input.allHandsDates.has(d) || (input.requiredByDate.get(d)?.has(id) ?? false),
    avoidWeight: (d) => (weekdayOf(d) === 0 || weekdayOf(d) === 6 ? WEEKEND_WEIGHT : 0),
    maxConsecutiveDays: input.maxConsecutiveDays,
    prevWorked: input.prevWorked,
  });

  const assignments: NewShiftAssignment[] = [];
  const ordered = [...input.people].sort((a, b) => Number(b.isStylist) - Number(a.isStylist));
  for (const d of dates) {
    const balance = new Map<string, { early: number; late: number }>();
    for (const p of ordered) {
      if (input.closures.get(p.storeId)?.has(d) && !forcedOn.get(p.id)?.has(d)) continue;
      if (plan.off.get(p.id)?.has(d)) continue;
      const o = input.overrides.get(p.id)?.get(d);
      const pt = input.patterns.get(p.id)?.get(weekdayOf(d));
      const time = o?.isWorking
        ? { startTime: o.startTime, endTime: o.endTime, note: o.note }
        : pt?.isWorking
          ? { startTime: pt.startTime, endTime: pt.endTime, note: "" }
          : { startTime: "", endTime: "", note: "" };
      const counts = balance.get(p.storeId) ?? { early: 0, late: 0 };
      const pref = input.prefs.get(p.id)?.get(d);
      const shiftType = pref === "early" || pref === "late" ? pref : counts.early <= counts.late ? "early" : "late";
      counts[shiftType]++;
      balance.set(p.storeId, counts);
      assignments.push({ date: d, staffId: p.id, storeId: p.storeId, shiftType, ...time });
    }
  }
  return { assignments, plan };
}

/** スタッフ → 休みの数で作るときのひとり分の前提 */
export function quotaPersonOf(
  s: Pick<Staff, "id" | "jobType" | "tiers" | "rank">,
  storeId: string
): QuotaPerson {
  return {
    id: s.id,
    isStylist: s.jobType === "stylist",
    tiers: normalizeTiers(s.tiers),
    seniority: RANK_SENIORITY[s.rank] ?? 0,
    storeId,
  };
}

// ---------------------------------------------------------------- カレンダーの表示

/** 休みの種類：希望休／管理者が入れた休み／自動で入れた休み／基本パターンで出ない曜日 */
export type OffKind = "request" | "admin" | "auto" | "pattern";

export interface CalendarOff {
  staffId: string;
  name: string;
  kind: OffKind;
  /** 休みの中身（管理者が入れた理由。希望休の理由は管理者だけに見せる） */
  reason: string;
  paidLeave: boolean;
}

export interface CalendarCounts {
  /** 出勤人数 */
  headcount: number;
  /** 段数の合計（出勤するスタイリストの段数） */
  tiers: number;
  stylists: number;
  assistants: number;
  /** 出勤人数 − 段数 */
  diff: number;
}

export interface CalendarDay {
  date: string;
  weekday: number;
  closure: Closure | null;
  /** 赤字で出す行事・会議・メモ */
  events: string[];
  /** 休みの人（お店の休みの日は空） */
  off: CalendarOff[];
  /** 出勤する人 */
  working: string[];
  /** 人数（お店の休みの日は null） */
  counts: CalendarCounts | null;
}

export interface CalendarPerson {
  id: string;
  name: string;
  jobType: Staff["jobType"];
  tiers: number;
}

/** その人のその日の予定（カレンダー用に、シフト表・個別調整・希望休・基本パターンから決めたもの） */
export interface PersonDay {
  working: boolean;
  /** 休みのとき */
  kind?: OffKind;
  reason?: string;
  paidLeave?: boolean;
}

export function buildCalendarDays(input: {
  month: string;
  people: CalendarPerson[];
  closures: Map<string, Closure>;
  events: Map<string, string[]>;
  dayOf: (staffId: string, date: string) => PersonDay;
}): CalendarDay[] {
  const order = [...input.people].sort(
    (a, b) => Number(b.jobType === "stylist") - Number(a.jobType === "stylist")
  );
  return datesOfMonth(input.month).map((date) => {
    const closure = input.closures.get(date) ?? null;
    const events = input.events.get(date) ?? [];
    const off: CalendarOff[] = [];
    const working: string[] = [];
    let tiers = 0;
    let stylists = 0;
    let assistants = 0;
    for (const p of order) {
      const day = input.dayOf(p.id, date);
      if (day.working) {
        working.push(p.id);
        if (p.jobType === "stylist") {
          stylists++;
          tiers += normalizeTiers(p.tiers);
        } else {
          assistants++;
        }
      } else if (!closure) {
        off.push({
          staffId: p.id,
          name: p.name,
          kind: day.kind ?? "auto",
          reason: day.reason ?? "",
          paidLeave: day.paidLeave ?? false,
        });
      }
    }
    const headcount = working.length;
    const counts = closure && headcount === 0 ? null : { headcount, tiers, stylists, assistants, diff: headcount - tiers };
    return { date, weekday: weekdayOf(date), closure, events, off, working, counts };
  });
}

/** 月曜はじまりの週に並べる（月の外の日は null） */
export function calendarWeeks<T extends { date: string }>(month: string, days: T[]): (T | null)[][] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const dates = datesOfMonth(month);
  const lead = (weekdayOf(dates[0]) + 6) % 7; // 月曜＝0
  const cells: (T | null)[] = [...Array<null>(lead).fill(null), ...dates.map((d) => byDate.get(d) ?? null)];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (T | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * 日ごとの赤字（行事・会議・メモ）。店舗のメモ → 会社のイベント → 会議（1on1は出さない）の順。
 * committeeNames は会議体のキー → 名前（幹部会議など）
 */
export function calendarEvents(input: {
  month: string;
  storeDays: StoreCalendarDay[];
  companyEvents: CompanyEvent[];
  meetings: Meeting[];
  committeeNames: Map<string, string>;
}): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const add = (date: string, text: string) => {
    const t = text.trim();
    if (!t) return;
    const list = map.get(date) ?? [];
    if (!list.includes(t)) list.push(t);
    map.set(date, list);
  };
  const dates = datesOfMonth(input.month);
  for (const d of input.storeDays) if (d.note.trim()) add(d.date, d.note);
  for (const e of input.companyEvents) {
    for (const date of dates) {
      if (date < e.startDate || date > e.endDate) continue;
      add(date, e.startTime && e.startDate === e.endDate ? `${e.title} ${e.startTime}〜` : e.title);
    }
  }
  for (const m of input.meetings) {
    if (m.meetingType === "1on1") continue;
    const name = input.committeeNames.get(m.committee) || m.title || (m.meetingType === "all" ? "全体ミーティング" : "ミーティング");
    add(m.meetingDate, name);
  }
  return map;
}

/** ひとりの月の休みの内訳（カレンダーの下の一覧用） */
export interface PersonSummary {
  staffId: string;
  name: string;
  /** 休みの合計（休みの数に入れるお店の休みを含む） */
  total: number;
  closures: number;
  request: number;
  admin: number;
  auto: number;
  pattern: number;
}

export function summarizePeople(
  people: CalendarPerson[],
  days: CalendarDay[]
): PersonSummary[] {
  return people.map((p) => {
    const mine = days.flatMap((d) => d.off.filter((o) => o.staffId === p.id));
    // 休みの数に入れるお店の休み（その日に出勤にした人は数えない）
    const closures = days.filter((d) => d.closure?.counts && !d.working.includes(p.id)).length;
    const by = (k: OffKind) => mine.filter((o) => o.kind === k).length;
    return {
      staffId: p.id,
      name: p.name,
      total: closures + mine.length,
      closures,
      request: by("request"),
      admin: by("admin"),
      auto: by("auto"),
      pattern: by("pattern"),
    };
  });
}
