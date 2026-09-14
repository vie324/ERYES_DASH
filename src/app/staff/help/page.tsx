import { redirect } from "next/navigation";

// 使い方ガイドは一旦非表示にしている。
// ENi（ヘアサロン）とイーリス（アイラッシュ）で同じ内容が出てしまっていたため、
// 業態ごとの内容をデータから読み込む形に作り直すまで閉じる。
// 以前の中身は git 履歴（この変更の1つ前のコミット）に残してある。
export default function StaffHelpPage() {
  redirect("/staff");
}
