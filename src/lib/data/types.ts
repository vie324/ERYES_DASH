// ドメインモデルとデータストアのインターフェース定義。
// 実装は mock-store.ts（デモ用メモリ内）と supabase-store.ts（本番）の2種類。

export type Role = "admin" | "staff";
export type PunchType = "in" | "out";
export type CounselingStatus = "pending" | "confirmed"; // 未確認 / 確認済み

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

export interface Staff {
  id: string;
  storeId: string;
  name: string;
  loginId: string;
  role: Role;
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
  reminderSentAt: Date | null;
  createdAt: Date;
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
    patch: Partial<Pick<Staff, "name" | "role" | "fixedOvertimeHours" | "isActive">> & {
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
  listNextAppointments(filter?: {
    customerId?: string;
    from?: Date;
    to?: Date;
  }): Promise<NextAppointment[]>;
  deleteNextAppointment(id: string): Promise<void>;
  /** リマインド未送信かつ scheduledAt が from〜to の予約（定時バッチ用） */
  listAppointmentsNeedingReminder(from: Date, to: Date): Promise<NextAppointment[]>;
  markReminderSent(id: string, sentAt: Date): Promise<void>;
  /** 当月などの期間内に送信済みリマインド数（Push通数カウント用） */
  countRemindersSent(from: Date, to: Date): Promise<number>;

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
