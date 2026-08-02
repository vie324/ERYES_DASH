// アシスタントの「常時表示される設定」：ピラミッド／年内目標／自分との約束／デビュー設定。
// 週報の先頭に必ず出て、いつでも書き換えられる。

import {
  PYRAMID_SETTINGS,
  getAssistantSettingDefs,
  hasPyramid,
  type AssistantSettingDef,
} from "@/lib/eni/forms";
import type { AssistantRank } from "@/lib/data/types";
import { savePyramidAction, saveAssistantSettingsAction } from "@/app/staff/weekly-report/settings-actions";

export function AssistantSettingsPanel({
  rank,
  staffName,
  values,
}: {
  rank: AssistantRank;
  staffName: string;
  values: Record<string, string>;
}) {
  const defs = getAssistantSettingDefs(rank);
  const showPyramid = hasPyramid(rank);
  if (!showPyramid && defs.length === 0) return null;

  const title = (def: AssistantSettingDef) =>
    def.withName ? `${staffName}の${def.label}` : def.label;

  return (
    <div className="space-y-4 mb-4">
      {/* ピラミッド（下から：価値観 → 理想の未来像 → 目標） */}
      {showPyramid && (
        <section className="card">
          <h2 className="section-title">{staffName}のピラミッド</h2>
          <div className="space-y-1.5">
            {PYRAMID_SETTINGS.map((def, i) => {
              // 上から「目標 → 理想の未来像 → 価値観」の順に、下ほど幅広く積む
              const width = ["58%", "78%", "100%"][i];
              const tone = ["bg-brand-600 text-white", "bg-brand-400 text-white", "bg-brand-200 text-ink-900"][i];
              return (
                <div key={def.key} className="flex justify-center">
                  <div className={`rounded-xl px-3 py-2 text-center ${tone}`} style={{ width }}>
                    <p className="text-[10px] font-bold opacity-80">{def.label}</p>
                    <p className="text-sm font-bold whitespace-pre-wrap leading-snug">
                      {values[def.key] || "（未設定）"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-bold text-brand-700">ピラミッドを編集する</summary>
            <form action={savePyramidAction} className="mt-2 space-y-2">
              {[...PYRAMID_SETTINGS].reverse().map((def) => (
                <div key={def.key}>
                  <label className="label !text-xs" htmlFor={`pz-${def.key}`}>{def.label}</label>
                  <input
                    id={`pz-${def.key}`}
                    name={def.key}
                    defaultValue={values[def.key] ?? ""}
                    placeholder={def.placeholder}
                    className="input !min-h-10 !py-2 text-sm"
                  />
                </div>
              ))}
              <button type="submit" className="btn-secondary w-full !min-h-11 !py-2 text-sm">
                ピラミッドを保存
              </button>
            </form>
          </details>
        </section>
      )}

      {/* 年内目標・約束・デビュー設定など */}
      {defs.length > 0 && (
        <section className="card">
          <div className="space-y-3">
            {defs.map((def) => (
              <div key={def.key} className="border-l-2 border-brand-300 pl-3">
                <p className="text-xs font-bold text-brand-700">{title(def)}</p>
                <p className="text-sm whitespace-pre-wrap text-ink-800 mt-0.5">
                  {values[def.key] || "（未設定）"}
                </p>
                {def.note && <p className="text-[10px] text-ink-400 mt-0.5">{def.note}</p>}
              </div>
            ))}
          </div>

          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-bold text-brand-700">設定を編集する</summary>
            <form action={saveAssistantSettingsAction} className="mt-2 space-y-2">
              {defs.map((def) => (
                <div key={def.key}>
                  <label className="label !text-xs" htmlFor={`as-${def.key}`}>{title(def)}</label>
                  <textarea
                    id={`as-${def.key}`}
                    name={def.key}
                    rows={2}
                    defaultValue={values[def.key] ?? ""}
                    placeholder={def.placeholder}
                    className="input min-h-16 text-sm"
                  />
                </div>
              ))}
              <button type="submit" className="btn-secondary w-full !min-h-11 !py-2 text-sm">
                設定を保存
              </button>
            </form>
          </details>
        </section>
      )}
    </div>
  );
}
