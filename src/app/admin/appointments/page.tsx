import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addDays, formatDateJa, formatDateTimeJa, todayJst, utcToJstLocal } from "@/lib/date";
import { getMonthlyPushCount, LINE_FREE_QUOTA } from "@/lib/push-count";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import {
  approveAppointmentChangeAction,
  createAppointmentAction,
  createUnlinkedCustomerAction,
  deleteAppointmentAction,
} from "../actions";
import Link from "next/link";
import { settingsMap } from "@/lib/settings";
import {
  DAYS_BEFORE,
  LINE_NOTICE_SETTINGS_KEY,
  NOTICE_LABEL,
  maskPhone,
  parseLineNoticeSettings,
} from "@/lib/line/appointment-notices";
import type { AppointmentNoticeKind, AppointmentNoticeLog } from "@/lib/data/types";

// 次回予約の登録とLINEのお知らせの状況の確認。
// 予約を登録すると「予約完了のお知らせ」を送り、定時実行（/api/cron/reminder）が「3日前のお知らせ」「前日の確認」を
// 管理画面で選んだ時刻に送る（文面・時刻は「LINEのお知らせの設定」）。お客様は「予約確認」と送ると次の予約が分かる。
export default async function AdminAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; changed?: string; error?: string; customer_added?: string }>;
}) {
  await requireAdmin();
  const flash = await searchParams;
  const db = getDataStore();
  const now = new Date();

  const [customers, staffList, upcoming, pushCount, settingRows] = await Promise.all([
    db.listCustomers(),
    db.listStaff(),
    db.listNextAppointments({ from: now }),
    getMonthlyPushCount(db),
    db.listAppSettings(),
  ]);
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const staffMap = new Map(staffList.map((s) => [s.id, s]));
  const settings = parseLineNoticeSettings(settingsMap(settingRows)[LINE_NOTICE_SETTINGS_KEY]);
  const logs = await db.listAppointmentNoticeLogs({ appointmentIds: upcoming.map((a) => a.id), limit: 1000 });
  /** その予約の、その種類のお知らせの最新の記録（今の予約日時の分だけ） */
  const noticeOf = (appointmentId: string, scheduledAt: Date, kind: AppointmentNoticeKind): AppointmentNoticeLog | undefined =>
    logs.find((l) => l.appointmentId === appointmentId && l.kind === kind && l.scheduledFor.getTime() === scheduledAt.getTime());
  const addedCustomerId = customerMap.has(flash.customer_added ?? "") ? flash.customer_added! : "";
  const today = todayJst();
  /** 3日前・前日などを送る日（予約日のN日前）。過ぎていれば送らない */
  const sendDayLabel = (scheduledAt: Date, kind: "three_days" | "day_before" | "week_before") => {
    const day = addDays(utcToJstLocal(scheduledAt).slice(0, 10), -DAYS_BEFORE[kind]);
    if (day < today) return `${NOTICE_LABEL[kind]}：送る日を過ぎています`;
    return `${NOTICE_LABEL[kind]}：${day === today ? "今日" : formatDateJa(day)} ${settings[kind].hour}時に送信`;
  };

  return (
    <div>
      <PageHeader
        title="次回予約・リマインド"
        backHref="/admin"
        actions={
          <Link href="/admin/appointments/settings" className="btn-secondary btn-sm">
            LINEのお知らせの設定
          </Link>
        }
      />

      {!settings.enabled && (
        <Link
          href="/admin/appointments/settings#switch"
          className="note note-warn !p-4 mb-4 flex items-center gap-2 text-sm font-bold text-amber-900"
        >
          <span className="flex-1">
            お客様へのLINEは、今はオフです。予約を登録しても、お客様にLINEのお知らせは届きません。
          </span>
          <span className="shrink-0 underline">設定を開く</span>
        </Link>
      )}

      {flash.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          {settings.enabled
            ? "予約を登録しました（LINEとつながっているお客様には、予約完了のお知らせと、3日前・前日のお知らせが自動で届きます）"
            : "予約を登録しました（お客様へのLINEがオフのため、お知らせは送っていません）"}
        </p>
      )}
      {addedCustomerId && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          お客様を追加しました。続けて予約を登録してください（LINEとつながるまで、お知らせは届きません）
        </p>
      )}
      {flash.error === "customer_input" && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          お名前と、電話番号（入れる場合は正しい番号）を確認してください
        </p>
      )}
      {flash.deleted && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          予約を削除しました
        </p>
      )}
      {flash.changed && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          予約日時を変更し、お客様へLINEでお知らせしました
        </p>
      )}
      {flash.error && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          入力内容を確認してください
        </p>
      )}

      <section id="new-appointment" className="card mb-4 scroll-mt-20">
        <h2 className="section-title">次回予約を登録</h2>
        {customers.length === 0 ? (
          <p className="text-sm text-ink-400">
            顧客がまだ登録されていません（LINE友だち追加で自動登録されます）
          </p>
        ) : (
          <form action={createAppointmentAction} className="space-y-3">
            <input type="hidden" name="back_to" value="/admin/appointments" />
            <div>
              <label className="label" htmlFor="customer_id">
                お客様
              </label>
              <select id="customer_id" name="customer_id" className="input" required defaultValue={addedCustomerId}>
                <option value="" disabled>
                  選択してください
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} 様{c.phone ? `（${maskPhone(c.phone)}）` : ""}{c.lineUserId ? "" : "（LINE未連携）"}
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

      <details className="card mb-4">
        <summary className="cursor-pointer font-bold text-sm">LINE未登録のお客様を追加する（ホットペッパーなどの予約）</summary>
        <form action={createUnlinkedCustomerAction} className="space-y-3 mt-3">
          <div>
            <label className="label" htmlFor="new_customer_name">お名前</label>
            <input id="new_customer_name" name="full_name" className="input" required maxLength={60} placeholder="例）山田 花子" />
          </div>
          <div>
            <label className="label" htmlFor="new_customer_phone">電話番号（任意）</label>
            <input id="new_customer_phone" name="phone" type="tel" inputMode="tel" className="input" placeholder="例）090-1234-5678" />
            <p className="hint">
              お客様があとでLINEに電話番号を送ると、お客様一覧に「LINEとつなぐ候補」として出ます。確かめてから「つなぐ」を押すと、この予約にもお知らせが届くようになります。
            </p>
          </div>
          <button type="submit" className="btn-secondary w-full">お客様を追加する</button>
        </form>
      </details>

      <p className="text-xs text-ink-500 mb-4">
        今月のLINE送信数：{pushCount} / {LINE_FREE_QUOTA}通（お知らせも1通として消費します。「予約確認」への返事は数えません）
      </p>

      <section>
        <h2 className="section-title">今後の予約（{upcoming.length}件）</h2>
        {upcoming.length === 0 ? (
          <EmptyState message="今後の予約はありません" />
        ) : (
          <div className="space-y-3">
            {upcoming.map((a) => {
              const customer = customerMap.get(a.customerId);
              return (
                <div
                  key={a.id}
                  className={`card space-y-2 ${
                    a.status === "change_requested"
                      ? "border-amber-300"
                      : a.status === "cancelled"
                        ? "border-red-200 opacity-80"
                        : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold ${a.status === "cancelled" ? "line-through text-ink-400" : ""}`}>
                        {formatDateTimeJa(a.scheduledAt, true)}
                      </p>
                      <p className="text-sm mt-0.5 truncate">
                        {customer?.fullName ?? "（不明）"} 様
                        <span className="text-ink-400 text-xs ml-2">
                          担当：{a.staffId ? (staffMap.get(a.staffId)?.name ?? "（不明）") : "指定なし"}
                        </span>
                      </p>
                      <p className="text-xs mt-1 space-x-1">
                        {a.status === "confirmed" && <StatusBadge label="お客様確認済み" tone="ok" />}
                        {a.status === "change_requested" && (
                          <StatusBadge label="お客様から変更希望あり" tone="warning" />
                        )}
                        {a.status === "cancelled" && (
                          <StatusBadge label="お客様がキャンセル" tone="danger" />
                        )}
                        {!settings.enabled ? (
                          <StatusBadge label="お客様へのLINE：オフ" tone="muted" />
                        ) : !customer?.lineUserId ? (
                          <StatusBadge label="LINE未連携のためお知らせは送られません" tone="muted" />
                        ) : a.status === "cancelled" ? null : (
                          (["completion", "three_days", "day_before", "week_before"] as const)
                            .filter((kind) => (kind === "completion" ? settings.completion.enabled : settings[kind].enabled))
                            .map((kind) => {
                              const log = noticeOf(a.id, a.scheduledAt, kind);
                              const label =
                                log?.status === "sent"
                                  ? `${NOTICE_LABEL[kind]} 送信済み${log.mode === "mock" ? "（モック）" : ""}`
                                  : log?.status === "failed"
                                    ? `${NOTICE_LABEL[kind]} 失敗（次の回にもう一度）`
                                    : kind === "completion"
                                      ? `${NOTICE_LABEL[kind]} 未送信`
                                      : sendDayLabel(a.scheduledAt, kind);
                              const tone = log?.status === "sent" ? "ok" : log?.status === "failed" ? "danger" : "muted";
                              return <StatusBadge key={kind} label={label} tone={tone} />;
                            })
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

                  {/* お客様からの変更希望：希望日時で確定（日時は調整可能）＋確定時にLINE通知 */}
                  {a.status === "change_requested" && (
                    <form
                      action={approveAppointmentChangeAction}
                      className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-2"
                    >
                      <input type="hidden" name="id" value={a.id} />
                      <p className="text-xs font-bold text-amber-800">
                        ご希望：
                        {a.requestedNewAt ? formatDateTimeJa(a.requestedNewAt, true) : "（日時なし）"}
                        {a.changeNote && <span className="block mt-0.5">メモ：{a.changeNote}</span>}
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          type="datetime-local"
                          name="scheduled_at"
                          defaultValue={a.requestedNewAt ? utcToJstLocal(a.requestedNewAt) : ""}
                          className="input !min-h-10 !py-2 text-sm flex-1"
                          required
                        />
                        <button type="submit" className="btn-primary whitespace-nowrap !px-4">
                          この日時で確定
                        </button>
                      </div>
                      <p className="text-[11px] text-amber-700">
                        確定するとお客様へLINEでお知らせし、リマインドも新しい日程で送り直されます
                      </p>
                    </form>
                  )}

                  {a.status === "cancelled" && a.changeNote && (
                    <p className="text-xs text-ink-500">お客様メモ：{a.changeNote}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
