"use client";

// 予約表（Googleカレンダー風）のスケジュール入力。
// ・縦が時間、横が日（1日 or 1週間）。空いているところをタップすると予定を追加できる。
// ・内容は「MTG」「練習」などの登録済み項目から選べて、手入力もできる。
// ・入力結果は hidden input（name）に JSON で入り、そのままサーバーアクションへ送られる。

import { useMemo, useState } from "react";
import type { ScheduleBlock } from "@/lib/data/types";
import {
  PX_PER_HOUR,
  SLOT_MIN,
  blockColor,
  durationLabel,
  placeBlocks,
  toHM,
  toMin,
} from "@/lib/eni/schedule-blocks";

interface Draft {
  index: number | null; // null＝新規
  block: ScheduleBlock;
}

export function ScheduleBoard({
  name,
  initial,
  presets,
  dayLabels,
  startHour = 8,
  endHour = 22,
  ghostBlocks = [],
  ghostLabel = "計画",
}: {
  name: string;
  initial: ScheduleBlock[];
  presets: string[];
  dayLabels: string[]; // ["今日"] または ["月","火",…,"日"]
  startHour?: number;
  endHour?: number;
  /** 後ろに薄く重ねて見せる予定（計画スケジュール）。比べながら入れられるようにする */
  ghostBlocks?: ScheduleBlock[];
  ghostLabel?: string;
}) {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showGhost, setShowGhost] = useState(true);

  const ghostByDay = useMemo(
    () =>
      dayLabels.map((_, d) =>
        placeBlocks(
          ghostBlocks,
          ghostBlocks.map((_, i) => i).filter((i) => ghostBlocks[i].d === d),
          startHour,
          endHour
        )
      ),
    [ghostBlocks, dayLabels, startHour, endHour]
  );

  /** 計画をそのまま今日の予定として取り込む（そこから直せばよい状態にする） */
  const importGhost = () => {
    if (ghostBlocks.length === 0) return;
    setBlocks((prev) => {
      const keys = new Set(prev.map((b) => `${b.d}|${b.s}|${b.e}|${b.a}`));
      const added = ghostBlocks.filter((b) => !keys.has(`${b.d}|${b.s}|${b.e}|${b.a}`));
      return [...prev, ...added].sort((x, y) => x.d - y.d || toMin(x.s) - toMin(y.s));
    });
  };

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour]
  );
  const gridHeight = hours.length * PX_PER_HOUR;
  const multiDay = dayLabels.length > 1;

  const placedByDay = useMemo(
    () =>
      dayLabels.map((_, d) =>
        placeBlocks(
          blocks,
          blocks.map((_, i) => i).filter((i) => blocks[i].d === d),
          startHour,
          endHour
        )
      ),
    [blocks, dayLabels, startHour, endHour]
  );

  /** 空いているところをタップ → その時間から30分の予定を下書きにする */
  const onGridClick = (d: number, event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / rect.height;
    const raw = startHour * 60 + ratio * (endHour - startHour) * 60;
    const s = Math.max(startHour * 60, Math.floor(raw / SLOT_MIN) * SLOT_MIN);
    const e = Math.min(endHour * 60, s + SLOT_MIN * 2);
    setDraft({ index: null, block: { d, s: toHM(s), e: toHM(e), a: "" } });
  };

  const saveDraft = () => {
    if (!draft) return;
    const b = draft.block;
    if (!b.a.trim() || toMin(b.e) <= toMin(b.s)) return;
    setBlocks((prev) => {
      const next = draft.index === null ? [...prev, b] : prev.map((x, i) => (i === draft.index ? b : x));
      return next.sort((x, y) => x.d - y.d || toMin(x.s) - toMin(y.s));
    });
    setDraft(null);
  };

  const removeDraft = () => {
    if (draft?.index !== null && draft) {
      setBlocks((prev) => prev.filter((_, i) => i !== draft.index));
    }
    setDraft(null);
  };

  const patchDraft = (patch: Partial<ScheduleBlock>) =>
    setDraft((prev) => (prev ? { ...prev, block: { ...prev.block, ...patch } } : prev));

  return (
    <div>
      <div className="rounded-xl border border-brand-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <div style={{ minWidth: multiDay ? `${3 + dayLabels.length * 5.5}rem` : undefined }}>
            {/* 曜日の見出し */}
            <div className="flex border-b border-brand-100 bg-brand-50/60">
              <div className="w-12 shrink-0" />
              {dayLabels.map((label, d) => (
                <div
                  key={label}
                  className={`flex-1 min-w-0 text-center text-xs font-bold py-1.5 ${
                    d === 5 ? "text-blue-500" : d === 6 ? "text-red-400" : "text-ink-600"
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* 本体（縦＝時間） */}
            <div className="flex" style={{ height: gridHeight }}>
              {/* 時間の目盛り */}
              <div className="w-12 shrink-0 relative bg-brand-50/40">
                {hours.map((h, i) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 text-[10px] font-bold text-ink-400 text-center"
                    style={{ top: i * PX_PER_HOUR - 6, height: PX_PER_HOUR }}
                  >
                    {i === 0 ? "" : `${h}:00`}
                  </div>
                ))}
              </div>

              {/* 日の列 */}
              {dayLabels.map((label, d) => (
                <div
                  key={label}
                  onClick={(e) => onGridClick(d, e)}
                  className="flex-1 min-w-0 relative border-l border-brand-100 cursor-copy"
                  role="presentation"
                >
                  {/* 1時間ごとの線（30分は薄い線） */}
                  {hours.map((h, i) => (
                    <div key={h} className="absolute left-0 right-0" style={{ top: i * PX_PER_HOUR }}>
                      <div className="border-t border-brand-100" />
                      <div className="border-t border-dashed border-brand-50" style={{ marginTop: PX_PER_HOUR / 2 - 1 }} />
                    </div>
                  ))}

                  {/* 計画スケジュール（薄い破線の帯。タップしても反応しない＝背景あつかい） */}
                  {showGhost &&
                    ghostByDay[d].map((p, i) => (
                      <div
                        key={`ghost-${i}-${p.block.s}`}
                        style={{
                          top: `${p.top}%`,
                          height: `calc(${p.height}% - 2px)`,
                          left: "2px",
                          right: "2px",
                        }}
                        className="absolute rounded-md border border-dashed border-ink-300 bg-ink-50/60 px-1 py-0.5 overflow-hidden leading-tight pointer-events-none"
                      >
                        <span className="block text-[9px] font-bold text-ink-400 truncate">
                          {ghostLabel}：{p.block.a}
                        </span>
                      </div>
                    ))}

                  {/* 予定の帯 */}
                  {placedByDay[d].map((p) => (
                    <button
                      key={`${p.index}-${p.block.s}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDraft({ index: p.index, block: p.block });
                      }}
                      style={{
                        top: `${p.top}%`,
                        height: `calc(${p.height}% - 2px)`,
                        left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`,
                        width: `calc(${100 / p.lanes}% - 4px)`,
                      }}
                      className={`absolute rounded-md border px-1 py-0.5 text-left overflow-hidden leading-tight ${blockColor(
                        p.block.a
                      )} ${draft?.index === p.index ? "ring-2 ring-brand-500" : ""}`}
                    >
                      <span className="block text-[10px] font-bold truncate">{p.block.a}</span>
                      <span className="block text-[9px] opacity-70 truncate">
                        {p.block.s}〜{p.block.e}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 計画と見比べるための操作（計画が入っているときだけ出す） */}
      {ghostBlocks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <button
            type="button"
            onClick={() => setShowGhost((v) => !v)}
            className={`chip ${showGhost ? "chip-active" : ""}`}
          >
            {ghostLabel}を重ねて表示
          </button>
          <button type="button" onClick={importGhost} className="chip">
            {ghostLabel}をこの日に取り込む
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-2">
        <p className="text-[11px] text-ink-400">
          空いているところをタップすると予定を追加できます（帯をタップで修正・削除）。
          {multiDay && "表は横にスクロールすると日曜まで見られます。"}
        </p>
        <button
          type="button"
          onClick={() =>
            setDraft({ index: null, block: { d: 0, s: `${String(startHour + 1).padStart(2, "0")}:00`, e: `${String(startHour + 2).padStart(2, "0")}:00`, a: "" } })
          }
          className="shrink-0 text-xs font-bold text-brand-700 border border-brand-300 rounded-full px-3 py-1.5"
        >
          ＋予定を追加
        </button>
      </div>

      {/* 追加・修正パネル */}
      {draft && (
        <div className="mt-3 rounded-xl border-2 border-brand-300 bg-brand-50/50 p-3 space-y-3">
          <p className="text-xs font-bold text-brand-800">
            {draft.index === null ? "予定を追加" : "予定を修正"}
          </p>

          {multiDay && (
            <div>
              <p className="label !mb-1.5 !text-xs">曜日</p>
              <div className="flex gap-1">
                {dayLabels.map((label, d) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => patchDraft({ d })}
                    className={`flex-1 text-xs font-bold rounded-lg py-2 border ${
                      draft.block.d === d
                        ? "chip-active"
                        : ""
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label !mb-1.5 !text-xs" htmlFor={`${name}-start`}>開始</label>
              <input
                id={`${name}-start`}
                type="time"
                step={900}
                value={draft.block.s}
                onChange={(e) => {
                  const s = e.target.value;
                  const keepLength = toMin(draft.block.e) - toMin(draft.block.s);
                  patchDraft({ s, e: toHM(toMin(s) + Math.max(SLOT_MIN, keepLength)) });
                }}
                className="input !min-h-11 !py-2 !text-sm"
              />
            </div>
            <div>
              <label className="label !mb-1.5 !text-xs" htmlFor={`${name}-end`}>終了</label>
              <input
                id={`${name}-end`}
                type="time"
                step={900}
                value={draft.block.e}
                onChange={(e) => patchDraft({ e: e.target.value })}
                className="input !min-h-11 !py-2 !text-sm"
              />
            </div>
          </div>

          <div>
            <label className="label !mb-1.5 !text-xs" htmlFor={`${name}-label`}>内容</label>
            {presets.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {presets.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => patchDraft({ a: p })}
                    className={`chip ${
                      draft.block.a === p
                        ? "chip-active"
                        : ""
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
            <input
              id={`${name}-label`}
              type="text"
              value={draft.block.a}
              onChange={(e) => patchDraft({ a: e.target.value })}
              placeholder="手入力もできます（例：撮影、ロープレ）"
              className="input !min-h-11 !py-2 !text-sm"
            />
            {toMin(draft.block.e) > toMin(draft.block.s) && (
              <p className="text-[11px] text-ink-400 mt-1">所要 {durationLabel(draft.block)}</p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveDraft}
              disabled={!draft.block.a.trim() || toMin(draft.block.e) <= toMin(draft.block.s)}
              className="btn-primary flex-1 !min-h-11 !py-2 !text-sm disabled:opacity-40"
            >
              {draft.index === null ? "追加する" : "修正する"}
            </button>
            {draft.index !== null && (
              <button type="button" onClick={removeDraft} className="btn-danger">
                削除
              </button>
            )}
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="btn-secondary !min-h-11 !py-2 !px-4 !text-sm"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      <input type="hidden" name={name} value={JSON.stringify(blocks)} />
    </div>
  );
}
