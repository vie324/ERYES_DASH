import type { Metadata, Viewport } from "next";
import { Splash } from "@/components/splash";
import { getLogoFullSrc } from "@/lib/logo";
import "./globals.css";

export const metadata: Metadata = {
  title: "ENi サロン業務システム",
  description: "ENi／EREYS のサロン業務システム（日報・週報／組織図・会議／カウンセリング／シフト）",
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
        <Splash logoSrc={getLogoFullSrc()} liffLogoSrc={getLogoFullSrc("eyes")} />
        {children}
      </body>
    </html>
  );
}
