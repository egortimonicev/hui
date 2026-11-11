import {
  ArrowRight,
  CalendarOff,
  Check,
  ChevronRight,
  Clock,
  FileText,
  Hourglass,
  ListChecks,
  Megaphone,
  Package,
  Phone,
  Thermometer,
  Undo2,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AttendanceStatus } from '../../shared/types';
import {
  useAnnouncements,
  useAttendanceDay,
  useAttendanceMonth,
  useOverview,
  useReports,
  useRequests,
  useSession,
  useTasks,
  useUsers,
} from '../lib/data';
import {
  REPORT_STATUS,
  STATUS_META,
  STATUS_ORDER,
  countStatuses,
  firstName,
  fmtDayMonth,
  fmtHours,
  fmtMonth,
  fmtWeekday,
  plural,
} from '../lib/format';
import { Avatar, Badge, Card, IconTile, Page, SectionTitle, Skeleton, cx, type Tone } from '../ui';
import { AnnouncementCard } from './Announcements';
import { StatusBar } from './Attendance';
import { RequestCard } from './Requests';
import { TaskCard } from './Tasks';

export default function Home() {
  const { me } = useSession();
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';

  return (
    <Page>
      <header className="flex items-center gap-3 pt-5 pb-4">
        <Link to="/more" aria-label="Профиль">
          <Avatar id={me.user.id} name={me.user.name} size={48} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">{greeting},</p>
          <h1 className="truncate text-[22px] leading-7 font-extrabold tracking-tight">{firstName(me.user.name)}</h1>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold capitalize">{fmtWeekday(me.today)}</p>
          <p className="text-sm text-muted">{fmtDayMonth(me.today)}</p>
        </div>
      </header>
      {me.user.role === 'manager' ? <ManagerHome /> : me.user.role === 'foreman' ? <ForemanHome /> : <WorkerHome />}
    </Page>
  );
}

// ---------- Общие блоки

function Hero({ children }: { children: ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-[28px] bg-hero p-5 text-white shadow-card">
      <div className="pointer-events-none absolute -top-16 -right-12 size-48 rounded-full bg-accent/30 blur-3xl" />
      <div className="relative">{children}</div>
    </section>
  );
}

function Ring({ value, children }: { value: number; children: ReactNode }) {
  const radius = 40;
  const length = 2 * Math.PI * radius;
  return (
    <div className="relative size-24 shrink-0">
      <svg viewBox="0 0 96 96" className="size-full -rotate-90">
        <circle cx="48" cy="48" r={radius} fill="none" strokeWidth="9" className="stroke-white/12" />
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - Math.min(1, Math.max(0, value)))}
          className="stroke-accent transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

function RingValue({ value, total }: { value?: number; total?: number }) {
  return (
    <div>
      <p className="text-[26px] leading-7 font-extrabold tabular-nums">{value ?? '–'}</p>
      <p className="text-[11px] font-semibold text-white/55">из {total ?? '–'}</p>
    </div>
  );
}

function HeroChip({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <span className={cx('rounded-full px-2.5 py-1 text-[12px] font-bold', accent ? 'bg-accent/25 text-[#ffb489]' : 'bg-white/10 text-white/80')}>
      {children}
    </span>
  );
}

function AllLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-0.5 text-[13px] font-bold text-accent">
      {children} <ChevronRight size={16} />
    </Link>
  );
}

function QuickActions({ items }: { items: { to: string; label: string; icon: LucideIcon; tone: Tone }[] }) {
  return (
    <div className="mt-3 grid grid-cols-4 gap-2">
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className="flex flex-col items-center gap-2 rounded-3xl bg-surface px-1 py-3.5 shadow-card transition active:scale-95"
        >
          <IconTile icon={item.icon} tone={item.tone} />
          <span className="text-[12px] font-bold">{item.label}</span>
        </Link>
      ))}
    </div>
  );
}

/** Сначала то, что требует «Ознакомлен»; если такого нет — последнее объявление. */
function NewsBlock() {
  const { data } = useAnnouncements();
  if (!data?.length) return null;
  const mustAck = data.filter((item) => item.mustAck);
  const shown = mustAck.length ? mustAck.slice(0, 2) : data.slice(0, 1);
  return (
    <>
      <SectionTitle action={<AllLink to="/announcements">Все</AllLink>}>
        {mustAck.length ? 'Нужно ознакомиться' : 'Объявления'}
      </SectionTitle>
      <div className="space-y-3">
        {shown.map((item) => (
          <AnnouncementCard key={item.id} item={item} />
        ))}
      </div>
    </>
  );
}

