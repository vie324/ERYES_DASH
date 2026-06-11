"use client";

// 打刻パネル：ボタンを押す→ブラウザの位置情報を取得→サーバーで距離判定
// 覚えることが無いよう、画面には大きなボタン2つと結果表示だけを置く

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { punchAction, type PunchResult } from "./actions";
import type { PunchType } from "@/lib/data/types";

type Status =
  | { kind: "idle" }
  | { kind: "locating"; punchType: PunchType }
  | { kind: "result"; result: PunchResult };

export function PunchPanel() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const busy = status.kind === "locating" || isPending;

  const punch = (punchType: PunchType) => {
    if (busy) return;
    if (!navigator.geolocation) {
      setStatus({
        kind: "result",
        result: { ok: false, distanceM: 0, radiusM: 0, message: "この端末では位置情報を利用できません" },
      });
      return;
    }
    setStatus({ kind: "locating", punchType });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        startTransition(async () => {
          const result = await punchAction(punchType, pos.coords.latitude, pos.coords.longitude);
          setStatus({ kind: "result", result });
          router.refresh();
        });
      },
      (err) => {
        const message =
          err.code === err.PERMISSION_DENIED
            ? "位置情報が許可されていません。ブラウザの設定で位置情報を「許可」にしてからお試しください"
            : "位置情報を取得できませんでした。電波の良い場所でもう一度お試しください";
        setStatus({ kind: "result", result: { ok: false, distanceM: 0, radiusM: 0, message } });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => punch("in")}
          disabled={busy}
          className="rounded-2xl bg-gradient-to-b from-brand-400 to-brand-600 text-white font-bold text-xl py-10 shadow-[0_4px_16px_rgba(148,129,90,0.35)] transition-all duration-200 hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
        >
          出勤
        </button>
        <button
          type="button"
          onClick={() => punch("out")}
          disabled={busy}
          className="rounded-2xl bg-gradient-to-b from-ink-700 to-ink-900 text-white font-bold text-xl py-10 shadow-[0_4px_16px_rgba(41,38,33,0.3)] transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
        >
          退勤
        </button>
      </div>

      {status.kind === "locating" && (
        <p className="card text-center text-sm font-bold text-stone-600 animate-pulse">
          位置情報を確認しています…
        </p>
      )}
      {status.kind === "result" && (
        <p
          className={`card text-sm font-bold ${
            status.result.ok ? "text-emerald-700 bg-emerald-50" : "text-red-600 bg-red-50"
          }`}
        >
          {status.result.message}
        </p>
      )}
    </div>
  );
}
