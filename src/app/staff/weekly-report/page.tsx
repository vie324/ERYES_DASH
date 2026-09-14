import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addDays, formatWeekJa, todayJst, weekStartOf, weekdayOf } from "@/lib/date";
import { getWeeklyItems, RANK_LABEL } from "@/lib/eni/forms";
import { EniFormFields } from "@/components/eni-form-fields";
import { AssistantSettingsPanel } from "@/components/assistant-settings";
import { PageHeader } from "@/components/ui";
import { ReportComments } from "@/components/report-comments";
import { saveWeeklyReportAction } from "./actions";

// アシスタント週報（ENi）：ランク（ファースト/ミドル/ファイナル）ごとに項目が変わる。
// 練習は毎日入力をやめ、この週報の中でまとめて振り返る。
export default async function WeeklyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const today = todayJst();
  const thisWeek = weekStartOf(today);
  const lastWeek = addDays(thisWeek, -7);
  // 週の頭（月〜水）に書くときは、たいてい「終わったばかりの先週」の振り返り。
  // 何も指定がなければそちらを初期表示にする（月曜に書くと今週になってしまう、という声への対応）。
  const weekday = weekdayOf(today); // 0=日
  const defaultWeek = weekday >= 1 && weekday <= 3 ? lastWeek : thisWeek;
  const week =
    /^\d{4}-\d{2}-\d{2}$/.test(params.week ?? "") && weekStartOf(params.week!) === params.week
      ? params.week!
      : defaultWeek;

  const db = getDataStore();
  const [me, existing, settings] = await Promise.all([
    db.getStaff(session.staffId),
    db.getEniReport("weekly", session.staffId, week),
    db.listAssistantSettings(session.staffId),
  ]);
  // ついたコメント（先輩・幹部が何人でも書ける）
  const [reportComments, staffList] = await Promise.all([
    existing ? db.listEniReportComments([existing.id]) : Promise.resolve([]),
    db.listStaff(),
  ]);
  const staffNames = new Map(staffList.map((s) => [s.id, s.name]));
  const rank = me?.rank ?? "";
  const items = getWeeklyItems(rank);
  // 常時表示される設定（ピラミッド・年内目標・約束・デビュー設定）
  const settingValues: Record<string, string> = {};
  for (const s of settings) settingValues[s.settingKey] = s.content;

  return (
    <div className="page-narrow">
      <PageHeader
        title="週報を入力（アシスタント）"
        backHref="/staff"
        actions={
          <Link href="/staff/eni-reports?tab=weekly" className="chip !py-2.5 !px-4">
            みんなの週報を見る
          </Link>
        }
      />

      {params.saved === "settings" ? (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          設定を保存しました
        </p>
      ) : params.saved ? (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          保存しました（{formatWeekJa(week)} の週報）
        </p>
      ) : null}
      {params.error === "future" && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          未来の週には入力できません
        </p>
      )}
      {params.error === "input" && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          入力内容を確認してください
        </p>
      )}

      {rank !== "" ? (
        <p className="rounded-xl bg-brand-50 text-brand-800 text-xs font-bold px-4 py-2 mb-4 inline-block">
          あなたのランク：{RANK_LABEL[rank]}（この週報はランクに合わせた項目です）
        </p>
      ) : (
        <p className="rounded-xl bg-ink-100 text-ink-600 text-xs font-bold px-4 py-2 mb-4">
          ランク（ファースト／ミドル／ファイナル）はまだ登録されていません。
          ランクは管理者がマスタ設定で登録し、ランクに合わせて週報の項目が変わります。
        </p>
      )}

      <AssistantSettingsPanel
        rank={rank}
        staffName={(me?.name ?? "").split(" ")[0] || "あなた"}
        values={settingValues}
      />

      <ReportComments
        comments={reportComments}
        staffNames={staffNames}
        legacyComment={existing?.comment}
        legacyCommentedBy={existing?.commentedBy}
      />

      {/* 週の切り替え。どの週の分を書いているのかを最初に決めてもらう */}
      <p className="text-xs font-bold text-ink-500 mb-1.5">どの週の週報を書きますか？</p>
      <div className="flex items-center justify-between card !py-2 mb-2">
        <Link href={`/staff/weekly-report?week=${addDays(week, -7)}`} className="px-4 py-2 font-bold text-brand-500 text-lg" aria-label="前の週">
          ←
        </Link>
        <span className="font-display font-bold text-sm">
          {formatWeekJa(week)}
          {week === thisWeek && <span className="text-brand-600 ml-1">（今週）</span>}
          {week === lastWeek && <span className="text-brand-600 ml-1">（先週）</span>}
        </span>
        {week < thisWeek ? (
          <Link href={`/staff/weekly-report?week=${addDays(week, 7)}`} className="px-4 py-2 font-bold text-brand-500 text-lg" aria-label="次の週">
            →
          </Link>
        ) : (
          <span className="px-4 py-2 text-ink-300 text-lg">→</span>
        )}
      </div>
      <div className="flex gap-2 mb-4">
        <Link
          href={`/staff/weekly-report?week=${lastWeek}`}
          className={`chip flex-1 !justify-center ${week === lastWeek ? "border-brand-400 bg-brand-50 text-brand-800" : ""}`}
        >
          先週の分
        </Link>
        <Link
          href={`/staff/weekly-report?week=${thisWeek}`}
          className={`chip flex-1 !justify-center ${week === thisWeek ? "border-brand-400 bg-brand-50 text-brand-800" : ""}`}
        >
          今週の分
        </Link>
      </div>

      <form action={saveWeeklyReportAction} className="space-y-4">
        <input type="hidden" name="week_start" value={week} />
        {existing && (
          <p className="text-xs text-amber-600 font-bold">この週は入力済みです。保存すると上書きされます。</p>
        )}

        <p className="text-xs text-ink-500">
          書けるところだけでOKです（空欄のままでも保存できます）。
        </p>
        <EniFormFields items={items} answers={existing?.answers ?? {}} />

        <div className="form-actions">
          <button type="submit" className="btn-primary w-full text-lg">
            {existing ? "上書き保存する" : "週報を保存する"}
          </button>
        </div>
      </form>
    </div>
  );
}
