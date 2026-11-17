// ドメインモデルとデータストアのインターフェース定義。
// 実装は mock-store.ts（デモ用メモリ内）と supabase-store.ts（本番）の2種類。

/**
 * ロール。
 *  ・admin ……… 管理者（すべて見られる）
 *  ・manager …… 店舗の管理者（担当店舗だけを見る。例：イーリスを見る管理者。判定は名前ではなく、このロールと担当店舗で行う）
 *  ・staff ……… スタッフ
 */
export type Role = "admin" | "manager" | "staff";
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
  /** 定休日の曜日（0=日〜6=土）。シフトのカレンダーで「定休日」になり、その日はシフトを入れない */
  closedWeekdays: number[];
  /**
   * 1人の月の休みの数（定休日を含む。例：月曜定休4日を含めて8休なら 8）。
   * 0 なら決めない＝これまでどおり、基本パターン・連勤上限で休みが決まる
   */
  monthlyDaysOff: number;
}

/**
 * 店舗の日ごとの設定（シフトのカレンダー）。行が無い日は「いつもどおり」。
 *  ・dayStatus：""＝いつもどおり（定休日の曜日なら休み）／closed＝この日はお店の休み／open＝定休日の曜日だけど営業する
 *  ・countsAsDayOff：お店の休みを「月の休みの数」に入れるか（特別休暇は入れない）
 *  ・note：その日の行事・連絡（カレンダーに赤字で出る）
 */
export interface StoreCalendarDay {
  storeId: string;
  date: string; // "YYYY-MM-DD"
  dayStatus: "" | "closed" | "open";
  closedLabel: string;
  countsAsDayOff: boolean;
  note: string;
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
  /**
   * 代表（管理権限のいちばん上）。AIしもんへの相談をスタッフ全員ぶん読める。
   * 他の管理者が自分に付けられないよう、アプリの画面からは変えられない（DBで設定する）。
   */
  isOwner: boolean;
  mission: string; // その人の役割・担っていること（組織図に表示）
  /** 段数＝一人当たり同時に回す席数。稼働率（入客時間 ÷ 段数×8時間）の分母に使う */
  tiers: number;
  /** ダッシュボードの配色キー（lib/theme.ts。空文字はブランド既定） */
  themeColor: string;
  fixedOvertimeHours: number;
  isActive: boolean;
  /** 担当店舗（店舗の管理者が見る店舗。管理者・スタッフは空でよい） */
  managedStoreIds: string[];
  /** 呼び名（シフトのカレンダーなどに出す。空なら名前） */
  nickname: string;
}

/** 認証時のみ使用（パスワードハッシュ付き） */
export interface StaffWithSecret extends Staff {
  passwordHash: string;
}

