import { useQuery } from '@tanstack/react-query';
import {
  Camera,
  ChevronRight,
  CircleCheck,
  Clock,
  FilePlus,
  FileText,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
  Undo2,
  Users,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Report } from '../../shared/types';
import { api } from '../lib/api';
import { useAct, useReports, useSession } from '../lib/data';
import { REPORT_STATUS, fmtDate, fmtDateTime, fmtHours, fmtWeekday, fmtWeekdayShort } from '../lib/format';
import { confirmDialog } from '../lib/tg';
import {
  Badge,
  BottomBar,
  Button,
  Card,
  Empty,
  Fab,
  Field,
  IconTile,
  Loadable,
  Page,
  PageHeader,
  SectionTitle,
  Segmented,
  Sheet,
  Textarea,
  cx,
} from '../ui';

export default function Reports() {
  const { me } = useSession();
  const navigate = useNavigate();
  const isManager = me.user.role === 'manager';
  const query = useReports();
  const [filter, setFilter] = useState<'review' | 'all'>('review');

  return (
    <Page>
      <PageHeader title="Отчёты" subtitle={isManager ? 'Ежедневные отчёты бригад' : me.brigade?.name} />
      <Loadable query={query}>
        {(reports) => {
          const toReview = reports.filter((report) => report.status === 'submitted');
          const list = isManager && filter === 'review' ? toReview : reports;
          const hasToday = reports.some((report) => report.date === me.today);
          return (
            <>
              {isManager && (
                <div className="mb-3">
                  <Segmented
                    value={filter}
                    onChange={setFilter}
                    options={[
                      { value: 'review', label: 'На проверке', count: toReview.length },
                      { value: 'all', label: 'Все' },
                    ]}
                  />
                </div>
              )}
              {!isManager && !hasToday && (
                <Link
                  to="/reports/new"
                  className="mb-3 flex items-center gap-3 rounded-3xl border-2 border-dashed border-accent/45 bg-accent-soft p-4"
                >
                  <IconTile icon={FilePlus} className="bg-accent! text-white!" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">Отчёт за сегодня</span>
                    <span className="block text-[13px] text-muted">Работы, проблемы, план и фото</span>
                  </span>
                  <ChevronRight size={20} className="text-accent" />
                </Link>
              )}
              {list.length === 0 ? (
                <Empty
                  icon={FileText}
                  title={isManager && filter === 'review' ? 'Всё проверено' : 'Отчётов пока нет'}
                  text={isManager ? 'Новые отчёты бригадиров появятся здесь.' : 'Напишите первый отчёт за день.'}
                />
              ) : (
                <div className="space-y-3">
                  {list.map((report) => (
                    <ReportCard key={report.id} report={report} showBrigade={isManager} />
                  ))}
                </div>
              )}
            </>
          );
        }}
      </Loadable>
      {!isManager && <Fab icon={Plus} label="Отчёт" onClick={() => navigate('/reports/new')} />}
    </Page>
  );
}

