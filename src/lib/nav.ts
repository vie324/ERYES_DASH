// 左サイドバーのメニュー定義。
// 「役割（管理者/スタッフ）× 業態（ENi/EREYS）× 職種（スタイリスト/アシスタント）」で
// 出す項目をここに集約する。画面側はこの定義を並べるだけにして、
// メニューの追加・並び替えがこのファイルだけで済むようにしている。

import type { IconName } from "@/components/icons";
import type { Brand } from "@/lib/brand";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** サイドバーに出す件数バッジ（0・nullなら出さない） */
  badge?: number | string | null;
  /** ホームのように、前方一致ではなく完全一致で「現在地」を判定する項目 */
  exact?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export type NavContext = {
  role: "admin" | "staff";
  brand: Brand;
  /** ENiの職種（未設定なら両方出す） */
  jobType?: "" | "stylist" | "assistant";
  /** 幹部（練習ペアの設定などが見られる） */
  isExecutive?: boolean;
  /** 打刻運用がONの店舗があるか */
  attendanceEnabled?: boolean;
  /** 件数バッジ（未確認カウンセリング・議事録未提出など） */
  badges?: Record<string, number | null | undefined>;
};

/** 0 と undefined はバッジを出さない */
function badge(n: number | null | undefined): number | null {
  return n && n > 0 ? n : null;
}

/** 空のグループを落とす */
function compact(groups: NavGroup[]): NavGroup[] {
  return groups.filter((g) => g.items.length > 0);
}

export function buildNav(ctx: NavContext): NavGroup[] {
  return ctx.role === "admin" ? adminNav(ctx) : staffNav(ctx);
}

// ---------------------------------------------------------------- スタッフ

function staffNav(ctx: NavContext): NavGroup[] {
  const b = ctx.badges ?? {};
  const home: NavGroup = {
    label: "ホーム",
    items: [{ href: "/staff", label: "ダッシュボード", icon: "layoutGrid", exact: true }],
  };
  const support: NavGroup = {
    label: "サポート",
    items: [{ href: "/staff/help", label: "使い方ガイド", icon: "help" }],
  };

  if (ctx.brand === "eyes") {
    return compact([
      home,
      {
        label: "接客・お客様",
        items: [
          {
            href: "/staff/counseling",
            label: "本日のカウンセリング",
            icon: "clipboard",
            badge: badge(b.counseling),
          },
          { href: "/staff/customers", label: "お客様のカルテ", icon: "user" },
        ],
      },
      {
        label: "記録・成績",
        items: [
          { href: "/staff/report", label: "日報を入力", icon: "pencil", badge: b.report ? "！" : null },
          { href: "/staff/reports", label: "過去の日報", icon: "book" },
          { href: "/staff/cash", label: "レジ締め・現金管理", icon: "banknote" },
          { href: "/staff/stats", label: "自分の成績", icon: "trendingUp" },
        ],
      },
      {
        label: "勤務",
        items: [
          { href: "/staff/schedule", label: "出勤スケジュール", icon: "calendar", badge: b.shift ? "！" : null },
          ...(ctx.attendanceEnabled
            ? [{ href: "/staff/attendance", label: "出勤・退勤の打刻", icon: "mapPin" as IconName }]
            : []),
        ],
      },
      support,
    ]);
  }

  // ENi（ヘアサロン）
  const showStylist = ctx.jobType !== "assistant";
  const showWeekly = ctx.jobType !== "stylist";
  return compact([
    home,
    {
      label: "日々の記録",
      items: [
        ...(showStylist
          ? [
              {
                href: "/staff/eni-report",
                label: "日報を入力",
                icon: "pencil" as IconName,
                badge: b.eniReport ? "！" : null,
              },
            ]
          : []),
        ...(showWeekly
          ? [
              {
                href: "/staff/weekly-report",
                label: "週報を入力",
                icon: "pencil" as IconName,
                badge: b.weeklyReport ? "！" : null,
              },
            ]
          : []),
        { href: "/staff/morning", label: "今日のスケジュール", icon: "clock", badge: b.plan ? "！" : null },
        { href: "/staff/ideal", label: "理想のスケジュール", icon: "sparkles" },
        { href: "/staff/eni-reports", label: "日報・週報を見る", icon: "fileText" },
      ],
    },
    {
      label: "チーム",
      items: [
        {
          href: "/staff/meetings",
          label: "ミーティング・議事録",
          icon: "users",
          badge: badge(b.minutes),
        },
        { href: "/staff/meetings/committees", label: "会議体の一覧", icon: "book" },
        { href: "/staff/org", label: "組織図", icon: "share" },
        ...(ctx.isExecutive
          ? [{ href: "/staff/practice", label: "練習ペアの設定", icon: "sparkles" as IconName }]
          : []),
      ],
    },
    {
      label: "勤務・申請",
      items: [
        { href: "/staff/schedule", label: "出勤スケジュール", icon: "calendar", badge: b.shift ? "！" : null },
        { href: "/staff/absence", label: "欠勤・早退の報告", icon: "alertTriangle" },
        { href: "/staff/orders", label: "発注・購入申請", icon: "banknote" },
      ],
    },
    support,
  ]);
}

