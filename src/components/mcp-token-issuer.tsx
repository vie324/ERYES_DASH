"use client";

// 依頼21：秘密のトークンを出す部品。トークンはこの画面に1回だけ出し、URLや記録には残さない。

import { useState } from "react";
import { issueStaticTokenAction } from "@/app/admin/mcp/actions";

export function McpTokenIssuer() {
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const issue = async () => {
    setBusy(true);
    setError("");
    const r = await issueStaticTokenAction(label);
    setBusy(false);
    if (r.ok) setToken(r.token);
    else setError(r.error);
  };
  if (token) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2">
        <p className="text-xs font-bold text-amber-900">いまだけ表示します。コネクタの設定に貼り付けたら、この画面を閉じてください（もう一度は出せません）。</p>
        <code className="block break-all rounded-lg bg-white border border-amber-200 p-2 text-xs select-all">{token}</code>
        <button
          type="button"
          className="btn-secondary btn-sm w-full"
          onClick={() => {
            void navigator.clipboard?.writeText(token).then(() => setCopied(true));
          }}
        >
          {copied ? "コピーしました" : "コピーする"}
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <input value={label} onChange={(e) => setLabel(e.target.value)} className="input" placeholder="名前（例：Claude Code・自分のPC）" maxLength={60} />
      <button type="button" disabled={busy} onClick={() => void issue()} className="btn-secondary w-full">
        {busy ? "出しています…" : "秘密のトークンを出す"}
      </button>
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
    </div>
  );
}
