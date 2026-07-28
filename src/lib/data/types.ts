// ドメインモデルとデータストアのインターフェース定義。
// 実装は mock-store.ts（デモ用メモリ内）と supabase-store.ts（本番）の2種類。

export type Role = "admin" | "staff";
export type PunchType = "in" | "out";
export type CounselingStatus = "pending" | "confirmed"; // 未確認 / 確認済み

// 次回予約の状態（お客様のセルフサービス操作を含む）
// scheduled=予約中 / confirmed=お客様確認済み / change_requested=変更希望あり / cancelled=お客様キャンセル
export type AppointmentStatus = "scheduled" | "confirmed" | "change_requested" | "cancelled";

// ---- シフト管理 ----
export type ShiftPreference = "early" | "late" | "off"; // 早番 / 遅番 / 休み希望
export type ShiftType = "early" | "late";
export type AssignmentStatus = "draft" | "confirmed"; // 下書き / 確定

export interface Store {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  gpsRadiusM: number;
  attendanceEnabled: boolean;
}

// 職種：''=未設定（アイサロン等）/ stylist=スタイリスト / assistant=アシスタント
// ヘアサロン（ENi）のスタッフに設定すると、ホームにENi向けメニュー（日報/週報等）が出る
export type JobType = "" | "stylist" | "assistant";
// アシスタントのランク（週報の内容がランクごとに変わる）。''=未設定
export type AssistantRank = "" | "first" | "middle" | "final";

export interface Staff {
  id: string;
  storeId: string;
  name: string;
  loginId: string;
  role: Role;
  jobType: JobType;
  rank: AssistantRank; // アシスタントのランク（ファースト/ミドル/ファイナル）
  isExecutive: boolean; // 幹部（欠勤・早退の閲覧、発注管理、ペア設定などができる）
  fixedOvertimeHours: number;
  isActive: boolean;
}

/** 認証時のみ使用（パスワードハッシュ付き） */
export interface StaffWithSecret extends Staff {
  passwordHash: string;
}

export interface Customer {
  id: string;
  lineUserId: string | null;
  fullName: string;
  createdAt: Date;
}

export interface CounselingResponse {
  id: string;
  customerId: string;
  answers: Record<string, unknown>; // 項目可変（JSONで保存）
  status: CounselingStatus;
  submittedAt: Date;
  confirmedBy: string | null;
  confirmedAt: Date | null;
}

export interface DailyReport {
  id: string;
  staffId: string;
  reportDate: string; // "YYYY-MM-DD"（JST）
  newClients: number;
  repeatClients: number;
  nextBookings: number;
  serviceSales: number;
  optionSales: number;
  retailSales: number;
  memo: string;
  goodPoint: string; // 今日お客様やスタッフに喜んでいただけたこと
  improvement: string; // 今日の気付きや改善できそうな点
  message: string; // ひとことメッセージ（任意）
}

/** レジ締め・現金管理（店舗ごと・1日1件。スタッフ個人の日報とは別レコード） */
export interface CashReport {
  id: string;
  storeId: string;
  reportDate: string; // "YYYY-MM-DD"（JST）
  cashSales: number; // 本日の現金売上高
  registerBalance: number; // レジ現金残高（締め時点で数えた額）
  movedToSafe: number; // 金庫へ移動額
  changeFund: number; // レジおつり金の残高（翌日のおつり準備金）
  safeBalance: number; // 金庫現金残高
  bankDeposit: number; // 銀行への預入額
  memo: string;
  createdBy: string; // 入力したスタッフ
  updatedAt: Date;
}

export interface CashReportInput {
  storeId: string;
  reportDate: string;
  cashSales: number;
  registerBalance: number;
  movedToSafe: number;
  changeFund: number;
  safeBalance: number;
  bankDeposit: number;
  memo: string;
  createdBy: string;
}

export interface Attendance {
  id: string;
  staffId: string;
  storeId: string;
  punchType: PunchType;
  punchedAt: Date;
  lat: number;
  lng: number;
  distanceM: number;
  isValid: boolean; // 店舗から許容半径内で打刻されたか
}

export interface NextAppointment {
  id: string;
  customerId: string;
  scheduledAt: Date;
  staffId: string | null;
  status: AppointmentStatus;
  requestedNewAt: Date | null; // お客様が希望した変更後の日時（change_requested時）
  changeNote: string; // 変更・キャンセル時のお客様メモ
  reminderSentAt: Date | null; // 前日リマインドの送信日時
  preReminderSentAt: Date | null; // 1週間前の事前案内の送信日時
  createdAt: Date;
}

