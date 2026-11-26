import { SnsDetail } from "@/components/sns/detail-view";

export const dynamic = "force-dynamic";

export default async function SnsThanksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  return <SnsDetail type="thanks" id={id} ok={q.ok} error={q.error} />;
}
