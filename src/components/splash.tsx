"use client";

// スプラッシュスクリーン：起動時にロゴをフェードインで表示する。
// 同じタブのセッション中は1回だけ表示（リロードやページ遷移では出さない）。

import { useEffect, useState } from "react";

const SEEN_KEY = "eryes_splash_seen";
const SHOW_MS = 1500;
const FADE_MS = 600;

export function Splash({
  logoSrc = "/logo-eni-full.svg",
  liffLogoSrc = "/logo-full.svg",
}: {
  logoSrc?: string;
  /** お客様向けLIFF（EREYSアイサロン）ではこちらのロゴを出す */
  liffLogoSrc?: string;
}) {
  const [phase, setPhase] = useState<"show" | "fade" | "done">("show");
  const [src, setSrc] = useState(logoSrc);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SEEN_KEY)) {
        setPhase("done");
        return;
      }
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // sessionStorage不可の環境ではそのまま1回表示
    }
    // お客様向けページ（/liff）はアイサロン（EREYS）のお客様なので、そちらのロゴにする
    if (window.location.pathname.startsWith("/liff")) setSrc(liffLogoSrc);
    const t1 = setTimeout(() => setPhase("fade"), SHOW_MS);
    const t2 = setTimeout(() => setPhase("done"), SHOW_MS + FADE_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [liffLogoSrc]);

  if (phase === "done") return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-brand-50 transition-opacity ease-out ${
        phase === "fade" ? "opacity-0 duration-700" : "opacity-100"
      }`}
    >
      <div className="animate-splash-logo flex flex-col items-center px-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="サロン業務システム" className="w-64 max-w-[70vw] h-auto" />
        <p className="mt-2 text-[11px] font-bold tracking-[0.35em] text-brand-500">
          SALON MANAGEMENT
        </p>
      </div>
    </div>
  );
}
