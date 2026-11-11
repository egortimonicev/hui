import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Role } from '../shared/types.ts';
import { authMode, type Config } from './config.ts';
import { get, run, type DB } from './db.ts';
import { HttpError } from './util.ts';

export interface AuthUser {
  id: number;
  name: string;
  role: Role;
  position: string;
  phone: string;
  brigadeId: number | null;
}

declare global {
  namespace Express {
    interface Request {
      user: AuthUser;
    }
  }
}

const AUTH_USER_SQL = `SELECT id, name, role, position, phone, brigade_id AS brigadeId FROM users WHERE active = 1`;
const INIT_DATA_MAX_AGE_SEC = 24 * 60 * 60;

function initDataHash(params: URLSearchParams, botToken: string): string {
  const checkString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  return createHmac('sha256', secret).update(checkString).digest('hex');
}

/** Собирает подписанную строку initData — так же, как это делает Telegram. Нужна для тестов. */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const params = new URLSearchParams(fields);
  params.set('hash', initDataHash(params, botToken));
  return params.toString();
}

/**
 * Проверяет подпись initData из Telegram Mini App.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(
  initData: string,
  botToken: string,
  nowSec = Math.floor(Date.now() / 1000),
): { tgId: string; startParam: string | null } | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  const expected = Buffer.from(initDataHash(params, botToken), 'hex');
  const actual = Buffer.from(hash, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!authDate || nowSec - authDate > INIT_DATA_MAX_AGE_SEC) return null;

  try {
    const tgUser = JSON.parse(params.get('user') ?? '') as { id?: number };
    if (!tgUser.id) return null;
    return { tgId: String(tgUser.id), startParam: params.get('start_param') };
  } catch {
    return null;
  }
}

function telegramUser(db: DB, cfg: Config, req: Request): AuthUser {
  const header = req.get('authorization') ?? '';
  const data = header.startsWith('tma ') ? validateInitData(header.slice(4), cfg.botToken) : null;
  if (!data) throw new HttpError(401, 'unauthorized', 'Откройте приложение через Telegram');

  let user = get<AuthUser>(db, `${AUTH_USER_SQL} AND tg_id = ?`, data.tgId);
  if (!user && data.startParam?.startsWith('inv_')) {
    // Первый вход по ссылке-приглашению: привязываем Telegram-аккаунт к карточке сотрудника.
    run(
      db,
      'UPDATE users SET tg_id = ?, invite_code = NULL WHERE invite_code = ? AND tg_id IS NULL AND active = 1',
      data.tgId,
      data.startParam.slice(4),
    );
    user = get<AuthUser>(db, `${AUTH_USER_SQL} AND tg_id = ?`, data.tgId);
  }
  if (!user) {
    throw new HttpError(403, 'not_registered', 'Вас ещё нет в команде', { tgId: data.tgId });
  }
  return user;
}

function demoUser(db: DB, req: Request): AuthUser {
  const id = Number(req.get('x-demo-user'));
  const user = id ? get<AuthUser>(db, `${AUTH_USER_SQL} AND id = ?`, id) : undefined;
  if (!user) throw new HttpError(401, 'unauthorized', 'Выберите пользователя');
  return user;
}

export function authMiddleware(db: DB, cfg: Config) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.user = authMode(cfg) === 'telegram' ? telegramUser(db, cfg, req) : demoUser(db, req);
    next();
  };
}
