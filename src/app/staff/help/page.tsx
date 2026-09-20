import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getBrand, BRAND_INFO, type Brand } from "@/lib/brand";
import { getHelpGuide } from "@/lib/help";
import { PageHeader } from "@/components/ui";
import { HelpGuideBody } from "@/components/help";

export const dynamic = "force-dynamic";

// スタッフ向け使い方ガイド。中身は業態（ENi / EREYS）ごとに別（lib/help）。
// 以前は1つの文章を両方で使い回していて、ENiの人にアイサロンの手順が出てしまっていた。
export default async function StaffHelpPage() {
  const session = await requireSession();
  const brand: Brand = (await getBrand()) ?? "eni";
  const guide = getHelpGuide(brand, "staff");
  const other: Brand = brand === "eni" ? "eyes" : "eni";

  return (
    <div className="page-narrow">
      <PageHeader title={guide.title} backHref="/staff" icon="help" />

      <HelpGuideBody guide={guide} />

      <div className="mt-7 space-y-2 text-center">
        <p>
          <Link href="/select" className="text-sm font-bold text-brand-700 underline">
            {BRAND_INFO[other].label}の使い方ガイドを見る（業態を切り替え）
          </Link>
        </p>
        {session.role === "admin" && (
          <p>
            <Link href="/admin/help" className="text-sm font-bold text-brand-700 underline">
              管理者向けの使い方ガイドへ
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
