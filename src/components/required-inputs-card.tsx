// 依頼14：ホームのいちばん上の「まだの入力」。入力するまで消えない（今日の分と、この月のこれまでの分）。

import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { formatDateJa } from "@/lib/date";
import { myMissingInputs } from "@/lib/required-inputs";
import { Icon } from "@/components/icons";

export async function RequiredInputsCard({ staffId, variant = "default" }: { staffId: string; variant?: "default" | "ios" }) {
  const missing = await myMissingInputs(getDataStore(), staffId).catch(() => ({ today: [], past: [] }));
  const total = missing.today.length + missing.past.length;
  if (total === 0) return null;
  const box = variant === "ios" ? "ios-card !p-3.5 mt-4 border border-red-200" : "card !border-red-200 !bg-red-50/60 mb-4";
  return (
    <section className={box} aria-labelledby="missing-inputs">
      <h2 id="missing-inputs" className="flex items-center gap-2 text-sm font-bold text-red-700">
        <Icon name="alertTriangle" className="w-4 h-4" />
        まだの入力 {total}件
      </h2>
      <ul className="mt-2 space-y-1.5">
        {missing.today.map((m) => (
          <li key={`${m.key}-${m.date}`}>
            <Link href={m.href} className="flex items-center justify-between rounded-xl bg-white border border-red-100 px-3 py-2 text-sm">
              <span className="font-bold text-ink-900">今日の{m.label}</span>
              <span className="text-xs font-bold text-red-600">入力する ›</span>
            </Link>
          </li>
        ))}
        {missing.past.slice(0, 5).map((m) => (
          <li key={`${m.key}-${m.date}`}>
            <Link href={m.href} className="flex items-center justify-between rounded-xl bg-white border border-red-100 px-3 py-2 text-sm">
              <span className="text-ink-800">
                {formatDateJa(m.date)}の{m.label}
              </span>
              <span className="text-xs font-bold text-red-600">入力する ›</span>
            </Link>
          </li>
        ))}
      </ul>
      {missing.past.length > 5 && (
        <Link href="/staff/incentive" className="block text-xs font-bold text-red-700 underline mt-2">
          ほか {missing.past.length - 5}件を見る
        </Link>
      )}
      <p className="text-[11px] text-ink-500 mt-2">締め日までに入れたものだけがインセンティブに使われます（基本給には関係ありません）。</p>
    </section>
  );
}
