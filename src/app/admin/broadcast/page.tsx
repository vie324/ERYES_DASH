import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateTimeJa } from "@/lib/date";
import { getMockSendLogs, lineMode } from "@/lib/line/client";
import { getMonthlyPushCount, LINE_FREE_QUOTA } from "@/lib/push-count";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";
import { sendBroadcastAction } from "../actions";

const ERROR_MESSAGES: Record<string, string> = {
  empty: "本文を入力してください",
  toolong: "本文は1000文字以内で入力してください",
  confirm: "送信前に確認チェックを入れてください",
};

// 一斉配信：登録済みの全顧客（LINE連携済み）へテキストをPush送信する
export default async function AdminBroadcastPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  await requireAdmin();
  const flash = await searchParams;
  const db = getDataStore();

  const [customers, broadcasts, staffList, pushCount] = await Promise.all([
    db.listCustomers(),
    db.listBroadcasts(),
    db.listStaff(),
    getMonthlyPushCount(db),
  ]);
  const staffMap = new Map(staffList.map((s) => [s.id, s]));
  const recipientCount = customers.filter((c) => c.lineUserId).length;
  const mock = lineMode() === "mock";
  const mockLogs = mock ? getMockSendLogs().slice(0, 5) : [];

  return (
    <div>
      <PageHeader title="一斉配信" backHref="/admin" />

      {flash.sent && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          {flash.sent}名に送信しました{mock ? "（モック送信：実際には送られていません）" : ""}
        </p>
      )}
      {flash.error && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          {ERROR_MESSAGES[flash.error] ?? "送信に失敗しました"}
        </p>
      )}

      {mock && (
        <p className="rounded-xl bg-amber-50 text-amber-800 text-xs font-bold px-4 py-3 mb-4">
          LINE未接続のためモックモードで動作中：送信内容は下の「モック送信ログ」で確認できます
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard label="送信対象（LINE連携済み顧客）" value={`${recipientCount}名`} />
        <StatCard
          label="今月のLINE送信数"
          value={`${pushCount} / ${LINE_FREE_QUOTA}通`}
          tone={pushCount >= LINE_FREE_QUOTA ? "danger" : pushCount >= LINE_FREE_QUOTA * 0.8 ? "warning" : "default"}
          sub="一斉配信は人数分を消費します"
        />
      </div>

      <section className="card mb-4">
        <h2 className="font-bold text-sm text-stone-500 mb-3">メッセージを作成</h2>
        <form action={sendBroadcastAction} className="space-y-3">
          <textarea
            name="body"
            rows={5}
            maxLength={1000}
            placeholder={"例）【ERYES】\n台風接近のため、本日17時以降のご予約のお客様はご来店にお気をつけください。"}
            className="input min-h-32"
            required
          />
          <label className="flex items-start gap-2 text-sm font-bold text-stone-600">
            <input type="checkbox" name="confirm" className="mt-0.5 h-5 w-5 accent-rose-500" />
            <span>
              {recipientCount}名のお客様に送信されることを確認しました（取り消しはできません）
            </span>
          </label>
          <button type="submit" className="btn-primary w-full">
            全員に送信する
          </button>
        </form>
      </section>

      <section className="mb-4">
        <h2 className="font-bold text-sm text-stone-500 mb-2">送信履歴</h2>
        {broadcasts.length === 0 ? (
          <EmptyState message="送信履歴はまだありません" />
        ) : (
          <div className="space-y-3">
            {broadcasts.map((b) => (
              <div key={b.id} className="card">
                <p className="text-xs text-stone-500">
                  {formatDateTimeJa(b.sentAt, true)} ／ {b.recipientCount}名 ／ 送信者：
                  {staffMap.get(b.sentBy)?.name ?? "（不明）"}
                </p>
                <p className="text-sm mt-1.5 whitespace-pre-wrap">{b.body}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {mock && mockLogs.length > 0 && (
        <section className="card !bg-stone-100">
          <h2 className="font-bold text-xs text-stone-500 mb-2">
            モック送信ログ（直近5件・動作確認用）
          </h2>
          <ul className="space-y-2 text-xs text-stone-600">
            {mockLogs.map((log, i) => (
              <li key={i} className="border-b border-stone-200 pb-1.5 last:border-0">
                <span className="font-bold">[{log.type}]</span> → {log.to}（
                {formatDateTimeJa(log.at)}）
                <br />
                <span className="whitespace-pre-wrap">{log.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