function TasksBlock({ title }: { title: string }) {
  const { data } = useTasks();
  if (!data) return null;
  const active = data.filter((task) => task.status !== 'done');
  return (
    <>
      <SectionTitle action={<AllLink to="/tasks">Все · {active.length}</AllLink>}>{title}</SectionTitle>
      {active.length ? (
        <div className="space-y-2.5">
          {active.slice(0, 3).map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      ) : (
        <Card className="flex items-center gap-3 text-[14px] font-semibold text-muted">
          <IconTile icon={ListChecks} tone="ok" /> Активных задач нет
        </Card>
      )}
    </>
  );
}

// ---------- Бригадир

function ForemanHome() {
  const { me } = useSession();
  const day = useAttendanceDay(me.user.brigadeId, me.today);
  const reports = useReports();
  const requests = useRequests();
  const stats = day.data ? countStatuses(day.data.rows) : null;
  const todayReport = reports.data?.find((report) => report.date === me.today);
  const returned = reports.data?.filter((report) => report.status === 'returned') ?? [];
  const openRequests = requests.data?.filter((r) => r.status === 'new' || r.status === 'approved') ?? [];

  return (
    <>
      <Hero>
        <div className="flex items-center gap-4">
          <Ring value={stats?.total ? stats.onSite / stats.total : 0}>
            <RingValue value={stats?.onSite} total={stats?.total} />
          </Ring>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-white/55">{me.brigade?.name ?? 'Без бригады'} · смена сегодня</p>
            <p className="mt-0.5 text-[22px] leading-7 font-extrabold tracking-tight">
              {!stats ? 'Загрузка…' : stats.unmarked === stats.total ? 'Никто не отмечен' : `${stats.onSite} на объекте`}
            </p>
            <p className="mt-1 truncate text-[13px] text-white/55">{me.brigade?.site}</p>
          </div>
        </div>
        {stats && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {stats.unmarked > 0 && <HeroChip accent>Не отмечены {stats.unmarked}</HeroChip>}
            {STATUS_ORDER.filter((status) => status !== 'present' && stats.counts[status] > 0).map((status) => (
              <HeroChip key={status}>
                {STATUS_META[status].many} {stats.counts[status]}
              </HeroChip>
            ))}
          </div>
        )}
        <Link
          to="/attendance"
          className="mt-4 flex h-13 items-center justify-center gap-2 rounded-2xl bg-accent text-[15px] font-bold transition active:scale-[0.98]"
        >
          {stats?.unmarked ? 'Отметить бригаду' : 'Открыть табель'} <ArrowRight size={18} />
        </Link>
      </Hero>

      <Link
        to={todayReport ? `/reports/${todayReport.id}` : '/reports/new'}
        className="mt-3 flex items-center gap-3 rounded-3xl bg-surface p-4 shadow-card"
      >
        <IconTile icon={FileText} tone={todayReport ? REPORT_STATUS[todayReport.status].tone : 'accent'} />
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Отчёт за сегодня</span>
          <span className="block text-[13px] text-muted">
            {todayReport ? REPORT_STATUS[todayReport.status].label : 'Ещё не отправлен — займёт пару минут'}
          </span>
        </span>
        {todayReport ? (
          <ChevronRight size={20} className="text-faint" />
        ) : (
          <span className="rounded-xl bg-accent px-3.5 py-2 text-sm font-bold text-white">Написать</span>
        )}
      </Link>

      {returned.map((report) => (
        <Link key={report.id} to={`/reports/${report.id}`} className="mt-3 flex items-center gap-3 rounded-3xl bg-warn-soft p-4">
          <IconTile icon={Undo2} tone="warn" className="bg-surface!" />
          <span className="min-w-0 flex-1">
            <span className="block font-bold">Отчёт за {fmtDayMonth(report.date)} вернули</span>
            <span className="block truncate text-[13px] text-muted">{report.reviewComment}</span>
          </span>
          <ChevronRight size={20} className="text-warn" />
        </Link>
      ))}

      <QuickActions
        items={[
          { to: '/announcements?new=1', label: 'Объявление', icon: Megaphone, tone: 'accent' },
          { to: '/tasks?new=1', label: 'Задача', icon: ListChecks, tone: 'info' },
          { to: '/requests?new=1', label: 'Заявка', icon: Package, tone: 'violet' },
          { to: '/team', label: 'Команда', icon: Users, tone: 'ok' },
        ]}
      />

      <NewsBlock />
      <TasksBlock title="Задачи бригады" />

      {openRequests.length > 0 && (
        <>
          <SectionTitle action={<AllLink to="/requests">Все · {openRequests.length}</AllLink>}>Заявки в работе</SectionTitle>
          <div className="space-y-3">
            {openRequests.slice(0, 2).map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ---------- Начальник

function ManagerHome() {
  const overview = useOverview();
  const brigades = overview.data?.brigades ?? [];
  const total = brigades.reduce((sum, b) => sum + b.total, 0);
  const onSite = brigades.reduce((sum, b) => sum + b.counts.present + b.counts.late, 0);
  const reportsIn = brigades.filter((b) => b.reportId).length;
  const pending = overview.data?.pending;

  return (
    <>
      <Hero>
        <div className="flex items-center gap-4">
          <Ring value={total ? onSite / total : 0}>
            <RingValue value={overview.data && onSite} total={overview.data && total} />
          </Ring>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-white/55">На объектах сегодня</p>
            <p className="mt-0.5 text-[22px] leading-7 font-extrabold tracking-tight">
              {onSite} {plural(onSite, 'человек', 'человека', 'человек')}
            </p>
            <p className="mt-1 text-[13px] text-white/55">
              {brigades.length} {plural(brigades.length, 'бригада', 'бригады', 'бригад')} · отчётов за сегодня: {reportsIn}
            </p>
          </div>
        </div>
      </Hero>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <PendingTile to="/reports" icon={FileText} count={pending?.reportsToReview} label={['отчёт на проверке', 'отчёта на проверке', 'отчётов на проверке']} />
        <PendingTile to="/requests" icon={Package} count={pending?.requestsNew} label={['новая заявка', 'новые заявки', 'новых заявок']} />
      </div>

      <SectionTitle action={<AllLink to="/attendance">Табель</AllLink>}>Бригады</SectionTitle>
      {!overview.data ? (
        <Skeleton rows={2} />
      ) : (
        <div className="space-y-3">
          {brigades.map((brigade) => {
            const marked = STATUS_ORDER.reduce((sum, status) => sum + brigade.counts[status], 0);
            const brigadeOnSite = brigade.counts.present + brigade.counts.late;
            return (
              <Link key={brigade.id} to={`/attendance?brigade=${brigade.id}`} className="block rounded-3xl bg-surface p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[17px] font-extrabold tracking-tight">{brigade.name}</p>
                    <p className="truncate text-[13px] text-muted">{brigade.site}</p>
                  </div>
                  {brigade.reportStatus ? (
                    <Badge tone={REPORT_STATUS[brigade.reportStatus].tone}>Отчёт: {REPORT_STATUS[brigade.reportStatus].label.toLowerCase()}</Badge>
                  ) : (
                    <Badge>Отчёта нет</Badge>
                  )}
                </div>
                <div className="mt-3 flex items-baseline justify-between text-[13px] font-bold">
                  <span>
                    {brigadeOnSite} из {brigade.total} на объекте
                  </span>
                  {marked < brigade.total && <span className="text-accent">не отмечены: {brigade.total - marked}</span>}
                </div>
                <StatusBar className="mt-2" counts={brigade.counts} total={brigade.total} />
              </Link>
            );
          })}
        </div>
      )}

      <QuickActions
        items={[
          { to: '/announcements?new=1', label: 'Объявление', icon: Megaphone, tone: 'accent' },
          { to: '/tasks?new=1', label: 'Задача', icon: ListChecks, tone: 'info' },
          { to: '/announcements', label: 'Лента', icon: Megaphone, tone: 'violet' },
          { to: '/team', label: 'Команда', icon: Users, tone: 'ok' },
        ]}
      />

      <NewsBlock />
      <TasksBlock title="Задачи бригад" />
    </>
  );
}

function PendingTile({ to, icon, count, label }: { to: string; icon: LucideIcon; count?: number; label: [string, string, string] }) {
  const active = !!count;
  return (
    <Link to={to} className={cx('flex items-center gap-3 rounded-3xl p-4 shadow-card', active ? 'bg-accent-soft' : 'bg-surface')}>
      <IconTile icon={icon} tone={active ? 'accent' : 'neutral'} className={active ? 'bg-surface!' : undefined} />
      <span className="min-w-0">
        <span className="block text-[24px] leading-7 font-extrabold tabular-nums">{count ?? '–'}</span>
        <span className="block text-[12px] leading-tight font-semibold text-muted">{plural(count ?? 0, ...label)}</span>
      </span>
    </Link>
  );
}

// ---------- Рабочий

const MY_STATUS: Record<AttendanceStatus, { title: string; icon: LucideIcon }> = {
  present: { title: 'Вы на смене', icon: Check },
  late: { title: 'Отмечено опоздание', icon: Clock },
  absent: { title: 'Отмечен невыход', icon: X },
  sick: { title: 'Вы на больничном', icon: Thermometer },
  dayoff: { title: 'У вас отгул', icon: CalendarOff },
};

function WorkerHome() {
  const { me } = useSession();
  const month = me.today.slice(0, 7);
  const attendance = useAttendanceMonth(null, month);
  const users = useUsers();
  const row = attendance.data?.rows[0];
  const today = row?.cells[me.today];
  const status = today ? MY_STATUS[today.status] : null;
  const StatusIcon = status?.icon ?? Hourglass;
  const late = row ? Object.values(row.cells).filter((cell) => cell.status === 'late').length : 0;
  const foreman = users.data?.find((user) => user.role === 'foreman' && user.brigadeId === me.user.brigadeId);

  return (
    <>
      <Hero>
        <p className="truncate text-[13px] font-semibold text-white/55">
          {me.brigade ? `${me.brigade.name} · ${me.brigade.site}` : 'Вы пока не в бригаде'}
        </p>
        <div className="mt-3 flex items-center gap-3.5">
          <span className={cx('grid size-14 shrink-0 place-items-center rounded-2xl', today ? STATUS_META[today.status].solid : 'bg-white/10 text-white/70')}>
            <StatusIcon size={26} strokeWidth={2.4} />
          </span>
          <div className="min-w-0">
            <p className="text-[22px] leading-7 font-extrabold tracking-tight">{status?.title ?? 'Вас ещё не отметили'}</p>
            <p className="text-[13px] text-white/55">
              {today ? (today.hours > 0 ? `Сегодня в табеле: ${fmtHours(today.hours)}` : 'Сегодня без часов') : 'Бригадир отмечает смену в начале дня'}
            </p>
          </div>
        </div>
        <Link to="/attendance" className="mt-4 grid grid-cols-3 gap-2">
          {[
            [String(row?.shifts ?? '–'), 'смен'],
            [row ? fmtHours(row.hours) : '–', 'часов'],
            [String(row ? late : '–'), 'опозданий'],
          ].map(([value, label]) => (
            <span key={label} className="rounded-2xl bg-white/8 px-3 py-2.5">
              <span className="block text-[20px] leading-6 font-extrabold tabular-nums">{value}</span>
              <span className="block text-[11px] font-semibold text-white/55">{label}</span>
            </span>
          ))}
        </Link>
        <p className="mt-2 text-[11px] font-semibold text-white/40">{fmtMonth(month)} · нажмите, чтобы открыть табель</p>
      </Hero>

      {foreman && (
        <a href={`tel:${foreman.phone.replace(/[^+\d]/g, '')}`} className="mt-3 flex items-center gap-3 rounded-3xl bg-surface p-4 shadow-card">
          <Avatar id={foreman.id} name={foreman.name} />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] text-muted">Ваш бригадир</span>
            <span className="block truncate font-bold">{foreman.name}</span>
          </span>
          <span className="grid size-11 place-items-center rounded-full bg-ok-soft text-ok">
            <Phone size={20} />
          </span>
        </a>
      )}

      <NewsBlock />
      <TasksBlock title="Мои задачи" />
    </>
  );
}
