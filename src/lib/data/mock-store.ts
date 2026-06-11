// メモリ内データストア（デモモード用）。
// Supabase の環境変数が未設定のときに使われ、起動のたびにデモデータが再生成される。
// 本番では supabase-store.ts が使われるため、このファイルは動作確認専用。

import { randomUUID } from "crypto";
import { hashPassword } from "@/lib/auth/password";
import { addDays, addMonths, datesOfMonth, jstDayBoundsUtc, thisMonthJst, todayJst } from "@/lib/date";
import { generateAssignments } from "@/lib/shift/assign";
import type {
  AssignmentStatus,
  Attendance,
  AttendanceInput,
  Broadcast,
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

interface MockDb {
  stores: Store[];
  staff: (StaffWithSecret & { passwordHash: string })[];
  customers: Customer[];
  counseling: CounselingResponse[];
  reports: DailyReport[];
  attendances: Attendance[];
  appointments: NextAppointment[];
  broadcasts: Broadcast[];
  shiftRules: ShiftRules;
  shiftRequestMonths: ShiftRequestMonth[];
  shiftRequests: ShiftRequest[];
  shiftAvailableStores: { staffId: string; targetMonth: string; storeId: string }[];
  shiftAssignments: ShiftAssignment[];
}

/** JSTの日時（時・分）をUTCのDateにする（デモデータ生成用） */
function jstAt(dateStr: string, hour: number, minute = 0): Date {
  const { start } = jstDayBoundsUtc(dateStr);
  return new Date(start.getTime() + (hour * 60 + minute) * 60 * 1000);
}

function seed(): MockDb {
  const today = todayJst();
  const month = thisMonthJst();
  const prevMonth = addMonths(month, -1);

  // TODO: 店舗情報は仮値（店名・住所・緯度経度とも）。正式な値に差し替える
  const stores: Store[] = [
    {
      id: "store-1",
      name: "ERYES 渋谷本店",
      address: "東京都渋谷区道玄坂1-2-3（仮）",
      lat: 35.658034,
      lng: 139.701636,
      gpsRadiusM: 100,
      attendanceEnabled: true,
    },
    {
      id: "store-2",
      name: "ERYES 表参道店",
      address: "東京都港区北青山3-4-5（仮）",
      lat: 35.665498,
      lng: 139.712135,
      gpsRadiusM: 100,
      attendanceEnabled: true,
    },
    {
      id: "store-3",
      name: "ERYES 恵比寿店",
      address: "東京都渋谷区恵比寿1-6-7（仮）",
      lat: 35.646691,
      lng: 139.710106,
      gpsRadiusM: 100,
      attendanceEnabled: true,
    },
  ];
  const store = stores[0]; // 本店（勤怠・リマインドの既定店舗）

  const staff: StaffWithSecret[] = [
    {
      id: "staff-admin",
      storeId: store.id,
      name: "相川 恵",
      loginId: "admin",
      role: "admin",
      fixedOvertimeHours: 20,
      isActive: true,
      passwordHash: hashPassword("admin1234"),
    },
    {
      id: "staff-1",
      storeId: store.id,
      name: "佐藤 美咲",
      loginId: "misaki",
      role: "staff",
      // デモで残業超過アラートの動作が見えるよう、あえて少なめに設定している
      fixedOvertimeHours: 10,
      isActive: true,
      passwordHash: hashPassword("staff1234"),
    },
    {
      id: "staff-2",
      storeId: store.id,
      name: "田中 凛",
      loginId: "rin",
      role: "staff",
      fixedOvertimeHours: 20,
      isActive: true,
      passwordHash: hashPassword("staff1234"),
    },
    // シフト管理（3店舗）デモ用の追加スタッフ
    ...[
      ["staff-3", "山本 大輝", "daiki"],
      ["staff-4", "中島 結菜", "yuina"],
      ["staff-5", "小林 蒼", "aoi"],
      ["staff-6", "藤田 ひかり", "hikari"],
    ].map(
      ([id, name, loginId]): StaffWithSecret => ({
        id,
        storeId: store.id,
        name,
        loginId,
        role: "staff",
        fixedOvertimeHours: 20,
        isActive: true,
        passwordHash: hashPassword("staff1234"),
      })
    ),
  ];

  const customers: Customer[] = [
    { id: "cust-1", lineUserId: "mock-user-1", fullName: "高橋 ゆい", createdAt: jstAt(addDays(today, -20), 12) },
    { id: "cust-2", lineUserId: "mock-user-2", fullName: "鈴木 あや", createdAt: jstAt(addDays(today, -10), 15) },
    { id: "cust-3", lineUserId: "mock-user-3", fullName: "伊藤 まな", createdAt: jstAt(addDays(today, -1), 18) },
  ];

  const counseling: CounselingResponse[] = [
    {
      id: "cr-1",
      customerId: "cust-1",
      answers: {
        full_name: "高橋 ゆい",
        furigana: "タカハシ ユイ",
        birthday: "1995-04-12",
        phone: "090-1111-2222",
        visit_reason: "ホットペッパービューティー",
        concerns: ["まつ毛が下がっている", "左右差が気になる"],
        allergy: "なし",
        contact_lens: "ソフト",
        experience: "1年以内にあり",
        pregnant: "いいえ",
        desired_image: "ナチュラルに長さを出したい",
        remarks: "",
        agreement: true,
      },
      status: "confirmed",
      submittedAt: jstAt(addDays(today, -20), 12, 30),
      confirmedBy: "staff-1",
      confirmedAt: jstAt(addDays(today, -20), 13),
    },
    {
      id: "cr-2",
      customerId: "cust-3",
      answers: {
        full_name: "伊藤 まな",
        furigana: "イトウ マナ",
        birthday: "2000-09-01",
        phone: "080-3333-4444",
        visit_reason: "Instagram",
        concerns: ["眉の形が決まらない"],
        allergy: "あり",
        contact_lens: "使用していない",
        experience: "初めて",
        pregnant: "いいえ",
        desired_image: "平行眉にしたい",
        remarks: "金属アレルギーがあります",
        agreement: true,
      },
      status: "pending",
      submittedAt: jstAt(today, 9, 30),
      confirmedBy: null,
      confirmedAt: null,
    },
  ];

  // 日報のデモデータ：前月1ヶ月分＋当月今日まで（2スタッフ分）
  const reports: DailyReport[] = [];
  const pushReports = (staffId: string, dateStr: string, i: number) => {
    const newClients = (i * 7 + (staffId === "staff-1" ? 3 : 5)) % 4; // 0〜3人
    const repeatClients = ((i * 5 + 2) % 4) + 1; // 1〜4人
    const total = newClients + repeatClients;
    const nextBookings = Math.min(total, (i + (staffId === "staff-1" ? 1 : 2)) % (total + 1));
    reports.push({
      id: randomUUID(),
      staffId,
      reportDate: dateStr,
      newClients,
      repeatClients,
      nextBookings,
      serviceSales: total * 6500 + (i % 3) * 1000,
      optionSales: (i % 4) * 1100,
      retailSales: i % 5 === 0 ? 3300 : 0,
      memo: i % 9 === 0 ? "リピーター様からご紹介の予約あり" : "",
    });
  };
  for (const s of ["staff-1", "staff-2"]) {
    // 前月：1日〜月末（火曜定休の想定で週1日休み）
    for (let d = `${prevMonth}-01`, i = 0; d.slice(0, 7) === prevMonth; d = addDays(d, 1), i++) {
      if (i % 7 === 2) continue; // 定休日
      pushReports(s, d, i);
    }
    // 当月：1日〜昨日まで
    for (let d = `${month}-01`, i = 0; d < today; d = addDays(d, 1), i++) {
      if (i % 7 === 2) continue;
      pushReports(s, d, i + 3);
    }
  }

  // 勤怠のデモデータ：当月の営業日（今日まで）に出退勤
  const attendances: Attendance[] = [];
  for (const s of ["staff-1", "staff-2"]) {
    for (let d = `${month}-01`, i = 0; d <= today; d = addDays(d, 1), i++) {
      if (i % 7 === 2) continue;
      const inAt = jstAt(d, 9, s === "staff-1" ? 52 : 55);
      // staff-1 は残業多めにして超過アラートの動作確認ができるようにする
      const outAt = jstAt(d, s === "staff-1" ? 19 : 18, s === "staff-1" ? 45 : 5);
      attendances.push({
        id: randomUUID(),
        staffId: s,
        storeId: store.id,
        punchType: "in",
        punchedAt: inAt,
        lat: 35.6581,
        lng: 139.7017,
        distanceM: 12,
        isValid: true,
      });
      if (d !== today) {
        attendances.push({
          id: randomUUID(),
          staffId: s,
          storeId: store.id,
          punchType: "out",
          punchedAt: outAt,
          lat: 35.65805,
          lng: 139.70165,
          distanceM: 8,
          isValid: true,
        });
      }
    }
  }

  // 次回予約：明日（リマインド対象）と来週
  const appointments: NextAppointment[] = [
    {
      id: "appt-1",
      customerId: "cust-1",
      scheduledAt: jstAt(addDays(today, 1), 14),
      staffId: "staff-1",
      reminderSentAt: null,
      createdAt: jstAt(addDays(today, -7), 13),
    },
    {
      id: "appt-2",
      customerId: "cust-2",
      scheduledAt: jstAt(addDays(today, 7), 11),
      staffId: null,
      reminderSentAt: null,
      createdAt: jstAt(addDays(today, -3), 16),
    },
  ];

  // ---- シフト管理のデモデータ ----
  const shiftRules: ShiftRules = {
    maxConsecutiveDays: 5,
    minStaffPerStoreDay: 2,
    requestDeadlineDay: 25,
  };
  const shiftStaffIds = staff.map((s) => s.id); // 管理者も施術に入る想定で全員を対象にする
  const storeIds = stores.map((s) => s.id);

  // 当月：全員提出済みの想定で自動割当を実行し、確定済みとして公開しておく
  const monthDates = datesOfMonth(month);
  const currentPrefs = new Map<string, Map<string, ShiftPreference>>();
  const currentAvailable = new Map<string, Set<string>>();
  shiftStaffIds.forEach((staffId, idx) => {
    const prefMap = new Map<string, ShiftPreference>();
    monthDates.forEach((d, i) => {
      if (i % 7 === idx % 7) prefMap.set(d, "off"); // 週1の休み希望をずらして入れる
    });
    currentPrefs.set(staffId, prefMap);
    currentAvailable.set(staffId, new Set(storeIds));
  });
  const generated = generateAssignments({
    targetMonth: month,
    storeIds,
    staffIds: shiftStaffIds,
    prefs: currentPrefs,
    availableStores: currentAvailable,
    rules: shiftRules,
    prevMonthAssignedDates: new Map(),
  });
  const shiftAssignments: ShiftAssignment[] = generated.assignments.map((a) => ({
    id: randomUUID(),
    targetMonth: month,
    status: "confirmed",
    ...a,
  }));

  // 当月の希望データも保存しておく（管理者画面の希望一覧で見えるように）
  const shiftRequestMonths: ShiftRequestMonth[] = [];
  const shiftRequests: ShiftRequest[] = [];
  const shiftAvailableStores: { staffId: string; targetMonth: string; storeId: string }[] = [];
  shiftStaffIds.forEach((staffId) => {
    shiftRequestMonths.push({
      id: randomUUID(),
      staffId,
      targetMonth: month,
      note: "",
      submittedAt: jstAt(addDays(`${month}-01`, -10), 12),
      updatedAt: jstAt(addDays(`${month}-01`, -10), 12),
    });
    for (const [date, preference] of currentPrefs.get(staffId)!) {
      shiftRequests.push({ id: randomUUID(), staffId, targetMonth: month, date, preference });
    }
    for (const storeId of storeIds) {
      shiftAvailableStores.push({ staffId, targetMonth: month, storeId });
    }
  });

  // 翌月：募集中の状態（3名が提出済み・残りは未提出）
  const nextMonth = addMonths(month, 1);
  const nm = (day: number) => `${nextMonth}-${String(day).padStart(2, "0")}`;
  const nextSubmissions: {
    staffId: string;
    days: Record<string, ShiftPreference>;
    storeIds: string[];
    note: string;
  }[] = [
    {
      staffId: "staff-1",
      days: { [nm(3)]: "off", [nm(12)]: "off", [nm(20)]: "off", [nm(21)]: "off" },
      storeIds: ["store-1", "store-2"],
      note: "20日・21日は通院のため休み希望です",
    },
    {
      staffId: "staff-2",
      days: { [nm(7)]: "off", [nm(15)]: "early", [nm(16)]: "early" },
      storeIds: ["store-1", "store-2", "store-3"],
      note: "",
    },
    {
      staffId: "staff-3",
      days: { [nm(5)]: "off", [nm(6)]: "off", [nm(10)]: "late", [nm(24)]: "late" },
      storeIds: ["store-2", "store-3"],
      note: "午前は学校送迎があるため遅番が助かります",
    },
  ];
  for (const sub of nextSubmissions) {
    shiftRequestMonths.push({
      id: randomUUID(),
      staffId: sub.staffId,
      targetMonth: nextMonth,
      note: sub.note,
      submittedAt: jstAt(today, 8),
      updatedAt: jstAt(today, 8),
    });
    for (const [date, preference] of Object.entries(sub.days)) {
      shiftRequests.push({
        id: randomUUID(),
        staffId: sub.staffId,
        targetMonth: nextMonth,
        date,
        preference,
      });
    }
    for (const storeId of sub.storeIds) {
      shiftAvailableStores.push({ staffId: sub.staffId, targetMonth: nextMonth, storeId });
    }
  }

  return {
    stores,
    staff,
    customers,
    counseling,
    reports,
    attendances,
    appointments,
    broadcasts: [],
    shiftRules,
    shiftRequestMonths,
    shiftRequests,
    shiftAvailableStores,
    shiftAssignments,
  };
}

class MockStore implements DataStore {
  private db: MockDb;

  constructor() {
    this.db = seed();
    console.log("[data] デモモードで起動しました（Supabase未設定のためメモリ内データを使用）");
  }

  async getStore(): Promise<Store> {
    return { ...this.db.stores[0] };
  }

  async listStores(): Promise<Store[]> {
    return this.db.stores.map((s) => ({ ...s }));
  }

  async createStore(input: { name: string; address: string }): Promise<Store> {
    const base = this.db.stores[0];
    const created: Store = {
      id: randomUUID(),
      name: input.name,
      address: input.address,
      // TODO: 新店舗の緯度経度は本店の値を仮置き。マスタ設定から正しい座標に変更する
      lat: base?.lat ?? 35.681236,
      lng: base?.lng ?? 139.767125,
      gpsRadiusM: 100,
      attendanceEnabled: true,
    };
    this.db.stores.push(created);
    return { ...created };
  }

  async updateStoreById(id: string, patch: Partial<Omit<Store, "id">>): Promise<Store> {
    const found = this.db.stores.find((s) => s.id === id);
    if (!found) throw new Error("店舗が見つかりません");
    Object.assign(found, patch);
    return { ...found };
  }

  async listStaff(): Promise<Staff[]> {
    return this.db.staff.map(({ passwordHash: _ph, ...s }) => s);
  }

  async getStaff(id: string): Promise<Staff | null> {
    const found = this.db.staff.find((s) => s.id === id);
    if (!found) return null;
    const { passwordHash: _ph, ...s } = found;
    return s;
  }

  async getStaffByLoginId(loginId: string): Promise<StaffWithSecret | null> {
    const found = this.db.staff.find((s) => s.loginId === loginId);
    return found ? { ...found } : null;
  }

  async createStaff(input: StaffInput): Promise<Staff> {
    if (this.db.staff.some((s) => s.loginId === input.loginId)) {
      throw new Error("このログインIDは既に使われています");
    }
    const created: StaffWithSecret = {
      id: randomUUID(),
      storeId: input.storeId,
      name: input.name,
      loginId: input.loginId,
      role: input.role,
      fixedOvertimeHours: input.fixedOvertimeHours,
      isActive: true,
      passwordHash: input.passwordHash,
    };
    this.db.staff.push(created);
    const { passwordHash: _ph, ...s } = created;
    return s;
  }

  async updateStaff(
    id: string,
    patch: Partial<Pick<Staff, "name" | "role" | "fixedOvertimeHours" | "isActive">> & {
      passwordHash?: string;
    }
  ): Promise<Staff> {
    const found = this.db.staff.find((s) => s.id === id);
    if (!found) throw new Error("スタッフが見つかりません");
    Object.assign(found, patch);
    const { passwordHash: _ph, ...s } = found;
    return s;
  }

  async listCustomers(search?: string): Promise<Customer[]> {
    let list = [...this.db.customers];
    if (search) {
      const q = search.trim();
      list = list.filter((c) => c.fullName.includes(q));
    }
    return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getCustomer(id: string): Promise<Customer | null> {
    return this.db.customers.find((c) => c.id === id) ?? null;
  }

  async getCustomerByLineUserId(lineUserId: string): Promise<Customer | null> {
    return this.db.customers.find((c) => c.lineUserId === lineUserId) ?? null;
  }

  async createCustomer(input: { lineUserId: string | null; fullName: string }): Promise<Customer> {
    const created: Customer = {
      id: randomUUID(),
      lineUserId: input.lineUserId,
      fullName: input.fullName,
      createdAt: new Date(),
    };
    this.db.customers.push(created);
    return created;
  }

  async updateCustomer(id: string, patch: { fullName?: string }): Promise<Customer> {
    const found = this.db.customers.find((c) => c.id === id);
    if (!found) throw new Error("顧客が見つかりません");
    Object.assign(found, patch);
    return { ...found };
  }

  async createCounselingResponse(input: {
    customerId: string;
    answers: Record<string, unknown>;
  }): Promise<CounselingResponse> {
    const created: CounselingResponse = {
      id: randomUUID(),
      customerId: input.customerId,
      answers: input.answers,
      status: "pending",
      submittedAt: new Date(),
      confirmedBy: null,
      confirmedAt: null,
    };
    this.db.counseling.push(created);
    return created;
  }

  async listCounselingResponses(filter?: {
    status?: CounselingStatus;
    customerId?: string;
  }): Promise<CounselingResponse[]> {
    let list = [...this.db.counseling];
    if (filter?.status) list = list.filter((c) => c.status === filter.status);
    if (filter?.customerId) list = list.filter((c) => c.customerId === filter.customerId);
    return list.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());
  }

  async getCounselingResponse(id: string): Promise<CounselingResponse | null> {
    return this.db.counseling.find((c) => c.id === id) ?? null;
  }

  async confirmCounselingResponse(id: string, staffId: string): Promise<CounselingResponse> {
    const found = this.db.counseling.find((c) => c.id === id);
    if (!found) throw new Error("カウンセリングが見つかりません");
    found.status = "confirmed";
    found.confirmedBy = staffId;
    found.confirmedAt = new Date();
    return { ...found };
  }

  async upsertDailyReport(input: DailyReportInput): Promise<DailyReport> {
    const existing = this.db.reports.find(
      (r) => r.staffId === input.staffId && r.reportDate === input.reportDate
    );
    if (existing) {
      Object.assign(existing, input);
      return { ...existing };
    }
    const created: DailyReport = { id: randomUUID(), ...input };
    this.db.reports.push(created);
    return created;
  }

  async getDailyReport(staffId: string, reportDate: string): Promise<DailyReport | null> {
    return (
      this.db.reports.find((r) => r.staffId === staffId && r.reportDate === reportDate) ?? null
    );
  }

  async listDailyReports(filter: {
    staffId?: string;
    from: string;
    to: string;
  }): Promise<DailyReport[]> {
    return this.db.reports
      .filter(
        (r) =>
          r.reportDate >= filter.from &&
          r.reportDate <= filter.to &&
          (!filter.staffId || r.staffId === filter.staffId)
      )
      .sort((a, b) => a.reportDate.localeCompare(b.reportDate));
  }

  async createAttendance(input: AttendanceInput): Promise<Attendance> {
    const created: Attendance = { id: randomUUID(), ...input };
    this.db.attendances.push(created);
    return created;
  }

  async listAttendances(filter: {
    staffId?: string;
    from: Date;
    to: Date;
  }): Promise<Attendance[]> {
    return this.db.attendances
      .filter(
        (a) =>
          a.punchedAt >= filter.from &&
          a.punchedAt < filter.to &&
          (!filter.staffId || a.staffId === filter.staffId)
      )
      .sort((a, b) => a.punchedAt.getTime() - b.punchedAt.getTime());
  }

  async createNextAppointment(input: {
    customerId: string;
    scheduledAt: Date;
    staffId: string | null;
  }): Promise<NextAppointment> {
    const created: NextAppointment = {
      id: randomUUID(),
      customerId: input.customerId,
      scheduledAt: input.scheduledAt,
      staffId: input.staffId,
      reminderSentAt: null,
      createdAt: new Date(),
    };
    this.db.appointments.push(created);
    return created;
  }

  async listNextAppointments(filter?: {
    customerId?: string;
    from?: Date;
    to?: Date;
  }): Promise<NextAppointment[]> {
    return this.db.appointments
      .filter(
        (a) =>
          (!filter?.customerId || a.customerId === filter.customerId) &&
          (!filter?.from || a.scheduledAt >= filter.from) &&
          (!filter?.to || a.scheduledAt < filter.to)
      )
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  }

  async deleteNextAppointment(id: string): Promise<void> {
    this.db.appointments = this.db.appointments.filter((a) => a.id !== id);
  }

  async listAppointmentsNeedingReminder(from: Date, to: Date): Promise<NextAppointment[]> {
    return this.db.appointments.filter(
      (a) => a.reminderSentAt === null && a.scheduledAt >= from && a.scheduledAt < to
    );
  }

  async markReminderSent(id: string, sentAt: Date): Promise<void> {
    const found = this.db.appointments.find((a) => a.id === id);
    if (found) found.reminderSentAt = sentAt;
  }

  async countRemindersSent(from: Date, to: Date): Promise<number> {
    return this.db.appointments.filter(
      (a) => a.reminderSentAt !== null && a.reminderSentAt >= from && a.reminderSentAt < to
    ).length;
  }

  async createBroadcast(input: {
    sentBy: string;
    body: string;
    recipientCount: number;
  }): Promise<Broadcast> {
    const created: Broadcast = {
      id: randomUUID(),
      sentBy: input.sentBy,
      body: input.body,
      sentAt: new Date(),
      recipientCount: input.recipientCount,
    };
    this.db.broadcasts.push(created);
    return created;
  }

  async listBroadcasts(): Promise<Broadcast[]> {
    return [...this.db.broadcasts].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  }

  async countBroadcastMessages(from: Date, to: Date): Promise<number> {
    return this.db.broadcasts
      .filter((b) => b.sentAt >= from && b.sentAt < to)
      .reduce((sum, b) => sum + b.recipientCount, 0);
  }

  // ---- シフト管理 ----

  async getShiftRules(): Promise<ShiftRules> {
    return { ...this.db.shiftRules };
  }

  async updateShiftRules(patch: Partial<ShiftRules>): Promise<ShiftRules> {
    this.db.shiftRules = { ...this.db.shiftRules, ...patch };
    return { ...this.db.shiftRules };
  }

  async saveShiftRequest(input: {
    staffId: string;
    targetMonth: string;
    note: string;
    days: Record<string, ShiftPreference>;
    storeIds: string[];
  }): Promise<void> {
    const now = new Date();
    const existing = this.db.shiftRequestMonths.find(
      (m) => m.staffId === input.staffId && m.targetMonth === input.targetMonth
    );
    if (existing) {
      existing.note = input.note;
      existing.updatedAt = now;
    } else {
      this.db.shiftRequestMonths.push({
        id: randomUUID(),
        staffId: input.staffId,
        targetMonth: input.targetMonth,
        note: input.note,
        submittedAt: now,
        updatedAt: now,
      });
    }
    // 日別希望と勤務可能店舗は総入れ替え
    this.db.shiftRequests = this.db.shiftRequests.filter(
      (r) => !(r.staffId === input.staffId && r.targetMonth === input.targetMonth)
    );
    for (const [date, preference] of Object.entries(input.days)) {
      this.db.shiftRequests.push({
        id: randomUUID(),
        staffId: input.staffId,
        targetMonth: input.targetMonth,
        date,
        preference,
      });
    }
    this.db.shiftAvailableStores = this.db.shiftAvailableStores.filter(
      (a) => !(a.staffId === input.staffId && a.targetMonth === input.targetMonth)
    );
    for (const storeId of input.storeIds) {
      this.db.shiftAvailableStores.push({
        staffId: input.staffId,
        targetMonth: input.targetMonth,
        storeId,
      });
    }
  }

  async getShiftRequestMonth(
    staffId: string,
    targetMonth: string
  ): Promise<ShiftRequestMonth | null> {
    return (
      this.db.shiftRequestMonths.find(
        (m) => m.staffId === staffId && m.targetMonth === targetMonth
      ) ?? null
    );
  }

  async listShiftRequestMonths(targetMonth: string): Promise<ShiftRequestMonth[]> {
    return this.db.shiftRequestMonths.filter((m) => m.targetMonth === targetMonth);
  }

  async listShiftRequests(targetMonth: string, staffId?: string): Promise<ShiftRequest[]> {
    return this.db.shiftRequests.filter(
      (r) => r.targetMonth === targetMonth && (!staffId || r.staffId === staffId)
    );
  }

  async listAvailableStores(
    targetMonth: string,
    staffId?: string
  ): Promise<{ staffId: string; storeId: string }[]> {
    return this.db.shiftAvailableStores
      .filter((a) => a.targetMonth === targetMonth && (!staffId || a.staffId === staffId))
      .map(({ staffId: s, storeId }) => ({ staffId: s, storeId }));
  }

  async listShiftAssignments(targetMonth: string, staffId?: string): Promise<ShiftAssignment[]> {
    return this.db.shiftAssignments
      .filter((a) => a.targetMonth === targetMonth && (!staffId || a.staffId === staffId))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async replaceMonthAssignments(targetMonth: string, rows: NewShiftAssignment[]): Promise<void> {
    this.db.shiftAssignments = this.db.shiftAssignments.filter(
      (a) => a.targetMonth !== targetMonth
    );
    for (const row of rows) {
      this.db.shiftAssignments.push({
        id: randomUUID(),
        targetMonth,
        status: "draft",
        ...row,
      });
    }
  }

  async createShiftAssignment(
    input: NewShiftAssignment & { targetMonth: string; status: AssignmentStatus }
  ): Promise<ShiftAssignment> {
    const dup = this.db.shiftAssignments.find(
      (a) => a.staffId === input.staffId && a.date === input.date
    );
    if (dup) throw new Error("このスタッフはこの日すでに割り当てられています");
    const created: ShiftAssignment = { id: randomUUID(), ...input };
    this.db.shiftAssignments.push(created);
    return { ...created };
  }

  async deleteShiftAssignment(id: string): Promise<void> {
    this.db.shiftAssignments = this.db.shiftAssignments.filter((a) => a.id !== id);
  }

  async confirmMonthAssignments(targetMonth: string): Promise<number> {
    let count = 0;
    for (const a of this.db.shiftAssignments) {
      if (a.targetMonth === targetMonth) {
        a.status = "confirmed";
        count++;
      }
    }
    return count;
  }
}

// 開発時のホットリロードでもデータが消えないよう globalThis に保持する
const globalForMock = globalThis as unknown as { __eryesMockStore?: MockStore };

export function getMockStore(): MockStore {
  if (!globalForMock.__eryesMockStore) {
    globalForMock.__eryesMockStore = new MockStore();
  }
  return globalForMock.__eryesMockStore;
}
