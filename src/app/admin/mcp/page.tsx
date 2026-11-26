import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { fx, tables } from "@/lib/data/tables";
import { canUseMcp, getMcpSettings } from "@/lib/mcp/oauth";
import { TOOLS } from "@/lib/mcp/tools";
import { PageHeader, StatusBadge } from "@/components/ui";
import { Flash, Note, NotReadyNotice } from "@/components/feature-ui";
import { McpTokenIssuer } from "@/components/mcp-token-issuer";
import { revokeTokenAction, saveMcpSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

function fmt(d: Date | null): string {
  return d ? d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}

// 依頼21：中さんのClaude（カスタムコネクタ）からの読み取り。接続の手順・許可の一覧・読んだ記録。
export default async function AdminMcpPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireAdmin();
  const params = await searchParams;
  const db = getDataStore();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "（このアプリのURL）"}`;
  const f = fx();
  const [me, settings, tokens, logs, clients, staff] = await Promise.all([
    db.getStaff(session.staffId),
    getMcpSettings(db),
    f.oauthTokens.list({ where: { revokedAt: { isNull: true }, kind: { in: ["access", "static", "refresh"] } }, order: [["createdAt", "desc"]], limit: 200 }),
    f.mcpAccessLogs.list({ order: [["createdAt", "desc"]], limit: 100 }),
    f.oauthClients.list({ order: [["createdAt", "desc"]], limit: 100 }),
    db.listStaff(),
  ]);
  const canIssue = await canUseMcp(me);
  const now = Date.now();
  const live = tokens.filter((t) => !t.expiresAt || t.expiresAt.getTime() > now);
  // OAuth の許可は、クライアントごとに1行（リフレッシュトークンが生きていれば「つながっている」）
  const grants = live.filter((t) => t.kind === "refresh");
  const statics = live.filter((t) => t.kind === "static");
  const nameOf = (id: string | null) => staff.find((s) => s.id === id)?.name ?? "—";
  return (
    <div className="page-narrow">
      <PageHeader title="Claudeからの読み取り（MCP）" backHref="/admin/features" backLabel="追加機能の設定へ戻る" icon="bot" />
      <Flash ok={params.ok} error={params.error} />
      <NotReadyNotice table={tables.oauthTokens} isAdmin />

      <section className="card !p-3.5 space-y-2">
        <p className="text-sm font-bold">つなぎ方（中さんのClaude）</p>
        <ol className="text-xs text-ink-700 space-y-1 list-decimal pl-4 leading-relaxed">
          <li>Claude の「設定 → コネクタ → カスタムコネクタを追加」を開く</li>
          <li>
            名前「ENiスタッフアプリ」、URL に <code className="select-all bg-ink-50 px-1 rounded">{origin}/api/mcp</code> を入れて追加
          </li>
          <li>「連携する」を押すと、このアプリの許可の画面が開くので、代表のアカウントで「許可する」</li>
          <li>チャットで「今月の練習時間を人ごとに教えて」などと聞く</li>
        </ol>
        <Note>読むだけです（書き込み・送信はできません）。お客様の個人情報や日報の文章は返しません。使えるのは「Claudeからアプリのデータを読める」の権限を持つ人（代表）だけです。</Note>
        <p className="text-[11px] text-ink-500">読めるもの：{TOOLS.map((t) => t.title).join("・")}</p>
      </section>

      <section className="mt-5">
        <p className="text-xs font-bold text-ink-500 mb-1.5">いまつながっているClaude</p>
        {grants.length === 0 && statics.length === 0 ? (
          <p className="text-sm text-ink-500">まだありません</p>
        ) : (
          <ul className="space-y-2">
            {grants.map((t) => (
              <li key={t.id} className="card !p-3 flex items-center gap-2">
                <span className="flex-1 min-w-0 text-sm">
                  <span className="font-bold">{clients.find((c) => c.clientId === t.clientId)?.clientName ?? "Claude"}</span>
                  <span className="block text-[11px] text-ink-500">
                    {nameOf(t.staffId)}・許可 {fmt(t.createdAt)}・期限 {fmt(t.expiresAt)}
                  </span>
                </span>
                <form action={revokeTokenAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" className="text-xs text-red-600 underline">
                    取り消す
                  </button>
                </form>
              </li>
            ))}
            {statics.map((t) => (
              <li key={t.id} className="card !p-3 flex items-center gap-2">
                <span className="flex-1 min-w-0 text-sm">
                  <span className="font-bold">秘密のトークン「{t.label}」</span>
                  <span className="block text-[11px] text-ink-500">
                    {nameOf(t.staffId)}・作成 {fmt(t.createdAt)}・最後に使った {fmt(t.lastUsedAt)}
                  </span>
                </span>
                <form action={revokeTokenAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" className="text-xs text-red-600 underline">
                    止める
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="card !p-3.5 mt-5">
        <summary className="cursor-pointer text-sm font-bold">OAuth を使えないとき（秘密のトークン）</summary>
        <p className="text-xs text-ink-600 mt-2 leading-relaxed">
          Claude Code や API の MCP コネクタなど、ヘッダーを設定できるところでは「Authorization: Bearer （トークン）」でもつなげます。
          トークンは長い秘密の文字です。人に見せず、要らなくなったら上の一覧から止めてください。
        </p>
        <div className="mt-3">{canIssue ? <McpTokenIssuer /> : <Note tone="warn">トークンを出せるのは代表だけです。</Note>}</div>
      </details>

      <details className="card !p-3.5 mt-3">
        <summary className="cursor-pointer text-sm font-bold">戻り先として許す相手</summary>
        <form action={saveMcpSettingsAction} className="mt-2 space-y-2">
          <p className="text-xs text-ink-600">許可のあとに戻ってよいサイト（1行に1つ）。手元のPC（localhost）はいつでも使えます。</p>
          <textarea name="hosts" defaultValue={settings.allowedRedirectHosts.join("\n")} className="input min-h-20 font-mono text-xs" />
          <button type="submit" className="btn-secondary btn-sm w-full">
            保存
          </button>
        </form>
      </details>

      <section className="mt-5 mb-8">
        <p className="text-xs font-bold text-ink-500 mb-1.5">読んだ記録（新しい順・100件）</p>
        {logs.length === 0 ? (
          <p className="text-sm text-ink-500">まだありません</p>
        ) : (
          <ul className="card !p-0 divide-y divide-ink-100">
            {logs.map((l) => (
              <li key={l.id} className="px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-ink-500 tabular-nums w-24 shrink-0">{fmt(l.createdAt)}</span>
                  <span className="flex-1 min-w-0 truncate font-bold text-ink-800">
                    {l.tool ? (TOOLS.find((t) => t.name === l.tool)?.title ?? l.tool) : l.method}
                  </span>
                  {!l.ok && <StatusBadge label="失敗" tone="danger" />}
                </div>
                <p className="text-[11px] text-ink-500 truncate">
                  {nameOf(l.staffId)}・{l.clientName}
                  {Object.keys(l.args ?? {}).length ? `・${JSON.stringify(l.args)}` : ""}
                  {l.note ? `・${l.note}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
