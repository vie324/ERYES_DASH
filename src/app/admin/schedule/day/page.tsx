import { redirect } from "next/navigation";

// 旧「個別調整」画面。シフト画面の表でマスをタップすると、その場で直せるようにしたので、
// そのマスを開いた状態のシフト画面へ転送する。
export default async function LegacyScheduleDayPage({
  searchParams,
}: {
  searchParams: Promise<{ staff_id?: string; date?: string }>;
}) {
  const { staff_id: staffId, date } = await searchParams;
  if (!staffId || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) redirect("/admin/schedule");
  redirect(`/admin/schedule?month=${date!.slice(0, 7)}&store=all&edit=${encodeURIComponent(`${staffId}|${date}`)}`);
}
