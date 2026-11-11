import { Camera, CircleAlert, FileText, Plus, Send, Users, X } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import type { Report, WorkItem } from '../../shared/types';
import { api } from '../lib/api';
import { useAct, useAttendanceDay, useReports, useSession } from '../lib/data';
import { addDays, compressImage, countStatuses, fmtDate, fmtDayShort, fmtHours, plural } from '../lib/format';
import { BottomBar, Button, Empty, Loadable, Page, PageHeader, SectionTitle, Textarea, cx, toast } from '../ui';

const MAX_PHOTOS = 8;
/** Отчёт можно написать за сегодня и три предыдущих дня — как и табель. */
const DAYS_BACK = [0, -1, -2, -3];

export default function ReportForm() {
  const { id } = useParams();
  const { me } = useSession();
  const reports = useReports(me.user.role === 'foreman');
  if (me.user.role !== 'foreman') return <Navigate to="/reports" replace />;

  return (
    <Page className="pb-32">
      <PageHeader back="/reports" title={id ? 'Правка отчёта' : 'Новый отчёт'} subtitle={me.brigade?.name} />
      <Loadable query={reports}>
        {(all) => {
          const editing = id ? all.find((report) => report.id === Number(id)) : undefined;
          if (id && (!editing || editing.status === 'accepted')) {
            return <Empty icon={FileText} title="Отчёт нельзя изменить" text="Он уже принят или удалён." />;
          }
          return <Editor key={id ?? 'new'} report={editing} taken={new Set(all.map((report) => report.date))} />;
        }}
      </Loadable>
    </Page>
  );
}

