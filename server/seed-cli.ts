// Пересоздаёт демо-данные: npm run seed. Стирает всё, что есть в базе.
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { seedDemo, wipe } from './seed.ts';
import { todayIn } from './util.ts';

const cfg = loadConfig();
const db = openDb(cfg.dbPath);
wipe(db);
seedDemo(db, todayIn(cfg.tz));
console.log(`Демо-данные записаны в ${cfg.dbPath}`);
