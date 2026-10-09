"use client";

// 希望休の入力フォーム。カレンダーの日をタップするたびに 出勤 ⇄ 休み が切り替わる。
// 休みにした日は下に並び、理由（ひとこと）と「有休」のチェックを付けられる。
//  ・理由は、同じ日に希望が重なったときにどちらを優先するかの判断材料になる
//  ・スタイリストの有休は、休み希望と同時にここで申請する
//  ・店舗が2つ以上あるお店では、その月に勤務できる店舗も選ぶ
// 月を切り替えるときに未提出の変更があれば確認する（以前は前の月の選択がそのまま残り、
// 気づかずに保存すると、その月に出してあった希望休が消えてしまうことがあった）。

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { datesOfMonth, weekdayJa, weekdayOf } from "@/lib/date";
import { Icon } from "@/components/icons";
import type { DayoffInput } from "@/lib/data/types";
import { submitDayoffAction } from "./actions";

type DayState = { reason: string; paidLeave: boolean };

function SubmitButton({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className="btn-primary w-full text-lg">
      {pending ? "送信しています…" : label}
    </button>
  );
}

export function DayoffForm({
  month,
  monthLabel,
  prevHref,
  nextHref,
  editable,
  closedMessage,
  initialDays,
  initialStoreIds,
  initialNote,
  stores,
  regularOffWeekdays,
  isStylist,
}: {
  month: string; // "YYYY-MM"
  monthLabel: string;
  prevHref: string;
  nextHref: string;
  editable: boolean;
  /** 締切後・過去の月の案内（編集できないとき） */
  closedMessage: string;
  initialDays: DayoffInput[];
  initialStoreIds: string[];
  initialNote: string;
  /** 選んでもらう店舗（選ぶ意味があるときだけ渡す。空なら店舗の欄は出さない＝所属店舗に入る） */
  stores: { id: string; name: string }[];
  /** 基本パターンでお休みの曜日（定休日など。申請しなくても休み） */
  regularOffWeekdays: number[];
  /** スタイリスト（有休の案内を強めに出す） */
  isStylist: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Map<string, DayState>>(
    () => new Map(initialDays.map((d) => [d.date, { reason: d.reason, paidLeave: d.paidLeave }]))
  );
  const [storeIds, setStoreIds] = useState<Set<string>>(() => new Set(initialStoreIds));
  const [note, setNote] = useState(initialNote);

  const dates = useMemo(() => datesOfMonth(month), [month]);
  const firstWeekday = weekdayOf(dates[0]);
  const regularOff = new Set(regularOffWeekdays);

  const selectedDates = useMemo(() => [...selected.keys()].sort(), [selected]);
  const payload: DayoffInput[] = selectedDates.map((date) => ({ date, ...selected.get(date)! }));
  const paidCount = selectedDates.filter((d) => selected.get(d)!.paidLeave).length;

  // 未提出の変更があるか（月の切り替え・画面を閉じるときに確認する）
  const initialKey = JSON.stringify({
    days: [...initialDays].sort((a, b) => a.date.localeCompare(b.date)).map((d) => [d.date, d.reason.trim(), d.paidLeave]),
    stores: [...initialStoreIds].sort(),
    note: initialNote.trim(),
  });
  const currentKey = JSON.stringify({
    days: payload.map((d) => [d.date, d.reason.trim(), d.paidLeave]),
    stores: [...storeIds].sort(),
    note: note.trim(),
  });
  const dirty = editable && initialKey !== currentKey;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const go = (href: string) => {
    if (dirty && !window.confirm("まだ提出していない変更があります。提出せずに月を切り替えますか？")) return;
    router.push(href);
  };

  const toggle = (date: string) => {
    if (!editable) return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(date)) next.delete(date);
      else next.set(date, { reason: "", paidLeave: false });
      return next;
    });
  };

  const patch = (date: string, p: Partial<DayState>) => {
    if (!editable) return;
    setSelected((prev) => {
      const cur = prev.get(date);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(date, { ...cur, ...p });
      return next;
    });
  };

  const toggleStore = (id: string) => {
    if (!editable) return;
    setStoreIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const needStore = stores.length > 1 && storeIds.size === 0;
  const submitLabel =
    selectedDates.length === 0 ? "休みなしで提出する" : `この内容で提出する（休み${selectedDates.length}日）`;

  return (
    <form action={submitDayoffAction} className="space-y-4">
      <input type="hidden" name="target_month" value={month} />
      <input type="hidden" name="days_json" value={JSON.stringify(payload)} />
      {stores.length > 1 && <input type="hidden" name="stores_shown" value="1" />}

      {/* 月の切り替え（未提出の変更があれば確認する） */}
      <div className="flex items-center justify-between card !py-1.5 !px-2">
        <button
          type="button"
          onClick={() => go(prevHref)}
          className="w-11 h-11 flex items-center justify-center rounded-xl text-brand-600 hover:bg-brand-50"
          aria-label="前月"
        >
          <Icon name="chevronLeft" className="w-5 h-5" />
        </button>
        <span className="font-display font-bold text-lg text-ink-900">{monthLabel}</span>
        <button
          type="button"
          onClick={() => go(nextHref)}
          className="w-11 h-11 flex items-center justify-center rounded-xl text-brand-600 hover:bg-brand-50"
          aria-label="翌月"
        >
          <Icon name="chevronRight" className="w-5 h-5" />
        </button>
      </div>

      {!editable && <p className="note note-warn">{closedMessage}</p>}

      <section className="card">
        <p className="section-title !mb-1.5">休みたい日をタップ</p>
        <p className="text-xs text-ink-500 mb-3">
          もう一度タップで取り消し。選んでいない日は「出勤できる日」になります。
          {regularOff.size > 0 && "「定休」はいつもお休みの曜日なので、出さなくても休みです。"}
        </p>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-ink-500 mb-1">
          {["日", "月", "火", "水", "木", "金", "土"].map((w, i) => (
            <div key={w} className={i === 0 ? "text-red-500" : i === 6 ? "text-sky-600" : ""}>
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstWeekday }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {dates.map((date) => {
            const wd = weekdayOf(date);
            const isSelected = selected.has(date);
            const paid = selected.get(date)?.paidLeave;
            const fixedOff = regularOff.has(wd) && !isSelected;
            const disabled = !editable || fixedOff;
            return (
              <button
                key={date}
                type="button"
                onClick={() => toggle(date)}
                disabled={disabled}
                aria-pressed={isSelected}
                aria-label={`${Number(date.slice(8))}日（${weekdayJa(wd)}）${
                  fixedOff ? "：定休" : isSelected ? "：休み希望（タップで取り消し）" : "：タップで休み希望"
                }`}
                className={`min-h-14 rounded-xl border text-sm font-bold transition-colors flex flex-col items-center justify-center gap-0.5 ${
                  isSelected
                    ? paid
                      ? "bg-rose-500 text-white border-rose-500 shadow-sm"
                      : "bg-brand-600 text-white border-brand-600 shadow-sm"
                    : fixedOff
                      ? "bg-ink-100 border-ink-100 text-ink-400"
                      : `bg-white border-brand-200 ${
                          wd === 0 ? "text-red-500" : wd === 6 ? "text-sky-600" : "text-ink-800"
                        } ${editable ? "active:bg-brand-100 hover:border-brand-400" : "opacity-70"}`
                }`}
              >
                <span>{Number(date.slice(8))}</span>
                <span className="text-[10px] leading-none">
                  {isSelected ? (paid ? "有休" : "休み") : fixedOff ? "定休" : ""}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-sm font-bold text-ink-700 mt-3">
          休み希望 <span className="text-brand-700">{selectedDates.length}日</span>
          {paidCount > 0 && <span className="ml-2 text-rose-600">うち有休 {paidCount}日</span>}
        </p>
      </section>

      {/* 理由・有休（選んだ日だけ並ぶ） */}
      {selectedDates.length > 0 && (
        <section className="card">
          <p className="section-title !mb-1.5">休みの理由・有休</p>
          <p className="text-xs text-ink-500 mb-1">
            同じ日に休み希望が重なったとき、どちらを優先するかを決める材料になります。ひとことで大丈夫です（例：通院、家族の予定）。
          </p>
          <p className={`text-xs mb-3 ${isStylist ? "font-bold text-brand-800" : "text-ink-500"}`}>
            有休で休みたい日は「有休」にチェックしてください。
            {isStylist ? "スタイリストの有休は、ここで休み希望と一緒に申請します。" : ""}
          </p>
          <div className="divide-y divide-brand-100">
            {selectedDates.map((date) => {
              const d = selected.get(date)!;
              const wd = weekdayOf(date);
              return (
                <div key={date} className="flex items-center gap-2 py-2">
                  <span
                    className={`w-16 shrink-0 text-sm font-bold ${
                      wd === 0 ? "text-red-500" : wd === 6 ? "text-sky-600" : "text-ink-700"
                    }`}
                  >
                    {Number(date.slice(8))}日({weekdayJa(wd)})
                  </span>
                  <input
                    type="text"
                    value={d.reason}
                    onChange={(e) => patch(date, { reason: e.target.value })}
                    disabled={!editable}
                    maxLength={100}
                    placeholder="理由（例：通院）"
                    aria-label={`${Number(date.slice(8))}日の休みの理由`}
                    className="input !min-h-10 !py-2 text-sm flex-1 min-w-0"
                  />
                  <label className="flex items-center gap-1 text-xs font-bold text-ink-700 shrink-0">
                    <input
                      type="checkbox"
                      checked={d.paidLeave}
                      onChange={(e) => patch(date, { paidLeave: e.target.checked })}
                      disabled={!editable}
                      className="h-5 w-5 accent-rose-500"
                    />
                    有休
                  </label>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {stores.length > 1 && (
        <section className="card">
          <p className="section-title !mb-1.5">この月に勤務できる店舗</p>
          <p className="text-xs text-ink-500 mb-3">選んだ店舗にだけシフトが入ります（複数選べます）。</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {stores.map((store) => {
              const checked = storeIds.has(store.id);
              return (
                <label
                  key={store.id}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-bold ${
                    checked ? "border-brand-400 bg-brand-50 text-brand-800" : "border-brand-200 text-ink-600"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="store_ids"
                    value={store.id}
                    checked={checked}
                    onChange={() => toggleStore(store.id)}
                    disabled={!editable}
                    className="h-5 w-5 accent-brand-500 shrink-0"
                  />
                  {store.name}
                </label>
              );
            })}
          </div>
          {needStore && editable && (
            <p className="text-xs font-bold text-red-600 mt-2">勤務できる店舗を1つ以上選んでください</p>
          )}
        </section>
      )}

      <section className="card">
        <label className="label" htmlFor="note">
          お店への連絡（任意）
        </label>
        <textarea
          id="note"
          name="note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={!editable}
          maxLength={500}
          placeholder="例）20日は午前だけなら出られます"
          className="textarea min-h-20"
        />
      </section>

      {editable && (
        <div className="form-actions">
          {dirty && (
            <p className="text-xs font-bold text-amber-700 mb-1.5 text-center">まだ提出していない変更があります</p>
          )}
          <SubmitButton label={submitLabel} disabled={needStore} />
        </div>
      )}
    </form>
  );
}
