import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import {
  addMonths,
  formatDateJa,
  formatMonthJa,
  jstDateOf,
  jstDayBoundsUtc,
  monthRange,
  thisMonthJst,
} from "@/lib/date";
import { isExecutive } from "@/lib/eni/access";
import { EmptyState, MonthNav, PageHeader, StatusBadge } from "@/components/ui";
import type { OrderCategory, OrderStatus } from "@/lib/data/types";
import { createOrderRequestAction, updateOrderStatusAction } from "./actions";

const CATEGORY_LABEL: Record<OrderCategory, string> = {
  wig: "ウィッグ",
  store_sale: "社販",
  material: "商材",
};

// 発注・購入申請：ウィッグ購入希望・社販・商材の発注をここに集約する（Notion運用の置き換え）。
// スタッフは申請を送るだけ。幹部・管理者が月別の一覧を見て発注し、状況を更新する。
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; saved?: string; error?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : thisMonthJst();
  const { from, to } = monthRange(month);
  const isExec = await isExecutive(session);

  const db = getDataStore();
  const [orders, staffList] = await Promise.all([
    db.listOrderRequests({
      from: jstDayBoundsUtc(from).start,
      to: jstDayBoundsUtc(to).end,
    }),
    db.listStaff(),
  ]);
  const staffMap = new Map(staffList.map((s) => [s.id, s.name]));
  const visibleOrders = isExec ? orders : orders.filter((o) => o.staffId === session.staffId);

  const statusBadge = (status: OrderStatus) =>
    status === "requested" ? (
      <StatusBadge label="申請中" tone="warning" />
    ) : status === "ordered" ? (
      <StatusBadge label="発注済み" tone="pending" />
    ) : (
      <StatusBadge label="受取済み" tone="ok" />
    );

  return (
    <div className="page-narrow">
      <PageHeader title="発注・購入申請" backHref="/staff" />

      {params.saved && (
        <p className="rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold px-4 py-3 mb-4">
          {params.saved === "status" ? "発注状況を更新しました" : "申請を送信しました"}
        </p>
      )}
      {params.error && (
        <p className="rounded-xl bg-red-50 text-red-600 text-sm font-bold px-4 py-3 mb-4">
          {params.error === "forbidden" ? "この操作の権限がありません" : "入力内容を確認してください"}
        </p>
      )}

      {/* 申請フォーム */}
      <form action={createOrderRequestAction} className="card space-y-3 mb-4">
        <p className="section-title !mb-0">申請する</p>
        <div>
          <p className="label !mb-2">種類</p>
          <div className="flex gap-2">
            {(Object.keys(CATEGORY_LABEL) as OrderCategory[]).map((c) => (
              <label
                key={c}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-ink-200 px-3 py-2.5 text-sm font-bold has-checked:border-brand-400 has-checked:bg-brand-50"
              >
                <input
                  type="radio"
                  name="category"
                  value={c}
                  defaultChecked={c === "wig"}
                  className="h-4 w-4 accent-brand-500"
                />
                {CATEGORY_LABEL[c]}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="label" htmlFor="item_name">
              品名
            </label>
            <input
              id="item_name"
              name="item_name"
              className="input"
              placeholder="例）カットウィッグ（レディース）"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="quantity">
              数量
            </label>
            <input
              id="quantity"
              name="quantity"
              type="number"
              inputMode="numeric"
              min={1}
              defaultValue={1}
              className="input text-right font-bold"
              required
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="note">
            メモ（任意）
          </label>
          <input id="note" name="note" className="input" placeholder="例）国家試験の練習用" />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn-primary w-full">
            この内容で申請する
          </button>
        </div>
      </form>

      <MonthNav
        month={month}
        monthLabel={formatMonthJa(month)}
        prevHref={`/staff/orders?month=${addMonths(month, -1)}`}
        nextHref={`/staff/orders?month=${addMonths(month, 1)}`}
      />

      <section className="card">
        <h2 className="section-title">
          {isExec ? `みんなの申請（${formatMonthJa(month)}・幹部メニュー）` : `自分の申請（${formatMonthJa(month)}）`}
        </h2>
        {visibleOrders.length === 0 ? (
          <EmptyState message="この月の申請はありません" />
        ) : (
          <div className="space-y-3">
            {visibleOrders.map((o) => (
              <div key={o.id} className="rounded-xl border border-ink-200 p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold rounded-full bg-ink-100 text-ink-600 px-2 py-0.5">
                    {CATEGORY_LABEL[o.category]}
                  </span>
                  <span className="font-bold text-sm">
                    {o.itemName} × {o.quantity}
                  </span>
                  <span className="ml-auto">{statusBadge(o.status)}</span>
                </div>
                <p className="text-xs text-ink-500 mt-1">
                  {staffMap.get(o.staffId) ?? "（不明）"} ／ {formatDateJa(jstDateOf(o.createdAt))}
                  {o.note && <span className="block mt-0.5">メモ：{o.note}</span>}
                </p>
                {isExec && o.status !== "received" && (
                  <form action={updateOrderStatusAction} className="mt-2">
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="month" value={month} />
                    <input
                      type="hidden"
                      name="status"
                      value={o.status === "requested" ? "ordered" : "received"}
                    />
                    <button type="submit" className="btn-secondary w-full !min-h-10 !py-1.5 text-sm">
                      {o.status === "requested" ? "発注済みにする" : "受取済みにする"}
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
