/* eslint-disable @next/next/no-img-element */
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import {
  addMonths,
  datesOfMonth,
  formatDateJa,
  formatMonthJa,
  monthRange,
  thisMonthJst,
  todayJst,
  weekdayOf,
} from "@/lib/date";
import { isExecutive } from "@/lib/eni/access";
import { EmptyState, MonthNav, PageHeader, StatusBadge } from "@/components/ui";
import { PhotoInput } from "@/components/photo-input";
import type { Meeting, Staff } from "@/lib/data/types";
import {
  createMeetingAction,
  deleteMeetingAction,
  saveMeetingMinutesAction,
} from "./actions";

// ミーティング・1on1：月カレンダーで「いつ誰と誰が」を一目で確認。
// 実施後は議事録（リンク・本文・写真）を提出。未提出は赤く表示＋ホームにバッジ。
export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : thisMonthJst();
  const { from, to } = monthRange(month);
  const today = todayJst();
  const isExec = await isExecutive(session);

  const db = getDataStore();
  const [meetings, missingMinutes, staffList] = await Promise.all([
    db.listMeetings({ from, to }),
    db.listMeetingsMissingMinutes(today),
    db.listStaff(),
  ]);
  const staffMap = new Map(staffList.map((s) => [s.id, s]));
  const activeStaff = staffList.filter((s) => s.isActive);

  const byDate = new Map<string, Meeting[]>();
  for (const m of meetings) {
    const list = byDate.get(m.meetingDate) ?? [];
    list.push(m);
    byDate.set(m.meetingDate, list);
  }
  const dates = [...byDate.keys()].sort();
  const monthDates = datesOfMonth(month);
  const firstWeekday = weekdayOf(monthDates[0]);

  const savedMsg =
    params.saved === "created"
      ? "ミーティングを登録しました"
      : params.saved === "minutes"
        ? "議事録を保存しました"
        : params.saved === "deleted"
          ? "ミーティングを削除しました"
          : "";

  const shortName = (id: string | null) => (id ? (staffMap.get(id)?.name.split(" ")[0] ?? "？") : "");
  const chipClass = (m: Meeting) =>
    m.meetingType === "1on1"
      ? "bg-brand-100 text-brand-800"
      : m.meetingType === "all"
        ? "bg-amber-100 text-amber-800"
        : "bg-stone-100 text-stone-700";
  const chipLabel = (m: Meeting) =>
    m.meetingType === "1on1"
      ? `${shortName(m.hostStaffId)}×${shortName(m.guestStaffId)}`
      : m.meetingType === "all"
        ? "全体"
        : m.title || "MTG";

  return (
    <div>
      <PageHeader title="ミーティング・1on1" backHref="/staff" />

      {savedMsg && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">{savedMsg}</p>
      )}
      {params.error && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          {params.error === "guest"
            ? "1on1は相手を選択してください"
            : params.error === "forbidden"
              ? "この操作の権限がありません"
              : "入力内容を確認してください"}
        </p>
      )}

      {missingMinutes.length > 0 && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 mb-4">
          <p className="text-sm font-bold text-red-700 mb-1">
            議事録が未提出のミーティング（{missingMinutes.length}件）
          </p>
          <ul className="text-xs font-bold text-red-600 space-y-0.5">
            {missingMinutes.slice(0, 8).map((m) => (
              <li key={m.id}>・{formatDateJa(m.meetingDate)}：{meetingLabel(m, staffMap)}</li>
            ))}
          </ul>
        </div>
      )}

      <details className="card mb-4">
        <summary className="font-bold text-sm text-brand-700 cursor-pointer">＋ ミーティングを登録する</summary>
        <form action={createMeetingAction} className="space-y-3 mt-3 pt-3 border-t border-stone-100">
          <div>
            <p className="label !mb-2">種類</p>
            <div className="flex gap-2">
              {[["1on1", "1on1"], ["all", "全体"], ["other", "その他"]].map(([v, label]) => (
                <label key={v} className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-bold has-checked:border-brand-400 has-checked:bg-brand-50">
                  <input type="radio" name="meeting_type" value={v} defaultChecked={v === "1on1"} className="h-4 w-4 accent-brand-500" />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="title">題名（全体・その他のとき）</label>
            <input id="title" name="title" className="input" placeholder="例）月初 全体ミーティング" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="meeting_date">日付</label>
              <input id="meeting_date" name="meeting_date" type="date" defaultValue={today} className="input" required />
            </div>
            <div>
              <label className="label" htmlFor="start_time">開始時間（任意）</label>
              <input id="start_time" name="start_time" type="time" className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="host_staff_id">実施する人</label>
              <select id="host_staff_id" name="host_staff_id" className="input" defaultValue={session.staffId}>
                {activeStaff.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="guest_staff_id">相手（1on1のとき）</label>
              <select id="guest_staff_id" name="guest_staff_id" className="input" defaultValue="">
                <option value="">（なし）</option>
                {activeStaff.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
              </select>
            </div>
          </div>
          <button type="submit" className="btn-primary w-full">登録する</button>
        </form>
      </details>

      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={`/staff/meetings?month=${addMonths(month, -1)}`}
        nextHref={`/staff/meetings?month=${addMonths(month, 1)}`}
      />

      {/* カレンダー（誰と誰かを一目で） */}
      <section className="card mb-4">
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-stone-500 mb-1">
          {["日", "月", "火", "水", "木", "金", "土"].map((w, i) => (
            <div key={w} className={i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : ""}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstWeekday }).map((_, i) => (<div key={`pad-${i}`} />))}
          {monthDates.map((date) => {
            const wd = weekdayOf(date);
            const dayMeetings = byDate.get(date) ?? [];
            return (
              <div
                key={date}
                className={`min-h-[3.5rem] rounded-lg border p-0.5 ${
                  date === today ? "border-brand-400 bg-brand-50/60" : "border-stone-100"
                }`}
              >
                <div className={`text-[10px] font-bold text-right pr-0.5 ${wd === 0 ? "text-red-400" : wd === 6 ? "text-blue-400" : "text-stone-400"}`}>
                  {Number(date.slice(8))}
                </div>
                <div className="space-y-0.5">
                  {dayMeetings.slice(0, 3).map((m) => (
                    <a
                      key={m.id}
                      href={`#m-${m.id}`}
                      className={`block truncate rounded px-1 py-0.5 text-[9px] font-bold leading-tight ${chipClass(m)} ${
                        m.meetingDate <= today && !m.minutesDone ? "ring-1 ring-red-300" : ""
                      }`}
                    >
                      {chipLabel(m)}
                    </a>
                  ))}
                  {dayMeetings.length > 3 && (
                    <span className="block text-[9px] text-stone-400 pl-1">+{dayMeetings.length - 3}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-stone-400 mt-2">
          青枠＝1on1／黄＝全体。赤枠は議事録が未提出です。タップで下の詳細へ。
        </p>
      </section>

      {/* 詳細リスト */}
      {dates.length === 0 ? (
        <EmptyState message="この月のミーティングはまだありません" />
      ) : (
        <div className="space-y-4">
          {dates.map((date) => (
            <section key={date}>
              <h2 className={`font-bold text-sm mb-2 ${date === today ? "text-brand-700" : "text-stone-500"}`}>
                {formatDateJa(date)}{date === today && "（今日）"}
              </h2>
              <div className="space-y-2">
                {byDate.get(date)!.map((m) => {
                  const canEdit = m.hostStaffId === session.staffId || m.createdBy === session.staffId || isExec;
                  const isPast = m.meetingDate <= today;
                  return (
                    <details key={m.id} id={`m-${m.id}`} className="card scroll-mt-20">
                      <summary className="cursor-pointer list-none">
                        <div className="flex items-center gap-2 flex-wrap">
                          {m.startTime && <span className="font-bold text-sm">{m.startTime}</span>}
                          <span className="font-bold text-sm">{meetingLabel(m, staffMap)}</span>
                          <span className="ml-auto">
                            {m.minutesDone ? (
                              <StatusBadge label="議事録あり" tone="ok" />
                            ) : isPast ? (
                              <StatusBadge label="議事録 未提出" tone="danger" />
                            ) : (
                              <StatusBadge label="予定" tone="muted" />
                            )}
                          </span>
                        </div>
                      </summary>

                      <div className="mt-3 pt-3 border-t border-stone-100 space-y-3">
                        {m.minutesDone && (
                          <div className="text-sm space-y-2">
                            {m.minutesUrl && (
                              <p>
                                <a href={m.minutesUrl} target="_blank" rel="noreferrer" className="font-bold text-brand-700 underline break-all">
                                  議事録を開く（リンク）
                                </a>
                              </p>
                            )}
                            {m.minutesText && <p className="whitespace-pre-wrap text-ink-700">{m.minutesText}</p>}
                            {m.minutesPhoto && (
                              <img src={m.minutesPhoto} alt="議事録の写真" className="w-full max-h-80 object-contain rounded-lg border border-stone-200 bg-white" />
                            )}
                          </div>
                        )}

                        {canEdit && (
                          <form action={saveMeetingMinutesAction} className="space-y-2">
                            <input type="hidden" name="id" value={m.id} />
                            <input type="hidden" name="month" value={month} />
                            <label className="label" htmlFor={`url-${m.id}`}>議事録リンク（Notion等）</label>
                            <input id={`url-${m.id}`} name="minutes_url" type="url" defaultValue={m.minutesUrl} placeholder="https://…" className="input" />
                            <label className="label" htmlFor={`text-${m.id}`}>または内容を直接記入</label>
                            <textarea id={`text-${m.id}`} name="minutes_text" rows={3} defaultValue={m.minutesText} className="input min-h-20" />
                            <p className="label !mb-1">議事録の写真（ホワイトボード等）</p>
                            <PhotoInput name="minutes_photo" initial={m.minutesPhoto} label="議事録を撮影・選択" />
                            <button type="submit" className="btn-secondary w-full">
                              議事録を保存（保存すると提出済みになります）
                            </button>
                          </form>
                        )}

                        {(m.createdBy === session.staffId || isExec) && (
                          <form action={deleteMeetingAction}>
                            <input type="hidden" name="id" value={m.id} />
                            <input type="hidden" name="month" value={month} />
                            <button type="submit" className="text-xs font-bold text-red-500 underline">このミーティングを削除</button>
                          </form>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function meetingLabel(m: Meeting, staffMap: Map<string, Staff>): string {
  const host = staffMap.get(m.hostStaffId)?.name ?? "？";
  if (m.meetingType === "1on1") {
    const guest = m.guestStaffId ? (staffMap.get(m.guestStaffId)?.name ?? "？") : "";
    return `1on1：${host} × ${guest}`;
  }
  const typeLabel = m.meetingType === "all" ? "全体" : "その他";
  return `${typeLabel}：${m.title || "ミーティング"}（${host}）`;
}
