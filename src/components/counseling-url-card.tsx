// カウンセリングフォームのURLを管理画面に表示するカード。
// お客様用（LIFF）とテスト用（直接URL）を出し、リッチメニュー設定や共有に使えるようにする。

import { env, isLineConfigured } from "@/lib/env";

export function CounselingUrlCard() {
  const liffId = env.liffId;
  const appUrl = env.appUrl.replace(/\/$/, "");
  const directUrl = `${appUrl}/liff/counseling`;
  const liffUrl = liffId ? `https://liff.line.me/${liffId}` : "";
  const lineReady = isLineConfigured() && Boolean(liffId);

  return (
    <details className="card mb-4 group">
      <summary className="flex items-center gap-2 cursor-pointer list-none">
        <span className="font-bold text-sm flex-1">カウンセリングフォームのURL</span>
        <span className="text-xs text-stone-400 group-open:hidden">タップで表示</span>
        <span className="text-stone-300 transition-transform group-open:rotate-180">▾</span>
      </summary>

      <div className="mt-3 pt-3 border-t border-brand-100 space-y-4 text-sm">
        {/* お客様用（LINE経由） */}
        <div>
          <p className="font-bold text-ink-700 mb-1">お客様用（LINEのリッチメニューに設定）</p>
          {liffUrl ? (
            <code className="block bg-brand-50 border border-brand-200 rounded-lg px-3 py-2 text-xs break-all select-all">
              {liffUrl}
            </code>
          ) : (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              LIFF未設定です。LINE Developersでカウンセリング用のLIFFを作成し、環境変数
              <code className="font-bold">NEXT_PUBLIC_LIFF_ID</code>{" "}
              を設定すると、ここにお客様用URL（liff.line.me/…）が表示されます。
            </p>
          )}
          <p className="text-xs text-stone-500 mt-1">
            このURLをLINE公式アカウントのリッチメニュー「カウンセリング」ボタンに設定します。
            お客様がLINEから開くと、そのお客様のLINEアカウントと自動で紐付きます。
          </p>
        </div>

        {/* テスト・直接URL */}
        <div>
          <p className="font-bold text-ink-700 mb-1">テスト用・直接URL（動作確認用）</p>
          <code className="block bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-xs break-all select-all">
            {directUrl}
          </code>
          <p className="text-xs text-stone-500 mt-1">
            ブラウザで直接開けます。
            {lineReady
              ? "LINEログインを経由してお客様を識別します。"
              : "LINE未接続の間は「テスト用ユーザーID」を手入力するデモ動作になり、実際のお客様の紐付けはできません。"}
          </p>
        </div>

        {!lineReady && (
          <p className="text-xs text-stone-400">
            ※ 実運用（LINE追加→自動で氏名登録→このフォームで顧客と自動紐付け）には、LINE
            Messaging API と LIFF の接続が必要です。手順は README「LINE Developers
            設定手順」をご覧ください。
          </p>
        )}
      </div>
    </details>
  );
}
