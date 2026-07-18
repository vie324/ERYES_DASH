/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
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
import { MEETING_TEMPLATES, findTemplate } from "@/lib/eni/meetings-templates";
import { EmptyState, MonthNav, PageHeader, StatusBadge } from "@/components/ui";
import { Markdown } from "@/lib/markdown";
import { MinutesEditor } from "@/components/minutes-editor";
import type { Meeting, Staff } from "@/lib/data/types";
import { MeetingCreateForm } from "./create-form";
import { deleteMeetingAction } from "./actions";

// ミーティング・1on1・会議体：月カレンダーで一目確認。会議体はテンプレから作成（参加者複数・アジェンダ・事前チェック）。
// 議事録は生メモをAIで整形→PDF出力。
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
    m.committee
      ? "bg-brand-100 text-brand-800"
      : m.meetingType === "1on1"
        ? "bg-sky-100 text-sky-800"
        : m.meetingType === "all"
          ? "bg-amber-100 text-amber-800"
          : "bg-stone-100 text-stone-700";
  const chipLabel = (m: Meeting) =>
    m.committee
      ? (findTemplate(m.committee)?.name.slice(0, 4) ?? "会議")
      : m.meetingType === "1on1"
        ? `${shortName(m.hostStaffId)}×${shortName(m.guestStaffId)}`
        : m.title || "MTG";

  return (
    <div>
      <PageHeader title="ミーティング・議事録" backHref="/staff" />

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
          <p className="text-sm font-bold text-red-700 mb-1">議事録が未提出（{missingMinutes.length}件）</p>
          <ul className="text-xs font-bold text-red-600 space-y-0.5">
            {missingMinutes.slice(0, 8).map((m) => (
              <li key={m.id}>・{formatDateJa(m.meetingDate)}：{meetingLabel(m, staffMap)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 登録（会議体テンプレ／1on1／その他） */}
      <MeetingCreateForm staff={activeStaff} defaultHostId={session.staffId} templates={MEETING_TEMPLATES} today={today} />

      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={`/staff/meetings?month=${addMonths(month, -1)}`}
        nextHref={`/staff/meetings?month=${addMonths(month, 1)}`}
      />

      {/* カレンダー */}
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
              <div key={date} className={`min-h-[3.5rem] rounded-lg border p-0.5 ${date === today ? "border-brand-400 bg-brand-50/60" : "border-stone-100"}`}>
                <div className={`text-[10px] font-bold text-right pr-0.5 ${wd === 0 ? "text-red-400" : wd === 6 ? "text-blue-400" : "text-stone-400"}`}>
                  {Number(date.slice(8))}
                </div>
                <div className="space-y-0.5">
                  {dayMeetings.slice(0, 3).map((m) => (
                    <a key={m.id} href={`#m-${m.id}`} className={`block truncate rounded px-1 py-0.5 text-[9px] font-bold leading-tight ${chipClass(m)} ${m.meetingDate <= today && !m.minutesDone ? "ring-1 ring-red-300" : ""}`}>
                      {chipLabel(m)}
                    </a>
                  ))}
                  {dayMeetings.length > 3 && <span className="block text-[9px] text-stone-400 pl-1">+{dayMeetings.length - 3}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-stone-400 mt-2">紫＝会議体／青＝1on1／黄＝全体。赤枠は議事録が未提出です。</p>
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
                  const template = findTemplate(m.committee);
                  const partNames = [...(m.guestStaffId ? [m.guestStaffId] : []), ...m.participants]
                    .map((id) => staffMap.get(id)?.name ?? "")
                    .filter((v, i, arr) => v && arr.indexOf(v) === i);
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
                        {partNames.length > 0 && (
                          <p className="text-xs text-stone-500">参加者：{partNames.join("、")}</p>
                        )}
                        {m.agenda && (
                          <div>
                            <p className="text-xs font-bold text-brand-700">アジェンダ</p>
                            <p className="whitespace-pre-wrap text-sm text-ink-700">{m.agenda}</p>
                          </div>
                        )}
                        {/* 事前チェック（会議前にシステムで見ておく項目） */}
                        {template && template.prechecks.length > 0 && !m.minutesDone && (
                          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                            <p className="text-xs font-bold text-amber-800 mb-1">会議前にシステムで確認</p>
                            <ul className="text-xs text-amber-700 list-disc list-inside space-y-0.5">
                              {template.prechecks.map((c) => <li key={c}>{c}</li>)}
                            </ul>
                          </div>
                        )}

                        {/* 議事録：表示＋PDF、または編集（AI整形） */}
                        {m.minutesDone && (
                          <div className="rounded-xl border border-stone-200 p-3">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-bold text-stone-500">議事録{m.minutesAi && "（AI整形）"}</p>
                              <Link href={`/staff/meetings/${m.id}`} className="text-xs font-bold text-brand-700 underline">
                                PDFで見る・印刷
                              </Link>
                            </div>
                            {m.minutesText && <Markdown text={m.minutesText} />}
                            {m.minutesPhoto && (
                              <img src={m.minutesPhoto} alt="議事録の写真" className="w-full max-h-80 object-contain rounded-lg border border-stone-200 bg-white mt-2" />
                            )}
                          </div>
                        )}

                        {canEdit && (
                          <details className="rounded-xl border border-brand-200">
                            <summary className="cursor-pointer text-sm font-bold text-brand-700 px-3 py-2">
                              {m.minutesDone ? "議事録を編集する" : "議事録を作成する（AI整形）"}
                            </summary>
                            <div className="p-3 pt-0">
                              <MinutesEditor meetingId={m.id} month={month} initialText={m.minutesText} initialPhoto={m.minutesPhoto} />
                            </div>
                          </details>
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
  const t = findTemplate(m.committee);
  if (t) return t.name;
  const host = staffMap.get(m.hostStaffId)?.name ?? "？";
  if (m.meetingType === "1on1") {
    const guest = m.guestStaffId ? (staffMap.get(m.guestStaffId)?.name ?? "？") : "";
    return `1on1：${host} × ${guest}`;
  }
  const typeLabel = m.meetingType === "all" ? "全体" : "その他";
  return `${typeLabel}：${m.title || "ミーティング"}（${host}）`;
}