function ReportCard({ report, showBrigade }: { report: Report; showBrigade: boolean }) {
  const { me } = useSession();
  const status = REPORT_STATUS[report.status];
  return (
    <Link to={`/reports/${report.id}`} className="block rounded-3xl bg-surface p-4 shadow-card transition active:scale-[0.99]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[17px] font-extrabold tracking-tight">
            {fmtDate(report.date, me.today)} <span className="text-sm font-semibold text-muted">{fmtWeekdayShort(report.date)}</span>
          </p>
          <p className="truncate text-[13px] text-muted">{showBrigade ? `${report.brigadeName} · ${report.authorName}` : report.site}</p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <ul className="mt-3 space-y-1.5">
        {report.works.slice(0, 2).map((work, i) => (
          <li key={i} className="flex items-baseline gap-2 text-[14px]">
            <span className="size-1.5 shrink-0 -translate-y-0.5 rounded-full bg-accent" />
            <span className="min-w-0 flex-1 truncate">{work.text}</span>
            {work.volume && <span className="shrink-0 font-bold">{work.volume}</span>}
          </li>
        ))}
        {report.works.length > 2 && <li className="pl-3.5 text-[13px] text-muted">и ещё {report.works.length - 2}</li>}
      </ul>
      <div className="mt-3 flex items-center gap-4 border-t border-line pt-3 text-[13px] font-semibold text-muted">
        <span className="flex items-center gap-1.5">
          <Users size={15} /> {report.headcount} чел
        </span>
        <span className="flex items-center gap-1.5">
          <Clock size={15} /> {fmtHours(report.hours)}
        </span>
        {report.photos.length > 0 && (
          <span className="flex items-center gap-1.5">
            <Camera size={15} /> {report.photos.length}
          </span>
        )}
        {report.problems && (
          <span className="ml-auto flex items-center gap-1.5 text-bad">
            <TriangleAlert size={15} /> Есть проблемы
          </span>
        )}
      </div>
    </Link>
  );
}

