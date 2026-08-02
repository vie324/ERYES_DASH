import { PageSkeleton } from "@/components/ui";

// ページ切り替え中に出す骨組み。サイドバーは残ったまま中身だけが差し替わる。
export default function AdminLoading() {
  return <PageSkeleton />;
}
