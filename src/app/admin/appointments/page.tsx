import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateTimeJa, utcToJstLocal } from "@/lib/date";
import { getMonthlyPushCount, LINE_FREE_QUOTA } from "@/lib/push-count";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { createAppointmentAction, deleteAppointmentAction } from "../actions";

// 次回予約の登録とリマインド状況の確認。
// 前日19時の定時バッチ（/api/cron/reminder）が翌日分の予約へLINEリマインドを自動送信する。
export default async function AdminAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
}) {
  await requireAdmin();
  const flash = await searchParams;
  const db = getDataStore();
  const now = new Date();

  const [customers, staffList, upcoming, pushCount] = await Promise.all([
    db.listCustomers(),
    db.listStaff(),
    db.listNextAppointments({ from: now }),
    getMonthlyPushCount(db),
  ]);
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const staffMap = new Map(staffList.map((s) => [s.id, s]));

  return (
    <div>
      <PageHeader title="次回予約・リマインド" backHref="/admin" />

      {flash.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          予約を登録しました（前日19時に自動でリマインドが送られます）
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

      <section className="card mb-4">
        <h2 className="font-bold text-sm text-stone-500 mb-3">次回予約を登録</h2>
        {customers.length === 0 ? (
          <p className="text-sm text-stone-400">
            顧客がまだ登録されていません（LINE友だち追加で自動登録されます）
          </p>
        ) : (
          <form action={createAppointmentAction} className="space-y-3">
            <input type="hidden" name="back_to" value="/admin/appointments" />
            <div>
              <label className="label" htmlFor="customer_id">
                お客様
              </label>
              <select id="customer_id" name="customer_id" className="input" required defaultValue="">
                <option value="" disabled>
                  選択してください
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} 様{c.lineUserId ? "" : "（LINE未連携）"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="scheduled_at">
                予約日時
              </label>
              <input
                id="scheduled_at"
                name="scheduled_at"
                type="datetime-local"
                className="input"
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
              予約を登録する
            </button>
          </form>
        )}
      </section>

      <p className="text-xs text-stone-500 mb-4">
        今月のLINE送信数：{pushCount} / {LINE_FREE_QUOTA}通（リマインドも1通として消費します）
      </p>

      <section>
        <h2 className="font-bold text-sm text-stone-500 mb-2">今後の予約（{upcoming.length}件）</h2>
        {upcoming.length === 0 ? (
          <EmptyState message="今後の予約はありません" />
        ) : (
          <div className="space-y-3">
            {upcoming.map((a) => {
              const customer = customerMap.get(a.customerId);
              return (
                <div key={a.id} className="card flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold">{formatDateTimeJa(a.scheduledAt, true)}</p>
                    <p className="text-sm mt-0.5 truncate">
                      {customer?.fullName ?? "（不明）"} 様
                      <span className="text-stone-400 text-xs ml-2">
                        担当：{a.staffId ? (staffMap.get(a.staffId)?.name ?? "（不明）") : "指定なし"}
                      </span>
                    </p>
                    <p className="text-xs mt-1">
                      {!customer?.lineUserId ? (
                        <StatusBadge label="LINE未連携のため送信されません" tone="muted" />
                      ) : a.reminderSentAt ? (
                        <StatusBadge
                          label={`リマインド送信済み ${formatDateTimeJa(a.reminderSentAt)}`}
                          tone="ok"
                        />
                      ) : (
                        <StatusBadge label="リマインド未送信（前日19時に自動送信）" tone="warning" />
                      )}
                    </p>
                  </div>
                  <form action={deleteAppointmentAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="back_to" value="/admin/appointments" />
                    <button type="submit" className="btn-danger">
                      削除
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
