import { env } from "@/lib/env";
import { getLogoSrc } from "@/lib/logo";
import { AppointmentClient } from "./appointment-client";

export const dynamic = "force-dynamic";

// 顧客用の予約確認・変更・キャンセルページ（LINEのリマインドのリンクからLIFFで開く。ログイン不要）
// NEXT_PUBLIC_LIFF_APPOINTMENT_ID 未設定の間はデモモード（テスト用IDを手入力）で動作確認できる。
export default function LiffAppointmentPage() {
  return <AppointmentClient liffId={env.liffAppointmentId} logoSrc={getLogoSrc("eyes")} />;
}