/** 次回予約の部分更新（管理者の変更承認・お客様のセルフ操作用） */
export interface AppointmentPatch {
  scheduledAt?: Date;
  status?: AppointmentStatus;
  requestedNewAt?: Date | null;
  changeNote?: string;
  reminderSentAt?: Date | null;
  preReminderSentAt?: Date | null;
}

export interface Broadcast {
  id: string;
  sentBy: string;
  body: string;
  sentAt: Date;
  recipientCount: number;
}

/** シフトルール（管理者が変更可能） */
export interface ShiftRules {
  maxConsecutiveDays: number; // 連勤上限（既定5）
  minStaffPerStoreDay: number; // 各店舗・各日の最低人数（日単位・既定2）
  requestDeadlineDay: number; // 希望提出の締切日＝対象月の前月◯日（既定25）
}

/** シフト希望（月単位の提出情報：備考・勤務可能店舗・提出日時） */
export interface ShiftRequestMonth {
  id: string;
  staffId: string;
  targetMonth: string; // "YYYY-MM"
  note: string;
  submittedAt: Date;
  updatedAt: Date;
}

/** シフト希望（日単位）。行が無い日は「指定なし（どちらでも可）」 */
export interface ShiftRequest {
  id: string;
  staffId: string;
  targetMonth: string;
  date: string; // "YYYY-MM-DD"
  preference: ShiftPreference;
}

// ---- 出勤スケジュール（基本パターン＋希望休。早番/遅番の旧シフトとは別機能） ----

/** 週の基本出勤パターン（スタッフ×曜日）。行が無い曜日は「休み」扱い */
export interface WorkPatternDay {
  staffId: string;
  weekday: number; // 0=日〜6=土
  isWorking: boolean;
  startTime: string; // "10:00"（空文字は時間未設定＝終日）
  endTime: string;
}

/** 希望休（スタッフが3ヶ月前に申請する休み希望日） */
export interface DayoffRequest {
  id: string;
  staffId: string;
  date: string; // "YYYY-MM-DD"
  createdAt: Date;
}

/** スケジュールの個別上書き（管理者の手動調整。パターン・希望休より優先） */
export interface ScheduleOverride {
  id: string;
  staffId: string;
  date: string; // "YYYY-MM-DD"
  isWorking: boolean;
  startTime: string;
  endTime: string;
  note: string;
}

/** シフト割当（1スタッフ1日1件） */
export interface ShiftAssignment {
  id: string;
  targetMonth: string;
  date: string;
  staffId: string;
  storeId: string;
  shiftType: ShiftType;
  status: AssignmentStatus;
}

export interface NewShiftAssignment {
  date: string;
  staffId: string;
  storeId: string;
  shiftType: ShiftType;
}

// ============================================================
// ENi（ヘアサロン）向け機能のドメインモデル
// ============================================================

/** スタイリスト日報／アシスタント週報（項目は src/lib/eni/forms.ts で定義。回答はJSONで保存） */
export interface EniReport {
  id: string;
  staffId: string;
  /** スタイリスト日報＝日付 "YYYY-MM-DD" ／ 週報＝週の月曜 "YYYY-MM-DD" */
  periodKey: string;
  answers: Record<string, unknown>;
  comment: string; // 上司（幹部・スタイリスト・管理者）からの全体コメント
  commentedBy: string | null;
  updatedAt: Date;
}

/** 練習記録（月間活動記録表のシステム化。1回の練習＝1行） */
export interface PracticeRecord {
  id: string;
  staffId: string; // 練習した人
  practiceDate: string; // "YYYY-MM-DD"
  minutes: number; // 練習時間（分）
  partnerStaffId: string | null; // 相手（スタッフの場合）
  partnerName: string; // 相手（モデルさん等の自由記入。スタッフ選択時は空）
  content: string; // 練習内容（任意）
  createdAt: Date;
}

/** 練習ペア（月ごとに、メンバー→ついてもらう先輩を割り当てる） */
export interface PracticePair {
  id: string;
  targetMonth: string; // "YYYY-MM"
  memberStaffId: string; // 練習するメンバー（アシスタント）
  partnerStaffId: string; // ペアの相手（先輩・スタイリスト）
}

export type MeetingType = "1on1" | "all" | "other";

