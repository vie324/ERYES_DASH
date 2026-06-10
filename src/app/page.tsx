import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

// ルートはログイン状態に応じて各ホームへ振り分けるだけ
export default async function RootPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(session.role === "admin" ? "/admin" : "/staff");
}
