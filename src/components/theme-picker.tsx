// ダッシュボードの配色えらび。自分の画面だけに効く（他の人には影響しない）。
// サーバーアクションで保存するだけなので、クライアント側のJSは増やさない。

import { DASHBOARD_THEMES } from "@/lib/theme";
import { setDashboardThemeAction } from "@/app/staff/theme-actions";

export function ThemePicker({ current, back }: { current: string; back: string }) {
  return (
    <details className="mb-3">
      <summary className="cursor-pointer list-none inline-flex items-center gap-2 text-[11px] font-bold text-ink-500 hover:text-brand-700">
        <span
          className="w-3.5 h-3.5 rounded-full border border-black/10"
          style={{ background: "var(--dash-accent)" }}
        />
        ダッシュボードの色を変える
      </summary>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {DASHBOARD_THEMES.map((t) => (
          <form key={t.key || "default"} action={setDashboardThemeAction}>
            <input type="hidden" name="theme" value={t.key} />
            <input type="hidden" name="back" value={back} />
            <button
              type="submit"
              className={`chip !py-1.5 !px-3 ${current === t.key ? "chip-active" : ""}`}
              title={t.label}
            >
              <span
                className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                style={{ background: `linear-gradient(to bottom right, ${t.accent2}, ${t.accent})` }}
              />
              {t.label}
            </button>
          </form>
        ))}
      </div>
    </details>
  );
}