/** ミーティング（1on1・会議体・全体など）＋議事録の提出管理 */
export interface Meeting {
  id: string;
  meetingType: MeetingType;
  committee: string; // 会議体（幹部会議・教育チーム 等。テンプレのキー。1on1等は空）
  title: string; // 題名（1on1は空でよい）
  agenda: string; // アジェンダ・事前確認事項
  meetingDate: string; // "YYYY-MM-DD"
  startTime: string; // "14:00"（空文字は時間未定）
  hostStaffId: string; // 実施する人・司会
  guestStaffId: string | null; // 相手（1on1の相手）
  participants: string[]; // 参加者（会議体の複数参加者。staffIdの配列）
  minutesText: string; // 議事録（整形済みMarkdown）
  minutesPhoto: string; // 議事録の写真（データURL）
  minutesAi: boolean; // AIで整形したか
  minutesDone: boolean; // 議事録の提出済みフラグ
  createdBy: string;
  createdAt: Date;
}

/** 議事録から整理されたタスク（誰が・何を・いつまでに） */
export interface MeetingTask {
  id: string;
  meetingId: string;
  title: string; // 何を（動詞から始まる短い文）
  assigneeStaffId: string | null; // 誰が（スタッフと一致した場合）
  assigneeName: string; // 誰が（表示名。一致しない場合もそのまま残す）
  dueDate: string; // いつまでに（"YYYY-MM-DD"。未定は空文字）
  done: boolean;
  sortOrder: number;
  createdAt: Date;
}

/** 組織図（シナジーマップ）のチーム所属。teamKey は lib/eni/org.ts の定義キー */
export interface OrgMember {
  id: string;
  teamKey: string;
  staffId: string;
  roleLabel: string; // "リーダー" など（空文字はメンバー）
  sortOrder: number;
}

export type AbsenceKind = "absence" | "early_leave" | "late";

/** 欠勤・早退・遅刻の報告（閲覧は幹部・管理者のみ） */
export interface AbsenceReport {
  id: string;
  staffId: string; // 対象者
  absenceDate: string; // "YYYY-MM-DD"
  kind: AbsenceKind;
  hours: number; // 何時間（欠勤は0でよい）
  reason: string;
  reportedBy: string;
  createdAt: Date;
}

export type OrderCategory = "wig" | "store_sale" | "material";
export type OrderStatus = "requested" | "ordered" | "received";

/** 発注・購入申請（ウィッグ／社販／商材） */
export interface OrderRequest {
  id: string;
  staffId: string; // 申請者
  category: OrderCategory;
  itemName: string;
  quantity: number;
  note: string;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** 予約表（タイムテーブル）の1件。d=曜日index（1日だけの場合は0）、s/e="HH:mm" */
export interface ScheduleBlock {
  d: number;
  s: string;
  e: string;
  a: string; // 内容（「MTG」「練習」など）
}

/** 今日のスケジュールの構造化フォーム */
export interface DailyPlanFields {
  goal: string; // 今日の目標
  horenso: string; // ホウレンソウすること
  todo: string; // やること
  timetable: string; // 旧・自由記入のタイムテーブル（後方互換）
  timetableRows?: { t: string; a: string }[]; // 旧・1時間ごとのグリッド（後方互換）
  timetableBlocks?: ScheduleBlock[]; // 予約表（開始〜終了の帯）
}

/** 毎朝のスケジュール（1人1日1件）。フォーム入力またはスケジュール帳の写真 */
export interface DailyPlan {
  id: string;
  staffId: string;
  planDate: string; // "YYYY-MM-DD"
  content: string; // 旧・自由記入（後方互換）
  fields: DailyPlanFields;
  photo: string; // スケジュール帳の写真（データURL）
  seenBy: string | null; // ペアの先輩が確認したら記録
  seenAt: Date | null;
}

/** 理想のスケジュール（scope: month_goal＝今月の目標 / week1〜week4＝各週の理想） */
export interface IdealSchedule {
  id: string;
  staffId: string;
  scope: string;
  content: string; // 週グリッドのJSON、または目標のテキスト
  image: string; // 貼り付け画像（データURL）
  updatedAt: Date;
}

/** タイムテーブルのよくある項目（datalist候補） */
export interface SchedulePreset {
  id: string;
  label: string;
  sortOrder: number;
}

// ---- 入力用 ----

export interface DailyReportInput {
  staffId: string;
  reportDate: string;
  newClients: number;
  repeatClients: number;
  nextBookings: number;
  serviceSales: number;
  optionSales: number;
  retailSales: number;
  memo: string;
  goodPoint: string;
  improvement: string;
  message: string;
}

export interface AttendanceInput {
  staffId: string;
  storeId: string;
  punchType: PunchType;
  punchedAt: Date;
  lat: number;
  lng: number;
  distanceM: number;
  isValid: boolean;
}

export interface StaffInput {
  storeId: string;
  name: string;
  loginId: string;
  passwordHash: string;
  role: Role;
  jobType?: JobType;
  rank?: AssistantRank;
  isExecutive?: boolean;
  fixedOvertimeHours: number;
}

// ---- データストア共通インターフェース ----

export interface DataStore {
  // 店舗（getStore は「最初の店舗＝本店」を返す。リマインド文面などで使用）
  getStore(): Promise<Store>;
  listStores(): Promise<Store[]>;
  createStore(input: { name: string; address: string }): Promise<Store>;
  updateStoreById(id: string, patch: Partial<Omit<Store, "id">>): Promise<Store>;
  /** 店舗を削除。関連データ（スタッフ・打刻・現金等）がある場合はエラー */
  deleteStore(id: string): Promise<void>;