export interface Customer {
  id: string;
  lineUserId: string | null;
  fullName: string;
  /** 電話番号（数字だけ。LINEで送ってもらう／店舗が入れる。LINEとのつなぎ込みの照合に使う） */
  phone: string;
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

/** 来店前カウンセリングの案内（SMSでURLを送る。トークン付きの公開フォームで回答できる） */
export interface CounselingInvite {
  id: string;
  token: string; // URL用トークン（推測不可のランダム文字列）
  customerName: string; // お客様のお名前（送付時に入力）
  phone: string; // 携帯電話番号（SMS送付先）
  customerId: string | null; // 回答時に作成・紐づけされる顧客
  responseId: string | null; // 回答（counseling_responses）への紐づけ
  createdBy: string; // 発行したスタッフ
  createdAt: Date;
  answeredAt: Date | null;
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
  requestDeadlineDay: number; // 希望提出の締切日＝対象月の◯日（既定5）
  /**
   * 何ヶ月先の分を募集するか（既定3）。
   * 3なら「9月5日までに12月分」。お客様の2ヶ月先のご予約を確保できるようにするため。
   */
  requestLeadMonths: number;
}

/**
 * 希望休の提出記録（月単位：備考・提出日時）。休みが0日でも「提出済み」が分かるように1行持つ。
 * 勤務できる店舗は staff_available_stores、休みたい日は DayoffRequest に入る。
 */
export interface ShiftRequestMonth {
  id: string;
  staffId: string;
  targetMonth: string; // "YYYY-MM"
  note: string;
  submittedAt: Date;
  updatedAt: Date;
}

/**
 * 旧「シフト希望」の日単位の希望（早番・遅番・休み）。いまの入力画面からは作られない。
 * 休みは希望休（DayoffRequest）へ移した。残っている早番・遅番の希望だけ、自動作成で参考にする。
 */
export interface ShiftRequest {
  id: string;
  staffId: string;
  targetMonth: string;
  date: string; // "YYYY-MM-DD"
  preference: ShiftPreference;
  /** 休み希望の理由（希望が重なったときに、どちらを優先するかの判断材料。任意） */
  reason: string;
  /** 有休として申請するか（スタイリストの有休は休み希望と同時に申請する） */
  paidLeave: boolean;
}

// ---- 出勤予定のもと（基本パターン＋希望休＋個別調整）----
// シフト表（ShiftAssignment）を作っていない月は、これで「いつもどおりの予定」を出す。
// 希望休はシフト表の自動作成にも使う（以前は旧シフトの「シフト希望」と別々に集めていた）。

/** 週の基本出勤パターン（スタッフ×曜日）。行が無い曜日は「休み」扱い */
export interface WorkPatternDay {
  staffId: string;
  weekday: number; // 0=日〜6=土
  isWorking: boolean;
  startTime: string; // "10:00"（空文字は時間未設定＝終日）
  endTime: string;
}

/** 希望休（スタッフが先の月の分を締切までに出す休み希望日。締切は lib/shift/period.ts） */
export interface DayoffRequest {
  id: string;
  staffId: string;
  date: string; // "YYYY-MM-DD"
  /** 休み希望の理由（希望が重なったときの判断材料。任意） */
  reason: string;
  /** 有休として申請するか */
  paidLeave: boolean;
  createdAt: Date;
}

/** 希望休の入力（保存用） */
export interface DayoffInput {
  date: string;
  reason: string;
  paidLeave: boolean;
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

/**
 * シフト表の1マス（1スタッフ1日1件。行が無い日は休み）。
 * draft=下書き（管理者のみ）／confirmed=公開中。月の中の状態は揃えて使う。
 */
export interface ShiftAssignment {
  id: string;
  targetMonth: string;
  date: string;
  staffId: string;
  storeId: string;
  shiftType: ShiftType;
  status: AssignmentStatus;
  /** 勤務時間（"10:00"。空文字は時間の指定なし）。自動作成では基本パターンの時間が入る */
  startTime: string;
  endTime: string;
  /** 管理者のメモ（例：研修・時短） */
  note: string;
}

export interface NewShiftAssignment {
  date: string;
  staffId: string;
  storeId: string;
  shiftType: ShiftType;
  startTime?: string;
  endTime?: string;
  note?: string;
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

/**
 * 日報・週報へのコメント（1件＝1人の1コメント）。
 * 以前は EniReport.comment の1枠しか無く、別の人が書くと前のコメントが消えていた。
 * スタイリスト同士が重ねてコメントできるよう、行を足していく形にしている。
 */
export interface EniReportComment {
  id: string;
  reportId: string;
  staffId: string;
  body: string;
  createdAt: Date;
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
  minutesFile: string; // 議事録の添付ファイル（PDFのデータURL）
  minutesFileName: string; // 添付ファイルの表示名
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

/** 組織図の部署・チーム（階層構造）。管理者が画面から追加・変更できる */
export interface OrgUnit {
  id: string;
  chartKey: string; // "company"（会社組織図）/ "salon"（サロン組織図）
  unitKey: string; // org_members.team_key と紐づくキー
  parentKey: string; // 親のunitKey（空文字＝最上位）
  name: string;
  mission: string; // このチームが担うこと
  meetingKey: string; // 対応する会議体（空文字＝なし）
  color: string; // 図で使う色
  sortOrder: number;
}

/** 組織図のチーム所属。teamKey は org_units.unit_key */
export interface OrgMember {
  id: string;
  teamKey: string;
  staffId: string;
  roleLabel: string; // "リーダー" など（空文字はメンバー）
  sortOrder: number;
}

/** アシスタントの継続設定（ピラミッド・年内目標・自分との約束・デビュー設定など）。
 *  週報の先頭に常時表示され、随時変更できる。settingKey は lib/eni/forms.ts で定義 */
export interface AssistantSetting {
  id: string;
  staffId: string;
  settingKey: string;
  content: string;
  updatedAt: Date;
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
  supplierUrl: string; // 発注先のURL（商品ページなど。空文字は未設定）
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// タスク管理（ルーティン／タスク × 自分・依頼・幹部）
// ============================================================

/**
 * 種類（登録画面の最初に選ぶ）。
 *  ・routine＝ルーティン …… くり返し（毎日／毎週◯曜日／毎月◯日）。該当日に「今日やること」に出て、日ごとに完了をつける
 *  ・task＝タスク ………… 1回きり。期限と担当者を決め、完了したら終わり
 * 以前は種類の列が無く、くり返しの有無だけで見分けていた（DBの移行は supabase/schema.sql）。
 */
export type TaskType = "routine" | "task";

/**
 * 誰が決めたか（8月に決めた3分類「ルーティン・依頼・会社ルール」のうち、手で登録する2つ＋幹部）。
 *  ・routine＝自分で登録したもの（DBの値は旧名の routine のまま。くり返しかどうかは TaskType で見る）
 *  ・request＝人から依頼されたもの
 *  ・exec＝幹部タスク（幹部メニューで、幹部どうしで進捗を見合う）
 * 会社ルール（日報・週報・議事録・希望休など）は登録せず、提出状況から自動で出す（タスク画面）。
 */
export type TaskKind = "routine" | "request" | "exec";
// 単発タスクの進捗。繰り返しタスクは task_completions（日別）で管理する
export type TaskStatus = "open" | "in_progress" | "done";
// ""=単発 / daily=毎日 / weekly=毎週（repeatDays=曜日0-6）/ monthly=毎月（repeatDays=日1-31）
export type TaskRepeat = "" | "daily" | "weekly" | "monthly";

export interface StaffTask {
  id: string;
  /** ルーティン（くり返し）か、タスク（1回きり）か */
  taskType: TaskType;
  kind: TaskKind;
  title: string;
  note: string;
  assigneeStaffId: string; // やる人
  createdBy: string; // 作成者（依頼タスクでは依頼した人）
  dueDate: string; // 期限 "YYYY-MM-DD"（空文字は期限なし。繰り返しタスクは空）
  repeat: TaskRepeat;
  repeatDays: number[]; // weekly: 曜日(0=日〜6=土) / monthly: 日(1〜31)
  status: TaskStatus;
  doneAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 繰り返しタスクの「その日やったか」の記録（タスク×日付でユニーク） */
export interface TaskCompletion {
  id: string;
  taskId: string;
  date: string; // "YYYY-MM-DD"
  doneBy: string;
  doneAt: Date;
}

/** スタイリスト日報の「気づき・共有」を幹部が確認した記録（レポート単位） */
export interface ExecNoticeCheck {
  id: string;
  reportId: string; // eni_reports.id
  checkedBy: string;
  checkedAt: Date;
}

// ============================================================
// 社内トークルーム（全体共有・DM・グループ／既読／リアクション／ノート）
// ============================================================

export interface ChatRoom {
  id: string;
  name: string; // グループ名（DMは空文字＝相手の名前を表示）
  isGroup: boolean;
  /** 特別なルームの識別キー（"all"＝全体共有。通常のルームは空文字） */
  roomKey: string;
  createdBy: string;
  createdAt: Date;
}

export interface ChatMember {
  roomId: string;
  staffId: string;
  lastReadAt: Date; // 既読管理（この日時以前のメッセージは既読）
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  body: string;
  image: string; // 添付画像（データURL。空文字はなし）
  /** 添付ファイル（PDFなど。データURL。空文字はなし） */
  file: string;
  fileName: string; // 添付ファイルの表示名
  /** 返信元のメッセージID（空文字は通常の投稿） */
  replyToId: string;
  /** メンションしたスタッフID（@名前）。本文中の表示にも使う */
  mentions: string[];
  /** ノート（ルームに固定して後から一覧で読める投稿） */
  pinned: boolean;
  /** 全体共有：アナウンスとしてダッシュボード最上部に出す */
  announcedAt: Date | null;
  announcedBy: string | null;
  deleted: boolean; // 送信取消
  createdAt: Date;
}

/** メッセージ送信の入力（画像・ファイル・返信・メンションは任意） */
export interface ChatMessageInput {
  roomId: string;
  senderId: string;
  body: string;
  image: string;
  file?: string;
  fileName?: string;
  replyToId?: string;
  mentions?: string[];
}

export interface ChatReaction {
  messageId: string;
  staffId: string;
  emoji: string;
}

/**
 * 全体共有の投稿への「確認しました」（1投稿×1人で1件）。
 * 押した人・まだの人の一覧は幹部と管理者が見られる。本人には自分が押したかどうかが分かる。
 */
export interface ChatAcknowledgement {
  messageId: string;
  staffId: string;
  acknowledgedAt: Date;
}

// ============================================================
// 会議体マスタ（管理者が画面から編集できる）
// ============================================================

/** 会議体（定例ミーティングの型）。初期値は lib/eni/meetings-templates.ts から流し込む */
export interface Committee {
  id: string;
  committeeKey: string; // meetings.committee と紐づくキー
  name: string;
  purpose: string;
  cadence: string; // 頻度・時間の目安
  durationMin: number;
  participantsHint: string; // 組織図に登録が無いときの参加者の目安
  orgTeams: string[]; // 対応する組織図のチーム（unitKey）
  memberStaffIds: string[]; // 参加者を直接指定する場合（空なら組織図から引く）
  agenda: string;
  prechecks: string[]; // 会議前にシステムで見ておく項目
  sortOrder: number;
  isActive: boolean;
}

// ============================================================
// 毎日の業務（幹部＝店長・副店長のルーティン業務／スタイリストの毎日の業務）
// デイリー／ウィークリー／マンスリーで、マスタと実施記録を同じ仕組みで持つ
// ============================================================

export type RoutineCycle = "daily" | "weekly" | "monthly";

/**
 * 誰の業務か。
 *  ・exec＝幹部（店長・副店長）…… 店舗ごとに1つチェックする（その店舗の誰かがやればよい）
 *  ・stylist＝スタイリスト ……… 一人ひとりがチェックする
 */
export type RoutineAudience = "exec" | "stylist";

/** 業務のマスタ（管理者・幹部が追加・編集・停止できる。全店舗に共通） */
export interface ManagerRoutine {
  id: string;
  title: string;
  cycle: RoutineCycle;
  note: string;
  sortOrder: number;
  isActive: boolean;
  audience: RoutineAudience;
}

/**
 * 業務の実施記録。periodKey は daily=日付 / weekly=週の月曜 / monthly="YYYY-MM"。
 * subjectKey は「何の分か」：幹部の業務＝店舗ID／スタイリストの業務＝スタッフID。
 * 以前は店舗の区別が無く（1業務×1期間で1件）、移行した記録には付けた人の所属店舗が入っている。
 */
export interface ManagerRoutineCheck {
  id: string;
  routineId: string;
  periodKey: string;
  /** チェックした人 */
  staffId: string;
  /** 幹部の業務＝店舗ID／スタイリストの業務＝スタッフID（店舗ごと・人ごとの集計に使う） */
  subjectKey: string;
  /** 集計用の店舗（幹部の業務＝その店舗／スタイリストの業務＝チェックした時点の所属店舗） */
  storeId: string | null;
  checkedAt: Date;
}

// ============================================================
// アプリ設定（サロンボードのURLなど、管理者が画面から変えられる値）
// ============================================================

/** Web Push の購読（端末ごと）。通知（トーク・タスクなど）とアプリアイコンのバッジに使う */
export interface PushSubscriptionRow {
  id: string;
  staffId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
  createdAt: Date;
}

export interface AppSetting {
  key: string;
  value: string;
}

/**
 * 通知の受け取り設定（1人1行）。止めている通知の種類だけを持つ（初期値＝すべて受け取る）。
 * 種類の定義は lib/push/kinds.ts。端末ごとではなく本人ごとの設定。
 */
export interface PushPreference {
  staffId: string;
  disabledKinds: string[];
  updatedAt: Date;
}

// ============================================================
// 社内SNS（サンクスカード）
// ============================================================

export interface ThanksPost {
  id: string;
  fromStaffId: string;
  toStaffId: string;
  body: string;
  cardColor: string; // カードの色キー（gold/rose/sky/mint）
  createdAt: Date;
}

export interface ThanksLike {
  postId: string;
  staffId: string;
}

export interface ThanksComment {
  id: string;
  postId: string;
  staffId: string;
  body: string;
  createdAt: Date;
}

// ============================================================
// AIしもん（相談の記録。アプリで読めるのは代表だけ）
// ============================================================

/** AIしもんとのやりとり1件（相談した人の発言、またはAIしもんの返答） */
export interface AiShimonMessage {
  id: string;
  staffId: string;
  /** ひと続きの相談のID（画面の「新しく相談する」で新しくなる） */
  threadId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

/** 相談（ひと続きのやりとり）1つぶんのまとめ。代表の一覧画面で使う */
export interface AiShimonThread {
  staffId: string;
  threadId: string;
  startedAt: Date;
  lastAt: Date;
  /** 最初の相談文（一覧の見出し） */
  firstMessage: string;
  /** 相談した回数（相談した人の発言の数） */
  turns: number;
}

/**
 * しもんさんの言葉（代表が書きためた言葉）。管理者が管理画面で登録・並べ替え・停止する。
 * 朝の画面に1日1つ、全員に同じものを、登録順にくり返さず出す（全部出たら最初に戻る）。AIで作ったり言い換えたりはしない。
 */
export interface DailyWord {
  id: string;
  body: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
}

/** その日に出した言葉（1日1行。次の日は、登録順でこの次の言葉を出す） */
export interface DailyWordShown {
  date: string;
  /** 出した言葉（あとで削除された言葉は null） */
  wordId: string | null;
}

/** AIの「今日のタスク」の1行 */
export interface DailyBriefItem {
  /** やること（短く） */
  text: string;
  /** ひとことの理由・補足（空でもよい） */
  detail: string;
}

/**
 * 朝の画面の「今日のタスク」。本人のタスク情報だけから、1人1日1回だけ作って保存する（開くたびには作らない）。
 * AIが使えなかったときの普通の一覧は ai=false。
 */
export interface DailyBrief {
  staffId: string;
  date: string;
  items: DailyBriefItem[];
  ai: boolean;
  /** 作ったモデル（普通の一覧は空文字） */
  model: string;
  createdAt: Date;
}

/** トークの投稿の、未読の集計に使う最小限の情報（本文・写真・ファイルは持たない） */
export interface ChatMessageMeta {
  id: string;
  roomId: string;
  senderId: string;
  createdAt: Date;
  deleted: boolean;
}

/**
 * 閲覧の記録（だれが・いつ・何を見たか）。週報から使い始め、日報・議事録などにも使い回せる共通の形。
 * 集計（例：週報を先輩がどれだけ見ているか）は lib/views.ts。見られるのは幹部・管理者だけ。
 */
export interface ViewLog {
  id: string;
  /** 何を見たか（"weekly_report" など。lib/views.ts の VIEW_TARGETS） */
  targetType: string;
  /** 見たもののID（週報＝eni_reports.id） */
  targetId: string;
  /** 見たものの持ち主（週報を書いた人）。持ち主の無いものは null */
  ownerStaffId: string | null;
  /** 集計用の期間（週報＝その週の月曜。無ければ空文字） */
  periodKey: string;
  /** 見た人 */
  viewerStaffId: string;
  viewedAt: Date;
}

/**
 * 会社のイベント・全体で共有しておきたい予定（全員が見る。登録は幹部・管理者）。
 * 出勤シフトとは別で、勉強会・全体ミーティング・ENi会・研修などを置く場所。
 */
export interface CompanyEvent {
  id: string;
  /** 開始日 "YYYY-MM-DD" */
  startDate: string;
  /** 終了日 "YYYY-MM-DD"（1日だけなら開始日と同じ） */
  endDate: string;
  /** 時間（"10:00" など。終日なら空文字） */
  startTime: string;
  title: string;
  /** 場所・持ち物・補足 */
  body: string;
  /** 全員参加か（false なら任意参加・共有だけ） */
  required: boolean;
  createdBy: string;
  createdAt: Date;
}

/**
 * 予約表（タイムテーブル）の1件。d=曜日index（1日だけの場合は0）、s/e="HH:mm"。
 * 1日は 3:00〜翌3:00 で区切るので、日付をまたいだ後の時刻は "25:30"（＝翌1:30）のように24時以降で持つ。
 */
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

/** 計画スケジュール（scope: month_goal＝今月の目標 / week1〜week4＝各週の計画） */
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
  mission?: string;
  tiers?: number;
  fixedOvertimeHours: number;
  managedStoreIds?: string[];
  nickname?: string;
}

/** イーリスの日報（daily_reports）へのコメント・返信（1件＝1行。店舗の管理者・管理者がコメントし、本人が返信する） */
export interface DailyReportComment {
  id: string;
  reportId: string;
  staffId: string;
  body: string;
  createdAt: Date;
}

/** アプリ内のお知らせ（ホーム・ヘッダーのベル・お知らせ一覧に出る。プッシュ通知とは別に必ず残す） */
export interface AppNotification {
  id: string;
  staffId: string;
  /** 種類（report_comment など） */
  kind: string;
  title: string;
  body: string;
  /** タップで開く画面 */
  href: string;
  /** 何についてのお知らせか（日報のIDなど。開いたら既読にするのに使う） */
  refId: string;
  createdAt: Date;
  readAt: Date | null;
}

/** 予約のお知らせ（LINE）の種類 */
export type AppointmentNoticeKind = "completion" | "three_days" | "day_before" | "week_before";

/** 予約のお知らせの送信記録（いつ・誰に・何を・成功か失敗か）。1回の送信＝1行 */
export interface AppointmentNoticeLog {
  id: string;
  appointmentId: string;
  customerId: string;
  kind: AppointmentNoticeKind;
  /** 送ったときの予約日時（日時が変わったら、新しい日時で送り直せるように） */
  scheduledFor: Date;
  /** sending＝送信中（二重送信を防ぐ札）／sent＝送った／failed＝失敗（次の回にもう一度）／skipped＝送らなかった（LINE未連携など） */
  status: "sending" | "sent" | "failed" | "skipped";
  /** live＝LINEで送った／mock＝LINEのキーが未設定で、実際には送っていない */
  mode: "live" | "mock" | "";
  body: string;
  error: string;
  createdAt: Date;
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
        | "name"
        | "storeId"
        | "role"
        | "jobType"
        | "rank"
        | "isExecutive"
        | "mission"
        | "tiers"
        | "themeColor"
        | "fixedOvertimeHours"
        | "isActive"
        | "managedStoreIds"
        | "nickname"
      >
    > & {
      passwordHash?: string;
    }
  ): Promise<Staff>;
  /** スタッフを削除。関連データ（日報・打刻等）がある場合はエラー */
  /**
   * スタッフを削除する。
   * 既定（force なし）は記録が1件でもあれば拒否する。
   * force を付けると、本人の記録（日報・打刻・シフト希望など）は消し、
   * チームの共有物（トークルーム・議事録・一斉配信・タスクなど）は消さずに
   * reassignTo のスタッフへ引き継ぐ。
   */
  deleteStaff(id: string, options?: { force?: boolean; reassignTo?: string }): Promise<void>;

