import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { formatDateTimeJa } from "@/lib/date";
import { avatarColor } from "@/lib/chat";
import { isAiShimonOwner } from "@/lib/ai-shimon/access";
import { EmptyState, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { AiShimonThread } from "@/lib/data/types";

export const dynamic = "force-dynamic";

/** 一覧に出す相談の数（最後のやりとりが新しい順） */
const LIST_LIMIT = 150;

// みんなの相談（AIしもん）：スタッフ全員のAIしもんとのやりとりを、代表だけが読める画面。
//  ・一覧 ……… 人ごとに絞り込める。1件＝ひと続きの相談（「新しく相談する」で区切られる）
//  ・相談の中身 … ?staff=＜スタッフID＞&thread=＜相談ID＞
// 代表の判定は staff.is_owner（アプリの画面からは変えられない）。代表以外はAIしもんの画面へ戻す。
export default async function AiShimonLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ staff?: string; thread?: string }>;
}) {
  const session = await requireSession();
  if (!(await isAiShimonOwner(session))) redirect("/staff/ai-shimon");
  const params = await searchParams;
  const db = getDataStore();
  const staffList = await db.listStaff();
  const nameOf = (id: string) => staffList.find((s) => s.id === id)?.name ?? "（退職したスタッフ）";

  // ---------------- 相談の中身 ----------------
  if (params.staff && params.thread) {
    const messages = await db.listAiShimonMessages(params.staff, params.thread);
    if (messages.length === 0) redirect(`/staff/ai-shimon/logs?staff=${encodeURIComponent(params.staff)}`);
    const name = nameOf(params.staff);
    return (
      <div className="page-narrow">
        <PageHeader
          title={`${name}さんの相談`}
          backHref={`/staff/ai-shimon/logs?staff=${encodeURIComponent(params.staff)}`}
          backLabel="相談の一覧へ戻る"
          description={`${formatDateTimeJa(messages[0].createdAt)} から（右＝${name}さん／左＝AIしもん）`}
          icon="bot"
        />
        <div className="space-y-3">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <span className="w-8 h-8 shrink-0 mr-2 mt-0.5 rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center">
                  <Icon name="bot" className="w-4 h-4" />
                </span>
              )}
              <div className={`max-w-[85%] flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
                    m.role === "user"
                      ? "bg-gradient-to-b from-brand-500 to-brand-600 text-white rounded-br-md"
                      : "bg-white border border-ink-200 text-ink-900 rounded-bl-md"
                  }`}
                >
                  {m.content}
                </div>
                <span className="mt-0.5 px-1 text-[10px] text-ink-400">{formatDateTimeJa(m.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="hint mt-6">
          この画面は代表だけが見られます。スタッフの画面には、相談が記録されることや代表が読めることは表示していません。
        </p>
      </div>
    );
  }

  // ---------------- 一覧 ----------------
  const allThreads = await db.listAiShimonThreads({ limit: LIST_LIMIT });
  const threads: AiShimonThread[] = params.staff
    ? await db.listAiShimonThreads({ staffId: params.staff, limit: LIST_LIMIT })
    : allThreads;

  // 人ごとの件数（絞り込みのボタンに出す）。相談が新しい人から並べる
  const people: { staffId: string; count: number }[] = [];
  for (const t of allThreads) {
    const found = people.find((p) => p.staffId === t.staffId);
    if (found) found.count += 1;
    else people.push({ staffId: t.staffId, count: 1 });
  }

  return (
    <div className="page-narrow">
      <PageHeader
        title="みんなの相談"
        backHref="/staff/ai-shimon"
        backLabel="AIしもんへ戻る"
        description="スタッフ全員のAIしもんとのやりとり。代表だけが見られる画面です"
        icon="users"
      />

      {people.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <Link href="/staff/ai-shimon/logs" className={`chip ${!params.staff ? "chip-active" : ""}`}>
            全員<span className="opacity-70">{allThreads.length}</span>
          </Link>
          {people.map((p) => (
            <Link
              key={p.staffId}
              href={`/staff/ai-shimon/logs?staff=${encodeURIComponent(p.staffId)}`}
              className={`chip ${params.staff === p.staffId ? "chip-active" : ""}`}
            >
              {nameOf(p.staffId)}
              <span className="opacity-70">{p.count}</span>
            </Link>
          ))}
        </div>
      )}

      {threads.length === 0 ? (
        <EmptyState message="まだ相談の記録はありません（この機能を入れた後の相談から記録されます）" />
      ) : (
        <div className="space-y-2">
          {threads.map((t) => {
            const name = nameOf(t.staffId);
            return (
              <Link
                key={`${t.staffId}:${t.threadId}`}
                href={`/staff/ai-shimon/logs?staff=${encodeURIComponent(t.staffId)}&thread=${encodeURIComponent(t.threadId)}`}
                className="card !p-3.5 block transition-colors hover:border-brand-300"
              >
                <span className="flex items-center gap-2">
                  <span
                    className="w-7 h-7 shrink-0 rounded-full text-white text-xs font-bold flex items-center justify-center"
                    style={{ backgroundColor: avatarColor(t.staffId) }}
                    aria-hidden="true"
                  >
                    {name.trim().charAt(0) || "？"}
                  </span>
                  <span className="min-w-0 truncate text-sm font-bold text-ink-900">{name}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-ink-400">{formatDateTimeJa(t.lastAt)}</span>
                </span>
                <span className="mt-1.5 block text-sm text-ink-700 line-clamp-2 whitespace-pre-wrap">
                  {t.firstMessage}
                </span>
                <span className="mt-1 block text-[11px] text-ink-400">
                  相談 {t.turns}回
                  {t.turns > 1 && `（${formatDateTimeJa(t.startedAt)} から）`}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <p className="hint mt-5">
        相談した人が画面の「新しく相談する」を押すまでのやりとりを、1件にまとめています。
        スタッフの画面には、相談が記録されることや代表が読めることは表示していません。
      </p>
    </div>
  );
}
