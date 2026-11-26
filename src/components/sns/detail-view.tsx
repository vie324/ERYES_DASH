// 社内SNSの1件の画面（投稿・サンクス共通）。開いたら、その件のお知らせを既読にする（見ないと消えない通知）。

import { notFound } from "next/navigation";
import { getDataStore } from "@/lib/data";
import { requireViewer } from "@/lib/viewer";
import { getTimelineItem } from "@/lib/sns";
import { PageHeader } from "@/components/ui";
import { Flash } from "@/components/feature-ui";
import { TimelineCard } from "@/components/sns/timeline-card";

export async function SnsDetail({
  type,
  id,
  ok,
  error,
}: {
  type: "post" | "thanks";
  id: string;
  ok?: string;
  error?: string;
}) {
  const v = await requireViewer();
  const db = getDataStore();
  const item = await getTimelineItem(db, { staffId: v.staffId, isAdmin: v.isAdmin }, type, id);
  if (!item) notFound();
  // 開いて見たので、この件のお知らせ（サンクス・コメント・お知らせ）を既読にする
  await db.markAppNotificationsRead(v.staffId, id);
  const [staff, stores] = await Promise.all([db.listStaff(), db.listStores()]);
  const nameMap = new Map(staff.map((s) => [s.id, s.name]));
  const storeMap = new Map(stores.map((s) => [s.id, s.name]));
  const back = type === "post" ? `/staff/sns/post/${id}` : `/staff/sns/thanks/${id}`;
  return (
    <div className="page-narrow">
      <PageHeader title={type === "post" ? "投稿" : "サンクス"} backHref="/staff/sns" backLabel="社内SNSへ戻る" />
      <Flash ok={ok} error={error} />
      <TimelineCard
        item={item}
        ctx={{
          viewerId: v.staffId,
          isAdmin: v.isAdmin,
          isExec: v.isExec,
          nameOf: (sid) => (sid ? (nameMap.get(sid) ?? "（退職したスタッフ）") : "？"),
          storeName: (sid) => (sid ? (storeMap.get(sid) ?? "") : ""),
          back,
          unread: new Set(),
          detail: true,
        }}
      />
    </div>
  );
}
