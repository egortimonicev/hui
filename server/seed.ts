import { randomBytes } from 'node:crypto';
import type { AttendanceStatus, Role } from '../shared/types.ts';
import { run, tx, type DB } from './db.ts';
import { addDays } from './util.ts';

export interface SeedIds {
  manager: number;
  brigade1: number;
  brigade2: number;
  foreman1: number;
  foreman2: number;
  /** Рабочие первой и второй бригады в порядке добавления. */
  workers1: number[];
  workers2: number[];
}

const TABLES = [
  'announcement_reads',
  'announcements',
  'report_photos',
  'reports',
  'requests',
  'tasks',
  'attendance',
  'users',
  'brigades',
];

export function wipe(db: DB) {
  for (const table of TABLES) db.exec(`DELETE FROM ${table}`);
}

/** Детерминированный генератор, чтобы демо-данные каждый раз выглядели одинаково. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isSunday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
/** Момент времени в день `date` по московскому времени. */
const at = (date: string, time: string) => new Date(`${date}T${time}:00+03:00`).toISOString();

/** Наполняет пустую базу демо-данными, привязанными к сегодняшней дате. */
export function seedDemo(db: DB, today: string): SeedIds {
  return tx(db, () => {
    const brigade = (name: string, site: string, address: string) =>
      run(db, 'INSERT INTO brigades (name, site, address) VALUES (?, ?, ?)', name, site, address);
    const user = (name: string, role: Role, position: string, phone: string, brigadeId: number | null) =>
      run(
        db,
        'INSERT INTO users (name, role, position, phone, brigade_id, invite_code) VALUES (?, ?, ?, ?, ?, ?)',
        name,
        role,
        position,
        phone,
        brigadeId,
        randomBytes(6).toString('hex'),
      );

    const manager = user('Андрей Соколов', 'manager', 'Начальник участка', '+7 900 100-10-01', null);
    const engineer = user('Марина Белова', 'manager', 'Инженер ПТО', '+7 900 100-10-02', null);

    const brigade1 = brigade('Монолит-1', 'ЖК «Северный», корпус 2', 'ул. Строителей, 14');
    const foreman1 = user('Сергей Кузнецов', 'foreman', 'Бригадир', '+7 900 200-20-01', brigade1);
    const workers1 = [
      user('Иван Петров', 'worker', 'Арматурщик', '+7 900 200-20-02', brigade1),
      user('Дмитрий Орлов', 'worker', 'Бетонщик', '+7 900 200-20-03', brigade1),
      user('Алексей Смирнов', 'worker', 'Плотник-опалубщик', '+7 900 200-20-04', brigade1),
      user('Рустам Каримов', 'worker', 'Арматурщик', '+7 900 200-20-05', brigade1),
      user('Николай Васильев', 'worker', 'Сварщик', '+7 900 200-20-06', brigade1),
      user('Олег Морозов', 'worker', 'Бетонщик', '+7 900 200-20-07', brigade1),
      user('Тимур Ахмедов', 'worker', 'Подсобный рабочий', '+7 900 200-20-08', brigade1),
      user('Павел Новиков', 'worker', 'Крановщик', '+7 900 200-20-09', brigade1),
    ];

    const brigade2 = brigade('Отделка-2', 'БЦ «Меридиан», этажи 4–6', 'пр. Победы, 88');
    const foreman2 = user('Ринат Галиев', 'foreman', 'Бригадир', '+7 900 300-30-01', brigade2);
    const workers2 = [
      user('Виктор Лебедев', 'worker', 'Штукатур', '+7 900 300-30-02', brigade2),
      user('Артём Козлов', 'worker', 'Маляр', '+7 900 300-30-03', brigade2),
      user('Денис Фёдоров', 'worker', 'Плиточник', '+7 900 300-30-04', brigade2),
      user('Максим Егоров', 'worker', 'Электромонтажник', '+7 900 300-30-05', brigade2),
      user('Фарход Юсупов', 'worker', 'Штукатур', '+7 900 300-30-06', brigade2),
      user('Игорь Зайцев', 'worker', 'Монтажник ГКЛ', '+7 900 300-30-07', brigade2),
    ];

    // --- Табель: три недели истории, воскресенье — выходной.
    const random = mulberry32(7);
    const mark = (userId: number, date: string, status: AttendanceStatus, by: number, hours?: number, note = '') =>
      run(
        db,
        'INSERT INTO attendance (user_id, date, status, hours, note, marked_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        userId,
        date,
        status,
        hours ?? (status === 'present' ? 8 : status === 'late' ? 7 : 0),
        note,
        by,
        at(date, '08:10'),
      );
    const pastDays = Array.from({ length: 21 }, (_, i) => addDays(today, -(i + 1))).filter((d) => !isSunday(d));
    const sickDays = new Set(pastDays.slice(1, 4));
    for (const [foreman, workers] of [[foreman1, workers1], [foreman2, workers2]] as const) {
      for (const date of pastDays) {
        mark(foreman, date, 'present', foreman);
        for (const worker of workers) {
          if (worker === workers1[5] && sickDays.has(date)) {
            mark(worker, date, 'sick', foreman, 0, 'Больничный лист');
            continue;
          }
          const roll = random();
          if (roll < 0.05) mark(worker, date, 'late', foreman, 7, 'Опоздал на час');
          else if (roll < 0.08) mark(worker, date, 'absent', foreman);
          else if (roll < 0.1) mark(worker, date, 'dayoff', foreman, 0, 'По заявлению');
          else mark(worker, date, 'present', foreman, roll > 0.9 ? 10 : 8);
        }
      }
    }
    // Сегодня: первая бригада отмечена наполовину, вторая — полностью.
    mark(foreman1, today, 'present', foreman1);
    for (const worker of workers1.slice(0, 4)) mark(worker, today, 'present', foreman1);
    mark(workers1[4], today, 'late', foreman1, 7, 'Опоздал на 40 минут');
    mark(foreman2, today, 'present', foreman2);
    workers2.forEach((worker, i) => mark(worker, today, i === 3 ? 'dayoff' : 'present', foreman2));

    // --- Отчёты
    const report = (
      brigadeId: number,
      authorId: number,
      date: string,
      works: [string, string][],
      problems: string,
      plan: string,
      status: 'submitted' | 'accepted' | 'returned',
      comment = '',
    ) =>
      run(
        db,
        `INSERT INTO reports (brigade_id, author_id, date, works, problems, plan, status, review_comment, reviewed_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        brigadeId,
        authorId,
        date,
        JSON.stringify(works.map(([text, volume]) => ({ text, volume }))),
        problems,
        plan,
        status,
        comment,
        status === 'submitted' ? null : manager,
        at(date, '17:40'),
        at(date, '18:05'),
      );
    const [d1, d2, d3, d4] = pastDays;
    report(
      brigade1,
      foreman1,
      d1,
      [
        ['Армирование плиты перекрытия 4 этажа, захватка 2', '3,2 т'],
        ['Монтаж опалубки колонн в осях 3–5', '14 шт'],
        ['Приёмка и разгрузка арматуры А500С', '6 т'],
      ],
      'Башенный кран простоял 1,5 часа из-за ветра.',
      'Бетонирование захватки 2 с 7:00, приём трёх миксеров.',
      'submitted',
    );
    report(
      brigade1,
      foreman1,
      d2,
      [
        ['Бетонирование колонн 4 этажа', '18 м³'],
        ['Распалубка стен лестничной клетки', '42 м²'],
      ],
      '',
      'Армирование плиты перекрытия, захватка 2.',
      'accepted',
      'Принято. Объёмы сходятся с накладными.',
    );
    report(
      brigade1,
      foreman1,
      d3,
      [['Армирование плиты перекрытия 4 этажа, захватка 1', '']],
      'Не хватило фиксаторов защитного слоя.',
      'Бетонирование колонн.',
      'returned',
      'Укажите объём армирования в тоннах и добавьте фото скрытых работ.',
    );
    report(
      brigade1,
      foreman1,
      d4,
      [
        ['Монтаж опалубки плиты перекрытия 4 этажа', '160 м²'],
        ['Вязка каркасов колонн', '12 шт'],
      ],
      '',
      'Армирование плиты, захватка 1.',
      'accepted',
    );
    report(
      brigade2,
      foreman2,
      today,
      [
        ['Штукатурка стен, 5 этаж, офисы 501–504', '86 м²'],
        ['Монтаж перегородок ГКЛ, 6 этаж', '34 м²'],
        ['Укладка плитки в санузлах 4 этажа', '22 м²'],
      ],
      '',
      'Шпаклёвка стен 5 этажа, грунтовка под покраску.',
      'submitted',
    );
    report(
      brigade2,
      foreman2,
      d1,
      [
        ['Грунтовка стен, 5 этаж', '210 м²'],
        ['Прокладка кабеля в гофре, 6 этаж', '180 м'],
      ],
      'Задержка поставки плитки на полдня.',
      'Штукатурка стен в офисах 501–504.',
      'accepted',
    );

    // --- Объявления
    const announce = (
      authorId: number,
      brigadeId: number | null,
      title: string,
      body: string,
      priority: 'normal' | 'important' | 'urgent',
      flags: { pinned?: boolean; ack?: boolean },
      createdAt: string,
      readBy: number[] = [],
    ) => {
      const id = run(
        db,
        `INSERT INTO announcements (author_id, brigade_id, title, body, priority, pinned, require_ack, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        authorId,
        brigadeId,
        title,
        body,
        priority,
        flags.pinned ? 1 : 0,
        flags.ack ? 1 : 0,
        createdAt,
      );
      for (const userId of readBy) {
        run(db, 'INSERT INTO announcement_reads (announcement_id, user_id, read_at) VALUES (?, ?, ?)', id, userId, createdAt);
      }
    };
    announce(
      manager,
      null,
      'В четверг проверка технадзора',
      'С 10:00 на обоих объектах работает комиссия. Всем быть в касках и жилетах, на высоте — со страховочной привязью. Удостоверения держать при себе. Рабочие места привести в порядок до конца смены в среду.',
      'urgent',
      { pinned: true, ack: true },
      at(today, '07:30'),
      [foreman2, workers1[0], workers1[2], workers2[0], workers2[1], workers2[4]],
    );
    announce(
      foreman1,
      brigade1,
      'Завтра бетонирование с 7:00',
      'Миксеры приходят к 7:00, сбор в 6:40 у бытовки. Опалубку и арматуру сдаём сегодня до 17:00. Вибраторы проверить с вечера.',
      'important',
      { ack: true },
      at(today, '08:05'),
      [workers1[0], workers1[1], workers1[3]],
    );
    announce(
      foreman1,
      brigade1,
      'Зимняя спецодежда',
      'Комплекты выдают на складе до пятницы, с 8:00 до 12:00. Размеры сверьте у меня заранее.',
      'normal',
      {},
      at(d1, '12:20'),
      workers1.slice(0, 6),
    );
    announce(
      engineer,
      null,
      'Аванс — 15 числа',
      'Табели за первую половину месяца закрываем 14-го вечером. Бригадиры, проверьте отметки за все дни.',
      'normal',
      {},
      at(d2, '16:00'),
      [foreman1, foreman2, ...workers1.slice(0, 5), ...workers2.slice(0, 3)],
    );
    announce(
      foreman2,
      brigade2,
      'Пропуска в бизнес-центр',
      'Охрана с понедельника пускает только по новым пропускам. Кто не получил — подойдите ко мне до обеда.',
      'important',
      { ack: true },
      at(d1, '09:10'),
      workers2.slice(0, 4),
    );

    // --- Задачи
    const task = (
      brigadeId: number,
      creatorId: number,
      title: string,
      description: string,
      assigneeId: number | null,
      priority: 'low' | 'normal' | 'high',
      status: 'todo' | 'in_progress' | 'done',
      dueDate: string | null,
    ) =>
      run(
        db,
        `INSERT INTO tasks (brigade_id, title, description, assignee_id, creator_id, priority, status, due_date, created_at, done_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        brigadeId,
        title,
        description,
        assigneeId,
        creatorId,
        priority,
        status,
        dueDate,
        at(d1, '08:30'),
        status === 'done' ? at(today, '09:15') : null,
      );
    task(brigade1, foreman1, 'Установить опалубку перекрытия, оси 3–5', 'Щиты взять со склада №2, стойки — через 1,2 м. После монтажа позвать меня на приёмку.', workers1[2], 'high', 'in_progress', today);
    task(brigade1, foreman1, 'Связать арматуру колонн 4 этажа', 'По проекту КЖ-4, лист 12. Шаг хомутов 150 мм.', workers1[0], 'normal', 'todo', addDays(today, 1));
    task(brigade1, foreman1, 'Убрать строительный мусор с 3 этажа', 'Мусор — в контейнер у ворот, доски сложить отдельно.', null, 'normal', 'todo', addDays(today, -1));
    task(brigade1, manager, 'Принять арматуру А500С и сверить накладную', 'Машина придёт до обеда. Расхождения сразу сообщить мне.', foreman1, 'high', 'todo', today);
    task(brigade1, foreman1, 'Проверить стропы и крюки перед сменой', '', workers1[7], 'normal', 'done', today);
    task(brigade1, foreman1, 'Подготовить вибраторы к бетонированию', 'Проверить два глубинных вибратора и удлинители.', workers1[1], 'normal', 'todo', today);
    task(brigade2, foreman2, 'Зашпаклевать стены в офисах 501–502', 'Финишный слой под покраску.', workers2[1], 'normal', 'in_progress', addDays(today, 1));
    task(brigade2, foreman2, 'Проложить кабель по 6 этажу', 'По схеме ЭО-6, с маркировкой линий.', workers2[3], 'high', 'todo', addDays(today, 2));
    task(brigade2, manager, 'Сдать скрытые работы по электрике 5 этажа', 'Акты подготовить к приходу технадзора.', foreman2, 'high', 'todo', addDays(today, 1));

    // --- Заявки
    const request = (
      brigadeId: number,
      authorId: number,
      kind: 'material' | 'tool' | 'other',
      title: string,
      qty: string,
      urgent: boolean,
      neededBy: string | null,
      note: string,
      status: 'new' | 'approved' | 'rejected' | 'delivered',
      comment = '',
    ) =>
      run(
        db,
        `INSERT INTO requests (brigade_id, author_id, kind, title, qty, urgent, needed_by, note, status, resolution_comment, resolved_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        brigadeId,
        authorId,
        kind,
        title,
        qty,
        urgent ? 1 : 0,
        neededBy,
        note,
        status,
        comment,
        status === 'new' ? null : manager,
        at(d1, '15:00'),
        at(today, '08:00'),
      );
    request(brigade1, foreman1, 'material', 'Фиксаторы защитного слоя «стульчик» 35 мм', '2000 шт', true, addDays(today, 1), 'Без них не сдадим армирование плиты.', 'new');
    request(brigade1, foreman1, 'material', 'Фанера ламинированная 18 мм', '40 листов', false, addDays(today, 3), 'Для опалубки перекрытия 5 этажа.', 'approved', 'Поставка в пятницу утром.');
    request(brigade1, foreman1, 'material', 'Диски отрезные по металлу 230 мм', '50 шт', false, null, '', 'delivered');
    request(brigade1, foreman1, 'tool', 'Перфоратор SDS-max', '1 шт', false, null, 'Наш перегревается.', 'rejected', 'Возьмите со склада №1, там есть свободный.');
    request(brigade2, foreman2, 'material', 'Шпаклёвка финишная, 20 кг', '30 мешков', false, addDays(today, 2), '', 'new');
    request(brigade2, foreman2, 'material', 'Грунтовка глубокого проникновения, 10 л', '12 канистр', false, addDays(today, 1), '', 'approved');

    return { manager, brigade1, brigade2, foreman1, foreman2, workers1, workers2 };
  });
}
