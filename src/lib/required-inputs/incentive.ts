// 依頼14：インセンティブとのつながり。
//  ・インセンティブの計算に使うデータは、締め日までに入力・確認されたものだけ（初期値：翌月3日まで）
//  ・締め日の3日前（初期値）から、未入力が残っている人に毎日知らせる（lib/jobs）
//  ・締め日のあとでも、理由を書いて管理者が承認すれば反映できる（入れ忘れの救済）
//  ・基本給など、インセンティブ以外の給与には影響させない（勤怠のCSVなどはこの判定を通さない）
// インセンティブの金額の計算式はまだ決まっていないため（TODO）、ここでは「使ってよいデータ」と売上の合計までを出す。

import { fx } from "@/lib/data/tables";
import type { IncentiveRescue } from "@/lib/data/tables";
import { addMonths, formatDateJa, jstDayBoundsUtc, monthRange } from "@/lib/date";
import { readJsonSetting } from "@/lib/feature-settings";
import { adminsOf, notifyStaff } from "@/lib/notify";
import { computeInputItems, INPUT_DEFS, type InputKey } from "@/lib/required-inputs";
import { isEyesStore } from "@/lib/viewer";
import type { DataStore, Staff } from "@/lib/data/types";

export const INCENTIVE_SETTINGS_KEY = "incentive_settings";
export interface IncentiveSettings {
  /** 締め日＝対象の月の翌月の何日（その日の23:59まで） */
  deadlineDay: number;
  /** 締め日の何日前から知らせるか */
  reminderDaysBefore: number;
  /** インセンティブに使う入力 */
  keys: InputKey[];
}
export const DEFAULT_INCENTIVE_SETTINGS: IncentiveSettings = { deadlineDay: 3, reminderDaysBefore: 3, keys: ["daily_report", "sales", "attendance"] };

export async function getIncentiveSettings(db: DataStore): Promise<IncentiveSettings> {
  return readJsonSetting(db, INCENTIVE_SETTINGS_KEY, DEFAULT_INCENTIVE_SETTINGS);
}

/** 対象の月の締め日（"YYYY-MM-DD"） */
export function incentiveDeadline(month: string, settings: IncentiveSettings): string {
  const next = addMonths(month, 1);
  const last = Number(monthRange(next).to.slice(8));
  const day = Math.min(Math.max(1, Math.round(settings.deadlineDay)), last);
  return `${next}-${String(day).padStart(2, "0")}`;
}

export type ItemStatus = "ontime" | "late" | "missing" | "rescued" | "pending_rescue";
export const STATUS_LABEL: Record<ItemStatus, string> = {
  ontime: "締め日までに入力",
  late: "締め日のあと",
  missing: "未入力",
  rescued: "救済（承認済み）",
  pending_rescue: "救済の承認待ち",
};

export interface IncentiveItem {
  key: InputKey;
  label: string;
  date: string;
  status: ItemStatus;
  submittedAt: Date | null;
  /** その日の売上（日報のある日だけ） */
  sales: number;
}

export interface IncentiveSummary {
  staffId: string;
  items: IncentiveItem[];
  eligibleSales: number;
  counts: Record<ItemStatus, number>;
}

