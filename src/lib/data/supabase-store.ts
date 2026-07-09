// Supabase（PostgreSQL）実装。SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 設定時に使われる。
// すべてサーバー側からサービスロールで接続する（認証は自前のセッションCookieで行うため、
// RLSは全テーブル「拒否」のままでよい。詳細は supabase/schema.sql を参照）。

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type {
  AbsenceReport,
  AppointmentPatch,
  AssignmentStatus,
  Attendance,
  AttendanceInput,
  Broadcast,
  CashReport,
  CashReportInput,
  CounselingResponse,
  CounselingStatus,
  Customer,
  DailyPlan,
  DailyPlanFields,
  DailyReport,
  DailyReportInput,
  DataStore,
  DayoffRequest,
  EniReport,
  IdealSchedule,
  Meeting,
  NewShiftAssignment,
  NextAppointment,
  OrderRequest,
  OrderStatus,
  PracticePair,
  PracticeRecord,
  ScheduleOverride,
  ShiftAssignment,
  ShiftPreference,
  ShiftRequest,
  ShiftRequestMonth,
  ShiftRules,
  Staff,
  StaffInput,
  StaffWithSecret,
  Store,
  WorkPatternDay,
} from "@/lib/data/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const mapStore = (r: Row): Store => ({
  id: r.id,
  name: r.name,
  address: r.address,
  lat: Number(r.lat),
  lng: Number(r.lng),
  gpsRadiusM: r.gps_radius_m,
  attendanceEnabled: r.attendance_enabled,
});

const mapStaff = (r: Row): Staff => ({
  id: r.id,
  storeId: r.store_id,
  name: r.name,
  loginId: r.login_id,
  role: r.role,
  jobType: r.job_type ?? "",
  rank: r.rank ?? "",
  isExecutive: r.is_executive ?? false,
  fixedOvertimeHours: r.fixed_overtime_hours,
  isActive: r.is_active,
});

const mapCustomer = (r: Row): Customer => ({
  id: r.id,
  lineUserId: r.line_user_id,
  fullName: r.full_name,
  createdAt: new Date(r.created_at),
});

const mapCounseling = (r: Row): CounselingResponse => ({
  id: r.id,
  customerId: r.customer_id,
  answers: r.answers ?? {},
  status: r.status,
  submittedAt: new Date(r.submitted_at),
  confirmedBy: r.confirmed_by,
  confirmedAt: r.confirmed_at ? new Date(r.confirmed_at) : null,
});

const mapReport = (r: Row): DailyReport => ({
  id: r.id,
  staffId: r.staff_id,
  reportDate: r.report_date,
  newClients: r.new_clients,
  repeatClients: r.repeat_clients,
  nextBookings: r.next_bookings,
  serviceSales: r.service_sales,
  optionSales: r.option_sales,
  retailSales: r.retail_sales,
  memo: r.memo ?? "",
  goodPoint: r.good_point ?? "",
  improvement: r.improvement ?? "",
  message: r.message ?? "",
});

const mapCashReport = (r: Row): CashReport => ({
  id: r.id,
  storeId: r.store_id,
  reportDate: r.report_date,
  cashSales: r.cash_sales,
  registerBalance: r.register_balance,
  movedToSafe: r.moved_to_safe,
  changeFund: r.change_fund,
  safeBalance: r.safe_balance,
  bankDeposit: r.bank_deposit,
  memo: r.memo ?? "",
  createdBy: r.created_by,
  updatedAt: new Date(r.updated_at),
});

const mapAttendance = (r: Row): Attendance => ({
  id: r.id,
  staffId: r.staff_id,
  storeId: r.store_id,
  punchType: r.punch_type,
  punchedAt: new Date(r.punched_at),
  lat: Number(r.lat),
  lng: Number(r.lng),
  distanceM: Number(r.distance_m),
  isValid: r.is_valid,
});

const mapAppointment = (r: Row): NextAppointment => ({
  id: r.id,
  customerId: r.customer_id,
  scheduledAt: new Date(r.scheduled_at),
  staffId: r.staff_id,
  status: r.status ?? "scheduled",
  requestedNewAt: r.requested_new_at ? new Date(r.requested_new_at) : null,
  changeNote: r.change_note ?? "",
  reminderSentAt: r.reminder_sent_at ? new Date(r.reminder_sent_at) : null,
  preReminderSentAt: r.pre_reminder_sent_at ? new Date(r.pre_reminder_sent_at) : null,
  createdAt: new Date(r.created_at),
});

const mapWorkPattern = (r: Row): WorkPatternDay => ({
  staffId: r.staff_id,
  weekday: r.weekday,
  isWorking: r.is_working,
  startTime: r.start_time ?? "",
  endTime: r.end_time ?? "",
});

const mapDayoffRequest = (r: Row): DayoffRequest => ({
  id: r.id,
  staffId: r.staff_id,
  date: r.date,
  createdAt: new Date(r.created_at),
});

const mapScheduleOverride = (r: Row): ScheduleOverride => ({
  id: r.id,
  staffId: r.staff_id,
  date: r.date,
  isWorking: r.is_working,
  startTime: r.start_time ?? "",
  endTime: r.end_time ?? "",
  note: r.note ?? "",
});

const mapEniReport = (r: Row): EniReport => ({
  id: r.id,
  staffId: r.staff_id,
  periodKey: r.period_key,
  answers: r.answers ?? {},
  comment: r.comment ?? "",
  commentedBy: r.commented_by ?? null,
  updatedAt: new Date(r.updated_at),
});

const mapPracticeRecord = (r: Row): PracticeRecord => ({
  id: r.id,
  staffId: r.staff_id,
  practiceDate: r.practice_date,
  minutes: r.minutes,
  partnerStaffId: r.partner_staff_id,
  partnerName: r.partner_name ?? "",
  content: r.content ?? "",
  createdAt: new Date(r.created_at),
});

const mapPracticePair = (r: Row): PracticePair => ({
  id: r.id,
  targetMonth: r.target_month,
  memberStaffId: r.member_staff_id,
  partnerStaffId: r.partner_staff_id,
});

