// スタッフのシフトのカレンダー（公開中の月だけ）。だれが休みか・行事・人数を、月曜はじまりのカレンダーで見る。
// 希望休の理由は出さない（管理者が入れた「休みの中身」だけ出す）。

import { getDataStore } from "@/lib/data";
import { formatMonthJa, todayJst } from "@/lib/date";
import { loadCalendarContext } from "@/lib/shift/calendar-load";
import { buildCalendarDays, calendarEvents, calendarWeeks, storeRulesSummary } from "@/lib/shift/calendar";
import { ShiftCalendarGrid, ShiftCalendarLegend, type CalendarCellData } from "@/components/shift-calendar";

export async function StaffShiftCalendar({
  month,
  storeParam,
  brandLabel,
}: {
  month: string;
  storeParam: string | undefined;
  brandLabel: string;
}) {
  const db = getDataStore();
  const ctx = await loadCalendarContext(db, month, storeParam, brandLabel, { showDraft: false });
  if (ctx.status !== "confirmed") {
    return (
      <p className="text-sm text-ink-500 rounded-xl bg-ink-50 px-3 py-3">
        {formatMonthJa(month)}のシフトは、お店が公開するとカレンダーで見られます。
      </p>
    );
  }
  const committeeNames = new Map((await db.listCommittees()).map((c) => [c.committeeKey, c.name]));
  const events = calendarEvents({
    month,
    storeDays: [...ctx.storeDays.values()],
    companyEvents: ctx.inputs.companyEvents,
    meetings: ctx.inputs.meetings,
    committeeNames,
  });
  const people = ctx.people.map((s) => ({ id: s.id, name: ctx.names.get(s.id) ?? s.name, jobType: s.jobType, tiers: s.tiers }));
  const today = todayJst();
  const cells: CalendarCellData[] = buildCalendarDays({ month, people, closures: ctx.closures, events, dayOf: ctx.dayOf }).map(
    (d) => ({
      date: d.date,
      day: Number(d.date.slice(8)),
      weekday: d.weekday,
      closure: d.closure ? { label: d.closure.label } : null,
      events: d.events,
      off: d.off.map((o) => ({ id: o.staffId, name: o.name, reason: o.kind === "admin" ? o.reason : "", kind: o.kind, paid: false })),
      counts: d.counts,
      today: d.date === today,
    })
  );
  return (
    <div>
      <p className="text-xs font-bold text-ink-600 mb-2">{ctx.store.name}</p>
      <div className="-mx-4 sm:mx-0">
        <ShiftCalendarGrid weeks={calendarWeeks(month, cells)} />
      </div>
      <ShiftCalendarLegend admin={false} rules={ctx.quotaMode ? storeRulesSummary(ctx.store) : ""} />
    </div>
  );
}
