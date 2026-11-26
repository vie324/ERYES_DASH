import { headers } from "next/headers";
import { getDataStore } from "@/lib/data";
import { fx, tables } from "@/lib/data/tables";
import { getInstagramSettings, isInstagramConfigured, INSTAGRAM_SCOPES } from "@/lib/instagram";
import { PageHeader, StatusBadge } from "@/components/ui";
import { Flash, Note, NotReadyNotice } from "@/components/feature-ui";
import { saveInstagramSettingsAction, syncInstagramNowAction } from "./actions";

export const dynamic = "force-dynamic";

// 依頼22：Instagramの連携の設定（Metaのアプリの登録に使うURL・数字の名前・今すぐ集める・つないでいる人）。
export default async function AdminInstagramPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const params = await searchParams;
  const db = getDataStore();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;
  const [settings, accounts, staff] = await Promise.all([getInstagramSettings(db), fx().instagramAccounts.list({ order: [["createdAt", "asc"]] }), db.listStaff()]);
  const configured = isInstagramConfigured();
  return (
    <div className="page-narrow">
      <PageHeader title="Instagramの連携" backHref="/admin/features" backLabel="追加機能の設定へ戻る" icon="trendingUp" />
      <Flash ok={params.ok} error={params.error} />
      <NotReadyNotice table={tables.instagramAccounts} isAdmin />
      <section className="card !p-3.5 space-y-2">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm font-bold">Metaのアプリ</p>
          <StatusBadge label={configured ? "設定済み" : "未設定"} tone={configured ? "ok" : "warning"} />
        </div>
        <p className="text-xs text-ink-600 leading-relaxed">
          環境変数 INSTAGRAM_APP_ID・INSTAGRAM_APP_SECRET（Metaの開発者の画面の「Instagram → Instagramログインによる API の設定」にある Instagram のアプリのIDとシークレット）を入れると、スタッフがつなげるようになります。
        </p>
        <p className="text-[11px] font-bold text-ink-500">Metaのアプリに登録するURL</p>
        <ul className="text-[11px] text-ink-700 space-y-1 break-all">
          <li>
            OAuthのリダイレクトURI：<code className="select-all bg-ink-50 px-1 rounded">{origin}/api/instagram/callback</code>
          </li>
          <li>
            アンインストールのコールバックURL：<code className="select-all bg-ink-50 px-1 rounded">{origin}/api/instagram/deauthorize</code>
          </li>
          <li>
            データの削除のリクエストURL：<code className="select-all bg-ink-50 px-1 rounded">{origin}/api/instagram/data-deletion</code>
          </li>
        </ul>
        <p className="text-[11px] text-ink-500">使う権限：{INSTAGRAM_SCOPES.join("・")}</p>
        <Note>
          Metaの審査（アプリレビュー）の前は、Metaのアプリに「テスター」として追加した人のアカウントだけがつなげます。審査の準備は docs/追加開発の確認手順.md の「依頼22」を見てください。
        </Note>
      </section>

      <form action={saveInstagramSettingsAction} className="card !p-3.5 space-y-2 mt-4">
        <p className="text-sm font-bold">集める数字</p>
        <p className="text-xs text-ink-600 leading-relaxed">
          Metaは数字の名前（メトリクス）をよく変えます。最新のドキュメントの名前に合わせて直してください。使えない名前はその数字だけ飛ばし、下の一覧の「お知らせ」に出ます。
        </p>
        <label className="text-[11px] text-ink-500 block">
          APIの版
          <input name="graphVersion" defaultValue={settings.graphVersion} className="input" />
        </label>
        <label className="text-[11px] text-ink-500 block">
          アカウントの1日の数字（1行に1つ。metric_type=total_value で取ります）
          <textarea name="accountMetrics" defaultValue={settings.accountMetrics.join("\n")} className="input min-h-32 font-mono text-xs" />
        </label>
        <label className="text-[11px] text-ink-500 block">
          投稿ごとの数字（1行に1つ）
          <textarea name="mediaMetrics" defaultValue={settings.mediaMetrics.join("\n")} className="input min-h-24 font-mono text-xs" />
        </label>
        <label className="text-[11px] text-ink-500 block">
          直近の投稿を何件見るか
          <input name="mediaLimit" type="number" min={1} max={25} defaultValue={settings.mediaLimit} className="input" />
        </label>
        <label className="text-[11px] text-ink-500 block">
          画面での呼び名（名前=呼び名）
          <textarea
            name="labels"
            defaultValue={Object.entries(settings.labels)
              .map(([k, l]) => `${k}=${l}`)
              .join("\n")}
            className="input min-h-32 font-mono text-xs"
          />
        </label>
        <button type="submit" className="btn-primary w-full">
          保存
        </button>
      </form>

      <section className="mt-5 mb-8">
        <div className="flex items-center gap-2 mb-1.5">
          <p className="flex-1 text-xs font-bold text-ink-500">つないでいる人（{accounts.filter((a) => a.status !== "disconnected").length}人）</p>
          <form action={syncInstagramNowAction}>
            <button type="submit" className="btn-secondary btn-sm">
              今すぐ集める
            </button>
          </form>
        </div>
        <ul className="card !p-0 divide-y divide-ink-100">
          {accounts.length === 0 && <li className="p-3 text-sm text-ink-500">まだいません</li>}
          {accounts.map((a) => (
            <li key={a.id} className="px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="flex-1 min-w-0 truncate">
                  {staff.find((s) => s.id === a.staffId)?.name ?? "—"} <span className="text-[11px] text-ink-500">@{a.username}</span>
                </span>
                <span className="text-[11px] text-ink-500">{a.tokenExpiresAt ? `期限 ${a.tokenExpiresAt.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}` : ""}</span>
                <StatusBadge label={a.status} tone={a.status === "active" ? "ok" : a.status === "demo" ? "pending" : a.status === "disconnected" ? "muted" : "danger"} />
              </div>
              {a.lastError && <p className="text-[11px] text-amber-700 mt-0.5">お知らせ：{a.lastError}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
