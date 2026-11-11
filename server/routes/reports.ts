import { randomUUID } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Router } from 'express';
import { z } from 'zod';
import type { Report, ReportPhoto, WorkItem } from '../../shared/types.ts';
import type { AuthUser } from '../auth.ts';
import type { Ctx } from '../app.ts';
import { all, get, run, tx } from '../db.ts';
import { DATE_RE, HttpError, badRequest, forbidden, notFound, nowIso } from '../util.ts';

const MAX_PHOTOS = 8;
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

type ReportRow = Omit<Report, 'works' | 'photos'> & { works: string };

const REPORT_SQL = `
  SELECT r.id, r.brigade_id AS brigadeId, b.name AS brigadeName, b.site, r.author_id AS authorId,
         au.name AS authorName, r.date, r.works, r.problems, r.plan, r.status,
         r.review_comment AS reviewComment, rv.name AS reviewerName,
         r.created_at AS createdAt, r.updated_at AS updatedAt,
         (SELECT COUNT(*) FROM attendance a JOIN users u ON u.id = a.user_id
           WHERE u.brigade_id = r.brigade_id AND a.date = r.date AND a.status IN ('present', 'late')) AS headcount,
         (SELECT COALESCE(SUM(a.hours), 0) FROM attendance a JOIN users u ON u.id = a.user_id
           WHERE u.brigade_id = r.brigade_id AND a.date = r.date) AS hours
  FROM reports r
  JOIN brigades b ON b.id = r.brigade_id
  JOIN users au ON au.id = r.author_id
  LEFT JOIN users rv ON rv.id = r.reviewed_by`;

const works = z
  .array(z.object({ text: z.string().trim().min(1).max(300), volume: z.string().trim().max(60) }))
  .min(1, 'Добавьте хотя бы одну работу')
  .max(30);
const photos = z.array(z.string()).max(MAX_PHOTOS).default([]);

const createBody = z.object({
  date: z.string().regex(DATE_RE),
  works,
  problems: z.string().trim().max(2000),
  plan: z.string().trim().max(2000),
  photos,
});

const updateBody = createBody.omit({ date: true }).extend({ removePhotoIds: z.array(z.number().int()).default([]) });

const reviewBody = z.object({
  status: z.enum(['accepted', 'returned']),
  comment: z.string().trim().max(1000).default(''),
});

