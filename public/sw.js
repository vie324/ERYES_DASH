// サービスワーカー：プッシュ通知の受信と、アプリアイコンのバッジ更新だけを担当する。
// オフラインキャッシュはしない（常に最新の画面を出すため）。
// 通知の中身（title/body/url/tag/badge）はサーバー（src/lib/push/notify.ts）が決める。

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "ENi";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || "/staff" },
  };
  const jobs = [self.registration.showNotification(title, options)];
  // アプリアイコンのバッジ（対応端末のみ）。
  // 件数が通知に入っていればそれを、入っていなければサーバーに聞き直して数字を合わせる
  // （未読のトーク＋今日の未完了のタスク・ルーティン。聞けなかったときは「点」だけ付ける）
  if (self.navigator && typeof self.navigator.setAppBadge === "function") {
    jobs.push(updateBadge(typeof data.badge === "number" ? data.badge : null));
  }
  event.waitUntil(Promise.all(jobs));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/staff";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

/** バッジの数字を付ける（null ならサーバーの /api/push/badge に聞く） */
async function updateBadge(count) {
  try {
    let n = count;
    if (n === null) {
      const res = await fetch("/api/push/badge", { credentials: "same-origin", cache: "no-store" });
      n = res.ok ? Number((await res.json()).count) : NaN;
    }
    if (Number.isFinite(n) && n > 0) await self.navigator.setAppBadge(n);
    else if (Number.isFinite(n) && n <= 0 && typeof self.navigator.clearAppBadge === "function") await self.navigator.clearAppBadge();
    else await self.navigator.setAppBadge();
  } catch {
    try {
      await self.navigator.setAppBadge();
    } catch {
      // 未対応の端末
    }
  }
}