  // スタッフ
  listStaff(): Promise<Staff[]>;
  getStaff(id: string): Promise<Staff | null>;
  getStaffByLoginId(loginId: string): Promise<StaffWithSecret | null>;
  createStaff(input: StaffInput): Promise<Staff>;
  updateStaff(
    id: string,
    patch: Partial<
      Pick<
        Staff,
        "name" | "role" | "jobType" | "rank" | "isExecutive" | "fixedOvertimeHours" | "isActive"
      >
    > & {
      passwordHash?: string;
    }
  ): Promise<Staff>;
  /** スタッフを削除。関連データ（日報・打刻等）がある場合はエラー */
  deleteStaff(id: string): Promise<void>;

  // 顧客
  listCustomers(search?: string): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | null>;
  getCustomerByLineUserId(lineUserId: string): Promise<Customer | null>;
  createCustomer(input: { lineUserId: string | null; fullName: string }): Promise<Customer>;
  updateCustomer(id: string, patch: { fullName?: string }): Promise<Customer>;

  // カウンセリング
  createCounselingResponse(input: {
    customerId: string;
    answers: Record<string, unknown>;
  }): Promise<CounselingResponse>;
  listCounselingResponses(filter?: {
    status?: CounselingStatus;
    customerId?: string;
  }): Promise<CounselingResponse[]>;
  getCounselingResponse(id: string): Promise<CounselingResponse | null>;
  confirmCounselingResponse(id: string, staffId: string): Promise<CounselingResponse>;

  // 日報
  upsertDailyReport(input: DailyReportInput): Promise<DailyReport>;
  getDailyReport(staffId: string, reportDate: string): Promise<DailyReport | null>;
  getDailyReportById(id: string): Promise<DailyReport | null>;
  /** from〜to（両端含む, "YYYY-MM-DD"）の日報。staffId指定で絞り込み */
  listDailyReports(filter: { staffId?: string; from: string; to: string }): Promise<DailyReport[]>;
  /** 日報を削除（管理者の修正・削除用） */
  deleteDailyReport(id: string): Promise<void>;

  // レジ締め・現金管理（店舗×日付でユニーク。再保存は上書き）
  upsertCashReport(input: CashReportInput): Promise<CashReport>;
  getCashReport(storeId: string, reportDate: string): Promise<CashReport | null>;
  listCashReports(filter: { storeId?: string; from: string; to: string }): Promise<CashReport[]>;

  // 勤怠
  createAttendance(input: AttendanceInput): Promise<Attendance>;
  /** punchedAt が from（含む）〜 to（含まない）の打刻 */
  listAttendances(filter: { staffId?: string; from: Date; to: Date }): Promise<Attendance[]>;

