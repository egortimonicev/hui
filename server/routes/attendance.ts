import type { Router } from 'express';
import { z } from 'zod';
import type {
  AttendanceCell,
  AttendanceDay,
  AttendanceMonth,
  AttendanceRow,
  AttendanceStatus,
  Overview,
  OverviewBrigade,
  ReportStatus,
} from '../../shared/types.ts';
import type { AuthUser } from '../auth.ts';
import type { Ctx } from '../app.ts';
import { all, get, run, tx, type DB } from '../db.ts';
import { DATE_RE, MONTH_RE, addDays, badRequest, forbidden, monthDays, nowIso } from '../util.ts';

const STATUSES = ['present', 'late', 'absent', 'sick', 'dayoff'] as const;
const DEFAULT_HOURS: Record<AttendanceStatus, number> = { present: 8, late: 7, absent: 0, sick: 0, dayoff: 0 };
/** Бригадир может править табель за сегодня и столько дней назад; дальше — только начальник. */
const FOREMAN_EDIT_WINDOW_DAYS = 3;

const putBody = z.object({
  date: z.string().regex(DATE_RE),
  brigadeId: z.number().int().optional(),
  items: z
    .array(
      z.object({
        userId: z.number().int(),
        status: z.enum(STATUSES).nullable(),
        hours: z.number().min(0).max(24).optional(),
        note: z.string().trim().max(300).optional(),
      }),
    )
    .min(1)
    .max(200),
});

/** Начальник выбирает бригаду сам, остальные работают только со своей. */
export function resolveBrigade(db: DB, user: AuthUser, requested?: number): number {
  if (user.role !== 'manager') {
    if (!user.brigadeId) throw badRequest('Вы не состоите в бригаде');
    return user.brigadeId;
  }
  const id = requested ?? get<{ id: number }>(db, 'SELECT id FROM brigades ORDER BY id LIMIT 1')?.id;
  if (!id || !get(db, 'SELECT 1 FROM brigades WHERE id = ?', id)) throw badRequest('Бригада не найдена');
  return id;
}

function canEdit(user: AuthUser, date: string, today: string): boolean {
  if (date > today) return false;
  if (user.role === 'manager') return true;
  return user.role === 'foreman' && date >= addDays(today, -FOREMAN_EDIT_WINDOW_DAYS);
}

const queryNumber = (value: unknown) => (typeof value === 'string' && value ? Number(value) : undefined);

