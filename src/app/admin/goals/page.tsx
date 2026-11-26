import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { PERIOD_LABEL, getGoalSettings } from "@/lib/goals";
import { PageHeader } from "@/components/ui";
import { Flash, Note } from "@/components/feature-ui";
import { archiveGoalAction, saveGoalAction, saveGoalSettingsAction } from "@/app/staff/goals/actions";

export const dynamic = "force-dynamic";

// 依頼19：会社・店舗の目標（5年後の姿・今期のKGI）と、目標の分け方（管理者だけ）
export default async function AdminGoalsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const params = await searchParams;
  const db = getDataStore();
  const [list, stores, settings] = await Promise.all([
    fx().goals.list({ where: { level: { in: ["company", "store"] }, isActive: true }, order: [["level", "asc"], ["createdAt", "asc"]] }),
    db.listStores(),
    getGoalSettings(db),
  ]);
  return (
    <div className="page-narrow">
      <PageHeader title="会社・店舗の目標" backHref="/admin/features" backLabel="追加機能の設定へ戻る" icon="trendingUp" />
      <Flash ok={params.ok} error={params.error} />
      <Note>会社の目標（5年10億など）は、ENiから届き次第ここに入れてください。スタッフの目標から「つながる目標」として選べます。</Note>
      <ul className="space-y-2 my-4">
        {list.map((g) => (
          <li key={g.id} className="card !p-3.5 flex items-center gap-2">
            <span className="flex-1 min-w-0">
              <span className="block text-[11px] font-bold text-brand-700">
                {g.level === "company" ? "会社" : stores.find((s) => s.id === g.storeId)?.name}・{PERIOD_LABEL[g.periodType]}（{g.periodKey}）
              </span>
              <span className="block text-sm font-bold">
                {g.title}
                {g.targetValue ? `（${g.targetValue.toLocaleString()}${g.unit}）` : ""}
              </span>
            </span>
            <form action={archiveGoalAction}>
              <input type="hidden" name="id" value={g.id} />
              <input type="hidden" name="back" value="/admin/goals" />
              <button type="submit" className="text-xs text-red-500 underline">
                外す
              </button>
            </form>
          </li>
        ))}
      </ul>
      <form action={saveGoalAction} className="card grid grid-cols-2 gap-2">
        <input type="hidden" name="back" value="/admin/goals" />
        <select name="level" className="input !min-h-11 !py-2">
          <option value="company">会社の目標</option>
          <option value="store">店舗の目標</option>
        </select>
        <select name="store" className="input !min-h-11 !py-2">
          <option value="">（店舗の目標のとき）店舗</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="period_type" className="input !min-h-11 !py-2">
          {(["vision", "kgi", "year", "month"] as const).map((p) => (
            <option key={p} value={p}>
              {PERIOD_LABEL[p]}
            </option>
          ))}
        </select>
        <input name="period_key" className="input !min-h-11 !py-2" placeholder="期間（例：2031・2026・2026-12）" />
        <input name="title" required className="input !min-h-11 !py-2 col-span-2" placeholder="例）5年で売上10億" />
        <input name="target" inputMode="decimal" className="input !min-h-11 !py-2" placeholder="数字（任意）" />
        <input name="unit" className="input !min-h-11 !py-2" placeholder="単位（円・人）" />
        <button type="submit" className="btn-primary btn-sm col-span-2">
          目標を入れる
        </button>
      </form>
      <form action={saveGoalSettingsAction} className="card mt-4 space-y-2">
        <h2 className="section-title">目標の分け方（マンダラの項目）とスタンプ</h2>
        <textarea name="areas" rows={6} className="input !text-sm" defaultValue={settings.areas.join("\n")} />
        <textarea name="stamps" rows={2} className="input !text-sm" defaultValue={settings.stamps.join("\n")} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="suggest_monthly" defaultChecked={settings.suggestMonthly} className="w-4 h-4" />
          毎月1日にも「今月やるべきこと」を作る
        </label>
        <button type="submit" className="btn-secondary btn-sm w-full">
          保存
        </button>
      </form>
    </div>
  );
}