  // 次回予約
  createNextAppointment(input: {
    customerId: string;
    scheduledAt: Date;
    staffId: string | null;
  }): Promise<NextAppointment>;
  getNextAppointment(id: string): Promise<NextAppointment | null>;
  updateNextAppointment(id: string, patch: AppointmentPatch): Promise<NextAppointment>;
  listNextAppointments(filter?: {
    customerId?: string;
    from?: Date;
    to?: Date;
  }): Promise<NextAppointment[]>;
  deleteNextAppointment(id: string): Promise<void>;
  /** リマインド未送信かつ scheduledAt が from〜to の予約（キャンセル済みは除く。定時バッチ用） */
  listAppointmentsNeedingReminder(from: Date, to: Date): Promise<NextAppointment[]>;
  markReminderSent(id: string, sentAt: Date): Promise<void>;
  /** 1週間前の事前案内が未送信かつ scheduledAt が from〜to の予約（キャンセル済みは除く） */
  listAppointmentsNeedingPreReminder(from: Date, to: Date): Promise<NextAppointment[]>;
  markPreReminderSent(id: string, sentAt: Date): Promise<void>;
  /** 当月などの期間内に送信済みリマインド数（Push通数カウント用） */
  countRemindersSent(from: Date, to: Date): Promise<number>;
  /** 期間内に送信済みの1週間前案内数（Push通数カウント用） */
  countPreRemindersSent(from: Date, to: Date): Promise<number>;

  // 一斉配信
  createBroadcast(input: {
    sentBy: string;
    body: string;
    recipientCount: number;
  }): Promise<Broadcast>;
  listBroadcasts(): Promise<Broadcast[]>;
  /** 期間内の一斉配信の送信通数合計（Push通数カウント用） */
  countBroadcastMessages(from: Date, to: Date): Promise<number>;

  // ---- シフト管理 ----
  getShiftRules(): Promise<ShiftRules>;
  updateShiftRules(patch: Partial<ShiftRules>): Promise<ShiftRules>;

  /** 希望の提出（同月の再提出は上書き）。days は日付→希望（指定なしの日は含めない） */
  saveShiftRequest(input: {
    staffId: string;
    targetMonth: string;
    note: string;
    days: Record<string, ShiftPreference>;
    storeIds: string[];
  }): Promise<void>;
  getShiftRequestMonth(staffId: string, targetMonth: string): Promise<ShiftRequestMonth | null>;
  listShiftRequestMonths(targetMonth: string): Promise<ShiftRequestMonth[]>;
  listShiftRequests(targetMonth: string, staffId?: string): Promise<ShiftRequest[]>;
  listAvailableStores(
    targetMonth: string,
    staffId?: string
  ): Promise<{ staffId: string; storeId: string }[]>;

  // ---- 出勤スケジュール（基本パターン＋希望休） ----
  /** 週の基本パターン（staffId指定でそのスタッフ分のみ） */
  listWorkPatterns(staffId?: string): Promise<WorkPatternDay[]>;
  /** スタッフの週パターンを丸ごと保存（7曜日分を入れ替え） */
  saveWorkPattern(staffId: string, days: Omit<WorkPatternDay, "staffId">[]): Promise<void>;
  /** 希望休（from〜to の日付範囲、"YYYY-MM-DD"） */
  listDayoffRequests(filter: { staffId?: string; from: string; to: string }): Promise<DayoffRequest[]>;
  /** 対象月の希望休を丸ごと入れ替え（再提出は上書き） */
  replaceDayoffRequests(staffId: string, targetMonth: string, dates: string[]): Promise<void>;
  /** スケジュールの個別上書き（from〜to の日付範囲） */
  listScheduleOverrides(filter: { staffId?: string; from: string; to: string }): Promise<ScheduleOverride[]>;
  upsertScheduleOverride(input: Omit<ScheduleOverride, "id">): Promise<void>;
  deleteScheduleOverride(staffId: string, date: string): Promise<void>;

  // ---- ENi（ヘアサロン）向け機能 ----
  // スタイリスト日報／アシスタント週報（kind で区別。periodKey は日付または週の月曜）
  upsertEniReport(input: {
    kind: "stylist" | "weekly";
    staffId: string;
    periodKey: string;
    answers: Record<string, unknown>;
  }): Promise<EniReport>;
  getEniReport(kind: "stylist" | "weekly", staffId: string, periodKey: string): Promise<EniReport | null>;
  getEniReportById(id: string): Promise<EniReport | null>;
  listEniReports(
    kind: "stylist" | "weekly",
    filter: { staffId?: string; from: string; to: string }
  ): Promise<EniReport[]>;
  /** 上司コメントの保存 */
  commentEniReport(id: string, comment: string, commentedBy: string): Promise<void>;

  // 練習記録・ペア
  createPracticeRecord(input: Omit<PracticeRecord, "id" | "createdAt">): Promise<PracticeRecord>;
  listPracticeRecords(filter: { staffId?: string; from: string; to: string }): Promise<PracticeRecord[]>;
  deletePracticeRecord(id: string): Promise<void>;
  getPracticeRecord(id: string): Promise<PracticeRecord | null>;
  listPracticePairs(targetMonth: string): Promise<PracticePair[]>;
  /** ペアの割当（partnerStaffId が空文字なら解除） */
  setPracticePair(targetMonth: string, memberStaffId: string, partnerStaffId: string): Promise<void>;

