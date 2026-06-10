// 日報からのKPI集計（成績管理）

import type { DailyReport } from "@/lib/data/types";

export interface KpiSummary {
  reportCount: number; // 日報件数
  newClients: number;
  repeatClients: number;
  totalClients: number;
  nextBookings: number;
  serviceSales: number;
  optionSales: number;
  retailSales: number;
  totalSales: number; // 技術＋オプション＋物販
  /** 次回予約率 ＝ 次回予約数 ÷（新規＋既存施術人数）。施術0人のときは null */
  rebookRate: number | null;
  /** 新規構成比 ＝ 新規 ÷（新規＋既存）。施術0人のときは null */
  newRate: number | null;
}

export function summarize(reports: DailyReport[]): KpiSummary {
  const s = {
    reportCount: reports.length,
    newClients: 0,
    repeatClients: 0,
    nextBookings: 0,
    serviceSales: 0,
    optionSales: 0,
    retailSales: 0,
  };
  for (const r of reports) {
    s.newClients += r.newClients;
    s.repeatClients += r.repeatClients;
    s.nextBookings += r.nextBookings;
    s.serviceSales += r.serviceSales;
    s.optionSales += r.optionSales;
    s.retailSales += r.retailSales;
  }
  const totalClients = s.newClients + s.repeatClients;
  return {
    ...s,
    totalClients,
    totalSales: s.serviceSales + s.optionSales + s.retailSales,
    rebookRate: totalClients > 0 ? s.nextBookings / totalClients : null,
    newRate: totalClients > 0 ? s.newClients / totalClients : null,
  };
}

/** 月（"YYYY-MM"）ごとに集計（月次推移用） */
export function summarizeByMonth(reports: DailyReport[]): { month: string; kpi: KpiSummary }[] {
  const byMonth = new Map<string, DailyReport[]>();
  for (const r of reports) {
    const m = r.reportDate.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(r);
  }
  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, rs]) => ({ month, kpi: summarize(rs) }));
}

/** スタッフ（staffId）ごとに集計 */
export function summarizeByStaff(reports: DailyReport[]): Map<string, KpiSummary> {
  const byStaff = new Map<string, DailyReport[]>();
  for (const r of reports) {
    if (!byStaff.has(r.staffId)) byStaff.set(r.staffId, []);
    byStaff.get(r.staffId)!.push(r);
  }
  return new Map([...byStaff.entries()].map(([id, rs]) => [id, summarize(rs)]));
}

export function formatYen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

export function formatPercent(rate: number | null): string {
  return rate === null ? "−" : `${Math.round(rate * 100)}%`;
}
