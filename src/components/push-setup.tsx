"use client";

// 通知（Web Push）の設定とアプリアイコンのバッジ。
//  ・画面を開くたびにバッジ（未読トーク＋今日のタスク）を端末に反映する
//  ・通知がまだ許可されていなければ、ひかえめな案内を出して「オンにする」で購読する
//  ・iPhoneは「ホーム画面に追加」したアプリからでないと通知をオンにできないので、その案内を出す
// サーバーの購読情報は /api/push/subscribe に保存し、以後はサーバー側から通知が届く。

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";

const DISMISS_KEY = "push-setup-dismissed-until";
const SYNC_KEY = "push-subscription-synced-at";

type State = "idle" | "ask" | "ios-hint" | "working" | "done" | "denied";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function PushSetup({ publicKey, badgeCount }: { publicKey: string; badgeCount: number }) {
  const [state, setState] = useState<State>("idle");

  // バッジ：対応端末なら件数を反映（0なら消す）
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    try {
      if (badgeCount > 0) nav.setAppBadge?.(badgeCount).catch(() => {});
      else nav.clearAppBadge?.().catch(() => {});
    } catch {
      // 未対応
    }
  }, [badgeCount]);

  // 通知の状態を見て、案内を出すか決める
  useEffect(() => {
    if (!publicKey) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      // iPhoneでSafariから開いている（ホーム画面追加前）は PushManager が無い
      if (isIos() && !isStandalone()) maybeShow("ios-hint");
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {});

    if (Notification.permission === "granted") {
      void syncSubscription(publicKey);
      return;
    }
    if (Notification.permission === "denied") return;
    maybeShow("ask");
  }, [publicKey]);

  const maybeShow = (next: State) => {
    try {
      const until = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      if (until > Date.now()) return;
    } catch {
      // localStorage が使えなくても案内は出す
    }
    setState(next);
  };

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 86400 * 1000));
    } catch {
      // 無視
    }
    setState("idle");
  };

  const enable = async () => {
    setState("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }
      await syncSubscription(publicKey, true);
      setState("done");
    } catch {
      setState("denied");
    }
  };

  if (state === "idle") return null;

  return (
    <div className="mb-4 rounded-2xl border border-brand-200 bg-brand-50/70 px-4 py-3 text-sm flex items-start gap-3">
      <span className="w-9 h-9 shrink-0 rounded-xl bg-white border border-brand-200 text-brand-600 flex items-center justify-center">
        <Icon name="bell" className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0">
        {state === "ios-hint" ? (
          <>
            <p className="font-bold text-ink-800">通知を受け取るには「ホーム画面に追加」</p>
            <p className="text-xs text-ink-600 mt-0.5 leading-relaxed">
              iPhoneは、Safariの共有ボタン → 「ホーム画面に追加」で入れたアプリからだけ通知をオンにできます。
              追加したアプリを開くと、ここに「通知をオンにする」が出ます。
            </p>
          </>
        ) : state === "done" ? (
          <p className="font-bold text-emerald-700">通知をオンにしました。トークやタスクのお知らせが届きます。</p>
        ) : state === "denied" ? (
          <p className="text-xs text-ink-600">
            通知が許可されませんでした。端末の設定でこのアプリの通知を許可すると受け取れます。
          </p>
        ) : (
          <>
            <p className="font-bold text-ink-800">通知をオンにしますか？</p>
            <p className="text-xs text-ink-600 mt-0.5">
              トークの新着・自分あてのメンション・タスクの依頼などが、アプリを開いていなくても届きます。
            </p>
          </>
        )}
        {(state === "ask" || state === "working") && (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={enable}
              disabled={state === "working"}
              className="btn-primary !min-h-9 !py-1.5 !px-4 text-xs disabled:opacity-60"
            >
              {state === "working" ? "設定中…" : "通知をオンにする"}
            </button>
            <button type="button" onClick={dismiss} className="text-xs font-bold text-ink-400 underline">
              あとで
            </button>
          </div>
        )}
        {(state === "ios-hint" || state === "denied") && (
          <button type="button" onClick={dismiss} className="mt-2 text-xs font-bold text-ink-400 underline">
            閉じる
          </button>
        )}
      </div>
      {state === "done" && (
        <button type="button" onClick={() => setState("idle")} aria-label="閉じる" className="text-ink-400 font-bold px-1">
          ×
        </button>
      )}
    </div>
  );
}

/**
 * 購読をサーバーに登録する。すでに許可済みの端末では、1日1回だけ再送して最新に保つ
 * （ブラウザ側で購読が更新されることがあるため）。
 */
async function syncSubscription(publicKey: string, force = false): Promise<void> {
  try {
    if (!force) {
      const last = Number(localStorage.getItem(SYNC_KEY) ?? 0);
      if (Date.now() - last < 86400 * 1000) return;
    }
  } catch {
    // 無視
  }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }),
  });
  if (!res.ok) throw new Error("subscribe failed");
  try {
    localStorage.setItem(SYNC_KEY, String(Date.now()));
  } catch {
    // 無視
  }
}
