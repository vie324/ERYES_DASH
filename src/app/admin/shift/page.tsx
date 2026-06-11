import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addMonths, formatDateTimeJa, formatMonthJa } from "@/lib/date";
import { PREFERENCE_LABEL } from "@/lib/shift/labels";
import { currentTargetMonth, deadlineLabel } from "@/lib/shift/period";
import { EmptyState, MonthNav, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import type { ShiftPreference } from "@/lib/data/types";

// シフト管理トップ（管理者）：希望の提出状況と内容の一覧 → 割当ボードへ
export default async function AdminShiftPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const db = getDataStore();
  const rules = await db.getShiftRules();
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? params.month!
    : currentTargetMonth(rules);

  const [staffList, stores, requestMonths, requests, available, assignments] = await Promise.all([
    db.listStaff(),
    db.listStores(),
    db.listShiftRequestMonths(month),
    db.listShiftRequests(month),
    db.listAvailableStores(month),
    db.listShiftAssignments(month),
  ]);

  const activeStaff = staffList.filter((s) => s.isActive);
  const submittedIds = new Set(requestMonths.map((m) => m.staffId));
  const unsubmitted = activeStaff.filter((s) => !submittedIds.has(s.id));
  const storeMap = new Map(stores.map((s) => [s.id, s]));
  const requestMonthMap = new Map(requestMonths.map((m) => [m.staffId, m]));

  const monthStatus =
    assignments.length === 0
      ? "未作成"
      : assignments.some((a) => a.status === "confirmed")
        ? "確定済み"
        : "下書き";

  // スタッフごとの希望サマリー
  const prefsByStaff = new Map<string, { date: string; preference: ShiftPreference }[]>();
  for (const r of requests) {
    if (!prefsByStaff.has(r.staffId)) prefsByStaff.set(r.staffId, []);
    prefsByStaff.get(r.staffId)!.push({ date: r.date, preference: r.preference });
  }
  const storesByStaff = new Map<string, string[]>();
  for (const a of available) {
    if (!storesByStaff.has(a.staffId)) storesByStaff.set(a.staffId, []);
    storesByStaff.get(a.staffId)!.push(a.storeId);
  }

  const summarizePrefs = (staffId: string, pref: ShiftPreference) =>
    (prefsByStaff.get(staffId) ?? [])
      .filter((p) => p.preference === pref)
      .map((p) => Number(p.date.slice(8)))
      .sort((a, b) => a - b)
      .join("・");

  return (
    <div>
      <PageHeader title="シフト管理" backHref="/admin" />
      <MonthNav
        month={month}
        monthLabel={`${formatMonthJa(month)}分`}
        prevHref={`/admin/shift?month=${addMonths(month, -1)}`}
        nextHref={`/admin/shift?month=${addMonths(month, 1)}`}
      />

      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard
          label="希望の提出状況"
          value={`${submittedIds.size} / ${activeStaff.length}名`}
          sub={`締切：${deadlineLabel(month, rules)}`}
          tone={unsubmitted.length > 0 ? "warning" : "default"}
        />
        <StatCard
          label="シフトの状態"
          value={monthStatus}
          sub={assignments.length > 0 ? `割当 ${assignments.length}件` : "自動割当で下書きを作成"}
          tone={monthStatus === "確定済み" ? "accent" : "default"}
        />
      </div>

      {unsubmitted.length > 0 && (
        <p className="rounded-xl bg-amber-50 text-amber-800 text-xs font-bold px-4 py-3 mb-4">
          未提出：{unsubmitted.map((s) => s.name).join("、")}
        </p>
      )}

      <Link href={`/admin/shift/board?month=${month}`} className="btn-primary w-full mb-2">
        割当ボードを開く（自動割当・調整・確定）
      </Link>
      <Link href="/admin/shift/settings" className="btn-secondary w-full mb-6">
        ルール設定（連勤上限・最低人数・締切日）
      </Link>

      <h2 className="font-bold text-sm text-stone-500 mb-2">提出された希望（本人と管理者のみ閲覧可）</h2>
      {requestMonths.length === 0 ? (
        <EmptyState message="まだ希望の提出はありません" />
      ) : (
        <div className="space-y-3">
          {activeStaff
            .filter((s) => submittedIds.has(s.id))
            .map((staff) => {
              const rm = requestMonthMap.get(staff.id)!;
              const offs = summarizePrefs(staff.id, "off");
              const earls = summarizePrefs(staff.id, "early");
              const lates = summarizePrefs(staff.id, "late");
              const storeNames = (storesByStaff.get(staff.id) ?? [])
                .map((id) => storeMap.get(id)?.name.replace(/^EREYS\s*/, "") ?? "？")
                .join("・");
              return (
                <div key={staff.id} className="card">
                  <div className="flex items-center gap-2">
                    <p className="font-bold flex-1">{staff.name}</p>
                    <StatusBadge label="提出済み" tone="ok" />
                  </div>
                  <p className="text-xs text-stone-400 mt-0.5">
                    {formatDateTimeJa(rm.updatedAt, true)} 提出
                  </p>
                  <dl className="text-sm mt-2 space-y-1">
                    <div className="flex gap-2">
                      <dt className="text-stone-500 shrink-0 w-24">勤務可能店舗</dt>
                      <dd className="font-bold">{storeNames || "（選択なし＝割当不可）"}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-rose-600 shrink-0 w-24">{PREFERENCE_LABEL.off}希望</dt>
                      <dd>{offs ? `${offs}日` : "なし"}</dd>
                    </div>
                    {earls && (
                      <div className="flex gap-2">
                        <dt className="text-sky-600 shrink-0 w-24">{PREFERENCE_LABEL.early}希望</dt>
                        <dd>{earls}日</dd>
                      </div>
                    )}
                    {lates && (
                      <div className="flex gap-2">
                        <dt className="text-indigo-600 shrink-0 w-24">{PREFERENCE_LABEL.late}希望</dt>
                        <dd>{lates}日</dd>
                      </div>
                    )}
                    {rm.note && (
                      <div className="flex gap-2">
                        <dt className="text-stone-500 shrink-0 w-24">備考</dt>
                        <dd className="whitespace-pre-wrap">{rm.note}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
