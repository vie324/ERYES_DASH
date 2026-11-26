import { redirect } from "next/navigation";
import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { requireViewer, canSeeMember } from "@/lib/viewer";
import { formatDateJa, monthRange, todayJst } from "@/lib/date";
import { computeMissing } from "@/lib/required-inputs";
import { PageHeader, EmptyState } from "@/components/ui";
import { Note } from "@/components/feature-ui";

export const dynamic = "force-dynamic";

// 依頼14：未入力の人と件数（幹部・管理者。幹部は自分の店舗、店舗の管理者は担当店舗、管理者は全員）。本人の分はホームに出る。
export default async function RequiredOverviewPage() {
  const v = await requireViewer();
  if (!v.isExec && !v.isStoreManager) redirect("/staff");
  const db = getDataStore();
  const today = todayJst();
  const staff = (await db.listStaff()).filter((s) => s.isActive && canSeeMember(v, s));
  const missing = await computeMissing(db, { from: monthRange(today.slice(0, 7)).from, to: today, staffIds: staff.map((s) => s.id) });
  const rows = staff
    .map((s) => {
      const list = missing.get(s.id) ?? [];
      return { s, today: list.filter((m) => m.date === today), past: list.filter((m) => m.date !== today) };
    })
    .filter((r) => r.today.length + r.past.length > 0)
    .sort((a, b) => b.past.length - a.past.length || b.today.length - a.today.length);
  return (
    <div className="page-narrow">
      <PageHeader title="まだの入力（みんな）" backHref="/staff/exec" backLabel="幹部メニューへ戻る" icon="alertTriangle" />
      <Note>
        その日に必ず入力するもの（管理画面で決める）が残っている人です。今日の分は閉店後まで「まだ」と出ます。本人のホームにも、入力するまで出続けます。
      </Note>
      {rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="この月の未入力はありません 🎉" />
        </div>
      ) : (
        <div className="table-wrap mt-4">
          <table className="table-base">
            <thead>
              <tr>
                <th>名前</th>
                <th className="!text-right">今日</th>
                <th className="!text-right">これまで</th>
                <th>中身</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, today: t, past }) => (
                <tr key={s.id}>
                  <td className="font-bold">{s.name}</td>
                  <td className="text-right">{t.length}</td>
                  <td className={`text-right font-bold ${past.length ? "text-red-600" : ""}`}>{past.length}</td>
                  <td className="!whitespace-normal text-xs text-ink-600 min-w-48">
                    {[...t, ...past]
                      .slice(0, 6)
                      .map((m) => `${formatDateJa(m.date)} ${m.label}`)
                      .join("、")}
                    {t.length + past.length > 6 && " …"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {v.isAdmin && (
        <p className="text-center mt-4">
          <Link href="/admin/required-inputs" className="text-sm font-bold text-brand-700 underline">
            必須入力の設定を変える
          </Link>
        </p>
      )}
    </div>
  );
}
