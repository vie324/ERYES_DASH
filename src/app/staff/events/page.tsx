import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addMonths, formatDateJa, formatMonthJa, monthRange, thisMonthJst, todayJst } from "@/lib/date";
import { isExecutive } from "@/lib/eni/access";
import { EmptyState, MonthNav, PageHeader } from "@/components/ui";
import { deleteCompanyEventAction, saveCompanyEventAction } from "./actions";

export const dynamic = "force-dynamic";

// 会社のイベント・全体で共有しておきたい予定。
// 出勤シフトとは別で、勉強会・全体ミーティング・ENi会・研修などを置く場所。
// 全員が見られて、登録・編集は幹部と管理者だけができる。
// ※ UIは第一版。運用しながら形を変える前提。
export default async function CompanyEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; edit?: string; saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : thisMonthJst();
  const { from, to } = monthRange(month);
  const today = todayJst();
  const canEdit = await isExecutive(session);

  const db = getDataStore();
  const [events, staffList] = await Promise.all([
    db.listCompanyEvents({ from, to }),
    db.listStaff(),
  ]);
  const staffNames = new Map(staffList.map((s) => [s.id, s.name]));
  const editing = canEdit && params.edit ? events.find((e) => e.id === params.edit) ?? null : null;

  /** 1日だけなら日付1つ、またぐなら「〜」でつなぐ */
  const periodLabel = (startDate: string, endDate: string) =>
    startDate === endDate ? formatDateJa(startDate) : `${formatDateJa(startDate)}〜${formatDateJa(endDate)}`;

  return (
    <div className="page-narrow">
      <PageHeader
        title="会社の予定・イベント"
        description="全体ミーティング・勉強会・ENi会など、みんなで共有しておきたい予定"
        backHref="/staff"
        icon="calendar"
      />

      {params.saved === "deleted" ? (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          予定を削除しました
        </p>
      ) : params.saved ? (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          予定を保存しました
        </p>
      ) : null}
      {params.error === "input" && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          入力内容を確認してください（タイトルと日付は必要です）
        </p>
      )}
      {params.error === "forbidden" && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          予定の登録・編集は幹部・管理者のみです
        </p>
      )}

      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={`/staff/events?month=${addMonths(month, -1)}`}
        nextHref={`/staff/events?month=${addMonths(month, 1)}`}
      />

      {events.length === 0 ? (
        <EmptyState message="この月の予定はまだ登録されていません" />
      ) : (
        <div className="space-y-3">
          {events.map((e) => {
            const past = e.endDate < today;
            return (
              <div key={e.id} className={`card ${past ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-brand-700">
                      {periodLabel(e.startDate, e.endDate)}
                      {e.startTime && <span className="ml-1.5">{e.startTime}〜</span>}
                    </p>
                    <p className="font-display font-bold text-ink-900 mt-0.5">{e.title}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                      e.required
                        ? "border-brand-400 bg-brand-50 text-brand-800"
                        : "border-ink-200 text-ink-500"
                    }`}
                  >
                    {e.required ? "全員参加" : "任意"}
                  </span>
                </div>
                {e.body && (
                  <p className="text-sm whitespace-pre-wrap text-ink-700 mt-2">{e.body}</p>
                )}
                <p className="text-[11px] text-ink-400 mt-2">
                  登録：{staffNames.get(e.createdBy) ?? "（不明）"}
                </p>
                {canEdit && (
                  <div className="flex gap-2 mt-2 pt-2 border-t border-ink-100">
                    <a
                      href={`/staff/events?month=${month}&edit=${e.id}#form`}
                      className="chip !py-1.5 !px-3 !min-h-0 text-xs"
                    >
                      編集
                    </a>
                    <form action={deleteCompanyEventAction}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="month" value={month} />
                      <button type="submit" className="chip !py-1.5 !px-3 !min-h-0 text-xs text-red-600">
                        削除
                      </button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <section className="card mt-5" id="form">
          <h2 className="section-title">{editing ? "予定を編集" : "予定を追加"}</h2>
          <form action={saveCompanyEventAction} className="space-y-3">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <input type="hidden" name="month" value={month} />
            <div>
              <label className="label" htmlFor="title">タイトル</label>
              <input
                id="title"
                name="title"
                type="text"
                defaultValue={editing?.title ?? ""}
                placeholder="例）全体ミーティング／ENi会／カラー勉強会"
                className="input"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="start_date">開始日</label>
                <input
                  id="start_date"
                  name="start_date"
                  type="date"
                  defaultValue={editing?.startDate ?? today}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="end_date">終了日</label>
                <input
                  id="end_date"
                  name="end_date"
                  type="date"
                  defaultValue={editing?.endDate ?? ""}
                  className="input"
                />
                <p className="hint">1日だけなら空欄でOK</p>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="start_time">開始時刻</label>
              <input
                id="start_time"
                name="start_time"
                type="time"
                defaultValue={editing?.startTime ?? ""}
                className="input"
              />
              <p className="hint">終日なら空欄でOK</p>
            </div>
            <div>
              <label className="label" htmlFor="body">場所・持ち物・補足</label>
              <textarea
                id="body"
                name="body"
                rows={3}
                defaultValue={editing?.body ?? ""}
                placeholder="例）本店2階／筆記用具／私服でOK"
                className="input min-h-20"
              />
            </div>
            <label className="flex items-center gap-2 text-sm font-bold text-ink-700">
              <input
                type="checkbox"
                name="required"
                defaultChecked={editing ? editing.required : true}
                className="h-5 w-5 accent-brand-500"
              />
              全員参加（オフにすると「任意」として出ます）
            </label>
            <button type="submit" className="btn-primary w-full">
              {editing ? "この内容で更新" : "予定を追加"}
            </button>
            {editing && (
              <a href={`/staff/events?month=${month}`} className="btn-secondary w-full block text-center">
                編集をやめる
              </a>
            )}
          </form>
        </section>
      )}
    </div>
  );
}
