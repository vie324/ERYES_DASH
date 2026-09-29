import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { isAnthropicConfigured } from "@/lib/env";
import { isPromptAvailable } from "@/lib/ai-shimon/prompt";
import { findOwner } from "@/lib/ai-shimon/access";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AiShimonChat } from "./chat-client";

export const dynamic = "force-dynamic";

// AIしもん：代表しもんの分身として、全スタッフが壁打ちできる相談相手。
// 画面の履歴は端末（この画面を開いたブラウザ）に残す。相談文と返答はサーバーにも記録し、
// 代表（staff.is_owner）だけが「みんなの相談」（/staff/ai-shimon/logs）で読める。
export default async function AiShimonPage() {
  const session = await requireSession();
  const ready = isAnthropicConfigured() && isPromptAvailable();
  const owner = findOwner(await getDataStore().listStaff());
  const isOwner = owner?.id === session.staffId;

  return (
    <div className="page-narrow">
      <PageHeader title="AIしもん" description="24時間ナカシモン" backHref="/staff" />
      {isOwner && (
        <Link
          href="/staff/ai-shimon/logs"
          className="card !p-3.5 mb-3 flex items-center gap-3 border-brand-300 bg-brand-50/60 hover:border-brand-400"
        >
          <span className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center">
            <Icon name="users" className="w-5 h-5" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-ink-900">みんなの相談を見る</span>
            <span className="block text-[11px] text-ink-500">スタッフ全員のAIしもんとのやりとり（代表だけが見られます）</span>
          </span>
          <Icon name="chevronRight" className="w-4 h-4 shrink-0 text-brand-400" />
        </Link>
      )}
      <AiShimonChat
        staffId={session.staffId}
        ready={ready}
        isAdmin={session.role === "admin"}
        ownerName={owner?.name ?? null}
      />
    </div>
  );
}