export function reportRoutes(api: Router, { db, cfg, today }: Ctx) {
  function savePhoto(reportId: number, dataUrl: string) {
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) throw badRequest('Неподдерживаемый формат фото');
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > MAX_PHOTO_BYTES) throw badRequest('Фото слишком большое');
    const file = `${randomUUID()}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
    writeFileSync(join(cfg.uploadsDir, file), bytes);
    run(db, 'INSERT INTO report_photos (report_id, file) VALUES (?, ?)', reportId, file);
  }

  function toReport(row: ReportRow): Report {
    const photoRows = all<{ id: number; file: string }>(
      db,
      'SELECT id, file FROM report_photos WHERE report_id = ? ORDER BY id',
      row.id,
    );
    return {
      ...row,
      works: JSON.parse(row.works) as WorkItem[],
      photos: photoRows.map((p): ReportPhoto => ({ id: p.id, url: `/uploads/${p.file}` })),
    };
  }

  /** Отчёты видят начальники и бригадир своей бригады. */
  function loadReport(user: AuthUser, id: number): ReportRow {
    const row = get<ReportRow>(db, `${REPORT_SQL} WHERE r.id = ?`, id);
    if (!row) throw notFound('Отчёт не найден');
    if (user.role === 'worker' || (user.role === 'foreman' && row.brigadeId !== user.brigadeId)) throw forbidden();
    return row;
  }

  function loadEditable(user: AuthUser, id: number): ReportRow {
    const row = loadReport(user, id);
    if (user.role !== 'foreman') throw forbidden('Отчёт редактирует бригадир');
    if (row.status === 'accepted') throw forbidden('Принятый отчёт изменить нельзя');
    return row;
  }

  api.get('/reports', (req, res) => {
    if (req.user.role === 'worker') throw forbidden();
    const rows =
      req.user.role === 'manager'
        ? all<ReportRow>(db, `${REPORT_SQL} ORDER BY r.date DESC, r.id DESC LIMIT 90`)
        : all<ReportRow>(
            db,
            `${REPORT_SQL} WHERE r.brigade_id = ? ORDER BY r.date DESC, r.id DESC LIMIT 90`,
            req.user.brigadeId,
          );
    res.json(rows.map(toReport));
  });

  api.get('/reports/:id', (req, res) => {
    res.json(toReport(loadReport(req.user, Number(req.params.id))));
  });

  api.post('/reports', (req, res) => {
    if (req.user.role !== 'foreman' || !req.user.brigadeId) throw forbidden('Отчёт пишет бригадир');
    const body = createBody.parse(req.body);
    if (body.date > today()) throw badRequest('Нельзя писать отчёт за будущий день');
    const existing = get<{ id: number }>(
      db,
      'SELECT id FROM reports WHERE brigade_id = ? AND date = ?',
      req.user.brigadeId,
      body.date,
    );
    if (existing) {
      throw new HttpError(409, 'report_exists', 'Отчёт за этот день уже есть', { reportId: existing.id });
    }
    const id = tx(db, () => {
      const reportId = run(
        db,
        `INSERT INTO reports (brigade_id, author_id, date, works, problems, plan, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        req.user.brigadeId,
        req.user.id,
        body.date,
        JSON.stringify(body.works),
        body.problems,
        body.plan,
        nowIso(),
        nowIso(),
      );
      for (const photo of body.photos) savePhoto(reportId, photo);
      return reportId;
    });
    res.status(201).json(toReport(loadReport(req.user, id)));
  });

  api.put('/reports/:id', (req, res) => {
    const row = loadEditable(req.user, Number(req.params.id));
    const body = updateBody.parse(req.body);
    const current = all<{ id: number; file: string }>(db, 'SELECT id, file FROM report_photos WHERE report_id = ?', row.id);
    const removed = current.filter((p) => body.removePhotoIds.includes(p.id));
    if (current.length - removed.length + body.photos.length > MAX_PHOTOS) {
      throw badRequest(`Не больше ${MAX_PHOTOS} фото в отчёте`);
    }
    tx(db, () => {
      // Исправленный отчёт снова уходит на проверку.
      run(
        db,
        `UPDATE reports SET works = ?, problems = ?, plan = ?, status = 'submitted', updated_at = ? WHERE id = ?`,
        JSON.stringify(body.works),
        body.problems,
        body.plan,
        nowIso(),
        row.id,
      );
      for (const photo of removed) run(db, 'DELETE FROM report_photos WHERE id = ?', photo.id);
      for (const photo of body.photos) savePhoto(row.id, photo);
    });
    for (const photo of removed) rmSync(join(cfg.uploadsDir, photo.file), { force: true });
    res.json(toReport(loadReport(req.user, row.id)));
  });

  api.delete('/reports/:id', (req, res) => {
    const row = loadEditable(req.user, Number(req.params.id));
    const files = all<{ file: string }>(db, 'SELECT file FROM report_photos WHERE report_id = ?', row.id);
    run(db, 'DELETE FROM reports WHERE id = ?', row.id);
    for (const { file } of files) rmSync(join(cfg.uploadsDir, file), { force: true });
    res.json({ ok: true });
  });

  api.post('/reports/:id/review', (req, res) => {
    if (req.user.role !== 'manager') throw forbidden('Отчёты принимает начальник');
    const row = loadReport(req.user, Number(req.params.id));
    const body = reviewBody.parse(req.body);
    if (body.status === 'returned' && !body.comment) throw badRequest('Напишите, что нужно исправить');
    run(
      db,
      'UPDATE reports SET status = ?, review_comment = ?, reviewed_by = ?, updated_at = ? WHERE id = ?',
      body.status,
      body.comment,
      req.user.id,
      nowIso(),
      row.id,
    );
    res.json(toReport(loadReport(req.user, row.id)));
  });
}
