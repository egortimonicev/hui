import { CalendarDays, Check, ListChecks, Pencil, Play, Plus, RotateCcw, Trash2, User, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Task, TaskPriority, TaskStatus } from '../../shared/types';
import { api } from '../lib/api';
import { useAct, useBrigades, useSession, useTasks, useUsers } from '../lib/data';
import { addDays, fmtDate } from '../lib/format';
import { confirmDialog } from '../lib/tg';
import {
  Badge,
  Button,
  Choice,
  Empty,
  Fab,
  Field,
  Input,
  Loadable,
  Page,
  PageHeader,
  Segmented,
  Select,
  Sheet,
  Textarea,
  cx,
} from '../ui';

const INVALIDATE = ['tasks'];

export default function Tasks() {
  const { me } = useSession();
  const query = useTasks();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [filter, setFilter] = useState<'active' | 'done'>('active');
  const canCreate = me.user.role !== 'worker';

  useEffect(() => {
    if (params.has('new')) setParams({}, { replace: true });
  }, [params, setParams]);

  return (
    <Page>
      <PageHeader title="Задачи" subtitle={me.user.role === 'worker' ? 'Мои и общие для бригады' : (me.brigade?.name ?? 'Все бригады')} />
      <Loadable query={query}>
        {(tasks) => {
          const active = tasks.filter((task) => task.status !== 'done');
          const list = filter === 'active' ? active : tasks.filter((task) => task.status === 'done');
          return (
            <>
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'active', label: 'Активные', count: active.length },
                  { value: 'done', label: 'Выполненные' },
                ]}
              />
              {list.length === 0 ? (
                <Empty
                  icon={ListChecks}
                  title={filter === 'active' ? 'Все задачи закрыты' : 'Выполненных пока нет'}
                  text={filter === 'active' ? 'Новые задачи появятся здесь.' : undefined}
                />
              ) : (
                <div className="mt-3 space-y-2.5">
                  {list.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              )}
            </>
          );
        }}
      </Loadable>
      {canCreate && <Fab icon={Plus} label="Задача" onClick={() => setCreating(true)} />}
      {creating && <TaskForm onClose={() => setCreating(false)} />}
    </Page>
  );
}

function DueBadge({ task }: { task: Task }) {
  const { me } = useSession();
  if (!task.dueDate) return null;
  const label = fmtDate(task.dueDate, me.today);
  if (task.status === 'done') return <Badge>{label}</Badge>;
  if (task.dueDate < me.today) return <Badge tone="bad">Просрочено · {label.toLowerCase()}</Badge>;
  return <Badge tone={task.dueDate === me.today ? 'warn' : 'neutral'}>{label}</Badge>;
}

export function TaskCard({ task }: { task: Task }) {
  const { me } = useSession();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const setStatus = useAct((status: TaskStatus) => api.patch(`/tasks/${task.id}`, { status }), {
    invalidate: INVALIDATE,
    onSuccess: () => setOpen(false),
  });
  const remove = useAct(() => api.del(`/tasks/${task.id}`), {
    invalidate: INVALIDATE,
    done: 'Задача удалена',
    onSuccess: () => setOpen(false),
  });
  const done = task.status === 'done';
  const showBrigade = me.user.role === 'manager';

  return (
    <div className="flex items-start gap-3 rounded-3xl bg-surface p-4 shadow-card">
      <button
        type="button"
        aria-label={done ? `Вернуть в работу: ${task.title}` : `Выполнено: ${task.title}`}
        disabled={!task.canProgress || setStatus.isPending}
        onClick={() => setStatus.mutate(done ? 'todo' : 'done')}
        className={cx(
          'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 transition',
          done ? 'border-ok bg-ok text-white' : task.status === 'in_progress' ? 'border-accent' : 'border-faint/60',
        )}
      >
        {done ? <Check size={16} strokeWidth={3} /> : task.status === 'in_progress' && <span className="size-2.5 rounded-full bg-accent" />}
      </button>
      <button type="button" onClick={() => setOpen(true)} className="min-w-0 flex-1 text-left">
        <p className={cx('text-[15px] leading-snug font-bold', done && 'text-muted line-through')}>{task.title}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <DueBadge task={task} />
          {task.priority === 'high' && !done && <Badge tone="bad">Важно</Badge>}
          {task.status === 'in_progress' && <Badge tone="accent">В работе</Badge>}
          <span className="text-[13px] font-semibold text-muted">
            {task.assigneeId === me.user.id ? 'Мне' : (task.assigneeName ?? 'Вся бригада')}
            {showBrigade && ` · ${task.brigadeName}`}
          </span>
        </div>
      </button>

      {open && (
        <Sheet
          open
          onClose={() => setOpen(false)}
          title="Задача"
          footer={
            task.canProgress && (
              <>
                {task.status === 'todo' && (
                  <Button variant="soft" className="flex-1" onClick={() => setStatus.mutate('in_progress')}>
                    <Play size={17} /> В работу
                  </Button>
                )}
                {done ? (
                  <Button variant="soft" className="flex-1" onClick={() => setStatus.mutate('todo')}>
                    <RotateCcw size={17} /> Вернуть в работу
                  </Button>
                ) : (
                  <Button variant="ok" className="flex-1" onClick={() => setStatus.mutate('done')}>
                    <Check size={19} strokeWidth={2.6} /> Готово
                  </Button>
                )}
              </>
            )
          }
        >
          <p className="text-[19px] leading-snug font-extrabold tracking-tight">{task.title}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <DueBadge task={task} />
            {task.priority === 'high' && <Badge tone="bad">Важно</Badge>}
            {task.priority === 'low' && <Badge>Не срочно</Badge>}
            <Badge tone={done ? 'ok' : task.status === 'in_progress' ? 'accent' : 'neutral'}>
              {done ? 'Выполнена' : task.status === 'in_progress' ? 'В работе' : 'Новая'}
            </Badge>
          </div>
          {task.description && <p className="mt-4 text-[15px] leading-relaxed whitespace-pre-line text-ink/80">{task.description}</p>}
          <dl className="mt-4 space-y-2.5 rounded-2xl bg-surface-2 p-4 text-[14px]">
            <Row icon={task.assigneeId ? User : Users} label="Исполнитель" value={task.assigneeName ?? 'Вся бригада'} />
            <Row icon={CalendarDays} label="Срок" value={task.dueDate ? fmtDate(task.dueDate, me.today) : 'Без срока'} />
            <Row icon={User} label="Поставил" value={`${task.creatorName} · ${task.brigadeName}`} />
          </dl>
          {task.canManage && (
            <div className="mt-3 mb-4 flex gap-2.5">
              <Button
                small
                variant="soft"
                className="flex-1"
                onClick={() => {
                  setOpen(false);
                  setEditing(true);
                }}
              >
                <Pencil size={16} /> Изменить
              </Button>
              <Button
                small
                variant="danger"
                aria-label="Удалить задачу"
                onClick={async () => (await confirmDialog('Удалить задачу?')) && remove.mutate()}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          )}
        </Sheet>
      )}
      {editing && <TaskForm task={task} onClose={() => setEditing(false)} />}
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon size={17} className="shrink-0 text-faint" />
      <dt className="text-muted">{label}</dt>
      <dd className="ml-auto min-w-0 truncate font-bold">{value}</dd>
    </div>
  );
}