  // ミーティング＋議事録
  createMeeting(
    input: Omit<Meeting, "id" | "createdAt" | "minutesText" | "minutesPhoto" | "minutesAi" | "minutesDone">
  ): Promise<Meeting>;
  getMeeting(id: string): Promise<Meeting | null>;
  listMeetings(filter: { from: string; to: string }): Promise<Meeting[]>;
  /** 議事録の未提出一覧（過去のミーティングで minutesDone=false） */
  listMeetingsMissingMinutes(until: string): Promise<Meeting[]>;
  updateMeetingMinutes(
    id: string,
    patch: { minutesText: string; minutesPhoto: string; minutesAi: boolean; minutesDone: boolean }
  ): Promise<Meeting>;
  deleteMeeting(id: string): Promise<void>;

  // 議事録から整理したタスク（誰が・何を・いつまでに）
  /** 対象ミーティングのタスクを入れ替える（議事録の保存時に呼ぶ）。完了状態は同じ内容なら引き継ぐ */
  replaceMeetingTasks(
    meetingId: string,
    tasks: { title: string; assigneeStaffId: string | null; assigneeName: string; dueDate: string; done: boolean }[]
  ): Promise<void>;
  listMeetingTasks(meetingIds: string[]): Promise<MeetingTask[]>;
  /** 未完了タスクの一覧（期限の早い順） */
  listOpenMeetingTasks(): Promise<MeetingTask[]>;
  setMeetingTaskDone(id: string, done: boolean): Promise<void>;

  // 組織図（シナジーマップ）のチーム所属
  listOrgMembers(): Promise<OrgMember[]>;
  /** チームの所属を入れ替える（幹部のみ操作する想定） */
  setOrgTeamMembers(teamKey: string, members: { staffId: string; roleLabel: string }[]): Promise<void>;

  // 欠勤・早退の報告
  createAbsenceReport(input: Omit<AbsenceReport, "id" | "createdAt">): Promise<AbsenceReport>;
  listAbsenceReports(filter: { staffId?: string; from: string; to: string }): Promise<AbsenceReport[]>;

  // 発注・購入申請
  createOrderRequest(
    input: Omit<OrderRequest, "id" | "status" | "createdAt" | "updatedAt">
  ): Promise<OrderRequest>;
  listOrderRequests(filter: { staffId?: string; from: Date; to: Date }): Promise<OrderRequest[]>;
  updateOrderStatus(id: string, status: OrderStatus): Promise<void>;

  // 毎朝のスケジュール・理想のスケジュール
  upsertDailyPlan(input: {
    staffId: string;
    planDate: string;
    fields: DailyPlanFields;
    photo: string;
  }): Promise<void>;
  /** ペアの先輩が確認したことを記録（「見ました」マーク） */
  markDailyPlanSeen(staffId: string, planDate: string, seenBy: string): Promise<void>;
  listDailyPlans(planDate: string): Promise<DailyPlan[]>;
  listIdealSchedules(staffId: string): Promise<IdealSchedule[]>;
  upsertIdealSchedule(input: {
    staffId: string;
    scope: string;
    content: string;
    image: string;
  }): Promise<void>;

  // タイムテーブルのよくある項目（プリセット）
  listSchedulePresets(): Promise<SchedulePreset[]>;
  addSchedulePreset(label: string): Promise<void>;
  deleteSchedulePreset(id: string): Promise<void>;

  listShiftAssignments(targetMonth: string, staffId?: string): Promise<ShiftAssignment[]>;
  /** 自動割当：対象月の割当を全削除して下書き(draft)として入れ直す */
  replaceMonthAssignments(targetMonth: string, rows: NewShiftAssignment[]): Promise<void>;
  /** 手動追加（同スタッフ・同日の重複はエラー） */
  createShiftAssignment(
    input: NewShiftAssignment & { targetMonth: string; status: AssignmentStatus }
  ): Promise<ShiftAssignment>;
  deleteShiftAssignment(id: string): Promise<void>;
  /** 対象月の全割当を確定（confirmed）にする。確定した件数を返す */
  confirmMonthAssignments(targetMonth: string): Promise<number>;
}