// ---------------------------------------------------------------- 管理者

function adminNav(ctx: NavContext): NavGroup[] {
  const b = ctx.badges ?? {};
  const home: NavGroup = {
    label: "ホーム",
    items: [{ href: "/admin", label: "ダッシュボード", icon: "layoutGrid", exact: true }],
  };
  const support: NavGroup = {
    label: "サポート",
    items: [
      { href: "/admin/settings", label: "マスタ設定", icon: "sliders" },
      { href: "/admin/help", label: "使い方ガイド", icon: "help" },
    ],
  };

  if (ctx.brand === "eyes") {
    return compact([
      home,
      {
        label: "成績・売上",
        items: [
          { href: "/admin/reports", label: "成績・日報", icon: "barChart" },
          { href: "/admin/csv", label: "売上CSV出力", icon: "fileText" },
        ],
      },
      {
        label: "お客様",
        items: [
          {
            href: "/admin/counseling",
            label: "カウンセリング",
            icon: "clipboard",
            badge: badge(b.counseling),
          },
          { href: "/admin/customers", label: "顧客一覧", icon: "user" },
          {
            href: "/admin/appointments",
            label: "次回予約・リマインド",
            icon: "bell",
            badge: badge(b.appointments),
          },
          { href: "/admin/broadcast", label: "一斉配信", icon: "megaphone" },
        ],
      },
      {
        label: "勤務",
        items: [
          { href: "/admin/schedule", label: "出勤スケジュール", icon: "calendar" },
          ...(ctx.attendanceEnabled
            ? [{ href: "/admin/attendance", label: "勤怠管理", icon: "clock" as IconName }]
            : []),
        ],
      },
      support,
    ]);
  }

  // ENi（ヘアサロン）
  return compact([
    home,
    {
      label: "記録・育成",
      items: [
        { href: "/staff/eni-reports", label: "日報・週報を見る", icon: "fileText" },
        { href: "/staff/practice", label: "練習ペアの設定", icon: "sparkles" },
      ],
    },
    {
      label: "チーム",
      items: [
        {
          href: "/staff/meetings",
          label: "ミーティング・議事録",
          icon: "users",
          badge: badge(b.minutes),
        },
        { href: "/staff/meetings/committees", label: "会議体の一覧", icon: "book" },
        { href: "/staff/org", label: "組織図", icon: "share" },
      ],
    },
    {
      label: "勤務・申請",
      items: [
        { href: "/admin/schedule", label: "出勤スケジュール", icon: "calendar" },
        { href: "/staff/absence", label: "欠勤・早退の報告", icon: "alertTriangle" },
        { href: "/staff/orders", label: "発注・購入申請", icon: "banknote", badge: badge(b.orders) },
      ],
    },
    support,
  ]);
}

/** そのメニュー項目のページを開いているか（前方一致。exact指定は完全一致） */
function matches(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * いま開いている場所を1つだけ決める。
 * 例：/staff/meetings/committees は「ミーティング」と「会議体の一覧」の両方に前方一致するので、
 * より深く一致する（＝URLが長い）方だけを現在地にする。
 */
export function findCurrent(
  pathname: string,
  groups: NavGroup[]
): { group: string; item: NavItem } | null {
  let best: { group: string; item: NavItem } | null = null;
  for (const g of groups) {
    for (const item of g.items) {
      if (!matches(pathname, item)) continue;
      if (!best || item.href.length > best.item.href.length) {
        best = { group: g.label, item };
      }
    }
  }
  return best;
}
