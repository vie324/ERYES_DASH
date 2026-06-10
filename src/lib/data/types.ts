// ドメインモデルとデータストアのインターフェース定義。
// 実装は mock-store.ts（デモ用メモリ内）と supabase-store.ts（本番）の2種類。

export type Role = "admin" | "staff";
export type PunchType = "in" | "out";
export type CounselingStatus = "pending" | "confirmed"; // 未確認 / 確認済み

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
  // 店舗（1店舗運用を前提に「最初の店舗」を返す。複数店舗化はテーブル設計上は可能）
  getStore(): Promise<Store>;
  updateStore(patch: Partial<Omit<Store, "id">>): Promise<Store>;

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
  /** from〜to（両端含む, "YYYY-MM-DD"）の日報。staffId指定で絞り込み */
  listDailyReports(filter: { staffId?: string; from: string; to: string }): Promise<DailyReport[]>;

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
}