export function ReportView() {
  const { id } = useParams();
  const { me } = useSession();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['reports', Number(id)], queryFn: () => api.get<Report>(`/reports/${id}`) });
  const [returning, setReturning] = useState(false);
  const [comment, setComment] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);

  const review = useAct(
    (body: { status: 'accepted' | 'returned'; comment: string }) => api.post(`/reports/${id}/review`, body),
    { invalidate: ['reports', 'overview'], onSuccess: () => setReturning(false) },
  );
  const remove = useAct(() => api.del(`/reports/${id}`), {
    done: 'Отчёт удалён',
    onSuccess: () => navigate('/reports', { replace: true }),
    invalidate: ['reports', 'overview'],
  });

  return (
    <Page className="pb-32">
      <Loadable query={query}>
        {(report) => {
          const status = REPORT_STATUS[report.status];
          const reviewed = report.status !== 'submitted';
          const canEdit = me.user.role === 'foreman' && report.status !== 'accepted';
          const canReview = me.user.role === 'manager' && report.status === 'submitted';
          return (
            <>
              <PageHeader
                back="/reports"
                title={fmtDate(report.date, me.today)}
                subtitle={`${fmtWeekday(report.date)} · ${report.brigadeName}`}
                right={<Badge tone={status.tone}>{status.label}</Badge>}
              />

              {reviewed && (
                <div className={cx('mb-3 rounded-3xl p-4', report.status === 'returned' ? 'bg-warn-soft' : 'bg-ok-soft')}>
                  <p className={cx('flex items-center gap-2 font-bold', report.status === 'returned' ? 'text-warn' : 'text-ok')}>
                    {report.status === 'returned' ? <Undo2 size={18} /> : <CircleCheck size={18} />}
                    {report.status === 'returned' ? 'Вернули на доработку' : 'Отчёт принят'}
                  </p>
                  {report.reviewComment && <p className="mt-1.5 text-[15px] leading-snug">{report.reviewComment}</p>}
                  {report.reviewerName && <p className="mt-1.5 text-[12px] font-semibold text-muted">{report.reviewerName}</p>}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <Tile value={String(report.headcount)} label="человек на смене" />
                <Tile value={fmtHours(report.hours)} label="по табелю" />
                <Tile value={String(report.works.length)} label="видов работ" />
              </div>

              <SectionTitle>Выполненные работы</SectionTitle>
              <Card className="space-y-3.5">
                {report.works.map((work, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-extrabold text-accent">
                      {i + 1}
                    </span>
                    <p className="min-w-0 flex-1 text-[15px] leading-snug">{work.text}</p>
                    {work.volume && (
                      <span className="shrink-0 rounded-lg bg-ink/6 px-2 py-1 text-[13px] font-extrabold">{work.volume}</span>
                    )}
                  </div>
                ))}
              </Card>

              {report.problems && (
                <>
                  <SectionTitle>Проблемы и простои</SectionTitle>
                  <div className="flex gap-3 rounded-3xl bg-bad-soft p-4">
                    <TriangleAlert size={20} className="mt-0.5 shrink-0 text-bad" />
                    <p className="text-[15px] leading-relaxed whitespace-pre-line">{report.problems}</p>
                  </div>
                </>
              )}

              {report.plan && (
                <>
                  <SectionTitle>План на завтра</SectionTitle>
                  <Card>
                    <p className="text-[15px] leading-relaxed whitespace-pre-line">{report.plan}</p>
                  </Card>
                </>
              )}

              {report.photos.length > 0 && (
                <>
                  <SectionTitle>Фото · {report.photos.length}</SectionTitle>
                  <div className="grid grid-cols-3 gap-2">
                    {report.photos.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        aria-label="Открыть фото"
                        onClick={() => setPhoto(item.url)}
                        className="aspect-square overflow-hidden rounded-2xl bg-ink/6"
                      >
                        <img src={item.url} alt="" loading="lazy" className="size-full object-cover" />
                      </button>
                    ))}
                  </div>
                </>
              )}

              <p className="mt-5 px-1 text-[12px] leading-relaxed text-faint">
                {report.site}
                <br />
                Составил {report.authorName} · {fmtDateTime(report.createdAt, me.today)}
              </p>

              {canReview && (
                <BottomBar>
                  <Button variant="soft" onClick={() => setReturning(true)}>
                    <Undo2 size={18} /> Вернуть
                  </Button>
                  <Button
                    variant="ok"
                    className="flex-1"
                    disabled={review.isPending}
                    onClick={() => review.mutate({ status: 'accepted', comment: '' })}
                  >
                    <CircleCheck size={19} /> Принять отчёт
                  </Button>
                </BottomBar>
              )}
              {canEdit && (
                <BottomBar>
                  <Button
                    variant="danger"
                    aria-label="Удалить отчёт"
                    onClick={async () => (await confirmDialog('Удалить отчёт?')) && remove.mutate()}
                  >
                    <Trash2 size={18} />
                  </Button>
                  <Button variant="dark" className="flex-1" onClick={() => navigate(`/reports/${report.id}/edit`)}>
                    <Pencil size={17} /> {report.status === 'returned' ? 'Исправить отчёт' : 'Редактировать'}
                  </Button>
                </BottomBar>
              )}
            </>
          );
        }}
      </Loadable>

      {returning && (
        <Sheet
          open
          onClose={() => setReturning(false)}
          title="Вернуть на доработку"
          footer={
            <Button
              className="flex-1"
              disabled={!comment.trim() || review.isPending}
              onClick={() => review.mutate({ status: 'returned', comment })}
            >
              Вернуть бригадиру
            </Button>
          }
        >
          <Field label="Что исправить — это увидит бригадир">
            <Textarea autoFocus value={comment} rows={4} maxLength={1000} placeholder="Например: укажите объёмы и добавьте фото" onChange={(e) => setComment(e.target.value)} />
          </Field>
        </Sheet>
      )}

      {photo &&
        createPortal(
          <div className="fixed inset-0 z-[70] grid animate-fade place-items-center bg-black/92 p-3" onClick={() => setPhoto(null)}>
            <img src={photo} alt="Фото из отчёта" className="max-h-full max-w-full rounded-2xl object-contain" />
            <button type="button" aria-label="Закрыть фото" className="absolute top-4 right-4 grid size-11 place-items-center rounded-full bg-white/15 text-white">
              <X size={22} />
            </button>
          </div>,
          document.body,
        )}
    </Page>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-surface px-3 py-3 shadow-card">
      <p className="text-[22px] leading-7 font-extrabold tabular-nums">{value}</p>
      <p className="text-[11px] leading-tight font-semibold text-muted">{label}</p>
    </div>
  );
}
