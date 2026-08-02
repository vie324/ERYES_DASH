"use client";

import { useState } from "react";
import type { Staff } from "@/lib/data/types";
import type { MeetingTemplate } from "@/lib/eni/meetings-templates";
import { createMeetingAction } from "./actions";

type Mode = "committee" | "1on1" | "other";

export function MeetingCreateForm({
  staff,
  defaultHostId,
  templates,
  today,
  teamMembers,
}: {
  staff: Staff[];
  defaultHostId: string;
  templates: MeetingTemplate[];
  today: string;
  /** 組織図のチームキー → 所属スタッフID。会議体を選ぶと参加者が自動で入る */
  teamMembers: Record<string, string[]>;
}) {
  const membersOf = (key: string) => {
    const t = templates.find((x) => x.key === key);
    return new Set((t?.orgTeams ?? []).flatMap((teamKey) => teamMembers[teamKey] ?? []));
  };

  const [mode, setMode] = useState<Mode>("committee");
  const [committee, setCommittee] = useState(templates[0]?.key ?? "");
  const [agenda, setAgenda] = useState(templates[0]?.agenda ?? "");
  const [participants, setParticipants] = useState<Set<string>>(() => membersOf(templates[0]?.key ?? ""));

  const template = templates.find((t) => t.key === committee);

  const onTemplateChange = (key: string) => {
    setCommittee(key);
    const t = templates.find((x) => x.key === key);
    setAgenda(t?.agenda ?? "");
    setParticipants(membersOf(key)); // 組織図のチームメンバーを初期選択にする
  };

  const toggleParticipant = (id: string) =>
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <details className="card mb-4">
      <summary className="font-bold text-sm text-brand-700 cursor-pointer">＋ ミーティングを登録する</summary>
      <form action={createMeetingAction} className="space-y-3 mt-3 pt-3 border-t border-ink-100">
        {/* 種類 */}
        <div>
          <p className="label !mb-2">種類</p>
          <div className="flex gap-2">
            {([["committee", "会議体"], ["1on1", "1on1"], ["other", "その他"]] as [Mode, string][]).map(([v, label]) => (
              <label key={v} className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-ink-200 px-3 py-2.5 text-sm font-bold has-checked:border-brand-400 has-checked:bg-brand-50">
                <input type="radio" name="_mode" value={v} checked={mode === v} onChange={() => setMode(v)} className="h-4 w-4 accent-brand-500" />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* 会議体テンプレ */}
        {mode === "committee" ? (
          <>
            <input type="hidden" name="meeting_type" value="other" />
            <div>
              <label className="label" htmlFor="committee">会議体を選ぶ</label>
              <select id="committee" name="committee" value={committee} onChange={(e) => onTemplateChange(e.target.value)} className="input">
                {templates.map((t) => (
                  <option key={t.key} value={t.key}>{t.name}</option>
                ))}
              </select>
              {template && (
                <>
                  <p className="text-[11px] text-ink-500 mt-1">
                    {template.cadence} ／ 目安：{template.participantsHint}
                  </p>
                  <p className="text-[11px] text-ink-600 mt-0.5">{template.purpose}</p>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <input type="hidden" name="committee" value="" />
            <input type="hidden" name="meeting_type" value={mode} />
            {mode === "other" && (
              <div>
                <label className="label" htmlFor="title">題名</label>
                <input id="title" name="title" className="input" placeholder="例）臨時ミーティング" />
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="meeting_date">日付</label>
            <input id="meeting_date" name="meeting_date" type="date" defaultValue={today} className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="start_time">開始時間（任意）</label>
            <input id="start_time" name="start_time" type="time" className="input" />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="host_staff_id">{mode === "1on1" ? "実施する人" : "司会・記録"}</label>
          <select id="host_staff_id" name="host_staff_id" className="input" defaultValue={defaultHostId}>
            {staff.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </select>
        </div>

        {/* 1on1は相手、会議体/その他は複数参加者 */}
        {mode === "1on1" ? (
          <div>
            <label className="label" htmlFor="guest_staff_id">相手</label>
            <select id="guest_staff_id" name="guest_staff_id" className="input" defaultValue="">
              <option value="">（選択）</option>
              {staff.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </div>
        ) : (
          <div>
            <p className="label !mb-2">参加者（複数選択）</p>
            <div className="flex flex-wrap gap-1.5">
              {staff.map((s) => {
                const on = participants.has(s.id);
                return (
                  <label key={s.id} className={`chip cursor-pointer ${on ? "chip-active" : ""}`}>
                    <input type="checkbox" name="participants" value={s.id} checked={on} onChange={() => toggleParticipant(s.id)} className="hidden" />
                    {s.name}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* アジェンダ（会議体はテンプレ自動入力・編集可） */}
        <div>
          <label className="label" htmlFor="agenda">アジェンダ・議題</label>
          <textarea
            id="agenda"
            name="agenda"
            rows={4}
            value={mode === "committee" ? agenda : undefined}
            defaultValue={mode === "committee" ? undefined : ""}
            onChange={mode === "committee" ? (e) => setAgenda(e.target.value) : undefined}
            className="input min-h-24"
            placeholder="議題・話すこと"
          />
        </div>

        <button type="submit" className="btn-primary w-full">登録する</button>
      </form>
    </details>
  );
}
