import { requireSession } from "@/lib/auth/session";
import { thisMonthJst } from "@/lib/date";
import { isExecutive } from "@/lib/eni/access";
import { PageHeader } from "@/components/ui";
import { CompanyEventsPanel, EventFlash } from "@/components/company-events";

export const dynamic = "force-dynamic";

// 全体スケジュール（会社のイベント・全員にかかわる予定）。
// 予定（計画スケジュール）の「全体」タブと同じ内容を、メニューの「会社の予定・イベント」からも開けるようにしている。
// 全員が見られて、登録・編集は幹部と管理者だけができる。
export default async function CompanyEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; edit?: string; saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : thisMonthJst();
  const canEdit = await isExecutive(session);

  return (
    <div className="page-narrow">
      <PageHeader
        title="全体スケジュール"
        description="全体ミーティング・研修・しもん塾など、全員にかかわる予定"
        backHref="/staff"
        icon="calendar"
      />
      <EventFlash saved={params.saved} error={params.error} />
      <CompanyEventsPanel month={month} editId={params.edit} canEdit={canEdit} basePath="/staff/events" />
    </div>
  );
}
