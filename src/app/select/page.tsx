/* eslint-disable @next/next/no-img-element */
import { requireSession } from "@/lib/auth/session";
import { logoutAction } from "@/lib/auth/actions";
import { isDemoMode } from "@/lib/data";
import { getLogoFullSrc } from "@/lib/logo";
import { BRAND_INFO, type Brand } from "@/lib/brand";
import { DemoBanner } from "@/components/ui";
import { selectBrandAction } from "./actions";

export const dynamic = "force-dynamic";

// ログイン後の業態選択：EREYS（アイサロン）か ENi（ヘアサロン）を選ぶ。
// 選んだ業態に応じて、以降のメニュー（項目）が切り替わる。
export default async function SelectBrandPage() {
  const session = await requireSession();
  const brands: Brand[] = ["eyes", "eni"];

  return (
    <div className="min-h-dvh flex flex-col bg-brand-50">
      <DemoBanner show={isDemoMode()} />
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="text-center mb-6">
            <img src={getLogoFullSrc()} alt="EREYS" className="w-44 h-auto mx-auto" />
            <p className="text-sm font-bold text-stone-600 mt-2">
              {session.name}さん、どちらで使いますか？
            </p>
            <p className="text-xs text-stone-400 mt-1">選ぶと、その店舗のメニューが表示されます</p>
          </div>

          <div className="space-y-3">
            {brands.map((b) => (
              <form action={selectBrandAction} key={b}>
                <input type="hidden" name="brand" value={b} />
                <button
                  type="submit"
                  className="card w-full flex items-center gap-4 text-left transition-transform active:scale-[0.99]"
                >
                  <span className="w-14 h-14 shrink-0 flex items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-brand-200 border border-brand-300 font-display text-2xl font-bold text-brand-700">
                    {b === "eyes" ? "E" : "H"}
                  </span>
                  <span className="flex-1">
                    <span className="block font-display text-xl font-bold">{BRAND_INFO[b].label}</span>
                    <span className="block text-xs text-stone-500 mt-0.5">{BRAND_INFO[b].sub}</span>
                  </span>
                  <span className="text-brand-300 text-2xl shrink-0">›</span>
                </button>
              </form>
            ))}
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
