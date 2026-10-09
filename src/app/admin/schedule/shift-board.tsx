"use client";

// 管理者のシフト表（日付×スタッフ）。マスをタップすると下から編集パネルが開き、
// その場で保存できる（ページを読み込み直さないので、表の位置がそのまま残る）。
// 以前の割当ボードは「×」で消す・いちばん下のフォームで足す方式で、1か所直すたびに
// 画面が先頭に戻り、店舗も選び直しになっていた。

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { weekdayJa, weekdayOf } from "@/lib/date";
import { compactTimeRange } from "@/lib/schedule";
import { shortNames, shortStoreName, type ShiftStatus } from "@/lib/shift/month";
import { storeColor } from "@/lib/shift/labels";
import { Icon } from "@/components/icons";
import { saveShiftCellAction } from "./actions";

export interface BoardCell {
  /** 出勤か */
  w: boolean;
  /** 開始・終了（"10:00"。空は時間なし） */
  s: string;
  e: string;
  /** 店舗 */
  st: string;
  /** 早番・遅番 */
  t: "early" | "late" | "";
  /** 管理者のメモ */
  n: string;
  /** どこから決まったか（shift＝シフト表／override＝個別調整／dayoff／pattern／none） */
  src: "shift" | "override" | "dayoff" | "pattern" | "none";
  /** 希望休（理由・有休） */
  d: { r: string; p: boolean } | null;
}

export interface BoardStaff {
  id: string;
  name: string;
  storeId: string;
  /** 「スタイリスト・2段」などの補足 */
  sub: string;
}

export interface ShiftBoardProps {
  month: string;
  status: ShiftStatus;
  dates: string[];
  staff: BoardStaff[];
  /** この表で扱う店舗（編集パネルで選べる店舗・色の凡例） */
  stores: { id: string; name: string }[];
  /** 店舗の色の点を出すか（表の中で2つ以上の店舗にまたがるとき） */
  showStoreDots: boolean;
  /** "staffId|date" → マス */
  cells: Record<string, BoardCell>;
  /** staffId → 曜日(0〜6)ごとのいつもの時間（null＝お休み）。パターンの無い人はキーが無い */
  patterns: Record<string, ({ s: string; e: string } | null)[]>;
  /** date → 店舗ごとの人数（表示中の店舗だけ） */
  counts: Record<string, { storeId: string; n: number }[]>;
  /** 人数不足の "date|storeId" */
  shortage: string[];
  /** 希望休の日に出勤 "staffId|date" */
  offConflict: string[];
  /** 連勤上限を超えている "staffId|date" */
  overRun: string[];
  /** 本人が選んだ店舗の外 "staffId|date" */
  storeConflict: string[];
  /** date → その日の注意（人数不足・スタイリストの休みの重なりなど） */
  dayNotes: Record<string, string[]>;
  minStaff: number;
  /** 最初から開いておくマス（旧「個別調整」画面からの移動用） */
  initialEdit: { staffId: string; date: string } | null;
}

interface Draft {
  staffId: string;
  date: string;
  working: boolean;
  storeId: string;
  shiftType: "early" | "late";
  startTime: string;
  endTime: string;
  note: string;
}

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

function cellLabel(c: BoardCell): string {
  if (!c.w) return "休";
  const time = compactTimeRange(c.s, c.e);
  if (time) return time;
  if (c.t) return c.t === "early" ? "早" : "遅";
  return "出";
}

