import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateTimeJa } from "@/lib/date";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { linkCandidates, maskPhone } from "@/lib/line/appointment-notices";
import { linkCustomerAction } from "../actions";

// 顧客一覧（LINE友だち追加で自動登録されたお客様＋店舗で追加したLINE未登録のお客様）。名前で検索できる。
// いちばん上に「LINEとつなぐ候補」（店舗が入れたLINE未連携のお客様と、同じ電話番号をLINEで送ってきたお客様）を出す。
// 電話番号だけでは本人と言い切れないので自動ではつながず、店舗が確かめてから「つなぐ」を押す。
export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; linked?: string; error?: string }>;
}) {
  await requireAdmin();
  const { q, linked, error } = await searchParams;
  const db = getDataStore();

  const [customers, allCustomers, pendingCounseling, upcoming] = await Promise.all([
    db.listCustomers(q),
    db.listCustomers(),
    db.listCounselingResponses({ status: "pending" }),
    db.listNextAppointments({ from: new Date() }),
  ]);
  const pendingCustomerIds = new Set(pendingCounseling.map((c) => c.customerId));
  const candidates = linkCandidates(allCustomers);
  const upcomingCount = (customerId: string) =>
    upcoming.filter((a) => a.customerId === customerId && a.status !== "cancelled").length;

  return (
    <div>
      <PageHeader title="顧客一覧" backHref="/admin" />

      {linked && (
        <p role="status" className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          LINEとつなぎました（予約のお知らせが届くようになります）
        </p>
      )}
      {error === "link" && (
        <p role="alert" className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          つなげませんでした（電話番号が変わった可能性があります。もう一度確かめてください）
        </p>
      )}

      {candidates.length > 0 && (
        <section className="note note-warn !p-4 mb-5 space-y-3">
          <p className="text-sm font-bold text-amber-900">LINEとつなぐ候補（{candidates.length}件）</p>
          <p className="text-xs text-amber-900">
            店舗で入れた「LINE未連携」のお客様と、同じ電話番号をLINEで送ってきたお客様です。同じ方か確かめてから「つなぐ」を押してください。
            つなぐと、予約がLINEのお客様に移り、お知らせが届くようになります（未連携の記録は消えます）。
          </p>
          {candidates.map(({ lineCustomer, unlinked, nameMatches }) => (
            <form key={`${lineCustomer.id}-${unlinked.id}`} action={linkCustomerAction} className="rounded-xl bg-white border border-amber-200 p-3 space-y-2">
              <input type="hidden" name="keep_id" value={lineCustomer.id} />
              <input type="hidden" name="remove_id" value={unlinked.id} />
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-[11px] font-bold text-ink-500">店舗で入れたお客様（LINE未連携）</p>
                  <p className="font-bold">{unlinked.fullName} 様</p>
                  <p className="text-xs text-ink-500">{maskPhone(unlinked.phone)}・今後の予約 {upcomingCount(unlinked.id)}件</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-ink-500">LINEのお客様</p>
                  <p className="font-bold">{lineCustomer.fullName} 様</p>
                  <p className="text-xs text-ink-500">{maskPhone(lineCustomer.phone)}・登録 {formatDateTimeJa(lineCustomer.createdAt)}</p>
                </div>
              </div>
              {!nameMatches && (
                <p className="text-xs font-bold text-red-600">お名前が違います。同じ方か、特によく確かめてください。</p>
              )}
              <ConfirmSubmit
                message={`${unlinked.fullName} 様（店舗で入れた記録）を、LINEの ${lineCustomer.fullName} 様にまとめますか？`}
                className="btn-secondary btn-sm w-full"
              >
                同じ方なのでつなぐ
              </ConfirmSubmit>
            </form>
          ))}
        </section>
      )}

      <form method="GET" className="flex gap-2 mb-4">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="お名前で検索"
          className="input flex-1"
        />
        <button type="submit" className="btn-secondary shrink-0">
          検索
        </button>
      </form>

      <p className="text-xs text-ink-500 mb-3">
        {q ? `「${q}」の検索結果：${customers.length}名` : `登録顧客：${customers.length}名`}
        ／ 顧客はLINE友だち追加時に自動で登録されます（LINE未登録のお客様は「次回予約・リマインド」から追加できます）
      </p>

      {customers.length === 0 ? (
        <EmptyState message="該当する顧客がいません" />
      ) : (
        <div className="space-y-3">
          {customers.map((c) => (
            <Link
              key={c.id}
              href={`/admin/customers/${c.id}`}
              className="card flex items-center gap-3 active:bg-brand-50"
            >
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate">{c.fullName} 様</p>
                <p className="text-xs text-ink-500 mt-0.5">
                  登録：{formatDateTimeJa(c.createdAt, true)}
                  {c.phone && <span className="ml-2">{maskPhone(c.phone)}</span>}
                </p>
              </div>
              {pendingCustomerIds.has(c.id) && <StatusBadge label="未確認あり" tone="pending" />}
              {!c.lineUserId && <StatusBadge label="LINE未連携" tone="muted" />}
              <span className="text-ink-300 text-xl">›</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
