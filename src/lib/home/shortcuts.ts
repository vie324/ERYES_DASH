// ホームのショートカット（iPhoneのホーム画面のようなアイコンの並び）。
// 中身は今あるメニューへのリンク。並べるものと順番は、管理者がロールごとに設定できる
// （管理者画面 → ホームの設定。保存先は app_settings の home_shortcuts）。
// 見る権限のない画面（幹部メニュー・組織図など）は、設定に入っていても出さない。

import type { IconName } from "@/components/icons";
import type { MenuAccent } from "@/lib/menu-accent";

/** ショートカットの設定をロールごとに分ける単位 */
export type HomeRole = "admin" | "exec" | "stylist" | "assistant" | "other";

export const HOME_ROLES: HomeRole[] = ["admin", "exec", "stylist", "assistant", "other"];

export const HOME_ROLE_LABEL: Record<HomeRole, string> = {
  admin: "管理者",
  exec: "幹部（店長・副店長）",
  stylist: "スタイリスト",
  assistant: "アシスタント",
  other: "そのほか（職種なし）",
};

/** バッジ（小さな数字）の出どころ。lib/home/badges.ts で数える */
export type ShortcutBadgeKey =
  | "tasks"
  | "chat"
  | "eniReport"
  | "weeklyReport"
  | "plan"
  | "meetings"
  | "schedule"
  | "exec";

export interface ShortcutDef {
  key: string;
  label: string;
  href: string;
  icon: IconName;
  accent: MenuAccent;
  badge?: ShortcutBadgeKey;
  /**
   * 見られる人。省略は全員。
   * exec＝幹部・管理者／stylist・assistant＝その職種（職種なしの人と管理者にも出せる）／
   * member＝職種のある人か幹部・管理者（日報・週報の一覧など）
   */
  only?: "exec" | "stylist" | "assistant" | "member";
}

/** 並べられるショートカット（今あるメニュー）。足すときはここに1つ足す */
export const SHORTCUT_CATALOG: ShortcutDef[] = [
  { key: "eniReport", label: "日報", href: "/staff/eni-report", icon: "pencil", accent: "coral", badge: "eniReport", only: "stylist" },
  { key: "weeklyReport", label: "週報", href: "/staff/weekly-report", icon: "pencil", accent: "rose", badge: "weeklyReport", only: "assistant" },
  { key: "tasks", label: "タスク", href: "/staff/tasks", icon: "listTodo", accent: "sky", badge: "tasks" },
  { key: "plan", label: "予定", href: "/staff/plan", icon: "calendar", accent: "teal", badge: "plan" },
  { key: "teamPlan", label: "みんなの予定", href: "/staff/plan?tab=team", icon: "users", accent: "teal" },
  { key: "chat", label: "トーク", href: "/staff/chat", icon: "chat", accent: "indigo", badge: "chat" },
  { key: "practice", label: "練習時間", href: "/staff/practice", icon: "clock", accent: "gold" },
  { key: "meetings", label: "議事録", href: "/staff/meetings", icon: "users", accent: "sage", badge: "meetings" },
  { key: "eniReports", label: "日報週報", href: "/staff/eni-reports", icon: "fileText", accent: "clay", only: "member" },
  { key: "thanks", label: "社内SNS", href: "/staff/sns", icon: "heart", accent: "plum" },
  { key: "events", label: "全体予定", href: "/staff/plan?tab=all", icon: "megaphone", accent: "lavender" },
  { key: "schedule", label: "シフト", href: "/staff/schedule", icon: "calendar", accent: "lavender", badge: "schedule" },
  { key: "aiShimon", label: "AIしもん", href: "/staff/ai-shimon", icon: "bot", accent: "gold" },
  { key: "orders", label: "発注", href: "/staff/orders", icon: "banknote", accent: "clay" },
  { key: "exec", label: "幹部", href: "/staff/exec", icon: "crown", accent: "coral", badge: "exec", only: "exec" },
  { key: "org", label: "組織図", href: "/staff/org", icon: "share", accent: "teal", only: "exec" },
  { key: "absence", label: "欠勤報告", href: "/staff/absence", icon: "alertTriangle", accent: "rose", only: "exec" },
  { key: "notifications", label: "通知設定", href: "/staff/notifications", icon: "bell", accent: "sky" },
  { key: "help", label: "使い方", href: "/staff/help", icon: "help", accent: "indigo" },
];

