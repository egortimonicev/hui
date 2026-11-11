import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { createApp } from '../server/app.ts';
import { signInitData } from '../server/auth.ts';
import { loadConfig } from '../server/config.ts';
import { get, openDb } from '../server/db.ts';
import { seedDemo } from '../server/seed.ts';
import { addDays, todayIn } from '../server/util.ts';

const BOT_TOKEN = '123456:TEST-TOKEN';
const servers: { close(): void }[] = [];
after(() => servers.forEach((s) => s.close()));

function start(botToken = '') {
  const cfg = { ...loadConfig({}), botToken, uploadsDir: mkdtempSync(join(tmpdir(), 'brigada-')) };
  const db = openDb(':memory:');
  const today = todayIn(cfg.tz);
  const ids = seedDemo(db, today);
  const server = createApp(db, cfg).listen(0);
  servers.push(server);
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  /** `auth` — id демо-пользователя либо строка initData. */
  async function call(auth: number | string | null, method: string, path: string, body?: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (typeof auth === 'number') headers['x-demo-user'] = String(auth);
    if (typeof auth === 'string') headers.authorization = `tma ${auth}`;
    const res = await fetch(`${origin}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as any };
  }
  return { db, ids, today, origin, call };
}

test('демо-вход: без пользователя 401, с пользователем — его профиль', async () => {
  const { call, ids } = start();
  assert.equal((await call(null, 'GET', '/me')).status, 401);
  const me = await call(ids.workers1[0], 'GET', '/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, 'worker');
  assert.equal(me.body.brigade.name, 'Монолит-1');
});

test('табель: права и окно редактирования бригадира', async () => {
  const { call, ids, today } = start();
  const [worker, unmarked] = [ids.workers1[0], ids.workers1[7]];
  const put = (who: number, date: string, userId: number, extra = {}) =>
    call(who, 'PUT', '/attendance', { date, items: [{ userId, status: 'late' }], ...extra });

  assert.equal((await call(worker, 'GET', '/attendance')).status, 403);
  assert.equal((await put(worker, today, worker)).status, 403);

  assert.equal((await put(ids.foreman1, today, unmarked)).status, 200);
  const day = await call(ids.foreman1, 'GET', `/attendance?date=${today}`);
  const row = day.body.rows.find((r: any) => r.userId === unmarked);
  assert.deepEqual([row.status, row.hours], ['late', 7]);
  assert.equal(day.body.editable, true);

  // Чужая бригада, старый день и будущее бригадиру закрыты.
  assert.equal((await put(ids.foreman1, today, ids.workers2[0])).status, 400);
  assert.equal((await put(ids.foreman1, addDays(today, -5), unmarked)).status, 403);
  assert.equal((await put(ids.foreman1, addDays(today, 1), unmarked)).status, 403);
  assert.equal((await put(ids.manager, addDays(today, -5), unmarked, { brigadeId: ids.brigade1 })).status, 200);

  const month = await call(worker, 'GET', '/attendance/month');
  assert.deepEqual(month.body.rows.map((r: any) => r.userId), [worker]);
});

test('отчёт: создание, фото, возврат, исправление, приёмка', async () => {
  const { call, ids, today, origin } = start();
  const pixel =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const draft = { works: [{ text: 'Бетонирование', volume: '20 м³' }], problems: '', plan: '', photos: [pixel] };

  assert.equal((await call(ids.workers1[0], 'GET', '/reports')).status, 403);
  assert.equal((await call(ids.manager, 'POST', '/reports', { date: today, ...draft })).status, 403);

  const created = await call(ids.foreman1, 'POST', '/reports', { date: today, ...draft });
  assert.equal(created.status, 201);
  assert.equal(created.body.headcount, 6);
  assert.equal((await fetch(origin + created.body.photos[0].url)).status, 200);
  const id = created.body.id;

  assert.equal((await call(ids.foreman1, 'POST', '/reports', { date: today, ...draft })).status, 409);
  assert.equal((await call(ids.foreman2, 'GET', `/reports/${id}`)).status, 403);

  assert.equal((await call(ids.foreman1, 'POST', `/reports/${id}/review`, { status: 'accepted' })).status, 403);
  assert.equal((await call(ids.manager, 'POST', `/reports/${id}/review`, { status: 'returned' })).status, 400);
  const returned = await call(ids.manager, 'POST', `/reports/${id}/review`, { status: 'returned', comment: 'Мало' });
  assert.equal(returned.body.status, 'returned');

  const fixed = await call(ids.foreman1, 'PUT', `/reports/${id}`, {
    ...draft,
    photos: [],
    removePhotoIds: [created.body.photos[0].id],
  });
  assert.deepEqual([fixed.body.status, fixed.body.photos.length], ['submitted', 0]);

  assert.equal((await call(ids.manager, 'POST', `/reports/${id}/review`, { status: 'accepted' })).body.status, 'accepted');
  assert.equal((await call(ids.foreman1, 'PUT', `/reports/${id}`, { ...draft, photos: [] })).status, 403);
});

test('объявления: видимость по бригадам и подтверждение «Ознакомлен»', async () => {
  const { call, ids } = start();
  const worker = ids.workers1[6];
  const post = { title: 'Сбор в 7:00', body: '', priority: 'important', brigadeId: null, pinned: false, requireAck: true };

  assert.equal((await call(worker, 'POST', '/announcements', post)).status, 403);
  // Бригадир пишет только своей бригаде, даже если просит «всем».
  const created = await call(ids.foreman1, 'POST', '/announcements', post);
  assert.equal(created.body.brigadeId, ids.brigade1);
  assert.deepEqual(created.body.stats, { ack: 0, total: 8 });
  const id = created.body.id;

  const titles = async (who: number) => (await call(who, 'GET', '/announcements')).body.map((a: any) => a.id);
  assert.ok((await titles(worker)).includes(id));
  assert.ok(!(await titles(ids.workers2[0])).includes(id));
  assert.equal((await call(ids.workers2[0], 'POST', `/announcements/${id}/ack`)).status, 404);

  const mine = (await call(worker, 'GET', '/announcements')).body.find((a: any) => a.id === id);
  assert.deepEqual([mine.mustAck, mine.stats, mine.canManage], [true, null, false]);
  assert.equal((await call(worker, 'POST', `/announcements/${id}/ack`)).body.mustAck, false);

  const reads = await call(ids.foreman1, 'GET', `/announcements/${id}/reads`);
  assert.deepEqual(reads.body.read.map((r: any) => r.userId), [worker]);
  assert.equal(reads.body.unread.length, 7);
  assert.equal((await call(worker, 'DELETE', `/announcements/${id}`)).status, 403);
});

test('задачи и заявки: кто что может менять', async () => {
  const { call, ids } = start();
  const tasks = (await call(ids.foreman1, 'GET', '/tasks')).body;
  const task = tasks.find((t: any) => t.assigneeId === ids.workers1[0]);

  assert.equal((await call(ids.workers1[0], 'PATCH', `/tasks/${task.id}`, { status: 'done' })).body.status, 'done');
  assert.equal((await call(ids.workers1[1], 'PATCH', `/tasks/${task.id}`, { status: 'todo' })).status, 403);
  assert.equal((await call(ids.workers1[0], 'DELETE', `/tasks/${task.id}`)).status, 403);
  const foreign = { title: 'Чужой исполнитель', description: '', assigneeId: ids.workers2[0], dueDate: null, priority: 'normal' };
  assert.equal((await call(ids.foreman1, 'POST', '/tasks', foreign)).status, 400);

  assert.equal((await call(ids.workers1[0], 'GET', '/requests')).status, 403);
  const request = (await call(ids.foreman1, 'GET', '/requests')).body.find((r: any) => r.status === 'new');
  const patch = (who: number, body: unknown) => call(who, 'PATCH', `/requests/${request.id}`, body);
  assert.equal((await patch(ids.foreman1, { status: 'approved' })).status, 403);
  assert.equal((await patch(ids.manager, { status: 'rejected' })).status, 400);
  assert.equal((await patch(ids.manager, { status: 'approved' })).body.status, 'approved');
  assert.equal((await patch(ids.foreman2, { status: 'delivered' })).status, 403);
  assert.equal((await patch(ids.foreman1, { status: 'delivered' })).body.status, 'delivered');
});

test('команда: бригадир добавляет только рабочих в свою бригаду', async () => {
  const { call, ids } = start();
  const person = { name: 'Новый Человек', role: 'manager', position: 'Каменщик', phone: '', brigadeId: ids.brigade2 };

  assert.equal((await call(ids.workers1[0], 'POST', '/users', person)).status, 403);
  const added = await call(ids.foreman1, 'POST', '/users', person);
  assert.deepEqual([added.body.role, added.body.brigadeId], ['worker', ids.brigade1]);
  assert.ok(added.body.inviteCode);

  assert.equal((await call(ids.foreman1, 'PUT', `/users/${ids.manager}`, person)).status, 403);
  assert.equal((await call(ids.foreman1, 'DELETE', `/users/${ids.workers2[0]}`)).status, 403);
  assert.equal((await call(ids.foreman1, 'DELETE', `/users/${added.body.id}`)).status, 200);
  // Рабочий не видит чужих кодов приглашения.
  const seen = (await call(ids.workers1[0], 'GET', '/users')).body;
  assert.ok(seen.every((u: any) => u.inviteCode === null));
});

test('вход через Telegram: подпись, срок действия и привязка по приглашению', async () => {
  const { call, db, ids } = start(BOT_TOKEN);
  const now = Math.floor(Date.now() / 1000);
  const initData = (tgId: number, extra: Record<string, string> = {}, token = BOT_TOKEN, authDate = now) =>
    signInitData({ user: JSON.stringify({ id: tgId, first_name: 'Тест' }), auth_date: String(authDate), ...extra }, token);

  assert.equal((await call(null, 'GET', '/config')).body.mode, 'telegram');
  assert.equal((await call(null, 'GET', '/demo/users')).status, 404);
  // Демо-заголовок в боевом режиме не работает.
  assert.equal((await call(ids.manager, 'GET', '/me')).status, 401);
  assert.equal((await call(initData(777, {}, 'other:token'), 'GET', '/me')).status, 401);
  assert.equal((await call(initData(777, {}, BOT_TOKEN, now - 2 * 86400), 'GET', '/me')).status, 401);
  assert.equal((await call(`${initData(777)}&start_param=inv_x`, 'GET', '/me')).status, 401);

  const unknown = await call(initData(777), 'GET', '/me');
  assert.deepEqual([unknown.status, unknown.body.error, unknown.body.tgId], [403, 'not_registered', '777']);

  const { code } = get<{ code: string }>(db, 'SELECT invite_code AS code FROM users WHERE id = ?', ids.workers1[0])!;
  const joined = await call(initData(777, { start_param: `inv_${code}` }), 'GET', '/me');
  assert.deepEqual([joined.status, joined.body.user.id, joined.body.user.linked], [200, ids.workers1[0], true]);
  // Приглашение одноразовое: второй аккаунт по нему не войдёт, а первый входит уже без него.
  assert.equal((await call(initData(888, { start_param: `inv_${code}` }), 'GET', '/me')).status, 403);
  assert.equal((await call(initData(777), 'GET', '/me')).status, 200);
});
