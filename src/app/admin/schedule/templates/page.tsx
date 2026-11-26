import { listShiftTemplates } from "@/lib/shift/extras";
import { shiftTemplates } from "@/lib/data/tables";
import { PageHeader } from "@/components/ui";
import { Flash, Note, NotReadyNotice } from "@/components/feature-ui";
import { deleteTemplateAction, saveTemplateAction } from "../extras-actions";

export const dynamic = "force-dynamic";

// 依頼12：勤務パターン（時間帯のひな形）。シフト表のマスを開くと、ここで登録した時間帯をタップで当てはめられる。
export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const params = await searchParams;
  const list = await listShiftTemplates();
  return (
    <div className="page-narrow">
      <PageHeader title="勤務パターン" backHref="/admin/schedule" backLabel="シフトへ戻る" icon="clock" description="シフト表に当てはめる時間帯（初期値は営業時間 9:30〜18:30）" />
      <NotReadyNotice table={shiftTemplates} isAdmin />
      <Flash ok={params.ok} error={params.error} />
      <Note>早番・遅番の「申請」は作っていません（8月の打ち合わせで削除）。ここは、管理者がシフト表を作るときの時間帯のひな形です。</Note>
      <div className="space-y-3 mt-4">
        {list.map((t) => (
          <form key={t.id} action={saveTemplateAction} className="card !p-3.5 space-y-2">
            <input type="hidden" name="id" value={t.id} />
            <div className="grid grid-cols-2 gap-2">
              <input name="name" defaultValue={t.name} className="input !min-h-11 !py-2 col-span-2" placeholder="名前（例：通常・早め・短時間）" />
              <input name="start" type="time" defaultValue={t.startTime} className="input !min-h-11 !py-2" aria-label="始まり" />
              <input name="end" type="time" defaultValue={t.endTime} className="input !min-h-11 !py-2" aria-label="終わり" />
              <label className="text-xs font-bold text-ink-600">
                休憩（分）
                <input name="break" type="number" min={0} max={240} defaultValue={t.breakMinutes} className="input !min-h-11 !py-2 mt-1" />
              </label>
              <label className="text-xs font-bold text-ink-600">
                並び順
                <input name="sort" type="number" defaultValue={t.sortOrder} className="input !min-h-11 !py-2 mt-1" />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="inactive" defaultChecked={!t.isActive} className="w-4 h-4" />
              使わない（シフト表に出さない）
            </label>
            <div className="flex gap-2">
              <button type="submit" className="btn-secondary btn-sm flex-1">
                {t.id.startsWith("default-") ? "この初期値で登録する" : "保存"}
              </button>
              {!t.id.startsWith("default-") && (
                <button type="submit" formAction={deleteTemplateAction} className="btn-danger btn-sm">
                  消す
                </button>
              )}
            </div>
          </form>
        ))}
        <form action={saveTemplateAction} className="card !p-3.5 space-y-2 border-dashed">
          <p className="text-sm font-bold text-ink-700">新しく足す</p>
          <div className="grid grid-cols-2 gap-2">
            <input name="name" className="input !min-h-11 !py-2 col-span-2" placeholder="名前" required />
            <input name="start" type="time" defaultValue="09:30" className="input !min-h-11 !py-2" aria-label="始まり" />
            <input name="end" type="time" defaultValue="18:30" className="input !min-h-11 !py-2" aria-label="終わり" />
            <input name="break" type="number" min={0} defaultValue={60} className="input !min-h-11 !py-2" aria-label="休憩（分）" />
            <input name="sort" type="number" defaultValue={20} className="input !min-h-11 !py-2" aria-label="並び順" />
          </div>
          <button type="submit" className="btn-primary btn-sm w-full">
            足す
          </button>
        </form>
      </div>
    </div>
  );
}
