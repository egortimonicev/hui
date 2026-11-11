import type { Router } from 'express';
import { z } from 'zod';
import type { Announcement, AnnouncementReads } from '../../shared/types.ts';
import type { AuthUser } from '../auth.ts';
import type { Ctx } from '../app.ts';
import { all, get, run } from '../db.ts';
import { badRequest, forbidden, notFound, nowIso } from '../util.ts';

type Row = Omit<Announcement, 'pinned' | 'requireAck' | 'read' | 'mustAck' | 'canManage' | 'stats'> & {
  pinned: number;
  requireAck: number;
  read: number;
  ackCount: number;
  recipients: number;
};

// Получатели — бригадиры и рабочие из аудитории объявления, кроме автора.
const RECIPIENT = `ru.active = 1 AND ru.role != 'manager' AND ru.id != a.author_id
                   AND (a.brigade_id IS NULL OR ru.brigade_id = a.brigade_id)`;

const SELECT_SQL = `
  SELECT a.id, a.author_id AS authorId, u.name AS authorName, u.role AS authorRole,
         a.brigade_id AS brigadeId, b.name AS brigadeName, a.title, a.body, a.priority,
         a.pinned, a.require_ack AS requireAck, a.created_at AS createdAt,
         EXISTS (SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = ?) AS read,
         (SELECT COUNT(*) FROM announcement_reads r JOIN users ru ON ru.id = r.user_id
           WHERE r.announcement_id = a.id AND ${RECIPIENT}) AS ackCount,
         (SELECT COUNT(*) FROM users ru WHERE ${RECIPIENT}) AS recipients
  FROM announcements a
  JOIN users u ON u.id = a.author_id
  LEFT JOIN brigades b ON b.id = a.brigade_id`;

const createBody = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().max(3000),
  priority: z.enum(['normal', 'important', 'urgent']),
  brigadeId: z.number().int().nullable(),
  pinned: z.boolean(),
  requireAck: z.boolean(),
});

function toAnnouncement(row: Row, viewer: AuthUser): Announcement {
  const isAuthor = row.authorId === viewer.id;
  const isRecipient = viewer.role !== 'manager' && !isAuthor;
  const canSeeStats =
    viewer.role === 'manager' || isAuthor || (viewer.role === 'foreman' && row.brigadeId === viewer.brigadeId);
  const { ackCount, recipients, ...rest } = row;
  return {
    ...rest,
    pinned: !!row.pinned,
    requireAck: !!row.requireAck,
    read: !!row.read || !isRecipient,
    mustAck: !!row.requireAck && !row.read && isRecipient,
    canManage: viewer.role === 'manager' || isAuthor,
    stats: row.requireAck && canSeeStats ? { ack: ackCount, total: recipients } : null,
  };
}

export function announcementRoutes(api: Router, { db }: Ctx) {
  const visibleTo = (user: AuthUser) =>
    user.role === 'manager' ? '1 = 1' : `(a.brigade_id IS NULL OR a.brigade_id = ${Number(user.brigadeId) || 0})`;

  function load(user: AuthUser, id: number): Row {
    const row = get<Row>(db, `${SELECT_SQL} WHERE a.id = ? AND ${visibleTo(user)}`, user.id, id);
    if (!row) throw notFound('Объявление не найдено');
    return row;
  }

  function markRead(userId: number, announcementId: number) {
    run(
      db,
      'INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id, read_at) VALUES (?, ?, ?)',
      announcementId,
      userId,
      nowIso(),
    );
  }

  api.get('/announcements', (req, res) => {
    const rows = all<Row>(
      db,
      `${SELECT_SQL} WHERE ${visibleTo(req.user)} ORDER BY a.pinned DESC, a.created_at DESC LIMIT 100`,
      req.user.id,
    );
    res.json(rows.map((row) => toAnnouncement(row, req.user)));
  });

  api.post('/announcements', (req, res) => {
    if (req.user.role === 'worker') throw forbidden();
    const body = createBody.parse(req.body);
    // Бригадир пишет только своей бригаде.
    const brigadeId = req.user.role === 'foreman' ? req.user.brigadeId : body.brigadeId;
    if (req.user.role === 'foreman' && !brigadeId) throw badRequest('Вы не состоите в бригаде');
    if (brigadeId && !get(db, 'SELECT 1 FROM brigades WHERE id = ?', brigadeId)) throw badRequest('Бригада не найдена');
    const id = run(
      db,
      `INSERT INTO announcements (author_id, brigade_id, title, body, priority, pinned, require_ack, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      req.user.id,
      brigadeId,
      body.title,
      body.body,
      body.priority,
      body.pinned ? 1 : 0,
      body.requireAck ? 1 : 0,
      nowIso(),
    );
    res.status(201).json(toAnnouncement(load(req.user, id), req.user));
  });

  // Обычные объявления считаются прочитанными, когда человек открыл ленту.
  api.post('/announcements/seen', (req, res) => {
    const rows = all<{ id: number }>(
      db,
      `SELECT a.id FROM announcements a WHERE a.require_ack = 0 AND ${visibleTo(req.user)}`,
    );
    for (const { id } of rows) markRead(req.user.id, id);
    res.json({ ok: true });
  });

  api.post('/announcements/:id/ack', (req, res) => {
    const row = load(req.user, Number(req.params.id));
    markRead(req.user.id, row.id);
    res.json(toAnnouncement(load(req.user, row.id), req.user));
  });

  api.patch('/announcements/:id', (req, res) => {
    const row = toAnnouncement(load(req.user, Number(req.params.id)), req.user);
    if (!row.canManage) throw forbidden();
    const { pinned } = z.object({ pinned: z.boolean() }).parse(req.body);
    run(db, 'UPDATE announcements SET pinned = ? WHERE id = ?', pinned ? 1 : 0, row.id);
    res.json(toAnnouncement(load(req.user, row.id), req.user));
  });

  api.delete('/announcements/:id', (req, res) => {
    const row = toAnnouncement(load(req.user, Number(req.params.id)), req.user);
    if (!row.canManage) throw forbidden();
    run(db, 'DELETE FROM announcements WHERE id = ?', row.id);
    res.json({ ok: true });
  });

  api.get('/announcements/:id/reads', (req, res) => {
    const row = toAnnouncement(load(req.user, Number(req.params.id)), req.user);
    if (!row.stats) throw forbidden();
    const people = all<{ userId: number; name: string; readAt: string | null }>(
      db,
      `SELECT ru.id AS userId, ru.name, r.read_at AS readAt
       FROM announcements a
       JOIN users ru ON ${RECIPIENT}
       LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND r.user_id = ru.id
       WHERE a.id = ? ORDER BY ru.name`,
      row.id,
    );
    res.json({
      read: people.filter((p) => p.readAt).map((p) => ({ userId: p.userId, name: p.name, readAt: p.readAt! })),
      unread: people.filter((p) => !p.readAt).map((p) => ({ userId: p.userId, name: p.name })),
    } satisfies AnnouncementReads);
  });
}
