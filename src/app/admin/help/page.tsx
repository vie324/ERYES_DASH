import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getBrand, BRAND_INFO, type Brand } from "@/lib/brand";
import { getHelpGuide } from "@/lib/help";
import { PageHeader } from "@/components/ui";
import { HelpGuideBody } from "@/components/help";

export const dynamic = "force-dynamic";

// 管理者向け使い方ガイド。中身は業態（ENi / EREYS）ごとに別（lib/help）。
export default async function AdminHelpPage() {
  await requireAdmin();
  const brand: Brand = (await getBrand()) ?? "eni";
  const guide = getHelpGuide(brand, "admin");
  const other: Brand = brand === "eni" ? "eyes" : "eni";

  return (
    <div className="page-narrow">
      <PageHeader title={guide.title} backHref="/admin" icon="help" />

      <HelpGuideBody guide={guide} />

      <div className="mt-7 space-y-2 text-center">
        <p>
          <Link href="/select" className="text-sm font-bold text-brand-700 underline">
            {BRAND_INFO[other].label}の使い方ガイドを見る（業態を切り替え）
          </Link>
        </p>
        <p>
          <Link href="/staff/help" className="text-sm font-bold text-brand-700 underline">
            スタッフ向けの使い方ガイドへ
          </Link>
        </p>
      </div>
    </div>
  );
}
