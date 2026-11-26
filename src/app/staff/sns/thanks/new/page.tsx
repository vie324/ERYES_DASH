import { getDataStore } from "@/lib/data";
import { requireViewer } from "@/lib/viewer";
import { thisMonthJst } from "@/lib/date";
import { CARD_COLORS, CARD_COLOR_LABEL, getSnsSettings, pointsUsedInMonth } from "@/lib/sns";
import { PageHeader } from "@/components/ui";
import { Flash } from "@/components/feature-ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { sendThanksAction } from "../../actions";

export const dynamic = "force-dynamic";

const CHIP: Record<string, string> = {
  gold: "bg-gradient-to-br from-brand-400 to-brand-600",
  rose: "bg-gradient-to-br from-rose-400 to-rose-500",
  sky: "bg-gradient-to-br from-sky-400 to-sky-500",
  mint: "bg-gradient-to-br from-emerald-400 to-emerald-500",
};

// サンクスを送る：相手を選び、ひとこととスタンプ。ポイント（サンクスギフト）も添えられる。
export default async function NewThanksPage({ searchParams }: { searchParams: Promise<{ error?: string; to?: string }> }) {
  const v = await requireViewer();
  const params = await searchParams;
  const db = getDataStore();
  const [settings, staff, stores, used] = await Promise.all([
    getSnsSettings(db),
    db.listStaff(),
    db.listStores(),
    pointsUsedInMonth(db, v.staffId, thisMonthJst()),
  ]);
  const remaining = Math.max(0, settings.monthlyPoints - used);
  const partners = staff.filter((s) => s.isActive && s.id !== v.staffId);
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  return (
    <div className="page-narrow">
      <PageHeader title="サンクスを送る" backHref="/staff/sns?tab=thanks" backLabel="社内SNSへ戻る" />
      <Flash error={params.error} />
      <form action={sendThanksAction} className="card space-y-4">
        <div>
          <label className="label" htmlFor="thanks-to">
            誰に
          </label>
          <select id="thanks-to" name="to" className="input" required defaultValue={params.to ?? ""}>
            <option value="" disabled>
              選んでください
            </option>
            {partners.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}（{storeName.get(s.storeId) ?? ""}）
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className="label">スタンプ</p>
          <div className="flex flex-wrap gap-2">
            <label>
              <input type="radio" name="stamp" value="" defaultChecked className="peer sr-only" />
              <span className="chip peer-checked:chip-active cursor-pointer">なし</span>
            </label>
            {settings.stamps.map((s) => (
              <label key={s}>
                <input type="radio" name="stamp" value={s} className="peer sr-only" />
                <span className="chip !text-lg peer-checked:chip-active cursor-pointer">{s}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="thanks-body">
            ひとこと
          </label>
          <textarea
            id="thanks-body"
            name="body"
            rows={3}
            required
            maxLength={500}
            className="input min-h-24"
            placeholder="例）今日の忙しい時間、先回りして動いてくれて本当に助かりました！"
          />
        </div>
        <div>
          <p className="label">カードの色</p>
          <div className="flex gap-2">
            {CARD_COLORS.map((key, i) => (
              <label key={key} className="flex-1">
                <input type="radio" name="card_color" value={key} defaultChecked={i === 0} className="peer sr-only" />
                <span className="flex flex-col items-center gap-1 rounded-xl border-2 border-transparent bg-white px-2 py-2 cursor-pointer peer-checked:border-brand-400 peer-checked:bg-brand-50">
                  <span className={`w-7 h-7 rounded-full ${CHIP[key]}`} />
                  <span className="text-[10px] font-bold text-ink-500">{CARD_COLOR_LABEL[key]}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="thanks-points">
            ポイントを添える（任意）
          </label>
          <input
            id="thanks-points"
            name="points"
            type="number"
            inputMode="numeric"
            min={0}
            max={Math.min(settings.maxPointsPerThanks, remaining)}
            defaultValue={0}
            className="input"
          />
          <p className="hint">
            今月の残り {remaining}pt（1回 {settings.maxPointsPerThanks}ptまで）。ポイントは記録して見えるようにするだけで、お金や商品とは交換しません
          </p>
        </div>
        <label className="flex items-start gap-2.5 rounded-xl border border-ink-200 p-3 text-sm">
          <input type="checkbox" name="private" className="mt-1 w-4 h-4" />
          <span>
            <span className="font-bold text-ink-900">非公開で送る</span>
            <span className="block text-xs text-ink-500 mt-0.5">タイムラインには出さず、相手（と管理者）だけが見られます。月間表彰の数には入ります</span>
          </span>
        </label>
        <div className="form-actions">
          <ConfirmSubmit className="btn-primary w-full" pendingLabel="送っています…">
            サンクスを送る
          </ConfirmSubmit>
        </div>
      </form>
    </div>
  );
}
