// 閲覧の記録（だれが・いつ・何を見たか）の共通ロジック。
// まずは週報（アシスタント）を先輩がどれだけ見ているかに使う。
// 記録の形（view_logs）は種類（targetType）で分けてあるので、日報・議事録などにもそのまま使い回せる
// （あとで管理画面の「誰が何をどれくらい見ているか」に使う予定）。

import type { DataStore, EniReport, ViewLog } from "@/lib/data/types";

/** 記録する種類。足すときはここに1つ足す */
export const VIEW_TARGETS = {
  weeklyReport: "weekly_report",
} as const;

/** 同じ人が同じものを見直したとき、この分数以内なら数えない（再読み込みで件数が増えないように） */
export const VIEW_DEDUPE_MINUTES = 10;

/** 閲覧状況（だれが・いつ・だれの週報を見たか）を見られるか：幹部と管理者だけ */
export function canSeeViewStats(viewer: { isExec: boolean }): boolean {
  return viewer.isExec;
}

/**
 * 週報を開いたことを記録する。自分の週報を見た分は数えない。記録したら true。
 * 見てよい人かどうかは呼び出し側（サーバーアクション）で判定しておく。
 */
export async function recordWeeklyReportView(
  db: DataStore,
  viewerStaffId: string,
  report: Pick<EniReport, "id" | "staffId" | "periodKey">
): Promise<boolean> {
  if (report.staffId === viewerStaffId) return false;
  return db.recordView(
    {
      targetType: VIEW_TARGETS.weeklyReport,
      targetId: report.id,
      ownerStaffId: report.staffId,
      periodKey: report.periodKey,
      viewerStaffId,
    },
    { dedupeMinutes: VIEW_DEDUPE_MINUTES }
  );
}

export interface ViewerRow {
  viewerStaffId: string;
  /** 見た週報の件数（同じ週報を何度見ても1件） */
  reportCount: number;
  /** のべの閲覧回数 */
  totalViews: number;
  /** 見た相手（週報を書いた人） */
  ownerStaffIds: string[];
  lastViewedAt: Date;
}

export interface WeeklyViewSummary {
  /** 見た人ごと（見た件数の多い順） */
  byViewer: ViewerRow[];
  /** 週報ごとの、見た人（最後に見た順） */
  viewersByReport: Map<string, { viewerStaffId: string; count: number; lastViewedAt: Date }[]>;
  /** 誰にも見られていない週報 */
  unviewed: EniReport[];
}

/**
 * その週の週報と閲覧の記録から、見た人ごと・週報ごとの状況をまとめる。
 * 自分の週報を見た記録（念のため）と、その週の週報以外の記録は数えない。
 */
export function summarizeWeeklyViews(reports: EniReport[], logs: ViewLog[]): WeeklyViewSummary {
  const reportById = new Map(reports.map((r) => [r.id, r]));
  const valid = logs.filter((l) => {
    const report = reportById.get(l.targetId);
    return report && l.viewerStaffId !== report.staffId;
  });

  const viewers = new Map<string, { reports: Set<string>; owners: Set<string>; total: number; last: Date }>();
  const byReport = new Map<string, Map<string, { count: number; last: Date }>>();
  for (const l of valid) {
    const report = reportById.get(l.targetId)!;
    const v = viewers.get(l.viewerStaffId) ?? { reports: new Set(), owners: new Set(), total: 0, last: l.viewedAt };
    v.reports.add(l.targetId);
    v.owners.add(report.staffId);
    v.total += 1;
    if (l.viewedAt > v.last) v.last = l.viewedAt;
    viewers.set(l.viewerStaffId, v);

    const perReport = byReport.get(l.targetId) ?? new Map();
    const row = perReport.get(l.viewerStaffId) ?? { count: 0, last: l.viewedAt };
    row.count += 1;
    if (l.viewedAt > row.last) row.last = l.viewedAt;
    perReport.set(l.viewerStaffId, row);
    byReport.set(l.targetId, perReport);
  }

  const byViewer: ViewerRow[] = [...viewers.entries()]
    .map(([viewerStaffId, v]) => ({
      viewerStaffId,
      reportCount: v.reports.size,
      totalViews: v.total,
      ownerStaffIds: [...v.owners],
      lastViewedAt: v.last,
    }))
    .sort((a, b) => b.reportCount - a.reportCount || b.lastViewedAt.getTime() - a.lastViewedAt.getTime());

  const viewersByReport = new Map<string, { viewerStaffId: string; count: number; lastViewedAt: Date }[]>();
  for (const [reportId, perReport] of byReport) {
    viewersByReport.set(
      reportId,
      [...perReport.entries()]
        .map(([viewerStaffId, row]) => ({ viewerStaffId, count: row.count, lastViewedAt: row.last }))
        .sort((a, b) => b.lastViewedAt.getTime() - a.lastViewedAt.getTime())
    );
  }

  return { byViewer, viewersByReport, unviewed: reports.filter((r) => !byReport.has(r.id)) };
}
