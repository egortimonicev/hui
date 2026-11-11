// Контракт API: эти типы использует и сервер, и веб-клиент.

export type Role = 'manager' | 'foreman' | 'worker';
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'sick' | 'dayoff';
export type AnnouncementPriority = 'normal' | 'important' | 'urgent';
export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'normal' | 'high';
export type ReportStatus = 'submitted' | 'accepted' | 'returned';
export type RequestStatus = 'new' | 'approved' | 'rejected' | 'delivered';
export type RequestKind = 'material' | 'tool' | 'other';

export interface User {
  id: number;
  name: string;
  role: Role;
  position: string;
  phone: string;
  brigadeId: number | null;
  brigadeName: string | null;
  /** Привязан ли Telegram-аккаунт. */
  linked: boolean;
  /** Код приглашения; виден только тем, кто может управлять этим человеком. */
  inviteCode: string | null;
}

export interface Brigade {
  id: number;
  name: string;
  site: string;
  address: string;
  membersCount: number;
}

export interface AppConfig {
  mode: 'demo' | 'telegram';
  botUsername: string | null;
}

export interface Me {
  user: User;
  brigade: Brigade | null;
  today: string;
}

export interface AttendanceRow {
  userId: number;
  name: string;
  position: string;
  role: Role;
  status: AttendanceStatus | null;
  hours: number | null;
  note: string;
}

export interface AttendanceDay {
  date: string;
  brigadeId: number;
  editable: boolean;
  rows: AttendanceRow[];
}

export interface AttendanceCell {
  status: AttendanceStatus;
  hours: number;
}

export interface AttendanceMonthRow {
  userId: number;
  name: string;
  position: string;
  cells: Record<string, AttendanceCell>;
  shifts: number;
  hours: number;
}

export interface AttendanceMonth {
  month: string;
  days: string[];
  rows: AttendanceMonthRow[];
}

export interface WorkItem {
  text: string;
  volume: string;
}

export interface ReportPhoto {
  id: number;
  url: string;
}

export interface Report {
  id: number;
  brigadeId: number;
  brigadeName: string;
  site: string;
  authorId: number;
  authorName: string;
  date: string;
  works: WorkItem[];
  problems: string;
  plan: string;
  status: ReportStatus;
  reviewComment: string;
  reviewerName: string | null;
  photos: ReportPhoto[];
  /** Сколько человек и часов по табелю за день отчёта. */
  headcount: number;
  hours: number;
  createdAt: string;
  updatedAt: string;
}

export interface Announcement {
  id: number;
  authorId: number;
  authorName: string;
  authorRole: Role;
  brigadeId: number | null;
  brigadeName: string | null;
  title: string;
  body: string;
  priority: AnnouncementPriority;
  pinned: boolean;
  requireAck: boolean;
  createdAt: string;
  read: boolean;
  /** Нужно ли текущему пользователю нажать «Ознакомлен». */
  mustAck: boolean;
  canManage: boolean;
  stats: { ack: number; total: number } | null;
}

export interface AnnouncementReads {
  read: { userId: number; name: string; readAt: string }[];
  unread: { userId: number; name: string }[];
}

export interface Task {
  id: number;
  brigadeId: number;
  brigadeName: string;
  title: string;
  description: string;
  assigneeId: number | null;
  assigneeName: string | null;
  creatorId: number;
  creatorName: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  createdAt: string;
  doneAt: string | null;
  canManage: boolean;
  canProgress: boolean;
}

export interface MaterialRequest {
  id: number;
  brigadeId: number;
  brigadeName: string;
  authorId: number;
  authorName: string;
  kind: RequestKind;
  title: string;
  qty: string;
  urgent: boolean;
  neededBy: string | null;
  note: string;
  status: RequestStatus;
  resolutionComment: string;
  resolverName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OverviewBrigade {
  id: number;
  name: string;
  site: string;
  total: number;
  counts: Record<AttendanceStatus, number>;
  reportId: number | null;
  reportStatus: ReportStatus | null;
}

export interface Overview {
  date: string;
  brigades: OverviewBrigade[];
  pending: { requestsNew: number; reportsToReview: number };
}

export interface ApiError {
  error: string;
  message: string;
  tgId?: string;
}
