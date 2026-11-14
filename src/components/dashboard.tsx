// ホーム上部のダッシュボード（EREYS）。「今の進捗」がひと目で分かるようにする。
//  ・EREYS（アイサロン）：売上・客数・次回予約率・カウンセリング・日報の提出
// ENi（ヘアサロン）のグラフは、ホームの作り直しで「4つのリマインド数字」と「見える化」に置き換えた
// （components/home/*）。データ取得はこのファイル内で完結させ、ホーム側は <Dashboard brand=… /> を置くだけにする。

import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { themeVars } from "@/lib/theme";
import {
  addDays,
  addMonths,
  formatMonthJa,
  jstDayBoundsUtc,
  monthRange,
  thisMonthJst,
  todayJst,
} from "@/lib/date";
import { formatYen, summarize, summarizeByStaff } from "@/lib/kpi";
import type { Brand } from "@/lib/brand";
import {
  ChartCard,
  ColumnChart,
  CompositionBar,
  HBarList,
  Meter,
  ProgressRing,
  StatTile,
} from "@/components/charts";

/** ダッシュボードを見ている人（誰の目線で数字を出すかを決める） */
export interface DashboardViewer {
  staffId: string;
  jobType: "" | "stylist" | "assistant";
  isExec: boolean;
  /** 配色キー（lib/theme.ts） */
  themeColor: string;
  /** 全体管理者（管理者画面の一覧へ飛ばす） */
  isAdmin?: boolean;
}

export async function Dashboard({ brand, viewer }: { brand: Brand; viewer: DashboardViewer }) {
  // ENi は作り直したホーム（components/home/eni-home.tsx）を使うので、ここでは何も出さない
  if (brand !== "eyes") return null;
  return (
    <div className="dash-themed" style={themeVars(viewer.themeColor)}>
      <EyesDashboard viewer={viewer} />
    </div>
  );
}

/** 前月比（％）。前月が0のときは出さない */
function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// ================================================================ EREYS

