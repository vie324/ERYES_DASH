// 保存済みの予約表を読み取り専用で表示する（サーバーコンポーネントのまま使える＝JSを増やさない）。
// ScheduleBoardView：グリッド表示（1日・1週間）／ScheduleList：時間順の一覧（一覧画面向け）

import type { ScheduleBlock } from "@/lib/data/types";
import { PX_PER_HOUR, blockColor, fitHourRange, placeBlocks } from "@/lib/eni/schedule-blocks";

export function ScheduleBoardView({
  blocks,
  dayLabels,
  startHour = 8,
  endHour = 22,
}: {
  blocks: ScheduleBlock[];
  dayLabels: string[];
  startHour?: number;
  endHour?: number;
}) {
  if (blocks.length === 0) {
    return <p className="text-xs text-ink-400">（予定は入っていません）</p>;
  }
  const range = fitHourRange(blocks, startHour, endHour);
  const hours = Array.from({ length: range.endHour - range.startHour }, (_, i) => range.startHour + i);
  const multiDay = dayLabels.length > 1;

  return (
    <div className="rounded-xl border border-brand-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: multiDay ? `${3 + dayLabels.length * 4.5}rem` : undefined }}>
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

          <div className="flex" style={{ height: hours.length * PX_PER_HOUR }}>
            <div className="w-12 shrink-0 relative bg-brand-50/40">
              {hours.map((h, i) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 text-[10px] font-bold text-ink-400 text-center"
                  style={{ top: i * PX_PER_HOUR - 6 }}
                >
                  {i === 0 ? "" : `${h}:00`}
                </div>
              ))}
            </div>

            {dayLabels.map((label, d) => {
              const placed = placeBlocks(
                blocks,
                blocks.map((_, i) => i).filter((i) => blocks[i].d === d),
                range.startHour,
                range.endHour
              );
              return (
                <div key={label} className="flex-1 min-w-0 relative border-l border-brand-100">
                  {hours.map((h, i) => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-t border-brand-100"
                      style={{ top: i * PX_PER_HOUR }}
                    />
                  ))}
                  {placed.map((p) => (
                    <div
                      key={`${p.index}-${p.block.s}`}
                      style={{
                        top: `${p.top}%`,
                        height: `calc(${p.height}% - 2px)`,
                        left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`,
                        width: `calc(${100 / p.lanes}% - 4px)`,
                      }}
                      className={`absolute rounded-md border px-1 py-0.5 overflow-hidden leading-tight ${blockColor(
                        p.block.a
                      )}`}
                    >
                      <span className="block text-[10px] font-bold truncate">{p.block.a}</span>
                      <span className="block text-[9px] opacity-70 truncate">
                        {p.block.s}〜{p.block.e}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 時間順の一覧（みんなの予定など、たくさん並べるところ向け） */
export function ScheduleList({ blocks }: { blocks: ScheduleBlock[] }) {
  if (blocks.length === 0) return null;
  return (
    <ul className="rounded-xl border border-ink-200 overflow-hidden">
      {blocks.map((b, i) => (
        <li key={`${b.s}-${i}`} className={`flex items-center gap-2 ${i > 0 ? "border-t border-ink-100" : ""}`}>
          <span className="w-24 shrink-0 text-[11px] font-bold text-ink-400 bg-ink-50 py-1.5 text-center">
            {b.s}〜{b.e}
          </span>
          <span className="flex-1 min-w-0 px-2 py-1.5 text-sm text-ink-700 truncate">{b.a}</span>
        </li>
      ))}
    </ul>
  );
}
