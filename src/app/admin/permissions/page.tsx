import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { fx, tables } from "@/lib/data/tables";
import { PERMISSION_DEFS, canGrant, staffHasPermission } from "@/lib/permissions";
import { PageHeader, StatusBadge } from "@/components/ui";
import { Flash, Note, NotReadyNotice } from "@/components/feature-ui";
import { setPermissionAction } from "./actions";

export const dynamic = "force-dynamic";

// 人ごとに付ける権限（ロールとは別）。判定は画面だけでなく、サーバーの処理・APIでも同じ関数（staffHasPermission）を通す。
export default async function PermissionsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await requireAdmin();
  const params = await searchParams;
  const db = getDataStore();
  const [staff, grants, me] = await Promise.all([db.listStaff(), fx().staffPermissions.list(), db.getStaff(session.staffId)]);
  const active = staff.filter((s) => s.isActive);
  const rows = await Promise.all(
    PERMISSION_DEFS.map(async (def) => {
      const holders: typeof active = [];
      for (const s of active) if (await staffHasPermission(s, def.key)) holders.push(s);
      const explicit = new Set(grants.filter((g) => g.permission === def.key).map((g) => g.staffId));
      return { def, holders, explicit };
    })
  );
  return (
    <div className="page-narrow">
      <PageHeader title="人ごとの権限" backHref="/admin/features" backLabel="追加機能の設定へ戻る" icon="crown" />
      <Flash ok={params.ok} error={params.error} />
      <NotReadyNotice table={tables.staffPermissions} isAdmin />
      <Note>
        「代表だけ」の権限は、代表（中さん）本人だけが付け外しできます。ほかの管理者は自分に付けられません。まだ誰にも付けていない間は、代表が持っている扱いです。
      </Note>
      <div className="space-y-4 mt-4 mb-8">
        {rows.map(({ def, holders, explicit }) => {
          const candidates = active.filter((s) => !holders.some((h) => h.id === s.id) && me && canGrant(me, def.key, s));
          return (
            <section key={def.key} className="card !p-3.5">
              <div className="flex items-center gap-2">
                <p className="flex-1 text-sm font-bold">{def.label}</p>
                {def.ownerOnly && <StatusBadge label="代表だけ" tone="warning" />}
              </div>
              <p className="text-[11px] text-ink-500 mt-0.5">{def.note}</p>
              <ul className="mt-2 space-y-1.5">
                {holders.length === 0 && <li className="text-xs text-ink-500">まだ誰も持っていません</li>}
                {holders.map((h) => (
                  <li key={h.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1">
                      {h.name}
                      {!explicit.has(h.id) && <span className="text-[11px] text-ink-500 ml-1">（代表の初期の扱い）</span>}
                    </span>
                    {me && canGrant(me, def.key, h) && explicit.has(h.id) && (
                      <form action={setPermissionAction}>
                        <input type="hidden" name="key" value={def.key} />
                        <input type="hidden" name="staffId" value={h.id} />
                        <input type="hidden" name="granted" value="0" />
                        <button type="submit" className="text-xs text-red-600 underline">
                          外す
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
              {candidates.length > 0 && (
                <form action={setPermissionAction} className="flex gap-2 mt-3">
                  <input type="hidden" name="key" value={def.key} />
                  <input type="hidden" name="granted" value="1" />
                  <select name="staffId" className="input flex-1 !min-h-10 !py-1" aria-label={`${def.label}を付ける人`}>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn-secondary btn-sm">
                    付ける
                  </button>
                </form>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
