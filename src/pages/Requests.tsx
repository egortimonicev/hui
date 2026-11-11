import { Box, CalendarDays, Check, Package, PackageCheck, Plus, Trash2, Wrench, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { MaterialRequest, RequestKind } from '../../shared/types';
import { api } from '../lib/api';
import { useAct, useRequests, useSession } from '../lib/data';
import { REQUEST_KIND, REQUEST_STATUS, addDays, fmtDate, fmtDateTime } from '../lib/format';
import { confirmDialog } from '../lib/tg';
import {
  Badge,
  Button,
  Choice,
  Empty,
  Fab,
  Field,
  IconTile,
  Input,
  Loadable,
  Page,
  PageHeader,
  Segmented,
  Sheet,
  Textarea,
  Toggle,
} from '../ui';

const INVALIDATE = ['requests', 'overview'];
const KIND_ICON: Record<RequestKind, LucideIcon> = { material: Package, tool: Wrench, other: Box };

export default function Requests() {
  const { me } = useSession();
  const isForeman = me.user.role === 'foreman';
  const query = useRequests();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(params.get('new') === '1' && isForeman);
  const [filter, setFilter] = useState<'open' | 'closed'>('open');

  useEffect(() => {
    if (params.has('new')) setParams({}, { replace: true });
  }, [params, setParams]);

  return (
    <Page>
      <PageHeader title="Заявки" subtitle={isForeman ? 'Материалы и инструмент для бригады' : 'Материалы и инструмент'} />
      <Loadable query={query}>
        {(requests) => {
          const open = requests.filter((r) => r.status === 'new' || r.status === 'approved');
          const list = filter === 'open' ? open : requests.filter((r) => r.status === 'rejected' || r.status === 'delivered');
          return (
            <>
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'open', label: 'В работе', count: open.length },
                  { value: 'closed', label: 'Закрытые' },
                ]}
              />
              {list.length === 0 ? (
                <Empty
                  icon={Package}
                  title={filter === 'open' ? 'Открытых заявок нет' : 'Закрытых заявок нет'}
                  text={isForeman && filter === 'open' ? 'Нужны материалы или инструмент — оформите заявку.' : undefined}
                />
              ) : (
                <div className="mt-3 space-y-3">
                  {list.map((request) => (
                    <RequestCard key={request.id} request={request} />
                  ))}
                </div>
              )}
            </>
          );
        }}
      </Loadable>
      {isForeman && <Fab icon={Plus} label="Заявка" onClick={() => setCreating(true)} />}
      {creating && <RequestForm onClose={() => setCreating(false)} />}
    </Page>
  );
}

