import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERYES サロン業務システム",
  description: "アイラッシュ・眉毛サロンの業務システム（カウンセリング／日報・成績／勤怠／配信）",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 入力時の自動ズームを防ぎ、店頭iPadでの誤操作を減らす
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh bg-stone-50 text-stone-800 antialiased">{children}</body>
    </html>
  );
}
