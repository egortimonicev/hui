import { Building2, Copy, MapPin, Pencil, Phone, Plus, Send, UserMinus, Users } from 'lucide-react';
import { useState } from 'react';
import type { Brigade, Role, User } from '../../shared/types';
import { api } from '../lib/api';
import { useAct, useBrigades, useSession, useUsers } from '../lib/data';
import { ROLE_LABEL, plural } from '../lib/format';
import { confirmDialog } from '../lib/tg';
import { Avatar, Badge, Button, Choice, Empty, Fab, Field, Input, Loadable, Page, PageHeader, Select, Sheet, toast } from '../ui';

const INVALIDATE = ['users', 'brigades', 'attendance', 'attendance-month', 'overview'];
const telHref = (phone: string) => `tel:${phone.replace(/[^+\d]/g, '')}`;

export default function Team() {
  const { me } = useSession();
  const role = me.user.role;
  const users = useUsers();
  const brigades = useBrigades();
  const [openId, setOpenId] = useState<number | null>(null);
  const [personForm, setPersonForm] = useState<{ user?: User } | null>(null);
  const [brigadeForm, setBrigadeForm] = useState<{ brigade?: Brigade } | null>(null);
  const opened = users.data?.find((user) => user.id === openId);

  /** Те же правила, что на сервере: начальник — всех, бригадир — рабочих своей бригады. */
  const canManage = (user: User) =>
    role === 'manager' || (role === 'foreman' && user.role === 'worker' && user.brigadeId === me.user.brigadeId);

  return (
    <Page>
      <PageHeader title="Команда" subtitle={users.data ? `${users.data.length} ${plural(users.data.length, 'человек', 'человека', 'человек')}` : undefined} />
      <Loadable query={users}>
        {(all) => {
          const groups = [
            ...(brigades.data ?? []).map((brigade) => ({
              brigade,
              title: brigade.name,
              subtitle: [brigade.site, brigade.address].filter(Boolean).join(' · '),
              // Бригадир — первым в своей бригаде.
              people: all
                .filter((user) => user.brigadeId === brigade.id)
                .sort((a, b) => Number(b.role === 'foreman') - Number(a.role === 'foreman')),
            })),
            {
              brigade: undefined,
              title: 'Руководство',
              subtitle: '',
              people: all.filter((user) => user.role === 'manager'),
            },
            {
              brigade: undefined,
              title: 'Без бригады',
              subtitle: '',
              people: all.filter((user) => user.role !== 'manager' && !user.brigadeId),
            },
          ].filter((group) => group.people.length > 0 || group.brigade);

          if (all.length === 0) return <Empty icon={Users} title="В команде пока никого" />;
          return (
            <>
              {groups.map((group) => (
                <section key={group.title} className="mb-5">
                  <div className="mb-2 flex items-end justify-between gap-3 px-1">
                    <div className="min-w-0">
                      <h2 className="text-[17px] font-extrabold tracking-tight">
                        {group.title} <span className="text-sm font-semibold text-faint">{group.people.length}</span>
                      </h2>
                      {group.subtitle && (
                        <p className="flex items-center gap-1 truncate text-[13px] text-muted">
                          <MapPin size={13} className="shrink-0" /> {group.subtitle}
                        </p>
                      )}
                    </div>
                    {role === 'manager' && group.brigade && (
                      <button
                        type="button"
                        aria-label={`Изменить бригаду ${group.title}`}
                        onClick={() => setBrigadeForm({ brigade: group.brigade })}
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-muted shadow-card"
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-line overflow-hidden rounded-3xl bg-surface shadow-card">
                    {group.people.length === 0 && <p className="px-4 py-4 text-sm text-muted">В бригаде пока никого</p>}
                    {group.people.map((user) => (
                      <div key={user.id} className="flex items-center gap-2 py-2.5 pr-3 pl-4">
                        <button type="button" onClick={() => setOpenId(user.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          <Avatar id={user.id} name={user.name} size={42} />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-[15px] font-bold">{user.name}</span>
                              {user.id === me.user.id && <Badge>вы</Badge>}
                              {user.role === 'foreman' && <Badge tone="accent">Бригадир</Badge>}
                            </span>
                            <span className="block truncate text-[13px] text-muted">{user.position || ROLE_LABEL[user.role]}</span>
                          </span>
                        </button>
                        {user.phone && user.id !== me.user.id && (
                          <a
                            href={telHref(user.phone)}
                            aria-label={`Позвонить: ${user.name}`}
                            className="grid size-10 shrink-0 place-items-center rounded-full bg-ok-soft text-ok"
                          >
                            <Phone size={18} />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              {role === 'manager' && (
                <Button variant="soft" className="w-full" onClick={() => setBrigadeForm({})}>
                  <Building2 size={18} /> Новая бригада
                </Button>
              )}
            </>
          );
        }}
      </Loadable>

      {role !== 'worker' && <Fab icon={Plus} label="Сотрудник" onClick={() => setPersonForm({})} />}
      {opened && (
        <PersonSheet
          user={opened}
          canManage={canManage(opened)}
          onClose={() => setOpenId(null)}
          onEdit={() => {
            setOpenId(null);
            setPersonForm({ user: opened });
          }}
        />
      )}
      {personForm && <PersonForm user={personForm.user} onClose={() => setPersonForm(null)} />}
      {brigadeForm && <BrigadeForm brigade={brigadeForm.brigade} onClose={() => setBrigadeForm(null)} />}
    </Page>
  );
}

function PersonSheet({ user, canManage, onClose, onEdit }: { user: User; canManage: boolean; onClose: () => void; onEdit: () => void }) {
  const { me, config } = useSession();
  const remove = useAct(() => api.del(`/users/${user.id}`), {
    invalidate: INVALIDATE,
    done: 'Сотрудник убран из команды',
    onSuccess: onClose,
  });
  const inviteLink =
    config.botUsername && user.inviteCode ? `https://t.me/${config.botUsername}?startapp=inv_${user.inviteCode}` : null;

  return (
    <Sheet open onClose={onClose} title={user.name}>
      <div className="flex items-center gap-4">
        <Avatar id={user.id} name={user.name} size={64} />
        <div className="min-w-0">
          <p className="text-[17px] font-bold">{user.position || ROLE_LABEL[user.role]}</p>
          <p className="text-sm text-muted">
            {ROLE_LABEL[user.role]} · {user.brigadeName ?? 'без бригады'}
          </p>
          {config.mode === 'telegram' && (
            <Badge tone={user.linked ? 'ok' : 'neutral'} className="mt-1.5">
              {user.linked ? 'Telegram подключён' : 'Ещё не заходил'}
            </Badge>
          )}
        </div>
      </div>

      {user.phone && (
        <a href={telHref(user.phone)} className="mt-4 flex h-13 items-center justify-center gap-2 rounded-2xl bg-ok text-[15px] font-bold text-white">
          <Phone size={18} /> {user.phone}
        </a>
      )}

      {canManage && !user.linked && (
        <div className="mt-3 rounded-2xl bg-surface-2 p-4">
          <p className="flex items-center gap-2 text-[14px] font-bold">
            <Send size={16} className="text-accent" /> Приглашение в приложение
          </p>
          {inviteLink ? (
            <>
              <p className="mt-1 text-[13px] break-all text-muted">{inviteLink}</p>
              <Button
                small
                variant="dark"
                className="mt-3 w-full"
                onClick={() => void navigator.clipboard.writeText(inviteLink).then(() => toast('Ссылка скопирована'))}
              >
                <Copy size={16} /> Скопировать ссылку
              </Button>
            </>
          ) : (
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Когда приложение подключат к Telegram-боту, здесь появится личная ссылка: сотрудник открывает её — и сразу попадает в
              свою бригаду.
            </p>
          )}
        </div>
      )}

      {canManage && (
        <div className="mt-3 flex gap-2.5">
          <Button variant="soft" className="flex-1" onClick={onEdit}>
            <Pencil size={17} /> Изменить
          </Button>
          {user.id !== me.user.id && (
            <Button
              variant="danger"
              aria-label="Убрать из команды"
              onClick={async () => (await confirmDialog(`Убрать из команды: ${user.name}?`)) && remove.mutate()}
            >
              <UserMinus size={18} />
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

function PersonForm({ user, onClose }: { user?: User; onClose: () => void }) {
  const { me } = useSession();
  const isManager = me.user.role === 'manager';
  const brigades = useBrigades();
  const [name, setName] = useState(user?.name ?? '');
  const [position, setPosition] = useState(user?.position ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'worker');
  const [brigadeId, setBrigadeId] = useState<number | null>(user ? user.brigadeId : me.user.brigadeId);
  const save = useAct(
    () => {
      const body = { name, position, phone, role, brigadeId: role === 'manager' ? null : brigadeId };
      return user ? api.put(`/users/${user.id}`, body) : api.post('/users', body);
    },
    { invalidate: INVALIDATE, done: user ? 'Сохранено' : 'Сотрудник добавлен', onSuccess: onClose },
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={user ? 'Правка сотрудника' : 'Новый сотрудник'}
      footer={
        <Button className="flex-1" disabled={name.trim().length < 2 || save.isPending} onClick={() => save.mutate()}>
          {user ? 'Сохранить' : 'Добавить в команду'}
        </Button>
      }
    >
      <Field label="Имя и фамилия">
        <Input value={name} maxLength={80} placeholder="Иван Петров" onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Специальность">
        <Input value={position} maxLength={80} placeholder="Арматурщик, сварщик, маляр…" onChange={(e) => setPosition(e.target.value)} />
      </Field>
      <Field label="Телефон">
        <Input type="tel" value={phone} maxLength={30} placeholder="+7 900 000-00-00" onChange={(e) => setPhone(e.target.value)} />
      </Field>
      {isManager && (
        <>
          <Field label="Роль">
            <Choice
              value={role}
              onChange={setRole}
              options={[
                { value: 'worker', label: 'Рабочий' },
                { value: 'foreman', label: 'Бригадир' },
                { value: 'manager', label: 'Начальник' },
              ]}
            />
          </Field>
          {role !== 'manager' && (
            <Field label="Бригада">
              <Select value={brigadeId ?? ''} onChange={(e) => setBrigadeId(Number(e.target.value) || null)}>
                <option value="">Без бригады</option>
                {brigades.data?.map((brigade) => (
                  <option key={brigade.id} value={brigade.id}>
                    {brigade.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </>
      )}
    </Sheet>
  );
}

function BrigadeForm({ brigade, onClose }: { brigade?: Brigade; onClose: () => void }) {
  const [name, setName] = useState(brigade?.name ?? '');
  const [site, setSite] = useState(brigade?.site ?? '');
  const [address, setAddress] = useState(brigade?.address ?? '');
  const save = useAct(
    () => {
      const body = { name, site, address };
      return brigade ? api.put(`/brigades/${brigade.id}`, body) : api.post('/brigades', body);
    },
    { invalidate: [...INVALIDATE, 'me'], done: brigade ? 'Сохранено' : 'Бригада создана', onSuccess: onClose },
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={brigade ? 'Правка бригады' : 'Новая бригада'}
      footer={
        <Button className="flex-1" disabled={name.trim().length < 2 || save.isPending} onClick={() => save.mutate()}>
          {brigade ? 'Сохранить' : 'Создать бригаду'}
        </Button>
      }
    >
      <Field label="Название">
        <Input value={name} maxLength={60} placeholder="Монолит-1" onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Объект">
        <Input value={site} maxLength={120} placeholder="ЖК «Северный», корпус 2" onChange={(e) => setSite(e.target.value)} />
      </Field>
      <Field label="Адрес">
        <Input value={address} maxLength={160} placeholder="ул. Строителей, 14" onChange={(e) => setAddress(e.target.value)} />
      </Field>
    </Sheet>
  );
}
