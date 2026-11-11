import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import type { AppConfig } from '../shared/types.ts';
import { authMiddleware } from './auth.ts';
import { authMode, type Config } from './config.ts';
import { all, type DB } from './db.ts';
import { announcementRoutes } from './routes/announcements.ts';
import { attendanceRoutes } from './routes/attendance.ts';
import { reportRoutes } from './routes/reports.ts';
import { requestRoutes } from './routes/requests.ts';
import { taskRoutes } from './routes/tasks.ts';
import { teamRoutes } from './routes/team.ts';
import { HttpError, todayIn } from './util.ts';

export interface Ctx {
  db: DB;
  cfg: Config;
  today: () => string;
}

export function createApp(db: DB, cfg: Config) {
  const ctx: Ctx = { db, cfg, today: () => todayIn(cfg.tz) };
  const app = express();
  app.disable('x-powered-by');
  // Фото отчётов приходят в JSON как data URL, поэтому лимит большой.
  app.use(express.json({ limit: '40mb' }));
  app.use('/uploads', express.static(cfg.uploadsDir, { maxAge: '30d', immutable: true }));

  const api = express.Router();

  api.get('/config', (_req, res) => {
    res.json({ mode: authMode(cfg), botUsername: cfg.botUsername || null } satisfies AppConfig);
  });

  // Список для экрана демо-входа; в режиме Telegram недоступен.
  api.get('/demo/users', (_req, res) => {
    if (authMode(cfg) !== 'demo') throw new HttpError(404, 'not_found', 'Не найдено');
    res.json(
      all(
        db,
        `SELECT u.id, u.name, u.role, u.position, b.name AS brigadeName
         FROM users u LEFT JOIN brigades b ON b.id = u.brigade_id
         WHERE u.active = 1 ORDER BY u.id`,
      ),
    );
  });

  api.use(authMiddleware(db, cfg));
  teamRoutes(api, ctx);
  attendanceRoutes(api, ctx);
  reportRoutes(api, ctx);
  announcementRoutes(api, ctx);
  taskRoutes(api, ctx);
  requestRoutes(api, ctx);
  api.use((_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'Не найдено' });
  });

  app.use('/api', api);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.code, message: err.message, ...err.extra });
    } else if (err instanceof ZodError) {
      res.status(400).json({ error: 'validation', message: err.issues[0]?.message ?? 'Проверьте заполнение полей' });
    } else if ((err as { type?: string }).type === 'entity.too.large') {
      res.status(413).json({ error: 'too_large', message: 'Слишком большой запрос — уменьшите количество фото' });
    } else {
      console.error(err);
      res.status(500).json({ error: 'internal', message: 'Ошибка сервера' });
    }
  });

  return app;
}
