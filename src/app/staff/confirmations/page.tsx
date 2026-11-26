import { redirect } from "next/navigation";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { requireViewer } from "@/lib/viewer";
import { formatDateTimeJa } from "@/lib/date";
import { gateItemsFor, getConfirmGateSettings } from "@/lib/confirm-gate";
import { PageHeader, EmptyState } from "@/components/ui";
import { Note } from "@/components/feature-ui";

export const dynamic = "force-dynamic";

// 依頼14：予定の確認の記録（誰がいつ確認したか）。幹部・管理者だけ（幹部は自分の店舗の人、管理者は全員）。
export default async function ConfirmationsPage() {
  const v = await requireViewer();
  if (!v.isExec && !v.isStoreManager) redirect("/staff");
  const db = getDataStore();
  const settings = await getConfirmGateSettings(db);
  const staff = (await db.listStaff()).filter(
    (s) => s.isActive && s.role !== "admin" && (v.isAdmin || s.storeId === v.me?.storeId || v.me?.managedStoreIds.includes(s.storeId))
  );
  // 人ごとに、確認の対象の予定と、確認したかどうか
  const rows = await Promise.all(
    staff.map(async (s) => {
      const items = await gateItemsFor(db, s.id, settings);
      const acks = items.length ? await fx().scheduleAcks.list({ where: { staffId: s.id, itemId: { in: items.map((i) => i.itemId) } } }) : [];
      return {
        staff: s,
        items: items.map((i) => ({ ...i, ack: acks.find((a) => a.itemType === i.itemType && a.itemId === i.itemId && a.version === i.version) ?? null })),
      };
    })
  );
  const titles = [...new Map(rows.flatMap((r) => r.items).map((i) => [`${i.itemType}:${i.itemId}`, i.title])).entries()];
  return (
    <div className="page-narrow">
      <PageHeader title="予定の確認の記録" backHref="/staff/exec" backLabel="幹部メニューへ戻る" icon="checkCircle" />
      <Note>
        全体スケジュール（{settings.companyEvents === "all" ? "すべて" : settings.companyEvents === "required" ? "全員参加の予定" : "対象外"}）・自分のシフト
        {settings.myShift ? "" : "（対象外）"}・会議{settings.myMeetings ? "" : "（対象外）"}・面接{settings.personalEvents ? "" : "（対象外）"}の新しいもの・変更を、
        アプリを開いたときに確認してもらっています。どれを確認必須にするかは管理画面で選べます。
      </Note>
      {titles.length === 0 ? (
        <div className="mt-4">
          <EmptyState message="いま確認の対象の予定はありません" />
        </div>
      ) : (
        <div className="space-y-3 mt-4">
          {titles.map(([key, title]) => {
            const who = rows.map((r) => ({ staff: r.staff, item: r.items.find((i) => `${i.itemType}:${i.itemId}` === key) })).filter((x) => x.item);
            const doneCount = who.filter((x) => x.item?.ack).length;
            return (
              <section key={key} className="card">
                <p className="text-sm font-bold text-ink-900">{title}</p>
                <p className="text-xs text-ink-500 mb-2">
                  確認済み {doneCount} / {who.length}人
                </p>
                <ul className="space-y-1">
                  {who.map((x) => (
                    <li key={x.staff.id} className="flex items-center justify-between text-sm">
                      <span>{x.staff.name}</span>
                      {x.item?.ack ? (
                        <span className="text-xs text-emerald-700">✓ {formatDateTimeJa(x.item.ack.ackedAt)}</span>
                      ) : (
                        <span className="text-xs font-bold text-red-600">まだ</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
