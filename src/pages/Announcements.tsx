import { Check, CheckCheck, Megaphone, Pin, PinOff, Plus, Siren, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Announcement, AnnouncementPriority, AnnouncementReads } from '../../shared/types';
import { api } from '../lib/api';
import { useAct, useAnnouncements, useBrigades, useSession } from '../lib/data';
import { ROLE_LABEL, fmtDateTime } from '../lib/format';
import { confirmDialog } from '../lib/tg';
import { useQuery } from '@tanstack/react-query';
import {
  Avatar,
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
  Select,
  Sheet,
  Textarea,
  Toggle,
  cx,
} from '../ui';

export default function Announcements() {
  const { me } = useSession();
  const query = useAnnouncements();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(params.get('new') === '1');
  const canPost = me.user.role !== 'worker';
  const seen = useAct(() => api.post('/announcements/seen'), { invalidate: ['announcements'] });

  useEffect(() => {
    if (params.has('new')) setParams({}, { replace: true });
  }, [params, setParams]);

  // Обычные объявления считаются прочитанными, как только человек открыл ленту.
  const hasUnseen = query.data?.some((item) => !item.read && !item.requireAck) ?? false;
  useEffect(() => {
    if (hasUnseen && seen.isIdle) seen.mutate();
  }, [hasUnseen, seen]);

  return (
    <Page>
      <PageHeader title="Объявления" subtitle={me.brigade ? `${me.brigade.name} и общие` : 'Все бригады'} />
      <Loadable query={query}>
        {(items) =>
          items.length === 0 ? (
            <Empty icon={Megaphone} title="Объявлений пока нет" text="Здесь появятся важные сообщения для бригады." />
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <AnnouncementCard key={item.id} item={item} />
              ))}
            </div>
          )
        }
      </Loadable>
      {canPost && <Fab icon={Plus} label="Объявление" onClick={() => setCreating(true)} />}
      {creating && <AnnouncementForm onClose={() => setCreating(false)} />}
    </Page>
  );
}

