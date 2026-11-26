// 依頼21：中さんのClaudeから読めるもの（読むだけ。書き込みのツールは作らない）。
//  スタッフ一覧と所属・役割／売上の推移／練習時間／稼働率／日報・週報の提出／ルーティン業務の達成率／目標と進み具合
// お客様の個人情報（名前・電話番号・LINE・カウンセリングの回答）や、日報の自由記述の文章は返さない。数字と、スタッフの名前・役割だけ。

import { fx } from "@/lib/data/tables";
import { isDemoMode } from "@/lib/data";
import { addMonths, datesOfMonth, monthRange, thisMonthJst, todayJst, weekStartOf } from "@/lib/date";
import { computeInputItems, INPUT_DEFS } from "@/lib/required-inputs";
import { ensureMonthComputed, monthUtilization } from "@/lib/utilization";
import { goalTreeFor, PERIOD_LABEL } from "@/lib/goals";
import { ROUTINE_CYCLE_LABEL } from "@/lib/eni/routines";
import type { DataStore, Staff, Store } from "@/lib/data/types";

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (db: DataStore, args: Record<string, unknown>) => Promise<unknown>;
}

const STORE_ARG = { type: "string", description: "店舗の名前（一部でよい）。省略するとすべての店舗" };
const MONTH_ARG = { type: "string", description: "対象の月（YYYY-MM）。省略すると今月", pattern: "^\\d{4}-\\d{2}$" };

function isEyes(store: Pick<Store, "name"> | undefined): boolean {
  return /EREYS|イーリス/i.test(store?.name ?? "");
}

function pickStores(stores: Store[], arg: unknown): Store[] {
  const q = typeof arg === "string" ? arg.trim() : "";
  if (!q) return stores;
  const hit = stores.filter((s) => s.id === q || s.name.includes(q));
  if (hit.length === 0) throw new Error(`店舗「${q}」が見つかりません。店舗の名前：${stores.map((s) => s.name).join("、")}`);
  return hit;
}

function monthArg(arg: unknown): string {
  const v = typeof arg === "string" ? arg.trim() : "";
  if (!v) return thisMonthJst();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) throw new Error("month は YYYY-MM の形で指定してください");
  return v;
}

function intArg(arg: unknown, def: number, min: number, max: number): number {
  const n = Number(arg);
  return Number.isFinite(n) && arg !== undefined && arg !== null && arg !== "" ? Math.min(max, Math.max(min, Math.round(n))) : def;
}

function monthsBack(n: number, end = thisMonthJst()): string[] {
  return Array.from({ length: n }, (_, i) => addMonths(end, i - n + 1));
}

function roleLabel(s: Staff, store: Store | undefined): string {
  if (s.role === "admin") return "管理者";
  if (s.role === "manager") return "店舗の管理者";
  if (isEyes(store)) return s.isExecutive ? "イーリスの幹部" : "イーリスのスタッフ";
  const job = s.jobType === "stylist" ? "スタイリスト" : s.jobType === "assistant" ? "アシスタント" : "スタッフ";
  return s.isExecutive ? `幹部（${job}）` : job;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : 0;
}

const hours = (min: number) => Math.round((min / 60) * 10) / 10;
const pct = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 1000) / 10 : null);

async function staffAndStores(db: DataStore, storeArg: unknown, includeInactive = false) {
  const [staff, stores] = await Promise.all([db.listStaff(), db.listStores()]);
  const picked = pickStores(stores, storeArg);
  const members = staff.filter((s) => (includeInactive || s.isActive) && picked.some((p) => p.id === s.storeId));
  const storeOf = (id: string) => stores.find((s) => s.id === id);
  return { staff, stores, picked, members, storeOf };
}

