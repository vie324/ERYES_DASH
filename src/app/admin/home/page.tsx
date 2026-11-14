// ホームの設定（ENi）：ショートカットの並び（ロールごと）・見える化の見せ方（項目ごと）・しもんさんの言葉。
// 管理者だけ（admin/layout と各アクションで確かめる）。EREYS のホームはこの設定の影響を受けない。

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { todayJst } from "@/lib/date";
import { settingsMap } from "@/lib/settings";
import { accentStyle } from "@/lib/menu-accent";
import {
  DEFAULT_SHORTCUTS,
  HOME_ROLES,
  HOME_ROLE_LABEL,
  HOME_SHORTCUTS_KEY,
  SHORTCUT_CATALOG,
  parseShortcutSettings,
  storedShortcutOverrides,
  type ShortcutDef,
} from "@/lib/home/shortcuts";
import {
  HOME_VISIBILITY_KEY,
  INSIGHT_DEFS,
  INSIGHT_LEVEL_LABEL,
  parseInsightVisibility,
  type InsightLevel,
} from "@/lib/home/visibility";
import { previewWords, sortWords } from "@/lib/home/words";
import { PageHeader, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ConfirmSubmit } from "@/components/confirm-submit";
import {
  createWordAction,
  deleteWordAction,
  moveWordAction,
  resetShortcutsAction,
  resetVisibilityAction,
  saveShortcutsAction,
  saveVisibilityAction,
  updateWordAction,
} from "./actions";

const LEVELS: InsightLevel[] = ["names", "summary", "none"];

/** 見る権限の決まりがあるショートカットの注記 */
const ONLY_NOTE: Record<NonNullable<ShortcutDef["only"]>, string> = {
  exec: "幹部・管理者だけに出ます",
  stylist: "スタイリスト（と職種なしの人）だけに出ます",
  assistant: "アシスタント（と職種なしの人）だけに出ます",
  member: "職種のある人と幹部・管理者だけに出ます",
};

