"use client";

// 議事録エディタ：当日の生メモ →「AIで整形」→ 整った議事録＋タスク（誰が・何を・いつまでに）を
// 確認・微修正 → 保存。タスクは会議のあとに完了チェックできる形で保存される。

import { useState } from "react";
import { Markdown } from "@/lib/markdown";
import { PhotoInput } from "@/components/photo-input";
import type { Staff } from "@/lib/data/types";
import { saveMeetingMinutesAction } from "@/app/staff/meetings/actions";

interface TaskDraft {
  title: string;
  assignee: string;
  due: string;
}

export function MinutesEditor({
  meetingId,
  month,
  initialText,
  initialPhoto,
  initialTasks,
  staff,
}: {
  meetingId: string;
  month: string;
  initialText: string;
  initialPhoto: string;
  initialTasks: TaskDraft[];
  staff: Staff[];
}) {
  const [rawNotes, setRawNotes] = useState("");
  const [minutesText, setMinutesText] = useState(initialText);
  const [tasks, setTasks] = useState<TaskDraft[]>(initialTasks);
  const [generating, setGenerating] = useState(false);
  const [aiFlag, setAiFlag] = useState(false);
  const [notice, setNotice] = useState("");

  const patchTask = (i: number, patch: Partial<TaskDraft>) =>
    setTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  const generate = async () => {
    if (!rawNotes.trim() || generating) return;
    setGenerating(true);
    setNotice("");
    try {
      const res = await fetch("/api/meetings/ai-minutes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, rawNotes }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        markdown?: string;
        tasks?: TaskDraft[];
        ai?: boolean;
        error?: string;
      };
      if (data.ok && data.markdown) {
        setMinutesText(data.markdown);
        setTasks(data.tasks ?? []);
        setAiFlag(Boolean(data.ai));
        setNotice(
          data.ai
            ? `AIで整形しました（タスク${data.tasks?.length ?? 0}件）。内容を確認・微修正して保存してください。`
            : "テンプレートで整形しました（AI未設定）。内容を編集して保存してください。"
        );
      } else {
        setNotice(data.error ?? "整形に失敗しました");
      }
    } catch {
      setNotice("通信に失敗しました");
    }
    setGenerating(false);
  };

  return (
    <div className="space-y-3">
      {/* 生メモ → AI整形 */}
      <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3 space-y-2">
        <label className="label !mb-1" htmlFor={`raw-${meetingId}`}>
          当日の生メモ（箇条書き・走り書きでOK）
        </label>
        <textarea
          id={`raw-${meetingId}`}
          value={rawNotes}
          onChange={(e) => setRawNotes(e.target.value)}
          rows={4}
          placeholder={"例）\n・カラー剤の在庫が減っている→岡さんが来週までに発注\n・POPは松本さんが今月中に作る\n・アシスタントの練習時間が不足気味"}
          className="input min-h-24"
        />
        <button
          type="button"
          onClick={generate}
          disabled={generating || !rawNotes.trim()}
          className="btn-primary w-full disabled:opacity-50"
        >
          {generating ? "整形中…（30秒ほどかかります）" : "AIで議事録に整える（タスク整理つき）"}
        </button>
        {notice && <p className="text-xs font-bold text-brand-700">{notice}</p>}
        <p className="text-[11px] text-stone-500">
          「いつまでに・何を・誰がやるのか」を自動で表と一覧に整理します。
        </p>
      </div>

      {/* プレビュー */}
      {minutesText && (
        <div className="rounded-xl border border-stone-200 p-3">
          <p className="text-[11px] font-bold text-stone-400 mb-1">プレビュー</p>
          <Markdown text={minutesText} />
        </div>
      )}

      {/* 保存フォーム（本文Markdown＋タスク＋写真） */}
      <form action={saveMeetingMinutesAction} className="space-y-3">
        <input type="hidden" name="id" value={meetingId} />
        <input type="hidden" name="month" value={month} />
        <input type="hidden" name="ai_flag" value={aiFlag ? "1" : "0"} />
        <input type="hidden" name="tasks" value={JSON.stringify(tasks)} />

        <div>
          <label className="label" htmlFor={`text-${meetingId}`}>
            議事録（Markdown・手直しできます）
          </label>
          <textarea
            id={`text-${meetingId}`}
            name="minutes_text"
            value={minutesText}
            onChange={(e) => setMinutesText(e.target.value)}
            rows={8}
            className="input min-h-40 font-mono text-xs"
          />
        </div>

        {/* タスク（誰が・何を・いつまでに） */}
        <div className="rounded-xl border border-stone-200 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="label !mb-0">タスク（誰が・何を・いつまでに）</p>
            <button
              type="button"
              onClick={() => setTasks((prev) => [...prev, { title: "", assignee: "", due: "" }])}
              className="text-xs font-bold text-brand-700 border border-brand-300 rounded-full px-3 py-1"
            >
              ＋追加
            </button>
          </div>
          {tasks.length === 0 && (
            <p className="text-xs text-stone-400">（タスクはありません。AI整形するか「＋追加」で入れられます）</p>
          )}
          {tasks.map((t, i) => (
            <div key={i} className="rounded-lg border border-stone-200 p-2 space-y-2">
              <div className="flex items-start gap-2">
                <input
                  type="text"
                  value={t.title}
                  onChange={(e) => patchTask(i, { title: e.target.value })}
                  placeholder="何を（例：カラー剤を発注する）"
                  aria-label={`タスク${i + 1}の内容`}
                  className="input !min-h-10 !py-2 text-sm flex-1"
                />
                <button
                  type="button"
                  onClick={() => setTasks((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label={`タスク${i + 1}を削除`}
                  className="text-red-400 font-bold px-2 py-2"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  list={`assignees-${meetingId}`}
                  value={t.assignee}
                  onChange={(e) => patchTask(i, { assignee: e.target.value })}
                  placeholder="誰が"
                  aria-label={`タスク${i + 1}の担当`}
                  className="input !min-h-10 !py-2 text-sm"
                />
                <input
                  type="date"
                  value={t.due}
                  onChange={(e) => patchTask(i, { due: e.target.value })}
                  aria-label={`タスク${i + 1}の期限`}
                  className="input !min-h-10 !py-2 text-sm"
                />
              </div>
            </div>
          ))}
          <datalist id={`assignees-${meetingId}`}>
            {staff.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </div>

        <div>
          <p className="label !mb-1">議事録の写真（ホワイトボード等・任意）</p>
          <PhotoInput name="minutes_photo" initial={initialPhoto} label="議事録を撮影・選択" />
        </div>

        <button type="submit" className="btn-secondary w-full">
          議事録を保存（提出済みになります）
        </button>
      </form>
    </div>
  );
}