  // 顧客
  listCustomers(search?: string): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | null>;
  getCustomerByLineUserId(lineUserId: string): Promise<Customer | null>;
  createCustomer(input: { lineUserId: string | null; fullName: string; phone?: string }): Promise<Customer>;
  updateCustomer(id: string, patch: { fullName?: string; phone?: string }): Promise<Customer>;
  /**
   * お客様の記録を1つにまとめる（店舗が先に入れた「LINE未連携」の記録を、LINEのお客様にまとめる）。
   * removeId の次回予約・カウンセリングの回答を keepId に付け替えて、removeId を消す。
   */
  mergeCustomers(keepId: string, removeId: string): Promise<void>;

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

  // 来店前カウンセリングの案内（SMSでURL送付）
  createCounselingInvite(input: {
    customerName: string;
    phone: string;
    createdBy: string;
  }): Promise<CounselingInvite>;
  getCounselingInviteByToken(token: string): Promise<CounselingInvite | null>;
  listCounselingInvites(limit?: number): Promise<CounselingInvite[]>;
  markCounselingInviteAnswered(id: string, customerId: string, responseId: string): Promise<void>;
  deleteCounselingInvite(id: string): Promise<void>;

  // 日報
  upsertDailyReport(input: DailyReportInput): Promise<DailyReport>;
  getDailyReport(staffId: string, reportDate: string): Promise<DailyReport | null>;
  getDailyReportById(id: string): Promise<DailyReport | null>;
  // イーリスの日報へのコメント・返信
  listDailyReportComments(reportIds: string[]): Promise<DailyReportComment[]>;
  addDailyReportComment(reportId: string, staffId: string, body: string): Promise<DailyReportComment>;
  /** 自分のコメントだけ消せる */
  deleteDailyReportComment(id: string, staffId: string): Promise<void>;
  // アプリ内のお知らせ
  createAppNotifications(rows: Omit<AppNotification, "id" | "createdAt" | "readAt">[]): Promise<void>;
  listAppNotifications(staffId: string, limit: number): Promise<AppNotification[]>;
  countUnreadAppNotifications(staffId: string): Promise<number>;
  /** 既読にする（refId を渡すと、その件のお知らせだけ。省略で全部） */
  markAppNotificationsRead(staffId: string, refId?: string): Promise<void>;
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
  // 予約のお知らせ（LINE）の送信記録
  /**
   * 送信の札を取る（同じ予約・種類・予約日時で「送信中」か「送った」行があれば取れずに null）。
   * 取れたら sending の行を返す。これで同じお知らせを二重に送らない。
   */
  claimAppointmentNotice(input: {
    appointmentId: string;
    customerId: string;
    kind: AppointmentNoticeKind;
    scheduledFor: Date;
  }): Promise<AppointmentNoticeLog | null>;
  /** 送信の結果を書く（sent・failed・skipped） */
  finishAppointmentNotice(
    id: string,
    result: { status: "sent" | "failed" | "skipped"; mode: "live" | "mock" | ""; body: string; error: string }
  ): Promise<void>;
  /** 送らなかった記録（LINE未連携など）を1回だけ残す */
  logSkippedAppointmentNotice(input: {
    appointmentId: string;
    customerId: string;
    kind: AppointmentNoticeKind;
    scheduledFor: Date;
    error: string;
  }): Promise<void>;
  listAppointmentNoticeLogs(filter: { appointmentIds?: string[]; limit?: number }): Promise<AppointmentNoticeLog[]>;
  /** 期間内に送ったお知らせの数（LINEの送信数の集計用） */
  countAppointmentNoticesSent(from: Date, to: Date, kinds: AppointmentNoticeKind[]): Promise<number>;
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

