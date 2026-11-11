import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import type { Role } from '../../shared/types';
import { Avatar, Loadable, Logo } from '../ui';
import { api } from '../lib/api';

interface DemoUser {
  id: number;
  name: string;
  role: Role;
  position: string;
  brigadeName: string | null;
}

const ROLES: { role: Role; title: string; text: string; limit: number }[] = [
  { role: 'foreman', title: 'Бригадир', text: 'Отмечает людей, пишет отчёты, ставит задачи', limit: 2 },
  { role: 'manager', title: 'Начальник', text: 'Видит все бригады, принимает отчёты и заявки', limit: 2 },
  { role: 'worker', title: 'Рабочий', text: 'Видит свои смены, задачи и объявления', limit: 3 },
];

/** Экран демо-входа. В Telegram его нет: там пользователь определяется автоматически. */
export default function Login({ onPick }: { onPick: (id: number) => void }) {
  const users = useQuery({ queryKey: ['demo-users'], queryFn: () => api.get<DemoUser[]>('/demo/users') });

  return (
    <div className="mx-auto min-h-dvh max-w-[480px] bg-bg pb-10">
      <div className="relative overflow-hidden rounded-b-[36px] bg-hero px-6 pt-12 pb-9 text-white">
        <div className="pointer-events-none absolute -top-20 -right-16 size-64 rounded-full bg-accent/35 blur-3xl" />
        <div className="relative">
          <Logo />
          <h1 className="mt-6 text-[34px] leading-10 font-extrabold tracking-tight">Бригада</h1>
          <p className="mt-2 max-w-[300px] text-[16px] leading-snug text-white/65">
            Табель, отчёты, объявления и задачи стройки — в одном окне Telegram.
          </p>
        </div>
      </div>

      <div className="px-4">
        <p className="mt-6 px-1 text-[13px] font-bold tracking-wide text-accent uppercase">Демо-режим</p>
        <h2 className="px-1 text-[22px] font-extrabold tracking-tight">Под кем войти?</h2>

        <Loadable query={users} rows={3}>
          {(all) => (
            <>
              {ROLES.map(({ role, title, text, limit }) => (
                <section key={role} className="mt-5">
                  <div className="mb-2 px-1">
                    <h3 className="text-[15px] font-extrabold">{title}</h3>
                    <p className="text-[13px] text-muted">{text}</p>
                  </div>
                  <div className="divide-y divide-line overflow-hidden rounded-3xl bg-surface shadow-card">
                    {all
                      .filter((user) => user.role === role)
                      .slice(0, limit)
                      .map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => onPick(user.id)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-ink/5"
                        >
                          <Avatar id={user.id} name={user.name} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-bold">{user.name}</span>
                            <span className="block truncate text-[13px] text-muted">
                              {[user.position, user.brigadeName].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          <ChevronRight size={20} className="shrink-0 text-faint" />
                        </button>
                      ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </Loadable>
      </div>
    </div>
  );
}
