import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { getBrand, BRAND_INFO } from "@/lib/brand";
import { addMonths, datesOfMonth, formatDateJa, formatMonthJa, thisMonthJst, todayJst, weekdayOf } from "@/lib/date";
import { buildTargetMonth, currentTargetMonth, deadlineLabel, isRequestEditable, remainingLabel } from "@/lib/shift/period";
import { loadCalendarContext } from "@/lib/shift/calendar-load";
import {
  BALANCE_MARGIN,
  buildCalendarDays,
  calendarEvents,
  calendarWeeks,
  storeRulesSummary,
  summarizePeople,
} from "@/lib/shift/calendar";
import { TOP_TIER } from "@/lib/shift/assign";
import { SHIFT_STATUS_LABEL, shortStoreName } from "@/lib/shift/month";
import { requestTargets } from "@/lib/shift/requests";
import { normalizeTiers } from "@/lib/eni/forms";
import { MonthNav, PageHeader, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { PrintButton } from "@/components/print-button";
import { ShiftCalendarLegend, type CalendarCellData } from "@/components/shift-calendar";
import { CalendarBoard, type EditorDayState, type EditorPersonDay } from "./calendar-board";
import { StoreRulesForm } from "../settings/store-rules-form";
import { discardDraftAction, generateShiftAction, publishShiftAction, unpublishShiftAction } from "../actions";
import { saveNicknamesAction } from "./actions";

const DONE: Record<string, string> = {
  generated: "下書きを作りました。カレンダーで休みの人と人数を確かめて、日をタップして直してください。よければスタッフに公開します。",
  published: "スタッフに公開しました。スタッフのシフト画面がこの内容に変わり、通知も送りました。",
  unpublished: "公開をやめて下書きに戻しました（スタッフには、いつもどおりの予定が出ています）。",
  discarded: "下書きを削除しました。ここで入れた休みは残っています。",
  nickname: "呼び名を保存しました。",
};
const ERRORS: Record<string, string> = {
  confirmed: "公開中の月は作り直せません。作り直すときは、先に「公開をやめて下書きに戻す」を押してください。",
  empty: "シフト表がまだありません。先に「自動で作る」を押してください。",
  nostaff: "自動で作れる人がいません。スタッフの所属店舗・職種を確かめてください。",
  rules: "お店の休みの決まりの入力を確かめてください（月の休みの数は0〜31日）。",
  rules_db: "お店の休みの決まりを使うには、データベースの更新（supabase/schema.sql の再実行）が必要です。",
  nickname: "呼び名を保存できない人がいました。データベースの更新（supabase/schema.sql の再実行）が必要かもしれません。",
};

/** 職種の補足（入力パネル用） */
function subOf(s: { jobType: string; tiers: number }): string {
  if (s.jobType === "stylist") return `スタイリスト・${normalizeTiers(s.tiers)}段`;
  if (s.jobType === "assistant") return "アシスタント";
  return "";
}

// シフトのカレンダー（管理者）：一般的なカレンダーに予定を打ち込むように、休みの人・休みの中身・お店の休み・行事を入れ、
// 「休みの数で自動で作る」で残りの休みを全員に入れて、カレンダーで確かめて公開する。印刷もできる。
export default async function ShiftCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; store?: string; done?: string; error?: string; saved?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const db = getDataStore();
  const today = todayJst();
  const brand = (await getBrand()) ?? "eni";
  const rules = await db.getShiftRules();
  const thisMonth = thisMonthJst();
  const openMonth = currentTargetMonth(rules, today);
  const buildMonth = buildTargetMonth(rules, today);
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : buildMonth;

  const ctx = await loadCalendarContext(db, month, params.store, BRAND_INFO[brand].label);
  const { inputs, store, view, status } = ctx;
  const committeeNames = new Map((await db.listCommittees()).map((c) => [c.committeeKey, c.name]));
  const storeDays = [...ctx.storeDays.values()];
  const events = calendarEvents({ month, storeDays, companyEvents: inputs.companyEvents, meetings: inputs.meetings, committeeNames });
  const autoEvents = calendarEvents({ month, storeDays: [], companyEvents: inputs.companyEvents, meetings: inputs.meetings, committeeNames });

  const people = ctx.people.map((s) => ({ id: s.id, name: ctx.names.get(s.id) ?? s.name, jobType: s.jobType, tiers: s.tiers }));
  const days = buildCalendarDays({ month, people, closures: ctx.closures, events, dayOf: ctx.dayOf });
  const cells: CalendarCellData[] = days.map((d) => ({
    date: d.date,
    day: Number(d.date.slice(8)),
    weekday: d.weekday,
    closure: d.closure ? { label: d.closure.label } : null,
    events: d.events,
    // 希望休の理由は出さない（印刷して貼ることもあるので）。管理者が入れた休みの中身だけ
    off: d.off.map((o) => ({ id: o.staffId, name: o.name, reason: o.kind === "admin" ? o.reason : "", kind: o.kind, paid: o.paidLeave })),
    counts: d.counts,
    today: d.date === today,
  }));
  const weeks = calendarWeeks(month, cells);

  const personDays: Record<string, Record<string, EditorPersonDay>> = {};
  const dayStates: Record<string, EditorDayState> = {};
  for (const date of datesOfMonth(month)) {
    personDays[date] = {};
    for (const p of ctx.people) {
      const pd = ctx.dayOf(p.id, date);
      const req = ctx.requestOf(p.id, date);
      personDays[date][p.id] = {
        w: pd.working,
        k: pd.kind,
        r: pd.kind === "admin" ? pd.reason : undefined,
        req: req ? { r: req.reason, p: req.paidLeave } : null,
      };
    }
    const sd = ctx.storeDays.get(date);
    dayStates[date] = {
      status: sd?.dayStatus ?? "",
      label: sd?.closedLabel ?? "",
      counts: sd?.countsAsDayOff ?? false,
      note: sd?.note ?? "",
      weeklyClosed: store.closedWeekdays.includes(weekdayOf(date)),
      autoEvents: autoEvents.get(date) ?? [],
    };
  }

  // ---- ひとりずつの休みの数 ----
  const summaries = summarizePeople(people, days);
  const quota = store.monthlyDaysOff;

  // ---- 気になる日 ----
  const tiersOf = new Map(ctx.people.map((s) => [s.id, s.jobType === "stylist" ? normalizeTiers(s.tiers) : 0]));
  const notes: string[] = [];
  for (const d of days) {
    if (d.closure || !d.counts) continue;
    const label = formatDateJa(d.date);
    if (d.counts.headcount > 0 && d.counts.stylists === 0) notes.push(`${label}：スタイリストがいない`);
    else if (d.counts.diff < 0) notes.push(`${label}：出勤${d.counts.headcount}人が段数${d.counts.tiers}より少ない`);
    else if (d.counts.diff > BALANCE_MARGIN) notes.push(`${label}：出勤が段数より${d.counts.diff}人多い`);
    const topOff = d.off.filter((o) => (tiersOf.get(o.staffId) ?? 0) >= TOP_TIER);
    if (topOff.length >= 2) notes.push(`${label}：3段のスタイリストが同じ日に休み（${topOff.map((o) => o.name).join("・")}）`);
  }
  for (const p of people) {
    let run = 0;
    let from = "";
    for (const d of days) {
      if (d.working.includes(p.id)) {
        if (run === 0) from = d.date;
        run++;
        if (run === rules.maxConsecutiveDays + 1) notes.push(`${p.name}：${formatDateJa(from)}から${rules.maxConsecutiveDays}日を超えて連勤`);
      } else {
        run = 0;
      }
    }
  }

  // ---- 希望休の集まり具合 ----
  const rosterIds = new Set(inputs.staffIds);
  const targets = requestTargets(ctx.people, rosterIds, inputs.requestStatuses);
  const submitted = targets.filter((s) => inputs.requestStatuses.get(s.id)?.submitted).length;
  const requestEditable = isRequestEditable(month, rules, today);

  const [y, m] = month.split("-").map(Number);
  const storeKey = view.filterKey;
  const href = (patch: { month?: string; store?: string }) => {
    const q = new URLSearchParams();
    q.set("month", patch.month ?? month);
    const st = patch.store ?? storeKey;
    if (st) q.set("store", st);
    return `/admin/schedule/calendar?${q.toString()}`;
  };
  const tableHref = `/admin/schedule?${new URLSearchParams({ month, ...(storeKey ? { store: storeKey } : {}) }).toString()}`;
  const flash = DONE[params.done ?? ""] ?? (params.saved === "rules" ? "お店の休みの決まりを保存しました。" : undefined);
  const monthChip = (mm: string, label: string) => (
    <Link key={label} href={href({ month: mm })} className={`chip ${mm === month ? "chip-active" : ""}`}>
      {label} {Number(mm.slice(5))}月
    </Link>
  );
  const hidden = (
    <>
      <input type="hidden" name="target_month" value={month} />
      <input type="hidden" name="store" value={storeKey} />
      <input type="hidden" name="back" value="calendar" />
    </>
  );

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title="シフトのカレンダー"
          backHref="/admin/schedule"
          backLabel="シフトへ戻る"
          icon="calendar"
          description="休みの人・休みの中身・行事を、カレンダーに打ち込むように入れて作ります"
          actions={
            <>
              <Link href={tableHref} className="btn-ghost !text-xs">
                <Icon name="layoutGrid" className="w-4 h-4" />
                表で見る
              </Link>
              <PrintButton label="印刷・PDF" className="btn-ghost !text-xs" />
            </>
          }
        />

        {flash && <p className="note note-ok mb-4">{flash}</p>}
        {params.error && <p className="note note-danger mb-4">{ERRORS[params.error] ?? "うまく受け取れませんでした。もう一度お試しください。"}</p>}

        <div className="flex gap-1.5 flex-wrap mb-2">
          {monthChip(thisMonth, "今月")}
          {buildMonth > thisMonth && monthChip(buildMonth, "作る月")}
          {monthChip(openMonth, "受付中")}
        </div>
        <MonthNav
          month={month}
          monthLabel={formatMonthJa(month)}
          prevHref={href({ month: addMonths(month, -1) })}
          nextHref={href({ month: addMonths(month, 1) })}
        />
        {ctx.storeChoices.length > 1 && (
          <div className="flex gap-1.5 flex-wrap mb-3">
            {ctx.storeChoices.map((s) => (
              <Link key={s.id} href={href({ store: s.id })} className={`chip ${s.id === store.id ? "chip-active" : ""}`}>
                {shortStoreName(s.name)}
              </Link>
            ))}
          </div>
        )}

        {!ctx.quotaMode && (
          <div className="note note-info !font-normal mb-4 text-sm">
            <p className="font-bold">このお店は「月の休みの数」が決まっていません</p>
            <p className="mt-1">
              下の「お店の休みの決まり」で定休日と月の休みの数（例：月曜定休を含めて8休）を決めると、
              希望休を出していない人も含めて全員の休みを、決まりどおりに自動で入れられます。
            </p>
            <a href="#rules" className="inline-block mt-1 text-xs font-bold underline">決まりを決める</a>
          </div>
        )}

        {/* ---- 進め方 ---- */}
        <section className="card mb-4 space-y-3">
          <ol className="grid gap-2 sm:grid-cols-3 text-sm">
            <li className="card-quiet">
              <p className="text-[11px] font-bold text-ink-400">1. 休みを入れる</p>
              <p className="font-bold text-ink-900 mt-0.5">希望休 提出 {submitted} / {targets.length}人</p>
              <p className="text-xs text-ink-500 mt-0.5">
                締切 {deadlineLabel(month, rules)}（{requestEditable ? remainingLabel(month, rules, today) : "締切済み"}）。
                研修などは日をタップして入れます
              </p>
            </li>
            <li className="card-quiet">
              <p className="text-[11px] font-bold text-ink-400">2. 自動で作って直す</p>
              <p className="font-bold text-ink-900 mt-0.5">シフト表：{SHIFT_STATUS_LABEL[status]}</p>
              <p className="text-xs text-ink-500 mt-0.5">
                {ctx.quotaMode && ctx.target !== null
                  ? `1人${quota}休（${formatMonthJa(month)}は各自${ctx.target}日）になるよう、足りない休みを入れます`
                  : "基本パターン・希望休をもとに作ります"}
              </p>
            </li>
            <li className="card-quiet">
              <p className="text-[11px] font-bold text-ink-400">3. スタッフに公開</p>
              <p className="mt-1">
                {status === "confirmed" ? (
                  <StatusBadge label="公開中" tone="ok" />
                ) : status === "draft" ? (
                  <StatusBadge label="まだ公開していません" tone="warning" />
                ) : (
                  <StatusBadge label="シフト表なし" tone="muted" />
                )}
              </p>
            </li>
          </ol>

          {status === "none" && (
            <form action={generateShiftAction}>
              {hidden}
              <ConfirmSubmit
                className="btn-primary w-full"
                pendingLabel="作っています…"
                message={
                  requestEditable
                    ? `${formatMonthJa(month)}分はまだ希望休の受付中です（締切 ${deadlineLabel(month, rules)}）。いま作りますか？\n（あとから出た希望休は自動では入りません）`
                    : ""
                }
              >
                <Icon name="sparkles" className="w-5 h-5" />
                {ctx.quotaMode ? "休みの数で自動で作る（下書き）" : "シフト表を自動で作る（下書き）"}
              </ConfirmSubmit>
            </form>
          )}
          {status === "draft" && (
            <div className="space-y-2">
              <form action={publishShiftAction}>
                {hidden}
                <ConfirmSubmit
                  className="btn-primary w-full"
                  pendingLabel="公開しています…"
                  message={`${formatMonthJa(month)}のシフトをスタッフに公開します。${notes.length > 0 ? `\n気になる所が${notes.length}件あります。` : ""}\nよろしいですか？`}
                >
                  <Icon name="send" className="w-5 h-5" />
                  スタッフに公開する
                </ConfirmSubmit>
              </form>
              <div className="flex gap-2 flex-wrap">
                <form action={generateShiftAction}>
                  {hidden}
                  <ConfirmSubmit
                    className="btn-secondary !min-h-0 !py-2 !px-3 !text-sm"
                    pendingLabel="作っています…"
                    message="自動で作り直します。カレンダーで入れた休み（休みの中身つき）と希望休はそのまま、ほかの休みは入れ直します。よろしいですか？"
                  >
                    自動で作り直す
                  </ConfirmSubmit>
                </form>
                <form action={discardDraftAction}>
                  {hidden}
                  <ConfirmSubmit
                    className="btn-danger"
                    message="下書きを削除します（カレンダーで入れた休みは残ります）。よろしいですか？"
                  >
                    下書きを削除
                  </ConfirmSubmit>
                </form>
              </div>
            </div>
          )}
          {status === "confirmed" && (
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs text-ink-600 flex-1 min-w-[12rem]">
                公開中です。日をタップして直すと、すぐスタッフに反映され、変わった人に通知が届きます。
              </p>
              <form action={unpublishShiftAction}>
                {hidden}
                <ConfirmSubmit
                  className="btn-secondary !min-h-0 !py-2 !px-3 !text-sm"
                  message="公開をやめて下書きに戻します。よろしいですか？"
                >
                  公開をやめて下書きに戻す
                </ConfirmSubmit>
              </form>
            </div>
          )}
        </section>
      </div>

      {/* ---- カレンダー（印刷するとこの部分だけが出る）---- */}
      <section className="-mx-3 sm:mx-0 sm:card sm:!p-4 mb-4 print:mx-0">
        <div className="flex items-end gap-3 px-3 sm:px-0 mb-2">
          <p className="font-display text-4xl sm:text-5xl font-bold text-brand-600 leading-none tabular-nums">{m}月</p>
          <div className="min-w-0 pb-0.5">
            <p className="text-sm sm:text-base font-bold text-ink-900 truncate">
              {y}年 シフト（{store.name}）
            </p>
            <p className="text-[11px] text-ink-500 print:hidden">
              {SHIFT_STATUS_LABEL[status]}・日をタップすると休み・行事を入れられます
            </p>
          </div>
        </div>
        <CalendarBoard
          month={month}
          storeKey={storeKey}
          storeId={store.id}
          status={status}
          weeks={weeks}
          people={ctx.people.map((s) => ({ id: s.id, name: ctx.names.get(s.id) ?? s.name, sub: subOf(s) }))}
          personDays={personDays}
          dayStates={dayStates}
        />
        <div className="px-3 sm:px-0">
          <ShiftCalendarLegend
            admin
            rules={
              ctx.quotaMode
                ? `${storeRulesSummary(store)}。${formatMonthJa(month)}は各自${ctx.target ?? 0}日。休みの数に入れないお店の休み（特別休暇など）は数えません。`
                : storeRulesSummary(store)
            }
          />
        </div>
      </section>

      <div className="print:hidden space-y-4">
        {/* ---- 気になる日 ---- */}
        {notes.length > 0 && (
          <section className="card">
            <h2 className="section-title">気になる所（{notes.length}件）</h2>
            <ul className="text-sm space-y-0.5">
              {notes.map((n) => (
                <li key={n}>・{n}</li>
              ))}
            </ul>
            <p className="hint">
              出勤人数と段数の差は0〜{BALANCE_MARGIN}人が目安です（出勤人数＋お客様が1〜2人までは適切）。日をタップして休みを動かせます。
            </p>
          </section>
        )}

        {/* ---- ひとりずつの休みの数 ---- */}
        <section className="card">
          <h2 className="section-title">ひとりずつの休み</h2>
          {people.length === 0 ? (
            <p className="text-sm text-ink-500">このお店のスタッフがいません。所属店舗・職種を確かめてください。</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {summaries.map((s) => {
                const short = ctx.quotaMode && s.total < quota;
                const over = ctx.quotaMode && s.total > quota;
                return (
                  <li key={s.staffId} className="py-2 flex items-center gap-2 text-sm">
                    <span className="font-bold text-ink-900 flex-1 min-w-0 truncate">{s.name}</span>
                    <span className="text-[11px] text-ink-500 text-right">
                      {[
                        s.closures > 0 && `定休${s.closures}`,
                        s.request > 0 && `希望${s.request}`,
                        s.admin > 0 && `入力${s.admin}`,
                        s.auto > 0 && `自動${s.auto}`,
                        s.pattern > 0 && `パターン${s.pattern}`,
                      ]
                        .filter(Boolean)
                        .join("・")}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                        short ? "bg-amber-50 text-amber-800" : over ? "bg-sky-50 text-sky-800" : "bg-ink-50 text-ink-700"
                      }`}
                    >
                      {s.total}
                      {ctx.quotaMode ? `/${quota}休` : "休"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {ctx.quotaMode && (
            <p className="hint">
              休みの数は定休日を含めて数えます。研修・会議など（休みの中身つき）で多くなる人は、自動では足しません。
              まだ自動で作っていない月は、休みの決まっていない日を出勤として数えています。
            </p>
          )}
        </section>

        {/* ---- お店の休みの決まり ---- */}
        <section id="rules" className="scroll-mt-20">
          <h2 className="section-title">お店の休みの決まり</h2>
          <StoreRulesForm store={store} back="calendar" month={month} />
        </section>

        {/* ---- 呼び名 ---- */}
        <section id="names" className="card scroll-mt-20">
          <h2 className="section-title">カレンダーに出す名前（呼び名）</h2>
          <form action={saveNicknamesAction} className="space-y-2">
            <input type="hidden" name="month" value={month} />
            <input type="hidden" name="store" value={storeKey} />
            {ctx.people.map((s) => (
              <label key={s.id} className="flex items-center gap-2">
                <span className="text-sm text-ink-700 w-28 shrink-0 truncate">{s.name}</span>
                <input
                  name={`nick_${s.id}`}
                  defaultValue={s.nickname}
                  maxLength={12}
                  placeholder="例）たかひろ"
                  className="input !min-h-10 !py-1.5 text-sm"
                />
              </label>
            ))}
            <p className="hint">空なら名字（名前）を出します。マスタ設定のスタッフ一覧でも変えられます。</p>
            <button type="submit" className="btn-secondary w-full">呼び名を保存</button>
          </form>
        </section>

        <p className="text-center text-sm">
          <Link href={tableHref} className="font-bold text-brand-700 underline">
            表（スタッフ×日）で見る・時間を直す
          </Link>
        </p>
      </div>
    </div>
  );
}
