import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { getAppLinks } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";

// カミキュラム（動画教材）への入口。
// URLが登録されていればそのまま外部サイトへ。未登録の間は、どこで設定するかの案内を出す。
export default async function CurriculumPage() {
  const session = await requireSession();
  const { curriculumUrl } = await getAppLinks(getDataStore());
  if (curriculumUrl) redirect(curriculumUrl);

  return (
    <div className="page-narrow">
      <PageHeader title="カミキュラム" backHref="/staff" />
      <div className="card text-center">
        <span className="mx-auto w-14 h-14 rounded-2xl bg-brand-50 border border-brand-200 text-brand-600 flex items-center justify-center">
          <Icon name="play" className="w-7 h-7" />
        </span>
        <p className="font-bold text-ink-800 mt-3">カミキュラムのURLがまだ登録されていません</p>
        <p className="text-sm text-ink-500 mt-1 leading-relaxed">
          登録されると、下部タブの「カミキュラム」から動画教材のサイトを直接開けるようになります。
          {session.role === "admin"
            ? "マスタ設定の「外部サービスのリンク」から登録してください。"
            : "管理者にマスタ設定への登録をお願いしてください。"}
        </p>
        {session.role === "admin" && (
          <Link href="/admin/settings" className="btn-primary w-full mt-4">
            マスタ設定を開く
          </Link>
        )}
      </div>
    </div>
  );
}
