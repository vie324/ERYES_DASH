import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { updateShiftRulesAction } from "../actions";

// シフトのルール設定（自動割当と締切の判定に使われる）
export default async function AdminShiftSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const rules = await getDataStore().getShiftRules();

  return (
    <div>
      <PageHeader title="シフトのルール設定" backHref="/admin/shift" backLabel="シフト管理へ戻る" />

      {params.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          保存しました（次回の自動割当から反映されます）
        </p>
      )}
      {params.error && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          入力内容を確認してください
        </p>
      )}

      <form action={updateShiftRulesAction} className="card space-y-4">
        <div>
          <label className="label" htmlFor="max_consecutive_days">連勤の上限（日）</label>
          <input
            id="max_consecutive_days"
            name="max_consecutive_days"
            type="number"
            min={1}
            max={30}
            defaultValue={rules.maxConsecutiveDays}
            className="input"
            required
          />
          <p className="text-xs text-stone-400 mt-1">自動割当はこの連勤数を超える割当をしません。</p>
        </div>
        <div>
          <label className="label" htmlFor="min_staff_per_store_per_day">各店舗・各日の最低人数（名）</label>
          <input
            id="min_staff_per_store_per_day"
            name="min_staff_per_store_per_day"
            type="number"
            min={0}
            max={20}
            defaultValue={rules.minStaffPerStoreDay}
            className="input"
            required
          />
          {/* TODO: 最低人数は「日単位」を仮としている。早番・遅番の帯ごとに必要なら要改修 */}
          <p className="text-xs text-stone-400 mt-1">
            日単位での人数です（早番・遅番の帯ごとではありません）。満たせない日はボードに赤色で警告されます。
          </p>
        </div>
        <div>
          <label className="label" htmlFor="request_deadline_day">希望提出の締切日（毎月◯日）</label>
          <input
            id="request_deadline_day"
            name="request_deadline_day"
            type="number"
            min={1}
            max={28}
            defaultValue={rules.requestDeadlineDay}
            className="input"
            required
          />
          <p className="text-xs text-stone-400 mt-1">
            翌月分の希望は「当月◯日」まで提出・修正できます。募集の自動通知は毎月15日です。
          </p>
        </div>
        <button type="submit" className="btn-primary w-full">保存する</button>
      </form>
    </div>
  );
}
