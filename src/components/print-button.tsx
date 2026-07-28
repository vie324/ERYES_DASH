"use client";

// PDF保存（ブラウザの印刷ダイアログ →「PDFで保存」）。
// auto を付けると、ページを開いた直後に印刷ダイアログを出す（一覧の「PDFにする」から来たとき用）。

import { useEffect } from "react";

export function PrintButton({
  label = "PDFで保存（印刷）",
  auto = false,
}: {
  label?: string;
  auto?: boolean;
}) {
  useEffect(() => {
    if (!auto) return;
    // レイアウト・画像が整ってから開くよう少し待つ
    const timer = setTimeout(() => window.print(), 600);
    return () => clearTimeout(timer);
  }, [auto]);

  return (
    <button type="button" onClick={() => window.print()} className="btn-primary w-full print:hidden">
      {label}
    </button>
  );
}
