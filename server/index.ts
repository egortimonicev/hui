import { mkdirSync } from 'node:fs';
import http from 'node:http';
import { resolve } from 'node:path';
import express from 'express';
import { createApp } from './app.ts';
import { ROOT, authMode, loadConfig } from './config.ts';
import { get, openDb, run } from './db.ts';
import { seedDemo } from './seed.ts';
import { todayIn } from './util.ts';

const cfg = loadConfig();
const mode = authMode(cfg);

if (cfg.isProd && mode === 'demo' && !cfg.demoMode) {
  console.error(
    'Не задан BOT_TOKEN. Без него вход не защищён (демо-режим: любой выбирает любого пользователя).\n' +
      'Укажите BOT_TOKEN в .env или явно разрешите демо-режим: DEMO_MODE=1.',
  );
  process.exit(1);
}

const db = openDb(cfg.dbPath);
mkdirSync(cfg.uploadsDir, { recursive: true });

const isEmpty = !get(db, 'SELECT 1 FROM users LIMIT 1');
if (isEmpty && mode === 'demo') {
  seedDemo(db, todayIn(cfg.tz));
  console.log('База пустая — загружены демо-данные.');
}
// Первый начальник в боевом режиме: без него некому раздавать приглашения.
if (cfg.adminTgId && !get(db, 'SELECT 1 FROM users WHERE tg_id = ?', cfg.adminTgId)) {
  run(db, `INSERT INTO users (tg_id, name, role, position) VALUES (?, 'Администратор', 'manager', 'Начальник')`, cfg.adminTgId);
  console.log(`Создан начальник с Telegram ID ${cfg.adminTgId}.`);
}

const app = createApp(db, cfg);
const server = http.createServer(app);

if (cfg.isProd) {
  const dist = resolve(ROOT, 'dist');
  // Отсутствующий файл сборки — это 404, а не index.html: иначе устаревшая вкладка получит HTML вместо скрипта.
  app.use('/assets', express.static(resolve(dist, 'assets'), { maxAge: '1y', immutable: true, fallthrough: false }));
  app.use(express.static(dist, { index: false }));
  // index.html не кешируем, чтобы после выкладки Telegram сразу открывал новую версию.
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.set('Cache-Control', 'no-cache').sendFile(resolve(dist, 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  // Конфиг импортируем сами: иначе Vite собирает его во временный файл, и `node --watch` уходит в цикл перезапусков.
  const { default: viteConfig } = await import('../vite.config.ts');
  const vite = await createServer({
    ...viteConfig,
    configFile: false,
    root: ROOT,
    appType: 'spa',
    server: { middlewareMode: true, hmr: { server }, allowedHosts: true },
  });
  app.use(vite.middlewares);
}

server.listen(cfg.port, '0.0.0.0', () => {
  console.log(`Бригада запущена: http://localhost:${cfg.port} (режим входа: ${mode})`);
});
