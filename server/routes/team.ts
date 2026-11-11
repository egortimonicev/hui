import { randomBytes } from 'node:crypto';
import type { Router } from 'express';
import { z } from 'zod';
import type { Brigade, Me, User } from '../../shared/types.ts';
import type { AuthUser } from '../auth.ts';
import type { Ctx } from '../app.ts';
import { all, get, run } from '../db.ts';
import { badRequest, forbidden, notFound } from '../util.ts';

type UserRow = Omit<User, 'linked'> & { linked: number };

const USER_SQL = `
  SELECT u.id, u.name, u.role, u.position, u.phone, u.brigade_id AS brigadeId, b.name AS brigadeName,
         (u.tg_id IS NOT NULL) AS linked, u.invite_code AS inviteCode
  FROM users u LEFT JOIN brigades b ON b.id = u.brigade_id
  WHERE u.active = 1`;

const BRIGADE_SQL = `
  SELECT b.id, b.name, b.site, b.address,
         (SELECT COUNT(*) FROM users u WHERE u.brigade_id = b.id AND u.active = 1) AS membersCount
  FROM brigades b`;

/** Начальник управляет всеми; бригадир — только рабочими своей бригады. */
function canManageUser(viewer: AuthUser, target: { role: string; brigadeId: number | null }): boolean {
  if (viewer.role === 'manager') return true;
  return viewer.role === 'foreman' && target.role === 'worker' && target.brigadeId === viewer.brigadeId;
}

function toUser(row: UserRow, viewer: AuthUser): User {
  return { ...row, linked: !!row.linked, inviteCode: canManageUser(viewer, row) ? row.inviteCode : null };
}

const userBody = z.object({
  name: z.string().trim().min(2).max(80),
  role: z.enum(['manager', 'foreman', 'worker']),
  position: z.string().trim().max(80),
  phone: z.string().trim().max(30),
  brigadeId: z.number().int().nullable(),
});

const brigadeBody = z.object({
  name: z.string().trim().min(2).max(60),
  site: z.string().trim().max(120),
  address: z.string().trim().max(160),
});

export function teamRoutes(api: Router, { db, today }: Ctx) {
  const findUser = (id: number) => get<UserRow>(db, `${USER_SQL} AND u.id = ?`, id);

  /** Приводит тело запроса к тому, что этому пользователю разрешено сохранить. */
  function parseUserBody(viewer: AuthUser, raw: unknown) {
    const body = userBody.parse(raw);
    if (viewer.role === 'foreman') {
      body.role = 'worker';
      body.brigadeId = viewer.brigadeId;
    } else if (viewer.role !== 'manager') {
      throw forbidden();
    }
    if (body.role === 'manager') body.brigadeId = null;
    if (body.brigadeId && !get(db, 'SELECT 1 FROM brigades WHERE id = ?', body.brigadeId)) {
      throw badRequest('Бригада не найдена');
    }
    return body;
  }

  api.get('/me', (req, res) => {
    const user = findUser(req.user.id)!;
    const brigade = user.brigadeId ? get<Brigade>(db, `${BRIGADE_SQL} WHERE b.id = ?`, user.brigadeId) : null;
    res.json({ user: toUser(user, req.user), brigade: brigade ?? null, today: today() } satisfies Me);
  });

  api.get('/users', (req, res) => {
    const rows = all<UserRow>(db, `${USER_SQL} ORDER BY u.name`);
    res.json(rows.map((row) => toUser(row, req.user)));
  });

  api.post('/users', (req, res) => {
    const body = parseUserBody(req.user, req.body);
    const id = run(
      db,
      'INSERT INTO users (name, role, position, phone, brigade_id, invite_code) VALUES (?, ?, ?, ?, ?, ?)',
      body.name,
      body.role,
      body.position,
      body.phone,
      body.brigadeId,
      randomBytes(6).toString('hex'),
    );
    res.status(201).json(toUser(findUser(id)!, req.user));
  });

  api.put('/users/:id', (req, res) => {
    const target = findUser(Number(req.params.id));
    if (!target) throw notFound();
    if (!canManageUser(req.user, target)) throw forbidden();
    const body = parseUserBody(req.user, req.body);
    if (target.id === req.user.id && body.role !== target.role) {
      throw badRequest('Нельзя менять собственную роль');
    }
    run(
      db,
      'UPDATE users SET name = ?, role = ?, position = ?, phone = ?, brigade_id = ? WHERE id = ?',
      body.name,
      body.role,
      body.position,
      body.phone,
      body.brigadeId,
      target.id,
    );
    res.json(toUser(findUser(target.id)!, req.user));
  });

  api.delete('/users/:id', (req, res) => {
    const target = findUser(Number(req.params.id));
    if (!target) throw notFound();
    if (!canManageUser(req.user, target)) throw forbidden();
    if (target.id === req.user.id) throw badRequest('Нельзя удалить самого себя');
    // История (табель, отчёты) остаётся, человек просто теряет доступ.
    run(db, 'UPDATE users SET active = 0, tg_id = NULL, invite_code = NULL WHERE id = ?', target.id);
    res.json({ ok: true });
  });

  api.get('/brigades', (_req, res) => {
    res.json(all<Brigade>(db, `${BRIGADE_SQL} ORDER BY b.id`));
  });

  api.post('/brigades', (req, res) => {
    if (req.user.role !== 'manager') throw forbidden();
    const body = brigadeBody.parse(req.body);
    const id = run(db, 'INSERT INTO brigades (name, site, address) VALUES (?, ?, ?)', body.name, body.site, body.address);
    res.status(201).json(get<Brigade>(db, `${BRIGADE_SQL} WHERE b.id = ?`, id));
  });

  api.put('/brigades/:id', (req, res) => {
    if (req.user.role !== 'manager') throw forbidden();
    const id = Number(req.params.id);
    if (!get(db, 'SELECT 1 FROM brigades WHERE id = ?', id)) throw notFound();
    const body = brigadeBody.parse(req.body);
    run(db, 'UPDATE brigades SET name = ?, site = ?, address = ? WHERE id = ?', body.name, body.site, body.address, id);
    res.json(get<Brigade>(db, `${BRIGADE_SQL} WHERE b.id = ?`, id));
  });
}
