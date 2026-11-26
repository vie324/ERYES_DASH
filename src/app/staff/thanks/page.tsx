import { redirect } from "next/navigation";

// サンクスカードは社内SNS（依頼10）にまとめた。これまでのデータはそのまま「サンクス」のタブに出る。
// ブックマーク・古い通知のリンクから来ても迷わないよう転送する。
export default function ThanksPage() {
  redirect("/staff/sns?tab=thanks");
}
