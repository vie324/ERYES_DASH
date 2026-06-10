import { requireAdmin } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { PageHeader, StatusBadge } from "@/components/ui";
import {
  createStaffAction,
  createStoreAction,
  updateStaffAction,
  updateStoreAction,
} from "../actions";

const FLASH_MESSAGES: Record<string, { type: "ok" | "error"; text: string }> = {
  "saved=store": { type: "ok", text: "店舗情報を保存しました" },
  "saved=staff": { type: "ok", text: "スタッフ情報を保存しました" },
  "error=store": { type: "error", text: "店舗情報の入力内容を確認してください" },
  "error=staff_input": { type: "error", text: "スタッフ情報の入力内容を確認してください（パスワードは8文字以上）" },
  "error=staff_password": { type: "error", text: "パスワードは8文字以上で入力してください" },
  "error=staff_duplicate": { type: "error", text: "そのログインIDは既に使われています" },
};

// マスタ設定：店舗（GPS座標・勤怠運用フラグ）とスタッフ（権限・固定残業・パスワード）
export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const session = await requireAdmin();
  const params = await searchParams;
  const flashKey = params.saved ? `saved=${params.saved}` : params.error ? `error=${params.error}` : "";
  const flash = FLASH_MESSAGES[flashKey];

  const db = getDataStore();
  const [stores, staffList] = await Promise.all([db.listStores(), db.listStaff()]);

  return (
    <div>
      <PageHeader title="マスタ設定" backHref="/admin" />

      {flash && (
        <p
          className={`rounded-xl text-sm font-bold px-4 py-3 mb-4 ${
            flash.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
          }`}
        >
          {flash.text}
        </p>
      )}

      <section className="mb-5">
        <h2 className="font-bold text-base mb-3">店舗一覧</h2>
        <p className="text-xs text-stone-500 mb-3">
          シフト管理は全店舗が対象です。GPS打刻は「最寄りの店舗」の座標・許容半径で判定されます。
        </p>
        <div className="space-y-3">
          {stores.map((store, index) => (
            <details key={store.id} className="card" open={stores.length === 1}>
              <summary className="flex items-center gap-2 cursor-pointer list-none">
                <span className="font-bold flex-1">
                  {store.name}
                  {index === 0 && <span className="text-xs text-stone-400 ml-2">（本店）</span>}
                </span>
                {store.attendanceEnabled ? (
                  <StatusBadge label="勤怠ON" tone="ok" />
                ) : (
                  <StatusBadge label="勤怠OFF" tone="muted" />
                )}
                <span className="text-stone-300">▼</span>
              </summary>
              <form action={updateStoreAction} className="space-y-3 mt-4 pt-4 border-t border-stone-100">
                <input type="hidden" name="id" value={store.id} />
                <div>
                  <label className="label">店舗名</label>
                  <input name="name" defaultValue={store.name} className="input" required />
                </div>
                <div>
                  <label className="label">住所</label>
                  <input name="address" defaultValue={store.address} className="input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">緯度</label>
                    <input name="lat" type="number" step="any" defaultValue={store.lat} className="input" required />
                  </div>
                  <div>
                    <label className="label">経度</label>
                    <input name="lng" type="number" step="any" defaultValue={store.lng} className="input" required />
                  </div>
                </div>
                <p className="text-xs text-stone-500">
                  ※ 緯度経度はGoogleマップで店舗を右クリック→表示される数値をコピーして貼り付けてください。
                </p>
                <div>
                  <label className="label">GPS許容半径（m）</label>
                  <input
                    name="gps_radius_m"
                    type="number"
                    min={10}
                    step={10}
                    defaultValue={store.gpsRadiusM}
                    className="input"
                    required
                  />
                </div>
                <label className="flex items-center gap-2 text-sm font-bold text-stone-600">
                  <input
                    type="checkbox"
                    name="attendance_enabled"
                    defaultChecked={store.attendanceEnabled}
                    className="h-5 w-5 accent-rose-500"
                  />
                  この店舗で勤怠（GPS打刻）を運用する
                </label>
                <button type="submit" className="btn-secondary w-full">この内容で更新</button>
              </form>
            </details>
          ))}
        </div>

        <details className="card mt-3">
          <summary className="font-bold cursor-pointer list-none text-rose-600">
            ＋ 店舗を追加
          </summary>
          <form action={createStoreAction} className="space-y-3 mt-4 pt-4 border-t border-stone-100">
            <div>
              <label className="label" htmlFor="new_store_name">店舗名</label>
              <input id="new_store_name" name="name" className="input" placeholder="例）ERYES 新宿店" required />
            </div>
            <div>
              <label className="label" htmlFor="new_store_address">住所（任意）</label>
              <input id="new_store_address" name="address" className="input" />
            </div>
            <p className="text-xs text-stone-500">
              ※ 緯度経度は本店と同じ値で作成されます。追加後にこの画面で正しい座標へ変更してください。
            </p>
            <button type="submit" className="btn-primary w-full">店舗を追加</button>
          </form>
        </details>
      </section>

      <section className="mb-5">
        <h2 className="font-bold text-base mb-3">スタッフ一覧</h2>
        <div className="space-y-3">
          {staffList.map((s) => (
            <details key={s.id} className="card">
              <summary className="flex items-center gap-2 cursor-pointer list-none">
                <span className="font-bold flex-1">
                  {s.name}
                  <span className="text-xs text-stone-400 ml-2">ID: {s.loginId}</span>
                </span>
                {s.role === "admin" ? (
                  <StatusBadge label="管理者" tone="pending" />
                ) : (
                  <StatusBadge label="スタッフ" tone="muted" />
                )}
                {!s.isActive && <StatusBadge label="無効" tone="danger" />}
                <span className="text-stone-300">▼</span>
              </summary>
              <form action={updateStaffAction} className="space-y-3 mt-4 pt-4 border-t border-stone-100">
                <input type="hidden" name="id" value={s.id} />
                <div>
                  <label className="label">氏名</label>
                  <input name="name" defaultValue={s.name} className="input" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">権限</label>
                    <select
                      name="role"
                      defaultValue={s.role}
                      className="input"
                      disabled={s.id === session.staffId}
                    >
                      <option value="staff">スタッフ</option>
                      <option value="admin">管理者</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">固定残業（時間/月）</label>
                    <input
                      name="fixed_overtime_hours"
                      type="number"
                      min={0}
                      defaultValue={s.fixedOvertimeHours}
                      className="input"
                    />
                  </div>
                </div>
                <div>
                  <label className="label">新しいパスワード（変更する場合のみ・8文字以上）</label>
                  <input name="new_password" type="password" autoComplete="new-password" className="input" />
                </div>
                <label className="flex items-center gap-2 text-sm font-bold text-stone-600">
                  <input
                    type="checkbox"
                    name="is_active"
                    defaultChecked={s.isActive}
                    disabled={s.id === session.staffId}
                    className="h-5 w-5 accent-rose-500"
                  />
                  有効（オフにするとログインできなくなります）
                </label>
                {s.id === session.staffId && (
                  <p className="text-xs text-stone-400">※ 自分自身の権限・有効フラグは変更できません</p>
                )}
                <button type="submit" className="btn-secondary w-full">この内容で更新</button>
              </form>
            </details>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="font-bold text-base mb-3">スタッフを追加</h2>
        <form action={createStaffAction} className="space-y-3">
          <div>
            <label className="label" htmlFor="new_name">氏名</label>
            <input id="new_name" name="name" className="input" placeholder="例）佐藤 美咲" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="new_login_id">ログインID（半角英数）</label>
              <input
                id="new_login_id"
                name="login_id"
                className="input"
                autoCapitalize="none"
                pattern="[a-zA-Z0-9_-]+"
                placeholder="例）misaki"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="new_role">権限</label>
              <select id="new_role" name="role" className="input" defaultValue="staff">
                <option value="staff">スタッフ</option>
                <option value="admin">管理者</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="new_password2">初期パスワード（8文字以上）</label>
              <input
                id="new_password2"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="new_overtime">固定残業（時間/月）</label>
              {/* TODO: 固定残業時間の既定値は仮で20時間。契約内容に合わせて変更する */}
              <input
                id="new_overtime"
                name="fixed_overtime_hours"
                type="number"
                min={0}
                defaultValue={20}
                className="input"
              />
            </div>
          </div>
          <button type="submit" className="btn-primary w-full">スタッフを追加</button>
        </form>
      </section>

      <section className="card mt-5">
        <h2 className="font-bold text-sm text-stone-500 mb-2">ロゴ画像の差し替え</h2>
        <p className="text-xs text-stone-500">
          ヘッダーのロゴは <code className="font-bold">public/logo.svg</code>{" "}
          を差し替えるだけで反映されます（PNGの場合はファイル名を logo.svg のまま中身を置き換えるか、
          src/components/app-header.tsx の参照先を変更）。正式ロゴの受領後に対応します。
        </p>
      </section>
    </div>
  );
}
