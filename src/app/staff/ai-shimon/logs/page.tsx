import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { addDays, formatDateJa, formatDateTimeJa, toJstDateString, todayJst } from "@/lib/date";
import { avatarColor } from "@/lib/chat";
import { hasPermission } from "@/lib/permissions";
import { TRAINING_KINDS } from "@/lib/ai-shimon/training";
import { createTrainingAction } from "../training/actions";
import { EmptyState, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { AiShimonThread } from "@/lib/data/types";

export const dynamic = "force-dynamic";

/** 一覧に出す相談の数（最後のやりとりが新しい順） */
const LIST_LIMIT = 150;

// みんなの相談（AIしもん）：スタッフ全員のAIしもんとのやりとりを、代表だけが読める画面。
//  ・一覧 ……… 人ごと（?staff=）・日付ごと（?date=）に絞り込める。1件＝ひと続きの相談（「新しく相談する」で区切られる）
//  ・相談の中身 … ?staff=＜スタッフID＞&thread=＜相談ID＞。AIの返事ごとに「本当はこう答えてほしい」を書くと教育に足せる
// 見られるのは権限「AIしもんの相談を見られる」を持つ人（代表にしか付けられない。lib/permissions.ts）。
// 管理者でも代表以外は見られない。それ以外はAIしもんの画面へ戻す。
export default async function AiShimonLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ staff?: string; thread?: string; date?: string }>;
}) {
  const session = await requireSession();
  if (!(await hasPermission(session, "ai_shimon_logs"))) redirect("/staff/ai-shimon");
  const canTrain = await hasPermission(session, "ai_shimon_training");
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
                {m.role === "assistant" && canTrain && (
                  <details className="mt-1 w-full max-w-md">
                    <summary className="cursor-pointer list-none text-[11px] font-bold text-violet-700 underline px-1">
                      本当はこう答えてほしい（教育に足す）
                    </summary>
                    <form action={createTrainingAction} className="card !p-3 mt-1.5 space-y-2">
                      <input type="hidden" name="source_staff" value={params.staff} />
                      <input type="hidden" name="source_thread" value={params.thread} />
                      <select name="kind" defaultValue="answer" className="input !min-h-10 !py-1.5 !text-sm">
                        {TRAINING_KINDS.map((k) => (
                          <option key={k.key} value={k.key}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                      <input name="title" className="input !min-h-10 !py-1.5 !text-sm" placeholder="見出し（例：テストに落ちて落ち込んでいるとき）" maxLength={80} />
                      <textarea name="body" rows={4} required className="input !text-sm" maxLength={4000} placeholder="こういう相談には、こう答えてほしい（相談した人の名前や具体的な出来事は書かない）" />
                      <button type="submit" className="btn-primary btn-sm w-full">
                        教育に足す
                      </button>
                    </form>
                  </details>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="hint mt-6">
          この画面は代表だけが見られます。スタッフのAIしもんの画面には「相談内容は代表が見ることがあります」と常に出ています。
        </p>
      </div>
    );
  }

  // ---------------- 一覧 ----------------
  const allThreads = await db.listAiShimonThreads({ limit: LIST_LIMIT });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : "";
  const byStaff: AiShimonThread[] = params.staff
    ? await db.listAiShimonThreads({ staffId: params.staff, limit: LIST_LIMIT })
    : allThreads;
  // 日付ごと：その日に相談したもの（始めた日か、最後にやりとりした日がその日）
  const threads = date
    ? byStaff.filter((t) => toJstDateString(t.startedAt) === date || toJstDateString(t.lastAt) === date)
    : byStaff;
  const today = todayJst();
  const recentDays = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  const q = (patch: { staff?: string; date?: string }) => {
    const sp = new URLSearchParams();
    const staff = "staff" in patch ? patch.staff : params.staff;
    const d = "date" in patch ? patch.date : date;
    if (staff) sp.set("staff", staff);
    if (d) sp.set("date", d);
    const str = sp.toString();
    return `/staff/ai-shimon/logs${str ? `?${str}` : ""}`;
  };

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

      <p className="text-xs font-bold text-ink-500 mb-1.5">日付ごと</p>
      <div className="flex gap-1.5 overflow-x-auto scroll-slim pb-1 mb-3">
        <Link href={q({ date: undefined })} className={`chip shrink-0 ${!date ? "chip-active" : ""}`}>
          すべての日
        </Link>
        {recentDays.map((d) => (
          <Link key={d} href={q({ date: d })} className={`chip shrink-0 ${date === d ? "chip-active" : ""}`}>
            {formatDateJa(d)}
          </Link>
        ))}
        <form action="/staff/ai-shimon/logs" className="flex gap-1 shrink-0">
          {params.staff && <input type="hidden" name="staff" value={params.staff} />}
          <input type="date" name="date" defaultValue={date} className="input !min-h-9 !py-1 !px-2 !text-xs w-36" aria-label="日付を選ぶ" />
          <button type="submit" className="chip shrink-0">表示</button>
        </form>
      </div>
      {people.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <Link href={q({ staff: undefined })} className={`chip ${!params.staff ? "chip-active" : ""}`}>
            全員<span className="opacity-70">{allThreads.length}</span>
          </Link>
          {people.map((p) => (
            <Link
              key={p.staffId}
              href={q({ staff: p.staffId })}
              className={`chip ${params.staff === p.staffId ? "chip-active" : ""}`}
            >
              {nameOf(p.staffId)}
              <span className="opacity-70">{p.count}</span>
            </Link>
          ))}
        </div>
      )}

      {threads.length === 0 ? (
        <EmptyState message={date ? `${formatDateJa(date)}の相談はありません` : "まだ相談の記録はありません（この機能を入れた後の相談から記録されます）"} />
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
        スタッフのAIしもんの画面には「相談内容は代表が見ることがあります」と常に出ています。
      </p>
    </div>
  );
}
