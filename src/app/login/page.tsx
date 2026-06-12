/* eslint-disable @next/next/no-img-element */
import { redirect } from "next/navigation";
import { loginAction } from "@/lib/auth/actions";
import { getSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/data";
import { getLogoFullSrc } from "@/lib/logo";
import { DemoBanner } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect(session.role === "admin" ? "/admin" : "/staff");

  const { error } = await searchParams;
  const demo = isDemoMode();

  return (
    <div className="min-h-dvh flex flex-col">
      <DemoBanner show={demo} />
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="text-center mb-8">
            <img src={getLogoFullSrc()} alt="EREYS" className="w-56 h-auto mx-auto" />
            <p className="text-[11px] font-bold tracking-[0.35em] text-brand-500 -mt-3">
              SALON MANAGEMENT
            </p>
          </div>

          <form action={loginAction} className="card space-y-4 !p-6 !shadow-[0_8px_30px_rgba(93,80,58,0.12)]">
            {error && (
              <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3">
                {error === "empty"
                  ? "IDとパスワードを入力してください"
                  : "IDまたはパスワードが違います"}
              </p>
            )}
            <div>
              <label className="label" htmlFor="login_id">
                ログインID
              </label>
              <input
                id="login_id"
                name="login_id"
                className="input"
                autoComplete="username"
                autoCapitalize="none"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                パスワード
              </label>
              <input
                id="password"
                name="password"
                type="password"
                className="input"
                autoComplete="current-password"
                required
              />
            </div>
            <button type="submit" className="btn-primary w-full">
              ログイン
            </button>
          </form>

          {demo && (
            <div className="card mt-4 text-xs text-ink-500 space-y-1">
              <p className="font-bold text-ink-700">デモ用アカウント</p>
              <p>
                管理者：ID <code className="font-bold text-brand-700">admin</code> ／ パスワード{" "}
                <code className="font-bold text-brand-700">admin1234</code>
              </p>
              <p>
                スタッフ：ID <code className="font-bold text-brand-700">misaki</code> ／ パスワード{" "}
                <code className="font-bold text-brand-700">staff1234</code>
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
