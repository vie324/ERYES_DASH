import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateJa, formatMonthJa, todayJst } from "@/lib/date";
import { buildTargetMonth, currentTargetMonth, requestDeadline } from "@/lib/shift/period";
import { PageHeader } from "@/components/ui";
import { updateShiftRulesAction } from "../actions";

// シフトのルール設定（希望休の締切・自動作成・警告に使われる）
export default async function ShiftRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const rules = await getDataStore().getShiftRules();
  const today = todayJst();
  const openMonth = currentTargetMonth(rules, today);
  const buildMonth = buildTargetMonth(rules, today);

  return (
    <div className="page-narrow">
      <PageHeader title="シフトのルール" backHref="/admin/schedule" backLabel="シフトへ戻る" />

      {params.saved && <p className="note note-ok mb-4">保存しました（次の自動作成・希望休の締切から反映されます）</p>}
      {params.error && <p className="note note-danger mb-4">入力内容を確認してください</p>}

      <div className="card-quiet mb-4 text-sm text-ink-700 space-y-0.5">
        <p className="font-bold">いまの設定だと</p>
        <p>
          ・受付中：<span className="font-bold">{formatMonthJa(openMonth)}分</span>（締切 {formatDateJa(requestDeadline(openMonth, rules), true)}）
        </p>
        <p>
          ・締切が過ぎて作る月：<span className="font-bold">{formatMonthJa(buildMonth)}分</span>（締切 {formatDateJa(requestDeadline(buildMonth, rules), true)}）
        </p>
      </div>

      <form action={updateShiftRulesAction} className="card space-y-4">
        <div>
          <label className="label" htmlFor="request_lead_months">何ヶ月先の分を募集するか</label>
          <input
            id="request_lead_months"
            name="request_lead_months"
            type="number"
            inputMode="numeric"
            min={1}
            max={12}
            defaultValue={rules.requestLeadMonths}
            className="input"
            required
          />
          <p className="hint">
            3なら「9月5日までに12月分」。お客様の2ヶ月先のご予約を確保していきたいため、先の月の分を早めに出してもらいます。
          </p>
        </div>
        <div>
          <label className="label" htmlFor="request_deadline_day">希望休の締切日（◯日）</label>
          <input
            id="request_deadline_day"
            name="request_deadline_day"
            type="number"
            inputMode="numeric"
            min={1}
            max={28}
            defaultValue={rules.requestDeadlineDay}
            className="input"
            required
          />
          <p className="hint">
            上の「何ヶ月先」とセットで締切が決まります。締切の前の月の15日から、まだ出していない人のホーム・メニューにお知らせが出ます（通知を許可している人には毎月15日に通知も届きます）。
          </p>
        </div>
        <div>
          <label className="label" htmlFor="max_consecutive_days">連勤の上限（日）</label>
          <input
            id="max_consecutive_days"
            name="max_consecutive_days"
            type="number"
            inputMode="numeric"
            min={1}
            max={30}
            defaultValue={rules.maxConsecutiveDays}
            className="input"
            required
          />
          <p className="hint">自動で作るときはこの日数を超えて続けて入れません（前の月からの続きも数えます）。</p>
        </div>
        <div>
          <label className="label" htmlFor="min_staff_per_store_per_day">1店舗・1日の最低人数（人）</label>
          <input
            id="min_staff_per_store_per_day"
            name="min_staff_per_store_per_day"
            type="number"
            inputMode="numeric"
            min={0}
            max={20}
            defaultValue={rules.minStaffPerStoreDay}
            className="input"
            required
          />
          {/* TODO: 最低人数は「日単位」。早番・遅番の帯ごとに必要なら要改修 */}
          <p className="hint">
            1日単位の人数です（早番・遅番ごとではありません）。足りない日はシフト表に赤い印が付きます。
            全員がお休みの曜日（定休日）は数えません。
          </p>
        </div>
        <button type="submit" className="btn-primary w-full">保存する</button>
      </form>
    </div>
  );
}