export function AnnouncementCard({ item }: { item: Announcement }) {
  const { me } = useSession();
  const [readsOpen, setReadsOpen] = useState(false);
  const ack = useAct(() => api.post(`/announcements/${item.id}/ack`), {
    invalidate: ['announcements'],
    done: 'Отмечено: вы ознакомлены',
  });
  const pin = useAct(() => api.patch(`/announcements/${item.id}`, { pinned: !item.pinned }), {
    invalidate: ['announcements'],
    done: item.pinned ? 'Откреплено' : 'Закреплено сверху',
  });
  const remove = useAct(() => api.del(`/announcements/${item.id}`), {
    invalidate: ['announcements'],
    done: 'Объявление удалено',
  });
  const confirmedByMe = item.requireAck && !item.mustAck && item.authorId !== me.user.id && me.user.role !== 'manager';

  return (
    <article className="relative overflow-hidden rounded-3xl bg-surface p-4 shadow-card">
      {item.priority !== 'normal' && (
        <span className={cx('absolute inset-y-0 left-0 w-1.5', item.priority === 'urgent' ? 'bg-bad' : 'bg-warn')} />
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {item.priority === 'urgent' && (
          <Badge tone="bad">
            <Siren size={13} /> Срочно
          </Badge>
        )}
        {item.priority === 'important' && <Badge tone="warn">Важно</Badge>}
        <Badge>{item.brigadeName ?? 'Всем'}</Badge>
        {item.pinned && <Pin size={14} className="text-muted" aria-label="Закреплено" />}
        {!item.read && !item.mustAck && <span className="size-2 rounded-full bg-accent" aria-label="Новое" />}
        <span className="ml-auto text-[12px] font-semibold text-faint">{fmtDateTime(item.createdAt, me.today)}</span>
      </div>

      <h3 className="mt-2.5 text-[17px] leading-snug font-extrabold tracking-tight">{item.title}</h3>
      {item.body && <p className="mt-1.5 text-[15px] leading-relaxed whitespace-pre-line text-ink/80">{item.body}</p>}

      <div className="mt-3 flex items-center gap-2">
        <Avatar id={item.authorId} name={item.authorName} size={26} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-muted">
          {item.authorName} · {ROLE_LABEL[item.authorRole].toLowerCase()}
        </span>
        {item.canManage && (
          <>
            <button
              type="button"
              aria-label={item.pinned ? 'Открепить' : 'Закрепить'}
              onClick={() => pin.mutate()}
              className="grid size-9 place-items-center rounded-full bg-ink/6 text-muted"
            >
              {item.pinned ? <PinOff size={16} /> : <Pin size={16} />}
            </button>
            <button
              type="button"
              aria-label="Удалить объявление"
              onClick={async () => (await confirmDialog('Удалить объявление?')) && remove.mutate()}
              className="grid size-9 place-items-center rounded-full bg-bad-soft text-bad"
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>

      {item.mustAck && (
        <Button className="mt-3 w-full" disabled={ack.isPending} onClick={() => ack.mutate()}>
          <Check size={19} strokeWidth={2.6} /> Ознакомлен
        </Button>
      )}
      {confirmedByMe && (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] font-bold text-ok">
          <CheckCheck size={17} /> Вы ознакомлены
        </p>
      )}
      {item.stats && (
        <button type="button" onClick={() => setReadsOpen(true)} className="mt-3 w-full rounded-2xl bg-surface-2 p-3 text-left">
          <span className="flex justify-between text-[13px] font-bold">
            <span className="text-muted">Ознакомились</span>
            <span>
              {item.stats.ack} из {item.stats.total}
            </span>
          </span>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-ink/8">
            <span
              className="block h-full rounded-full bg-ok transition-[width]"
              style={{ width: `${item.stats.total ? (item.stats.ack / item.stats.total) * 100 : 0}%` }}
            />
          </span>
        </button>
      )}
      {readsOpen && <ReadsSheet item={item} onClose={() => setReadsOpen(false)} />}
    </article>
  );
}

function ReadsSheet({ item, onClose }: { item: Announcement; onClose: () => void }) {
  const { me } = useSession();
  const query = useQuery({
    queryKey: ['announcements', item.id, 'reads'],
    queryFn: () => api.get<AnnouncementReads>(`/announcements/${item.id}/reads`),
  });
  return (
    <Sheet open onClose={onClose} title="Кто ознакомился">
      <p className="mb-4 text-sm text-muted">{item.title}</p>
      <Loadable query={query} rows={2}>
        {(reads) => (
          <>
            {reads.unread.length > 0 && (
              <>
                <p className="mb-2 text-[13px] font-bold text-bad">Ещё не ознакомились · {reads.unread.length}</p>
                <div className="mb-5 space-y-2.5">
                  {reads.unread.map((person) => (
                    <div key={person.userId} className="flex items-center gap-3">
                      <Avatar id={person.userId} name={person.name} size={36} />
                      <span className="text-[15px] font-semibold">{person.name}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {reads.read.length > 0 && (
              <>
                <p className="mb-2 text-[13px] font-bold text-ok">Ознакомились · {reads.read.length}</p>
                <div className="space-y-2.5">
                  {reads.read.map((person) => (
                    <div key={person.userId} className="flex items-center gap-3">
                      <Avatar id={person.userId} name={person.name} size={36} />
                      <span className="flex-1 text-[15px] font-semibold">{person.name}</span>
                      <span className="text-[12px] text-faint">{fmtDateTime(person.readAt, me.today)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </Loadable>
    </Sheet>
  );
}

function AnnouncementForm({ onClose }: { onClose: () => void }) {
  const { me } = useSession();
  const isManager = me.user.role === 'manager';
  const brigades = useBrigades();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<AnnouncementPriority>('normal');
  const [brigadeId, setBrigadeId] = useState<number | null>(null);
  const [requireAck, setRequireAck] = useState(false);
  const [pinned, setPinned] = useState(false);
  const create = useAct(() => api.post('/announcements', { title, body, priority, brigadeId, requireAck, pinned }), {
    invalidate: ['announcements'],
    done: 'Объявление опубликовано',
    onSuccess: onClose,
  });

  return (
    <Sheet
      open
      onClose={onClose}
      title="Новое объявление"
      footer={
        <Button className="flex-1" disabled={title.trim().length < 2 || create.isPending} onClick={() => create.mutate()}>
          Опубликовать
        </Button>
      }
    >
      <Field label="Заголовок">
        <Input value={title} maxLength={120} placeholder="Коротко о главном" onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Текст">
        <Textarea value={body} rows={4} maxLength={3000} placeholder="Что, где, когда" onChange={(e) => setBody(e.target.value)} />
      </Field>
      <Field label="Важность">
        <Choice
          value={priority}
          onChange={(next) => {
            setPriority(next);
            // Важное и срочное по умолчанию требуют подтверждения.
            setRequireAck(next !== 'normal');
          }}
          options={[
            { value: 'normal', label: 'Обычное' },
            { value: 'important', label: 'Важное', tone: 'warn' },
            { value: 'urgent', label: 'Срочное', tone: 'bad' },
          ]}
        />
      </Field>
      {isManager ? (
        <Field label="Кому">
          <Select value={brigadeId ?? ''} onChange={(e) => setBrigadeId(Number(e.target.value) || null)}>
            <option value="">Всем бригадам</option>
            {brigades.data?.map((brigade) => (
              <option key={brigade.id} value={brigade.id}>
                {brigade.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <p className="mb-4 text-[13px] font-semibold text-muted">Получит бригада «{me.brigade?.name}»</p>
      )}
      <Toggle
        checked={requireAck}
        onChange={setRequireAck}
        label="Требовать «Ознакомлен»"
        hint="Увидите, кто прочитал, а кто нет"
      />
      <Toggle checked={pinned} onChange={setPinned} label="Закрепить сверху" />
    </Sheet>
  );
}