function TaskForm({ task, onClose }: { task?: Task; onClose: () => void }) {
  const { me } = useSession();
  const isManager = me.user.role === 'manager';
  const brigades = useBrigades();
  const users = useUsers();
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [picked, setPicked] = useState<number | null>(task?.brigadeId ?? null);
  const [assigneeId, setAssigneeId] = useState<number | null>(task?.assigneeId ?? null);
  const [dueDate, setDueDate] = useState<string | null>(task ? task.dueDate : me.today);
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'normal');

  const brigadeId = isManager ? (picked ?? brigades.data?.[0]?.id ?? null) : me.user.brigadeId;
  const members = users.data?.filter((user) => user.brigadeId === brigadeId) ?? [];
  const save = useAct(
    () => {
      const body = { title, description, assigneeId, brigadeId: brigadeId ?? undefined, dueDate, priority };
      return task ? api.put(`/tasks/${task.id}`, body) : api.post('/tasks', body);
    },
    { invalidate: INVALIDATE, done: task ? 'Задача обновлена' : 'Задача поставлена', onSuccess: onClose },
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={task ? 'Правка задачи' : 'Новая задача'}
      footer={
        <Button className="flex-1" disabled={title.trim().length < 2 || !brigadeId || save.isPending} onClick={() => save.mutate()}>
          {task ? 'Сохранить' : 'Поставить задачу'}
        </Button>
      }
    >
      <Field label="Что сделать">
        <Input value={title} maxLength={160} placeholder="Например: убрать мусор с 3 этажа" onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Подробности">
        <Textarea value={description} maxLength={2000} placeholder="Где, чем, на что обратить внимание" onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {isManager && !task && (
        <Field label="Бригада">
          <Select
            value={brigadeId ?? ''}
            onChange={(e) => {
              setPicked(Number(e.target.value));
              setAssigneeId(null);
            }}
          >
            {brigades.data?.map((brigade) => (
              <option key={brigade.id} value={brigade.id}>
                {brigade.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Исполнитель">
        <Select value={assigneeId ?? ''} onChange={(e) => setAssigneeId(Number(e.target.value) || null)}>
          <option value="">Вся бригада</option>
          {members.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
              {user.position ? ` — ${user.position}` : ''}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Срок">
        <div className="mb-2">
          <Choice
            value={dueDate}
            onChange={setDueDate}
            options={[
              { value: me.today, label: 'Сегодня' },
              { value: addDays(me.today, 1), label: 'Завтра' },
              { value: null, label: 'Без срока' },
            ]}
          />
        </div>
        <Input type="date" value={dueDate ?? ''} onChange={(e) => setDueDate(e.target.value || null)} />
      </Field>
      <Field label="Приоритет">
        <Choice
          value={priority}
          onChange={setPriority}
          options={[
            { value: 'low', label: 'Не срочно' },
            { value: 'normal', label: 'Обычный' },
            { value: 'high', label: 'Важно', tone: 'bad' },
          ]}
        />
      </Field>
    </Sheet>
  );
}
