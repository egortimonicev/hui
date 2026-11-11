import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarOff,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  Minus,
  Plus,
  Thermometer,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AttendanceCell, AttendanceDay, AttendanceRow, AttendanceStatus } from '../../shared/types';
import { api } from '../lib/api';
import { attendanceKey, useAttendanceDay, useAttendanceMonth, useBrigades, useSession } from '../lib/data';
import {
  DEFAULT_HOURS,
  STATUS_META,
  STATUS_ORDER,
  addDays,
  addMonths,
  countStatuses,
  fmtDate,
  fmtDayMonth,
  fmtHours,
  fmtMonth,
  fmtWeekday,
  fmtWeekdayShort,
  parseDate,
  shortName,
} from '../lib/format';
import { haptic } from '../lib/tg';
import { Avatar, Badge, Button, Card, Empty, Field, Input, Loadable, Page, PageHeader, Segmented, Sheet, Skeleton, cx, toast } from '../ui';

interface Mark {
  userId: number;
  status: AttendanceStatus | null;
  hours?: number;
  note?: string;
}

const STATUS_ICON: Record<AttendanceStatus, LucideIcon> = {
  present: Check,
  late: Clock,
  absent: X,
  sick: Thermometer,
  dayoff: CalendarOff,
};

const QUICK: AttendanceStatus[] = ['present', 'late', 'absent'];
const SAVE_KEY = ['attendance-save'];

export default function Attendance() {
  const { me } = useSession();
  return me.user.role === 'worker' ? <MyAttendance /> : <BrigadeAttendance />;
}

/** Доля статусов одной полосой: видно состав смены с одного взгляда. */
export function StatusBar({
  counts,
  total,
  className,
}: {
  counts: Record<AttendanceStatus, number>;
  total: number;
  className?: string;
}) {
  return (
    <div className={cx('flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-ink/8', className)}>
      {STATUS_ORDER.map(
        (status) =>
          counts[status] > 0 && (
            <span key={status} className={STATUS_META[status].bar} style={{ width: `${(counts[status] / total) * 100}%` }} />
          ),
      )}
    </div>
  );
}

function RoundButton({ icon: Icon, label, disabled, onClick }: { icon: LucideIcon; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full bg-surface shadow-card disabled:opacity-35"
    >
      <Icon size={18} />
    </button>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 px-1">
      {STATUS_ORDER.map((status) => (
        <span key={status} className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
          <span className={cx('grid size-5 place-items-center rounded-md text-[10px] font-extrabold', STATUS_META[status].soft)}>
            {STATUS_META[status].letter || (status === 'present' ? '8' : '7')}
          </span>
          {STATUS_META[status].label}
        </span>
      ))}
    </div>
  );
}

// ---------- Бригадир и начальник

