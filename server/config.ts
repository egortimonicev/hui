import { resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..');

export interface Config {
  port: number;
  dbPath: string;
  uploadsDir: string;
  botToken: string;
  botUsername: string;
  adminTgId: string;
  demoMode: boolean;
  tz: string;
  isProd: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    dbPath: resolve(ROOT, env.DB_PATH ?? 'data/brigada.db'),
    uploadsDir: resolve(ROOT, env.UPLOADS_DIR ?? 'data/uploads'),
    botToken: env.BOT_TOKEN ?? '',
    botUsername: env.BOT_USERNAME ?? '',
    adminTgId: env.ADMIN_TG_ID ?? '',
    demoMode: env.DEMO_MODE === '1',
    tz: env.APP_TZ ?? 'Europe/Moscow',
    isProd: env.NODE_ENV === 'production',
  };
}

/** С токеном бота вход только через Telegram; без него — демо-вход с выбором пользователя. */
export const authMode = (cfg: Config): 'demo' | 'telegram' => (cfg.botToken ? 'telegram' : 'demo');
