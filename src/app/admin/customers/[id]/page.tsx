import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateTimeJa, utcToJstLocal } from "@/lib/date";
import { CounselingStatusBadge } from "@/components/counseling-detail";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import {
  createAppointmentAction,
  deleteAppointmentAction,
  updateCustomerNameAction,
} from "../../actions";

// 顧客詳細：カウンセリング履歴の閲覧と、次回予約の登録・削除を行う
export default async function AdminCustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const flash = await searchParams;
  const db = getDataStore();

  const customer = await db.getCustomer(id);
  if (!customer) notFound();

  const [counseling, appointments, staffList] = await Promise.all([
    db.listCounselingResponses({ customerId: id }),
    db.listNextAppointments({ customerId: id }),
    db.listStaff(),
  ]);
  const staffMap = new Map(staffList.map((s) => [s.id, s]));
  const now = new Date();
  const upcoming = appointments.filter((a) => a.scheduledAt >= now);
  const past = appointments.filter((a) => a.scheduledAt < now).reverse().slice(0, 5);
  const backTo = `/admin/customers/${id}`;

  return (
    <div>
      <PageHeader title="顧客詳細" backHref="/admin/customers" backLabel="顧客一覧へ戻る" />

      {flash.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          保存しました
        </p>
      )}
      {flash.deleted && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          予約を削除しました
        </p>
      )}
      {flash.error && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          入力内容を確認してください
        </p>
      )}

      <div className="space-y-4">
        <section className="card">
          <form action={updateCustomerNameAction} className="flex items-end gap-2">
            <input type="hidden" name="id" value={customer.id} />
            <div className="flex-1">
              <label className="label" htmlFor="full_name">
                お名前（LINE登録時の入力を修正できます）
              </label>
              <input
                id="full_name"
                name="full_name"
                defaultValue={customer.fullName}
                className="input"
                required
              />
            </div>
            <button type="submit" className="btn-secondary shrink-0">
              変更
            </button>
          </form>
          <div className="flex items-center gap-2 mt-3 text-xs text-stone-500">
            <span>登録：{formatDateTimeJa(customer.createdAt, true)}</span>
            {customer.lineUserId ? (
              <StatusBadge label="LINE連携済み" tone="ok" />
            ) : (
              <StatusBadge label="LINE未連携（リマインド送信不可）" tone="muted" />
            )}
          </div>
        </section>

        <section className="card">
          <h2 className="font-bold text-sm text-stone-500 mb-3">次回予約を登録</h2>
          <form action={createAppointmentAction} className="space-y-3">
            <input type="hidden" name="customer_id" value={customer.id} />
            <input type="hidden" name="back_to" value={backTo} />
            <div>
              <label className="label" htmlFor="scheduled_at">
                予約日時
              </label>
              <input
                id="scheduled_at"
                name="scheduled_at"
                type="datetime-local"
                className="input"
                defaultValue=""
                min={utcToJstLocal(now).slice(0, 16)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="staff_id">
                担当（任意）
              </label>
              <select id="staff_id" name="staff_id" className="input" defaultValue="">
                <option value="">指定なし</option>
                {staffList
                  .filter((s) => s.isActive)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
            <button type="submit" className="btn-primary w-full">
              予約を登録する（前日19時に自動リマインド）
            </button>
          </form>
        </section>

        <section className="card">
          <h2 className="font-bold text-sm text-stone-500 mb-2">今後の予約</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-stone-400">予約はありません</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {upcoming.map((a) => (
                <li key={a.id} className="py-2.5 flex items-center gap-2 text-sm">
                  <div className="flex-1">
                    <p className="font-bold">{formatDateTimeJa(a.scheduledAt, true)}</p>
                    <p className="text-xs text-stone-500">
                      担当：{a.staffId ? (staffMap.get(a.staffId)?.name ?? "（不明）") : "指定なし"}
                      {a.reminderSentAt
                        ? ` ／ リマインド送信済み（${formatDateTimeJa(a.reminderSentAt)}）`
                        : " ／ リマインド未送信"}
                    </p>
                  </div>
                  <form action={deleteAppointmentAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="back_to" value={backTo} />
                    <button type="submit" className="btn-danger">
                      削除
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          {past.length > 0 && (
            <>
              <h3 className="font-bold text-xs text-stone-400 mt-3 mb-1">過去の予約（直近5件）</h3>
              <ul className="text-xs text-stone-500 space-y-1">
                {past.map((a) => (
                  <li key={a.id}>{formatDateTimeJa(a.scheduledAt, true)}</li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section>
          <h2 className="font-bold text-sm text-stone-500 mb-2">カウンセリング履歴</h2>
          {counseling.length === 0 ? (
            <EmptyState message="カウンセリング回答はまだありません" />
          ) : (
            <div className="space-y-3">
              {counseling.map((r) => (
                <Link
                  key={r.id}
                  href={`/admin/counseling/${r.id}`}
                  className="card flex items-center gap-3 active:bg-brand-50"
                >
                  <div className="flex-1">
                    <p className="text-sm font-bold">{formatDateTimeJa(r.submittedAt, true)}</p>
                  </div>
                  <CounselingStatusBadge status={r.status} />
                  <span className="text-stone-300 text-xl">›</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
