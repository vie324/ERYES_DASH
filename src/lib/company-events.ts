// 全体スケジュール（会社のイベント・全員にかかわる予定）の共通ロジック。
// 予定（計画スケジュール）の「全体」タブ・会社の予定ページ・ホームで同じ取り出し方を使う。
// データは company_events（登録・編集は管理者と幹部、閲覧は全員）。

import { addDays, formatDateJa } from "@/lib/date";
import type { CompanyEvent, DataStore } from "@/lib/data/types";

/**
 * 直近の全体スケジュール：今日以降に終わる予定を、開始日・時刻の早い順に。
 * ホームの「全体スケジュールの直近の予定」に使う（days 日先まで・最大 limit 件）。
 */
export async function listUpcomingCompanyEvents(
  db: DataStore,
  today: string,
  opts: { days?: number; limit?: number } = {}
): Promise<CompanyEvent[]> {
  const events = await db.listCompanyEvents({ from: today, to: addDays(today, opts.days ?? 60) });
  return sortEvents(events.filter((e) => e.endDate >= today)).slice(0, opts.limit ?? 5);
}

/** その日にかかっている予定（開始日〜終了日の間）。予定画面の「その日」に出す */
export function eventsOnDate(events: CompanyEvent[], date: string): CompanyEvent[] {
  return sortEvents(events.filter((e) => e.startDate <= date && date <= e.endDate));
}

/** 開始日 → 開始時刻（終日は先頭）→ 題名の順 */
export function sortEvents(events: CompanyEvent[]): CompanyEvent[] {
  return [...events].sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      (a.startTime || "").localeCompare(b.startTime || "") ||
      a.title.localeCompare(b.title)
  );
}

/** 「11月20日(金)」「11月20日(金)〜22日(日)」＋時刻（終日なら時刻なし） */
export function eventPeriodLabel(e: Pick<CompanyEvent, "startDate" | "endDate" | "startTime">): string {
  const period =
    e.startDate === e.endDate ? formatDateJa(e.startDate) : `${formatDateJa(e.startDate)}〜${formatDateJa(e.endDate)}`;
  return e.startTime ? `${period} ${e.startTime}〜` : period;
}

/** "/staff/plan?tab=all" のような基本のURLに、続きのクエリを足す */
export function withQuery(base: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  if (!query) return base;
  return `${base}${base.includes("?") ? "&" : "?"}${query}`;
}
