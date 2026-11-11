import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardCheck,
  FileText,

  House,
  LayoutGrid,
  ListChecks,
  Megaphone,
  Package,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { AppConfig, Me } from '../shared/types';
import { ApiFail, api, demoUser } from './lib/api';
import { SessionContext, useAnnouncements, useOverview, useSession } from './lib/data';
import { tg } from './lib/tg';
import Announcements from './pages/Announcements';
import Attendance from './pages/Attendance';
import Home from './pages/Home';
import Login from './pages/Login';
import More from './pages/More';
import ReportForm from './pages/ReportForm';
import Reports, { ReportView } from './pages/Reports';
import Requests from './pages/Requests';
import Tasks from './pages/Tasks';
import Team from './pages/Team';
import { Button, Logo, cx } from './ui';

export default function App() {
  const queryClient = useQueryClient();
  const [demoId, setDemoId] = useState(demoUser.get());
  const config = useQuery({ queryKey: ['config'], queryFn: () => api.get<AppConfig>('/config'), staleTime: Infinity });
  const isDemo = config.data?.mode === 'demo';
  const me = useQuery({
    queryKey: ['me', demoId],
    queryFn: () => api.get<Me>('/me'),
    enabled: !!config.data && (!isDemo || demoId !== null),
  });

  const switchUser = (id: number | null) => {
    demoUser.set(id);
    // Данные прошлого пользователя не должны достаться следующему.
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'config' });
    setDemoId(id);
  };

  if (config.isError) return <Notice title="Сервер недоступен" text={config.error.message} onRetry={() => void config.refetch()} />;
  if (!config.data) return <Splash />;

  const failure = me.error instanceof ApiFail ? me.error : null;
  if (isDemo && (demoId === null || failure?.status === 401)) return <Login onPick={switchUser} />;
  if (failure?.data.error === 'not_registered') {
    return (
      <Notice
        title="Вас ещё нет в команде"
        text={`Попросите начальника или бригадира прислать ссылку-приглашение и откройте приложение по ней. Ваш Telegram ID: ${failure.data.tgId ?? '—'}`}
      />
    );
  }
  if (failure?.status === 401) return <Notice title="Откройте через Telegram" text="Приложение работает внутри Telegram: запустите его кнопкой в чате с ботом." />;
  if (me.isError) return <Notice title="Не удалось войти" text={me.error.message} onRetry={() => void me.refetch()} />;
  if (!me.data) return <Splash />;

  return (
    <SessionContext.Provider value={{ me: me.data, config: config.data, logout: () => switchUser(null) }}>
      <Shell />
    </SessionContext.Provider>
  );
}

function Shell() {
  const { me } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const canReport = me.user.role !== 'worker';
  // Отчёт открывается на весь экран, без нижнего меню.
  const immersive = /^\/reports\/./.test(location.pathname);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    const backButton = tg()?.BackButton;
    if (!backButton) return;
    if (!immersive) {
      backButton.hide();
      return;
    }
    const goBack = () => navigate(-1);
    backButton.show();
    backButton.onClick(goBack);
    return () => backButton.offClick(goBack);
  }, [immersive, navigate]);

  return (
    <div
      className={cx(
        'mx-auto min-h-dvh max-w-[480px] bg-bg shadow-[0_0_80px_-30px_rgb(0_0_0/0.35)]',
        !immersive && 'pb-[calc(76px+env(safe-area-inset-bottom))]',
      )}
    >
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/team" element={<Team />} />
        <Route path="/more" element={<More />} />
        {canReport && (
          <>
            <Route path="/reports" element={<Reports />} />
            <Route path="/reports/new" element={<ReportForm />} />
            <Route path="/reports/:id" element={<ReportView />} />
            <Route path="/reports/:id/edit" element={<ReportForm />} />
            <Route path="/requests" element={<Requests />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!immersive && <TabBar />}
    </div>
  );
}

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

/** Нижнее меню своё для каждой роли: в нём то, чем человек пользуется каждый день. */
function useTabs(): Tab[] {
  const { me } = useSession();
  const role = me.user.role;
  const announcements = useAnnouncements();
  const overview = useOverview(role === 'manager');

  const home: Tab = { to: '/', label: 'Главная', icon: House };
  const attendance: Tab = { to: '/attendance', label: 'Табель', icon: ClipboardCheck };
  const more: Tab = { to: '/more', label: 'Ещё', icon: LayoutGrid };
  const news: Tab = {
    to: '/announcements',
    label: 'Объявления',
    icon: Megaphone,
    badge: announcements.data?.filter((a) => !a.read).length,
  };

  if (role === 'worker') return [home, { to: '/tasks', label: 'Задачи', icon: ListChecks }, attendance, news, more];
  if (role === 'foreman') return [home, attendance, { to: '/reports', label: 'Отчёты', icon: FileText }, news, more];
  return [
    home,
    attendance,
    { to: '/reports', label: 'Отчёты', icon: FileText, badge: overview.data?.pending.reportsToReview },
    { to: '/requests', label: 'Заявки', icon: Package, badge: overview.data?.pending.requestsNew },
    more,
  ];
}

function TabBar() {
  const tabs = useTabs();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="grid grid-cols-5">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.to === '/'} className="flex h-[68px] flex-col items-center justify-center gap-1">
            {({ isActive }) => (
              <>
                <span
                  className={cx(
                    'relative grid h-8 w-14 place-items-center rounded-full transition',
                    isActive ? 'bg-accent-soft text-accent' : 'text-faint',
                  )}
                >
                  <tab.icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                  {!!tab.badge && (
                    <span className="absolute -top-1 right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-bad px-1 text-[10px] font-extrabold text-white ring-2 ring-surface">
                      {tab.badge}
                    </span>
                  )}
                </span>
                <span className={cx('text-[11px] font-bold', isActive ? 'text-ink' : 'text-faint')}>{tab.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function Splash() {
  return (
    <div className="mx-auto grid min-h-dvh max-w-[480px] place-items-center bg-bg">
      <div className="animate-pulse">
        <Logo />
      </div>
    </div>
  );
}

function Notice({ title, text, onRetry }: { title: string; text: string; onRetry?: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center bg-bg px-8 text-center">
      <span className="grid size-18 place-items-center rounded-full bg-ink/6 text-muted">
        <ShieldAlert size={32} />
      </span>
      <h1 className="mt-5 text-2xl font-extrabold tracking-tight">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{text}</p>
      {onRetry && (
        <Button className="mt-6" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}
