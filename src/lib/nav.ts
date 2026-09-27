// 左サイドバーのメニュー定義。
// 「役割（管理者/スタッフ）× 業態（ENi/EREYS）× 職種（スタイリスト/アシスタント）」で
// 出す項目をここに集約する。画面側はこの定義を並べるだけにして、
// メニューの追加・並び替えがこのファイルだけで済むようにしている。
//
// メニュー（PCのサイドバー・スマホの「メニュー」）は上から
//   ホーム（homeNavItem）→ 外部サービスのタイル（buildMenuShortcuts）→ 各グループ（buildNav）
// の順に並ぶ。スマホの下部タブ（buildMobileTabs）は、この中から毎日さわるものだけを選ぶ。

import type { IconName } from "@/components/icons";
import type { Brand } from "@/lib/brand";
import type { MenuAccent } from "@/lib/menu-accent";

export type NavItem = {
  href: string;
  label: string;
  /** スマホの下部タブ・メニューのタイル用の短い呼び名（未指定なら label をそのまま使う） */
  short?: string;
  icon: IconName;
  /** サイドバーに出す件数バッジ（0・nullなら出さない） */
  badge?: number | string | null;
  /** ホームのように、前方一致ではなく完全一致で「現在地」を判定する項目 */
  exact?: boolean;
  /** 外部サイト（サロンボード・カミキュラムなど）。新しいタブで開き、現在地の判定はしない */
  external?: boolean;
  /** メニューのタイルに出すときの色（ホームのメニューと同じ色の決まり） */
  accent?: MenuAccent;
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
  /** 外部サービスのURL（マスタ設定）。未指定のときだけ案内ページに逃がす */
  links?: { salonBoardUrl: string; curriculumUrl: string };
};

/** 0 と undefined はバッジを出さない */
function badge(n: number | null | undefined): number | null {
  return n && n > 0 ? n : null;
}

/** 空のグループを落とす */
function compact(groups: NavGroup[]): NavGroup[] {
  return groups.filter((g) => g.items.length > 0);
}

/**
 * ノーション（考え方・ルール・マニュアルの置き場）。
 * 接続先が複数あるので、メニューからは入口のページに飛ばして、そこで選んでもらう。
 */
const NOTION_ITEM: NavItem = {
  href: "/staff/notion",
  label: "ノーション（考え方・マニュアル）",
  short: "ノーション",
  icon: "notion",
};

/** カミキュラム（動画教材）。既定は app.kamiculum.com。URLを取れなかったときだけ案内ページ（/staff/curriculum）へ逃がす */
function curriculumItem(ctx: NavContext): NavItem {
  const curriculumUrl = ctx.links?.curriculumUrl ?? "";
  return curriculumUrl
    ? { href: curriculumUrl, label: "カミキュラム（動画教材）", short: "カミキュラム", icon: "play", external: true }
    : { href: "/staff/curriculum", label: "カミキュラム（動画教材）", short: "カミキュラム", icon: "play" };
}

/** AIしもん（ENi共通の「学び・相談」グループ。カミキュラムは外部サービスのタイルに置く） */
function learningGroup(): NavGroup {
  return {
    label: "学び・相談",
    items: [{ href: "/staff/ai-shimon", label: "AIしもん（壁打ち相談）", short: "AIしもん", icon: "bot" }],
  };
}

/**
 * メニューのいちばん上に置く「ホーム」。
 * スマホの下部タブからは外して（枠を毎日の入力・連絡に回すため）、メニューを開いてすぐの位置に置く。
 * ヘッダーのロゴからも戻れる。
 */
export function homeNavItem(ctx: NavContext): NavItem {
  return {
    href: ctx.role === "admin" ? "/admin" : "/staff",
    label: "ホーム",
    icon: "home",
    exact: true,
  };
}

/**
 * メニューのホームの下に並べる「外部サービス」のタイル（PCのサイドバーも同じ）。
 * サロンボード・ノーション（ENiはカミキュラムも）は開く回数は多いが入力はしないので、
 * 下部タブではなく、メニューを開いてすぐ押せるここにまとめている。
 */
export function buildMenuShortcuts(ctx: NavContext): NavItem[] {
  const salonBoardUrl = ctx.links?.salonBoardUrl || "https://salonboard.com/login/";
  return [
    { href: salonBoardUrl, label: "サロンボード", icon: "link", external: true, accent: "sky" },
    { ...NOTION_ITEM, accent: "indigo" },
    ...(ctx.brand === "eni" ? [{ ...curriculumItem(ctx), accent: "coral" as MenuAccent }] : []),
  ];
}

export function buildNav(ctx: NavContext): NavGroup[] {
  return ctx.role === "admin" ? adminNav(ctx) : staffNav(ctx);
}

// ---------------------------------------------------------------- スタッフ