  /**
   * 希望休の提出（同月の再提出は上書き）。
   * 休みたい日（希望休）・勤務できる店舗・備考をまとめて入れ替え、提出の記録（0日でも）を残す。
   * 旧「シフト希望」の日単位の希望（shift_requests）はこの月の分を消す（休みは希望休へ一本化）。
   */
  submitDayoffRequest(input: {
    staffId: string;
    targetMonth: string;
    note: string;
    days: DayoffInput[];
    storeIds: string[];
  }): Promise<void>;
  getShiftRequestMonth(staffId: string, targetMonth: string): Promise<ShiftRequestMonth | null>;
  listShiftRequestMonths(targetMonth: string): Promise<ShiftRequestMonth[]>;
  /** 旧「シフト希望」の日単位の希望（早番・遅番の参考用） */
  listShiftRequests(targetMonth: string, staffId?: string): Promise<ShiftRequest[]>;
  listAvailableStores(
    targetMonth: string,
    staffId?: string
  ): Promise<{ staffId: string; storeId: string }[]>;

  // ---- 出勤予定のもと（基本パターン＋希望休＋個別調整） ----
  /** 週の基本パターン（staffId指定でそのスタッフ分のみ） */
  listWorkPatterns(staffId?: string): Promise<WorkPatternDay[]>;
  /** スタッフの週パターンを丸ごと保存（7曜日分を入れ替え） */
  saveWorkPattern(staffId: string, days: Omit<WorkPatternDay, "staffId">[]): Promise<void>;
  /** 希望休（from〜to の日付範囲、"YYYY-MM-DD"） */
  listDayoffRequests(filter: { staffId?: string; from: string; to: string }): Promise<DayoffRequest[]>;
  /** スケジュールの個別上書き（from〜to の日付範囲）。シフト表を作っていない月の手動調整 */
  listScheduleOverrides(filter: { staffId?: string; from: string; to: string }): Promise<ScheduleOverride[]>;
  upsertScheduleOverride(input: Omit<ScheduleOverride, "id">): Promise<void>;
  deleteScheduleOverride(staffId: string, date: string): Promise<void>;
  /** 店舗の日ごとの設定（お店の休み・行事メモ）。from〜to の日付範囲 */
  listStoreCalendarDays(filter: { from: string; to: string; storeId?: string }): Promise<StoreCalendarDay[]>;
  /** 店舗の日ごとの設定を保存（いつもどおり・メモなしなら行を消す） */
  saveStoreCalendarDay(day: StoreCalendarDay): Promise<void>;

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
  /** 会社のイベント・全体予定（期間が重なるものを開始日順で返す） */
  listCompanyEvents(filter: { from: string; to: string }): Promise<CompanyEvent[]>;
  getCompanyEvent(id: string): Promise<CompanyEvent | null>;
  upsertCompanyEvent(
    input: Omit<CompanyEvent, "id" | "createdAt"> & { id?: string }
  ): Promise<CompanyEvent>;
  deleteCompanyEvent(id: string): Promise<void>;

