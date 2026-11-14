// アプリ内のお知らせの共通の部品。

/** お知らせから移る先：アプリの中の画面（/staff/・/admin/）だけを受け付ける（外のサイトへは飛ばさない） */
export function safeInboxTarget(to: string | null): string {
  if (!to || !/^\/(staff|admin)(\/|$)/.test(to) || to.startsWith("//") || to.includes("\\")) return "/staff/inbox";
  return to;
}

/** お知らせを既読にしてから、その画面へ移るリンク */
export function openNotificationHref(n: { refId: string; href: string }): string {
  return `/staff/inbox/open?ref=${encodeURIComponent(n.refId)}&to=${encodeURIComponent(n.href)}`;
}