const mapMeeting = (r: Row): Meeting => ({
  id: r.id,
  meetingType: r.meeting_type,
  title: r.title ?? "",
  meetingDate: r.meeting_date,
  startTime: r.start_time ?? "",
  hostStaffId: r.host_staff_id,
  guestStaffId: r.guest_staff_id,
  minutesUrl: r.minutes_url ?? "",
  minutesText: r.minutes_text ?? "",
  minutesPhoto: r.minutes_photo ?? "",
  minutesDone: r.minutes_done ?? false,
  createdBy: r.created_by,
  createdAt: new Date(r.created_at),
});

const mapAbsenceReport = (r: Row): AbsenceReport => ({
  id: r.id,
  staffId: r.staff_id,
  absenceDate: r.absence_date,
  kind: r.kind,
  hours: Number(r.hours ?? 0),
  reason: r.reason ?? "",
  reportedBy: r.reported_by,
  createdAt: new Date(r.created_at),
});

const mapOrderRequest = (r: Row): OrderRequest => ({
  id: r.id,
  staffId: r.staff_id,
  category: r.category,
  itemName: r.item_name,
  quantity: r.quantity,
  note: r.note ?? "",
  status: r.status,
  createdAt: new Date(r.created_at),
  updatedAt: new Date(r.updated_at),
});

const EMPTY_PLAN_FIELDS = { goal: "", horenso: "", todo: "", timetable: "" };

const mapDailyPlan = (r: Row): DailyPlan => ({
  id: r.id,
  staffId: r.staff_id,
  planDate: r.plan_date,
  content: r.content ?? "",
  fields: { ...EMPTY_PLAN_FIELDS, ...(r.fields ?? {}) },
  photo: r.photo ?? "",
  seenBy: r.seen_by ?? null,
  seenAt: r.seen_at ? new Date(r.seen_at) : null,
});

const mapIdealSchedule = (r: Row): IdealSchedule => ({
  id: r.id,
  staffId: r.staff_id,
  scope: r.scope,
  content: r.content ?? "",
  updatedAt: new Date(r.updated_at),
});

const mapBroadcast = (r: Row): Broadcast => ({
  id: r.id,
  sentBy: r.sent_by,
  body: r.body,
  sentAt: new Date(r.sent_at),
  recipientCount: r.recipient_count,
});

const mapShiftRules = (r: Row): ShiftRules => ({
  maxConsecutiveDays: r.max_consecutive_days,
  minStaffPerStoreDay: r.min_staff_per_store_per_day,
  requestDeadlineDay: r.request_deadline_day,
});

const mapShiftRequestMonth = (r: Row): ShiftRequestMonth => ({
  id: r.id,
  staffId: r.staff_id,
  targetMonth: r.target_month,
  note: r.note ?? "",
  submittedAt: new Date(r.submitted_at),
  updatedAt: new Date(r.updated_at),
});

const mapShiftRequest = (r: Row): ShiftRequest => ({
  id: r.id,
  staffId: r.staff_id,
  targetMonth: r.target_month,
  date: r.date,
  preference: r.preference,
});

const mapShiftAssignment = (r: Row): ShiftAssignment => ({
  id: r.id,
  targetMonth: r.target_month,
  date: r.date,
  staffId: r.staff_id,
  storeId: r.store_id,
  shiftType: r.shift_type,
  status: r.status,
});

function must<T>(data: T | null, error: { message: string } | null, context: string): T {
  if (error) throw new Error(`[supabase] ${context}: ${error.message}`);
  if (data === null) throw new Error(`[supabase] ${context}: データが見つかりません`);
  return data;
}

class SupabaseStore implements DataStore {
  private sb: SupabaseClient;

  constructor() {
    this.sb = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
  }

  async getStore(): Promise<Store> {
    const { data, error } = await this.sb
      .from("stores")
      .select("*")
      .order("created_at")
      .limit(1)
      .single();
    return mapStore(must(data, error, "店舗取得"));
  }

  async listStores(): Promise<Store[]> {
    const { data, error } = await this.sb.from("stores").select("*").order("created_at");
    return must(data, error, "店舗一覧").map(mapStore);
  }

  async createStore(input: { name: string; address: string }): Promise<Store> {
    const base = await this.getStore();
    const { data, error } = await this.sb
      .from("stores")
      .insert({
        name: input.name,
        address: input.address,
        // TODO: 新店舗の緯度経度は本店の値を仮置き。マスタ設定から正しい座標に変更する
        lat: base.lat,
        lng: base.lng,
        gps_radius_m: 100,
        attendance_enabled: true,
      })
      .select()
      .single();
    return mapStore(must(data, error, "店舗作成"));
  }