export default async function AdminHomeSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; t?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const flash = params.msg ? { type: params.t === "error" ? "error" : "ok", text: params.msg } : null;

  const db = getDataStore();
  const today = todayJst();
  const [settingRows, words, shown] = await Promise.all([
    db.listAppSettings(),
    db.listDailyWords(),
    db.listDailyWordShown(60),
  ]);
  const settings = settingsMap(settingRows);
  const shortcutSettings = parseShortcutSettings(settings[HOME_SHORTCUTS_KEY]);
  const overrides = storedShortcutOverrides(settings[HOME_SHORTCUTS_KEY]);
  const visibility = parseInsightVisibility(settings[HOME_VISIBILITY_KEY]);
  const sortedWords = sortWords(words);
  const preview = previewWords(words, shown, today);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="ホームの設定"
        backHref="/admin"
        backLabel="ホームへ戻る"
        icon="layoutGrid"
        description="ENiのホームに出すショートカット・見える化・しもんさんの言葉を決めます（EREYSのホームは変わりません）。"
      />

      {flash && (
        <p
          role="status"
          className={`rounded-xl text-sm font-bold px-4 py-3 mb-4 ${
            flash.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
          }`}
        >
          {flash.text}
        </p>
      )}

      <nav className="flex flex-wrap gap-2 mb-5" aria-label="設定の項目">
        <a href="#shortcuts" className="chip">ショートカット</a>
        <a href="#visibility" className="chip">見える化</a>
        <a href="#words" className="chip">しもんさんの言葉</a>
      </nav>

      {/* ---------------- ショートカット ---------------- */}
      <section id="shortcuts" className="card scroll-mt-20">
        <h2 className="section-title">ショートカット（ロールごと）</h2>
        <p className="hint !mt-0 mb-3">
          ホームに1行4つで並ぶアイコンです。出すものにチェックを入れ、順番の数字の小さい順に並びます
          （あいだに入れたいときは「1.5」、先頭にしたいときは「0」のように入れられます）。
          見る権限のない画面は、ここで選んでもその人のホームには出ません。
        </p>
        <div className="space-y-3">
          {HOME_ROLES.map((role) => {
            const selected = shortcutSettings[role];
            const ordered = [
              ...selected.map((key) => SHORTCUT_CATALOG.find((d) => d.key === key)!).filter(Boolean),
              ...SHORTCUT_CATALOG.filter((d) => !selected.includes(d.key)),
            ];
            const customized = overrides[role] !== undefined;
            return (
              <details key={role} id={`role-${role}`} className="rounded-xl border border-ink-100 bg-white scroll-mt-20 group">
                <summary className="flex items-center gap-2 cursor-pointer list-none px-4 py-3">
                  <span className="font-bold flex-1">{HOME_ROLE_LABEL[role]}</span>
                  <span className="text-xs text-ink-500">{selected.length}個</span>
                  {customized ? <StatusBadge label="変更あり" tone="ok" /> : <StatusBadge label="初期値" tone="muted" />}
                  <Icon name="chevronDown" className="w-4 h-4 text-brand-400 transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <div className="px-4 pb-4">
                  <form action={saveShortcutsAction} className="space-y-3">
                    <input type="hidden" name="role" value={role} />
                    <ul className="divide-y divide-ink-100 border-y border-ink-100">
                      {ordered.map((def) => {
                        const position = selected.indexOf(def.key);
                        return (
                          <li key={def.key} className="flex items-center gap-3 py-2">
                            <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                              <input
                                type="checkbox"
                                name={`on_${def.key}`}
                                defaultChecked={position !== -1}
                                className="w-5 h-5 accent-[var(--color-brand-600)] shrink-0"
                              />
                              <span className="ios-row-icon" style={accentStyle(def.accent)}>
                                <Icon name={def.icon} className="w-[18px] h-[18px]" />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-sm font-bold truncate">{def.label}</span>
                                {def.only && <span className="block text-[11px] text-ink-500">{ONLY_NOTE[def.only]}</span>}
                              </span>
                            </label>
                            <input
                              type="number"
                              name={`order_${def.key}`}
                              inputMode="decimal"
                              min={0}
                              max={99}
                              step="any"
                              defaultValue={position === -1 ? "" : position + 1}
                              aria-label={`${def.label}の順番`}
                              placeholder="順番"
                              className="input !w-20 !py-1.5 text-center"
                            />
                          </li>
                        );
                      })}
                    </ul>
                    <p className="text-[11px] text-ink-500">
                      初期値：{DEFAULT_SHORTCUTS[role].map((k) => SHORTCUT_CATALOG.find((d) => d.key === k)?.label).join("・")}
                    </p>
                    <button type="submit" className="btn-primary w-full">この並びで保存</button>
                  </form>
                  {customized && (
                    <form action={resetShortcutsAction} className="mt-2">
                      <input type="hidden" name="role" value={role} />
                      <ConfirmSubmit message={`「${HOME_ROLE_LABEL[role]}」を初期値に戻しますか？`} className="btn-ghost w-full">
                        初期値に戻す
                      </ConfirmSubmit>
                    </form>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      {/* ---------------- 見える化 ---------------- */}
      <section id="visibility" className="card mt-5 scroll-mt-20">
        <h2 className="section-title">見える化（誰に何を見せるか）</h2>
        <p className="hint !mt-0 mb-3">
          初期値は酒井案（ENiの確認待ち）です。「名前で表示」以外にすると、名前は集計の段階で外れ、画面にもAPIにも出ません。
          「全員」は幹部・管理者以外の人です。
        </p>
        <form action={saveVisibilityAction} className="space-y-1">
          {INSIGHT_DEFS.map((def, i) => {
            const v = visibility[def.key];
            return (
              <fieldset key={def.key} className="border-t border-ink-100 py-3">
                <legend className="sr-only">{def.title}</legend>
                <p className="text-sm font-bold">
                  {"①②③④⑤"[i]} {def.title}
                </p>
                <p className="text-[11px] text-ink-500 mb-2">{def.definition}</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="block">
                    <span className="label !mb-1">全員</span>
                    <select name={`all_${def.key}`} defaultValue={v.all} className="input">
                      {LEVELS.map((l) => (
                        <option key={l} value={l}>
                          {l === "summary" ? `集計だけ（${def.summaryLabel}）` : INSIGHT_LEVEL_LABEL[l]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 sm:pt-6">
                    <input
                      type="checkbox"
                      name={`self_${def.key}`}
                      defaultChecked={v.self}
                      className="w-5 h-5 accent-[var(--color-brand-600)]"
                    />
                    <span className="text-sm font-bold">本人に自分の分を出す</span>
                  </label>
                  <label className="block">
                    <span className="label !mb-1">幹部・管理者</span>
                    <select name={`exec_${def.key}`} defaultValue={v.exec} className="input">
                      {LEVELS.map((l) => (
                        <option key={l} value={l}>
                          {l === "summary" ? `集計だけ（${def.summaryLabel}）` : INSIGHT_LEVEL_LABEL[l]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </fieldset>
            );
          })}
          <button type="submit" className="btn-primary w-full">この見せ方で保存</button>
        </form>
        <form action={resetVisibilityAction} className="mt-2">
          <ConfirmSubmit message="見える化の見せ方を初期値（酒井案）に戻しますか？" className="btn-ghost w-full">
            初期値（酒井案）に戻す
          </ConfirmSubmit>
        </form>
      </section>

      {/* ---------------- しもんさんの言葉 ---------------- */}
      <section id="words" className="card mt-5 scroll-mt-20">
        <h2 className="section-title">しもんさんの言葉</h2>
        <p className="hint !mt-0 mb-3">
          朝のカードに、1日1つ・全員に同じ言葉を、上から順に出します（全部出たら最初に戻ります）。
          AIで作ったり言い換えたりはしません。1件も無いと、朝のカードのこの部分は出ません。
          「出す」を外すと、その言葉は飛ばします。
        </p>

        <form action={createWordAction} className="space-y-2 mb-4">
          <label htmlFor="new-word" className="label">言葉を追加（いちばん下に入ります）</label>
          <textarea id="new-word" name="body" rows={3} maxLength={1000} required className="input leading-relaxed" />
          <button type="submit" className="btn-primary w-full">追加する</button>
        </form>

        {sortedWords.length === 0 ? (
          <p className="text-sm text-ink-500">まだ登録がありません（ENiから届き次第、登録してください）。</p>
        ) : (
          <ol className="divide-y divide-ink-100 border-t border-ink-100">
            {sortedWords.map((w, i) => (
              <li key={w.id} id={`word-${w.id}`} className="py-3 scroll-mt-20">
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                  <span className="text-xs font-bold text-ink-500">{i + 1}.</span>
                  {preview.todayId === w.id && <StatusBadge label="今日の言葉" tone="ok" />}
                  {preview.nextId === w.id && <StatusBadge label="次に出る" tone="pending" />}
                  {!w.isActive && <StatusBadge label="止めています" tone="muted" />}
                </div>
                <form action={updateWordAction} className="space-y-2">
                  <input type="hidden" name="id" value={w.id} />
                  <textarea
                    name="body"
                    rows={3}
                    maxLength={1000}
                    required
                    defaultValue={w.body}
                    aria-label={`${i + 1}つめの言葉`}
                    className="input leading-relaxed"
                  />
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 flex-1">
                      <input
                        type="checkbox"
                        name="is_active"
                        defaultChecked={w.isActive}
                        className="w-5 h-5 accent-[var(--color-brand-600)]"
                      />
                      <span className="text-sm font-bold">出す</span>
                    </label>
                    <button type="submit" className="btn-secondary btn-sm">保存</button>
                  </div>
                </form>
                <div className="flex items-center gap-2 mt-2">
                  <form action={moveWordAction}>
                    <input type="hidden" name="id" value={w.id} />
                    <input type="hidden" name="dir" value="up" />
                    <button type="submit" className="btn-ghost btn-sm" disabled={i === 0}>↑ 上へ</button>
                  </form>
                  <form action={moveWordAction}>
                    <input type="hidden" name="id" value={w.id} />
                    <input type="hidden" name="dir" value="down" />
                    <button type="submit" className="btn-ghost btn-sm" disabled={i === sortedWords.length - 1}>↓ 下へ</button>
                  </form>
                  <form action={deleteWordAction} className="ml-auto">
                    <input type="hidden" name="id" value={w.id} />
                    <ConfirmSubmit message="この言葉を削除しますか？（止めるだけなら「出す」を外してください）" className="btn-ghost btn-sm !text-red-600">
                      削除
                    </ConfirmSubmit>
                  </form>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="text-center mt-6">
        <Link href="/admin" className="text-sm font-bold text-brand-700 underline">ホームで見え方を確かめる</Link>
      </p>
    </div>
  );
}
