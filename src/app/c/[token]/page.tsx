/* eslint-disable @next/next/no-img-element */
// 来店前カウンセリングの公開ページ（SMSで送ったURL）。
// ログイン・LINE不要。トークンが有効なら通常のカウンセリングフォームを表示する。

import { getDataStore } from "@/lib/data";
import { getLogoSrc } from "@/lib/logo";
import { Icon } from "@/components/icons";
import { CounselingForm } from "@/app/liff/counseling/counseling-form";

export const dynamic = "force-dynamic";

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-dvh bg-brand-50 flex flex-col">
      <header className="bg-white/90 backdrop-blur border-b border-brand-200 py-5 text-center">
        <img src={getLogoSrc("eyes")} alt="EREYS" className="h-10 w-auto mx-auto" />
      </header>
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="card text-center py-10 px-6 max-w-md w-full space-y-3">
          <Icon name="checkCircle" className="w-12 h-12 mx-auto text-brand-500" />
          <p className="font-display text-xl font-bold">{title}</p>
          <p className="text-sm text-ink-500 whitespace-pre-wrap">{body}</p>
        </div>
      </main>
    </div>
  );
}

export default async function PublicCounselingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getDataStore().getCounselingInviteByToken(token);

  if (!invite) {
    return (
      <Notice
        title="このURLは無効です"
        body={"リンクが正しくコピーされていない可能性があります。\nお手数ですが、お店までお問い合わせください。"}
      />
    );
  }
  if (invite.answeredAt) {
    return (
      <Notice
        title="ご回答ありがとうございました"
        body={"このカウンセリングはすでに回答済みです。\n内容の変更はお店までご連絡ください。\n当日お会いできるのを楽しみにしております。"}
      />
    );
  }

  return (
    <CounselingForm
      liffId=""
      inviteToken={invite.token}
      initialName={invite.customerName}
      logoSrc={getLogoSrc("eyes")}
    />
  );
}
