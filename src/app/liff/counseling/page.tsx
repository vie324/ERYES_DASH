import { env } from "@/lib/env";
import { getLogoSrc } from "@/lib/logo";
import { CounselingForm } from "./counseling-form";

export const dynamic = "force-dynamic";

// 顧客用カウンセリングフォーム（LINEのリッチメニューからLIFFで開く。ログイン不要）
// LIFF_ID未設定の間はデモモード（テスト用IDを手入力）で動作確認できる。
export default function LiffCounselingPage() {
  return <CounselingForm liffId={env.liffId} logoSrc={getLogoSrc()} />;
}
