"use client";

// 管理者のシフトのカレンダー。日をタップすると下から入力パネルが開き、
// 「お店の休み・行事メモ・だれが休みか（休みの中身・何日まで続けるか）」をまとめて保存できる。
// 一般的なカレンダーに予定を打ち込む感覚で、休みを入れていく。

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { weekdayJa, weekdayOf } from "@/lib/date";
import type { OffKind } from "@/lib/shift/calendar";
import type { ShiftStatus } from "@/lib/shift/month";
import { ShiftCalendarGrid, type CalendarCellData } from "@/components/shift-calendar";
import { Icon } from "@/components/icons";
import { saveCalendarDayAction } from "./actions";

export interface EditorPerson {
  id: string;
  name: string;
  /** 「スタイリスト・3段」など */
  sub: string;
}

export interface EditorPersonDay {
  /** 出勤か */
  w: boolean;
  /** 休みの種類 */
  k?: OffKind;
  /** 管理者が入れた休みの中身 */
  r?: string;
  /** 希望休（理由・有休） */
  req?: { r: string; p: boolean } | null;
}

export interface EditorDayState {
  status: "" | "closed" | "open";
  label: string;
  counts: boolean;
  note: string;
  /** 定休日の曜日か */
  weeklyClosed: boolean;
  /** 会議・会社のイベント（自動で出るもの） */
  autoEvents: string[];
}

interface PersonDraft {
  off: boolean;
  reason: string;
  until: string;
}

interface Draft {
  date: string;
  status: "" | "closed" | "open";
  label: string;
  counts: boolean;
  note: string;
  staff: Record<string, PersonDraft>;
}

