import { redirect } from "next/navigation";

// 使い方ガイドは一旦非表示にしている（スタッフ側と同じ理由）。
// 以前の中身は git 履歴（この変更の1つ前のコミット）に残してある。
export default function AdminHelpPage() {
  redirect("/admin");
}
