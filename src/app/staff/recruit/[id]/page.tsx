import { redirect } from "next/navigation";
import { getDataStore } from "@/lib/data";
import { fx } from "@/lib/data/tables";
import { requireViewer } from "@/lib/viewer";
import {
  accessTo,
  averageScore,
  DECISION_LABEL,
  ENDED,
  evaluationState,
  getRecruitSettings,
  interviewsOf,
  STATUS_LABEL,
} from "@/lib/recruit";
import { uploadProvider } from "@/lib/video";
import { formatDateJa, todayJst } from "@/lib/date";
import { PageHeader, StatusBadge } from "@/components/ui";
import { Flash, Note } from "@/components/feature-ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { ProtectedPlayer } from "@/components/video/protected-player";
import { RecordingUpload } from "@/components/video/recording-upload";
import {
  addKatibitoAction,
  cancelInterviewAction,
  decideAction,
  deleteRecordingAction,
  registerRecordingUrlAction,
  saveInterviewAction,
  setStatusAction,
  submitEvaluationAction,
  updateApplicantAction,
} from "../actions";

export const dynamic = "force-dynamic";

// 依頼23：応募者1人の画面。面接の予定（面接官3人まで）・評価シート（そろうまでほかの人の評価は見えない）・判定・録画・katibito。
export default async function ApplicantPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const v = await requireViewer();
  const { id } = await params;
  const sp = await searchParams;
  const db = getDataStore();
  const f = fx();
  const applicant = await f.applicants.get(id);
  if (!applicant) redirect("/staff/recruit?error=" + encodeURIComponent("応募者が見つかりません"));
  const interviews = await interviewsOf(applicant.id);
  const access = await accessTo(v.me, applicant, interviews);
  if (!access) redirect("/staff/recruit?error=" + encodeURIComponent("この応募者は見られません"));
  const [settings, staff, stores, recordings, katibito] = await Promise.all([
    getRecruitSettings(db),
    db.listStaff(),
    db.listStores(),
    access.recordings ? f.interviewRecordings.list({ where: { applicantId: applicant.id, deletedAt: { isNull: true } }, order: [["createdAt", "desc"]] }) : Promise.resolve([]),
    f.katibitoResults.list({ where: { applicantId: applicant.id }, order: [["createdAt", "desc"]] }),
  ]);
  const live = interviews.filter((i) => i.status !== "cancelled");
  const states = await Promise.all(live.map((i) => evaluationState(i, v.staffId)));
  const anyAllDone = states.some((s) => s.allDone);
  const nameOf = (sid: string | null) => staff.find((s) => s.id === sid)?.name ?? "—";
  const candidates = staff.filter((s) => s.isActive);
  const today = todayJst();
  const back = `/staff/recruit/${applicant.id}`;
  const ended = ENDED.includes(applicant.status);
  const interviewLabel = (i: (typeof interviews)[number]) => `${formatDateJa(i.date)} ${i.startTime}〜${i.endTime}`;

  const InterviewFields = ({ i }: { i?: (typeof interviews)[number] }) => (
    <>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-[11px] text-ink-500 col-span-3">
          日にち
          <input type="date" name="date" defaultValue={i?.date ?? today} className="input" required />
        </label>
        <label className="text-[11px] text-ink-500">
          始まり
          <input type="time" name="startTime" defaultValue={i?.startTime ?? "10:00"} className="input" required />
        </label>
        <label className="text-[11px] text-ink-500">
          終わり
          <input type="time" name="endTime" defaultValue={i?.endTime ?? "11:00"} className="input" required />
        </label>
        <label className="text-[11px] text-ink-500">
          場所
          <input name="place" defaultValue={i?.place ?? ""} className="input" placeholder="本店・オンライン" maxLength={80} />
        </label>
      </div>
      <p className="text-[11px] text-ink-500">面接官（{settings.maxInterviewers}人まで。選んだ人の予定に入り、お知らせが届きます）</p>
      {Array.from({ length: settings.maxInterviewers }, (_, n) => (
        <select key={n} name="interviewers" defaultValue={i?.interviewerIds[n] ?? ""} className="input" aria-label={`面接官${n + 1}`}>
          <option value="">{n === 0 ? "面接官を選ぶ" : "（なし）"}</option>
          {candidates.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}（{stores.find((st) => st.id === s.storeId)?.name ?? ""}）
            </option>
          ))}
        </select>
      ))}
    </>
  );

  return (
    <div className="page-narrow">
      <PageHeader title={`${applicant.name}さん`} backHref="/staff/recruit" backLabel="応募者の一覧へ戻る" icon="user" />
      <Flash ok={sp.ok} error={sp.error} />

      {/* ---------------- 基本 ---------------- */}
      <section className="card !p-3.5 mb-4">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm text-ink-700">
            {applicant.appliedOn ? `${formatDateJa(applicant.appliedOn, true)}応募` : "応募日なし"}・{applicant.source || "経路不明"}・<b>{applicant.stage || "—"}</b>
          </p>
          <StatusBadge label={STATUS_LABEL[applicant.status]} tone={applicant.status === "active" ? "pending" : applicant.status === "hired" ? "ok" : "muted"} />
        </div>
        {applicant.storeId && <p className="text-[11px] text-ink-500 mt-0.5">希望：{stores.find((s) => s.id === applicant.storeId)?.name}</p>}
        {applicant.note && <p className="text-xs text-ink-600 mt-2 whitespace-pre-wrap">{applicant.note}</p>}
        {ended && <p className="text-[11px] text-ink-500 mt-2">選考が終わった日：{formatDateJa(applicant.selectionEndedOn, true)}（録画は保存期間 {settings.retentionMonths}か月を過ぎたら自動で消えます）</p>}
        {access.manage && (
          <>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-bold text-brand-700">応募者の情報を直す</summary>
              <form action={updateApplicantAction} className="mt-2 space-y-2">
                <input type="hidden" name="id" value={applicant.id} />
                <input name="name" defaultValue={applicant.name} className="input" required maxLength={60} />
                <div className="grid grid-cols-2 gap-2">
                  <input name="appliedOn" type="date" defaultValue={applicant.appliedOn} className="input" aria-label="応募日" />
                  <select name="source" defaultValue={applicant.source} className="input" aria-label="経路">
                    {[...new Set([applicant.source, ...settings.sources].filter(Boolean))].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <select name="stage" defaultValue={applicant.stage} className="input" aria-label="段階">
                    {[...new Set([applicant.stage, ...settings.stages].filter(Boolean))].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <select name="storeId" defaultValue={applicant.storeId ?? ""} className="input" aria-label="希望の店舗">
                    <option value="">未定</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea name="note" defaultValue={applicant.note} className="input min-h-16" maxLength={2000} />
                <button type="submit" className="btn-primary btn-sm w-full">
                  保存
                </button>
              </form>
            </details>
            <form action={setStatusAction} className="flex flex-wrap gap-1.5 mt-3">
              <input type="hidden" name="id" value={applicant.id} />
              {(["active", "hired", "rejected", "withdrawn"] as const).map((st) => (
                <button key={st} type="submit" name="status" value={st} disabled={applicant.status === st} className={`chip !min-h-8 !py-0.5 ${applicant.status === st ? "chip-active" : ""}`}>
                  {STATUS_LABEL[st]}
                </button>
              ))}
            </form>
          </>
        )}
      </section>

      {/* ---------------- 面接 ---------------- */}
      <p className="text-xs font-bold text-ink-500 mb-1.5">面接</p>
      <div className="space-y-3 mb-4">
        {interviews.length === 0 && <p className="text-sm text-ink-500">まだ面接の予定はありません</p>}
        {interviews.map((i) => {
          const st = states.find((s) => s.interview.id === i.id);
          const mineIsInterviewer = i.interviewerIds.includes(v.staffId);
          return (
            <section key={i.id} className={`card !p-3.5 ${i.status === "cancelled" ? "opacity-60" : ""}`}>
              <div className="flex items-center gap-2">
                <p className="flex-1 text-sm font-bold">
                  {interviewLabel(i)}
                  {i.place ? `・${i.place}` : ""}
                </p>
                {i.status === "cancelled" ? <StatusBadge label="取り消し" tone="muted" /> : st?.allDone ? <StatusBadge label="評価がそろった" tone="ok" /> : <StatusBadge label={`評価 ${st?.submitted ?? 0}/${st?.total ?? 0}`} tone="pending" />}
              </div>
              <p className="text-[11px] text-ink-500 mt-0.5">面接官：{i.interviewerIds.map(nameOf).join("・")}</p>

              {/* 評価シート（自分が面接官で、まだそろっていないとき） */}
              {i.status !== "cancelled" && mineIsInterviewer && st && !st.allDone && (
                <form action={submitEvaluationAction} className="mt-3 space-y-2 rounded-xl border border-brand-100 bg-brand-50/40 p-3">
                  <input type="hidden" name="applicantId" value={applicant.id} />
                  <input type="hidden" name="interviewId" value={i.id} />
                  <p className="text-xs font-bold text-brand-800">{st.mine?.submittedAt ? "自分の評価（全員がそろうまで直せます）" : "評価シート"}</p>
                  {settings.evaluationItems.map((item) => (
                    <fieldset key={item.key}>
                      <legend className="text-[11px] text-ink-600 mb-1">
                        {item.label}（{item.max}点満点）
                      </legend>
                      <div className="flex gap-1.5 flex-wrap">
                        {Array.from({ length: item.max }, (_, n) => n + 1).map((n) => (
                          <label key={n}>
                            <input type="radio" name={`score_${item.key}`} value={n} defaultChecked={st.mine?.scores?.[item.key] === n} required className="peer sr-only" />
                            <span className="chip !min-h-9 !min-w-9 !px-2 justify-center peer-checked:chip-active cursor-pointer">{n}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                  <textarea name="comment" defaultValue={st.mine?.comment ?? ""} className="input min-h-16" placeholder="コメント（よかった点・気になった点）" maxLength={2000} />
                  <button type="submit" className="btn-primary btn-sm w-full">
                    {st.mine?.submittedAt ? "直して出す" : "評価を出す"}
                  </button>
                  <p className="text-[11px] text-ink-500">面接官全員がつけ終わるまで、ほかの人の評価は見えません。</p>
                </form>
              )}

              {/* 評価（そろったら全員分、そろうまでは自分のものだけ） */}
              {st && st.visible.length > 0 && (
                <div className="mt-3 space-y-2">
                  {!st.allDone && <p className="text-[11px] text-ink-500">ほかの面接官の評価は、全員がつけ終わると見られます（あと{st.total - st.submitted}人）</p>}
                  {st.visible.map((e) => (
                    <div key={e.id} className="rounded-xl border border-ink-100 p-2.5">
                      <div className="flex items-center gap-2">
                        <p className="flex-1 text-xs font-bold">{nameOf(e.interviewerId)}</p>
                        <span className="text-xs font-bold text-brand-700 tabular-nums">{averageScore(e, settings.evaluationItems) ?? "—"}点</span>
                      </div>
                      <p className="text-[11px] text-ink-500 mt-0.5">
                        {settings.evaluationItems.map((item) => `${item.label} ${e.scores?.[item.key] ?? "—"}/${item.max}`).join("・")}
                      </p>
                      {e.comment && <p className="text-xs text-ink-700 mt-1 whitespace-pre-wrap">{e.comment}</p>}
                    </div>
                  ))}
                </div>
              )}

              {access.manage && i.status !== "cancelled" && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-bold text-brand-700">日時・面接官を変える</summary>
                  <form action={saveInterviewAction} className="mt-2 space-y-2">
                    <input type="hidden" name="applicantId" value={applicant.id} />
                    <input type="hidden" name="interviewId" value={i.id} />
                    <InterviewFields i={i} />
                    <button type="submit" className="btn-primary btn-sm w-full">
                      保存（面接官に知らせる）
                    </button>
                  </form>
                  <form action={cancelInterviewAction} className="mt-2">
                    <input type="hidden" name="applicantId" value={applicant.id} />
                    <input type="hidden" name="interviewId" value={i.id} />
                    <ConfirmSubmit message="この面接を取り消しますか？（面接官の予定からも消えます）" className="text-xs text-red-600 underline">
                      この面接を取り消す
                    </ConfirmSubmit>
                  </form>
                </details>
              )}
            </section>
          );
        })}
        {access.manage && !ended && (
          <details className="card !p-3.5" open={interviews.length === 0}>
            <summary className="cursor-pointer text-sm font-bold text-brand-700">＋ 面接の予定を入れる</summary>
            <form action={saveInterviewAction} className="mt-3 space-y-2">
              <input type="hidden" name="applicantId" value={applicant.id} />
              <InterviewFields />
              <button type="submit" className="btn-primary w-full">
                予定を入れる（面接官に知らせる）
              </button>
            </form>
          </details>
        )}
      </div>

      {/* ---------------- 判定 ---------------- */}
      <section className="card !p-3.5 mb-4">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm font-bold">判定</p>
          <StatusBadge label={DECISION_LABEL[applicant.decision]} tone={applicant.decision === "pass" ? "ok" : applicant.decision === "fail" ? "danger" : applicant.decision === "hold" ? "warning" : "muted"} />
        </div>
        {applicant.decisionNote && <p className="text-xs text-ink-700 mt-1 whitespace-pre-wrap">{applicant.decisionNote}</p>}
        {applicant.decidedAt && <p className="text-[11px] text-ink-500 mt-0.5">{nameOf(applicant.decidedBy)}・{applicant.decidedAt.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}</p>}
        {access.manage &&
          (live.length === 0 || anyAllDone ? (
            <form action={decideAction} className="mt-2 space-y-2">
              <input type="hidden" name="id" value={applicant.id} />
              <div className="flex gap-1.5">
                {(["pass", "hold", "fail"] as const).map((d) => (
                  <label key={d}>
                    <input type="radio" name="decision" value={d} defaultChecked={applicant.decision === d} className="peer sr-only" required />
                    <span className="chip !min-h-9 peer-checked:chip-active cursor-pointer">{DECISION_LABEL[d]}</span>
                  </label>
                ))}
              </div>
              <textarea name="decisionNote" defaultValue={applicant.decisionNote} className="input min-h-14" placeholder="判定の理由・次の段階" maxLength={1000} />
              <button type="submit" className="btn-primary btn-sm w-full">
                判定を保存
              </button>
            </form>
          ) : (
            <p className="text-xs text-ink-500 mt-1">面接官全員の評価がそろうと、判定を入れられます。</p>
          ))}
      </section>

      {/* ---------------- 録画（面接官と管理者だけ） ---------------- */}
      {access.recordings && (
        <section className="card !p-3.5 mb-4">
          <p className="text-sm font-bold">面接の録画</p>
          <p className="text-[11px] text-ink-500 mt-0.5">
            見られるのは面接官と管理者だけです。{ended ? "" : `選考が終わってから${settings.retentionMonths}か月で自動で消えます。`}
          </p>
          <ul className="mt-3 space-y-3">
            {recordings.map((r) => (
              <li key={r.id} className="space-y-1.5">
                <ProtectedPlayer videoId={r.id} viewerName={v.me?.name ?? ""} playUrl={`/api/recruit/recording/${r.id}/play`} trackProgress={false} />
                <div className="flex items-center gap-2 text-[11px] text-ink-500">
                  <span className="flex-1 min-w-0 truncate">
                    {r.fileName || "録画"}・{nameOf(r.uploadedBy)}・{r.createdAt.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
                    {r.deleteAfter ? `・${formatDateJa(r.deleteAfter, true)}に消えます` : ""}
                  </span>
                  {(v.isAdmin || r.uploadedBy === v.staffId) && (
                    <form action={deleteRecordingAction}>
                      <input type="hidden" name="applicantId" value={applicant.id} />
                      <input type="hidden" name="recordingId" value={r.id} />
                      <ConfirmSubmit message="この録画を消しますか？（元に戻せません）" className="text-red-600 underline">
                        消す
                      </ConfirmSubmit>
                    </form>
                  )}
                </div>
                {r.consentNote && <p className="text-[11px] text-ink-500">同意：{r.consentNote}</p>}
              </li>
            ))}
          </ul>
          <div className="mt-3">
            {uploadProvider() !== "url" ? (
              <RecordingUpload applicantId={applicant.id} interviews={live.map((i) => ({ id: i.id, label: interviewLabel(i) }))} consentText={settings.consentText} />
            ) : (
              <details>
                <summary className="cursor-pointer text-xs font-bold text-brand-700">録画を登録（試し用のURL・置き場所が未設定のとき）</summary>
                <form action={registerRecordingUrlAction} className="mt-2 space-y-2">
                  <input type="hidden" name="applicantId" value={applicant.id} />
                  {live[0] && <input type="hidden" name="interviewId" value={live[0].id} />}
                  <label className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    <input type="checkbox" name="consent" required className="mt-0.5 w-4 h-4 shrink-0" />
                    <span>{settings.consentText}</span>
                  </label>
                  <input name="consentNote" className="input" placeholder="同意のメモ（任意）" maxLength={300} />
                  <input name="url" className="input" placeholder="https://…（.mp4 か .m3u8）" required />
                  <button type="submit" className="btn-secondary btn-sm w-full">
                    登録
                  </button>
                </form>
              </details>
            )}
          </div>
        </section>
      )}

      {/* ---------------- katibito ---------------- */}
      <section className="card !p-3.5 mb-8">
        <p className="text-sm font-bold">katibitoの結果</p>
        {katibito.length === 0 ? (
          <p className="text-xs text-ink-500 mt-1">まだありません</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {katibito.map((k) => (
              <li key={k.id} className="rounded-xl border border-ink-100 p-2.5">
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-xs text-ink-500">{k.createdAt.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}・{nameOf(k.createdBy)}</p>
                  <span className="text-sm font-bold text-brand-700 tabular-nums">{k.score}</span>
                </div>
                {k.summary && <p className="text-xs text-ink-700 mt-1 whitespace-pre-wrap">{k.summary}</p>}
                {k.attachment && (
                  <a href={k.attachment} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-brand-700">
                    katibitoで開く
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
        {access.manage && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-bold text-brand-700">＋ 結果を登録（手で入れる）</summary>
            <form action={addKatibitoAction} className="mt-2 space-y-2">
              <input type="hidden" name="applicantId" value={applicant.id} />
              {live.length > 0 && (
                <select name="interviewId" className="input" defaultValue={live[live.length - 1].id} aria-label="どの面接の結果か">
                  {live.map((i) => (
                    <option key={i.id} value={i.id}>
                      {interviewLabel(i)}
                    </option>
                  ))}
                </select>
              )}
              <input name="score" type="number" step="0.1" className="input" placeholder="スコア（katibitoの画面の数字）" />
              <textarea name="summary" className="input min-h-16" placeholder="結果のまとめ（katibitoの画面から写す）" maxLength={2000} />
              <input name="attachment" className="input" placeholder="katibitoの結果のURL（https://…・任意）" />
              <button type="submit" className="btn-secondary btn-sm w-full">
                登録
              </button>
            </form>
            <Note>katibitoとの自動の連携は、katibitoの仕組み（APIの有無）が分かってから作ります。それまでは結果を手で入れてください。</Note>
          </details>
        )}
      </section>
    </div>
  );
}