export function CalendarBoard(props: {
  month: string;
  storeKey: string;
  storeId: string;
  status: ShiftStatus;
  weeks: (CalendarCellData | null)[][];
  people: EditorPerson[];
  personDays: Record<string, Record<string, EditorPersonDay>>;
  dayStates: Record<string, EditorDayState>;
}) {
  const { month, people, personDays, dayStates } = props;
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [initial, setInitial] = useState<Draft | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const dates = useMemo(() => props.weeks.flat().filter((c): c is CalendarCellData => c !== null), [props.weeks]);

  const open = (date: string) => {
    const st = dayStates[date];
    const staff: Record<string, PersonDraft> = {};
    for (const p of people) {
      const d = personDays[date]?.[p.id];
      staff[p.id] = { off: d ? !d.w : false, reason: d?.k === "admin" ? (d.r ?? "") : "", until: "" };
    }
    const next: Draft = {
      date,
      status: st?.status ?? "",
      label: st?.label ?? "",
      counts: st?.counts ?? false,
      note: st?.note ?? "",
      staff,
    };
    setMessage(null);
    setDraft(next);
    setInitial(next);
  };

  const close = () => {
    if (!isPending) setDraft(null);
  };

  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) setDraft(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, isPending]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const patchPerson = (id: string, p: Partial<PersonDraft>) =>
    setDraft((d) => (d ? { ...d, staff: { ...d.staff, [id]: { ...d.staff[id], ...p } } } : d));

  const save = () => {
    if (!draft || !initial || isPending) return;
    const changed = people
      .map((p) => ({ staffId: p.id, ...draft.staff[p.id] }))
      .filter((row) => {
        const before = initial.staff[row.staffId];
        return row.off !== before.off || row.reason.trim() !== before.reason || row.until !== "";
      });
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof saveCalendarDayAction>>;
      try {
        res = await saveCalendarDayAction({
          month,
          store: props.storeKey,
          storeId: props.storeId,
          date: draft.date,
          dayStatus: draft.status,
          closedLabel: draft.label,
          countsAsDayOff: draft.counts,
          note: draft.note,
          staff: changed,
        });
      } catch {
        res = { ok: false, message: "保存できませんでした（通信のエラー）。電波のよい所でもう一度お試しください。" };
      }
      if (res.ok) {
        setDraft(null);
        setToast(res.message);
        router.refresh();
      } else {
        setMessage(res.message);
        router.refresh();
      }
    });
  };

  const state = draft ? dayStates[draft.date] : null;
  const closedNow = draft ? draft.status === "closed" || (draft.status === "" && (state?.weeklyClosed ?? false)) : false;
  const laterDates = draft ? dates.filter((c) => c.date > draft.date) : [];

  return (
    <div>
      <ShiftCalendarGrid weeks={props.weeks} onSelect={open} selected={draft?.date ?? null} showRequestMarks />

      {draft &&
        state &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-ink-900/35"
            onClick={close}
            role="presentation"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="この日のシフトを入れる"
              onClick={(e) => e.stopPropagation()}
              className="w-full lg:max-w-lg max-h-[90dvh] overflow-y-auto rounded-t-3xl lg:rounded-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl animate-fade-up"
            >
              <div className="flex items-start gap-2">
                <p className="flex-1 font-bold text-lg text-ink-900">
                  {Number(draft.date.slice(5, 7))}月{Number(draft.date.slice(8))}日({weekdayJa(weekdayOf(draft.date))})
                </p>
                <button type="button" onClick={close} disabled={isPending} className="btn-ghost !px-2" aria-label="閉じる">
                  <Icon name="close" className="w-5 h-5" />
                </button>
              </div>

              {/* ---- お店 ---- */}
              <p className="label !text-xs mt-2">お店</p>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="お店">
                {[
                  { v: "" as const, label: state.weeklyClosed ? "いつもどおり（定休日）" : "いつもどおり" },
                  { v: "closed" as const, label: "お店の休み" },
                  ...(state.weeklyClosed ? [{ v: "open" as const, label: "この日は営業" }] : []),
                ].map((o) => (
                  <button
                    key={o.v || "usual"}
                    type="button"
                    role="radio"
                    aria-checked={draft.status === o.v}
                    onClick={() =>
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              status: o.v,
                              label: o.v === "closed" && !d.label ? "特別休暇" : d.label,
                            }
                          : d
                      )
                    }
                    className={`chip ${draft.status === o.v ? "chip-active" : ""}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {draft.status === "closed" && (
                <div className="mt-2 space-y-1.5">
                  <input
                    type="text"
                    value={draft.label}
                    maxLength={20}
                    onChange={(e) => setDraft((d) => (d ? { ...d, label: e.target.value } : d))}
                    placeholder="例）特別休暇・臨時休業"
                    className="input !min-h-11 !py-2 text-sm"
                    aria-label="お店の休みの名前"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.counts}
                      onChange={(e) => setDraft((d) => (d ? { ...d, counts: e.target.checked } : d))}
                      className="h-5 w-5 accent-brand-500"
                    />
                    スタッフの「月の休みの数」に入れる
                  </label>
                  <p className="text-[11px] text-ink-500">特別休暇（年末年始など）は入れません。入れないと、その分ほかの日に休みが入ります。</p>
                </div>
              )}

              {/* ---- 行事・メモ ---- */}
              <label className="label !text-xs mt-3 block" htmlFor="cal-note">
                行事・メモ（カレンダーに赤字で出ます）
              </label>
              <input
                id="cal-note"
                type="text"
                value={draft.note}
                maxLength={60}
                onChange={(e) => setDraft((d) => (d ? { ...d, note: e.target.value } : d))}
                placeholder="例）ENi初詣（昼から）"
                className="input !min-h-11 !py-2 text-sm"
              />
              {state.autoEvents.length > 0 && (
                <p className="text-[11px] text-ink-500 mt-1">
                  会議・会社のイベント（自動で出ます）：<span className="font-bold text-red-600">{state.autoEvents.join("・")}</span>
                </p>
              )}

              {/* ---- スタッフ ---- */}
              <p className="label !text-xs mt-3">だれが休みか</p>
              {closedNow ? (
                <p className="text-sm text-ink-500 rounded-xl bg-ink-50 px-3 py-2">お店の休みの日は、シフトを入れません。</p>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {people.map((p) => {
                    const d = personDays[draft.date]?.[p.id];
                    const row = draft.staff[p.id];
                    return (
                      <li key={p.id} className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm text-ink-900 truncate">
                              {p.name}
                              {p.sub && <span className="ml-1 text-[11px] font-normal text-ink-400">{p.sub}</span>}
                            </p>
                            {d?.req && (
                              <p className="text-[11px] font-bold text-rose-600">
                                希望休{d.req.p ? "（有休）" : ""}
                                {d.req.r ? `：${d.req.r}` : ""}
                              </p>
                            )}
                            {!d?.req && d && !d.w && d.k === "auto" && <p className="text-[11px] text-ink-400">自動で入れた休み</p>}
                          </div>
                          <div className="flex shrink-0 rounded-full border border-brand-200 p-0.5" role="radiogroup" aria-label={`${p.name}さん`}>
                            <button
                              type="button"
                              role="radio"
                              aria-checked={!row.off}
                              onClick={() => patchPerson(p.id, { off: false })}
                              className={`rounded-full px-3 py-1.5 text-xs font-bold ${!row.off ? "bg-brand-600 text-white" : "text-ink-500"}`}
                            >
                              出勤
                            </button>
                            <button
                              type="button"
                              role="radio"
                              aria-checked={row.off}
                              onClick={() => patchPerson(p.id, { off: true })}
                              className={`rounded-full px-3 py-1.5 text-xs font-bold ${row.off ? "bg-rose-500 text-white" : "text-ink-500"}`}
                            >
                              休み
                            </button>
                          </div>
                        </div>
                        {row.off && (
                          <div className="mt-1.5 flex gap-1.5">
                            <input
                              type="text"
                              value={row.reason}
                              maxLength={40}
                              onChange={(e) => patchPerson(p.id, { reason: e.target.value })}
                              placeholder="休みの中身（任意）例：研修"
                              className="input !min-h-10 !py-1.5 text-sm flex-1 min-w-0"
                              aria-label={`${p.name}さんの休みの中身`}
                            />
                            <select
                              value={row.until}
                              onChange={(e) => patchPerson(p.id, { until: e.target.value })}
                              className="input !min-h-10 !py-1.5 text-sm !w-auto shrink-0"
                              aria-label={`${p.name}さんの休みを何日まで続けるか`}
                            >
                              <option value="">この日だけ</option>
                              {laterDates.map((c) => (
                                <option key={c.date} value={c.date}>
                                  〜{c.day}日({weekdayJa(c.weekday)})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {message && <p className="note note-danger mt-3 whitespace-pre-wrap">{message}</p>}

              <p className="text-[11px] text-ink-500 mt-3">
                {props.status === "confirmed"
                  ? "公開中のシフトです。保存するとすぐスタッフに反映され、変わった人に通知が届きます。"
                  : props.status === "draft"
                    ? "下書きです。保存してもスタッフにはまだ見えません（公開すると見えます）。"
                    : "ここで入れた休みは、自動で作るときにそのまま使います（足りない休みだけが自動で入ります）。"}
                {" "}「何日まで」を選ぶと、お店の休みの日を飛ばして同じ休みを続けて入れます。
                休みの中身は、公開したカレンダーでスタッフにも見えます（希望休の理由は見えません）。
              </p>

              <button type="button" onClick={save} disabled={isPending} className="btn-primary w-full mt-3">
                {isPending ? "保存しています…" : "この日を保存する"}
              </button>
            </div>
          </div>,
          document.body
        )}

      {toast &&
        createPortal(
          <div
            role="status"
            className="fixed left-1/2 -translate-x-1/2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-6 z-50 max-w-[92vw] rounded-full bg-ink-900/90 text-white text-sm font-bold px-4 py-2.5 shadow-lg text-center"
          >
            {toast}
          </div>,
          document.body
        )}
    </div>
  );
}
