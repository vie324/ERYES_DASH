import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { AI_FEATURE_LABEL, aiMonthlySummary, getAiLimits, type AiFeature } from "@/lib/ai/run";
import { addMonths, thisMonthJst } from "@/lib/date";
import { isMonth } from "@/lib/action-utils";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/ui";
import { Flash, MiniStat, Note } from "@/components/feature-ui";
import { saveAiLimitsAction } from "@/app/admin/features/actions";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("ja-JP");
const usd = (n: number) => `${"$"}${n.toFixed(2)}`;

// CLAUDE.md「AIを使う機能」：使った量（トークン数）を月ごとに見る・1人1日あたりの上限を決める（管理者だけ）。
export default async function AiUsagePage({ searchParams }: { searchParams: Promise<{ month?: string; ok?: string; error?: string }> }) {
  const params = await searchParams;
  const month = params.month && isMonth(params.month) ? params.month : thisMonthJst();
  const db = getDataStore();
  const [{ rows, byStaff }, limits, staff] = await Promise.all([aiMonthlySummary(month), getAiLimits(db), db.listStaff()]);
  const total = rows.reduce(
    (s, r) => ({ calls: s.calls + r.calls, tokens: s.tokens + r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens, usd: s.usd + r.usd }),
    { calls: 0, tokens: 0, usd: 0 }
  );
  const top = [...byStaff.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  return (
    <div className="page-narrow">
      <PageHeader title="AIの使った量" backHref="/admin/features" backLabel="追加機能の設定へ戻る" icon="barChart" />
      <Flash ok={params.ok} error={params.error} />
      <div className="flex items-center justify-between mb-3">
        <Link href={`/admin/ai-usage?month=${addMonths(month, -1)}`} className="btn-ghost btn-sm">
          ← 前の月
        </Link>
        <p className="text-sm font-bold">{month.replace("-", "年")}月</p>
        <Link href={`/admin/ai-usage?month=${addMonths(month, 1)}`} className="btn-ghost btn-sm">
          次の月 →
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <MiniStat label="呼んだ回数" value={fmt(total.calls)} />
        <MiniStat label="トークン" value={fmt(total.tokens)} />
        <MiniStat label="目安の費用" value={usd(total.usd)} />
      </div>
      <section className="card !p-0 overflow-hidden mb-4">
        <table className="w-full text-xs">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              <th className="text-left px-3 py-2 font-bold">機能</th>
              <th className="text-right px-2 py-2 font-bold">回数</th>
              <th className="text-right px-2 py-2 font-bold">入力</th>
              <th className="text-right px-2 py-2 font-bold">出力</th>
              <th className="text-right px-3 py-2 font-bold">費用</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-ink-500">
                  この月の記録はありません
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.feature}>
                <td className="px-3 py-2">
                  {AI_FEATURE_LABEL[r.feature as AiFeature] ?? r.feature}
                  {r.failed > 0 && <span className="text-red-600">（失敗{r.failed}）</span>}
                </td>
                <td className="text-right px-2 tabular-nums">{fmt(r.calls)}</td>
                <td className="text-right px-2 tabular-nums">{fmt(r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens)}</td>
                <td className="text-right px-2 tabular-nums">{fmt(r.outputTokens)}</td>
                <td className="text-right px-3 tabular-nums">{usd(r.usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {top.length > 0 && (
        <section className="card !p-3.5 mb-4">
          <p className="text-[11px] font-bold text-ink-500 mb-1.5">よく使った人（回数）</p>
          <ul className="text-xs space-y-1">
            {top.map(([id, n]) => (
              <li key={id} className="flex justify-between">
                <span>{staff.find((s) => s.id === id)?.name ?? "—"}</span>
                <span className="tabular-nums">{fmt(n)}回</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Note>
        費用は料金表からの目安です（実際の請求は Anthropic の管理画面で確かめてください）。モデル：AIしもん {env.anthropicModel || "未設定"}・追加した機能 {env.aiToolsModel || "未設定"}。
      </Note>
      <form action={saveAiLimitsAction} className="card !p-3.5 space-y-2 mt-4 mb-8">
        <p className="text-sm font-bold">1人・1日あたりの上限（回）</p>
        <p className="text-[11px] text-ink-500">上限に達したら、その日はAIなしの表示に切り替わります。0にすると上限なし。</p>
        {(Object.keys(AI_FEATURE_LABEL) as AiFeature[]).map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <span className="flex-1">{AI_FEATURE_LABEL[k]}</span>
            <input name={`limit_${k}`} type="number" min={0} max={1000} defaultValue={limits[k] ?? 0} className="input !w-24 !min-h-10 !py-1 text-right" />
          </label>
        ))}
        <button type="submit" className="btn-primary w-full">
          保存
        </button>
      </form>
    </div>
  );
}
