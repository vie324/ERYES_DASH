import { getSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { canUseMcp, getClient, getMcpSettings, isAllowedRedirect } from "@/lib/mcp/oauth";
import { decideAuthorizeAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Claude からの接続の許可 | ENi", robots: { index: false } };

type Params = {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
  scope?: string;
  resource?: string;
  error?: string;
};

const READABLE = ["スタッフ一覧と所属・役割", "売上の推移（日報の数字）", "練習時間", "稼働率", "日報・週報の提出", "ルーティン業務の達成率", "目標と進み具合"];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh flex items-start justify-center px-4 py-10" style={{ paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}>
      <div className="w-full max-w-sm space-y-4">{children}</div>
    </main>
  );
}

// 依頼21：Claude（カスタムコネクタ）から、このアプリのデータを読む許可の画面（OAuth の認可画面）。
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const db = getDataStore();
  const client = p.client_id ? await getClient(p.client_id) : null;
  const settings = await getMcpSettings(db);
  const redirectOk = Boolean(client && p.redirect_uri && client.redirectUris.includes(p.redirect_uri) && isAllowedRedirect(p.redirect_uri, settings.allowedRedirectHosts));
  if (!client || !redirectOk || p.error === "client") {
    return (
      <Shell>
        <div className="card">
          <p className="font-bold text-ink-900">接続を始められませんでした</p>
          <p className="text-sm text-ink-600 mt-1 leading-relaxed">コネクタの登録の情報が正しくありません。Claude の画面から、もう一度コネクタを追加してください。</p>
        </div>
      </Shell>
    );
  }
  const session = await getSession();
  const me = session ? await db.getStaff(session.staffId) : null;
  const allowed = await canUseMcp(me);
  const hidden = (["client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource"] as const).map((k) => (
    <input key={k} type="hidden" name={k} value={p[k] ?? ""} />
  ));
  const needLogin = !session || !allowed;
  return (
    <Shell>
      <div className="text-center">
        <p className="text-xs font-bold text-brand-700">ENiスタッフアプリ</p>
        <h1 className="text-lg font-bold text-ink-900 mt-1">Claude からの接続の許可</h1>
      </div>
      <div className="card space-y-3">
        <p className="text-sm text-ink-800 leading-relaxed">
          <b>{client.clientName}</b> が、このアプリのデータを<b>読む</b>許可を求めています。
        </p>
        <ul className="text-xs text-ink-600 space-y-0.5">
          {READABLE.map((r) => (
            <li key={r}>・{r}</li>
          ))}
        </ul>
        <p className="text-xs text-ink-500 leading-relaxed">書き込み・送信はできません。お客様の個人情報や、日報の文章は渡しません。読んだ記録は管理画面に残ります。</p>
      </div>
      {p.error === "login" && <p className="note note-danger">IDまたはパスワードが違います</p>}
      {p.error === "permission" && <p className="note note-danger">このアカウントでは許可できません（「Claudeからアプリのデータを読める」の権限は代表だけです）</p>}
      <form action={decideAuthorizeAction} className="card space-y-3">
        {hidden}
        {needLogin ? (
          <>
            <p className="text-xs text-ink-600">
              {session && !allowed ? `いまログインしている「${me?.name ?? ""}」さんは許可できません。代表のアカウントで入ってください。` : "代表のアカウントで入ってください。"}
            </p>
            <div>
              <label className="label" htmlFor="login_id">
                ログインID
              </label>
              <input id="login_id" name="login_id" className="input" autoComplete="username" autoCapitalize="none" required />
            </div>
            <div>
              <label className="label" htmlFor="password">
                パスワード
              </label>
              <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-700">
            <b>{me?.name}</b> さんとして許可します。
          </p>
        )}
        <button type="submit" name="decision" value="approve" className="btn-primary w-full">
          {needLogin ? "ログインして許可する" : "許可する"}
        </button>
        <button type="submit" name="decision" value="deny" formNoValidate className="btn-secondary w-full">
          許可しない
        </button>
      </form>
    </Shell>
  );
}
