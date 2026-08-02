/* eslint-disable @next/next/no-img-element */
import { requireSession } from "@/lib/auth/session";
import { logoutAction } from "@/lib/auth/actions";
import { isDemoMode } from "@/lib/data";
import { getLogoFullSrc } from "@/lib/logo";
import { BRAND_INFO, BRAND_ORDER } from "@/lib/brand";
import { DemoBanner } from "@/components/ui";
import { selectBrandAction } from "./actions";

export const dynamic = "force-dynamic";

// ログイン後の業態選択：メインブランドの ENi（ヘアサロン）を先頭・大きく見せ、
// EREYS（アイサロン）はその下に置く。選んだ業態に応じて以降のメニューが切り替わる。
export default async function SelectBrandPage() {
  const session = await requireSession();

  return (
    <div className="min-h-dvh flex flex-col bg-brand-50">
      <DemoBanner show={isDemoMode()} />
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="text-center mb-6">
            {/* メインブランド（ENi）のロゴ */}
            <img src={getLogoFullSrc()} alt="ENi" className="w-40 h-auto mx-auto" />
            <p className="text-sm font-bold text-stone-600 mt-2">
              {session.name}さん、どちらで使いますか？
            </p>
            <p className="text-xs text-stone-400 mt-1">選ぶと、その店舗のメニューが表示されます</p>
          </div>

          <div className="space-y-3">
            {BRAND_ORDER.map((b, i) => {
              const isMain = i === 0; // ENi＝メインブランドは大きく・強調して見せる
              return (
                <form action={selectBrandAction} key={b}>
                  <input type="hidden" name="brand" value={b} />
                  <button
                    type="submit"
                    className={`card w-full flex items-center gap-4 text-left transition-transform active:scale-[0.99] ${
                      isMain ? "!py-5 border-brand-400 !shadow-[0_8px_30px_rgba(93,80,58,0.14)]" : "!py-3.5"
                    }`}
                  >
                    <span
                      className={`shrink-0 flex items-center justify-center rounded-2xl font-display font-bold ${
                        isMain
                          ? "w-16 h-16 text-3xl bg-gradient-to-br from-brand-500 to-brand-700 text-white border border-brand-600"
                          : "w-12 h-12 text-xl bg-gradient-to-br from-brand-100 to-brand-200 border border-brand-300 text-brand-700"
                      }`}
                    >
                      {b === "eni" ? "N" : "E"}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className={`block font-display font-bold ${isMain ? "text-2xl" : "text-lg"}`}>
                          {BRAND_INFO[b].label}
                        </span>
                        {isMain && (
                          <span className="text-[10px] font-bold text-white bg-brand-600 rounded-full px-2 py-0.5">
                            メイン
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-stone-500 mt-0.5">{BRAND_INFO[b].sub}</span>
                    </span>
                    <span className="text-brand-300 text-2xl shrink-0">›</span>
                  </button>
                </form>
              );
            })}
          </div>

          <form action={logoutAction} className="mt-6 text-center">
            <button type="submit" className="text-xs font-bold text-stone-400 underline">
              ログアウト
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
