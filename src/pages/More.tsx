import { ChevronRight, ListChecks, LogOut, Megaphone, Package, Users, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../lib/data';
import { ROLE_LABEL } from '../lib/format';
import { getThemeMode, setThemeMode, type ThemeMode } from '../lib/theme';
import { Avatar, Badge, Button, Card, IconTile, Page, PageHeader, SectionTitle, Segmented, type Tone } from '../ui';

interface MenuItem {
  to: string;
  label: string;
  text: string;
  icon: LucideIcon;
  tone: Tone;
}

const TASKS: MenuItem = { to: '/tasks', label: 'Задачи', text: 'Поручения и сроки', icon: ListChecks, tone: 'info' };
const REQUESTS: MenuItem = { to: '/requests', label: 'Заявки', text: 'Материалы и инструмент', icon: Package, tone: 'violet' };
const NEWS: MenuItem = { to: '/announcements', label: 'Объявления', text: 'Важные сообщения', icon: Megaphone, tone: 'accent' };
const TEAM: MenuItem = { to: '/team', label: 'Команда', text: 'Люди, бригады, телефоны', icon: Users, tone: 'ok' };

/** Разделы, которым не хватило места в нижнем меню этой роли. */
const MENU = { worker: [TEAM], foreman: [TASKS, REQUESTS, TEAM], manager: [NEWS, TASKS, TEAM] };

export default function More() {
  const { me, config, logout } = useSession();
  const [theme, setTheme] = useState<ThemeMode>(getThemeMode());

  return (
    <Page>
      <PageHeader title="Ещё" />
      <Card className="flex items-center gap-4">
        <Avatar id={me.user.id} name={me.user.name} size={60} />
        <div className="min-w-0">
          <p className="truncate text-[19px] font-extrabold tracking-tight">{me.user.name}</p>
          <p className="truncate text-sm text-muted">{[me.user.position, me.user.phone].filter(Boolean).join(' · ')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="accent">{ROLE_LABEL[me.user.role]}</Badge>
            {me.brigade && <Badge>{me.brigade.name}</Badge>}
          </div>
        </div>
      </Card>

      <SectionTitle>Разделы</SectionTitle>
      <div className="divide-y divide-line overflow-hidden rounded-3xl bg-surface shadow-card">
        {MENU[me.user.role].map((item) => (
          <Link key={item.to} to={item.to} className="flex items-center gap-3 px-4 py-3 transition active:bg-ink/5">
            <IconTile icon={item.icon} tone={item.tone} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold">{item.label}</span>
              <span className="block text-[13px] text-muted">{item.text}</span>
            </span>
            <ChevronRight size={20} className="text-faint" />
          </Link>
        ))}
      </div>

      <SectionTitle>Оформление</SectionTitle>
      <Segmented
        value={theme}
        onChange={(mode) => {
          setTheme(mode);
          setThemeMode(mode);
        }}
        options={[
          { value: 'auto', label: 'Авто' },
          { value: 'light', label: 'Светлая' },
          { value: 'dark', label: 'Тёмная' },
        ]}
      />

      {config.mode === 'demo' && (
        <>
          <SectionTitle>Демо-режим</SectionTitle>
          <Card>
            <p className="text-[14px] leading-relaxed text-muted">
              Вход без Telegram, данные — учебные. Зайдите под другой ролью, чтобы увидеть приложение глазами начальника,
              бригадира и рабочего.
            </p>
            <Button variant="dark" className="mt-3 w-full" onClick={logout}>
              <LogOut size={18} /> Сменить пользователя
            </Button>
          </Card>
        </>
      )}

      <p className="mt-8 text-center text-[12px] font-semibold text-faint">Бригада · версия 0.1</p>
    </Page>
  );
}
