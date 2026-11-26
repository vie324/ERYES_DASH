import { getDataStore } from "@/lib/data";
import { requireViewer } from "@/lib/viewer";
import { GUIDE_LABEL, getGuides, type GuideKey } from "@/lib/guides";
import { PageHeader } from "@/components/ui";
import { TabLinks } from "@/components/feature-ui";

export const dynamic = "force-dynamic";

// シフト・出退勤の「使い方」（いつでも見られる。スタッフ向け・店長向け）。文言は管理画面で変えられる。
export default async function ShiftGuidePage({ searchParams }: { searchParams: Promise<{ for?: string }> }) {
  const v = await requireViewer();
  const params = await searchParams;
  const guides = await getGuides(getDataStore());
  const keys: GuideKey[] = ["shift", "attendance", "shift_manager"];
  const current = (keys.includes(params.for as GuideKey) ? params.for : v.isExec ? "shift_manager" : "shift") as GuideKey;
  return (
    <div className="page-narrow">
      <PageHeader title="シフト・出退勤の使い方" backHref="/staff/schedule" backLabel="シフトへ戻る" icon="help" />
      <TabLinks items={keys.map((k) => ({ href: `/staff/guide/shift?for=${k}`, label: GUIDE_LABEL[k], active: current === k }))} />
      <ol className="space-y-3">
        {guides[current].map((c, i) => (
          <li key={i} className="card flex gap-3">
            <span className="w-8 h-8 shrink-0 rounded-full bg-brand-600 text-white grid place-items-center text-sm font-bold">{i + 1}</span>
            <span>
              <span className="block text-sm font-bold text-ink-900">{c.title}</span>
              <span className="block text-sm text-ink-700 leading-relaxed mt-1">{c.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-ink-500 mt-4">くわしい手順は「使い方ガイド」と、シフトの使い方の資料（docs/シフトの使い方.md）にもまとめています。</p>
    </div>
  );
}
