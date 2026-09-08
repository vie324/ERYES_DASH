import { requireSession } from "@/lib/auth/session";
import { isAnthropicConfigured } from "@/lib/env";
import { isPromptAvailable } from "@/lib/ai-shimon/prompt";
import { PageHeader } from "@/components/ui";
import { AiShimonChat } from "./chat-client";

export const dynamic = "force-dynamic";

// AIしもん：代表しもんの分身として、全スタッフが壁打ちできる相談相手。
// 会話の履歴は端末（この画面を開いたブラウザ）にだけ残し、サーバーには保存しない。
export default async function AiShimonPage() {
  const session = await requireSession();
  const ready = isAnthropicConfigured() && isPromptAvailable();

  return (
    <div className="page-narrow">
      <PageHeader title="AIしもん" backHref="/staff" />
      <AiShimonChat staffId={session.staffId} ready={ready} isAdmin={session.role === "admin"} />
    </div>
  );
}
