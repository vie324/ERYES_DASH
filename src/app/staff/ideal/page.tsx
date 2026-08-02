import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { ScheduleBoard } from "@/components/schedule-board";
import { PhotoInput } from "@/components/photo-input";
import { WEEK_DAY_LABELS, parseWeekContent } from "@/lib/eni/schedule-blocks";
import { copyIdealWeekAction, saveIdealWeekAction, saveMonthGoalAction } from "./actions";

const WEEKS = [
  { scope: "week1", label: "第1週" },
  { scope: "week2", label: "第2週" },
  { scope: "week3", label: "第3週" },
  { scope: "week4", label: "第4週" },
];

// 理想のスケジュール：今月の目標を先頭に表示し、第1〜4週タブで「1週間の理想」を
// Googleカレンダーのような縦の予約表で入力する。画像（手帳の写真など）も貼れる。
export default async function IdealSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const week = WEEKS.some((w) => w.scope === params.week) ? params.week! : "week1";
  const weekLabel = WEEKS.find((w) => w.scope === week)!.label;

  const db = getDataStore();
  const [ideals, presets] = await Promise.all([
    db.listIdealSchedules(session.staffId),
    db.listSchedulePresets(),
  ]);
  const goal = ideals.find((s) => s.scope === "month_goal")?.content ?? "";
  const current = ideals.find((s) => s.scope === week);
  const presetLabels = presets.map((p) => p.label);
  const initialBlocks = parseWeekContent(current?.content ?? "");

  // コピー元に選べるのは「中身が入っている他の週」だけ
  const copySources = WEEKS.filter(
    (w) => w.scope !== week && parseWeekContent(ideals.find((s) => s.scope === w.scope)?.content ?? "").length > 0
  );

  const savedMsg =
    params.saved === "goal"
      ? "今月の目標を保存しました"
      : params.saved === "week"
        ? "この週の理想を保存しました"
        : params.saved === "copied"
          ? "他の週からコピーしました（内容を確認して保存してください）"
          : "";
  const errorMsg =
    params.error === "empty"
      ? "コピー元の週にまだ予定が入っていません"
      : params.error
        ? "入力内容を確認してください"
        : "";

  return (
    <div>
      <PageHeader title="理想のスケジュール" backHref="/staff/morning" backLabel="今日のスケジュールへ戻る" />

      {savedMsg && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">{savedMsg}</p>
      )}
      {errorMsg && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">{errorMsg}</p>
      )}

      {/* ① 今月の目標（先頭に表示） */}
      <form action={saveMonthGoalAction} className="card space-y-2 mb-4 border-brand-300 bg-brand-50/40">
        <label className="label" htmlFor="content">
          今月の目標<span className="ml-2 text-[11px] font-normal text-ink-400">まずここから決める</span>
        </label>
        <textarea
          id="content"
          name="content"
          rows={3}
          defaultValue={goal}
          placeholder="例）ワインディングとカラー塗布を安定させる。モデルを月4名。"
          className="input min-h-20"
        />
        <button type="submit" className="btn-primary w-full">今月の目標を保存</button>
      </form>

      {/* ② 週タブ（第1〜4週） */}
      <div className="flex gap-1.5 mb-4">
        {WEEKS.map((w) => {
          const filled = parseWeekContent(ideals.find((s) => s.scope === w.scope)?.content ?? "").length > 0;
          return (
            <a
              key={w.scope}
              href={`/staff/ideal?week=${w.scope}`}
              className={`flex-1 text-center text-sm font-bold rounded-full px-2 py-2 border ${
                week === w.scope ? "bg-brand-600 text-white border-brand-600" : "border-ink-300 text-ink-600"
              }`}
            >
              {w.label}
              {filled && <span className={`ml-1 text-[10px] ${week === w.scope ? "text-white/80" : "text-emerald-500"}`}>●</span>}
            </a>
          );
        })}
      </div>

      {/* ③ 選択中の週：1週間の理想スケジュール（縦＝時間、横＝曜日） */}
      <form action={saveIdealWeekAction} className="card space-y-3">
        <input type="hidden" name="scope" value={week} />
        <div className="flex items-center justify-between gap-2">
          <p className="section-title !mb-0">{weekLabel}の理想の1週間</p>
          {goal && <p className="text-[11px] text-brand-700 font-bold truncate max-w-[50%]">目標：{goal.split("\n")[0]}</p>}
        </div>

        <ScheduleBoard
          name="timetable_blocks"
          initial={initialBlocks}
          presets={presetLabels}
          dayLabels={WEEK_DAY_LABELS}
          startHour={7}
          endHour={23}
        />

        <div>
          <p className="label !mb-2">画像を貼る（手帳・イメージ図など・任意）</p>
          <PhotoInput name="image" initial={current?.image ?? ""} label="画像を撮影・選択" />
        </div>
        <button type="submit" className="btn-primary w-full text-lg">{weekLabel}の理想を保存</button>
      </form>

      {/* 他の週からコピー（毎週ほぼ同じ流れの人向け） */}
      {copySources.length > 0 && (
        <form action={copyIdealWeekAction} className="card mt-4 flex items-end gap-2">
          <input type="hidden" name="to_scope" value={week} />
          <div className="flex-1">
            <label className="label !text-xs" htmlFor="from_scope">他の週の内容を{weekLabel}にコピー</label>
            <select id="from_scope" name="from_scope" className="input !min-h-10 !py-2 text-sm" defaultValue={copySources[0].scope}>
              {copySources.map((w) => (
                <option key={w.scope} value={w.scope}>{w.label}からコピー</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-secondary !min-h-10 !py-2 !px-4 text-sm">コピー</button>
        </form>
      )}

      <p className="text-xs text-ink-400 mt-4">
        ※ 理想のスケジュールは自分だけが編集できます。今日のスケジュール画面から見返せます。
      </p>
    </div>
  );
}
