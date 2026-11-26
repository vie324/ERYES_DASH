import { listSuppliers } from "@/lib/orders";
import { suppliers as suppliersTable } from "@/lib/data/tables";
import { PageHeader } from "@/components/ui";
import { Flash, NotReadyNotice } from "@/components/feature-ui";
import { saveSupplierAction } from "../products/actions";

export const dynamic = "force-dynamic";

// 依頼15：発注先の一覧（名前・発注ページのURL・連絡先・発注の方法・締め日など）
export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const params = await searchParams;
  const list = await listSuppliers();
  const Fields = ({ s }: { s?: (typeof list)[number] }) => (
    <div className="grid gap-2">
      <input name="name" defaultValue={s?.name} placeholder="発注先の名前" className="input !min-h-11 !py-2" required />
      <input name="order_url" defaultValue={s?.orderUrl} placeholder="発注ページのURL（https://…）" className="input !min-h-11 !py-2" />
      <input name="contact" defaultValue={s?.contact} placeholder="連絡先（担当・電話・メール）" className="input !min-h-11 !py-2" />
      <div className="grid grid-cols-2 gap-2">
        <input name="method" defaultValue={s?.method} placeholder="発注の方法（Web・FAX・電話など）" className="input !min-h-11 !py-2" />
        <input name="deadline_note" defaultValue={s?.deadlineNote} placeholder="締め日（例：毎週火曜12時）" className="input !min-h-11 !py-2" />
        <label className="text-xs font-bold text-ink-600">
          届くまでの日数
          <input name="lead_days" type="number" min={0} defaultValue={s?.leadDays ?? 3} className="input !min-h-11 !py-2 mt-1" />
        </label>
        <label className="text-xs font-bold text-ink-600">
          並び順
          <input name="sort" type="number" defaultValue={s?.sortOrder ?? 10} className="input !min-h-11 !py-2 mt-1" />
        </label>
      </div>
      <textarea name="note" defaultValue={s?.note} rows={2} placeholder="メモ" className="input !text-sm" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="inactive" defaultChecked={s ? !s.isActive : false} className="w-4 h-4" />
        使わない
      </label>
    </div>
  );
  return (
    <div className="page-narrow">
      <PageHeader title="発注先" backHref="/admin/features" backLabel="追加機能の設定へ戻る" icon="link" />
      <NotReadyNotice table={suppliersTable} isAdmin />
      <Flash ok={params.ok} error={params.error} />
      <div className="space-y-3">
        {list.map((s) => (
          <details key={s.id} className="card !p-3.5">
            <summary className="cursor-pointer list-none flex items-center gap-2">
              <span className="font-bold text-sm flex-1">{s.name}</span>
              {!s.isActive && <span className="text-xs text-ink-400">（使わない）</span>}
              <span className="text-xs text-ink-500">{s.method}</span>
            </summary>
            <form action={saveSupplierAction} className="mt-3 space-y-2">
              <input type="hidden" name="id" value={s.id} />
              <Fields s={s} />
              <button type="submit" className="btn-secondary btn-sm w-full">
                保存
              </button>
            </form>
          </details>
        ))}
        <form action={saveSupplierAction} className="card !p-3.5 space-y-2 border-dashed">
          <p className="text-sm font-bold">発注先を足す</p>
          <Fields />
          <button type="submit" className="btn-primary btn-sm w-full">
            足す
          </button>
        </form>
      </div>
    </div>
  );
}