export function attendanceRoutes(api: Router, { db, today }: Ctx) {
  api.get('/attendance', (req, res) => {
    if (req.user.role === 'worker') throw forbidden();
    const date = typeof req.query.date === 'string' && DATE_RE.test(req.query.date) ? req.query.date : today();
    const brigadeId = resolveBrigade(db, req.user, queryNumber(req.query.brigadeId));
    const rows = all<AttendanceRow>(
      db,
      `SELECT u.id AS userId, u.name, u.position, u.role, a.status, a.hours, COALESCE(a.note, '') AS note
       FROM users u LEFT JOIN attendance a ON a.user_id = u.id AND a.date = ?
       WHERE u.brigade_id = ? AND u.active = 1
       ORDER BY (u.role = 'foreman') DESC, u.name`,
      date,
      brigadeId,
    );
    res.json({ date, brigadeId, editable: canEdit(req.user, date, today()), rows } satisfies AttendanceDay);
  });

  api.put('/attendance', (req, res) => {
    const body = putBody.parse(req.body);
    if (req.user.role === 'worker') throw forbidden();
    const brigadeId = resolveBrigade(db, req.user, body.brigadeId);
    if (!canEdit(req.user, body.date, today())) {
      throw forbidden('Этот день закрыт для изменений');
    }
    const members = new Set(
      all<{ id: number }>(db, 'SELECT id FROM users WHERE brigade_id = ? AND active = 1', brigadeId).map((u) => u.id),
    );
    if (body.items.some((item) => !members.has(item.userId))) throw badRequest('Сотрудник не из этой бригады');

    tx(db, () => {
      for (const item of body.items) {
        if (item.status === null) {
          run(db, 'DELETE FROM attendance WHERE user_id = ? AND date = ?', item.userId, body.date);
          continue;
        }
        run(
          db,
          `INSERT INTO attendance (user_id, date, status, hours, note, marked_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id, date) DO UPDATE SET
             status = excluded.status, hours = excluded.hours,
             note = COALESCE(excluded.note, attendance.note),
             marked_by = excluded.marked_by, updated_at = excluded.updated_at`,
          item.userId,
          body.date,
          item.status,
          item.hours ?? DEFAULT_HOURS[item.status],
          item.note ?? null,
          req.user.id,
          nowIso(),
        );
      }
    });
    res.json({ ok: true });
  });

  api.get('/attendance/month', (req, res) => {
    const month =
      typeof req.query.month === 'string' && MONTH_RE.test(req.query.month) ? req.query.month : today().slice(0, 7);
    const days = monthDays(month);
    // Рабочий видит только свою строку.
    const people =
      req.user.role === 'worker'
        ? all<{ userId: number; name: string; position: string }>(
            db,
            'SELECT id AS userId, name, position FROM users WHERE id = ?',
            req.user.id,
          )
        : all<{ userId: number; name: string; position: string }>(
            db,
            `SELECT id AS userId, name, position FROM users WHERE brigade_id = ? AND active = 1
             ORDER BY (role = 'foreman') DESC, name`,
            resolveBrigade(db, req.user, queryNumber(req.query.brigadeId)),
          );

    const rows = people.map((person) => {
      const records = all<AttendanceCell & { date: string }>(
        db,
        'SELECT date, status, hours FROM attendance WHERE user_id = ? AND date BETWEEN ? AND ?',
        person.userId,
        days[0],
        days[days.length - 1],
      );
      const cells: Record<string, AttendanceCell> = {};
      let shifts = 0;
      let hours = 0;
      for (const { date, status, hours: h } of records) {
        cells[date] = { status, hours: h };
        hours += h;
        if (status === 'present' || status === 'late') shifts += 1;
      }
      return { ...person, cells, shifts, hours };
    });
    res.json({ month, days, rows } satisfies AttendanceMonth);
  });

  api.get('/overview', (req, res) => {
    if (req.user.role !== 'manager') throw forbidden();
    const date = today();
    const brigades = all<{ id: number; name: string; site: string; total: number }>(
      db,
      `SELECT b.id, b.name, b.site,
              (SELECT COUNT(*) FROM users u WHERE u.brigade_id = b.id AND u.active = 1) AS total
       FROM brigades b ORDER BY b.id`,
    ).map((brigade): OverviewBrigade => {
      const counts: Record<AttendanceStatus, number> = { present: 0, late: 0, absent: 0, sick: 0, dayoff: 0 };
      const grouped = all<{ status: AttendanceStatus; n: number }>(
        db,
        `SELECT a.status, COUNT(*) AS n FROM attendance a JOIN users u ON u.id = a.user_id
         WHERE u.brigade_id = ? AND u.active = 1 AND a.date = ? GROUP BY a.status`,
        brigade.id,
        date,
      );
      for (const { status, n } of grouped) counts[status] = n;
      const report = get<{ id: number; status: ReportStatus }>(
        db,
        'SELECT id, status FROM reports WHERE brigade_id = ? AND date = ?',
        brigade.id,
        date,
      );
      return { ...brigade, counts, reportId: report?.id ?? null, reportStatus: report?.status ?? null };
    });
    const count = (sql: string) => get<{ n: number }>(db, sql)!.n;
    res.json({
      date,
      brigades,
      pending: {
        requestsNew: count(`SELECT COUNT(*) AS n FROM requests WHERE status = 'new'`),
        reportsToReview: count(`SELECT COUNT(*) AS n FROM reports WHERE status = 'submitted'`),
      },
    } satisfies Overview);
  });
}
