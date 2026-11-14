"use client";

// 通知の設定画面の「この端末」欄。
//  ・この端末で通知が使えるか（iPhoneは「ホーム画面に追加」したアプリだけ）・許可の状態を出す
//  ・「この端末で通知をオンにする」（許可は本人がボタンを押したときに求める）
//  ・テスト通知を送って、届くか・バッジが付くかを確かめる

import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { isIos, isStandalone, syncSubscription } from "@/components/push-setup";
import { sendTestPushAction } from "@/app/staff/notifications/actions";

type DeviceState = "checking" | "unsupported" | "ios-browser" | "default" | "granted" | "denied";

export function PushDevice({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<DeviceState>("checking");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState(isIos() && !isStandalone() ? "ios-browser" : "unsupported");
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    setState(Notification.permission === "granted" ? "granted" : Notification.permission === "denied" ? "denied" : "default");
  }, []);

  const enable = () => {
    startTransition(async () => {
      setMessage("");
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "default");
          return;
        }
        await syncSubscription(publicKey, true);
        setState("granted");
        setMessage("この端末で通知をオンにしました。");
      } catch {
        setMessage("オンにできませんでした。時間をおいてもう一度お試しください。");
      }
    });
  };

  const test = () => {
    startTransition(async () => {
      setMessage("");
      try {
        // 念のため、この端末の購読をサーバーに入れ直してから送る
        if (state === "granted") await syncSubscription(publicKey, true);
        const result = await sendTestPushAction();
        setMessage(
          result.sent > 0
            ? `テスト通知を送りました（${result.sent}台）。数秒で届きます。`
            : "送れる端末がありませんでした。先に「この端末で通知をオンにする」を押してください。"
        );
      } catch {
        setMessage("送れませんでした。電波の良いところでもう一度お試しください。");
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span
          className={`w-2.5 h-2.5 rounded-full ${
            state === "granted" ? "bg-emerald-500" : state === "denied" ? "bg-red-500" : "bg-ink-300"
          }`}
        />
        <span className="text-sm font-bold text-ink-800">
          {state === "checking" && "確認しています…"}
          {state === "granted" && "この端末は通知がオンです"}
          {state === "default" && "この端末は通知がまだオフです"}
          {state === "denied" && "この端末では通知が許可されていません"}
          {state === "ios-browser" && "Safariで開いています（このままでは通知を受け取れません）"}
          {state === "unsupported" && "この端末・ブラウザは通知に対応していません"}
        </span>
      </div>

      {state === "ios-browser" && (
        <div className="rounded-xl bg-brand-50 border border-brand-200 p-3.5">
          <p className="text-sm font-bold text-ink-800 mb-1.5">iPhoneで通知を受け取るには</p>
          <ol className="list-decimal pl-5 space-y-1 text-sm text-ink-700">
            <li>
              Safariの画面下の<span className="font-bold">共有ボタン</span>（□に↑のマーク）を押す
            </li>
            <li>
              メニューを下へ送って<span className="font-bold">「ホーム画面に追加」</span>→ 右上の「追加」
            </li>
            <li>ホーム画面にできた「ENi」のアイコンから開く</li>
            <li>この画面をもう一度開き、「この端末で通知をオンにする」を押して「許可」</li>
          </ol>
          <p className="hint">iOS 16.4以上が必要です。アイコンの赤い数字（バッジ）も、ホーム画面に追加したアプリで出ます。</p>
        </div>
      )}

      {state === "denied" && (
        <p className="text-xs text-ink-600 leading-relaxed">
          端末の設定で許可すると受け取れます（iPhone：設定 → 通知 → ENi → 通知を許可）。
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {(state === "default" || state === "denied") && (
          <button type="button" onClick={enable} disabled={pending} className="btn-primary !min-h-11 !py-2 text-sm">
            <Icon name="bell" className="w-4 h-4" />
            この端末で通知をオンにする
          </button>
        )}
        {state === "granted" && (
          <button type="button" onClick={test} disabled={pending} className="btn-secondary !min-h-11 !py-2 text-sm">
            テスト通知を送る
          </button>
        )}
      </div>
      {message && <p className="text-xs font-bold text-brand-700">{message}</p>}
    </div>
  );
}
