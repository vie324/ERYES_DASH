// 来店前カウンセリングをSMSで送るカード（スタッフ／管理者のカウンセリング画面に置く）。
// お名前と携帯番号を入れて発行すると、LINE不要の回答URL（/c/…）ができる。
// 発行直後はSMS送信ボタン（本文入りでSMSアプリが開く）とコピーを大きく出す。

import Link from "next/link";
import { getDataStore } from "@/lib/data";
import { env } from "@/lib/env";
import { formatDateTimeJa } from "@/lib/date";
import { Icon } from "@/components/icons";
import { StatusBadge } from "@/components/ui";
import { CopyButton, SmsSendButton } from "@/components/counseling-invite-client";
import {
  createCounselingInviteAction,
  deleteCounselingInviteAction,
} from "@/app/staff/counseling/actions";

/** SMS本文（お客様に届く文章。送信前にSMSアプリ内で編集もできる） */
function smsBody(customerName: string, url: string): string {
  return `【EREYS】${customerName}様\nご来店前カウンセリングのお願いです。ご来店までに、こちらのURLからご入力をお願いいたします。\n${url}`;
}

export async function CounselingInviteCard({
  back,
  highlightId,
  error,
}: {
  /** このカードを置いている画面（アクション後に戻る先） */
  back: "/staff/counseling" | "/admin/counseling";
  /** 発行直後の案内ID（?invite=…）。送信パネルを大きく出す */
  highlightId?: string;
  /** ?invite_error=… の値 */
  error?: string;
}) {
  const invites = await getDataStore().listCounselingInvites(10);
  const appUrl = env.appUrl.replace(/\/$/, "");
  const urlOf = (token: string) => `${appUrl}/c/${token}`;
  const highlight = highlightId ? invites.find((i) => i.id === highlightId) : undefined;
  const responseHref = (responseId: string) =>
    back === "/admin/counseling" ? `/admin/counseling/${responseId}` : `/staff/counseling/${responseId}`;

  return (
    <details className="card mb-4 group" open={Boolean(highlight) || error === "input"} id="invite-panel">
      <summary className="flex items-center gap-2 cursor-pointer list-none">
        <Icon name="send" className="w-4 h-4 text-brand-600 shrink-0" />
        <span className="font-bold text-sm flex-1">来店前カウンセリングをSMSで送る</span>
        <span className="text-ink-300 transition-transform group-open:rotate-180">▾</span>
      </summary>

      <div className="mt-3 pt-3 border-t border-brand-100 space-y-4">
        <p className="text-xs text-ink-500">
          お名前と携帯番号を入れて発行すると、お客様専用の回答URLができます（LINE不要）。
          発行後は「SMSアプリで送る」からそのまま送信できます。
        </p>

        {error === "input" && (
          <p className="rounded-xl bg-red-50 text-red-600 text-xs font-bold px-3 py-2.5">
            お名前と携帯番号（数字10〜13桁）を確認してください
          </p>
        )}

        {/* 発行フォーム */}
        <form action={createCounselingInviteAction} className="grid grid-cols-2 gap-3">
          <input type="hidden" name="back" value={back} />
          <div>
            <label className="label" htmlFor="invite-name">
              お客様のお名前
            </label>
            <input
              id="invite-name"
              name="customer_name"
              className="input"
              placeholder="例）高橋 ゆい"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="invite-phone">
              携帯電話番号
            </label>
            <input
              id="invite-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              className="input"
              placeholder="090xxxxxxxx"
              required
            />
          </div>
          <button type="submit" className="btn-primary col-span-2">
            案内URLを発行する
          </button>
        </form>

        {/* 発行直後の送信パネル */}
        {highlight && (
          <div className="rounded-2xl border-2 border-brand-400 bg-brand-50 p-4 space-y-3">
            <p className="text-sm font-bold text-brand-800">
              {highlight.customerName}様（{highlight.phone}）の案内URLを発行しました
            </p>
            <code className="block bg-white border border-brand-200 rounded-lg px-3 py-2 text-xs break-all select-all">
              {urlOf(highlight.token)}
            </code>
            <SmsSendButton
              phone={highlight.phone}
              body={smsBody(highlight.customerName, urlOf(highlight.token))}
            />
            <CopyButton text={urlOf(highlight.token)} />
            <p className="text-[11px] text-ink-500">
              送信ボタンを押すと、この端末のSMSアプリが本文入りで開きます（内容を確認して送信してください）。
              PCで開いている場合は「URLをコピー」してお使いの送信手段でお送りください。
            </p>
          </div>
        )}

        {/* 送付履歴 */}
        {invites.length > 0 && (
          <div>
            <p className="text-xs font-bold text-ink-600 mb-2">送付履歴（直近10件）</p>
            <div className="space-y-2">
              {invites.map((invite) => (
                <div key={invite.id} className="rounded-xl border border-ink-200 p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-ink-900">{invite.customerName} 様</span>
                    <span className="text-xs text-ink-500">{invite.phone}</span>
                    <span className="ml-auto">
                      {invite.answeredAt ? (
                        <StatusBadge label="回答済み" tone="ok" />
                      ) : (
                        <StatusBadge label="未回答" tone="warning" />
                      )}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-400 mt-1">
                    発行：{formatDateTimeJa(invite.createdAt)}
                    {invite.answeredAt && ` ／ 回答：${formatDateTimeJa(invite.answeredAt)}`}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    {invite.answeredAt && invite.responseId ? (
                      <Link
                        href={responseHref(invite.responseId)}
                        className="text-xs font-bold text-brand-700 underline"
                      >
                        回答を見る
                      </Link>
                    ) : (
                      <>
                        <Link
                          href={`${back}?invite=${invite.id}#invite-panel`}
                          className="text-xs font-bold text-brand-700 underline"
                        >
                          もう一度送る・URLを表示
                        </Link>
                        <form action={deleteCounselingInviteAction} className="ml-auto">
                          <input type="hidden" name="id" value={invite.id} />
                          <input type="hidden" name="back" value={back} />
                          <button type="submit" className="text-[11px] font-bold text-ink-400 underline">
                            削除
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
