import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { weekdayJa } from "@/lib/date";
import { shortStoreName } from "@/lib/shift/month";
import { PageHeader, StatusBadge } from "@/components/ui";
import { saveWorkPatternAction } from "../actions";

/** 「火〜土」「月・水・金」のような曜日の要約（0=日〜6=土。月曜始まりで並べる） */
function weekdaySummary(days: number[]): string {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const sorted = order.filter((d) => days.includes(d));
  if (sorted.length === 0) return "";
  if (sorted.length === 7) return "毎日";
  // 月曜始まりで連続していれば「火〜土」
  const idx = sorted.map((d) => order.indexOf(d));
  const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (consecutive && sorted.length >= 3) return `${weekdayJa(sorted[0])}〜${weekdayJa(sorted[sorted.length - 1])}`;
  return sorted.map(weekdayJa).join("・");
}

// 週の基本パターン設定（管理者用）：スタッフごとに曜日別の出勤・時間を設定する。
// シフト表を作っていない月は、これがそのまま「いつもどおりの予定」になり、
// シフト表を自動で作るときも、お休みの曜日（定休日など）と時間をここから取る。
export default async function WorkPatternsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; staff?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const db = getDataStore();
  const [staffList, patterns, stores] = await Promise.all([db.listStaff(), db.listWorkPatterns(), db.listStores()]);
  const activeStaff = staffList.filter((s) => s.isActive);
  const storeName = new Map(stores.map((s) => [s.id, shortStoreName(s.name)]));
  const savedName = activeStaff.find((s) => s.id === params.saved)?.name;

  return (
    <div className="page-narrow">
      <PageHeader title="基本パターン（いつもの出勤日）" backHref="/admin/schedule" backLabel="シフトへ戻る" />

      {params.saved && <p className="note note-ok mb-4">{savedName ? `${savedName}さんの` : ""}基本パターンを保存しました</p>}
      {params.error === "time" && <p className="note note-danger mb-4">終了は開始より後の時間にしてください</p>}
      {params.error === "input" && <p className="note note-danger mb-4">入力内容を確認してください</p>}

      <div className="card-quiet mb-4 text-xs text-ink-600 space-y-1 leading-relaxed">
        <p>・曜日ごとに「出勤」にチェックを入れ、時間を入れます（時間は空でもかまいません）。定休日・お休みの曜日はチェックを外します。</p>
        <p>・シフト表を作っていない月は、これがそのままスタッフの予定になります（希望休の日は休み）。</p>
        <p>・シフト表を自動で作るときも、お休みの曜日には入れず、時間はここから入れます。</p>
        <p>・パターンが無い人は、希望休を出していなければシフトの自動作成に入りません。</p>
      </div>

      <div className="space-y-4">
        {activeStaff.map((s) => {
          const mine = patterns.filter((p) => p.staffId === s.id);
          const workingDays = mine.filter((p) => p.isWorking).map((p) => p.weekday);
          const justSaved = params.saved === s.id || params.staff === s.id;
          return (
            <form
              key={s.id}
              id={`staff-${s.id}`}
              action={saveWorkPatternAction}
              className={`card space-y-3 scroll-mt-20 ${justSaved ? "!border-brand-400" : ""}`}
            >
              <input type="hidden" name="staff_id" value={s.id} />
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-ink-900">{s.name}</p>
                {stores.length > 1 && <span className="text-xs text-ink-500">{storeName.get(s.storeId)}</span>}
                <span className="flex-1" />
                {workingDays.length > 0 ? (
                  <StatusBadge label={`週${workingDays.length}日・${weekdaySummary(workingDays)}`} tone="ok" />
                ) : (
                  <StatusBadge label="未登録" tone="warning" />
                )}
              </div>

              <div className="space-y-1.5">
                {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
                  const day = mine.find((p) => p.weekday === wd);
                  return (
                    <div key={wd} className="group flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-sm font-bold w-[4.5rem] shrink-0 cursor-pointer">
                        <input
                          type="checkbox"
                          name={`wd_${wd}_working`}
                          defaultChecked={day?.isWorking ?? false}
                          className="h-5 w-5 accent-brand-500"
                        />
                        <span className={wd === 0 ? "text-red-500" : wd === 6 ? "text-sky-600" : "text-ink-700"}>
                          {weekdayJa(wd)}
                        </span>
                      </label>
                      <input
                        type="time"
                        name={`wd_${wd}_start`}
                        defaultValue={day?.startTime ?? ""}
                        className="input !min-h-10 !py-1.5 text-sm flex-1 opacity-40 group-has-[:checked]:opacity-100"
                        aria-label={`${weekdayJa(wd)}曜の開始時間`}
                      />
                      <span className="text-ink-400">〜</span>
                      <input
                        type="time"
                        name={`wd_${wd}_end`}
                        defaultValue={day?.endTime ?? ""}
                        className="input !min-h-10 !py-1.5 text-sm flex-1 opacity-40 group-has-[:checked]:opacity-100"
                        aria-label={`${weekdayJa(wd)}曜の終了時間`}
                      />
                    </div>
                  );
                })}
              </div>

              <button type="submit" className="btn-primary w-full">
                {s.name}さんのパターンを保存
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
