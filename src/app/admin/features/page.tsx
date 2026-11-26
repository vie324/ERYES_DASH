import Link from "next/link";
import { getDataStore, isDemoMode } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { knownMissingTables } from "@/lib/data/collections";
import { GUIDE_LABEL, getGuides, type GuideKey } from "@/lib/guides";
import { getWikiSettings } from "@/lib/wiki";
import { getAttendanceSettings } from "@/lib/attendance-shift";
import { getInventorySettings } from "@/lib/inventory";
import { getUtilizationSettings } from "@/lib/utilization";
import { getAiShimonNotice } from "@/lib/ai-shimon/training";
import { JOBS } from "@/lib/jobs";
import { PageHeader } from "@/components/ui";
import { Flash, Note, RowLink } from "@/components/feature-ui";
import type { IconName } from "@/components/icons";
import { saveAiShimonNoticeAction } from "@/app/staff/ai-shimon/training/actions";
import { runJobNowAction, saveGuidesAction, saveNumbersSettingsAction, saveWikiSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

const GROUPS: { title: string; items: { href: string; icon: IconName; title: string; sub: string }[] }[] = [
  {
    title: "チーム（依頼10）",
    items: [
      { href: "/admin/sns", icon: "heart", title: "社内SNS・サンクスの設定", sub: "カテゴリ・スタンプ・毎月のポイント・注意書き・昔のサンクスカードの取り込み" },
      { href: "/staff/sns/awards", icon: "crown", title: "月間サンクス表彰", sub: "毎月1日に集計した候補から選んで発表" },
    ],
  },
  {
    title: "AI（依頼11）",
    items: [
      { href: "/staff/ai-shimon/training", icon: "bot", title: "AIしもんの教育", sub: "代表だけ：考え方・知識の登録・停止・並べ替え・履歴" },
      { href: "/staff/ai-shimon/logs", icon: "book", title: "AIしもんの相談の閲覧", sub: "代表だけ：人ごと・日付ごと" },
      { href: "/admin/ai-usage", icon: "barChart", title: "AIの使った量と1日の上限", sub: "機能ごと・月ごとのトークン数と目安の費用" },
      { href: "/staff/wiki", icon: "book", title: "ENi Wikipedia", sub: "ページ・公開範囲・Notionの取り込み・AI検索" },
    ],
  },
  {
    title: "勤務（依頼12・14）",
    items: [
      { href: "/admin/schedule/templates", icon: "clock", title: "勤務パターン", sub: "9:30〜18:30 などの時間帯（タップで当てはめ）" },
      { href: "/admin/schedule/staffing", icon: "users", title: "必要人数", sub: "曜日・日付ごと。足りない日は赤" },
      { href: "/admin/schedule/history", icon: "repeat", title: "シフトの変更の履歴", sub: "公開後の変更と通知" },
      { href: "/admin/attendance", icon: "clock", title: "勤怠（月の勤務時間・CSV）", sub: "遅刻・早退・シフト外・打刻の修正" },
      { href: "/admin/required-inputs", icon: "listTodo", title: "必須入力・予定の確認", sub: "ロールごとの必須入力・通知の時刻・確認が要る予定" },
      { href: "/admin/incentive", icon: "banknote", title: "インセンティブの締め日", sub: "締め日・通知・締め日後の救済の承認" },
    ],
  },
  {
    title: "お金・商品（依頼13・15・18）",
    items: [
      { href: "/admin/cash", icon: "banknote", title: "レジ締め・現金出納帳", sub: "項目名・摘要・つり銭・確認済みの修正" },
      { href: "/admin/suppliers", icon: "link", title: "発注先", sub: "発注のページ・連絡先" },
      { href: "/admin/products", icon: "clipboard", title: "商品", sub: "発注先・社販価格・発注点" },
      { href: "/admin/purchases", icon: "fileText", title: "ウィッグ・社販の購入記録", sub: "月ごと・人ごとの合計とCSV" },
      { href: "/staff/inventory", icon: "layoutGrid", title: "在庫・棚卸し", sub: "入荷・販売・使用・廃棄・棚卸しの照らし合わせ" },
    ],
  },
  {
    title: "業務・数字・育成（依頼16・17・19・20）",
    items: [
      { href: "/admin/work-import", icon: "fileText", title: "業務の整理の表の取り込み", sub: "CSVを当てはめて初期データに" },
      { href: "/staff/utilization", icon: "trendingUp", title: "稼働率", sub: "毎日の計算・手直し" },
      { href: "/admin/goals", icon: "trendingUp", title: "会社・店舗の目標", sub: "5年後の姿・今期のKGI・目標の分け方" },
      { href: "/admin/growth", icon: "play", title: "成長ロードマップ・カリキュラム動画", sub: "段階・項目・動画・入社日" },
    ],
  },
  {
    title: "外とのつながり（依頼21・22・23）",
    items: [
      { href: "/admin/mcp", icon: "bot", title: "Claudeからの読み取り（MCP）", sub: "中さんのClaudeのコネクタ・読んだ記録" },
      { href: "/admin/instagram", icon: "trendingUp", title: "Instagramの連携", sub: "Metaのアプリ・集める数字の名前" },
      { href: "/admin/recruit", icon: "users", title: "面接の設定", sub: "段階・経路・評価シート・録画の保存期間" },
      { href: "/staff/recruit", icon: "user", title: "面接・応募者", sub: "応募者の登録・面接の予定・評価・判定" },
    ],
  },
  {
    title: "権限",
    items: [{ href: "/admin/permissions", icon: "crown", title: "人ごとの権限", sub: "相談の閲覧・Claudeからの読み取り（代表だけ）・Wikiの編集・発注の担当 など" }],
  },
];

// 依頼10〜23で足した機能の設定を1か所に（CLAUDE.md の 5：文言・選択肢・初期データは管理画面で変えられる）。
export default async function AdminFeaturesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const params = await searchParams;
  const db = getDataStore();
  const [guides, wiki, attendance, inventory, utilization, notice, runs] = await Promise.all([
    getGuides(db),
    getWikiSettings(db),
    getAttendanceSettings(db),
    getInventorySettings(db),
    getUtilizationSettings(db),
    getAiShimonNotice(db),
    fx().jobRuns.list({ order: [["createdAt", "desc"]], limit: 300 }),
  ]);
  const missing = knownMissingTables();
  return (
    <div className="page-narrow">
      <PageHeader title="追加機能の設定" backHref="/admin" backLabel="ホームへ戻る" icon="sliders" description="依頼10〜23で足した機能の設定と、定時実行" />
      <Flash ok={params.ok} error={params.error} />
      <Link href="/staff/review" className="card !p-3.5 mb-4 flex items-center gap-3 border-brand-200">
        <span className="flex-1">
          <span className="block text-sm font-bold text-brand-800">追加開発の確認とフィードバック</span>
          <span className="block text-xs text-ink-500">依頼ごとに、試す画面・確かめるところ・フィードバックの欄</span>
        </span>
        <span className="text-brand-600">→</span>
      </Link>
      {isDemoMode() && <Note tone="info">いまはデモ（見本のデータ）で動いています。保存した内容は、アプリが起動し直すと元に戻ります。</Note>}
      {missing.length > 0 && (
        <Note tone="warn">データベースにまだ無いテーブルがあります（{missing.slice(0, 6).join("・")}{missing.length > 6 ? ` ほか${missing.length - 6}` : ""}）。supabase/schema.sql の「依頼10〜23」の部分を流すと使えます。</Note>
      )}

      {GROUPS.map((g) => (
        <section key={g.title} className="mt-5">
          <p className="text-xs font-bold text-ink-500 mb-1.5">{g.title}</p>
          <div className="space-y-2">
            {g.items.map((i) => (
              <RowLink key={i.href} href={i.href} icon={i.icon} title={i.title} sub={i.sub} />
            ))}
          </div>
        </section>
      ))}

      <section id="ai-shimon" className="card !p-3.5 mt-6 scroll-mt-20">
        <p className="text-sm font-bold">AIしもんの画面の注意書き（依頼11）</p>
        <form action={saveAiShimonNoticeAction} className="mt-2 space-y-2">
          <input name="notice" defaultValue={notice} className="input" maxLength={200} />
          <p className="text-[11px] text-ink-500">スタッフのAIしもんの画面に、いつも出します。</p>
          <button type="submit" className="btn-secondary btn-sm w-full">
            保存
          </button>
        </form>
      </section>

      <section id="wiki" className="card !p-3.5 mt-4 scroll-mt-20">
        <p className="text-sm font-bold">ENi Wikipedia のカテゴリ（依頼11）</p>
        <form action={saveWikiSettingsAction} className="mt-2 space-y-2">
          <textarea name="categories" defaultValue={wiki.categories.join("\n")} className="input min-h-28" />
          <p className="text-[11px] text-ink-500">1行に1つ。</p>
          <button type="submit" className="btn-secondary btn-sm w-full">
            保存
          </button>
        </form>
      </section>

      <section id="guides" className="card !p-3.5 mt-4 scroll-mt-20">
        <p className="text-sm font-bold">はじめての案内・使い方の文（依頼12）</p>
        <form action={saveGuidesAction} className="mt-2 space-y-3">
          {(Object.keys(GUIDE_LABEL) as GuideKey[]).map((k) => (
            <label key={k} className="block text-[11px] text-ink-500">
              {GUIDE_LABEL[k]}（1行に1枚・「見出し｜本文」）
              <textarea name={`guide_${k}`} defaultValue={guides[k].map((c) => `${c.title}｜${c.body}`).join("\n")} className="input min-h-32 text-xs" />
            </label>
          ))}
          <button type="submit" className="btn-secondary btn-sm w-full">
            保存
          </button>
        </form>
      </section>

      <section id="numbers" className="card !p-3.5 mt-4 scroll-mt-20">
        <p className="text-sm font-bold">出退勤・在庫・稼働率の決まり（依頼12・17・18）</p>
        <form action={saveNumbersSettingsAction} className="mt-2 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] text-ink-500">
              遅刻・早退の印をつけない（分）
              <input name="graceMinutes" type="number" min={0} max={60} defaultValue={attendance.graceMinutes} className="input" />
            </label>
            <label className="text-[11px] text-ink-500">
              休憩を引く勤務（分を超えたら）
              <input name="breakAfterMinutes" type="number" min={0} defaultValue={attendance.breakAfterMinutes} className="input" />
            </label>
            <label className="text-[11px] text-ink-500">
              引く休憩（分）
              <input name="breakMinutes" type="number" min={0} defaultValue={attendance.breakMinutes} className="input" />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] text-ink-500">
              棚卸しの差：何個以上
              <input name="diffUnits" type="number" min={1} defaultValue={inventory.diffUnits} className="input" />
            </label>
            <label className="text-[11px] text-ink-500">
              棚卸しの差：何％以上
              <input name="diffPercent" type="number" min={1} max={100} defaultValue={inventory.diffPercent} className="input" />
            </label>
            <label className="text-[11px] text-ink-500">
              発注の通知の時刻
              <input name="notifyHour" type="number" min={0} max={23} defaultValue={inventory.notifyHour} className="input" />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] text-ink-500">
              イーリスの休憩の初期値（分）
              <input name="eyesBreakMinutes" type="number" min={0} defaultValue={utilization.eyesBreakMinutes} className="input" />
            </label>
            <label className="text-[11px] text-ink-500">
              稼働率：よい（％以上）
              <input name="goodRate" type="number" min={1} max={100} defaultValue={utilization.goodRate} className="input" />
            </label>
            <label className="text-[11px] text-ink-500">
              稼働率：注意（％未満）
              <input name="lowRate" type="number" min={0} max={100} defaultValue={utilization.lowRate} className="input" />
            </label>
          </div>
          <button type="submit" className="btn-secondary btn-sm w-full">
            保存
          </button>
        </form>
      </section>

      <section id="jobs" className="mt-6 mb-8 scroll-mt-20">
        <p className="text-xs font-bold text-ink-500 mb-1.5">定時実行（毎日・毎月の仕事）</p>
        <Note>Vercel の定時実行が /api/cron/daily を日本時間 3・5・7・9・10・12・19・20・21時に呼び、時刻を過ぎた仕事を1日1回だけ行います。試すときは「今すぐ実行」を押してください。</Note>
        <ul className="card !p-0 divide-y divide-ink-100 mt-2">
          {JOBS.map((j) => {
            const last = runs.find((r) => r.jobKey === j.key);
            return (
              <li key={j.key} className="px-3 py-2.5 flex items-center gap-2">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-ink-900">{j.label}</span>
                  <span className="block text-[11px] text-ink-500">{j.when}</span>
                  {last && (
                    <span className={`block text-[11px] ${last.status === "error" ? "text-red-600" : "text-ink-500"}`}>
                      最後：{last.createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}・{last.detail || last.status}
                    </span>
                  )}
                </span>
                <form action={runJobNowAction}>
                  <input type="hidden" name="job" value={j.key} />
                  <button type="submit" className="btn-secondary btn-sm">
                    今すぐ実行
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
