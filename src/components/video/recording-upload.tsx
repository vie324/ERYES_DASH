"use client";

// 依頼23：面接の録画を上げる部品。応募者の同意のチェックが無いと上げられない（サーバーでも確かめる）。

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finishRecordingUploadAction, prepareRecordingUploadAction } from "@/app/staff/recruit/actions";
import { sendFile } from "./upload-utils";

export function RecordingUpload({ applicantId, interviews, consentText }: { applicantId: string; interviews: { id: string; label: string }[]; consentText: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [interviewId, setInterviewId] = useState(interviews[0]?.id ?? "");
  const [consent, setConsent] = useState(false);
  const [note, setNote] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const start = async () => {
    setError("");
    setMessage("");
    if (!consent) return setError("応募者の同意のチェックを入れてください");
    if (!file) return setError("録画のファイルを選んでください");
    if (file.size > 200 * 1024 * 1024) return setError("200MBまでの動画にしてください");
    setPct(0);
    const ticket = await prepareRecordingUploadAction(applicantId, interviewId, file.name, consent, note);
    if (!ticket.ok) {
      setPct(null);
      return setError(ticket.error);
    }
    const body = new FormData();
    if (ticket.provider === "supabase") {
      body.append("cacheControl", "3600");
      body.append("", file);
    } else {
      body.append("file", file);
    }
    const ok = await sendFile(ticket.method, ticket.uploadUrl, body, setPct);
    const done = await finishRecordingUploadAction(ticket.id, !ok);
    setPct(null);
    if (!done.ok) return setError(done.message);
    setMessage(done.message);
    setFile(null);
    setConsent(false);
    router.refresh();
  };

  return (
    <div className="space-y-2">
      {interviews.length > 1 && (
        <select value={interviewId} onChange={(e) => setInterviewId(e.target.value)} className="input">
          {interviews.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
      )}
      <label className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 shrink-0" />
        <span>{consentText}</span>
      </label>
      <input value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="同意のメモ（例：面接の始めに口頭で確認）" maxLength={300} />
      <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
      {pct !== null && (
        <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      <button type="button" disabled={pct !== null || !consent} onClick={() => void start()} className="btn-primary w-full">
        {pct !== null ? `アップロード中… ${pct}%` : "録画を上げる"}
      </button>
      {message && <p className="text-xs font-bold text-emerald-700">{message}</p>}
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
    </div>
  );
}