/**
 * 初期値（よく使いそうなもの。1行4つ×2行）。ENiに見てもらって、管理者画面で変えてもらう前提。
 * スタイリストは日報・お客様まわり、アシスタントは週報・練習、幹部は幹部メニュー・組織図を先頭に。
 */
export const DEFAULT_SHORTCUTS: Record<HomeRole, string[]> = {
  admin: ["eniReports", "exec", "tasks", "chat", "meetings", "events", "org", "teamPlan"],
  exec: ["exec", "eniReport", "tasks", "plan", "chat", "meetings", "eniReports", "org"],
  stylist: ["eniReport", "tasks", "plan", "chat", "meetings", "eniReports", "thanks", "aiShimon"],
  assistant: ["weeklyReport", "practice", "tasks", "plan", "chat", "meetings", "thanks", "aiShimon"],
  other: ["tasks", "plan", "chat", "meetings", "thanks", "schedule", "aiShimon", "help"],
};

/** ショートカットの設定を保存する app_settings のキー（値はロール→キーの並びのJSON） */
export const HOME_SHORTCUTS_KEY = "home_shortcuts";

/** 見ている人のロール（管理者 → 幹部 → 職種 → そのほか の順に決める） */
export function homeRoleOf(viewer: { isAdmin: boolean; isExec: boolean; jobType: string }): HomeRole {
  if (viewer.isAdmin) return "admin";
  if (viewer.isExec) return "exec";
  if (viewer.jobType === "stylist") return "stylist";
  if (viewer.jobType === "assistant") return "assistant";
  return "other";
}

/**
 * 保存されたJSONのうち、管理者が変えたロールの分だけ（壊れていたり、知らないキーが入っていたりしても、使える分だけ使う）。
 * 変えていないロールは入らない（初期値を変えたとき、そのロールにはそのまま新しい初期値が効く）。
 */
export function storedShortcutOverrides(raw: string | undefined | null): Partial<Record<HomeRole, string[]>> {
  const result: Partial<Record<HomeRole, string[]>> = {};
  if (!raw) return result;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return result;
    for (const role of HOME_ROLES) {
      const list = parsed[role];
      if (Array.isArray(list)) result[role] = normalizeShortcutKeys(list);
    }
  } catch {
    // 壊れた設定は初期値に戻す
  }
  return result;
}

/** ロールごとの並び（変えていないロールは初期値） */
export function parseShortcutSettings(raw: string | undefined | null): Record<HomeRole, string[]> {
  return { ...DEFAULT_SHORTCUTS, ...storedShortcutOverrides(raw) };
}

/** 並びを、カタログにあるキーだけ・重複なしにそろえる */
export function normalizeShortcutKeys(list: unknown[]): string[] {
  const known = new Set(SHORTCUT_CATALOG.map((s) => s.key));
  return [...new Set(list.map(String).filter((k) => known.has(k)))].slice(0, 16);
}

/** その人に見せてよいショートカットか（設定に入っていても、権限のない画面は出さない） */
export function canUseShortcut(def: ShortcutDef, viewer: { isExec: boolean; jobType: string }): boolean {
  if (def.only === "exec") return viewer.isExec;
  if (def.only === "member") return viewer.isExec || viewer.jobType !== "";
  if (def.only === "stylist") return viewer.jobType === "stylist" || viewer.jobType === "";
  if (def.only === "assistant") return viewer.jobType === "assistant" || viewer.jobType === "";
  return true;
}

/** 見ている人のホームに並べるショートカット（設定の順番どおり、権限で絞ったもの） */
export function shortcutsFor(
  settings: Record<HomeRole, string[]>,
  viewer: { isAdmin: boolean; isExec: boolean; jobType: string }
): ShortcutDef[] {
  const role = homeRoleOf(viewer);
  const byKey = new Map(SHORTCUT_CATALOG.map((s) => [s.key, s]));
  return settings[role]
    .map((key) => byKey.get(key))
    .filter((def): def is ShortcutDef => Boolean(def) && canUseShortcut(def!, viewer));
}
