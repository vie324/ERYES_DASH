import { redirect } from "next/navigation";

// 旧「理想のスケジュール」。統合後の「スケジュール」の計画タブへ送る。
export default async function IdealRedirectPage() {
  redirect("/staff/plan?tab=plan");
}
