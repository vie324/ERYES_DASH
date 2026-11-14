import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateTimeJa } from "@/lib/date";
import { settingsMap } from "@/lib/settings";
import { isLineConfigured } from "@/lib/env";
import {
  LINE_NOTICE_SETTINGS_KEY,
  NOTICE_HOURS,
  NOTICE_LABEL,
  NOTICE_PLACEHOLDERS,
  SCHEDULED_KINDS,
  parseLineNoticeSettings,
  renderNotice,
} from "@/lib/line/appointment-notices";
import { PageHeader, StatusBadge } from "@/components/ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { resetLineNoticeSettingsAction, saveLineNoticeSettingsAction } from "../../actions";

const STATUS_LABEL = {
  sending: { label: "送信中", tone: "pending" },
  sent: { label: "送った", tone: "ok" },
  failed: { label: "失敗", tone: "danger" },
  skipped: { label: "送らなかった", tone: "muted" },
} as const;

// 予約のLINEのお知らせ（イーリス）の設定：文面・送る時刻・「予約確認」の合言葉と返事。あわせて送信の記録。
export default async function LineNoticeSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; reset?: string }>;
}) {
  await requireAdmin();
  const flash = await searchParams;
  const db = getDataStore();
  const [rows, logs, customers, store] = await Promise.all([
    db.listAppSettings(),
    db.listAppointmentNoticeLogs({ limit: 100 }),
    db.listCustomers(),
    db.getStore(),
  ]);
  const settings = parseLineNoticeSettings(settingsMap(rows)[LINE_NOTICE_SETTINGS_KEY]);
  const live = isLineConfigured();
  const nameOf = (id: string) => customers.find((c) => c.id === id)?.fullName ?? "（削除されたお客様）";
  const sample = (template: string, list = false) =>
    renderNotice(template, {
      name: "山田 花子",
      when: "11月17日(火) 14:00",
      store: store.name,
      list: list ? "・11月17日(火) 14:00\n・12月15日(火) 11:00" : undefined,
    });

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="LINEのお知らせの設定"
        backHref="/admin/appointments"
        backLabel="次回予約・リマインドへ戻る"
        description="予約完了・3日前・前日のお知らせの文面と送る時刻、「予約確認」と送られたときの返事を決めます。"
      />

      {flash.saved && (
        <p role="status" className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">保存しました</p>
      )}
      {flash.reset && (
        <p role="status" className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">初期値に戻しました</p>
      )}

      <div className={`note ${live ? "note-info" : "note-warn"} !p-4 mb-4 text-sm`}>
        {live ? (
          <p>LINEのキーが設定されています。お知らせは実際にお客様へ届きます。</p>
        ) : (
          <p>
            LINEのキー（<code>LINE_CHANNEL_ACCESS_TOKEN</code>）が未設定です。お知らせは<strong>実際には送られず</strong>、送信の記録に「モック」と残ります。
          </p>
        )}
      </div>

      <form action={saveLineNoticeSettingsAction} className="space-y-5">
        <section className="card space-y-3">
          <h2 className="section-title !mb-0">{NOTICE_LABEL.completion}</h2>
          <p className="hint !mt-0">予約を登録したときに送ります（送れなかった分は、48時間以内なら次の定時実行でもう一度送ります）。</p>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" name="completion_enabled" defaultChecked={settings.completion.enabled} className="h-5 w-5 accent-brand-500" />
            送る
          </label>
          <textarea name="completion_template" rows={7} maxLength={1000} defaultValue={settings.completion.template} className="input leading-relaxed" aria-label="予約完了のお知らせの文面" />
          <Preview text={sample(settings.completion.template)} />
        </section>

        {SCHEDULED_KINDS.map((kind) => (
          <section key={kind} className="card space-y-3">
            <h2 className="section-title !mb-0">{NOTICE_LABEL[kind]}</h2>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-bold">
                <input type="checkbox" name={`${kind}_enabled`} defaultChecked={settings[kind].enabled} className="h-5 w-5 accent-brand-500" />
                送る
              </label>
              <label className="flex items-center gap-2 text-sm">
                送る時刻
                <select name={`${kind}_hour`} defaultValue={settings[kind].hour} className="input !w-auto !py-1.5">
                  {NOTICE_HOURS.map((h) => (
                    <option key={h} value={h}>{h}:00</option>
                  ))}
                </select>
              </label>
            </div>
            <textarea name={`${kind}_template`} rows={7} maxLength={1000} defaultValue={settings[kind].template} className="input leading-relaxed" aria-label={`${NOTICE_LABEL[kind]}の文面`} />
            <Preview text={sample(settings[kind].template)} />
          </section>
        ))}

        <section className="card space-y-3">
          <h2 className="section-title !mb-0">「予約確認」への返事</h2>
          <p className="hint !mt-0">
            お客様がこの言葉を送ると（リッチメニューのボタンからも送れます）、そのLINEにつながっているお客様の、これからのご予約だけを返します。
          </p>
          <label className="block">
            <span className="label">合言葉（1行に1つ・10個まで）</span>
            <textarea name="keywords" rows={3} defaultValue={settings.keywords.join("\n")} className="input" />
          </label>
          <label className="block">
            <span className="label">予約があるときの返事</span>
            <textarea name="reply_found" rows={6} maxLength={1000} defaultValue={settings.replyFound} className="input leading-relaxed" />
          </label>
          <Preview text={sample(settings.replyFound, true)} />
          <label className="block">
            <span className="label">予約がないとき（まだLINEとつながっていないとき）の返事</span>
            <textarea name="reply_none" rows={4} maxLength={1000} defaultValue={settings.replyNone} className="input leading-relaxed" />
          </label>
        </section>

        <section className="card space-y-3">
          <h2 className="section-title !mb-0">電話番号のお願い</h2>
          <p className="hint !mt-0">
            お名前の登録のあとに送ります。届いた電話番号はお客様の記録に入り、店舗が先に入れた予約（LINE未連携）と同じ番号なら、お客様一覧に「LINEとつなぐ候補」として出ます（自動ではつながりません）。
          </p>
          <label className="block">
            <span className="label">お願いの文</span>
            <textarea name="ask_phone" rows={3} maxLength={1000} defaultValue={settings.askPhone} className="input leading-relaxed" />
          </label>
          <label className="block">
            <span className="label">電話番号を受け取ったときの返事</span>
            <textarea name="phone_saved" rows={3} maxLength={1000} defaultValue={settings.phoneSaved} className="input leading-relaxed" />
          </label>
        </section>

        <section className="card">
          <h2 className="section-title">文面に使える差し込み</h2>
          <ul className="text-sm space-y-1">
            {NOTICE_PLACEHOLDERS.map((p) => (
              <li key={p.key}>
                <code className="font-bold">{p.key}</code> …… {p.note}
              </li>
            ))}
          </ul>
        </section>

        <button type="submit" className="btn-primary w-full">この設定で保存</button>
      </form>
      <form action={resetLineNoticeSettingsAction} className="mt-2">
        <ConfirmSubmit message="LINEのお知らせの設定を初期値に戻しますか？" className="btn-ghost w-full">初期値に戻す</ConfirmSubmit>
      </form>

      <section className="mt-8">
        <h2 className="section-title">送信の記録（新しい順・100件）</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-ink-500">まだ記録はありません。</p>
        ) : (
          <ul className="space-y-2">
            {logs.map((l) => (
              <li key={l.id} className="card !p-3 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold">{nameOf(l.customerId)} 様</span>
                  <span className="text-ink-500">{NOTICE_LABEL[l.kind]}</span>
                  <StatusBadge label={STATUS_LABEL[l.status].label} tone={STATUS_LABEL[l.status].tone} />
                  {l.mode === "mock" && <StatusBadge label="モック（実際には送っていない）" tone="warning" />}
                </div>
                <p className="text-[11px] text-ink-500 mt-1">
                  {formatDateTimeJa(l.createdAt, true)}・予約 {formatDateTimeJa(l.scheduledFor, true)}
                </p>
                {l.error && <p className="text-xs text-red-600 mt-1">{l.error}</p>}
                {l.body && (
                  <details className="mt-1">
                    <summary className="text-xs font-bold text-brand-700 cursor-pointer">送った文面</summary>
                    <p className="text-xs whitespace-pre-wrap text-ink-700 mt-1">{l.body}</p>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center mt-6">
        <Link href="/admin/appointments" className="text-sm font-bold text-brand-700 underline">次回予約・リマインドへ戻る</Link>
      </p>
    </div>
  );
}

function Preview({ text }: { text: string }) {
  return (
    <details className="rounded-xl bg-ink-50 px-3 py-2">
      <summary className="text-xs font-bold text-ink-600 cursor-pointer">見本（保存している文面で表示）</summary>
      <p className="text-xs whitespace-pre-wrap text-ink-700 mt-2">{text}</p>
    </details>
  );
}