export function ShiftBoard(props: ShiftBoardProps) {
  const { month, status, dates, staff, stores, cells, patterns, showStoreDots } = props;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // 保存したマスは、サーバーから新しい表が届くまでのあいだ先に書き換えておく。
  // 保存したときの表（base）と今の表が違えば、新しい表が届いたということなので使わない
  const [optimistic, setOptimistic] = useState<{
    base: Record<string, BoardCell>;
    map: Record<string, BoardCell>;
  } | null>(null);
  const live = optimistic && optimistic.base === cells ? optimistic.map : null;

  // 保存のあと、表より上（気になる所の一覧など）の高さが変わっても、表が画面の同じ位置に残るようにする
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorTop = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (anchorTop.current === null || !rootRef.current) return;
    const delta = rootRef.current.getBoundingClientRect().top - anchorTop.current;
    anchorTop.current = null;
    if (Math.abs(delta) > 1) window.scrollBy(0, delta);
  }, [cells]);

  const storeIndex = useMemo(() => new Map(stores.map((s, i) => [s.id, i])), [stores]);
  const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const names = useMemo(() => shortNames(staff), [staff]);
  const shortage = useMemo(() => new Set(props.shortage), [props.shortage]);
  const offConflict = useMemo(() => new Set(props.offConflict), [props.offConflict]);
  const overRun = useMemo(() => new Set(props.overRun), [props.overRun]);
  const storeConflict = useMemo(() => new Set(props.storeConflict), [props.storeConflict]);
  const multiStore = stores.length > 1;
  const shiftMode = status !== "none";

  const emptyCell: BoardCell = { w: false, s: "", e: "", st: "", t: "", n: "", src: "none", d: null };
  const cellOf = (staffId: string, date: string) =>
    live?.[`${staffId}|${date}`] ?? cells[`${staffId}|${date}`] ?? emptyCell;
  const usualOf = (staffId: string, date: string) => patterns[staffId]?.[weekdayOf(date)] ?? null;

  const open = (staffId: string, date: string) => {
    const c = cellOf(staffId, date);
    const usual = usualOf(staffId, date);
    const member = staffMap.get(staffId);
    setMessage(null);
    setDraft({
      staffId,
      date,
      working: c.w,
      storeId: c.st || (member && storeIndex.has(member.storeId) ? member.storeId : (stores[0]?.id ?? "")),
      shiftType: c.t === "late" ? "late" : "early",
      // 休みの日を出勤に変えるときは、いつもの時間を入れておく
      startTime: c.w ? c.s : (usual?.s ?? ""),
      endTime: c.w ? c.e : (usual?.e ?? ""),
      note: c.n,
    });
  };

  // 旧「個別調整」画面のリンクから来たときは、そのマスを開いておく
  useEffect(() => {
    if (props.initialEdit) open(props.initialEdit.staffId, props.initialEdit.date);
    // 初回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDraft(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  /** 保存した内容を表のマスの形にする（サーバーの表が届くまでの仮表示） */
  const previewOf = (d: Draft, reset: boolean): BoardCell => {
    const before = cellOf(d.staffId, d.date);
    if (reset) {
      const usual = usualOf(d.staffId, d.date);
      const off = !usual || before.d !== null;
      return { w: !off, s: off ? "" : usual.s, e: off ? "" : usual.e, st: before.st, t: "", n: "", src: "pattern", d: before.d };
    }
    return {
      w: d.working,
      s: d.working ? d.startTime : "",
      e: d.working ? d.endTime : "",
      st: d.working ? (shiftMode ? d.storeId : (staffMap.get(d.staffId)?.storeId ?? "")) : "",
      t: d.working && shiftMode ? d.shiftType : "",
      n: d.working || !shiftMode ? d.note : "",
      src: shiftMode ? "shift" : "override",
      d: before.d,
    };
  };

  const save = (reset = false) => {
    if (!draft) return;
    const input = { month, ...draft, reset };
    const key = `${draft.staffId}|${draft.date}`;
    const preview = previewOf(draft, reset);
    const base = cells;
    anchorTop.current = rootRef.current?.getBoundingClientRect().top ?? null;
    startTransition(async () => {
      const res = await saveShiftCellAction(input);
      if (res.ok) {
        setOptimistic((prev) => ({ base, map: { ...(prev?.base === base ? prev.map : {}), [key]: preview } }));
        setDraft(null);
        setToast(res.message);
      } else {
        setMessage({ ok: false, text: res.message });
      }
    });
  };

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  const current = draft ? cellOf(draft.staffId, draft.date) : null;
  const usual = draft ? usualOf(draft.staffId, draft.date) : null;
  const member = draft ? staffMap.get(draft.staffId) : null;

  return (
    <div ref={rootRef}>
      <div className="table-wrap max-h-[72vh] overflow-y-auto">
        <table className="table-base [&_td]:!py-1 [&_td]:!px-1">
          <thead className="sticky top-0 z-20 [&_th]:!bg-brand-50">
            <tr>
              <th className="!z-30">日付</th>
              {staff.map((s) => (
                <th key={s.id} className="text-center !px-1 min-w-[3.4rem]" title={`${s.name}${s.sub ? `（${s.sub}）` : ""}`}>
                  <span className="block text-ink-800">{names.get(s.id)}</span>
                  {showStoreDots && storeIndex.has(s.storeId) && (
                    <span className={`mx-auto mt-0.5 block w-1.5 h-1.5 rounded-full ${storeColor(storeIndex.get(s.storeId)!).dot}`} />
                  )}
                </th>
              ))}
              <th className="text-center !px-1.5">人数</th>
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => {
              const wd = weekdayOf(date);
              const notes = props.dayNotes[date] ?? [];
              const counts = props.counts[date] ?? [];
              return (
                <tr key={date} className={wd === 0 || wd === 6 ? "!bg-ink-50/80" : ""}>
                  <td
                    className={`font-bold tabular-nums !px-2 ${wd === 0 ? "text-red-500" : wd === 6 ? "text-sky-600" : "text-ink-700"}`}
                    title={notes.join("\n")}
                  >
                    {Number(date.slice(8))}({weekdayJa(wd)})
                    {notes.length > 0 && <span className="ml-0.5 inline-block w-1.5 h-1.5 rounded-full bg-red-500 align-top" />}
                  </td>
                  {staff.map((s) => {
                    const key = `${s.id}|${date}`;
                    const c = cellOf(s.id, date);
                    const conflict = offConflict.has(key);
                    const run = overRun.has(key);
                    const outside = storeConflict.has(key);
                    const selected = draft?.staffId === s.id && draft?.date === date;
                    const tone = !c.w
                      ? "bg-ink-50 text-ink-300 border-transparent"
                      : conflict
                        ? "bg-red-100 text-red-800 border-red-300"
                        : c.src === "override"
                          ? "bg-amber-50 text-amber-900 border-amber-300"
                          : "bg-white text-ink-900 border-brand-200";
                    return (
                      <td key={s.id} className="text-center">
                        <button
                          type="button"
                          onClick={() => open(s.id, date)}
                          aria-label={`${s.name} ${Number(date.slice(8))}日：${c.w ? cellLabel(c) : "休み"}（タップで変更）`}
                          className={`relative w-full min-w-[3.2rem] h-11 rounded-lg border text-[11px] font-bold leading-tight tabular-nums transition-colors hover:border-brand-500 ${tone} ${
                            run ? "!border-amber-500 !border-2" : ""
                          } ${outside ? "outline outline-2 outline-amber-400" : ""} ${selected ? "ring-2 ring-brand-600" : ""}`}
                        >
                          <span className="block">{cellLabel(c)}</span>
                          {c.w && showStoreDots && (
                            <span
                              className={`mx-auto mt-0.5 block w-1.5 h-1.5 rounded-full ${storeColor(storeIndex.get(c.st) ?? 0).dot}`}
                            />
                          )}
                          {!c.w && c.d && (
                            <span className="block text-[9px] text-rose-500">{c.d.p ? "有休" : "希望"}</span>
                          )}
                          {c.n && <span className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-brand-500" />}
                        </button>
                      </td>
                    );
                  })}
                  <td className="text-center !px-1.5 text-[11px] font-bold tabular-nums">
                    {counts.map(({ storeId, n }) => {
                      const short = shortage.has(`${date}|${storeId}`);
                      return (
                        <span key={storeId} className={`block whitespace-nowrap ${short ? "text-red-600" : "text-ink-500"}`}>
                          {showStoreDots && (
                            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-0.5 align-middle ${storeColor(storeIndex.get(storeId) ?? 0).dot}`} />
                          )}
                          {n}
                          {shiftMode && <span className="text-ink-300">/{props.minStaff}</span>}
                        </span>
                      );
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-500 mt-2">
        <span>「10-19」＝10:00〜19:00／「早」「遅」＝早番・遅番</span>
        <span className="text-rose-500 font-bold">希望・有休＝希望休</span>
        {shiftMode ? (
          <>
            <span><span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-300 align-middle mr-0.5" />希望休の日に出勤</span>
            <span><span className="inline-block w-3 h-3 rounded border-2 border-amber-500 align-middle mr-0.5" />連勤の上限超え</span>
          </>
        ) : (
          <span><span className="inline-block w-3 h-3 rounded bg-amber-50 border border-amber-300 align-middle mr-0.5" />個別に変えた日</span>
        )}
        {showStoreDots &&
          stores.map((s, i) => (
            <span key={s.id}>
              <span className={`inline-block w-2 h-2 rounded-full mr-0.5 ${storeColor(i).dot}`} />
              {shortStoreName(s.name)}
            </span>
          ))}
      </div>

      {/* 編集パネル。画面の本文にはアニメーション（transform）がかかっていて、その中に置くと
          position: fixed が画面ではなく本文の枠に合わせて置かれ、スマホでは画面の下にはみ出してしまう。
          そのため body の直下に出す */}
      {draft && current && member && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-ink-900/35"
          onClick={() => setDraft(null)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="シフトを変える"
            onClick={(e) => e.stopPropagation()}
            className="w-full lg:max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl lg:rounded-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl animate-fade-up"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-lg text-ink-900 truncate">
                  {member.name}
                  {member.sub && <span className="text-xs font-normal text-ink-500 ml-1.5">{member.sub}</span>}
                </p>
                <p className="text-sm font-bold text-brand-700">
                  {Number(draft.date.slice(5, 7))}月{Number(draft.date.slice(8))}日({WEEK[weekdayOf(draft.date)]})
                </p>
              </div>
              <button type="button" onClick={() => setDraft(null)} className="btn-ghost !px-2" aria-label="閉じる">
                <Icon name="close" className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-2 space-y-1 text-xs">
              {current.d && (
                <p className="rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1.5 text-rose-700 font-bold">
                  希望休{current.d.p ? "（有休）" : ""}
                  {current.d.r ? `：${current.d.r}` : ""}
                </p>
              )}
              <p className="text-ink-500">
                いつもの{WEEK[weekdayOf(draft.date)]}曜日：
                {patterns[draft.staffId] ? (usual ? `${usual.s && usual.e ? `${usual.s}-${usual.e}` : "出勤"}` : "お休み") : "基本パターン未登録"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3" role="radiogroup" aria-label="出勤か休みか">
              {[
                { v: true, label: "出勤" },
                { v: false, label: "休み" },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={draft.working === o.v}
                  onClick={() => patch({ working: o.v })}
                  className={`rounded-xl border-2 py-3 font-bold ${
                    draft.working === o.v ? "border-brand-600 bg-brand-50 text-brand-800" : "border-brand-100 text-ink-500"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {draft.working && (
              <div className="space-y-3 mt-3">
                {shiftMode && multiStore && (
                  <div>
                    <p className="label !text-xs">店舗</p>
                    <div className="flex flex-wrap gap-1.5">
                      {stores.map((s, i) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => patch({ storeId: s.id })}
                          className={`chip ${draft.storeId === s.id ? "chip-active" : ""}`}
                        >
                          <span className={`inline-block w-2 h-2 rounded-full ${storeColor(i).dot}`} />
                          {shortStoreName(s.name)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {shiftMode && (
                  <div>
                    <p className="label !text-xs">早番・遅番</p>
                    <div className="flex gap-1.5">
                      {(["early", "late"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => patch({ shiftType: t })}
                          className={`chip ${draft.shiftType === t ? "chip-active" : ""}`}
                        >
                          {t === "early" ? "早番" : "遅番"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="label !text-xs">時間（空にすると時間なし）</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={draft.startTime}
                      onChange={(e) => patch({ startTime: e.target.value })}
                      className="input !min-h-11 !py-2 text-sm flex-1"
                      aria-label="開始"
                    />
                    <span className="text-ink-400">〜</span>
                    <input
                      type="time"
                      value={draft.endTime}
                      onChange={(e) => patch({ endTime: e.target.value })}
                      className="input !min-h-11 !py-2 text-sm flex-1"
                      aria-label="終了"
                    />
                  </div>
                  {usual?.s && usual.e && (draft.startTime !== usual.s || draft.endTime !== usual.e) && (
                    <button
                      type="button"
                      onClick={() => patch({ startTime: usual.s, endTime: usual.e })}
                      className="text-xs font-bold text-brand-700 underline mt-1"
                    >
                      いつもの時間（{usual.s}-{usual.e}）にする
                    </button>
                  )}
                </div>
                <div>
                  <label className="label !text-xs" htmlFor="cell-note">
                    メモ（任意）
                  </label>
                  <input
                    id="cell-note"
                    type="text"
                    value={draft.note}
                    maxLength={100}
                    onChange={(e) => patch({ note: e.target.value })}
                    placeholder="例）研修、時短、振替休"
                    className="input !min-h-11 !py-2 text-sm"
                  />
                </div>
              </div>
            )}

            {message && (
              <p className={`note mt-3 ${message.ok ? "note-ok" : "note-danger"}`}>{message.text}</p>
            )}

            <p className="text-[11px] text-ink-500 mt-3">
              {status === "confirmed"
                ? "公開中のシフトです。保存するとすぐスタッフに反映され、本人に通知が届きます。"
                : status === "draft"
                  ? "下書きです。保存してもスタッフにはまだ見えません（公開すると見えます）。"
                  : "シフト表を作っていない月です。保存すると個別の変更として、すぐスタッフに反映されます。"}
            </p>

            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => save(false)} disabled={isPending} className="btn-primary flex-1">
                {isPending ? "保存しています…" : "保存する"}
              </button>
              {!shiftMode && current.src === "override" && (
                <button type="button" onClick={() => save(true)} disabled={isPending} className="btn-secondary !px-3 !text-sm">
                  いつもどおりに戻す
                </button>
              )}
            </div>
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
