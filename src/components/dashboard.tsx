// ホーム上部のダッシュボード。業態ごとに「今の進捗」がひと目で分かるようにする。
//  ・EREYS（アイサロン）：売上・客数・次回予約率・カウンセリング・日報の提出
//  ・ENi（ヘアサロン）：週報/日報の提出、練習時間、会議のタスク、議事録
// データ取得はこのファイル内で完結させ、ホーム側は <Dashboard brand=… /> を置くだけにする。

import Link from "next/link";
import { getDataStore } from "@/lib/data";
import {
  addDays,
  addMonths,
  formatMonthJa,
  jstDayBoundsUtc,
  monthRange,
  thisMonthJst,
  todayJst,
  weekStartOf,
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

export async function Dashboard({ brand }: { brand: Brand }) {
  return brand === "eyes" ? <EyesDashboard /> : <EniDashboard />;
}

/** 前月比（％）。前月が0のときは出さない */
function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// ================================================================ EREYS

async function EyesDashboard() {
  const db = getDataStore();
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
        />
        <StatTile
          label="今月の施術人数"
          value={kpi.totalClients}
          unit="人"
          delta={deltaPct(kpi.totalClients, prevKpi.totalClients)}
          sub={`新規 ${kpi.newClients}／既存 ${kpi.repeatClients}`}
        />
        <StatTile
          label="次回予約率"
          value={kpi.rebookRate === null ? "—" : `${Math.round(kpi.rebookRate * 100)}`}
          unit={kpi.rebookRate === null ? undefined : "%"}
          sub={`次回予約 ${kpi.nextBookings}件`}
          tone={kpi.rebookRate !== null && kpi.rebookRate >= 0.5 ? "good" : "default"}
        />
        <StatTile
          label="未確認のカウンセリング"
          value={counselingPending.length}
          unit="件"
          tone={counselingPending.length > 0 ? "warning" : "good"}
          sub={counselingPending.length > 0 ? "接客前に確認してください" : "すべて確認済みです"}
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

// ================================================================ ENi

async function EniDashboard() {
  const db = getDataStore();
  const today = todayJst();
  const month = thisMonthJst();
  const { from, to } = monthRange(month);
  const thisWeek = weekStartOf(today);

  const [staffList, weeklyReports, stylistReports, meetings, openTasks, plans] = await Promise.all([
    db.listStaff(),
    // 直近6週ぶんの週報（提出率と練習時間の推移に使う）
    db.listEniReports("weekly", { from: addDays(thisWeek, -35), to: thisWeek }),
    db.listEniReports("stylist", { from, to }),
    db.listMeetings({ from, to }),
    db.listOpenMeetingTasks(),
    db.listDailyPlans(today),
  ]);

  const active = staffList.filter((s) => s.isActive && s.jobType !== "");
  const assistants = active.filter((s) => s.jobType === "assistant");
  const stylists = active.filter((s) => s.jobType === "stylist");

  // 今週の週報の提出状況
  const thisWeekReports = weeklyReports.filter((r) => r.periodKey === thisWeek);
  // 今日のスタイリスト日報
  const todayStylist = stylistReports.filter((r) => r.periodKey === today);

  // 練習時間（週報の practice_hours / ウィッグ時間などを合算）の直近6週推移
  const weeks = Array.from({ length: 6 }, (_, i) => addDays(thisWeek, -35 + i * 7));
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const practiceOf = (a: Record<string, unknown>) =>
    num(a.practice_hours) + num(a.wig_hours) + num(a.other_hours);
  const practiceTrend = weeks.map((w) => {
    const rs = weeklyReports.filter((r) => r.periodKey === w);
    const hours = rs.reduce((s, r) => s + practiceOf(r.answers), 0);
    return {
      label: `${Number(w.slice(5, 7))}/${Number(w.slice(8, 10))}`,
      value: Math.round(hours * 10) / 10,
      hint: `提出 ${rs.length}名`,
    };
  });

  // メンバー別の今週の練習時間
  const practiceBars = assistants
    .map((s) => {
      const r = thisWeekReports.find((x) => x.staffId === s.id);
      return { name: s.name.split(" ")[0], value: r ? Math.round(practiceOf(r.answers) * 10) / 10 : 0 };
    })
    .sort((a, b) => b.value - a.value);

  // 会議・議事録・タスク
  const heldMeetings = meetings.filter((m) => m.meetingDate <= today);
  const minutesDone = heldMeetings.filter((m) => m.minutesDone).length;
  const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < today).length;

  // 今週の取り組み（モデル・SNSなど）の合計
  const totals = thisWeekReports.reduce(
    (acc, r) => {
      const a = r.answers;
      acc.model += num(a.model_count);
      acc.sns += num(a.sns_posts);
      acc.roleplay += num(a.roleplay_count);
      return acc;
    },
    { model: 0, sns: 0, roleplay: 0 }
  );

  return (
    <div className="space-y-3 mb-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatTile
          label="今週の週報（アシスタント）"
          value={`${thisWeekReports.length}/${assistants.length}`}
          unit="名"
          tone={
            assistants.length > 0 && thisWeekReports.length >= assistants.length ? "good" : "warning"
          }
          sub="今週分の提出状況"
        />
        <StatTile
          label="今週の練習時間（全員）"
          value={practiceTrend.at(-1)?.value ?? 0}
          unit="h"
          spark={practiceTrend.map((t) => t.value)}
          tone="accent"
          sub="モデル・ウィッグ・その他の合計"
        />
        <StatTile
          label="議事録の未提出"
          value={heldMeetings.length - minutesDone}
          unit="件"
          tone={heldMeetings.length - minutesDone > 0 ? "critical" : "good"}
          sub={`実施 ${heldMeetings.length}件中`}
        />
        <StatTile
          label="未完了のタスク"
          value={openTasks.length}
          unit="件"
          tone={overdue > 0 ? "critical" : openTasks.length > 0 ? "warning" : "good"}
          sub={overdue > 0 ? `うち期限切れ ${overdue}件` : "期限内です"}
        />
      </div>

      {/* 練習時間の推移 */}
      <ChartCard
        title="練習時間の推移（直近6週・全員の合計）"
        action={
          <Link href="/staff/eni-reports?tab=weekly" className="text-[11px] font-bold text-brand-700 underline">
            週報を見る
          </Link>
        }
      >
        <ColumnChart data={practiceTrend} format="hour" />
      </ChartCard>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* メンバー別 練習時間 */}
        <ChartCard title="今週の練習時間（メンバー別）">
          <HBarList data={practiceBars} format="hour" emptyText="今週の週報がまだありません" />
        </ChartCard>

        {/* 今週の取り組み */}
        <ChartCard title="今週の取り組み（全員の合計）">
          <CompositionBar
            format="number"
            parts={[
              { label: "モデル（人）", value: totals.model },
              { label: "SNS投稿（件）", value: totals.sns },
              { label: "ロープレ（回）", value: totals.roleplay },
            ]}
          />
        </ChartCard>
      </div>

      {/* 提出・実施の進捗 */}
      <ChartCard title="提出・実施の状況">
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5">
          <ProgressRing
            value={thisWeekReports.length}
            total={Math.max(assistants.length, 1)}
            label="今週の週報"
            sub="アシスタント"
          />
          <div className="flex-1 space-y-3">
            <Meter
              value={todayStylist.length}
              total={Math.max(stylists.length, 1)}
              label="本日の日報（スタイリスト）"
            />
            <Meter
              value={minutesDone}
              total={Math.max(heldMeetings.length, 1)}
              label="議事録の提出（今月の実施分）"
            />
            <Meter
              value={plans.length}
              total={Math.max(active.length, 1)}
              label="今日のスケジュール入力"
              hint="朝礼で全員が入力できているか"
            />
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
