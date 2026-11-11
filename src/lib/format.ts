import type {
  AttendanceRow,
  AttendanceStatus,
  ReportStatus,
  RequestKind,
  RequestStatus,
  Role,
} from '../../shared/types';
import type { Tone } from '../ui';

const pad = (n: number) => String(n).padStart(2, '0');

export const parseDate = (date: string) => new Date(`${date}T00:00:00`);
export const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function addDays(date: string, n: number): string {
  const d = parseDate(date);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const dayMonthShort = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' });
const weekdayShort = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });
const monthYear = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const fmtDayMonth = (date: string) => dayMonth.format(parseDate(date));
export const fmtDayShort = (date: string) => dayMonthShort.format(parseDate(date)).replace('.', '');
export const fmtWeekday = (date: string) => weekday.format(parseDate(date));
export const fmtWeekdayShort = (date: string) => weekdayShort.format(parseDate(date));
export const fmtMonth = (month: string) => capitalize(monthYear.format(parseDate(`${month}-01`)).replace(' г.', ''));

/** «Сегодня», «Вчера», «Завтра» или «11 ноября». */
export function fmtDate(date: string, today: string): string {
  if (date === today) return 'Сегодня';
  if (date === addDays(today, -1)) return 'Вчера';
  if (date === addDays(today, 1)) return 'Завтра';
  return fmtDayMonth(date);
}

export function fmtDateTime(iso: string, today: string): string {
  const d = new Date(iso);
  const day = toDateStr(d);
  const label = day === today ? 'сегодня' : day === addDays(today, -1) ? 'вчера' : fmtDayShort(day);
  return `${label}, ${time.format(d)}`;
}

export const fmtHours = (hours: number) => `${String(Math.round(hours * 10) / 10).replace('.', ',')} ч`;

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const firstName = (name: string) => name.split(' ')[0];

export function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
}

/** «Иван Петров» → «Петров И.» — для узких колонок табеля. */
export function shortName(name: string): string {
  const [first, last] = name.split(' ');
  return last ? `${last} ${first.charAt(0)}.` : first;
}

export const ROLE_LABEL: Record<Role, string> = { manager: 'Начальник', foreman: 'Бригадир', worker: 'Рабочий' };

export const STATUS_ORDER: AttendanceStatus[] = ['present', 'late', 'absent', 'sick', 'dayoff'];

export const STATUS_META: Record<
  AttendanceStatus,
  { label: string; many: string; letter: string; solid: string; soft: string; bar: string; tone: Tone }
> = {
  present: { label: 'На месте', many: 'На месте', letter: '', solid: 'bg-ok text-white', soft: 'bg-ok-soft text-ok', bar: 'bg-ok', tone: 'ok' },
  late: { label: 'Опоздал', many: 'Опоздали', letter: '', solid: 'bg-warn text-white', soft: 'bg-warn-soft text-warn', bar: 'bg-warn', tone: 'warn' },
  absent: { label: 'Не вышел', many: 'Не вышли', letter: 'Н', solid: 'bg-bad text-white', soft: 'bg-bad-soft text-bad', bar: 'bg-bad', tone: 'bad' },
  sick: { label: 'Больничный', many: 'Болеют', letter: 'Б', solid: 'bg-info text-white', soft: 'bg-info-soft text-info', bar: 'bg-info', tone: 'info' },
  dayoff: { label: 'Отгул', many: 'Отгул', letter: 'О', solid: 'bg-violet text-white', soft: 'bg-violet-soft text-violet', bar: 'bg-violet', tone: 'violet' },
};

/** Часы по умолчанию для статуса — те же, что подставляет сервер. */
export const DEFAULT_HOURS: Record<AttendanceStatus, number> = { present: 8, late: 7, absent: 0, sick: 0, dayoff: 0 };

export function countStatuses(rows: Pick<AttendanceRow, 'status'>[]) {
  const counts: Record<AttendanceStatus, number> = { present: 0, late: 0, absent: 0, sick: 0, dayoff: 0 };
  let unmarked = 0;
  for (const row of rows) {
    if (row.status) counts[row.status] += 1;
    else unmarked += 1;
  }
  return { counts, unmarked, total: rows.length, onSite: counts.present + counts.late };
}

export const REPORT_STATUS: Record<ReportStatus, { label: string; tone: Tone }> = {
  submitted: { label: 'На проверке', tone: 'info' },
  accepted: { label: 'Принят', tone: 'ok' },
  returned: { label: 'На доработке', tone: 'warn' },
};

export const REQUEST_STATUS: Record<RequestStatus, { label: string; tone: Tone }> = {
  new: { label: 'Новая', tone: 'accent' },
  approved: { label: 'Одобрена', tone: 'info' },
  delivered: { label: 'Получена', tone: 'ok' },
  rejected: { label: 'Отклонена', tone: 'bad' },
};

export const REQUEST_KIND: Record<RequestKind, string> = {
  material: 'Материал',
  tool: 'Инструмент',
  other: 'Другое',
};

/** Сжимает фото на телефоне до отправки: на стройке связь часто слабая. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.8): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}