  commentEniReport(id: string, comment: string, commentedBy: string): Promise<void>;
  /**
   * 閲覧を記録する。同じ人が同じものを dedupeMinutes 分以内に見直した分は数えない（再読み込みで増えないように）。
   * 記録したら true。
   */
  recordView(input: Omit<ViewLog, "id" | "viewedAt">, opts?: { dedupeMinutes?: number }): Promise<boolean>;
  /** 閲覧の記録（種類で絞り、期間・持ち主・見た人でさらに絞れる。新しい順） */
  listViewLogs(filter: {
    targetType: string;
    periodKeys?: string[];
    targetIds?: string[];
    viewerStaffId?: string;
  }): Promise<ViewLog[]>;
  /** 日報・週報のコメント（複数人が書ける。古い順） */
  listEniReportComments(reportIds: string[]): Promise<EniReportComment[]>;
  addEniReportComment(reportId: string, staffId: string, body: string): Promise<EniReportComment>;
  /** 自分のコメントを消す（staffId が一致しないときは何もしない） */
  deleteEniReportComment(id: string, staffId: string): Promise<void>;

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
    input: Omit<
      Meeting,
      "id" | "createdAt" | "minutesText" | "minutesPhoto" | "minutesFile" | "minutesFileName" | "minutesAi" | "minutesDone"
    >
  ): Promise<Meeting>;
  getMeeting(id: string): Promise<Meeting | null>;
  listMeetings(filter: { from: string; to: string }): Promise<Meeting[]>;
  /** 議事録の未提出一覧（過去のミーティングで minutesDone=false） */
  listMeetingsMissingMinutes(until: string): Promise<Meeting[]>;
  updateMeetingMinutes(
    id: string,
    patch: {
      minutesText: string;
      minutesPhoto: string;
      minutesFile: string;
      minutesFileName: string;
      minutesAi: boolean;
      minutesDone: boolean;
    }
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

  // 組織図（部署・チームと所属）
  listOrgUnits(): Promise<OrgUnit[]>;
  /** 部署・チームの追加／更新（unitKey で判定。管理者・幹部のみ操作する想定） */
  upsertOrgUnit(input: Omit<OrgUnit, "id">): Promise<void>;
  /** 部署・チームの削除（所属も一緒に消える） */
  deleteOrgUnit(unitKey: string): Promise<void>;
  listOrgMembers(): Promise<OrgMember[]>;
  /** チームの所属を入れ替える（幹部のみ操作する想定） */
  setOrgTeamMembers(teamKey: string, members: { staffId: string; roleLabel: string }[]): Promise<void>;

  // アシスタントの継続設定（ピラミッド・目標・約束など）
  listAssistantSettings(staffId: string): Promise<AssistantSetting[]>;
  upsertAssistantSetting(staffId: string, settingKey: string, content: string): Promise<void>;

  // 欠勤・早退の報告
  createAbsenceReport(input: Omit<AbsenceReport, "id" | "createdAt">): Promise<AbsenceReport>;
  listAbsenceReports(filter: { staffId?: string; from: string; to: string }): Promise<AbsenceReport[]>;
  getAbsenceReport(id: string): Promise<AbsenceReport | null>;
  /** 報告の取り消し（管理者のみ操作する想定） */
  deleteAbsenceReport(id: string): Promise<void>;

  // 発注・購入申請
  createOrderRequest(
    input: Omit<OrderRequest, "id" | "status" | "createdAt" | "updatedAt">
  ): Promise<OrderRequest>;
  listOrderRequests(filter: { staffId?: string; from: Date; to: Date }): Promise<OrderRequest[]>;
  updateOrderStatus(id: string, status: OrderStatus): Promise<void>;

  // ---- タスク管理（ルーティン／依頼／幹部タスク） ----
  createStaffTask(
    input: Omit<StaffTask, "id" | "doneAt" | "createdAt" | "updatedAt">
  ): Promise<StaffTask>;
  getStaffTask(id: string): Promise<StaffTask | null>;
  /** includeDone=false なら未完了（open/in_progress と繰り返し）のみ */
  listStaffTasks(filter?: {
    kind?: TaskKind;
    taskType?: TaskType;
    assigneeStaffId?: string;
    createdBy?: string;
    includeDone?: boolean;
  }): Promise<StaffTask[]>;
  updateStaffTask(
    id: string,
    patch: Partial<
      Pick<StaffTask, "title" | "note" | "assigneeStaffId" | "dueDate" | "repeat" | "repeatDays" | "status">
    >
  ): Promise<void>;
  deleteStaffTask(id: string): Promise<void>;
  /** 繰り返しタスクの「その日の完了」を付ける／外す */
  setTaskCompletion(taskId: string, date: string, staffId: string, done: boolean): Promise<void>;
  listTaskCompletions(filter: { from: string; to: string; taskIds?: string[] }): Promise<TaskCompletion[]>;

  // ---- 幹部：日報の気づき確認 ----
  listExecNoticeChecks(reportIds: string[]): Promise<ExecNoticeCheck[]>;
  setExecNoticeChecked(reportId: string, staffId: string, checked: boolean): Promise<void>;

  // ---- 社内トークルーム ----
  listChatRooms(staffId: string): Promise<ChatRoom[]>;
  getChatRoom(roomId: string): Promise<ChatRoom | null>;
  listChatMembers(roomIds: string[]): Promise<ChatMember[]>;
  /** 2人のDMルームを取得（無ければ作る） */
  getOrCreateDmRoom(staffA: string, staffB: string): Promise<ChatRoom>;
  /** グループを作る。自分が入らないグループも作れる（memberIds がそのまま参加者） */
  createGroupRoom(name: string, createdBy: string, memberIds: string[]): Promise<ChatRoom>;
  /** グループ名・参加者の変更（DMは対象外） */
  updateGroupRoom(roomId: string, patch: { name?: string; memberIds?: string[] }): Promise<void>;
  /** 全体共有ルーム（roomKey="all"）を取得。無ければ作り、在籍者を全員参加させる */
  ensureAllRoom(staffIds: string[]): Promise<ChatRoom>;
  /** ルームのメッセージ（古い順・直近limit件） */
  listChatMessages(roomId: string, limit?: number): Promise<ChatMessage[]>;
  /** 複数ルームの直近メッセージ（新しい順・未読数と一覧プレビュー用） */
  listChatMessagesForRooms(roomIds: string[], limit?: number): Promise<ChatMessage[]>;
  /** IDを指定してメッセージを取り出す（返信元の引用表示に使う） */
  listChatMessagesByIds(ids: string[]): Promise<ChatMessage[]>;
  /** ノート（ルームに固定した投稿）の一覧 */
  listPinnedChatMessages(roomId: string): Promise<ChatMessage[]>;
  /** アナウンス中のメッセージ（新しい順）。ダッシュボード最上部の全体共有に使う */
  listAnnouncedChatMessages(limit?: number): Promise<ChatMessage[]>;
  createChatMessage(input: ChatMessageInput): Promise<ChatMessage>;
  /** 自分のメッセージのみ取消できる */
  deleteChatMessage(id: string, staffId: string): Promise<void>;
  /** ノートへの固定／解除 */
  setChatMessagePinned(id: string, pinned: boolean): Promise<void>;
  /** アナウンス（ダッシュボード掲示）の開始／解除 */
  setChatMessageAnnounced(id: string, staffId: string, announced: boolean): Promise<void>;
  markChatRead(roomId: string, staffId: string): Promise<void>;
  toggleChatReaction(messageId: string, staffId: string, emoji: string): Promise<void>;
  listChatReactions(messageIds: string[]): Promise<ChatReaction[]>;
  /** 複数のスタッフが入っているトークの参加情報（既読の位置つき）。ホームの未読者の集計に使う */
  listChatMembersByStaff(staffIds: string[]): Promise<ChatMember[]>;
  /** 期間内の投稿の最小限の情報（本文・写真は読まない）。ホームの未読者の集計に使う */
  listChatMessageMeta(roomIds: string[], from: Date, to: Date): Promise<ChatMessageMeta[]>;
  /** 「確認しました」を付ける（同じ人が何度押しても1件。取り消しはしない） */
  acknowledgeChatMessage(messageId: string, staffId: string): Promise<void>;
  listChatAcknowledgements(messageIds: string[]): Promise<ChatAcknowledgement[]>;

  // ---- AIしもん（相談の記録。アプリで読めるのは代表だけ） ----
  /** 相談と返答を記録する */
  addAiShimonMessages(rows: Omit<AiShimonMessage, "id">[]): Promise<void>;
  /** 相談の一覧（最後のやりとりが新しい順）。staffId を指定するとその人のぶんだけ */
  listAiShimonThreads(filter?: { staffId?: string; limit?: number }): Promise<AiShimonThread[]>;
  /** 1つの相談のやりとり（古い順） */
  listAiShimonMessages(staffId: string, threadId: string): Promise<AiShimonMessage[]>;

  // ---- 会議体マスタ ----
  /** 会議体の一覧（初回はテンプレートから自動で作られる） */
  listCommittees(): Promise<Committee[]>;
  /** 会議体の追加・更新（committeeKey で判定。管理者のみ操作する想定） */
  upsertCommittee(input: Omit<Committee, "id">): Promise<void>;
  deleteCommittee(committeeKey: string): Promise<void>;

  // ---- 毎日の業務（幹部のルーティン業務／スタイリストの毎日の業務） ----
  listManagerRoutines(): Promise<ManagerRoutine[]>;
  createManagerRoutine(input: Omit<ManagerRoutine, "id">): Promise<ManagerRoutine>;
  updateManagerRoutine(
    id: string,
    patch: Partial<Omit<ManagerRoutine, "id">>
  ): Promise<void>;
  deleteManagerRoutine(id: string): Promise<void>;
  /** 実施記録の付け外し（業務×期間×対象。対象は幹部の業務＝店舗／スタイリストの業務＝本人） */
  setManagerRoutineChecked(input: {
    routineId: string;
    periodKey: string;
    subjectKey: string;
    storeId: string | null;
    /** チェックした人 */
    staffId: string;
    checked: boolean;
  }): Promise<void>;
  listManagerRoutineChecks(periodKeys: string[]): Promise<ManagerRoutineCheck[]>;

  // ---- アプリ設定（サロンボードURLなど） ----
  listAppSettings(): Promise<AppSetting[]>;
  setAppSetting(key: string, value: string): Promise<void>;

  // Web Push の購読（通知・アプリバッジ）
  listPushSubscriptions(staffIds: string[]): Promise<PushSubscriptionRow[]>;
  /** 同じ endpoint があれば持ち主・鍵を更新する */
  upsertPushSubscription(input: {
    staffId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent: string;
  }): Promise<void>;
  deletePushSubscription(endpoint: string): Promise<void>;
  // ---- ホームの朝の画面（しもんさんの言葉・AIの今日のタスク） ----
  /** しもんさんの言葉（並び順→登録順。停止中も含む） */
  listDailyWords(): Promise<DailyWord[]>;
  createDailyWord(body: string): Promise<DailyWord>;
  updateDailyWord(id: string, patch: Partial<Pick<DailyWord, "body" | "sortOrder" | "isActive">>): Promise<void>;
  deleteDailyWord(id: string): Promise<void>;
  /** これまでに出した言葉（新しい日付順） */
  listDailyWordShown(limit: number): Promise<DailyWordShown[]>;
  /** その日に出した言葉を記録（同じ日にすでにあれば何もしない＝先に決まった言葉を使う） */
  recordDailyWordShown(date: string, wordId: string): Promise<void>;
  getDailyBrief(staffId: string, date: string): Promise<DailyBrief | null>;
  /** 今日のタスクを保存（同じ人・同じ日にすでにあれば何もしない＝1人1日1回） */
  saveDailyBrief(input: Omit<DailyBrief, "createdAt">): Promise<void>;

  /** 通知の受け取り設定（行が無い人は返さない＝すべて受け取る） */
  listPushPreferences(staffIds: string[]): Promise<PushPreference[]>;
  /** 止める通知の種類を丸ごと入れ替える */
  setPushPreference(staffId: string, disabledKinds: string[]): Promise<void>;

  // ---- 社内SNS（サンクスカード） ----
  createThanksPost(input: Omit<ThanksPost, "id" | "createdAt">): Promise<ThanksPost>;
  listThanksPosts(filter?: { from?: Date; to?: Date; limit?: number }): Promise<ThanksPost[]>;
  toggleThanksLike(postId: string, staffId: string): Promise<void>;
  listThanksLikes(postIds: string[]): Promise<ThanksLike[]>;
  createThanksComment(input: Omit<ThanksComment, "id" | "createdAt">): Promise<ThanksComment>;
  listThanksComments(postIds: string[]): Promise<ThanksComment[]>;

  // その日のスケジュール・計画スケジュール
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

  // ---- シフト表（自動作成→調整→公開）----
  listShiftAssignments(targetMonth: string, staffId?: string): Promise<ShiftAssignment[]>;
  /**
   * 自動作成：対象月のシフト表を消して入れ直す（空配列なら削除だけ）。
   * staffIds を渡すと、その人たちの行だけを入れ替える（ほかの業態・店舗の人の行はそのまま）。
   * 入れる行の状態は status（既定は下書き draft）。
   */
  replaceMonthAssignments(
    targetMonth: string,
    rows: NewShiftAssignment[],
    opts?: { staffIds?: string[]; status?: AssignmentStatus }
  ): Promise<void>;
  /** 1マスの保存（同じスタッフ・同じ日があれば置き換える） */
  upsertShiftAssignment(
    input: NewShiftAssignment & { targetMonth: string; status: AssignmentStatus }
  ): Promise<void>;
  /** 1マスを休みにする（その日の割当を消す） */
  deleteShiftAssignmentAt(staffId: string, date: string): Promise<void>;
  /** 対象月のシフト表の状態をまとめて変える（公開・下書きに戻す。staffIds を渡すとその人たちの行だけ）。変えた件数を返す */
  setMonthAssignmentStatus(targetMonth: string, status: AssignmentStatus, staffIds?: string[]): Promise<number>;
}