export function RequestCard({ request }: { request: MaterialRequest }) {
  const { me } = useSession();
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState('');
  const isManager = me.user.role === 'manager';
  const status = REQUEST_STATUS[request.status];

  const resolve = useAct(
    (body: { status: 'approved' | 'rejected' | 'delivered'; comment?: string }) => api.patch(`/requests/${request.id}`, body),
    { invalidate: INVALIDATE, onSuccess: () => setRejecting(false) },
  );
  const remove = useAct(() => api.del(`/requests/${request.id}`), { invalidate: INVALIDATE, done: 'Заявка отозвана' });

  return (
    <article className="rounded-3xl bg-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        <IconTile icon={KIND_ICON[request.kind]} tone={request.urgent && request.status === 'new' ? 'bad' : 'neutral'} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug font-bold">{request.title}</p>
          <p className="mt-0.5 text-[13px] text-muted">
            {[request.qty, REQUEST_KIND[request.kind]].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {request.urgent && <Badge tone="bad">Срочно</Badge>}
        {request.neededBy && (
          <Badge>
            <CalendarDays size={13} /> нужно: {fmtDate(request.neededBy, me.today).toLowerCase()}
          </Badge>
        )}
        <span className="text-[13px] font-semibold text-muted">
          {isManager ? `${request.brigadeName} · ${request.authorName}` : fmtDateTime(request.createdAt, me.today)}
        </span>
      </div>

      {request.note && <p className="mt-3 text-[14px] leading-relaxed text-ink/80">{request.note}</p>}
      {request.resolutionComment && (
        <p className="mt-3 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[14px] leading-snug">
          <span className="font-bold">{request.resolverName ?? 'Начальник'}:</span> {request.resolutionComment}
        </p>
      )}

      {isManager && request.status === 'new' && (
        <div className="mt-3 flex gap-2.5">
          <Button small variant="danger" onClick={() => setRejecting(true)}>
            <X size={16} /> Отклонить
          </Button>
          <Button small variant="ok" className="flex-1" disabled={resolve.isPending} onClick={() => resolve.mutate({ status: 'approved' })}>
            <Check size={17} strokeWidth={2.6} /> Одобрить
          </Button>
        </div>
      )}
      {request.status === 'approved' && (
        <Button
          small
          variant="dark"
          className="mt-3 w-full"
          disabled={resolve.isPending}
          onClick={() => resolve.mutate({ status: 'delivered' })}
        >
          <PackageCheck size={17} /> {isManager ? 'Отметить: доставлено' : 'Получено на объекте'}
        </Button>
      )}
      {request.status === 'new' && request.authorId === me.user.id && (
        <Button
          small
          variant="soft"
          className="mt-3 w-full"
          onClick={async () => (await confirmDialog('Отозвать заявку?')) && remove.mutate()}
        >
          <Trash2 size={16} /> Отозвать заявку
        </Button>
      )}

      {rejecting && (
        <Sheet
          open
          onClose={() => setRejecting(false)}
          title="Отклонить заявку"
          footer={
            <Button
              variant="danger"
              className="flex-1"
              disabled={!comment.trim() || resolve.isPending}
              onClick={() => resolve.mutate({ status: 'rejected', comment })}
            >
              Отклонить
            </Button>
          }
        >
          <p className="mb-4 text-sm text-muted">{request.title}</p>
          <Field label="Причина — её увидит бригадир">
            <Textarea autoFocus value={comment} maxLength={500} placeholder="Например: возьмите со склада №1" onChange={(e) => setComment(e.target.value)} />
          </Field>
        </Sheet>
      )}
    </article>
  );
}

function RequestForm({ onClose }: { onClose: () => void }) {
  const { me } = useSession();
  const [kind, setKind] = useState<RequestKind>('material');
  const [title, setTitle] = useState('');
  const [qty, setQty] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [neededBy, setNeededBy] = useState<string | null>(addDays(me.today, 1));
  const [note, setNote] = useState('');
  const create = useAct(() => api.post('/requests', { kind, title, qty, urgent, neededBy, note }), {
    invalidate: INVALIDATE,
    done: 'Заявка отправлена начальнику',
    onSuccess: onClose,
  });

  return (
    <Sheet
      open
      onClose={onClose}
      title="Новая заявка"
      footer={
        <Button className="flex-1" disabled={title.trim().length < 2 || create.isPending} onClick={() => create.mutate()}>
          Отправить заявку
        </Button>
      }
    >
      <Field label="Что нужно">
        <Choice
          value={kind}
          onChange={setKind}
          options={[
            { value: 'material', label: 'Материал' },
            { value: 'tool', label: 'Инструмент' },
            { value: 'other', label: 'Другое' },
          ]}
        />
      </Field>
      <Field label="Наименование">
        <Input value={title} maxLength={160} placeholder="Например: арматура А500С ⌀12" onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Количество">
        <Input value={qty} maxLength={60} placeholder="2,5 т · 40 листов · 50 шт" onChange={(e) => setQty(e.target.value)} />
      </Field>
      <Field label="К какому дню">
        <Input type="date" min={me.today} value={neededBy ?? ''} onChange={(e) => setNeededBy(e.target.value || null)} />
      </Field>
      <Toggle checked={urgent} onChange={setUrgent} label="Срочно" hint="Без этого встанет работа" />
      <Field label="Комментарий">
        <Textarea value={note} rows={2} maxLength={1000} placeholder="Для чего, куда доставить" onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Sheet>
  );
}
