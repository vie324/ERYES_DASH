import { redirect } from "next/navigation";

// 旧「今日のスケジュール」。統合後の「スケジュール」へ送る（古いブックマーク・リンク対策）。
export default async function MorningRedirectPage() {
  redirect("/staff/plan");
}
