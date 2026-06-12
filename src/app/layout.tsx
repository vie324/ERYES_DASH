import type { Metadata, Viewport } from "next";
import { Splash } from "@/components/splash";
import { getLogoFullSrc } from "@/lib/logo";
import "./globals.css";

export const metadata: Metadata = {
  title: "EREYS サロン業務システム",
  description: "EREYS のサロン業務システム（カウンセリング／日報・成績／勤怠／シフト／配信）",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 入力時の自動ズームを防ぎ、店頭iPadでの誤操作を減らす
  maximumScale: 1,
  themeColor: "#faf8f2",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh text-ink-900 antialiased">
        <Splash logoSrc={getLogoFullSrc()} />
        {children}
      </body>
    </html>
  );
}