  async updateStoreById(id: string, patch: Partial<Omit<Store, "id">>): Promise<Store> {
    const row: Row = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.address !== undefined) row.address = patch.address;
    if (patch.lat !== undefined) row.lat = patch.lat;
    if (patch.lng !== undefined) row.lng = patch.lng;
    if (patch.gpsRadiusM !== undefined) row.gps_radius_m = patch.gpsRadiusM;
    if (patch.attendanceEnabled !== undefined) row.attendance_enabled = patch.attendanceEnabled;
    const { data, error } = await this.sb
      .from("stores")
      .update(row)
      .eq("id", id)
      .select()
      .single();
    return mapStore(must(data, error, "店舗更新"));
  }

  async deleteStore(id: string): Promise<void> {
    const { count } = await this.sb.from("stores").select("*", { count: "exact", head: true });
    if ((count ?? 0) <= 1) throw new Error("最後の店舗は削除できません");
    const { error } = await this.sb.from("stores").delete().eq("id", id);
    if (error?.code === "23503") {
      throw new Error("この店舗に紐づくデータ（スタッフ・打刻・現金・シフト等）があるため削除できません");
    }
    if (error) throw new Error(`[supabase] 店舗削除: ${error.message}`);
  }

  async listStaff(): Promise<Staff[]> {
    const { data, error } = await this.sb.from("staff").select("*").order("created_at");
    return must(data, error, "スタッフ一覧").map(mapStaff);
  }

  async getStaff(id: string): Promise<Staff | null> {
    const { data, error } = await this.sb.from("staff").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`[supabase] スタッフ取得: ${error.message}`);
    return data ? mapStaff(data) : null;
  }

  async getStaffByLoginId(loginId: string): Promise<StaffWithSecret | null> {
    const { data, error } = await this.sb
      .from("staff")
      .select("*")
      .eq("login_id", loginId)
      .maybeSingle();
    if (error) throw new Error(`[supabase] スタッフ取得: ${error.message}`);
    return data ? { ...mapStaff(data), passwordHash: data.password_hash } : null;
  }

  async createStaff(input: StaffInput): Promise<Staff> {
    const { data, error } = await this.sb
      .from("staff")
      .insert({
        store_id: input.storeId,
        name: input.name,
        login_id: input.loginId,
        password_hash: input.passwordHash,
        role: input.role,
        job_type: input.jobType ?? "",
        rank: input.rank ?? "",
        is_executive: input.isExecutive ?? false,
        fixed_overtime_hours: input.fixedOvertimeHours,
      })
      .select()
      .single();
    if (error?.code === "23505") throw new Error("このログインIDは既に使われています");
    return mapStaff(must(data, error, "スタッフ作成"));
  }

  async updateStaff(
    id: string,
    patch: Partial<
      Pick<
        Staff,
        "name" | "role" | "jobType" | "rank" | "isExecutive" | "fixedOvertimeHours" | "isActive"
      >
    > & {
      passwordHash?: string;
    }
  ): Promise<Staff> {
    const row: Row = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.role !== undefined) row.role = patch.role;
    if (patch.jobType !== undefined) row.job_type = patch.jobType;
    if (patch.rank !== undefined) row.rank = patch.rank;
    if (patch.isExecutive !== undefined) row.is_executive = patch.isExecutive;
    if (patch.fixedOvertimeHours !== undefined) row.fixed_overtime_hours = patch.fixedOvertimeHours;
    if (patch.isActive !== undefined) row.is_active = patch.isActive;
    if (patch.passwordHash !== undefined) row.password_hash = patch.passwordHash;
    const { data, error } = await this.sb
      .from("staff")
      .update(row)
      .eq("id", id)
      .select()
      .single();
    return mapStaff(must(data, error, "スタッフ更新"));
  }

  async deleteStaff(id: string): Promise<void> {
    const { error } = await this.sb.from("staff").delete().eq("id", id);
    if (error?.code === "23503") {
      throw new Error(
        "このスタッフには日報・打刻・シフト等の記録があるため削除できません。代わりに「無効」にしてください（記録は残ります）"
      );
    }
    if (error) throw new Error(`[supabase] スタッフ削除: ${error.message}`);
  }

  async listCustomers(search?: string): Promise<Customer[]> {
    let query = this.sb.from("customers").select("*").order("created_at", { ascending: false });
    if (search?.trim()) query = query.ilike("full_name", `%${search.trim()}%`);
    const { data, error } = await query;
    return must(data, error, "顧客一覧").map(mapCustomer);
  }

  async getCustomer(id: string): Promise<Customer | null> {
    const { data, error } = await this.sb.from("customers").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`[supabase] 顧客取得: ${error.message}`);
    return data ? mapCustomer(data) : null;
  }

  async getCustomerByLineUserId(lineUserId: string): Promise<Customer | null> {
    const { data, error } = await this.sb
      .from("customers")
      .select("*")
      .eq("line_user_id", lineUserId)
      .maybeSingle();
    if (error) throw new Error(`[supabase] 顧客取得: ${error.message}`);
    return data ? mapCustomer(data) : null;
  }

  async createCustomer(input: { lineUserId: string | null; fullName: string }): Promise<Customer> {
    const { data, error } = await this.sb
      .from("customers")
      .insert({ line_user_id: input.lineUserId, full_name: input.fullName })
      .select()
      .single();
    return mapCustomer(must(data, error, "顧客作成"));
  }

  async updateCustomer(id: string, patch: { fullName?: string }): Promise<Customer> {
    const row: Row = {};
    if (patch.fullName !== undefined) row.full_name = patch.fullName;
    const { data, error } = await this.sb
      .from("customers")
      .update(row)
      .eq("id", id)
      .select()
      .single();
    return mapCustomer(must(data, error, "顧客更新"));
  }

  async createCounselingResponse(input: {
    customerId: string;
    answers: Record<string, unknown>;
  }): Promise<CounselingResponse> {
    const { data, error } = await this.sb
      .from("counseling_responses")
      .insert({ customer_id: input.customerId, answers: input.answers, status: "pending" })
      .select()
      .single();
    return mapCounseling(must(data, error, "カウンセリング作成"));
  }

  async listCounselingResponses(filter?: {
    status?: CounselingStatus;
    customerId?: string;
  }): Promise<CounselingResponse[]> {
    let query = this.sb
      .from("counseling_responses")
      .select("*")
      .order("submitted_at", { ascending: false });
    if (filter?.status) query = query.eq("status", filter.status);
    if (filter?.customerId) query = query.eq("customer_id", filter.customerId);
    const { data, error } = await query;
    return must(data, error, "カウンセリング一覧").map(mapCounseling);
  }

  async getCounselingResponse(id: string): Promise<CounselingResponse | null> {
    const { data, error } = await this.sb
      .from("counseling_responses")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`[supabase] カウンセリング取得: ${error.message}`);
    return data ? mapCounseling(data) : null;
  }

  async confirmCounselingResponse(id: string, staffId: string): Promise<CounselingResponse> {
    const { data, error } = await this.sb
      .from("counseling_responses")
      .update({ status: "confirmed", confirmed_by: staffId, confirmed_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    return mapCounseling(must(data, error, "カウンセリング確認"));
  }

  async upsertDailyReport(input: DailyReportInput): Promise<DailyReport> {
    const { data, error } = await this.sb
      .from("daily_reports")
      .upsert(
        {
          staff_id: input.staffId,
          report_date: input.reportDate,
          new_clients: input.newClients,
          repeat_clients: input.repeatClients,
          next_bookings: input.nextBookings,
          service_sales: input.serviceSales,
          option_sales: input.optionSales,
          retail_sales: input.retailSales,
          memo: input.memo,
          good_point: input.goodPoint,
          improvement: input.improvement,
          message: input.message,
        },
        { onConflict: "staff_id,report_date" }
      )
      .select()
      .single();
    return mapReport(must(data, error, "日報保存"));
  }

  async getDailyReport(staffId: string, reportDate: string): Promise<DailyReport | null> {
    const { data, error } = await this.sb
      .from("daily_reports")
      .select("*")
      .eq("staff_id", staffId)
      .eq("report_date", reportDate)
      .maybeSingle();
    if (error) throw new Error(`[supabase] 日報取得: ${error.message}`);
    return data ? mapReport(data) : null;
  }

  async getDailyReportById(id: string): Promise<DailyReport | null> {
    const { data, error } = await this.sb
      .from("daily_reports")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`[supabase] 日報取得: ${error.message}`);
    return data ? mapReport(data) : null;
  }

  async deleteDailyReport(id: string): Promise<void> {
    const { error } = await this.sb.from("daily_reports").delete().eq("id", id);
    if (error) throw new Error(`[supabase] 日報削除: ${error.message}`);
  }

  async listDailyReports(filter: {
    staffId?: string;
    from: string;
    to: string;
  }): Promise<DailyReport[]> {
    let query = this.sb
      .from("daily_reports")
      .select("*")
      .gte("report_date", filter.from)
      .lte("report_date", filter.to)
      .order("report_date");
    if (filter.staffId) query = query.eq("staff_id", filter.staffId);
    const { data, error } = await query;
    return must(data, error, "日報一覧").map(mapReport);
  }

  async upsertCashReport(input: CashReportInput): Promise<CashReport> {
    const { data, error } = await this.sb
      .from("cash_reports")
      .upsert(
        {
          store_id: input.storeId,
          report_date: input.reportDate,
          cash_sales: input.cashSales,
          register_balance: input.registerBalance,
          moved_to_safe: input.movedToSafe,
          change_fund: input.changeFund,
          safe_balance: input.safeBalance,
          bank_deposit: input.bankDeposit,
          memo: input.memo,
          created_by: input.createdBy,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "store_id,report_date" }
      )
      .select()
      .single();
    return mapCashReport(must(data, error, "レジ締め保存"));
  }

  async getCashReport(storeId: string, reportDate: string): Promise<CashReport | null> {
    const { data, error } = await this.sb
      .from("cash_reports")
      .select("*")
      .eq("store_id", storeId)
      .eq("report_date", reportDate)
      .maybeSingle();
    if (error) throw new Error(`[supabase] レジ締め取得: ${error.message}`);
    return data ? mapCashReport(data) : null;
  }

  async listCashReports(filter: {
    storeId?: string;
    from: string;
    to: string;
  }): Promise<CashReport[]> {
    let query = this.sb
      .from("cash_reports")
      .select("*")
      .gte("report_date", filter.from)
      .lte("report_date", filter.to)
      .order("report_date");
    if (filter.storeId) query = query.eq("store_id", filter.storeId);
    const { data, error } = await query;
    return must(data, error, "レジ締め一覧").map(mapCashReport);
  }

  async createAttendance(input: AttendanceInput): Promise<Attendance> {
    const { data, error } = await this.sb
      .from("attendances")
      .insert({
        staff_id: input.staffId,
        store_id: input.storeId,
        punch_type: input.punchType,
        punched_at: input.punchedAt.toISOString(),
        lat: input.lat,
        lng: input.lng,
        distance_m: input.distanceM,
        is_valid: input.isValid,
      })
      .select()
      .single();
    return mapAttendance(must(data, error, "打刻保存"));
  }

  async listAttendances(filter: {
    staffId?: string;
    from: Date;
    to: Date;
  }): Promise<Attendance[]> {
    let query = this.sb
      .from("attendances")
      .select("*")
      .gte("punched_at", filter.from.toISOString())
      .lt("punched_at", filter.to.toISOString())
      .order("punched_at");
    if (filter.staffId) query = query.eq("staff_id", filter.staffId);
    const { data, error } = await query;
    return must(data, error, "勤怠一覧").map(mapAttendance);
  }

  async createNextAppointment(input: {
    customerId: string;
    scheduledAt: Date;
    staffId: string | null;
  }): Promise<NextAppointment> {
    const { data, error } = await this.sb
      .from("next_appointments")
      .insert({
        customer_id: input.customerId,
        scheduled_at: input.scheduledAt.toISOString(),
        staff_id: input.staffId,
      })
      .select()
      .single();
    return mapAppointment(must(data, error, "次回予約作成"));
  }

  async listNextAppointments(filter?: {
    customerId?: string;
    from?: Date;
    to?: Date;
  }): Promise<NextAppointment[]> {
    let query = this.sb.from("next_appointments").select("*").order("scheduled_at");
    if (filter?.customerId) query = query.eq("customer_id", filter.customerId);
    if (filter?.from) query = query.gte("scheduled_at", filter.from.toISOString());
    if (filter?.to) query = query.lt("scheduled_at", filter.to.toISOString());
    const { data, error } = await query;
    return must(data, error, "次回予約一覧").map(mapAppointment);
  }

  async getNextAppointment(id: string): Promise<NextAppointment | null> {
    const { data, error } = await this.sb
      .from("next_appointments")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`[supabase] 次回予約取得: ${error.message}`);
    return data ? mapAppointment(data) : null;
  }

  async updateNextAppointment(id: string, patch: AppointmentPatch): Promise<NextAppointment> {
    const row: Row = {};
    if (patch.scheduledAt !== undefined) row.scheduled_at = patch.scheduledAt.toISOString();
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.requestedNewAt !== undefined) {
      row.requested_new_at = patch.requestedNewAt ? patch.requestedNewAt.toISOString() : null;
    }
    if (patch.changeNote !== undefined) row.change_note = patch.changeNote;
    if (patch.reminderSentAt !== undefined) {
      row.reminder_sent_at = patch.reminderSentAt ? patch.reminderSentAt.toISOString() : null;
    }
    if (patch.preReminderSentAt !== undefined) {
      row.pre_reminder_sent_at = patch.preReminderSentAt ? patch.preReminderSentAt.toISOString() : null;
    }
    const { data, error } = await this.sb
      .from("next_appointments")
      .update(row)
      .eq("id", id)
      .select()
      .single();
    return mapAppointment(must(data, error, "次回予約更新"));
  }

  async deleteNextAppointment(id: string): Promise<void> {
    const { error } = await this.sb.from("next_appointments").delete().eq("id", id);
    if (error) throw new Error(`[supabase] 次回予約削除: ${error.message}`);
  }

  async listAppointmentsNeedingReminder(from: Date, to: Date): Promise<NextAppointment[]> {
    const { data, error } = await this.sb
      .from("next_appointments")
      .select("*")
      .is("reminder_sent_at", null)
      .neq("status", "cancelled")
      .gte("scheduled_at", from.toISOString())
      .lt("scheduled_at", to.toISOString());
    return must(data, error, "リマインド対象取得").map(mapAppointment);
  }

  async markReminderSent(id: string, sentAt: Date): Promise<void> {
    const { error } = await this.sb
      .from("next_appointments")
      .update({ reminder_sent_at: sentAt.toISOString() })
      .eq("id", id);
    if (error) throw new Error(`[supabase] リマインド記録: ${error.message}`);
  }

  async listAppointmentsNeedingPreReminder(from: Date, to: Date): Promise<NextAppointment[]> {
    const { data, error } = await this.sb
      .from("next_appointments")
      .select("*")
      .is("pre_reminder_sent_at", null)
      .neq("status", "cancelled")
      .gte("scheduled_at", from.toISOString())
      .lt("scheduled_at", to.toISOString());
    return must(data, error, "事前案内対象取得").map(mapAppointment);
  }

  async markPreReminderSent(id: string, sentAt: Date): Promise<void> {
    const { error } = await this.sb
      .from("next_appointments")
      .update({ pre_reminder_sent_at: sentAt.toISOString() })
      .eq("id", id);
    if (error) throw new Error(`[supabase] 事前案内記録: ${error.message}`);
  }

  async countRemindersSent(from: Date, to: Date): Promise<number> {
    const { count, error } = await this.sb
      .from("next_appointments")
      .select("*", { count: "exact", head: true })
      .gte("reminder_sent_at", from.toISOString())
      .lt("reminder_sent_at", to.toISOString());
    if (error) throw new Error(`[supabase] リマインド数取得: ${error.message}`);
    return count ?? 0;
  }

  async countPreRemindersSent(from: Date, to: Date): Promise<number> {
    const { count, error } = await this.sb
      .from("next_appointments")
      .select("*", { count: "exact", head: true })
      .gte("pre_reminder_sent_at", from.toISOString())
      .lt("pre_reminder_sent_at", to.toISOString());
    if (error) throw new Error(`[supabase] 事前案内数取得: ${error.message}`);
    return count ?? 0;
  }

  async createBroadcast(input: {
    sentBy: string;
    body: string;
    recipientCount: number;
  }): Promise<Broadcast> {
    const { data, error } = await this.sb
      .from("broadcasts")
      .insert({ sent_by: input.sentBy, body: input.body, recipient_count: input.recipientCount })
      .select()
      .single();
    return mapBroadcast(must(data, error, "配信履歴作成"));
  }

  async listBroadcasts(): Promise<Broadcast[]> {
    const { data, error } = await this.sb
      .from("broadcasts")
      .select("*")
      .order("sent_at", { ascending: false });
    return must(data, error, "配信履歴一覧").map(mapBroadcast);
  }

  async countBroadcastMessages(from: Date, to: Date): Promise<number> {
    const { data, error } = await this.sb
      .from("broadcasts")
      .select("recipient_count")
      .gte("sent_at", from.toISOString())
      .lt("sent_at", to.toISOString());
    return must(data, error, "配信数取得").reduce(
      (sum: number, r: Row) => sum + (r.recipient_count ?? 0),
      0
    );
  }

  // ---- シフト管理 ----

  async getShiftRules(): Promise<ShiftRules> {
    const { data, error } = await this.sb.from("shift_rules").select("*").eq("id", 1).single();
    return mapShiftRules(must(data, error, "シフトルール取得"));
  }

  async updateShiftRules(patch: Partial<ShiftRules>): Promise<ShiftRules> {
    const row: Row = {};
    if (patch.maxConsecutiveDays !== undefined) row.max_consecutive_days = patch.maxConsecutiveDays;
    if (patch.minStaffPerStoreDay !== undefined)
      row.min_staff_per_store_per_day = patch.minStaffPerStoreDay;
    if (patch.requestDeadlineDay !== undefined) row.request_deadline_day = patch.requestDeadlineDay;
    const { data, error } = await this.sb
      .from("shift_rules")
      .update(row)
      .eq("id", 1)
      .select()
      .single();
    return mapShiftRules(must(data, error, "シフトルール更新"));
  }

  async saveShiftRequest(input: {
    staffId: string;
    targetMonth: string;
    note: string;
    days: Record<string, ShiftPreference>;
    storeIds: string[];
  }): Promise<void> {
    // 月単位の提出情報をupsert（submitted_atは初回のみ、updated_atは毎回更新）
    const { data: existing, error: e0 } = await this.sb
      .from("shift_request_months")
      .select("id")
      .eq("staff_id", input.staffId)
      .eq("target_month", input.targetMonth)
      .maybeSingle();
    if (e0) throw new Error(`[supabase] 希望提出確認: ${e0.message}`);
    if (existing) {
      const { error } = await this.sb
        .from("shift_request_months")
        .update({ note: input.note, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw new Error(`[supabase] 希望更新: ${error.message}`);
    } else {
      const { error } = await this.sb.from("shift_request_months").insert({
        staff_id: input.staffId,
        target_month: input.targetMonth,
        note: input.note,
      });
      if (error) throw new Error(`[supabase] 希望作成: ${error.message}`);
    }

    // 日別希望・勤務可能店舗は総入れ替え（トランザクションは使わず順次実行。実害は小さい）
    const del1 = await this.sb
      .from("shift_requests")
      .delete()
      .eq("staff_id", input.staffId)
      .eq("target_month", input.targetMonth);
    if (del1.error) throw new Error(`[supabase] 希望削除: ${del1.error.message}`);
    const dayRows = Object.entries(input.days).map(([date, preference]) => ({
      staff_id: input.staffId,
      target_month: input.targetMonth,
      date,
      preference,
    }));
    if (dayRows.length > 0) {
      const ins1 = await this.sb.from("shift_requests").insert(dayRows);
      if (ins1.error) throw new Error(`[supabase] 希望保存: ${ins1.error.message}`);
    }

    const del2 = await this.sb
      .from("staff_available_stores")
      .delete()
      .eq("staff_id", input.staffId)
      .eq("target_month", input.targetMonth);
    if (del2.error) throw new Error(`[supabase] 可能店舗削除: ${del2.error.message}`);
    if (input.storeIds.length > 0) {
      const ins2 = await this.sb.from("staff_available_stores").insert(
        input.storeIds.map((storeId) => ({
          staff_id: input.staffId,
          target_month: input.targetMonth,
          store_id: storeId,
        }))
      );
      if (ins2.error) throw new Error(`[supabase] 可能店舗保存: ${ins2.error.message}`);
    }
  }

  async getShiftRequestMonth(
    staffId: string,
    targetMonth: string
  ): Promise<ShiftRequestMonth | null> {
    const { data, error } = await this.sb
      .from("shift_request_months")
      .select("*")
      .eq("staff_id", staffId)
      .eq("target_month", targetMonth)
      .maybeSingle();
    if (error) throw new Error(`[supabase] 希望取得: ${error.message}`);
    return data ? mapShiftRequestMonth(data) : null;
  }

  async listShiftRequestMonths(targetMonth: string): Promise<ShiftRequestMonth[]> {
    const { data, error } = await this.sb
      .from("shift_request_months")
      .select("*")
      .eq("target_month", targetMonth);
    return must(data, error, "希望一覧").map(mapShiftRequestMonth);
  }

  async listShiftRequests(targetMonth: string, staffId?: string): Promise<ShiftRequest[]> {
    let query = this.sb.from("shift_requests").select("*").eq("target_month", targetMonth);
    if (staffId) query = query.eq("staff_id", staffId);
    const { data, error } = await query;
    return must(data, error, "日別希望一覧").map(mapShiftRequest);
  }

  async listAvailableStores(
    targetMonth: string,
    staffId?: string
  ): Promise<{ staffId: string; storeId: string }[]> {
    let query = this.sb
      .from("staff_available_stores")
      .select("staff_id, store_id")
      .eq("target_month", targetMonth);
    if (staffId) query = query.eq("staff_id", staffId);
    const { data, error } = await query;
    return must(data, error, "可能店舗一覧").map((r: Row) => ({
      staffId: r.staff_id,
      storeId: r.store_id,
    }));
  }

  async listShiftAssignments(targetMonth: string, staffId?: string): Promise<ShiftAssignment[]> {
    let query = this.sb
      .from("shift_assignments")
      .select("*")
      .eq("target_month", targetMonth)
      .order("date");
    if (staffId) query = query.eq("staff_id", staffId);
    const { data, error } = await query;
    return must(data, error, "割当一覧").map(mapShiftAssignment);
  }

  async replaceMonthAssignments(targetMonth: string, rows: NewShiftAssignment[]): Promise<void> {
    const del = await this.sb.from("shift_assignments").delete().eq("target_month", targetMonth);
    if (del.error) throw new Error(`[supabase] 割当削除: ${del.error.message}`);
    if (rows.length > 0) {
      const ins = await this.sb.from("shift_assignments").insert(
        rows.map((r) => ({
          target_month: targetMonth,
          date: r.date,
          staff_id: r.staffId,
          store_id: r.storeId,
          shift_type: r.shiftType,
          status: "draft",
        }))
      );
      if (ins.error) throw new Error(`[supabase] 割当保存: ${ins.error.message}`);
    }
  }

  async createShiftAssignment(
    input: NewShiftAssignment & { targetMonth: string; status: AssignmentStatus }
  ): Promise<ShiftAssignment> {
    const { data, error } = await this.sb
      .from("shift_assignments")
      .insert({
        target_month: input.targetMonth,
        date: input.date,
        staff_id: input.staffId,
        store_id: input.storeId,
        shift_type: input.shiftType,
        status: input.status,
      })
      .select()
      .single();
    if (error?.code === "23505") {
      throw new Error("このスタッフはこの日すでに割り当てられています");
    }
    return mapShiftAssignment(must(data, error, "割当作成"));
  }

  async deleteShiftAssignment(id: string): Promise<void> {
    const { error } = await this.sb.from("shift_assignments").delete().eq("id", id);
    if (error) throw new Error(`[supabase] 割当削除: ${error.message}`);
  }

  async confirmMonthAssignments(targetMonth: string): Promise<number> {
    const { data, error } = await this.sb
      .from("shift_assignments")
      .update({ status: "confirmed" })
      .eq("target_month", targetMonth)
      .select("id");
    return must(data, error, "シフト確定").length;
  }

  // ---- 出勤スケジュール（基本パターン＋希望休） ----

  async listWorkPatterns(staffId?: string): Promise<WorkPatternDay[]> {
    let query = this.sb.from("work_patterns").select("*").order("weekday");
    if (staffId) query = query.eq("staff_id", staffId);
    const { data, error } = await query;
    return must(data, error, "出勤パターン一覧").map(mapWorkPattern);
  }

  async saveWorkPattern(staffId: string, days: Omit<WorkPatternDay, "staffId">[]): Promise<void> {
    const del = await this.sb.from("work_patterns").delete().eq("staff_id", staffId);
    if (del.error) throw new Error(`[supabase] 出勤パターン削除: ${del.error.message}`);
    if (days.length > 0) {
      const ins = await this.sb.from("work_patterns").insert(
        days.map((d) => ({
          staff_id: staffId,
          weekday: d.weekday,
          is_working: d.isWorking,
          start_time: d.startTime,
          end_time: d.endTime,
        }))
      );
      if (ins.error) throw new Error(`[supabase] 出勤パターン保存: ${ins.error.message}`);
    }
  }

  async listDayoffRequests(filter: {
    staffId?: string;
    from: string;
    to: string;
  }): Promise<DayoffRequest[]> {
    let query = this.sb
      .from("dayoff_requests")
      .select("*")
      .gte("date", filter.from)
      .lte("date", filter.to)
      .order("date");
    if (filter.staffId) query = query.eq("staff_id", filter.staffId);
    const { data, error } = await query;
    return must(data, error, "希望休一覧").map(mapDayoffRequest);
  }

  async replaceDayoffRequests(staffId: string, targetMonth: string, dates: string[]): Promise<void> {
    const from = `${targetMonth}-01`;
    const to = `${targetMonth}-31`;
    const del = await this.sb
      .from("dayoff_requests")
      .delete()
      .eq("staff_id", staffId)
      .gte("date", from)
      .lte("date", to);
    if (del.error) throw new Error(`[supabase] 希望休削除: ${del.error.message}`);
    if (dates.length > 0) {
      const ins = await this.sb
        .from("dayoff_requests")
        .insert(dates.map((date) => ({ staff_id: staffId, date })));
      if (ins.error) throw new Error(`[supabase] 希望休保存: ${ins.error.message}`);
    }
  }

  async listScheduleOverrides(filter: {
    staffId?: string;
    from: string;
    to: string;
  }): Promise<ScheduleOverride[]> {
    let query = this.sb
      .from("schedule_overrides")
      .select("*")
      .gte("date", filter.from)
      .lte("date", filter.to)
      .order("date");
    if (filter.staffId) query = query.eq("staff_id", filter.staffId);
    const { data, error } = await query;
    return must(data, error, "個別調整一覧").map(mapScheduleOverride);
  }

  async upsertScheduleOverride(input: Omit<ScheduleOverride, "id">): Promise<void> {
    const { error } = await this.sb.from("schedule_overrides").upsert(
      {
        staff_id: input.staffId,
        date: input.date,
        is_working: input.isWorking,
        start_time: input.startTime,
        end_time: input.endTime,
        note: input.note,
      },
      { onConflict: "staff_id,date" }
    );
    if (error) throw new Error(`[supabase] 個別調整保存: ${error.message}`);
  }

  async deleteScheduleOverride(staffId: string, date: string): Promise<void> {
    const { error } = await this.sb
      .from("schedule_overrides")
      .delete()
      .eq("staff_id", staffId)
      .eq("date", date);
    if (error) throw new Error(`[supabase] 個別調整削除: ${error.message}`);
  }

  // ---- ENi（ヘアサロン）向け機能 ----

  async upsertEniReport(input: {
    kind: "stylist" | "weekly";
    staffId: string;
    periodKey: string;
    answers: Record<string, unknown>;
  }): Promise<EniReport> {
    const { data, error } = await this.sb
      .from("eni_reports")
      .upsert(
        {
          kind: input.kind,
          staff_id: input.staffId,
          period_key: input.periodKey,
          answers: input.answers,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "kind,staff_id,period_key" }
      )
      .select()
      .single();
    return mapEniReport(must(data, error, "ENiレポート保存"));
  }

  async getEniReport(
    kind: "stylist" | "weekly",
    staffId: string,
    periodKey: string
  ): Promise<EniReport | null> {
    const { data, error } = await this.sb
      .from("eni_reports")
      .select("*")
      .eq("kind", kind)
      .eq("staff_id", staffId)
      .eq("period_key", periodKey)
      .maybeSingle();
    if (error) throw new Error(`[supabase] ENiレポート取得: ${error.message}`);
    return data ? mapEniReport(data) : null;
  }

  async getEniReportById(id: string): Promise<EniReport | null> {
    const { data, error } = await this.sb.from("eni_reports").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`[supabase] ENiレポート取得: ${error.message}`);
    return data ? mapEniReport(data) : null;
  }

  async listEniReports(
    kind: "stylist" | "weekly",
    filter: { staffId?: string; from: string; to: string }
  ): Promise<EniReport[]> {
    let query = this.sb
      .from("eni_reports")
      .select("*")
      .eq("kind", kind)
      .gte("period_key", filter.from)
      .lte("period_key", filter.to)
      .order("period_key", { ascending: false });
    if (filter.staffId) query = query.eq("staff_id", filter.staffId);
    const { data, error } = await query;
    return must(data, error, "ENiレポート一覧").map(mapEniReport);
  }

  async commentEniReport(id: string, comment: string, commentedBy: string): Promise<void> {
    const { error } = await this.sb
      .from("eni_reports")
      .update({ comment, commented_by: commentedBy })
      .eq("id", id);
    if (error) throw new Error(`[supabase] 上司コメント保存: ${error.message}`);
  }

  async createPracticeRecord(
    input: Omit<PracticeRecord, "id" | "createdAt">
  ): Promise<PracticeRecord> {
    const { data, error } = await this.sb
      .from("practice_records")
      .insert({
        staff_id: input.staffId,
        practice_date: input.practiceDate,
        minutes: input.minutes,
        partner_staff_id: input.partnerStaffId,
        partner_name: input.partnerName,
        content: input.content,
      })
      .select()
      .single();
    return mapPracticeRecord(must(data, error, "練習記録作成"));
  }

  async listPracticeRecords(filter: {
    staffId?: string;
    from: string;
    to: string;
  }): Promise<PracticeRecord[]> {
    let query = this.sb
      .from("practice_records")
      .select("*")
      .gte("practice_date", filter.from)
      .lte("practice_date", filter.to)
      .order("practice_date");
    if (filter.staffId) query = query.eq("staff_id", filter.staffId);
    const { data, error } = await query;
    return must(data, error, "練習記録一覧").map(mapPracticeRecord);
  }

  async getPracticeRecord(id: string): Promise<PracticeRecord | null> {
    const { data, error } = await this.sb
      .from("practice_records")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`[supabase] 練習記録取得: ${error.message}`);
    return data ? mapPracticeRecord(data) : null;
  }

  async deletePracticeRecord(id: string): Promise<void> {
    const { error } = await this.sb.from("practice_records").delete().eq("id", id);
    if (error) throw new Error(`[supabase] 練習記録削除: ${error.message}`);
  }

  async listPracticePairs(targetMonth: string): Promise<PracticePair[]> {
    const { data, error } = await this.sb
      .from("practice_pairs")
      .select("*")
      .eq("target_month", targetMonth);
    return must(data, error, "練習ペア一覧").map(mapPracticePair);
  }

  async setPracticePair(
    targetMonth: string,
    memberStaffId: string,
    partnerStaffId: string
  ): Promise<void> {
    if (!partnerStaffId) {
      const { error } = await this.sb
        .from("practice_pairs")
        .delete()
        .eq("target_month", targetMonth)
        .eq("member_staff_id", memberStaffId);
      if (error) throw new Error(`[supabase] 練習ペア解除: ${error.message}`);
      return;
    }
    const { error } = await this.sb.from("practice_pairs").upsert(
      {
        target_month: targetMonth,
        member_staff_id: memberStaffId,
        partner_staff_id: partnerStaffId,
      },
      { onConflict: "target_month,member_staff_id" }
    );
    if (error) throw new Error(`[supabase] 練習ペア保存: ${error.message}`);
  }

  async createMeeting(
    input: Omit<Meeting, "id" | "createdAt" | "minutesUrl" | "minutesText" | "minutesDone">
  ): Promise<Meeting> {
    const { data, error } = await this.sb
      .from("meetings")
      .insert({
        meeting_type: input.meetingType,
        title: input.title,
        meeting_date: input.meetingDate,
        start_time: input.startTime,
        host_staff_id: input.hostStaffId,
        guest_staff_id: input.guestStaffId,
        created_by: input.createdBy,
      })
      .select()
      .single();
    return mapMeeting(must(data, error, "ミーティング作成"));
  }

  async getMeeting(id: string): Promise<Meeting | null> {
    const { data, error } = await this.sb.from("meetings").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`[supabase] ミーティング取得: ${error.message}`);
    return data ? mapMeeting(data) : null;
  }

  async listMeetings(filter: { from: string; to: string }): Promise<Meeting[]> {
    const { data, error } = await this.sb
      .from("meetings")
      .select("*")
      .gte("meeting_date", filter.from)
      .lte("meeting_date", filter.to)
      .order("meeting_date")
      .order("start_time");
    return must(data, error, "ミーティング一覧").map(mapMeeting);
  }

  async listMeetingsMissingMinutes(until: string): Promise<Meeting[]> {
    const { data, error } = await this.sb
      .from("meetings")
      .select("*")
      .eq("minutes_done", false)
      .lte("meeting_date", until)
      .order("meeting_date");
    return must(data, error, "議事録未提出一覧").map(mapMeeting);
  }

  async updateMeetingMinutes(
    id: string,
    patch: { minutesUrl: string; minutesText: string; minutesPhoto: string; minutesDone: boolean }
  ): Promise<Meeting> {
    const { data, error } = await this.sb
      .from("meetings")
      .update({
        minutes_url: patch.minutesUrl,
        minutes_text: patch.minutesText,
        minutes_photo: patch.minutesPhoto,
        minutes_done: patch.minutesDone,
      })
      .eq("id", id)
      .select()
      .single();
    return mapMeeting(must(data, error, "議事録更新"));
  }

  async deleteMeeting(id: string): Promise<void> {
    const { error } = await this.sb.from("meetings").delete().eq("id", id);
    if (error) throw new Error(`[supabase] ミーティング削除: ${error.message}`);
  }

  async createAbsenceReport(input: Omit<AbsenceReport, "id" | "createdAt">): Promise<AbsenceReport> {
    const { data, error } = await this.sb
      .from("absence_reports")
      .insert({
        staff_id: input.staffId,
        absence_date: input.absenceDate,
        kind: input.kind,
        hours: input.hours,
        reason: input.reason,
        reported_by: input.reportedBy,
      })
      .select()
      .single();
    return mapAbsenceReport(must(data, error, "欠勤報告作成"));
  }

  async listAbsenceReports(filter: {
    staffId?: string;
    from: string;
    to: string;
  }): Promise<AbsenceReport[]> {
    let query = this.sb
      .from("absence_reports")
      .select("*")
      .gte("absence_date", filter.from)
      .lte("absence_date", filter.to)
      .order("absence_date");
    if (filter.staffId) query = query.eq("staff_id", filter.staffId);
    const { data, error } = await query;
    return must(data, error, "欠勤報告一覧").map(mapAbsenceReport);
  }

  async createOrderRequest(
    input: Omit<OrderRequest, "id" | "status" | "createdAt" | "updatedAt">
  ): Promise<OrderRequest> {
    const { data, error } = await this.sb
      .from("order_requests")
      .insert({
        staff_id: input.staffId,
        category: input.category,
        item_name: input.itemName,
        quantity: input.quantity,
        note: input.note,
      })
      .select()
      .single();
    return mapOrderRequest(must(data, error, "発注申請作成"));
  }

  async listOrderRequests(filter: {
    staffId?: string;
    from: Date;
    to: Date;
  }): Promise<OrderRequest[]> {
    let query = this.sb
      .from("order_requests")
      .select("*")
      .gte("created_at", filter.from.toISOString())
      .lt("created_at", filter.to.toISOString())
      .order("created_at", { ascending: false });
    if (filter.staffId) query = query.eq("staff_id", filter.staffId);
    const { data, error } = await query;
    return must(data, error, "発注申請一覧").map(mapOrderRequest);
  }

  async updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
    const { error } = await this.sb
      .from("order_requests")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(`[supabase] 発注状況更新: ${error.message}`);
  }

  async upsertDailyPlan(input: {
    staffId: string;
    planDate: string;
    fields: DailyPlanFields;
    photo: string;
  }): Promise<void> {
    // 編集すると「見ました」はリセット（seen_by/seen_at を null に）
    const { error } = await this.sb.from("daily_plans").upsert(
      {
        staff_id: input.staffId,
        plan_date: input.planDate,
        fields: input.fields,
        photo: input.photo,
        seen_by: null,
        seen_at: null,
      },
      { onConflict: "staff_id,plan_date" }
    );
    if (error) throw new Error(`[supabase] 今日のスケジュール保存: ${error.message}`);
  }

  async markDailyPlanSeen(staffId: string, planDate: string, seenBy: string): Promise<void> {
    const { error } = await this.sb
      .from("daily_plans")
      .update({ seen_by: seenBy, seen_at: new Date().toISOString() })
      .eq("staff_id", staffId)
      .eq("plan_date", planDate);
    if (error) throw new Error(`[supabase] 確認記録: ${error.message}`);
  }

  async listDailyPlans(planDate: string): Promise<DailyPlan[]> {
    const { data, error } = await this.sb
      .from("daily_plans")
      .select("*")
      .eq("plan_date", planDate);
    return must(data, error, "今日のスケジュール一覧").map(mapDailyPlan);
  }

  async listIdealSchedules(staffId: string): Promise<IdealSchedule[]> {
    const { data, error } = await this.sb
      .from("ideal_schedules")
      .select("*")
      .eq("staff_id", staffId);
    return must(data, error, "理想スケジュール取得").map(mapIdealSchedule);
  }

  async upsertIdealSchedule(
    staffId: string,
    scope: "week" | "month",
    content: string
  ): Promise<void> {
    const { error } = await this.sb.from("ideal_schedules").upsert(
      {
        staff_id: staffId,
        scope,
        content,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "staff_id,scope" }
    );
    if (error) throw new Error(`[supabase] 理想スケジュール保存: ${error.message}`);
  }
}

let supabaseStore: SupabaseStore | null = null;

export function getSupabaseStore(): SupabaseStore {
  if (!supabaseStore) supabaseStore = new SupabaseStore();
  return supabaseStore;
}