/** 月の、人ごとのインセンティブに使えるデータ */
export async function incentiveReport(db: DataStore, month: string, staffIds?: string[]): Promise<{ deadline: string; summaries: IncentiveSummary[] }> {
  const settings = await getIncentiveSettings(db);
  const deadline = incentiveDeadline(month, settings);
  const deadlineEnd = jstDayBoundsUtc(deadline).end;
  const { from, to } = monthRange(month);
  const [items, submissions, rescues, stylistReports, dailyReports, staffList, stores] = await Promise.all([
    computeInputItems(db, { from, to, staffIds }),
    fx().inputSubmissions.list({ where: { date: { gte: from, lte: to } } }),
    fx().incentiveRescues.list({ where: { month } }),
    db.listEniReports("stylist", { from, to }),
    db.listDailyReports({ from, to }),
    db.listStaff(),
    db.listStores(),
  ]);
  const summaries: IncentiveSummary[] = [];
  for (const [staffId, list] of items) {
    const me = staffList.find((s) => s.id === staffId);
    const eyes = isEyesStore(stores.find((s) => s.id === me?.storeId));
    const out: IncentiveItem[] = [];
    for (const it of list) {
      if (!settings.keys.includes(it.key)) continue;
      const subKeys = it.key === "attendance" ? ["attendance_in"] : [it.key];
      const sub = submissions.find((x) => x.staffId === staffId && x.date === it.date && subKeys.includes(x.inputKey));
      const report = eyes
        ? dailyReports.find((r) => r.staffId === staffId && r.reportDate === it.date)
        : stylistReports.find((r) => r.staffId === staffId && r.periodKey === it.date);
      // 入れた日時：記録があればそれ。無ければ日報の最後の更新（イーリスの日報は日時が無いので、締め日までとみなす）
      const submittedAt = sub?.firstSubmittedAt ?? (report && "updatedAt" in report ? report.updatedAt : null);
      const rescue = rescues.find((r) => r.staffId === staffId && r.inputKey === it.key && r.date === it.date);
      let status: ItemStatus;
      if (!it.done) status = "missing";
      else if (!submittedAt || submittedAt < deadlineEnd) status = "ontime";
      else if (rescue?.status === "approved") status = "rescued";
      else if (rescue?.status === "pending") status = "pending_rescue";
      else status = "late";
      const sales =
        (it.key === "sales" || it.key === "daily_report") && report
          ? eyes
            ? (report as { serviceSales: number; optionSales: number; retailSales: number }).serviceSales +
              (report as { optionSales: number }).optionSales +
              (report as { retailSales: number }).retailSales
            : num((report as { answers: Record<string, unknown> }).answers.service_sales) + num((report as { answers: Record<string, unknown> }).answers.retail_sales)
          : 0;
      out.push({ key: it.key, label: INPUT_DEFS[it.key].label, date: it.date, status, submittedAt, sales });
    }
    const counts = { ontime: 0, late: 0, missing: 0, rescued: 0, pending_rescue: 0 } as Record<ItemStatus, number>;
    for (const i of out) counts[i.status]++;
    // 売上は日ごとに1回だけ数える（日報と売上の両方が対象でも二重にしない）
    const eligibleDates = new Map<string, number>();
    for (const i of out) {
      if ((i.status === "ontime" || i.status === "rescued") && i.sales > 0) eligibleDates.set(i.date, i.sales);
    }
    summaries.push({
      staffId,
      items: out,
      eligibleSales: [...eligibleDates.values()].reduce((a, b) => a + b, 0),
      counts,
    });
  }
  return { deadline, summaries };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------- 救済（理由を書いて、管理者が承認）

export async function requestRescue(
  db: DataStore,
  me: Staff,
  input: { month: string; inputKey: InputKey; date: string; reason: string }
): Promise<IncentiveRescue> {
  const row = await fx().incentiveRescues.insert({ staffId: me.id, ...input, status: "pending" });
  await notifyStaff(db, await adminsOf(db), {
    kind: "approval",
    title: "締め日後の入力の救済",
    body: `${me.name}さん：${formatDateJa(input.date)}の${INPUT_DEFS[input.inputKey].label}（${input.reason}）`,
    href: "/staff/approvals",
    refId: row.id,
  });
  return row;
}

/** 救済を決められるのは管理者だけ */
export async function decideRescue(
  db: DataStore,
  approver: Staff,
  id: string,
  decision: "approved" | "rejected",
  note: string
): Promise<{ ok: boolean; message: string }> {
  if (approver.role !== "admin") return { ok: false, message: "締め日後の救済を決められるのは管理者です" };
  const row = await fx().incentiveRescues.get(id);
  if (!row || row.status !== "pending") return { ok: false, message: "申請が見つからないか、もう決まっています" };
  await fx().incentiveRescues.update(id, { status: decision, decidedBy: approver.id, decidedAt: new Date(), decisionNote: note });
  await notifyStaff(db, [row.staffId], {
    kind: "input",
    title: decision === "approved" ? "締め日後の入力が認められました" : "締め日後の入力は見送りになりました",
    body: `${formatDateJa(row.date)}の${INPUT_DEFS[row.inputKey as InputKey]?.label ?? row.inputKey}${note ? `：${note}` : ""}`,
    href: `/staff/incentive?month=${row.month}`,
    refId: id,
  });
  return { ok: true, message: decision === "approved" ? "承認しました（インセンティブに入ります）" : "見送りにしました" };
}
