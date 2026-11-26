import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { isAnthropicConfigured } from "@/lib/env";
import { isPromptAvailable } from "@/lib/ai-shimon/prompt";
import { hasPermission } from "@/lib/permissions";
import { getAiShimonNotice } from "@/lib/ai-shimon/training";
import { getDataStore } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AiShimonChat } from "./chat-client";

export const dynamic = "force-dynamic";

// AIしもん：代表しもんの分身として、全スタッフが壁打ちできる相談相手。
// 画面の履歴は端末（この画面を開いたブラウザ）に残す。相談文と返答はサーバーにも記録し、
// 代表（権限「AIしもんの相談を見られる」。代表にしか付けられない）だけが「みんなの相談」で読める。
// 2026-11（依頼11）から、スタッフの画面に「相談内容は代表が見ることがあります」を常に出す。
// 教育（AIしもんの考え方・知識）は代表だけが「教育」の画面（/staff/ai-shimon/training）で足す。
export default async function AiShimonPage() {
  const session = await requireSession();
  const ready = isAnthropicConfigured() && isPromptAvailable();
  const [canSeeLogs, canTrain, notice] = await Promise.all([
    hasPermission(session, "ai_shimon_logs"),
    hasPermission(session, "ai_shimon_training"),
    getAiShimonNotice(getDataStore()),
  ]);

  return (
    <div className="page-narrow">
      <PageHeader title="AIしもん" description="24時間ナカシモン" backHref="/staff" />
      {canTrain && (
        <Link
          href="/staff/ai-shimon/training"
          className="card !p-3.5 mb-3 flex items-center gap-3 border-violet-200 bg-violet-50/60 hover:border-violet-300"
        >
          <span className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-violet-400 to-violet-700 text-white flex items-center justify-center">
            <Icon name="sparkles" className="w-5 h-5" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-ink-900">AIしもんを教育する</span>
            <span className="block text-[11px] text-ink-500">考え方・判断の基準・言葉を足す・直す（代表だけ）</span>
          </span>
          <Icon name="chevronRight" className="w-4 h-4 shrink-0 text-violet-400" />
        </Link>
      )}
      {canSeeLogs && (
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
      <AiShimonChat staffId={session.staffId} ready={ready} isAdmin={session.role === "admin"} notice={notice} />
    </div>
  );
}