function staffNav(ctx: NavContext): NavGroup[] {
  const b = ctx.badges ?? {};
  const support: NavGroup = {
    label: "サポート",
    items: [{ href: "/staff/help", label: "使い方ガイド", short: "使い方", icon: "help" }],
  };

  // 幹部だけに出す「幹部」グループ（幹部タスク・日報の気づきをまとめる）
  const execGroup: NavGroup = {
    label: "幹部",
    items: ctx.isExecutive
      ? [
          {
            href: "/staff/exec",
            label: "幹部メニュー",
            short: "幹部",
            icon: "crown",
            badge: badge(b.exec),
          },
        ]
      : [],
  };

  if (ctx.brand === "eyes") {
    return compact([
      {
        label: "接客・お客様",
        items: [
          {
            href: "/staff/counseling",
            label: "本日のカウンセリング",
            short: "カウンセ",
            icon: "clipboard",
            badge: badge(b.counseling),
          },
          { href: "/staff/customers", label: "お客様のカルテ", icon: "user" },
        ],
      },
      {
        label: "記録・成績",
        items: [
          { href: "/staff/report", label: "日報を入力", short: "日報", icon: "pencil", badge: b.report ? "！" : null },
          { href: "/staff/reports", label: "過去の日報", icon: "book" },
          { href: "/staff/cash", label: "レジ締め・現金管理", icon: "banknote" },
          { href: "/staff/stats", label: "自分の成績", icon: "trendingUp" },
        ],
      },
      {
        label: "チーム",
        items: [
          { href: "/staff/tasks", label: "タスク", icon: "listTodo", badge: badge(b.tasks) },
          { href: "/staff/chat", label: "トークルーム", short: "トーク", icon: "chat", badge: badge(b.chat) },
          { href: "/staff/thanks", label: "サンクスカード", short: "サンクス", icon: "heart" },
          { href: "/staff/events", label: "会社の予定・イベント", short: "予定", icon: "calendar" },
        ],
      },
      execGroup,
      {
        label: "勤務",
        items: [
          { href: "/staff/schedule", label: "出勤スケジュール", short: "シフト", icon: "calendar", badge: b.shift ? "！" : null },
          ...(ctx.attendanceEnabled
            ? [{ href: "/staff/attendance", label: "出勤・退勤の打刻", short: "打刻", icon: "mapPin" as IconName }]
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
    {
      label: "日々の記録",
      items: [
        ...(showStylist
          ? [
              {
                href: "/staff/eni-report",
                label: "日報を入力",
                short: "日報",
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
                short: "週報",
                icon: "pencil" as IconName,
                badge: b.weeklyReport ? "！" : null,
              },
            ]
          : []),
        { href: "/staff/tasks", label: "タスク", icon: "listTodo", badge: badge(b.tasks) },
        // 「今日の予定」と「計画」は1つの画面にまとめた
        { href: "/staff/plan", label: "スケジュール", short: "予定", icon: "calendar", badge: b.plan ? "！" : null },
      ],
    },
    {
      label: "チーム",
      items: [
        { href: "/staff/chat", label: "トークルーム", short: "トーク", icon: "chat", badge: badge(b.chat) },
        { href: "/staff/thanks", label: "サンクスカード", short: "サンクス", icon: "heart" },
        {
          href: "/staff/meetings",
          label: "ミーティング・議事録",
          short: "議事録",
          icon: "users",
          badge: badge(b.minutes),
        },
        { href: "/staff/meetings/committees", label: "会議体の一覧", icon: "book" },
        { href: "/staff/events", label: "会社の予定・イベント", short: "予定", icon: "calendar" },
        // 組織図は管理者・幹部のみ（それ以外には見せない）
        ...(ctx.isExecutive
          ? [
              { href: "/staff/org", label: "組織図", icon: "share" as IconName },
            ]
          : []),
      ],
    },
    execGroup,
    {
      label: "勤務・申請",
      items: [
        { href: "/staff/schedule", label: "出勤スケジュール", short: "シフト", icon: "calendar", badge: b.shift ? "！" : null },
        // 欠勤・早退の報告は幹部以上が対応するので、一般スタッフには出さない
        ...(ctx.isExecutive
          ? [{ href: "/staff/absence", label: "欠勤・早退の報告", icon: "alertTriangle" as IconName }]
          : []),
        { href: "/staff/orders", label: "発注・購入申請", icon: "banknote" },
      ],
    },
    learningGroup(),
    support,
  ]);
}

// ---------------------------------------------------------------- 管理者

function adminNav(ctx: NavContext): NavGroup[] {
  const b = ctx.badges ?? {};
  const support: NavGroup = {
    label: "サポート",
    items: [
      { href: "/admin/help", label: "使い方ガイド", short: "使い方", icon: "help" },
      { href: "/admin/settings", label: "マスタ設定", icon: "sliders" },
    ],
  };
  // 管理者は常に幹部メニューが見られる
  const execGroup: NavGroup = {
    label: "幹部",
    items: [
      {
        href: "/staff/exec",
        label: "幹部メニュー",
        short: "幹部",
        icon: "crown",
        badge: badge(b.exec),
      },
    ],
  };

  if (ctx.brand === "eyes") {
    return compact([
      {
        label: "成績・売上",
        items: [
          { href: "/admin/reports", label: "成績・日報", short: "成績", icon: "barChart" },
          { href: "/admin/csv", label: "売上CSV出力", icon: "fileText" },
        ],
      },
      {
        label: "お客様",
        items: [
          {
            href: "/admin/counseling",
            label: "カウンセリング",
            short: "カウンセ",
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
        label: "チーム",
        items: [
          { href: "/staff/tasks", label: "タスク", icon: "listTodo", badge: badge(b.tasks) },
          { href: "/staff/chat", label: "トークルーム", short: "トーク", icon: "chat", badge: badge(b.chat) },
          { href: "/staff/thanks", label: "サンクスカード", short: "サンクス", icon: "heart" },
          { href: "/staff/events", label: "会社の予定・イベント", short: "予定", icon: "calendar" },
        ],
      },
      execGroup,
      {
        label: "勤務",
        items: [
          { href: "/admin/schedule", label: "出勤スケジュール", short: "シフト", icon: "calendar" },
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
    {
      label: "記録・育成",
      items: [
        { href: "/staff/eni-reports", label: "みんなの日報・週報を見る", short: "日報週報", icon: "fileText" },
        // 管理者は自分の予定より全員の予定を見ることが多いので、スケジュールの「みんなの予定」を開く
        { href: "/staff/plan?tab=team", label: "みんなの予定を見る", short: "予定", icon: "calendar" },
      ],
    },
    {
      label: "チーム",
      items: [
        { href: "/staff/tasks", label: "タスク", icon: "listTodo", badge: badge(b.tasks) },
        { href: "/staff/chat", label: "トークルーム", short: "トーク", icon: "chat", badge: badge(b.chat) },
        { href: "/staff/thanks", label: "サンクスカード", short: "サンクス", icon: "heart" },
        {
          href: "/staff/meetings",
          label: "ミーティング・議事録",
          short: "議事録",
          icon: "users",
          badge: badge(b.minutes),
        },
        { href: "/staff/meetings/committees", label: "会議体の一覧", icon: "book" },
        { href: "/staff/events", label: "会社の予定・イベント", short: "予定", icon: "calendar" },
        { href: "/staff/org", label: "組織図", icon: "share" },
      ],
    },
    execGroup,
    {
      label: "勤務・申請",
      items: [
        { href: "/admin/schedule", label: "出勤スケジュール", short: "シフト", icon: "calendar" },
        { href: "/staff/absence", label: "欠勤・早退の報告", icon: "alertTriangle" },
        { href: "/staff/orders", label: "発注・購入申請", icon: "banknote", badge: badge(b.orders) },
      ],
    },
    learningGroup(),
    support,
  ]);
}

/**
 * スマホの下部タブ（親指で届く位置）に置く項目。「メニュー」は画面側で右端に足す。
 * 枠は「毎日さわる・件数バッジで知らせたい」ものだけに絞る（ホームと外部サービスはメニューの先頭へ）。
 *  ・ENi …… トーク・週報（スタイリストは日報／管理者は日報週報）・予定・タスク・AIしもん
 *  ・EREYS …… 現場で1日に触る回数が多い順に3つ＋トーク
 */
export function buildMobileTabs(ctx: NavContext): NavItem[] {
  const groups = buildNav(ctx);
  const all = groups.flatMap((g) => g.items);
  const pick = (href: string) => all.find((i) => i.href === href);
  const present = (items: (NavItem | undefined)[]) => items.filter((i): i is NavItem => Boolean(i));

  if (ctx.brand === "eni") {
    // 週報の枠：アシスタント（と職種未設定）は週報、スタイリストは日報、管理者は全員分の閲覧
    const report =
      ctx.role === "admin"
        ? pick("/staff/eni-reports")
        : ctx.jobType === "stylist"
          ? pick("/staff/eni-report")
          : pick("/staff/weekly-report");
    const plan = ctx.role === "admin" ? pick("/staff/plan?tab=team") : pick("/staff/plan");
    return present([pick("/staff/chat"), report, plan, pick("/staff/tasks"), pick("/staff/ai-shimon")]);
  }

  const wanted =
    ctx.role === "admin"
      ? ["/admin/reports", "/admin/counseling", "/admin/schedule"]
      : ["/staff/counseling", "/staff/report", "/staff/attendance", "/staff/schedule"];

  return [...present(wanted.map(pick)).slice(0, 3), ...present([pick("/staff/chat")])];
}

/** そのメニュー項目のページを開いているか（前方一致。exact指定は完全一致。外部リンクは常に false） */
export function matchesNav(pathname: string, item: NavItem): boolean {
  if (item.external) return false;
  // 「?tab=team」のように画面の中のタブを指定している項目も、パスだけで判定する
  const path = item.href.split("?")[0];
  if (item.exact) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
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
      if (!matchesNav(pathname, item)) continue;
      if (!best || item.href.length > best.item.href.length) {
        best = { group: g.label, item };
      }
    }
  }
  return best;
}
