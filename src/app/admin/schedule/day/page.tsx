import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa, weekdayOf } from "@/lib/date";
import { formatWorkTime, resolveScheduleDay } from "@/lib/schedule";
import { PageHeader } from "@/components/ui";
import { clearScheduleOverrideAction, saveScheduleOverrideAction } from "../actions";

// 個別調整（管理者用）：特定スタッフ・特定日の勤務を上書きする。
// 締切後の休み変更や、営業時間変更などのスポット対応に使う。
export default async function ScheduleDayEditPage({
  searchParams,
}: {
  searchParams: Promise<{ staff_id?: string; date?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const staffId = params.staff_id ?? "";
  const date = params.date ?? "";
  if (!staffId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const db = getDataStore();
  const staff = await db.getStaff(staffId);
  if (!staff) notFound();

  const wd = weekdayOf(date);
  const [patterns, dayoffs, overrides] = await Promise.all([
    db.listWorkPatterns(staffId),
    db.listDayoffRequests({ staffId, from: date, to: date }),
    db.listScheduleOverrides({ staffId, from: date, to: date }),
  ]);
  const current = resolveScheduleDay(staffId, date, wd, patterns, dayoffs, overrides);
  const override = overrides[0];
  const month = date.slice(0, 7);

  return (
    <div>
      <PageHeader
        title="個別調整"
        backHref={`/admin/schedule?month=${month}`}
        backLabel="スケジュールへ戻る"
      />

      <div className="card mb-4">
        <p className="font-bold text-lg">{staff.name}</p>
        <p className="text-sm text-stone-500 mt-0.5">{formatDateJa(date, true)}</p>
        <p className="text-sm mt-2">
          現在の予定：<span className="font-bold">{formatWorkTime(current)}</span>
          <span className="text-xs text-stone-400 ml-2">
            {current.source === "override"
              ? "（個別調整）"
              : current.source === "dayoff"
                ? "（希望休）"
                : "（基本パターン）"}
          </span>
        </p>
      </div>

      <form action={saveScheduleOverrideAction} className="card space-y-4">
        <input type="hidden" name="staff_id" value={staffId} />
        <input type="hidden" name="date" value={date} />

        <div>
          <p className="label !mb-2">この日の勤務</p>
          <div className="space-y-2">
            <label className="flex items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 font-bold has-checked:border-brand-400 has-checked:bg-brand-50">
              <input
                type="radio"
                name="working"
                value="on_duty"
                defaultChecked={override ? override.isWorking : current.working}
                className="h-5 w-5 accent-brand-500"
              />
              出勤
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 font-bold has-checked:border-brand-400 has-checked:bg-brand-50">
              <input
                type="radio"
                name="working"
                value="off"
                defaultChecked={override ? !override.isWorking : !current.working}
                className="h-5 w-5 accent-brand-500"
              />
              休み
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className="label" htmlFor="start_time">
              開始
            </label>
            <input
              id="start_time"
              type="time"
              name="start_time"
              defaultValue={override?.startTime || current.startTime}
              className="input"
            />
          </div>
          <span className="text-stone-400 mt-5">〜</span>
          <div className="flex-1">
            <label className="label" htmlFor="end_time">
              終了
            </label>
            <input
              id="end_time"
              type="time"
              name="end_time"
              defaultValue={override?.endTime || current.endTime}
              className="input"
            />
          </div>
        </div>
        <p className="text-xs text-stone-400 -mt-2">※「休み」を選んだ場合、時間は保存されません</p>

        <div>
          <label className="label" htmlFor="note">
            メモ（任意・表に小さく表示されます）
          </label>
          <input
            id="note"
            type="text"
            name="note"
            defaultValue={override?.note ?? ""}
            placeholder="例）研修、時短、振替休"
            className="input"
          />
        </div>

        <button type="submit" className="btn-primary w-full text-lg">
          この内容で上書きする
        </button>
      </form>

      {override && (
        <form action={clearScheduleOverrideAction} className="card mt-4 space-y-2">
          <input type="hidden" name="staff_id" value={staffId} />
          <input type="hidden" name="date" value={date} />
          <p className="text-xs text-stone-500">
            この日は個別調整で上書きされています。取り消すと基本パターン・希望休どおりに戻ります。
          </p>
          <button type="submit" className="w-full rounded-2xl border-2 border-stone-300 px-4 py-3 font-bold text-stone-600">
            個別調整を取り消す
          </button>
        </form>
      )}
    </div>
  );
}
