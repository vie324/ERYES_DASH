"use client";

// シフトのカレンダー（月曜はじまり）。日ごとに、お店の休み（灰色）・行事と会議（赤字）・休みの人（休みの中身）、
// いちばん下に「段数の合計｜出勤人数（出勤人数と段数の差）」と「スタイリスト・アシスタントの人数」を出す。
// 管理者の画面では日をタップして編集する（onSelect）。スタッフの画面では見るだけ。
// スマホ（幅375px）では1日が約49pxなので、文字を小さくして名前を折り返す。印刷では大きめに出す。

import type { OffKind } from "@/lib/shift/calendar";

export interface CalendarCellData {
  date: string;
  day: number;
  weekday: number;
  closure: { label: string } | null;
  events: string[];
  off: { id: string; name: string; reason: string; kind: OffKind; paid: boolean }[];
  counts: { headcount: number; tiers: number; stylists: number; assistants: number; diff: number } | null;
  today: boolean;
}

const HEADERS = ["月", "火", "水", "木", "金", "土", "日"];

export function ShiftCalendarGrid({
  weeks,
  onSelect,
  selected,
  showRequestMarks = false,
}: {
  weeks: (CalendarCellData | null)[][];
  onSelect?: (date: string) => void;
  selected?: string | null;
  /** 希望休の人をピンクで出す（管理者だけ） */
  showRequestMarks?: boolean;
}) {
  return (
    <div className="grid grid-cols-7 border-l border-t border-ink-300 bg-white text-ink-900 print:text-[11px]">
      {HEADERS.map((h, i) => (
        <div
          key={h}
          className={`border-r border-b border-ink-300 px-1 py-1 text-[10px] sm:text-xs font-bold text-white ${
            i === 5 ? "bg-sky-600" : i === 6 ? "bg-rose-500" : "bg-brand-600"
          } print:!text-white`}
        >
          {h}
          <span className="hidden sm:inline">曜日</span>
        </div>
      ))}
      {weeks.flat().map((cell, i) => {
        if (!cell) return <div key={`pad-${i}`} className="border-r border-b border-ink-300 bg-ink-50/60" />;
        const closed = cell.closure !== null;
        const body = (
          <>
            <span
              className={`self-end text-[11px] sm:text-sm font-bold tabular-nums leading-none ${
                cell.today ? "rounded-full bg-brand-600 text-white px-1 py-0.5" : cell.weekday === 0 ? "text-rose-600" : cell.weekday === 6 ? "text-sky-700" : ""
              }`}
            >
              {cell.day}
            </span>
            <div className="mt-0.5 space-y-px text-[10px] sm:text-[13px] leading-tight tracking-tight break-all">
              {cell.closure && <p className="text-ink-500">{cell.closure.label}</p>}
              {cell.events.map((e) => (
                <p key={e} className="font-bold text-red-600">
                  {e}
                </p>
              ))}
              {cell.off.map((o) => (
                <p key={o.id} className={showRequestMarks && o.kind === "request" ? "text-rose-600" : "text-ink-900"}>
                  {o.name}
                  {o.reason && <span className="text-ink-500">（{o.reason}）</span>}
                </p>
              ))}
            </div>
            {cell.counts && (
              <div className="mt-auto pt-0.5 border-t border-dashed border-ink-200 text-[8.5px] sm:text-[10px] leading-tight text-ink-500 tabular-nums whitespace-nowrap">
                {/* スマホ（1日が約50px）：段数・出勤人数（と差）・スタ／アシを3行に分ける（2けたでもはみ出さない） */}
                <div className="sm:hidden">
                  <p>段{cell.counts.tiers}</p>
                  <p>
                    出{cell.counts.headcount}
                    <Diff value={cell.counts.diff} />
                  </p>
                  <p>
                    ス{cell.counts.stylists}・ア{cell.counts.assistants}
                  </p>
                </div>
                <div className="hidden sm:block">
                  <p>
                    段数{cell.counts.tiers}｜出勤{cell.counts.headcount}人
                    <Diff value={cell.counts.diff} />
                  </p>
                  <p>
                    スタ{cell.counts.stylists}・アシ{cell.counts.assistants}
                  </p>
                </div>
              </div>
            )}
          </>
        );
        const base = `relative flex flex-col text-left min-h-[5.75rem] sm:min-h-[8rem] print:min-h-[6.5rem] border-r border-b border-ink-300 p-0.5 sm:p-1.5 min-w-0 ${
          closed ? "bg-ink-100" : "bg-white"
        }`;
        return onSelect ? (
          <button
            key={cell.date}
            type="button"
            onClick={() => onSelect(cell.date)}
            aria-label={`${cell.day}日：${closed ? cell.closure!.label : `休み${cell.off.length}人`}（タップで入力）`}
            className={`${base} hover:bg-brand-50 active:bg-brand-100 transition-colors ${
              selected === cell.date ? "ring-2 ring-inset ring-brand-600" : ""
            }`}
          >
            {body}
          </button>
        ) : (
          <div key={cell.date} className={base}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** 出勤人数と段数の差（0 なら出さない） */
function Diff({ value }: { value: number }) {
  if (value === 0) return null;
  return (
    <span className="ml-0.5 font-bold text-red-600">
      {value > 0 ? "+" : ""}
      {value}
    </span>
  );
}

/** カレンダーの下の説明（凡例） */
export function ShiftCalendarLegend({ rules, admin }: { rules: string; admin: boolean }) {
  return (
    <div className="mt-2 text-[10px] sm:text-[11px] leading-relaxed text-ink-500 space-y-0.5">
      <p>
        各日の下＝段数の合計（段）｜出勤人数（出）。<span className="text-red-600 font-bold">赤字</span>＝出勤人数と段数の差／スタ（ス）＝スタイリスト・アシ（ア）＝アシスタントの人数
      </p>
      <p>
        <span className="text-red-600 font-bold">赤字</span>＝行事・会議／<span className="rounded bg-ink-100 px-1">灰色</span>＝お店の休み／（ ）＝休みの中身
        {admin && (
          <>
            ／<span className="text-rose-600 font-bold">ピンク</span>＝希望休（理由は管理者だけに見えます）
          </>
        )}
      </p>
      {rules && <p>{rules}</p>}
    </div>
  );
}
