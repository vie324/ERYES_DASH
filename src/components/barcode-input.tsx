"use client";

// バーコードで商品を探す（読める端末ではカメラで読む。iPhone の Safari などで読めないときは、番号を打ち込む）。
// 見つかった商品の入力欄へ移動する。

import { useRef, useState } from "react";

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
  }
}

export function BarcodeJump({ codes }: { codes: Record<string, string> }) {
  const [msg, setMsg] = useState("");
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const jump = (code: string) => {
    const id = codes[code.replace(/\s/g, "")];
    if (!id) {
      setMsg(`商品が見つかりません（${code}）`);
      return;
    }
    const el = document.getElementById(`count-${id}`) as HTMLInputElement | null;
    el?.scrollIntoView({ block: "center" });
    el?.focus();
    setMsg("");
  };
  const scan = async () => {
    if (!window.BarcodeDetector) {
      setMsg("この端末ではカメラで読めません。番号を入れてください");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setScanning(true);
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "upc_a"] });
      const started = Date.now();
      const tick = async () => {
        const found = await detector.detect(video).catch(() => []);
        if (found[0]?.rawValue || Date.now() - started > 15000) {
          stream.getTracks().forEach((t) => t.stop());
          setScanning(false);
          if (found[0]?.rawValue) jump(found[0].rawValue);
          else setMsg("読めませんでした。番号を入れてください");
          return;
        }
        requestAnimationFrame(() => void tick());
      };
      void tick();
    } catch {
      setMsg("カメラを使えませんでした。番号を入れてください");
      setScanning(false);
    }
  };
  return (
    <div className="card !p-3 mb-3 space-y-2">
      <div className="flex gap-2">
        <input
          inputMode="numeric"
          placeholder="バーコードの番号で探す"
          className="input flex-1 !min-h-10 !py-1.5"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              jump((e.target as HTMLInputElement).value);
            }
          }}
        />
        <button type="button" onClick={scan} className="btn-secondary btn-sm shrink-0">
          カメラで読む
        </button>
      </div>
      {scanning && <video ref={videoRef} className="w-full rounded-xl bg-black" playsInline muted />}
      {!scanning && <video ref={videoRef} className="hidden" playsInline muted />}
      {msg && <p className="text-xs text-red-600">{msg}</p>}
    </div>
  );
}