function Editor({ report, taken }: { report?: Report; taken: Set<string> }) {
  const { me } = useSession();
  const navigate = useNavigate();
  const dates = DAYS_BACK.map((n) => addDays(me.today, n));
  const [date, setDate] = useState<string | null>(report?.date ?? dates.find((d) => !taken.has(d)) ?? null);
  const [works, setWorks] = useState<WorkItem[]>(report?.works ?? [{ text: '', volume: '' }]);
  const [problems, setProblems] = useState(report?.problems ?? '');
  const [plan, setPlan] = useState(report?.plan ?? '');
  const [kept, setKept] = useState(report?.photos ?? []);
  const [added, setAdded] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);

  const day = useAttendanceDay(me.user.brigadeId, date ?? me.today, date !== null);
  const stats = day.data ? countStatuses(day.data.rows) : null;
  const hours = day.data?.rows.reduce((sum, row) => sum + (row.hours ?? 0), 0) ?? 0;
  const filled = works.map((w) => ({ text: w.text.trim(), volume: w.volume.trim() })).filter((w) => w.text);
  const photoRoom = MAX_PHOTOS - kept.length - added.length;

  const submit = useAct(
    () => {
      const body = { works: filled, problems, plan, photos: added };
      if (!report) return api.post<Report>('/reports', { ...body, date });
      const keptIds = new Set(kept.map((photo) => photo.id));
      const removePhotoIds = report.photos.filter((photo) => !keptIds.has(photo.id)).map((photo) => photo.id);
      return api.put<Report>(`/reports/${report.id}`, { ...body, removePhotoIds });
    },
    {
      invalidate: ['reports', 'overview'],
      done: report ? 'Отчёт обновлён и отправлен на проверку' : 'Отчёт отправлен начальнику',
      onSuccess: (saved) => navigate(`/reports/${saved.id}`, { replace: true }),
    },
  );

  const updateWork = (index: number, patch: Partial<WorkItem>) =>
    setWorks(works.map((work, i) => (i === index ? { ...work, ...patch } : work)));

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setProcessing(true);
    try {
      const picked = await Promise.all([...files].slice(0, photoRoom).map((file) => compressImage(file)));
      setAdded((current) => [...current, ...picked]);
      if (files.length > photoRoom) toast(`В отчёте не больше ${MAX_PHOTOS} фото`, 'error');
    } catch {
      toast('Не удалось обработать фото', 'error');
    } finally {
      setProcessing(false);
    }
  }

  if (date === null) {
    return <Empty icon={FileText} title="Все отчёты отправлены" text="За сегодня и три предыдущих дня отчёты уже есть." />;
  }

  return (
    <>
      {report ? (
        report.status === 'returned' &&
        report.reviewComment && (
          <div className="mb-3 flex gap-3 rounded-3xl bg-warn-soft p-4">
            <CircleAlert size={20} className="mt-0.5 shrink-0 text-warn" />
            <div>
              <p className="text-[13px] font-bold text-warn">Замечание начальника</p>
              <p className="mt-0.5 text-[15px] leading-snug">{report.reviewComment}</p>
            </div>
          </div>
        )
      ) : (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {dates.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === date}
              disabled={taken.has(option)}
              onClick={() => setDate(option)}
              className={cx(
                'h-11 shrink-0 rounded-full px-4 text-sm font-bold transition disabled:opacity-40',
                option === date ? 'bg-ink text-bg' : 'bg-surface text-muted shadow-card',
              )}
            >
              {option >= addDays(me.today, -1) ? fmtDate(option, me.today) : fmtDayShort(option)}
              {taken.has(option) && ' ✓'}
            </button>
          ))}
        </div>
      )}

      <Link to="/attendance" className="mt-3 flex items-center gap-3 rounded-3xl bg-surface p-4 shadow-card">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-info-soft text-info">
          <Users size={21} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-muted">По табелю за {fmtDate(date, me.today).toLowerCase()}</span>
          <span className="block font-bold">
            {stats ? `${stats.onSite} ${plural(stats.onSite, 'человек', 'человека', 'человек')} · ${fmtHours(hours)}` : '…'}
          </span>
        </span>
        {!!stats?.unmarked && <span className="text-[13px] font-bold text-accent">не отмечены: {stats.unmarked}</span>}
      </Link>

      <SectionTitle>Что сделали</SectionTitle>
      <div className="space-y-2.5">
        {works.map((work, index) => (
          <div key={index} className="rounded-3xl bg-surface p-3 shadow-card">
            <div className="flex items-start gap-2.5">
              <span className="mt-2 grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[12px] font-extrabold text-white">
                {index + 1}
              </span>
              <textarea
                rows={2}
                value={work.text}
                maxLength={300}
                aria-label={`Работа ${index + 1}`}
                placeholder="Например: бетонирование колонн 4 этажа"
                onChange={(e) => updateWork(index, { text: e.target.value })}
                className="min-w-0 flex-1 resize-none bg-transparent py-1.5 leading-snug outline-none placeholder:text-faint"
              />
              {works.length > 1 && (
                <button
                  type="button"
                  aria-label={`Убрать работу ${index + 1}`}
                  onClick={() => setWorks(works.filter((_, i) => i !== index))}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-faint"
                >
                  <X size={18} />
                </button>
              )}
            </div>
            <input
              value={work.volume}
              maxLength={60}
              aria-label={`Объём работы ${index + 1}`}
              placeholder="Объём: 18 м³, 3,2 т, 14 шт"
              onChange={(e) => updateWork(index, { volume: e.target.value })}
              className="mt-2 h-11 w-full rounded-xl bg-surface-2 px-3.5 outline-none ring-accent/50 placeholder:text-faint focus:ring-2"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setWorks([...works, { text: '', volume: '' }])}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-faint/50 text-[15px] font-bold text-muted"
        >
          <Plus size={18} /> Добавить работу
        </button>
      </div>

      <SectionTitle>Проблемы и простои</SectionTitle>
      <Textarea
        value={problems}
        maxLength={2000}
        aria-label="Проблемы и простои"
        placeholder="Не хватило материала, простой крана, погода… Если всё в порядке — оставьте пустым"
        onChange={(e) => setProblems(e.target.value)}
        className="bg-surface! shadow-card"
      />

      <SectionTitle>План на завтра</SectionTitle>
      <Textarea
        value={plan}
        maxLength={2000}
        aria-label="План на завтра"
        placeholder="Что будете делать и что для этого нужно"
        onChange={(e) => setPlan(e.target.value)}
        className="bg-surface! shadow-card"
      />

      <SectionTitle>Фото</SectionTitle>
      <div className="grid grid-cols-4 gap-2">
        {kept.map((photo) => (
          <Thumb key={photo.id} src={photo.url} onRemove={() => setKept(kept.filter((item) => item.id !== photo.id))} />
        ))}
        {added.map((src, index) => (
          <Thumb key={index} src={src} onRemove={() => setAdded(added.filter((_, i) => i !== index))} />
        ))}
        {photoRoom > 0 && (
          <label
            className={cx(
              'flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-faint/50 text-muted',
              processing && 'animate-pulse',
            )}
          >
            <Camera size={22} />
            <span className="text-[11px] font-bold">{processing ? 'Обработка' : 'Добавить'}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={processing}
              onChange={(e) => {
                void addPhotos(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>
      <p className="mt-2 px-1 text-[12px] text-faint">До {MAX_PHOTOS} фото. Снимки сжимаются перед отправкой.</p>

      <BottomBar>
        <Button className="flex-1" disabled={filled.length === 0 || processing || submit.isPending} onClick={() => submit.mutate()}>
          <Send size={18} /> {submit.isPending ? 'Отправляем…' : report ? 'Сохранить и отправить' : 'Отправить отчёт'}
        </Button>
      </BottomBar>
    </>
  );
}

function Thumb({ src, onRemove }: { src: string; onRemove: () => void }) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl bg-ink/6">
      <img src={src} alt="" className="size-full object-cover" />
      <button
        type="button"
        aria-label="Убрать фото"
        onClick={onRemove}
        className="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-black/60 text-white"
      >
        <X size={15} />
      </button>
    </div>
  );
}
