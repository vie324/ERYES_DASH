"use client";

// スマホで日付を選ぶための横スクロールの日付バー。
// 「今日」を中心に前後の日を並べ、指で送って選べる。日付入力（カレンダー）も併設して、
// 3ヶ月先まで一気に飛べるようにしている。

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export interface StripDay {
  date: string; // "YYYY-MM-DD"
  day: string; // "28"
  weekday: string; // "金"
  weekdayIndex: number; // 0=日〜6=土
  hasPlan: boolean;
  isToday: boolean;
}

export function DateStrip({
  days,
  selected,
  min,
  max,
  hrefOf,
}: {
  days: StripDay[];
  selected: string;
  min: string;
  max: string;
  /** 日付 → 遷移先URL（タブなどの他の条件を保つため呼び出し側で組み立てる） */
  hrefOf: string;
}) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  // 選んだ日が真ん中に来るようにスクロールする（開いた瞬間に迷わないように）
  useEffect(() => {
    const el = activeRef.current;
    const box = scroller.current;
    if (!el || !box) return;
    box.scrollLeft = el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2;
  }, [selected]);

  const go = (date: string) => router.push(hrefOf.replace("__DATE__", date));

  return (
    <div className="mb-3">
      <div
        ref={scroller}
        className="flex gap-1.5 overflow-x-auto scroll-slim pb-1 -mx-1 px-1 snap-x"
      >
        {days.map((d) => {
          const active = d.date === selected;
          return (
            <a
              key={d.date}
              ref={active ? activeRef : undefined}
              href={hrefOf.replace("__DATE__", d.date)}
              className={`snap-center shrink-0 w-12 rounded-xl border py-1.5 text-center transition-colors ${
                active
                  ? "border-brand-600 bg-gradient-to-b from-brand-500 to-brand-600 text-white"
                  : "border-brand-200 bg-white"
              }`}
            >
              <span
                className={`block text-[10px] font-bold ${
                  active
                    ? "text-white/80"
                    : d.weekdayIndex === 0
                      ? "text-red-400"
                      : d.weekdayIndex === 6
                        ? "text-blue-500"
                        : "text-ink-400"
                }`}
              >
                {d.weekday}
              </span>
              <span
                className={`block font-display text-base font-bold leading-tight ${
                  active ? "text-white" : "text-ink-900"
                }`}
              >
                {d.day}
              </span>
              <span
                className={`block mx-auto mt-0.5 h-1.5 w-1.5 rounded-full ${
                  d.hasPlan ? (active ? "bg-white" : "bg-emerald-500") : "bg-transparent"
                }`}
              />
              {d.isToday && (
                <span className={`block text-[9px] font-bold ${active ? "text-white/80" : "text-brand-600"}`}>
                  今日
                </span>
              )}
            </a>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mt-1.5">
        <input
          type="date"
          value={selected}
          min={min}
          max={max}
          onChange={(e) => e.target.value && go(e.target.value)}
          className="input !min-h-10 !py-1.5 !text-sm flex-1"
          aria-label="日付を選ぶ"
        />
        <span className="text-[11px] text-ink-400 shrink-0">3ヶ月先まで</span>
      </div>
    </div>
  );
}
