// メモリ内データストア（デモモード用）。
// Supabase の環境変数が未設定のときに使われ、起動のたびにデモデータが再生成される。
// 本番では supabase-store.ts が使われるため、このファイルは動作確認専用。

import { randomUUID } from "crypto";
import { hashPassword } from "@/lib/auth/password";
import { addDays, addMonths, datesOfMonth, jstDayBoundsUtc, thisMonthJst, todayJst } from "@/lib/date";
import { generateAssignments } from "@/lib/shift/assign";
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
  MeetingTask,
  NewShiftAssignment,
  NextAppointment,
  OrderRequest,
  OrderStatus,
  OrgMember,
  PracticePair,
  PracticeRecord,
  ScheduleOverride,
  SchedulePreset,
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

interface MockDb {
  stores: Store[];
  staff: (StaffWithSecret & { passwordHash: string })[];
  customers: Customer[];
  counseling: CounselingResponse[];
  reports: DailyReport[];
  cashReports: CashReport[];
  attendances: Attendance[];
  appointments: NextAppointment[];
  broadcasts: Broadcast[];
  shiftRules: ShiftRules;
  shiftRequestMonths: ShiftRequestMonth[];
  shiftRequests: ShiftRequest[];
  shiftAvailableStores: { staffId: string; targetMonth: string; storeId: string }[];
  shiftAssignments: ShiftAssignment[];
  workPatterns: WorkPatternDay[];
  dayoffRequests: DayoffRequest[];
  scheduleOverrides: ScheduleOverride[];
  eniReports: (EniReport & { kind: "stylist" | "weekly" })[];
  practiceRecords: PracticeRecord[];
  practicePairs: PracticePair[];
  meetings: Meeting[];
  meetingTasks: MeetingTask[];
  orgMembers: OrgMember[];
  absenceReports: AbsenceReport[];
  orderRequests: OrderRequest[];
  dailyPlans: DailyPlan[];
  idealSchedules: IdealSchedule[];
  schedulePresets: SchedulePreset[];
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
      name: "EREYS 渋谷本店",
      address: "東京都渋谷区道玄坂1-2-3（仮）",
      lat: 35.658034,
      lng: 139.701636,
      gpsRadiusM: 100,
      attendanceEnabled: true,
    },
    {
      id: "store-2",
      name: "EREYS 表参道店",
      address: "東京都港区北青山3-4-5（仮）",
      lat: 35.665498,
      lng: 139.712135,
      gpsRadiusM: 100,
      attendanceEnabled: true,
    },
    {
      id: "store-3",
      name: "EREYS 恵比寿店",
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
      jobType: "",
      rank: "",
      isExecutive: true,
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
      jobType: "",
      rank: "",
      isExecutive: false,
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
      jobType: "",
      rank: "",
      isExecutive: false,
      fixedOvertimeHours: 20,
      isActive: true,
      passwordHash: hashPassword("staff1234"),
    },
    // ENi（ヘアサロン）デモ用スタッフ：スタイリスト2名（1名は幹部）＋アシスタント2名
    ...(
      [
        ["staff-3", "山本 大輝", "daiki", "stylist", "", true],
        ["staff-4", "中島 結菜", "yuina", "stylist", "", false],
        ["staff-5", "小林 蒼", "aoi", "assistant", "first", false],
        ["staff-6", "藤田 ひかり", "hikari", "assistant", "middle", false],
      ] as [string, string, string, "stylist" | "assistant", "" | "first" | "middle" | "final", boolean][]
    ).map(
      ([id, name, loginId, jobType, rank, isExecutive]): StaffWithSecret => ({
        id,
        storeId: store.id,
        name,
        loginId,
        role: "staff",
        jobType,
        rank,
        isExecutive,
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
        menu: ["まつげエクステ"],
        full_name: "高橋 ゆい",
        furigana: "タカハシ ユイ",
        birthday: "1995-04-12",
        gender: "女性",
        phone: "090-1111-2222",
        know_source: ["ホットペッパービューティー"],
        allergy: "なし",
        pregnant: "いいえ",
        contact_lens: "ソフト",
        eye_sensitivity: "普通",
        lash_ext_experience: "はい（3回目以上）",
        lash_perm_experience: "いいえ",
        eye_surgery: ["ない"],
        patch_test: "いいえ",
        bridal: "いいえ",
        lash_image_ext: ["ナチュラル", "たれ目"],
        remarks: "",
        consent_agreed: true,
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
        menu: ["眉（アイブロウ）"],
        full_name: "伊藤 まな",
        furigana: "イトウ マナ",
        birthday: "2000-09-01",
        gender: "女性",
        phone: "080-3333-4444",
        know_source: ["Instagram"],
        allergy: "あり",
        allergy_detail: ["金属"],
        pregnant: "いいえ",
        skin_type: "敏感",
        skin_trouble: "なし",
        wax_experience: "なし",
        brow_self_care: ["毛抜き", "カット"],
        brow_image: "平行眉にしたい。左右差が気になる。",
        remarks: "金属アレルギーがあります",
        consent_agreed: true,
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
      goodPoint: i % 6 === 0 ? "目元の仕上がりをとても喜んでいただけました" : "",
      improvement: i % 8 === 0 ? "次回は施術前の説明をもう少し丁寧に" : "",
      message: i % 10 === 0 ? "今日もありがとうございました" : "",
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

  // レジ締め（現金管理）のデモデータ：本店の直近1週間分
  const cashReports: CashReport[] = [];
  for (let i = 7; i >= 1; i--) {
    const d = addDays(today, -i);
    if (d.slice(0, 7) !== month && d.slice(0, 7) !== prevMonth) continue;
    const cashSales = 18000 + (i % 3) * 4500;
    const changeFund = 30000; // おつり準備金は3万円で固定運用の想定
    cashReports.push({
      id: randomUUID(),
      storeId: "store-1",
      reportDate: d,
      cashSales,
      registerBalance: changeFund + cashSales,
      movedToSafe: cashSales,
      changeFund,
      safeBalance: 50000 + cashSales * (8 - i),
      bankDeposit: i === 3 ? 120000 : 0, // 週1回まとめて銀行へ預入の想定
      memo: i === 3 ? "銀行預入（週次）" : "",
      createdBy: "staff-admin",
      updatedAt: jstAt(d, 20, 30),
    });
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

  // 次回予約：明日（リマインド対象）と来週（1週間前案内の対象）
  const appointments: NextAppointment[] = [
    {
      id: "appt-1",
      customerId: "cust-1",
      scheduledAt: jstAt(addDays(today, 1), 14),
      staffId: "staff-1",
      status: "scheduled",
      requestedNewAt: null,
      changeNote: "",
      reminderSentAt: null,
      preReminderSentAt: jstAt(addDays(today, -6), 10),
      createdAt: jstAt(addDays(today, -7), 13),
    },
    {
      id: "appt-2",
      customerId: "cust-2",
      scheduledAt: jstAt(addDays(today, 7), 11),
      staffId: null,
      status: "scheduled",
      requestedNewAt: null,
      changeNote: "",
      reminderSentAt: null,
      preReminderSentAt: null,
      createdAt: jstAt(addDays(today, -3), 16),
    },
  ];

  // ---- 出勤スケジュール（基本パターン＋希望休）のデモデータ ----
  // 例：staff-1=フル出勤（月曜定休）、staff-2=平日のみ 10:00-16:30（金曜は12:00-16:30）
  const workPatterns: WorkPatternDay[] = [];
  for (let wd = 0; wd <= 6; wd++) {
    workPatterns.push({
      staffId: "staff-1",
      weekday: wd,
      isWorking: wd !== 1, // 月曜定休
      startTime: wd !== 1 ? "10:00" : "",
      endTime: wd !== 1 ? "19:00" : "",
    });
    const isWeekday = wd >= 2 && wd <= 5; // 火〜金
    workPatterns.push({
      staffId: "staff-2",
      weekday: wd,
      isWorking: isWeekday,
      startTime: isWeekday ? (wd === 5 ? "12:00" : "10:00") : "",
      endTime: isWeekday ? "16:30" : "",
    });
  }
  const dayoffMonth = addMonths(month, 3); // 3ヶ月後の希望休（募集中の月）
  const dayoffRequests: DayoffRequest[] = [
    {
      id: randomUUID(),
      staffId: "staff-2",
      date: `${dayoffMonth}-10`,
      createdAt: jstAt(today, 9),
    },
    {
      id: randomUUID(),
      staffId: "staff-2",
      date: `${dayoffMonth}-24`,
      createdAt: jstAt(today, 9),
    },
  ];

  // ---- ENi（ヘアサロン）のデモデータ ----
  const eniReports: (EniReport & { kind: "stylist" | "weekly" })[] = [
    {
      id: randomUUID(),
      kind: "stylist",
      staffId: "staff-3",
      periodKey: addDays(today, -1),
      answers: {
        clients_total: 8,
        clients_new: 2,
        clients_shimei: 5,
        service_sales: 68000,
        retail_sales: 8800,
        next_bookings: 6,
        good_point: "ハイライトの提案がお客様にとても好評だった",
        self_issue: "施術の合間の声かけをもう少し増やしたい",
        improve_idea: "似合わせのカウンセリングをもっと言語化したい",
        onsite_notice: "受付の動線が混雑時に詰まりやすい",
        staff_share: "",
      },
      comment: "",
      commentedBy: null,
      updatedAt: jstAt(addDays(today, -1), 20),
    },
  ];
  const practicePairs: PracticePair[] = [
    { id: randomUUID(), targetMonth: month, memberStaffId: "staff-5", partnerStaffId: "staff-3" },
    { id: randomUUID(), targetMonth: month, memberStaffId: "staff-6", partnerStaffId: "staff-4" },
  ];
  const practiceRecords: PracticeRecord[] = [
    {
      id: randomUUID(),
      staffId: "staff-5",
      practiceDate: addDays(today, -2),
      minutes: 60,
      partnerStaffId: "staff-3",
      partnerName: "",
      content: "ワインディング",
      createdAt: jstAt(addDays(today, -2), 21),
    },
    {
      id: randomUUID(),
      staffId: "staff-5",
      practiceDate: addDays(today, -1),
      minutes: 90,
      partnerStaffId: "staff-3",
      partnerName: "",
      content: "ブロー",
      createdAt: jstAt(addDays(today, -1), 21),
    },
    {
      id: randomUUID(),
      staffId: "staff-6",
      practiceDate: addDays(today, -1),
      minutes: 30,
      partnerStaffId: null,
      partnerName: "モデル 花田さん",
      content: "カラー塗布",
      createdAt: jstAt(addDays(today, -1), 21),
    },
  ];
  const meetings: Meeting[] = [
    {
      id: randomUUID(),
      meetingType: "1on1",
      committee: "",
      title: "",
      agenda: "",
      meetingDate: addDays(today, -3),
      startTime: "13:00",
      hostStaffId: "staff-3",
      guestStaffId: "staff-5",
      participants: [],
      minutesText: "",
      minutesPhoto: "",
      minutesAi: false,
      minutesDone: false, // 議事録が未提出のデモ（一覧で赤く出る）
      createdBy: "staff-3",
      createdAt: jstAt(addDays(today, -5), 10),
    },
    {
      id: randomUUID(),
      meetingType: "all",
      committee: "all",
      title: "月初 全体ミーティング",
      agenda: "・幹部mtgの共有事項\n・理念の再浸透\n・各チームが話したいこと",
      meetingDate: addDays(today, 4),
      startTime: "09:30",
      hostStaffId: "staff-3",
      guestStaffId: null,
      participants: ["staff-3", "staff-4", "staff-5", "staff-6"],
      minutesText: "",
      minutesPhoto: "",
      minutesAi: false,
      minutesDone: false,
      createdBy: "staff-4",
      createdAt: jstAt(addDays(today, -2), 12),
    },
  ];
  // 議事録から整理したタスク（デモ：全体MTGの宿題を1件だけ入れておく）
  const meetingTasks: MeetingTask[] = [
    {
      id: randomUUID(),
      meetingId: meetings[1].id,
      title: "秋のキャンペーンPOPのラフを作る",
      assigneeStaffId: "staff-4",
      assigneeName: "中島 結菜",
      dueDate: addDays(today, 7),
      done: false,
      sortOrder: 0,
      createdAt: jstAt(addDays(today, -2), 12),
    },
  ];
  // 組織図（シナジーマップ）のチーム所属。キーは lib/eni/org.ts の ORG_TEAMS と対応
  const orgMembers: OrgMember[] = (
    [
      ["exec", "staff-3", "リーダー"],
      ["exec", "staff-4", ""],
      ["education", "staff-3", "リーダー"],
      ["education", "staff-4", ""],
      ["pr_sns", "staff-4", "リーダー"],
      ["pr_sns", "staff-6", ""],
      ["pr_recruit", "staff-3", "リーダー"],
      ["materials", "staff-4", "リーダー"],
      ["materials", "staff-5", ""],
      ["assistant", "staff-5", "リーダー"],
      ["assistant", "staff-6", ""],
    ] as [string, string, string][]
  ).map(([teamKey, staffId, roleLabel], i) => ({
    id: randomUUID(),
    teamKey,
    staffId,
    roleLabel,
    sortOrder: i,
  }));
  const absenceReports: AbsenceReport[] = [
    {
      id: randomUUID(),
      staffId: "staff-6",
      absenceDate: addDays(today, -4),
      kind: "early_leave",
      hours: 2,
      reason: "体調不良（発熱）のため早退",
      reportedBy: "staff-4",
      createdAt: jstAt(addDays(today, -4), 15),
    },
  ];
  const orderRequests: OrderRequest[] = [
    {
      id: randomUUID(),
      staffId: "staff-5",
      category: "wig",
      itemName: "カットウィッグ（レディース）",
      quantity: 2,
      note: "国家試験の練習用",
      status: "requested",
      createdAt: jstAt(addDays(today, -1), 9),
      updatedAt: jstAt(addDays(today, -1), 9),
    },
  ];
  const dailyPlans: DailyPlan[] = [
    {
      id: randomUUID(),
      staffId: "staff-5",
      planDate: today,
      content: "",
      fields: {
        goal: "ワインディングを時間内に巻き切る",
        horenso: "モデルさんの来店時間を先輩に共有",
        todo: "レイヤーのシャンプー入客、閉店後に練習1h",
        timetable: "",
        timetableBlocks: [
          { d: 0, s: "09:30", e: "10:00", a: "朝礼" },
          { d: 0, s: "10:00", e: "14:00", a: "入客アシスト" },
          { d: 0, s: "14:00", e: "15:00", a: "休憩" },
          { d: 0, s: "15:00", e: "18:30", a: "施術（モデル・カラー）" },
          { d: 0, s: "19:00", e: "20:00", a: "練習" },
        ],
      },
      photo: "",
      seenBy: null,
      seenAt: null,
    },
  ];
  const idealSchedules: IdealSchedule[] = [
    {
      id: randomUUID(),
      staffId: "staff-5",
      scope: "month_goal",
      content: "デビューに向けてワインディングとカラー塗布を安定させる。モデルを月4名。",
      image: "",
      updatedAt: jstAt(addDays(today, -7), 22),
    },
  ];
  const schedulePresets: SchedulePreset[] = [
    ["朝礼", 10],
    ["入客アシスト", 20],
    ["施術", 30],
    ["練習", 40],
    ["MTG", 50],
    ["休憩", 60],
    ["事務", 70],
    ["撮影", 80],
    ["掃除", 90],
    ["退勤", 100],
  ].map(([label, sortOrder]) => ({ id: randomUUID(), label: label as string, sortOrder: sortOrder as number }));

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
    cashReports,
    attendances,
    appointments,
    broadcasts: [],
    shiftRules,
    shiftRequestMonths,
    shiftRequests,
    shiftAvailableStores,
    shiftAssignments,
    workPatterns,
    dayoffRequests,
    scheduleOverrides: [],
    eniReports,
    practiceRecords,
    practicePairs,
    meetings,
    meetingTasks,
    orgMembers,
    absenceReports,
    orderRequests,
    dailyPlans,
    idealSchedules,
    schedulePresets,
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

  async deleteStore(id: string): Promise<void> {
    if (!this.db.stores.some((s) => s.id === id)) throw new Error("店舗が見つかりません");
    if (this.db.stores.length <= 1) throw new Error("最後の店舗は削除できません");
    const referenced =
      this.db.staff.some((s) => s.storeId === id) ||
      this.db.cashReports.some((c) => c.storeId === id) ||
      this.db.attendances.some((a) => a.storeId === id) ||
      this.db.shiftAssignments.some((a) => a.storeId === id) ||
      this.db.shiftAvailableStores.some((a) => a.storeId === id);
    if (referenced) {
      throw new Error("この店舗に紐づくデータ（スタッフ・打刻・現金・シフト等）があるため削除できません");
    }
    this.db.stores = this.db.stores.filter((s) => s.id !== id);
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
      jobType: input.jobType ?? "",
      rank: input.rank ?? "",
      isExecutive: input.isExecutive ?? false,
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
    patch: Partial<
      Pick<
        Staff,
        "name" | "role" | "jobType" | "rank" | "isExecutive" | "fixedOvertimeHours" | "isActive"
      >
    > & {
      passwordHash?: string;
    }
  ): Promise<Staff> {
    const found = this.db.staff.find((s) => s.id === id);
    if (!found) throw new Error("スタッフが見つかりません");
    Object.assign(found, patch);
    const { passwordHash: _ph, ...s } = found;
    return s;
  }

  async deleteStaff(id: string): Promise<void> {
    if (!this.db.staff.some((s) => s.id === id)) throw new Error("スタッフが見つかりません");
    const referenced =
      this.db.reports.some((r) => r.staffId === id) ||
      this.db.attendances.some((a) => a.staffId === id) ||
      this.db.counseling.some((c) => c.confirmedBy === id) ||
      this.db.appointments.some((a) => a.staffId === id) ||
      this.db.broadcasts.some((b) => b.sentBy === id) ||
      this.db.cashReports.some((c) => c.createdBy === id) ||
      this.db.shiftAssignments.some((a) => a.staffId === id) ||
      this.db.shiftRequestMonths.some((m) => m.staffId === id) ||
      this.db.shiftRequests.some((r) => r.staffId === id) ||
      this.db.shiftAvailableStores.some((a) => a.staffId === id) ||
      this.db.eniReports.some((r) => r.staffId === id) ||
      this.db.practiceRecords.some((r) => r.staffId === id || r.partnerStaffId === id) ||
      this.db.meetings.some((m) => m.hostStaffId === id || m.guestStaffId === id) ||
      this.db.absenceReports.some((r) => r.staffId === id || r.reportedBy === id) ||
      this.db.orderRequests.some((r) => r.staffId === id);
    if (referenced) {
      throw new Error(
        "このスタッフには日報・打刻・シフト等の記録があるため削除できません。代わりに「無効」にしてください（記録は残ります）"
      );
    }
    this.db.staff = this.db.staff.filter((s) => s.id !== id);
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

  async getDailyReportById(id: string): Promise<DailyReport | null> {
    return this.db.reports.find((r) => r.id === id) ?? null;
  }

  async deleteDailyReport(id: string): Promise<void> {
    this.db.reports = this.db.reports.filter((r) => r.id !== id);
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

  async upsertCashReport(input: CashReportInput): Promise<CashReport> {
    const existing = this.db.cashReports.find(
      (r) => r.storeId === input.storeId && r.reportDate === input.reportDate
    );
    if (existing) {
      Object.assign(existing, input, { updatedAt: new Date() });
      return { ...existing };
    }
    const created: CashReport = { id: randomUUID(), ...input, updatedAt: new Date() };
    this.db.cashReports.push(created);
    return created;
  }

  async getCashReport(storeId: string, reportDate: string): Promise<CashReport | null> {
    return (
      this.db.cashReports.find(
        (r) => r.storeId === storeId && r.reportDate === reportDate
      ) ?? null
    );
  }

  async listCashReports(filter: {
    storeId?: string;
    from: string;
    to: string;
  }): Promise<CashReport[]> {
    return this.db.cashReports
      .filter(
        (r) =>
          r.reportDate >= filter.from &&
          r.reportDate <= filter.to &&
          (!filter.storeId || r.storeId === filter.storeId)
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
      status: "scheduled",
      requestedNewAt: null,
      changeNote: "",
      reminderSentAt: null,
      preReminderSentAt: null,
      createdAt: new Date(),
    };
    this.db.appointments.push(created);
    return created;
  }

  async getNextAppointment(id: string): Promise<NextAppointment | null> {
    return this.db.appointments.find((a) => a.id === id) ?? null;
  }

  async updateNextAppointment(id: string, patch: AppointmentPatch): Promise<NextAppointment> {
    const found = this.db.appointments.find((a) => a.id === id);
    if (!found) throw new Error("予約が見つかりません");
    if (patch.scheduledAt !== undefined) found.scheduledAt = patch.scheduledAt;
    if (patch.status !== undefined) found.status = patch.status;
    if (patch.requestedNewAt !== undefined) found.requestedNewAt = patch.requestedNewAt;
    if (patch.changeNote !== undefined) found.changeNote = patch.changeNote;
    if (patch.reminderSentAt !== undefined) found.reminderSentAt = patch.reminderSentAt;
    if (patch.preReminderSentAt !== undefined) found.preReminderSentAt = patch.preReminderSentAt;
    return found;
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
      (a) =>
        a.reminderSentAt === null &&
        a.status !== "cancelled" &&
        a.scheduledAt >= from &&
        a.scheduledAt < to
    );
  }

  async markReminderSent(id: string, sentAt: Date): Promise<void> {
    const found = this.db.appointments.find((a) => a.id === id);
    if (found) found.reminderSentAt = sentAt;
  }

  async listAppointmentsNeedingPreReminder(from: Date, to: Date): Promise<NextAppointment[]> {
    return this.db.appointments.filter(
      (a) =>
        a.preReminderSentAt === null &&
        a.status !== "cancelled" &&
        a.scheduledAt >= from &&
        a.scheduledAt < to
    );
  }

  async markPreReminderSent(id: string, sentAt: Date): Promise<void> {
    const found = this.db.appointments.find((a) => a.id === id);
    if (found) found.preReminderSentAt = sentAt;
  }

  async countRemindersSent(from: Date, to: Date): Promise<number> {
    return this.db.appointments.filter(
      (a) => a.reminderSentAt !== null && a.reminderSentAt >= from && a.reminderSentAt < to
    ).length;
  }

  async countPreRemindersSent(from: Date, to: Date): Promise<number> {
    return this.db.appointments.filter(
      (a) => a.preReminderSentAt !== null && a.preReminderSentAt >= from && a.preReminderSentAt < to
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

  // ---- 出勤スケジュール（基本パターン＋希望休） ----

  async listWorkPatterns(staffId?: string): Promise<WorkPatternDay[]> {
    return this.db.workPatterns
      .filter((p) => !staffId || p.staffId === staffId)
      .sort((a, b) => a.weekday - b.weekday);
  }

  async saveWorkPattern(staffId: string, days: Omit<WorkPatternDay, "staffId">[]): Promise<void> {
    this.db.workPatterns = this.db.workPatterns.filter((p) => p.staffId !== staffId);
    for (const d of days) {
      this.db.workPatterns.push({ staffId, ...d });
    }
  }

  async listDayoffRequests(filter: {
    staffId?: string;
    from: string;
    to: string;
  }): Promise<DayoffRequest[]> {
    return this.db.dayoffRequests
      .filter(
        (r) =>
          r.date >= filter.from &&
          r.date <= filter.to &&
          (!filter.staffId || r.staffId === filter.staffId)
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async replaceDayoffRequests(staffId: string, targetMonth: string, dates: string[]): Promise<void> {
    this.db.dayoffRequests = this.db.dayoffRequests.filter(
      (r) => !(r.staffId === staffId && r.date.startsWith(targetMonth))
    );
    for (const date of dates) {
      this.db.dayoffRequests.push({ id: randomUUID(), staffId, date, createdAt: new Date() });
    }
  }

  async listScheduleOverrides(filter: {
    staffId?: string;
    from: string;
    to: string;
  }): Promise<ScheduleOverride[]> {
    return this.db.scheduleOverrides
      .filter(
        (o) =>
          o.date >= filter.from &&
          o.date <= filter.to &&
          (!filter.staffId || o.staffId === filter.staffId)
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async upsertScheduleOverride(input: Omit<ScheduleOverride, "id">): Promise<void> {
    const found = this.db.scheduleOverrides.find(
      (o) => o.staffId === input.staffId && o.date === input.date
    );
    if (found) {
      Object.assign(found, input);
    } else {
      this.db.scheduleOverrides.push({ id: randomUUID(), ...input });
    }
  }

  async deleteScheduleOverride(staffId: string, date: string): Promise<void> {
    this.db.scheduleOverrides = this.db.scheduleOverrides.filter(
      (o) => !(o.staffId === staffId && o.date === date)
    );
  }

  // ---- ENi（ヘアサロン）向け機能 ----

  async upsertEniReport(input: {
    kind: "stylist" | "weekly";
    staffId: string;
    periodKey: string;
    answers: Record<string, unknown>;
  }): Promise<EniReport> {
    const found = this.db.eniReports.find(
      (r) => r.kind === input.kind && r.staffId === input.staffId && r.periodKey === input.periodKey
    );
    if (found) {
      found.answers = input.answers;
      found.updatedAt = new Date();
      return found;
    }
    const created = {
      id: randomUUID(),
      kind: input.kind,
      staffId: input.staffId,
      periodKey: input.periodKey,
      answers: input.answers,
      comment: "",
      commentedBy: null,
      updatedAt: new Date(),
    };
    this.db.eniReports.push(created);
    return created;
  }

  async getEniReport(
    kind: "stylist" | "weekly",
    staffId: string,
    periodKey: string
  ): Promise<EniReport | null> {
    return (
      this.db.eniReports.find(
        (r) => r.kind === kind && r.staffId === staffId && r.periodKey === periodKey
      ) ?? null
    );
  }

  async getEniReportById(id: string): Promise<EniReport | null> {
    return this.db.eniReports.find((r) => r.id === id) ?? null;
  }

  async commentEniReport(id: string, comment: string, commentedBy: string): Promise<void> {
    const found = this.db.eniReports.find((r) => r.id === id);
    if (found) {
      found.comment = comment;
      found.commentedBy = commentedBy;
    }
  }

  async listEniReports(
    kind: "stylist" | "weekly",
    filter: { staffId?: string; from: string; to: string }
  ): Promise<EniReport[]> {
    return this.db.eniReports
      .filter(
        (r) =>
          r.kind === kind &&
          r.periodKey >= filter.from &&
          r.periodKey <= filter.to &&
          (!filter.staffId || r.staffId === filter.staffId)
      )
      .sort((a, b) => b.periodKey.localeCompare(a.periodKey));
  }

  async createPracticeRecord(
    input: Omit<PracticeRecord, "id" | "createdAt">
  ): Promise<PracticeRecord> {
    const created: PracticeRecord = { id: randomUUID(), createdAt: new Date(), ...input };
    this.db.practiceRecords.push(created);
    return created;
  }

  async listPracticeRecords(filter: {
    staffId?: string;
    from: string;
    to: string;
  }): Promise<PracticeRecord[]> {
    return this.db.practiceRecords
      .filter(
        (r) =>
          r.practiceDate >= filter.from &&
          r.practiceDate <= filter.to &&
          (!filter.staffId || r.staffId === filter.staffId)
      )
      .sort((a, b) => a.practiceDate.localeCompare(b.practiceDate));
  }

  async getPracticeRecord(id: string): Promise<PracticeRecord | null> {
    return this.db.practiceRecords.find((r) => r.id === id) ?? null;
  }

  async deletePracticeRecord(id: string): Promise<void> {
    this.db.practiceRecords = this.db.practiceRecords.filter((r) => r.id !== id);
  }

  async listPracticePairs(targetMonth: string): Promise<PracticePair[]> {
    return this.db.practicePairs.filter((p) => p.targetMonth === targetMonth);
  }

  async setPracticePair(
    targetMonth: string,
    memberStaffId: string,
    partnerStaffId: string
  ): Promise<void> {
    this.db.practicePairs = this.db.practicePairs.filter(
      (p) => !(p.targetMonth === targetMonth && p.memberStaffId === memberStaffId)
    );
    if (partnerStaffId) {
      this.db.practicePairs.push({ id: randomUUID(), targetMonth, memberStaffId, partnerStaffId });
    }
  }

  async createMeeting(
    input: Omit<Meeting, "id" | "createdAt" | "minutesText" | "minutesPhoto" | "minutesAi" | "minutesDone">
  ): Promise<Meeting> {
    const created: Meeting = {
      id: randomUUID(),
      createdAt: new Date(),
      minutesText: "",
      minutesPhoto: "",
      minutesAi: false,
      minutesDone: false,
      ...input,
    };
    this.db.meetings.push(created);
    return created;
  }

  async getMeeting(id: string): Promise<Meeting | null> {
    return this.db.meetings.find((m) => m.id === id) ?? null;
  }

  async listMeetings(filter: { from: string; to: string }): Promise<Meeting[]> {
    return this.db.meetings
      .filter((m) => m.meetingDate >= filter.from && m.meetingDate <= filter.to)
      .sort(
        (a, b) =>
          a.meetingDate.localeCompare(b.meetingDate) || a.startTime.localeCompare(b.startTime)
      );
  }

  async listMeetingsMissingMinutes(until: string): Promise<Meeting[]> {
    return this.db.meetings
      .filter((m) => !m.minutesDone && m.meetingDate <= until)
      .sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));
  }

  async updateMeetingMinutes(
    id: string,
    patch: { minutesText: string; minutesPhoto: string; minutesAi: boolean; minutesDone: boolean }
  ): Promise<Meeting> {
    const found = this.db.meetings.find((m) => m.id === id);
    if (!found) throw new Error("ミーティングが見つかりません");
    found.minutesText = patch.minutesText;
    found.minutesPhoto = patch.minutesPhoto;
    found.minutesAi = patch.minutesAi;
    found.minutesDone = patch.minutesDone;
    return found;
  }

  async deleteMeeting(id: string): Promise<void> {
    this.db.meetings = this.db.meetings.filter((m) => m.id !== id);
    this.db.meetingTasks = this.db.meetingTasks.filter((t) => t.meetingId !== id);
  }

  async replaceMeetingTasks(
    meetingId: string,
    tasks: {
      title: string;
      assigneeStaffId: string | null;
      assigneeName: string;
      dueDate: string;
      done: boolean;
    }[]
  ): Promise<void> {
    const before = this.db.meetingTasks.filter((t) => t.meetingId === meetingId);
    this.db.meetingTasks = this.db.meetingTasks.filter((t) => t.meetingId !== meetingId);
    tasks.forEach((t, i) => {
      // 同じ内容のタスクが残っている場合は完了状態を引き継ぐ
      const prev = before.find((p) => p.title === t.title);
      this.db.meetingTasks.push({
        id: randomUUID(),
        meetingId,
        title: t.title,
        assigneeStaffId: t.assigneeStaffId,
        assigneeName: t.assigneeName,
        dueDate: t.dueDate,
        done: t.done || (prev?.done ?? false),
        sortOrder: i,
        createdAt: prev?.createdAt ?? new Date(),
      });
    });
  }

  async listMeetingTasks(meetingIds: string[]): Promise<MeetingTask[]> {
    const ids = new Set(meetingIds);
    return this.db.meetingTasks
      .filter((t) => ids.has(t.meetingId))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async listOpenMeetingTasks(): Promise<MeetingTask[]> {
    return this.db.meetingTasks
      .filter((t) => !t.done)
      .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  }

  async setMeetingTaskDone(id: string, done: boolean): Promise<void> {
    const found = this.db.meetingTasks.find((t) => t.id === id);
    if (found) found.done = done;
  }

  async listOrgMembers(): Promise<OrgMember[]> {
    return [...this.db.orgMembers].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async setOrgTeamMembers(
    teamKey: string,
    members: { staffId: string; roleLabel: string }[]
  ): Promise<void> {
    this.db.orgMembers = this.db.orgMembers.filter((m) => m.teamKey !== teamKey);
    members.forEach((m, i) => {
      this.db.orgMembers.push({
        id: randomUUID(),
        teamKey,
        staffId: m.staffId,
        roleLabel: m.roleLabel,
        sortOrder: i,
      });
    });
  }

  async createAbsenceReport(input: Omit<AbsenceReport, "id" | "createdAt">): Promise<AbsenceReport> {
    const created: AbsenceReport = { id: randomUUID(), createdAt: new Date(), ...input };
    this.db.absenceReports.push(created);
    return created;
  }

  async listAbsenceReports(filter: {
    staffId?: string;
    from: string;
    to: string;
  }): Promise<AbsenceReport[]> {
    return this.db.absenceReports
      .filter(
        (r) =>
          r.absenceDate >= filter.from &&
          r.absenceDate <= filter.to &&
          (!filter.staffId || r.staffId === filter.staffId)
      )
      .sort((a, b) => a.absenceDate.localeCompare(b.absenceDate));
  }

  async createOrderRequest(
    input: Omit<OrderRequest, "id" | "status" | "createdAt" | "updatedAt">
  ): Promise<OrderRequest> {
    const created: OrderRequest = {
      id: randomUUID(),
      status: "requested",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...input,
    };
    this.db.orderRequests.push(created);
    return created;
  }

  async listOrderRequests(filter: {
    staffId?: string;
    from: Date;
    to: Date;
  }): Promise<OrderRequest[]> {
    return this.db.orderRequests
      .filter(
        (r) =>
          r.createdAt >= filter.from &&
          r.createdAt < filter.to &&
          (!filter.staffId || r.staffId === filter.staffId)
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
    const found = this.db.orderRequests.find((r) => r.id === id);
    if (found) {
      found.status = status;
      found.updatedAt = new Date();
    }
  }

  async upsertDailyPlan(input: {
    staffId: string;
    planDate: string;
    fields: DailyPlanFields;
    photo: string;
  }): Promise<void> {
    const found = this.db.dailyPlans.find(
      (p) => p.staffId === input.staffId && p.planDate === input.planDate
    );
    if (found) {
      found.fields = input.fields;
      found.photo = input.photo;
      found.seenBy = null; // 編集したら「見ました」はリセット
      found.seenAt = null;
    } else {
      this.db.dailyPlans.push({
        id: randomUUID(),
        staffId: input.staffId,
        planDate: input.planDate,
        content: "",
        fields: input.fields,
        photo: input.photo,
        seenBy: null,
        seenAt: null,
      });
    }
  }

  async markDailyPlanSeen(staffId: string, planDate: string, seenBy: string): Promise<void> {
    const found = this.db.dailyPlans.find((p) => p.staffId === staffId && p.planDate === planDate);
    if (found) {
      found.seenBy = seenBy;
      found.seenAt = new Date();
    }
  }

  async listDailyPlans(planDate: string): Promise<DailyPlan[]> {
    return this.db.dailyPlans.filter((p) => p.planDate === planDate);
  }

  async listIdealSchedules(staffId: string): Promise<IdealSchedule[]> {
    return this.db.idealSchedules.filter((s) => s.staffId === staffId);
  }

  async upsertIdealSchedule(input: {
    staffId: string;
    scope: string;
    content: string;
    image: string;
  }): Promise<void> {
    const found = this.db.idealSchedules.find(
      (s) => s.staffId === input.staffId && s.scope === input.scope
    );
    if (found) {
      found.content = input.content;
      found.image = input.image;
      found.updatedAt = new Date();
    } else {
      this.db.idealSchedules.push({
        id: randomUUID(),
        staffId: input.staffId,
        scope: input.scope,
        content: input.content,
        image: input.image,
        updatedAt: new Date(),
      });
    }
  }

  async listSchedulePresets(): Promise<SchedulePreset[]> {
    return [...this.db.schedulePresets].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)
    );
  }

  async addSchedulePreset(label: string): Promise<void> {
    if (!this.db.schedulePresets.some((p) => p.label === label)) {
      this.db.schedulePresets.push({ id: randomUUID(), label, sortOrder: 500 });
    }
  }

  async deleteSchedulePreset(id: string): Promise<void> {
    this.db.schedulePresets = this.db.schedulePresets.filter((p) => p.id !== id);
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
