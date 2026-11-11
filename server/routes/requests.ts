import type { Router } from 'express';
import { z } from 'zod';
import type { MaterialRequest, RequestStatus } from '../../shared/types.ts';
import type { AuthUser } from '../auth.ts';
import type { Ctx } from '../app.ts';
import { all, get, run } from '../db.ts';
import { DATE_RE, badRequest, forbidden, notFound, nowIso } from '../util.ts';

type Row = Omit<MaterialRequest, 'urgent'> & { urgent: number };

const SELECT_SQL = `
  SELECT q.id, q.brigade_id AS brigadeId, b.name AS brigadeName, q.author_id AS authorId, au.name AS authorName,
         q.kind, q.title, q.qty, q.urgent, q.needed_by AS neededBy, q.note, q.status,
         q.resolution_comment AS resolutionComment, rv.name AS resolverName,
         q.created_at AS createdAt, q.updated_at AS updatedAt
  FROM requests q
  JOIN brigades b ON b.id = q.brigade_id
  JOIN users au ON au.id = q.author_id
  LEFT JOIN users rv ON rv.id = q.resolved_by`;

const ORDER_SQL = `ORDER BY (q.status IN ('rejected', 'delivered')), q.urgent DESC, q.created_at DESC LIMIT 300`;

const createBody = z.object({
  kind: z.enum(['material', 'tool', 'other']),
  title: z.string().trim().min(2).max(160),
  qty: z.string().trim().max(60),
  urgent: z.boolean(),
  neededBy: z.string().regex(DATE_RE).nullable(),
  note: z.string().trim().max(1000),
});

const statusBody = z.object({
  status: z.enum(['approved', 'rejected', 'delivered']),
  comment: z.string().trim().max(500).default(''),
});

const toRequest = (row: Row): MaterialRequest => ({ ...row, urgent: !!row.urgent });

export function requestRoutes(api: Router, { db }: Ctx) {
  /** Заявки видят начальники и бригадир своей бригады. */
  function load(user: AuthUser, id: number): Row {
    const row = get<Row>(db, `${SELECT_SQL} WHERE q.id = ?`, id);
    if (!row) throw notFound('Заявка не найдена');
    if (user.role === 'worker' || (user.role === 'foreman' && row.brigadeId !== user.brigadeId)) throw forbidden();
    return row;
  }

  api.get('/requests', (req, res) => {
    if (req.user.role === 'worker') throw forbidden();
    const rows =
      req.user.role === 'manager'
        ? all<Row>(db, `${SELECT_SQL} ${ORDER_SQL}`)
        : all<Row>(db, `${SELECT_SQL} WHERE q.brigade_id = ? ${ORDER_SQL}`, req.user.brigadeId);
    res.json(rows.map(toRequest));
  });

  api.post('/requests', (req, res) => {
    if (req.user.role !== 'foreman' || !req.user.brigadeId) throw forbidden('Заявку оформляет бригадир');
    const body = createBody.parse(req.body);
    const id = run(
      db,
      `INSERT INTO requests (brigade_id, author_id, kind, title, qty, urgent, needed_by, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      req.user.brigadeId,
      req.user.id,
      body.kind,
      body.title,
      body.qty,
      body.urgent ? 1 : 0,
      body.neededBy,
      body.note,
      nowIso(),
      nowIso(),
    );
    res.status(201).json(toRequest(load(req.user, id)));
  });

  api.patch('/requests/:id', (req, res) => {
    const row = load(req.user, Number(req.params.id));
    const body = statusBody.parse(req.body);
    // new → approved | rejected решает начальник; approved → delivered подтверждает получатель или начальник.
    const allowed: Record<RequestStatus, RequestStatus[]> = {
      new: req.user.role === 'manager' ? ['approved', 'rejected'] : [],
      approved: ['delivered'],
      rejected: [],
      delivered: [],
    };
    if (!allowed[row.status].includes(body.status)) throw forbidden('Так изменить статус заявки нельзя');
    if (body.status === 'rejected' && !body.comment) throw badRequest('Укажите причину отказа');

    if (body.status === 'delivered') {
      run(db, 'UPDATE requests SET status = ?, updated_at = ? WHERE id = ?', body.status, nowIso(), row.id);
    } else {
      run(
        db,
        'UPDATE requests SET status = ?, resolution_comment = ?, resolved_by = ?, updated_at = ? WHERE id = ?',
        body.status,
        body.comment,
        req.user.id,
        nowIso(),
        row.id,
      );
    }
    res.json(toRequest(load(req.user, row.id)));
  });

  api.delete('/requests/:id', (req, res) => {
    const row = load(req.user, Number(req.params.id));
    if (row.authorId !== req.user.id || row.status !== 'new') throw forbidden('Отозвать можно только свою новую заявку');
    run(db, 'DELETE FROM requests WHERE id = ?', row.id);
    res.json({ ok: true });
  });
}
