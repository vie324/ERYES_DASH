/* eslint-disable @next/next/no-img-element */
import { requireSession } from "@/lib/auth/session";
import { logoutAction } from "@/lib/auth/actions";
import { isDemoMode } from "@/lib/data";
import { getLogoFullSrc } from "@/lib/logo";
import { BRAND_INFO, BRAND_ORDER } from "@/lib/brand";
import { DemoBanner } from "@/components/ui";
import { Icon } from "@/components/icons";
import { selectBrandAction } from "./actions";

export const dynamic = "force-dynamic";

// ログイン後の業態選択：メインブランドの ENi（ヘアサロン）を先頭・大きく見せ、
// EREYS（アイサロン）はその下に置く。選んだ業態に応じて以降のメニューが切り替わる。
export default async function SelectBrandPage() {
  const session = await requireSession();

  return (
    <div className="min-h-dvh flex flex-col">
      <DemoBanner show={isDemoMode()} />
      <main className="flex-1 flex items-center justify-center p-4 py-10">
        <div className="w-full max-w-md animate-fade-up">
          <div className="text-center mb-7">
            {/* メインブランド（ENi）のロゴ */}
            <img src={getLogoFullSrc()} alt="ENi" className="w-40 h-auto mx-auto" />
            <p className="font-display text-xl font-bold text-ink-900 mt-1">
              {session.name}さん、どちらで使いますか？
            </p>
            <p className="text-xs text-ink-400 mt-1.5">選ぶと、その店舗のメニューが表示されます</p>
          </div>

          <div className="space-y-3">
            {BRAND_ORDER.map((b, i) => {
              const isMain = i === 0; // ENi＝メインブランドは大きく・強調して見せる
              return (
                <form action={selectBrandAction} key={b}>
                  <input type="hidden" name="brand" value={b} />
                  <button
                    type="submit"
                    className={`card card-tappable group w-full flex items-center gap-4 text-left relative overflow-hidden ${
                      isMain ? "!py-5 border-brand-300 !shadow-lift" : "!py-4"
                    }`}
                  >
                    <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-brand-400 to-brand-600 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    <span
                      className={`shrink-0 flex items-center justify-center rounded-2xl font-display font-bold ${
                        isMain
                          ? "w-16 h-16 text-3xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-[0_4px_14px_rgba(148,129,90,0.35)]"
                          : "w-14 h-14 text-xl bg-gradient-to-br from-brand-100 to-brand-200 border border-brand-300 text-brand-700"
                      }`}
                    >
                      {b === "eni" ? "N" : "E"}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span
                          className={`block font-display font-bold text-ink-900 ${isMain ? "text-2xl" : "text-lg"}`}
                        >
                          {BRAND_INFO[b].label}
                        </span>
                        {isMain && (
                          <span className="text-[10px] font-bold text-white bg-gradient-to-b from-brand-500 to-brand-600 rounded-full px-2 py-0.5">
                            メイン
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-ink-500 mt-1">{BRAND_INFO[b].sub}</span>
                    </span>
                    <Icon
                      name="chevronRight"
                      className="w-5 h-5 shrink-0 text-brand-300 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-brand-500"
                    />
                  </button>
                </form>
              );
            })}
          </div>

          <form action={logoutAction} className="mt-7 text-center">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-400 transition-colors hover:text-brand-700"
            >
              <Icon name="logout" className="w-3.5 h-3.5" />
              ログアウト
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
