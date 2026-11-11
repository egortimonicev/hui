import type { Router } from 'express';
import { z } from 'zod';
import type { Task } from '../../shared/types.ts';
import type { AuthUser } from '../auth.ts';
import type { Ctx } from '../app.ts';
import { all, get, run } from '../db.ts';
import { DATE_RE, badRequest, forbidden, notFound, nowIso } from '../util.ts';
import { resolveBrigade } from './attendance.ts';

type Row = Omit<Task, 'canManage' | 'canProgress'>;

const SELECT_SQL = `
  SELECT t.id, t.brigade_id AS brigadeId, b.name AS brigadeName, t.title, t.description,
         t.assignee_id AS assigneeId, au.name AS assigneeName, t.creator_id AS creatorId, cu.name AS creatorName,
         t.priority, t.status, t.due_date AS dueDate, t.created_at AS createdAt, t.done_at AS doneAt
  FROM tasks t
  JOIN brigades b ON b.id = t.brigade_id
  JOIN users cu ON cu.id = t.creator_id
  LEFT JOIN users au ON au.id = t.assignee_id`;

const ORDER_SQL = `ORDER BY (t.status = 'done'), (t.due_date IS NULL), t.due_date, t.id DESC LIMIT 300`;

const taskBody = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000),
  assigneeId: z.number().int().nullable(),
  brigadeId: z.number().int().optional(),
  dueDate: z.string().regex(DATE_RE).nullable(),
  priority: z.enum(['low', 'normal', 'high']),
});

const statusBody = z.object({ status: z.enum(['todo', 'in_progress', 'done']) });

function toTask(row: Row, viewer: AuthUser): Task {
  const canManage = viewer.role === 'manager' || (viewer.role === 'foreman' && row.brigadeId === viewer.brigadeId);
  // Задачу «на всю бригаду» может закрыть любой её участник.
  const isMine = row.assigneeId === viewer.id || (row.assigneeId === null && row.brigadeId === viewer.brigadeId);
  return { ...row, canManage, canProgress: canManage || isMine };
}

export function taskRoutes(api: Router, { db }: Ctx) {
  function load(user: AuthUser, id: number): Task {
    const row = get<Row>(db, `${SELECT_SQL} WHERE t.id = ?`, id);
    if (!row) throw notFound('Задача не найдена');
    const task = toTask(row, user);
    if (!task.canProgress) throw forbidden();
    return task;
  }

  function parseBody(user: AuthUser, raw: unknown) {
    if (user.role === 'worker') throw forbidden();
    const body = taskBody.parse(raw);
    const brigadeId = resolveBrigade(db, user, body.brigadeId);
    if (
      body.assigneeId &&
      !get(db, 'SELECT 1 FROM users WHERE id = ? AND brigade_id = ? AND active = 1', body.assigneeId, brigadeId)
    ) {
      throw badRequest('Исполнитель не из этой бригады');
    }
    return { ...body, brigadeId };
  }

  api.get('/tasks', (req, res) => {
    const { id, role, brigadeId } = req.user;
    let rows: Row[];
    if (role === 'manager') rows = all<Row>(db, `${SELECT_SQL} ${ORDER_SQL}`);
    else if (role === 'foreman') rows = all<Row>(db, `${SELECT_SQL} WHERE t.brigade_id = ? ${ORDER_SQL}`, brigadeId);
    else {
      rows = all<Row>(
        db,
        `${SELECT_SQL} WHERE t.assignee_id = ? OR (t.assignee_id IS NULL AND t.brigade_id = ?) ${ORDER_SQL}`,
        id,
        brigadeId,
      );
    }
    res.json(rows.map((row) => toTask(row, req.user)));
  });

  api.post('/tasks', (req, res) => {
    const body = parseBody(req.user, req.body);
    const id = run(
      db,
      `INSERT INTO tasks (brigade_id, title, description, assignee_id, creator_id, priority, due_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      body.brigadeId,
      body.title,
      body.description,
      body.assigneeId,
      req.user.id,
      body.priority,
      body.dueDate,
      nowIso(),
    );
    res.status(201).json(load(req.user, id));
  });

  api.put('/tasks/:id', (req, res) => {
    const task = load(req.user, Number(req.params.id));
    if (!task.canManage) throw forbidden();
    const body = parseBody(req.user, { ...req.body, brigadeId: task.brigadeId });
    run(
      db,
      'UPDATE tasks SET title = ?, description = ?, assignee_id = ?, priority = ?, due_date = ? WHERE id = ?',
      body.title,
      body.description,
      body.assigneeId,
      body.priority,
      body.dueDate,
      task.id,
    );
    res.json(load(req.user, task.id));
  });

  api.patch('/tasks/:id', (req, res) => {
    const task = load(req.user, Number(req.params.id));
    const { status } = statusBody.parse(req.body);
    run(db, 'UPDATE tasks SET status = ?, done_at = ? WHERE id = ?', status, status === 'done' ? nowIso() : null, task.id);
    res.json(load(req.user, task.id));
  });

  api.delete('/tasks/:id', (req, res) => {
    const task = load(req.user, Number(req.params.id));
    if (!task.canManage) throw forbidden();
    run(db, 'DELETE FROM tasks WHERE id = ?', task.id);
    res.json({ ok: true });
  });
}
