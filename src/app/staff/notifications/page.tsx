import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { env, isPushConfigured } from "@/lib/env";
import { isExecutive } from "@/lib/eni/access";
import { PUSH_KINDS } from "@/lib/push/kinds";
import { MORNING_REMINDER_HOUR_KEY, getChoiceSetting } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { PushDevice } from "@/components/push-device";
import { savePushPreferencesAction } from "./actions";

// 通知の設定：受け取る通知の種類を本人がオン・オフする（本人ごと。端末ごとではない）。
// あわせて「この端末」で通知が使えるか、iPhoneの「ホーム画面に追加」の手順、テスト通知。
export default async function NotificationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const db = getDataStore();
  const [prefs, isExec, morningHour] = await Promise.all([
    db.listPushPreferences([session.staffId]),
    isExecutive(session),
    getChoiceSetting(db, MORNING_REMINDER_HOUR_KEY),
  ]);
  const disabled = new Set(prefs[0]?.disabledKinds ?? []);
  const kinds = PUSH_KINDS.filter((k) => !k.execOnly || isExec);
  const configured = isPushConfigured();

  return (
    <div className="page-narrow">
      <PageHeader
        title="通知の設定"
        backHref="/staff"
        description="トークの新着・タスクなどのお知らせと、アプリのアイコンの赤い数字"
        icon="bell"
      />

      {params.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          受け取る通知を保存しました
        </p>
      )}

      {!configured && (
        <p className="rounded-xl bg-amber-50 text-amber-800 text-sm font-bold px-4 py-3 mb-4">
          通知はまだ準備中です（管理者が通知の鍵を設定すると使えるようになります）。ほかの機能はそのまま使えます。
        </p>
      )}

      <section className="card mb-4">
        <h2 className="section-title">この端末</h2>
        {configured ? (
          <PushDevice publicKey={env.vapidPublicKey} />
        ) : (
          <p className="text-sm text-ink-500">準備ができると、ここから通知をオンにできます。</p>
        )}
      </section>

      <section className="card mb-4">
        <h2 className="section-title">受け取る通知</h2>
        <p className="hint !mt-0 mb-3">
          オフにした種類は、すべての端末に届かなくなります。アイコンの赤い数字は「未読のトーク＋今日の未完了のタスク・ルーティン」で、
          読んだり完了したりすると減ります。
        </p>
        <form action={savePushPreferencesAction}>
          <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100 mb-3">
            {kinds.map((k) => (
              <li key={k.key}>
                <label className="flex items-center gap-3 px-3.5 py-3 cursor-pointer">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-ink-900">
                      {k.label}
                      {k.key === "morning" && (
                        <span className="ml-1.5 text-xs font-bold text-brand-700">毎朝 {morningHour}:00ごろ</span>
                      )}
                    </span>
                    <span className="block text-xs text-ink-500 mt-0.5">{k.note}</span>
                  </span>
                  <input
                    type="checkbox"
                    name="kinds"
                    value={k.key}
                    defaultChecked={!disabled.has(k.key)}
                    className="toggle shrink-0"
                    aria-label={`${k.label}を受け取る`}
                  />
                </label>
              </li>
            ))}
          </ul>
          <button type="submit" className="btn-primary w-full">この内容で保存</button>
        </form>
      </section>
    </div>
  );
}
