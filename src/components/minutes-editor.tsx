"use client";

// 議事録エディタ：当日の生メモ →「AIで整形」→ 整った議事録（Markdown）を確認・微修正 → 保存。
// AIはアクションアイテム（誰・何・いつまでに）を表で整理する。

import { useState } from "react";
import { Markdown } from "@/lib/markdown";
import { PhotoInput } from "@/components/photo-input";
import { saveMeetingMinutesAction } from "@/app/staff/meetings/actions";

export function MinutesEditor({
  meetingId,
  month,
  initialText,
  initialPhoto,
}: {
  meetingId: string;
  month: string;
  initialText: string;
  initialPhoto: string;
}) {
  const [rawNotes, setRawNotes] = useState("");
  const [minutesText, setMinutesText] = useState(initialText);
  const [generating, setGenerating] = useState(false);
  const [aiFlag, setAiFlag] = useState(false);
  const [notice, setNotice] = useState("");

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
      const data = (await res.json()) as { ok: boolean; markdown?: string; ai?: boolean; error?: string };
      if (data.ok && data.markdown) {
        setMinutesText(data.markdown);
        setAiFlag(Boolean(data.ai));
        setNotice(
          data.ai
            ? "AIで整形しました。内容を確認・微修正して保存してください。"
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
          placeholder={"例）\n・カラー剤の在庫が減っている→発注\n・岡さんが来週POP作る\n・アシスタントの練習時間が不足気味"}
          className="input min-h-24"
        />
        <button
          type="button"
          onClick={generate}
          disabled={generating || !rawNotes.trim()}
          className="btn-primary w-full disabled:opacity-50"
        >
          {generating ? "整形中…" : "AIで議事録に整える（タスク整理つき）"}
        </button>
        {notice && <p className="text-xs font-bold text-brand-700">{notice}</p>}
      </div>

      {/* プレビュー */}
      {minutesText && (
        <div className="rounded-xl border border-stone-200 p-3">
          <p className="text-[11px] font-bold text-stone-400 mb-1">プレビュー</p>
          <Markdown text={minutesText} />
        </div>
      )}

      {/* 保存フォーム（本文Markdown＋写真） */}
      <form action={saveMeetingMinutesAction} className="space-y-2">
        <input type="hidden" name="id" value={meetingId} />
        <input type="hidden" name="month" value={month} />
        <input type="hidden" name="ai_flag" value={aiFlag ? "1" : "0"} />
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
        <p className="label !mb-1">議事録の写真（ホワイトボード等・任意）</p>
        <PhotoInput name="minutes_photo" initial={initialPhoto} label="議事録を撮影・選択" />
        <button type="submit" className="btn-secondary w-full">
          議事録を保存（提出済みになります）
        </button>
      </form>
    </div>
  );
}