function BrigadeAttendance() {
  const { me } = useSession();
  const isManager = me.user.role === 'manager';
  const brigades = useBrigades();
  const [params] = useSearchParams();
  const [picked, setPicked] = useState<number | null>(Number(params.get('brigade')) || null);
  const [view, setView] = useState<'day' | 'month'>('day');
  const brigadeId = isManager ? (picked ?? brigades.data?.[0]?.id ?? null) : me.user.brigadeId;
  const brigade = brigades.data?.find((b) => b.id === brigadeId);

  return (
    <Page>
      <PageHeader title="Табель" subtitle={brigade ? `${brigade.name} · ${brigade.site}` : undefined} />
      {isManager && (brigades.data?.length ?? 0) > 1 && (
        <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
          {brigades.data!.map((b) => (
            <button
              key={b.id}
              type="button"
              aria-pressed={b.id === brigadeId}
              onClick={() => setPicked(b.id)}
              className={cx(
                'h-10 shrink-0 rounded-full px-4 text-sm font-bold transition',
                b.id === brigadeId ? 'bg-ink text-bg' : 'bg-surface text-muted shadow-card',
              )}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'day', label: 'День' },
          { value: 'month', label: 'Месяц' },
        ]}
      />
      {brigadeId === null ? (
        brigades.isLoading ? (
          <div className="mt-4">
            <Skeleton />
          </div>
        ) : (
          <Empty icon={Users} title="Нет бригады" text="Табель появится, когда вас добавят в бригаду." />
        )
      ) : view === 'day' ? (
        <DayView key={brigadeId} brigadeId={brigadeId} />
      ) : (
        <MonthView brigadeId={brigadeId} />
      )}
    </Page>
  );
}

function DayView({ brigadeId }: { brigadeId: number }) {
  const { me } = useSession();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(me.today);
  const [openId, setOpenId] = useState<number | null>(null);
  const query = useAttendanceDay(brigadeId, date);
  const key = attendanceKey(brigadeId, date);

  // Отметка появляется мгновенно и сохраняется в фоне: бригадир не ждёт сеть на каждом человеке.
  const save = useMutation({
    mutationKey: SAVE_KEY,
    mutationFn: (marks: Mark[]) => api.put('/attendance', { date, brigadeId, items: marks }),
    onMutate: async (marks) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<AttendanceDay>(key);
      if (previous) {
        const byUser = new Map(marks.map((mark) => [mark.userId, mark]));
        queryClient.setQueryData<AttendanceDay>(key, {
          ...previous,
          rows: previous.rows.map((row) => {
            const mark = byUser.get(row.userId);
            if (!mark) return row;
            if (mark.status === null) return { ...row, status: null, hours: null, note: '' };
            return { ...row, status: mark.status, hours: mark.hours ?? DEFAULT_HOURS[mark.status], note: mark.note ?? row.note };
          }),
        });
      }
      return { previous };
    },
    onError: (error, _marks, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast(error.message, 'error');
    },
    onSettled: () => {
      // Пока в очереди есть другие сохранения, сервер ещё не знает о них — перечитываем после последнего.
      if (queryClient.isMutating({ mutationKey: SAVE_KEY }) > 1) return;
      for (const name of ['attendance', 'attendance-month', 'overview', 'reports']) {
        void queryClient.invalidateQueries({ queryKey: [name] });
      }
    },
  });

  const mark = (marks: Mark[]) => {
    haptic();
    save.mutate(marks);
  };
  const monday = addDays(date, -((parseDate(date).getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const openRow = query.data?.rows.find((row) => row.userId === openId);

  return (
    <>
      <div className="mt-4 mb-2.5 flex items-center justify-between px-1">
        <p className="text-[17px] font-extrabold tracking-tight">
          {fmtDate(date, me.today)}
          <span className="font-semibold text-muted">
            {' · '}
            {fmtDate(date, me.today) === fmtDayMonth(date) ? fmtWeekday(date) : fmtDayMonth(date)}
          </span>
        </p>
        <div className="flex gap-1.5">
          <RoundButton icon={ChevronLeft} label="Предыдущая неделя" onClick={() => setDate(addDays(date, -7))} />
          <RoundButton
            icon={ChevronRight}
            label="Следующая неделя"
            disabled={addDays(monday, 7) > me.today}
            onClick={() => setDate(addDays(date, 7) > me.today ? me.today : addDays(date, 7))}
          />
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {week.map((day) => (
          <button
            key={day}
            type="button"
            aria-pressed={day === date}
            aria-label={fmtDayMonth(day)}
            disabled={day > me.today}
            onClick={() => setDate(day)}
            className={cx(
              'flex h-15 flex-col items-center justify-center rounded-2xl transition disabled:opacity-35',
              day === date ? 'bg-ink text-bg' : 'bg-surface text-muted shadow-card',
              day === me.today && day !== date && 'ring-2 ring-accent/60',
            )}
          >
            <span className="text-[11px] font-bold uppercase">{fmtWeekdayShort(day)}</span>
            <span className={cx('text-[17px] leading-5 font-extrabold', day !== date && 'text-ink')}>{parseDate(day).getDate()}</span>
          </button>
        ))}
      </div>

      <div className="mt-3">
        <Loadable query={query} rows={4}>
          {(day) => {
            const stats = countStatuses(day.rows);
            const unmarked = day.rows.filter((row) => !row.status);
            return (
              <>
                <Card>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[17px] font-extrabold tracking-tight">
                      {stats.onSite} из {stats.total} на объекте
                    </p>
                    {stats.unmarked > 0 ? (
                      <span className="text-[13px] font-bold text-accent">не отмечены: {stats.unmarked}</span>
                    ) : (
                      <span className="flex items-center gap-1 text-[13px] font-bold text-ok">
                        <CheckCheck size={16} /> все отмечены
                      </span>
                    )}
                  </div>
                  <StatusBar className="mt-3" counts={stats.counts} total={stats.total} />
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    {STATUS_ORDER.filter((status) => stats.counts[status] > 0).map((status) => (
                      <span key={status} className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
                        <span className={cx('size-2 rounded-full', STATUS_META[status].bar)} />
                        {STATUS_META[status].many} {stats.counts[status]}
                      </span>
                    ))}
                  </div>
                </Card>

                {!day.editable && (
                  <p className="mt-3 flex items-center gap-2.5 rounded-2xl bg-ink/6 px-4 py-3 text-[13px] font-semibold text-muted">
                    <Lock size={16} className="shrink-0" />
                    День закрыт: бригадир правит табель за сегодня и три предыдущих дня. Исправить может начальник.
                  </p>
                )}
                {day.editable && unmarked.length > 0 && (
                  <Button
                    variant="dark"
                    className="mt-3 w-full"
                    onClick={() => mark(unmarked.map((row) => ({ userId: row.userId, status: 'present' })))}
                  >
                    <CheckCheck size={19} />
                    {unmarked.length === day.rows.length ? 'Все на месте' : `Остальные на месте · ${unmarked.length}`}
                  </Button>
                )}

                <div className="mt-3 divide-y divide-line overflow-hidden rounded-3xl bg-surface shadow-card">
                  {day.rows.map((row) => (
                    <PersonRow
                      key={row.userId}
                      row={row}
                      editable={day.editable}
                      onOpen={() => setOpenId(row.userId)}
                      onQuick={(status) => mark([{ userId: row.userId, status: row.status === status ? null : status }])}
                    />
                  ))}
                </div>
                {day.editable && (
                  <p className="mt-3 px-1 text-[12px] text-faint">
                    Нажмите на человека, чтобы указать часы, больничный, отгул или комментарий.
                  </p>
                )}
              </>
            );
          }}
        </Loadable>
      </div>

      {openRow && (
        <MarkSheet
          key={openRow.userId}
          row={openRow}
          editable={query.data!.editable}
          onClose={() => setOpenId(null)}
          onSave={(next) => {
            mark([next]);
            setOpenId(null);
          }}
        />
      )}
    </>
  );
}

function PersonRow({
  row,
  editable,
  onOpen,
  onQuick,
}: {
  row: AttendanceRow;
  editable: boolean;
  onOpen: () => void;
  onQuick: (status: AttendanceStatus) => void;
}) {
  const details = [row.position, row.status && row.hours ? fmtHours(row.hours) : null, row.note || null].filter(Boolean);
  const special = row.status === 'sick' || row.status === 'dayoff';
  return (
    <div className="flex items-center gap-2 py-2.5 pr-3 pl-4">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="max-[380px]:hidden">
          <Avatar id={row.userId} name={row.name} size={38} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-bold">{row.name}</span>
          <span className="block truncate text-[13px] text-muted">{details.join(' · ')}</span>
        </span>
      </button>
      {special ? (
        <button type="button" onClick={onOpen}>
          <Badge tone={STATUS_META[row.status!].tone} className="h-8! px-3! text-[13px]!">
            {STATUS_META[row.status!].label}
          </Badge>
        </button>
      ) : (
        <div className="flex shrink-0 gap-1.5">
          {QUICK.map((status) => {
            const Icon = STATUS_ICON[status];
            const active = row.status === status;
            return (
              <button
                key={status}
                type="button"
                aria-label={`${STATUS_META[status].label}: ${row.name}`}
                aria-pressed={active}
                disabled={!editable}
                onClick={() => onQuick(status)}
                className={cx(
                  'grid size-10 place-items-center rounded-full transition active:scale-90',
                  active ? STATUS_META[status].solid : 'bg-ink/6 text-faint',
                  !editable && !active && 'opacity-40',
                )}
              >
                <Icon size={19} strokeWidth={2.6} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MarkSheet({
  row,
  editable,
  onClose,
  onSave,
}: {
  row: AttendanceRow;
  editable: boolean;
  onClose: () => void;
  onSave: (mark: Mark) => void;
}) {
  const [status, setStatus] = useState(row.status);
  const [hours, setHours] = useState(row.hours ?? DEFAULT_HOURS.present);
  const [note, setNote] = useState(row.note);
  const worked = status === 'present' || status === 'late';

  return (
    <Sheet
      open
      onClose={onClose}
      title={row.name}
      footer={
        editable && (
          <>
            <Button variant="soft" disabled={!row.status} onClick={() => onSave({ userId: row.userId, status: null })}>
              Сбросить
            </Button>
            <Button
              className="flex-1"
              disabled={!status}
              onClick={() => onSave({ userId: row.userId, status, hours: worked ? hours : 0, note })}
            >
              Сохранить
            </Button>
          </>
        )
      }
    >
      <p className="mb-4 text-sm text-muted">{row.position}</p>
      <div className="grid grid-cols-2 gap-2">
        {STATUS_ORDER.map((option) => {
          const Icon = STATUS_ICON[option];
          return (
            <button
              key={option}
              type="button"
              aria-pressed={status === option}
              disabled={!editable}
              onClick={() => {
                setStatus(option);
                setHours(DEFAULT_HOURS[option]);
              }}
              className={cx(
                'flex h-14 items-center gap-2.5 rounded-2xl px-4 text-[15px] font-bold transition',
                status === option ? STATUS_META[option].solid : 'bg-surface-2 text-ink',
                option === 'present' && 'col-span-2',
              )}
            >
              <Icon size={20} strokeWidth={2.4} />
              {STATUS_META[option].label}
            </button>
          );
        })}
      </div>

      {worked && (
        <div className="mt-5">
          <p className="mb-2 text-[13px] font-bold text-muted">Отработано</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Меньше часов"
              disabled={!editable || hours <= 0}
              onClick={() => setHours(Math.max(0, hours - 0.5))}
              className="grid size-13 place-items-center rounded-2xl bg-surface-2 disabled:opacity-40"
            >
              <Minus size={22} />
            </button>
            <p className="flex-1 text-center text-[32px] font-extrabold tabular-nums">{fmtHours(hours)}</p>
            <button
              type="button"
              aria-label="Больше часов"
              disabled={!editable || hours >= 24}
              onClick={() => setHours(Math.min(24, hours + 0.5))}
              className="grid size-13 place-items-center rounded-2xl bg-surface-2 disabled:opacity-40"
            >
              <Plus size={22} />
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            {[4, 6, 8, 10, 12].map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={!editable}
                onClick={() => setHours(preset)}
                className={cx(
                  'h-10 flex-1 rounded-xl text-sm font-bold transition',
                  hours === preset ? 'bg-ink text-bg' : 'bg-surface-2 text-muted',
                )}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5">
        <Field label="Комментарий">
          <Input
            value={note}
            maxLength={300}
            disabled={!editable}
            placeholder="Например: отпросился к врачу"
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </div>
    </Sheet>
  );
}

// ---------- Месяц

function MonthNav({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const { me } = useSession();
  return (
    <div className="mt-4 mb-3 flex items-center justify-between px-1">
      <RoundButton icon={ChevronLeft} label="Предыдущий месяц" onClick={() => onChange(addMonths(month, -1))} />
      <p className="text-[17px] font-extrabold tracking-tight">{fmtMonth(month)}</p>
      <RoundButton
        icon={ChevronRight}
        label="Следующий месяц"
        disabled={month >= me.today.slice(0, 7)}
        onClick={() => onChange(addMonths(month, 1))}
      />
    </div>
  );
}

function MonthCell({ cell }: { cell?: AttendanceCell }) {
  if (!cell) return <span className="mx-auto block size-1 rounded-full bg-line" />;
  const meta = STATUS_META[cell.status];
  return (
    <span className={cx('mx-auto grid size-7 place-items-center rounded-lg text-[11px] font-extrabold', meta.soft)}>
      {meta.letter || String(cell.hours).replace('.', ',')}
    </span>
  );
}

function MonthView({ brigadeId }: { brigadeId: number }) {
  const { me } = useSession();
  const [month, setMonth] = useState(me.today.slice(0, 7));
  const query = useAttendanceMonth(brigadeId, month);
  const todayRef = useRef<HTMLTableCellElement>(null);

  // Таблица широкая — сразу прокручиваем к сегодняшнему дню.
  useEffect(() => {
    todayRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [query.data]);

  return (
    <>
      <MonthNav month={month} onChange={setMonth} />
      <Loadable query={query}>
        {(data) => {
          const totalHours = data.rows.reduce((sum, row) => sum + row.hours, 0);
          const totalShifts = data.rows.reduce((sum, row) => sum + row.shifts, 0);
          return (
            <>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <Stat value={String(totalShifts)} label="человеко-смен" />
                <Stat value={fmtHours(totalHours)} label="отработано бригадой" />
              </div>
              <div className="no-scrollbar overflow-x-auto rounded-3xl bg-surface shadow-card">
                <table className="border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 min-w-[128px] border-r border-line bg-surface py-3 pr-2 pl-4 text-left text-[12px] font-bold text-muted">
                        Сотрудник
                      </th>
                      {data.days.map((day) => {
                        const weekday = parseDate(day).getDay();
                        return (
                          <th
                            key={day}
                            ref={day === me.today ? todayRef : undefined}
                            className={cx(
                              'min-w-8 px-0.5 py-3 text-center text-[12px] font-extrabold last:pr-3',
                              day === me.today ? 'text-accent' : weekday === 0 ? 'text-bad' : 'text-muted',
                            )}
                          >
                            {parseDate(day).getDate()}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={row.userId}>
                        <td className="sticky left-0 z-10 border-t border-r border-line bg-surface py-2 pr-2 pl-4">
                          <p className="max-w-[112px] truncate text-[13px] font-bold">{shortName(row.name)}</p>
                          <p className="text-[11px] whitespace-nowrap text-muted">
                            {row.shifts} см · {fmtHours(row.hours)}
                          </p>
                        </td>
                        {data.days.map((day) => (
                          <td key={day} className="border-t border-line px-0.5 py-2 last:pr-3">
                            <MonthCell cell={row.cells[day]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Legend />
            </>
          );
        }}
      </Loadable>
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-surface px-3 py-3 shadow-card">
      <p className="text-[20px] leading-6 font-extrabold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] leading-tight font-semibold text-muted">{label}</p>
    </div>
  );
}

// ---------- Рабочий: личный календарь

function MyAttendance() {
  const { me } = useSession();
  const [month, setMonth] = useState(me.today.slice(0, 7));
  const query = useAttendanceMonth(null, month);

  return (
    <Page>
      <PageHeader title="Мой табель" subtitle={me.brigade?.name} />
      <MonthNav month={month} onChange={setMonth} />
      <Loadable query={query}>
        {(data) => {
          const row = data.rows[0];
          const cells = row?.cells ?? {};
          const count = (status: AttendanceStatus) => Object.values(cells).filter((cell) => cell.status === status).length;
          const offset = (parseDate(data.days[0]).getDay() + 6) % 7;
          return (
            <>
              <div className="grid grid-cols-4 gap-2">
                <Stat value={String(row?.shifts ?? 0)} label="смен" />
                <Stat value={fmtHours(row?.hours ?? 0)} label="часов" />
                <Stat value={String(count('late'))} label="опозданий" />
                <Stat value={String(count('absent'))} label="невыходов" />
              </div>
              <Card className="mt-3">
                <div className="grid grid-cols-7 gap-1.5 text-center">
                  {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((weekday) => (
                    <span key={weekday} className="pb-1 text-[11px] font-bold text-faint">
                      {weekday}
                    </span>
                  ))}
                  {Array.from({ length: offset }, (_, i) => (
                    <span key={`blank-${i}`} />
                  ))}
                  {data.days.map((day) => {
                    const cell = cells[day];
                    const meta = cell && STATUS_META[cell.status];
                    return (
                      <div
                        key={day}
                        title={meta?.label}
                        className={cx(
                          'flex aspect-square flex-col items-center justify-center rounded-xl',
                          meta ? meta.soft : 'bg-surface-2 text-faint',
                          day === me.today && 'ring-2 ring-accent',
                        )}
                      >
                        <span className="text-[15px] leading-4 font-extrabold">{parseDate(day).getDate()}</span>
                        <span className="h-3 text-[10px] leading-3 font-bold opacity-80">
                          {cell ? meta!.letter || fmtHours(cell.hours) : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
              <Legend />
            </>
          );
        }}
      </Loadable>
    </Page>
  );
}
