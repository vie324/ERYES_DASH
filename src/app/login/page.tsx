/* eslint-disable @next/next/no-img-element */
import { redirect } from "next/navigation";
import { loginAction } from "@/lib/auth/actions";
import { getSession } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/data";
import { getLogoFullSrc } from "@/lib/logo";
import { DemoBanner } from "@/components/ui";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";

/** 左側の紹介パネルに並べる機能（PCのみ表示） */
const HIGHLIGHTS: { icon: "pencil" | "calendar" | "users"; text: string }[] = [
  { icon: "pencil", text: "日報・週報とカウンセリングの記録" },
  { icon: "calendar", text: "出勤スケジュールと希望休の管理" },
  { icon: "users", text: "ミーティング・議事録・組織図" },
];

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
      <div className="flex-1 lg:grid lg:grid-cols-[1.05fr_1fr]">
        {/* ---- 紹介パネル（PCのみ）---- */}
        <aside className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-sidebar-800 to-sidebar-900 p-12 relative overflow-hidden">
          <span className="pointer-events-none absolute -top-32 -left-24 w-[26rem] h-[26rem] rounded-full bg-brand-500/10 blur-3xl" />
          <span className="pointer-events-none absolute -bottom-40 -right-16 w-[24rem] h-[24rem] rounded-full bg-brand-400/[0.07] blur-3xl" />

          <img src={getLogoFullSrc()} alt="ENi" className="w-44 h-auto relative" />

          <div className="relative">
            <p className="font-display text-3xl leading-snug text-white">
              サロンの毎日を、
              <br />
              もっと美しく整える。
            </p>
            <p className="text-sm text-sidebar-muted mt-4 leading-relaxed">
              ENi（ヘアサロン）と EREYS（アイラッシュ・アイブロウ）の
              <br />
              日々の記録・シフト・チーム運営をひとつに。
            </p>
            <ul className="mt-8 space-y-3">
              {HIGHLIGHTS.map((h) => (
                <li key={h.text} className="flex items-center gap-3 text-sm text-sidebar-text">
                  <span className="w-9 h-9 shrink-0 rounded-xl border border-sidebar-line bg-white/[0.05] flex items-center justify-center text-brand-300">
                    <Icon name={h.icon} className="w-4 h-4" />
                  </span>
                  {h.text}
                </li>
              ))}
            </ul>
          </div>

          <p className="relative text-[10px] font-bold tracking-[0.35em] text-sidebar-muted/70">
            SALON MANAGEMENT
          </p>
        </aside>

        {/* ---- ログインフォーム ---- */}
        <main className="flex-1 flex items-center justify-center p-4 py-10">
          <div className="w-full max-w-sm animate-fade-up">
            <div className="text-center mb-8">
              <img src={getLogoFullSrc()} alt="ENi" className="w-52 h-auto mx-auto lg:hidden" />
              <p className="text-[11px] font-bold tracking-[0.35em] text-brand-500 -mt-3 lg:hidden">
                SALON MANAGEMENT
              </p>
              <h1 className="hidden lg:block font-display text-3xl font-bold text-ink-900">
                ログイン
              </h1>
              <p className="hidden lg:block text-sm text-ink-500 mt-2">
                サロンから受け取ったIDとパスワードを入力してください
              </p>
            </div>

            <form action={loginAction} className="card space-y-4 !p-6 !shadow-float">
              {error && (
                <p className="note note-danger">
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
              <div className="card mt-4 text-xs text-ink-500 space-y-1.5">
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
    </div>
  );
}
