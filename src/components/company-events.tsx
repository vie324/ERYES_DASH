// 全体スケジュール（会社のイベント・全員にかかわる予定）の一覧と、登録・編集フォーム。
// 予定（計画スケジュール）の「全体」タブと、会社の予定ページ（/staff/events）の両方で使う。
// 閲覧は全員、登録・編集・削除は幹部と管理者だけ（サーバーアクション側でも必ず確かめる）。

import { getDataStore } from "@/lib/data";
import { addMonths, formatMonthJa, monthRange, todayJst } from "@/lib/date";
import { eventPeriodLabel, sortEvents, withQuery } from "@/lib/company-events";
import { EmptyState, MonthNav } from "@/components/ui";
import { deleteCompanyEventAction, saveCompanyEventAction } from "@/app/staff/events/actions";

export async function CompanyEventsPanel({
  month,
  editId,
  canEdit,
  basePath,
}: {
  /** 表示する月 "YYYY-MM" */
  month: string;
  /** 編集中の予定のID（?edit=） */
  editId?: string;
  canEdit: boolean;
  /** この一覧を出しているページのURL（月の切り替え・編集・保存後の戻り先に使う） */
  basePath: string;
}) {
  const { from, to } = monthRange(month);
  const today = todayJst();
  const db = getDataStore();
  const [events, staffList] = await Promise.all([db.listCompanyEvents({ from, to }), db.listStaff()]);
  const sorted = sortEvents(events);
  const staffNames = new Map(staffList.map((s) => [s.id, s.name]));
  const editing = canEdit && editId ? (sorted.find((e) => e.id === editId) ?? null) : null;
  const back = withQuery(basePath, { month });

  return (
    <>
      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={withQuery(basePath, { month: addMonths(month, -1) })}
        nextHref={withQuery(basePath, { month: addMonths(month, 1) })}
      />

      {sorted.length === 0 ? (
        <EmptyState message="この月の全体スケジュールはまだ登録されていません" />
      ) : (
        <div className="space-y-3">
          {sorted.map((e) => {
            const past = e.endDate < today;
            return (
              <div key={e.id} className={`card ${past ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-brand-700">{eventPeriodLabel(e)}</p>
                    <p className="font-display font-bold text-ink-900 mt-0.5">{e.title}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                      e.required ? "border-brand-400 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-500"
                    }`}
                  >
                    {e.required ? "全員参加" : "任意"}
                  </span>
                </div>
                {e.body && <p className="text-sm whitespace-pre-wrap text-ink-700 mt-2">{e.body}</p>}
                <p className="text-[11px] text-ink-400 mt-2">登録：{staffNames.get(e.createdBy) ?? "（不明）"}</p>
                {canEdit && (
                  <div className="flex gap-2 mt-2 pt-2 border-t border-ink-100">
                    <a href={`${withQuery(basePath, { month, edit: e.id })}#event-form`} className="chip !py-1.5 !px-3 !min-h-0 text-xs">
                      編集
                    </a>
                    <form action={deleteCompanyEventAction}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="back" value={back} />
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
        <section className="card mt-5 scroll-mt-20" id="event-form">
          <h2 className="section-title">{editing ? "全体スケジュールを編集" : "全体スケジュールに追加"}</h2>
          <form action={saveCompanyEventAction} className="space-y-3">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <input type="hidden" name="back" value={back} />
            <div>
              <label className="label" htmlFor="event-title">タイトル</label>
              <input
                id="event-title"
                name="title"
                type="text"
                defaultValue={editing?.title ?? ""}
                placeholder="例）全体ミーティング／しもん塾／カラー研修"
                className="input"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="event-start">開始日</label>
                <input
                  id="event-start"
                  name="start_date"
                  type="date"
                  defaultValue={editing?.startDate ?? today}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="event-end">終了日</label>
                <input id="event-end" name="end_date" type="date" defaultValue={editing?.endDate ?? ""} className="input" />
                <p className="hint">1日だけなら空欄でOK</p>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="event-time">開始時刻</label>
              <input id="event-time" name="start_time" type="time" defaultValue={editing?.startTime ?? ""} className="input" />
              <p className="hint">終日なら空欄でOK</p>
            </div>
            <div>
              <label className="label" htmlFor="event-body">場所・持ち物・補足</label>
              <textarea
                id="event-body"
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
              {editing ? "この内容で更新" : "全体スケジュールに追加"}
            </button>
            {editing && (
              <a href={back} className="btn-secondary w-full block text-center">
                編集をやめる
              </a>
            )}
          </form>
          <p className="text-[11px] text-ink-400 mt-2">※ 登録・編集できるのは幹部と管理者です。全員の予定画面とホームに出ます。</p>
        </section>
      )}
    </>
  );
}

/** 保存・削除・エラーのお知らせ（予定画面の全体タブと共通の文言） */
export function EventFlash({ saved, error }: { saved?: string; error?: string }) {
  if (saved === "event" || saved === "event-deleted") {
    return (
      <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
        {saved === "event" ? "全体スケジュールを保存しました" : "全体スケジュールから削除しました"}
      </p>
    );
  }
  if (error === "input" || error === "forbidden") {
    return (
      <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
        {error === "input"
          ? "入力内容を確認してください（タイトルと日付は必要です）"
          : "全体スケジュールの登録・編集は幹部・管理者のみです"}
      </p>
    );
  }
  return null;
}
