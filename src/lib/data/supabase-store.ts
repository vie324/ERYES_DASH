// Supabase（PostgreSQL）実装。SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 設定時に使われる。
// すべてサーバー側からサービスロールで接続する（認証は自前のセッションCookieで行うため、
// RLSは全テーブル「拒否」のままでよい。詳細は supabase/schema.sql を参照）。

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type {
  AssignmentStatus,
  Attendance,
  AttendanceInput,
  Broadcast,
  CashReport,
  CashReportInput,
  CounselingResponse,
  CounselingStatus,
  Customer,
  DailyReport,
  DailyReportInput,
  DataStore,
  NewShiftAssignment,
  NextAppointment,
  ShiftAssignment,
  ShiftPreference,
  ShiftRequest,
  ShiftRequestMonth,
  ShiftRules,
  Staff,
  StaffInput,
  StaffWithSecret,
  Store,
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
  reminderSentAt: r.reminder_sent_at ? new Date(r.reminder_sent_at) : null,
  createdAt: new Date(r.created_at),
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
        fixed_overtime_hours: input.fixedOvertimeHours,
      })
      .select()
      .single();
    if (error?.code === "23505") throw new Error("このログインIDは既に使われています");
    return mapStaff(must(data, error, "スタッフ作成"));
  }

  async updateStaff(
    id: string,
    patch: Partial<Pick<Staff, "name" | "role" | "fixedOvertimeHours" | "isActive">> & {
      passwordHash?: string;
    }
  ): Promise<Staff> {
    const row: Row = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.role !== undefined) row.role = patch.role;
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

  async deleteNextAppointment(id: string): Promise<void> {
    const { error } = await this.sb.from("next_appointments").delete().eq("id", id);
    if (error) throw new Error(`[supabase] 次回予約削除: ${error.message}`);
  }

  async listAppointmentsNeedingReminder(from: Date, to: Date): Promise<NextAppointment[]> {
    const { data, error } = await this.sb
      .from("next_appointments")
      .select("*")
      .is("reminder_sent_at", null)
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

  async countRemindersSent(from: Date, to: Date): Promise<number> {
    const { count, error } = await this.sb
      .from("next_appointments")
      .select("*", { count: "exact", head: true })
      .gte("reminder_sent_at", from.toISOString())
      .lt("reminder_sent_at", to.toISOString());
    if (error) throw new Error(`[supabase] リマインド数取得: ${error.message}`);
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
}

let supabaseStore: SupabaseStore | null = null;

export function getSupabaseStore(): SupabaseStore {
  if (!supabaseStore) supabaseStore = new SupabaseStore();
  return supabaseStore;
}
