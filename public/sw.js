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
  // アプリアイコンのバッジ（対応端末のみ）。件数が来なければ「点」だけ付ける
  if (self.navigator && typeof self.navigator.setAppBadge === "function") {
    jobs.push(
      (typeof data.badge === "number"
        ? self.navigator.setAppBadge(data.badge)
        : self.navigator.setAppBadge()
      ).catch(() => {})
    );
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
