// AIしもんの相談の記録を「相談（ひと続きのやりとり）」ごとにまとめる。
// DBには発言を1件ずつ保存しているので、一覧は相談した人の発言から組み立てる（mock / supabase 共通）。

import type { AiShimonMessage, AiShimonThread } from "@/lib/data/types";

/** 相談した人の発言（role=user）を、相談ごとにまとめて新しい順に並べる */
export function summarizeThreads(userMessages: AiShimonMessage[], limit: number): AiShimonThread[] {
  const threads = new Map<string, AiShimonThread>();
  for (const m of userMessages) {
    if (m.role !== "user") continue;
    // 同じIDでも人が違えば別の相談として扱う（IDは端末から届くため）
    const key = `${m.staffId}:${m.threadId}`;
    const found = threads.get(key);
    if (!found) {
      threads.set(key, {
        staffId: m.staffId,
        threadId: m.threadId,
        startedAt: m.createdAt,
        lastAt: m.createdAt,
        firstMessage: m.content,
        turns: 1,
      });
      continue;
    }
    found.turns += 1;
    if (m.createdAt < found.startedAt) {
      found.startedAt = m.createdAt;
      found.firstMessage = m.content;
    }
    if (m.createdAt > found.lastAt) found.lastAt = m.createdAt;
  }
  return [...threads.values()]
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
    .slice(0, limit);
}
