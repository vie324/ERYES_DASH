"use client";

// 画面全体にかぶせるもの（確認の画面・案内・写真の拡大）を body の直下に出す。
// 本文（<main>）には出入りのアニメーション（transform）があり、その中では position: fixed が
// 画面ではなく本文の大きさで決まってしまう（長いページでは下のほうに隠れる）ため。

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function BodyPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}
