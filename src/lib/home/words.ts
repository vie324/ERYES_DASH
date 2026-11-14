// しもんさんの言葉：1日1つ、全員に同じものを、登録順にくり返さず出す（全部出たら最初に戻る）。
// 言葉は代表が書きためたものを管理者が登録する（AIで作ったり言い換えたりはしない）。
// 「その日にどの言葉を出したか」を daily_word_log に残し、次の日はその次の言葉を出す。
// 言葉を足したり、止めたり、消したりしても、順番が最初からやり直しにならない
// （止めた言葉は飛ばし、消した言葉はその前に出した言葉の続きから）。

import type { DailyWord, DailyWordShown, DataStore } from "@/lib/data/types";

/** 並び順→登録順に（管理画面の一覧と、出す順番で同じ並びを使う） */
export function sortWords(words: DailyWord[]): DailyWord[] {
  return [...words].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
}

/** 出してよい言葉か（運用中で、空でない） */
export function isUsableWord(w: DailyWord): boolean {
  return w.isActive && w.body.trim() !== "";
}

/** 運用中の言葉を、並び順→登録順に */
export function activeWords(words: DailyWord[]): DailyWord[] {
  return sortWords(words.filter(isUsableWord));
}

/**
 * 次に出す言葉。
 * history は、これまでに出した言葉のID（新しい順）。まだ残っている言葉のうち、いちばん最近に出したものの
 * 「並びで次」の運用中の言葉を返す（最後まで出たら最初に戻る）。何も出していなければ最初の言葉。
 */
export function pickNextWord(words: DailyWord[], history: (string | null)[]): DailyWord | null {
  const sorted = sortWords(words);
  const active = sorted.filter(isUsableWord);
  if (active.length === 0) return null;
  const lastId = history.find((id) => id && sorted.some((w) => w.id === id));
  if (!lastId) return active[0];
  const start = sorted.findIndex((w) => w.id === lastId);
  for (let step = 1; step <= sorted.length; step++) {
    const w = sorted[(start + step) % sorted.length];
    if (isUsableWord(w)) return w;
  }
  return active[0];
}

/** 今日より前に出した言葉のID（新しい順） */
function historyBefore(shown: DailyWordShown[], today: string): (string | null)[] {
  return [...shown]
    .filter((r) => r.date < today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((r) => r.wordId);
}

/**
 * 今日の言葉。登録が1件も無ければ null（朝の画面のこの部分は出さない）。
 * その日に最初に開いた人のときに決めて記録し、ほかの人も同じ言葉を見る。
 */
export async function getWordOfDay(db: DataStore, today: string): Promise<DailyWord | null> {
  const words = await db.listDailyWords();
  const usable = new Map(activeWords(words).map((w) => [w.id, w]));
  if (usable.size === 0) return null;

  const shown = await db.listDailyWordShown(60);
  const todayRow = shown.find((r) => r.date === today);
  if (todayRow?.wordId && usable.has(todayRow.wordId)) return usable.get(todayRow.wordId)!;

  const word = pickNextWord(words, historyBefore(shown, today));
  if (!word) return null;
  // 今日の分がまだ無ければ記録する（同時に開いた人がいても、先に記録された言葉にそろえる）
  if (!todayRow) {
    await db.recordDailyWordShown(today, word.id);
    const after = (await db.listDailyWordShown(3)).find((r) => r.date === today);
    if (after?.wordId && usable.has(after.wordId)) return usable.get(after.wordId)!;
  }
  return word;
}

/**
 * 管理画面の目印：今日の言葉と、次に出る言葉（記録はしない。読むだけ）。
 * 今日の分がまだ決まっていなければ、今日出る予定の言葉を today にする。
 */
export function previewWords(
  words: DailyWord[],
  shown: DailyWordShown[],
  today: string
): { todayId: string | null; nextId: string | null } {
  const usable = new Set(activeWords(words).map((w) => w.id));
  if (usable.size === 0) return { todayId: null, nextId: null };
  const todayRow = shown.find((r) => r.date === today);
  const todayId =
    todayRow?.wordId && usable.has(todayRow.wordId)
      ? todayRow.wordId
      : (pickNextWord(words, historyBefore(shown, today))?.id ?? null);
  const nextId = pickNextWord(words, [todayId])?.id ?? null;
  return { todayId, nextId: nextId === todayId ? null : nextId };
}