export const TOOLS: ToolDef[] = [
  {
    name: "list_staff",
    title: "スタッフ一覧",
    description: "スタッフの一覧（名前・所属店舗・役割・職種・アシスタントのランク・入社日・組織図の役割）。ログインIDなどの個人の情報は含みません。",
    inputSchema: {
      type: "object",
      properties: { store: STORE_ARG, include_inactive: { type: "boolean", description: "退職した人も含める（既定：含めない）" } },
      additionalProperties: false,
    },
    run: async (db, args) => {
      const { members, storeOf } = await staffAndStores(db, args.store, args.include_inactive === true);
      const profiles = await fx().staffProfiles.list();
      return {
        count: members.length,
        staff: members.map((s) => ({
          name: s.name,
          store: storeOf(s.storeId)?.name ?? "",
          role: roleLabel(s, storeOf(s.storeId)),
          executive: s.isExecutive,
          job_type: s.jobType === "stylist" ? "スタイリスト" : s.jobType === "assistant" ? "アシスタント" : "",
          assistant_rank: s.rank || "",
          joined_on: profiles.find((p) => p.staffId === s.id)?.joinedOn || null,
          mission: s.mission || "",
          active: s.isActive,
        })),
      };
    },
  },
  {
    name: "get_sales_trend",
    title: "売上の推移",
    description:
      "店舗ごと・月ごとの売上の推移（スタッフが入れた日報の数字の合計。ENi＝スタイリスト日報の技術・店販、イーリス＝日報の技術・オプション・物販）。by_staff を true にすると、最後の月の人ごとの売上も返します。",
    inputSchema: {
      type: "object",
      properties: {
        months: { type: "integer", minimum: 1, maximum: 24, description: "何か月分（既定：6）" },
        end_month: MONTH_ARG,
        store: STORE_ARG,
        by_staff: { type: "boolean", description: "最後の月の人ごとの売上も返す" },
      },
      additionalProperties: false,
    },
    run: async (db, args) => {
      const months = monthsBack(intArg(args.months, 6, 1, 24), monthArg(args.end_month));
      const from = monthRange(months[0]).from;
      const to = monthRange(months[months.length - 1]).to;
      const { staff, picked } = await staffAndStores(db, args.store, true);
      const [daily, eni] = await Promise.all([db.listDailyReports({ from, to }), db.listEniReports("stylist", { from, to })]);
      const storeOfStaff = new Map(staff.map((s) => [s.id, s.storeId]));
      type Row = { total_sales: number; service_sales: number; option_sales: number; retail_sales: number; clients: number; new_clients: number; reports: number };
      const empty = (): Row => ({ total_sales: 0, service_sales: 0, option_sales: 0, retail_sales: 0, clients: 0, new_clients: 0, reports: 0 });
      const byStoreMonth = new Map<string, Row>();
      const byStaff = new Map<string, number>();
      const last = months[months.length - 1];
      const add = (staffId: string, month: string, r: Partial<Row>) => {
        const storeId = storeOfStaff.get(staffId) ?? "";
        if (!picked.some((p) => p.id === storeId)) return;
        const key = `${storeId}|${month}`;
        const cur = byStoreMonth.get(key) ?? empty();
        for (const k of Object.keys(r) as (keyof Row)[]) cur[k] += r[k] ?? 0;
        cur.reports += 1;
        byStoreMonth.set(key, cur);
        if (month === last) byStaff.set(staffId, (byStaff.get(staffId) ?? 0) + (r.total_sales ?? 0));
      };
      for (const r of daily) {
        add(r.staffId, r.reportDate.slice(0, 7), {
          service_sales: r.serviceSales,
          option_sales: r.optionSales,
          retail_sales: r.retailSales,
          total_sales: r.serviceSales + r.optionSales + r.retailSales,
          clients: r.newClients + r.repeatClients,
          new_clients: r.newClients,
        });
      }
      for (const r of eni) {
        const service = num(r.answers.service_sales);
        const retail = num(r.answers.retail_sales);
        add(r.staffId, r.periodKey.slice(0, 7), { service_sales: service, retail_sales: retail, total_sales: service + retail, clients: num(r.answers.client_count), new_clients: num(r.answers.new_clients) });
      }
      return {
        unit: "円",
        months,
        stores: picked.map((st) => ({
          store: st.name,
          brand: isEyes(st) ? "イーリス" : "ENi",
          by_month: months.map((m) => ({ month: m, ...(byStoreMonth.get(`${st.id}|${m}`) ?? empty()) })),
        })),
        ...(args.by_staff === true
          ? {
              by_staff_last_month: [...byStaff.entries()]
                .map(([id, total]) => ({ name: staff.find((s) => s.id === id)?.name ?? "", store: picked.find((p) => p.id === storeOfStaff.get(id))?.name ?? "", month: last, total_sales: total }))
                .sort((a, b) => b.total_sales - a.total_sales),
            }
          : {}),
        note: "日報に入れた数字の合計です（SalonOneの会計の数字ではありません）。",
      };
    },
  },
  {
    name: "get_practice_time",
    title: "練習時間",
    description: "人ごと・月ごとの練習時間（時間）。練習の相手や内容の文章は返しません。",
    inputSchema: {
      type: "object",
      properties: { months: { type: "integer", minimum: 1, maximum: 12, description: "何か月分（既定：3）" }, end_month: MONTH_ARG, store: STORE_ARG },
      additionalProperties: false,
    },
    run: async (db, args) => {
      const months = monthsBack(intArg(args.months, 3, 1, 12), monthArg(args.end_month));
      const { members, storeOf } = await staffAndStores(db, args.store);
      const records = await db.listPracticeRecords({ from: monthRange(months[0]).from, to: monthRange(months[months.length - 1]).to });
      return {
        unit: "時間",
        months,
        staff: members
          .map((s) => {
            const mine = records.filter((r) => r.staffId === s.id);
            const byMonth = months.map((m) => ({ month: m, hours: hours(mine.filter((r) => r.practiceDate.startsWith(m)).reduce((a, r) => a + r.minutes, 0)) }));
            return { name: s.name, store: storeOf(s.storeId)?.name ?? "", role: roleLabel(s, storeOf(s.storeId)), by_month: byMonth, total_hours: hours(mine.reduce((a, r) => a + r.minutes, 0)) };
          })
          .filter((r) => r.total_hours > 0 || r.role.includes("アシスタント") || r.role.includes("スタイリスト")),
      };
    },
  },
  {
    name: "get_utilization",
    title: "稼働率",
    description: "人ごとの月の稼働率（%）。ENi＝入客時間÷（段数×8時間）、イーリス＝施術時間÷（シフトの時間−休憩）。予定より早く終わった時間・オーバーした時間も返します。",
    inputSchema: { type: "object", properties: { month: MONTH_ARG, store: STORE_ARG }, additionalProperties: false },
    run: async (db, args) => {
      const month = monthArg(args.month);
      // デモ（メモリ内のデータ）のときだけ、その場で計算する。本番は毎日の定期実行で作った数字を読むだけ
      if (isDemoMode()) await ensureMonthComputed(db, month);
      const { members, storeOf } = await staffAndStores(db, args.store);
      const rows = await monthUtilization(month, members.map((m) => m.id));
      return {
        month,
        staff: rows
          .map((r) => {
            const s = members.find((m) => m.id === r.staffId)!;
            return {
              name: s.name,
              store: storeOf(s.storeId)?.name ?? "",
              utilization_percent: r.rate,
              served_hours: hours(r.served),
              capacity_hours: hours(r.capacity),
              finished_early_minutes: r.ahead,
              overrun_minutes: r.over,
              days_without_data: r.missingDays,
            };
          })
          .sort((a, b) => (b.utilization_percent ?? -1) - (a.utilization_percent ?? -1)),
        note: "毎日の定期実行で計算した数字です。まだ計算していない日は含みません。",
      };
    },
  },
  {
    name: "get_report_submissions",
    title: "日報・週報の提出",
    description: "人ごとの、その月の必須入力（出退勤・日報・週報・売上・レジ締めなど。管理画面の設定どおり）の提出数と、まだの日。今日より先の日は数えません。",
    inputSchema: { type: "object", properties: { month: MONTH_ARG, store: STORE_ARG }, additionalProperties: false },
    run: async (db, args) => {
      const month = monthArg(args.month);
      const { from, to } = monthRange(month);
      const { members, storeOf } = await staffAndStores(db, args.store);
      const items = await computeInputItems(db, { from, to, staffIds: members.map((m) => m.id) });
      const [eniDaily, eniWeekly, daily] = await Promise.all([
        db.listEniReports("stylist", { from, to }),
        db.listEniReports("weekly", { from: weekStartOf(from), to }),
        db.listDailyReports({ from, to }),
      ]);
      return {
        month,
        staff: members.map((s) => {
          const mine = items.get(s.id) ?? [];
          const byKey = new Map<string, { done: number; required: number; missing_dates: string[] }>();
          for (const it of mine) {
            const label = INPUT_DEFS[it.key]?.label ?? it.key;
            const cur = byKey.get(label) ?? { done: 0, required: 0, missing_dates: [] };
            cur.required += 1;
            if (it.done) cur.done += 1;
            else cur.missing_dates.push(it.date);
            byKey.set(label, cur);
          }
          return {
            name: s.name,
            store: storeOf(s.storeId)?.name ?? "",
            required_inputs: [...byKey.entries()].map(([label, v]) => ({ item: label, done: v.done, required: v.required, rate_percent: pct(v.done, v.required), missing_dates: v.missing_dates.slice(-10) })),
            submitted: {
              eni_daily_reports: eniDaily.filter((r) => r.staffId === s.id).length,
              eni_weekly_reports: eniWeekly.filter((r) => r.staffId === s.id).length,
              eyes_daily_reports: daily.filter((r) => r.staffId === s.id).length,
            },
          };
        }),
      };
    },
  },
  {
    name: "get_routine_completion",
    title: "ルーティン業務の達成率",
    description: "その月のルーティン業務（幹部の業務＝店舗ごと、スタイリストの毎日の業務＝人ごと）の達成率。定休日（店舗のカレンダーで休み）は数えません。",
    inputSchema: { type: "object", properties: { month: MONTH_ARG, store: STORE_ARG }, additionalProperties: false },
    run: async (db, args) => {
      const month = monthArg(args.month);
      const today = todayJst();
      const { from, to } = monthRange(month);
      const { members, picked, storeOf } = await staffAndStores(db, args.store);
      const routines = (await db.listManagerRoutines()).filter((r) => r.isActive);
      const dates = datesOfMonth(month).filter((d) => d <= today);
      const weeks = [...new Set(dates.map(weekStartOf))];
      const [checks, calendar] = await Promise.all([db.listManagerRoutineChecks([...dates, ...weeks, month]), db.listStoreCalendarDays({ from, to })]);
      const openDates = (storeId: string) => dates.filter((d) => !calendar.some((c) => c.storeId === storeId && c.date === d && c.dayStatus === "closed"));
      const rateFor = (audience: "exec" | "stylist", subjectKey: string, storeId: string) => {
        const open = openDates(storeId);
        const periods = { daily: open, weekly: [...new Set(open.map(weekStartOf))], monthly: dates.length ? [month] : [] };
        const list = routines
          .filter((r) => r.audience === audience)
          .map((r) => {
            const keys = periods[r.cycle];
            const done = keys.filter((k) => checks.some((c) => c.routineId === r.id && c.periodKey === k && (c.subjectKey === subjectKey || (c.subjectKey === "" && audience === "exec")))).length;
            return { title: r.title, cycle: ROUTINE_CYCLE_LABEL[r.cycle], done, expected: keys.length };
          });
        const done = list.reduce((a, r) => a + r.done, 0);
        const expected = list.reduce((a, r) => a + r.expected, 0);
        return { rate_percent: pct(done, expected), done, expected, routines: list };
      };
      return {
        month,
        stores: picked.filter((st) => !isEyes(st)).map((st) => ({ store: st.name, ...rateFor("exec", st.id, st.id) })),
        stylists: members.filter((s) => s.jobType === "stylist").map((s) => ({ name: s.name, store: storeOf(s.storeId)?.name ?? "", ...rateFor("stylist", s.id, s.storeId) })),
      };
    },
  },
  {
    name: "get_goals",
    title: "目標と進み具合",
    description: "会社・店舗の目標と、スタッフ一人ひとりの目標・アクションプランの進み具合（%）。幹部のコメントの文章は返しません。",
    inputSchema: {
      type: "object",
      properties: { store: STORE_ARG, staff_name: { type: "string", description: "スタッフの名前（一部でよい）。省略すると全員" } },
      additionalProperties: false,
    },
    run: async (db, args) => {
      const { members, picked, storeOf } = await staffAndStores(db, args.store);
      const q = typeof args.staff_name === "string" ? args.staff_name.trim() : "";
      const targets = q ? members.filter((m) => m.name.includes(q)) : members;
      const goals = await fx().goals.list({ where: { isActive: true, level: { in: ["company", "store"] } }, order: [["createdAt", "asc"]] });
      const label = (g: { periodType: string; periodKey: string }) => `${PERIOD_LABEL[g.periodType as keyof typeof PERIOD_LABEL] ?? g.periodType}（${g.periodKey}）`;
      const people = await Promise.all(
        targets.map(async (s) => {
          const tree = await goalTreeFor(db, s.id, s.storeId);
          return {
            name: s.name,
            store: storeOf(s.storeId)?.name ?? "",
            goals: tree.personal.map((n) => ({
              title: n.goal.title,
              period: label(n.goal),
              area: n.goal.area,
              target: n.goal.targetValue ? `${n.goal.targetValue}${n.goal.unit}` : "",
              progress_percent: n.progress,
              action_plans: n.plans.map((p) => ({ title: p.title, progress_percent: p.progress, done: p.done })),
            })),
          };
        })
      );
      return {
        company: goals.filter((g) => g.level === "company").map((g) => ({ title: g.title, period: label(g), target: g.targetValue ? `${g.targetValue}${g.unit}` : "" })),
        stores: goals
          .filter((g) => g.level === "store" && picked.some((p) => p.id === g.storeId))
          .map((g) => ({ store: picked.find((p) => p.id === g.storeId)?.name ?? "", title: g.title, period: label(g), target: g.targetValue ? `${g.targetValue}${g.unit}` : "" })),
        staff: people.filter((p) => p.goals.length > 0 || q),
      };
    },
  },
];

export function toolByName(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}
