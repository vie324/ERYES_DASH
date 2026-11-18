import { weekdayJa } from "@/lib/date";
import { storeRulesSummary } from "@/lib/shift/calendar";
import { saveStoreShiftRulesAction } from "../actions";
import type { Store } from "@/lib/data/types";

/** 月曜はじまりの曜日（0=日〜6=土） */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

// 店舗の休みの決まり（定休日の曜日・月の休みの数）の入力欄。ルール画面とシフトのカレンダーで使う
export function StoreRulesForm({ store, back, month }: { store: Store; back: "" | "calendar"; month: string }) {
  return (
    <form action={saveStoreShiftRulesAction} id={`store-${store.id}`} className="card space-y-3 scroll-mt-20">
      <input type="hidden" name="store_id" value={store.id} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="month" value={month} />
      <div>
        <p className="font-bold text-ink-900">{store.name}</p>
        <p className="text-xs text-ink-500">いま：{storeRulesSummary(store)}</p>
      </div>
      <fieldset>
        <legend className="label">定休日（お店が休みの曜日）</legend>
        <div className="flex flex-wrap gap-1.5">
          {WEEK_ORDER.map((wd) => (
            <label key={wd} className="relative">
              <input
                type="checkbox"
                name="closed_weekdays"
                value={wd}
                defaultChecked={store.closedWeekdays.includes(wd)}
                className="peer sr-only"
              />
              <span className="chip peer-checked:!bg-brand-600 peer-checked:!text-white peer-checked:!border-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 cursor-pointer min-w-11 justify-center">
                {weekdayJa(wd)}
              </span>
            </label>
          ))}
        </div>
        <p className="hint">定休日はシフトを入れず、カレンダーで灰色になります。祝日などで開ける日は、カレンダーで日ごとに「この日は営業」にできます。</p>
      </fieldset>
      <div>
        <label className="label" htmlFor={`monthly_days_off_${store.id}`}>
          1人の月の休みの数（定休日を含む）
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`monthly_days_off_${store.id}`}
            name="monthly_days_off"
            type="number"
            inputMode="numeric"
            min={0}
            max={31}
            defaultValue={store.monthlyDaysOff}
            className="input !w-24"
          />
          <span className="text-sm text-ink-600">日（0＝決めない）</span>
        </div>
        <p className="hint">
          例：月曜定休4日を含めて8休なら「8」。各自の休みは、月によって 8 − 定休日の数（月曜が5回の月は3日）になります。
          特別休暇（休みの数に入れないお店の休み）は数えません。0 のあいだは、これまでどおり基本パターンで作ります。
        </p>
      </div>
      <button type="submit" className="btn-primary w-full">この店舗の決まりを保存</button>
    </form>
  );
}