async function EyesDashboard({ viewer }: { viewer: DashboardViewer }) {
  const db = getDataStore();
  // タイルのタップ先：管理者は全体の一覧、スタッフは自分の画面へ
  const statsHref = viewer.isAdmin ? "/admin/reports" : "/staff/stats";
  const counselingHref = viewer.isAdmin ? "/admin/counseling" : "/staff/counseling";
  const today = todayJst();
  const month = thisMonthJst();
  const prevMonth = addMonths(month, -1);
  const { from, to } = monthRange(month);
  const prev = monthRange(prevMonth);
  // 直近6ヶ月ぶんをまとめて取り、月ごとに集計する
  const sixFrom = monthRange(addMonths(month, -5)).from;

  const [sixMonthReports, staffList, counselingPending, appointments] = await Promise.all([
    db.listDailyReports({ from: sixFrom, to }),
    db.listStaff(),
    db.listCounselingResponses({ status: "pending" }),
    db.listNextAppointments({ from: new Date() }),
  ]);

  const monthReports = sixMonthReports.filter((r) => r.reportDate >= from && r.reportDate <= to);
  const prevReports = sixMonthReports.filter((r) => r.reportDate >= prev.from && r.reportDate <= prev.to);
  const kpi = summarize(monthReports);
  const prevKpi = summarize(prevReports);

  // 月次の推移（直近6ヶ月）
  const months = Array.from({ length: 6 }, (_, i) => addMonths(month, -5 + i));
  const trend = months.map((m) => {
    const r = monthRange(m);
    const k = summarize(sixMonthReports.filter((x) => x.reportDate >= r.from && x.reportDate <= r.to));
    return { label: `${Number(m.slice(5))}月`, value: k.totalSales, hint: `施術 ${k.totalClients}人` };
  });

  // スタッフ別の今月売上（多い順・上位5名）
  const byStaff = summarizeByStaff(monthReports);
  const staffBars = [...byStaff.entries()]
    .map(([id, k]) => ({
      name: (staffList.find((s) => s.id === id)?.name ?? "？").split(" ")[0],
      value: k.totalSales,
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // 今日の日報の提出状況（有効なスタッフのうち何人が出したか）
  const activeStaff = staffList.filter((s) => s.isActive);
  const todayReports = monthReports.filter((r) => r.reportDate === today);

  // 明日のご予約（リマインド予定）と、お客様対応が必要な件数
  const tb = jstDayBoundsUtc(addDays(today, 1));
  const tomorrow = appointments.filter(
    (a) => a.status !== "cancelled" && a.scheduledAt >= tb.start && a.scheduledAt < tb.end
  );
  const needAttention = appointments.filter(
    (a) => a.status === "change_requested" || a.status === "cancelled"
  ).length;

  return (
    <div className="space-y-3 mb-5">
      {/* 見出しの数字 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatTile
          label={`今月の売上（${formatMonthJa(month)}）`}
          value={formatYen(kpi.totalSales)}
          delta={deltaPct(kpi.totalSales, prevKpi.totalSales)}
          tone="accent"
          spark={trend.map((t) => t.value)}
          sub={`前月 ${formatYen(prevKpi.totalSales)}`}
          href={statsHref}
        />
        <StatTile
          label="今月の施術人数"
          value={kpi.totalClients}
          unit="人"
          delta={deltaPct(kpi.totalClients, prevKpi.totalClients)}
          sub={`新規 ${kpi.newClients}／既存 ${kpi.repeatClients}`}
          href={statsHref}
        />
        <StatTile
          label="次回予約率"
          value={kpi.rebookRate === null ? "—" : `${Math.round(kpi.rebookRate * 100)}`}
          unit={kpi.rebookRate === null ? undefined : "%"}
          sub={`次回予約 ${kpi.nextBookings}件`}
          tone={kpi.rebookRate !== null && kpi.rebookRate >= 0.5 ? "good" : "default"}
          href={statsHref}
        />
        <StatTile
          label="未確認のカウンセリング"
          value={counselingPending.length}
          unit="件"
          tone={counselingPending.length > 0 ? "warning" : "good"}
          sub={counselingPending.length > 0 ? "接客前に確認してください" : "すべて確認済みです"}
          href={counselingHref}
        />
      </div>

      {/* 売上の推移 */}
      <ChartCard
        title="売上の推移（直近6ヶ月）"
        action={
          <Link href="/admin/reports" className="text-[11px] font-bold text-brand-700 underline">
            詳しく見る
          </Link>
        }
      >
        <ColumnChart data={trend} format="yen" />
      </ChartCard>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* 売上の内訳 */}
        <ChartCard title={`売上の内訳（${formatMonthJa(month)}）`}>
          <CompositionBar
            parts={[
              { label: "技術売上", value: kpi.serviceSales },
              { label: "オプション", value: kpi.optionSales },
              { label: "物販", value: kpi.retailSales },
            ]}
          />
        </ChartCard>

        {/* スタッフ別 */}
        <ChartCard title="スタッフ別の今月売上">
          <HBarList data={staffBars} format="yen" emptyText="今月の日報がまだありません" />
        </ChartCard>
      </div>

      {/* 進捗（今日の提出・明日の予約） */}
      <ChartCard title="今日の状況">
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5">
          <ProgressRing
            value={todayReports.length}
            total={Math.max(activeStaff.length, 1)}
            label="本日の日報提出"
            sub="スタッフ人数に対して"
          />
          <div className="flex-1 space-y-3">
            <Meter
              value={tomorrow.length}
              total={Math.max(tomorrow.length, 1)}
              label="明日のリマインド予定"
              hint="毎日19時に自動送信されます"
            />
            <div className="flex items-center gap-2 text-[11px]">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: needAttention > 0 ? "#f59e0b" : "#059669" }}
              />
              <span className="font-bold text-ink-700">
                {needAttention > 0
                  ? `お客様からの変更希望・キャンセル ${needAttention}件`
                  : "お客様からの変更希望はありません"}
              </span>
              {needAttention > 0 && (
                <Link href="/admin/appointments" className="ml-auto font-bold text-brand-700 underline">
                  対応する
                </Link>
              )}
            </div>
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
