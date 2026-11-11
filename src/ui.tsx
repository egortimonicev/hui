import type { UseQueryResult } from '@tanstack/react-query';
import { ChevronLeft, CloudOff, HardHat, X, type LucideIcon } from 'lucide-react';
import {
  useEffect,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { initials } from './lib/format';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

// ---------- Кнопки

type ButtonVariant = 'primary' | 'dark' | 'soft' | 'danger' | 'ok';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white',
  dark: 'bg-ink text-bg',
  soft: 'bg-ink/6 text-ink',
  danger: 'bg-bad-soft text-bad',
  ok: 'bg-ok text-white',
};

export function Button({
  variant = 'primary',
  small,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; small?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-2 font-bold transition active:scale-[0.97] disabled:opacity-45',
        small ? 'h-10 rounded-xl px-4 text-sm' : 'h-13 rounded-2xl px-5 text-[15px]',
        BUTTON_VARIANT[variant],
        className,
      )}
    />
  );
}

/** Плавающая кнопка создания над нижним меню. */
export function Fab({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <>
      {/* Запас прокрутки, чтобы кнопка не закрывала последний элемент списка. */}
      <div className="h-16" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[480px] justify-end px-4 pb-[calc(88px+env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClick}
          className="pointer-events-auto flex h-13 items-center gap-2 rounded-full bg-accent pr-5 pl-4 text-[15px] font-bold text-white shadow-fab transition active:scale-95"
        >
          <Icon size={20} strokeWidth={2.6} />
          {label}
        </button>
      </div>
    </>
  );
}

/** Закреплённая внизу панель действий на полноэкранных страницах. */
export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[480px] gap-2.5 border-t border-line bg-surface/95 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur-xl">
      {children}
    </div>
  );
}

export function Logo({ size = 64 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center bg-accent text-white shadow-fab"
      style={{ width: size, height: size, borderRadius: size * 0.3 }}
    >
      <HardHat size={size * 0.56} strokeWidth={2.2} />
    </span>
  );
}

// ---------- Мелкие элементы

export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'bad' | 'info' | 'violet';

export const TONE: Record<Tone, string> = {
  neutral: 'bg-ink/6 text-muted',
  accent: 'bg-accent-soft text-accent',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
  violet: 'bg-violet-soft text-violet',
};

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-bold whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function IconTile({ icon: Icon, tone = 'accent', className }: { icon: LucideIcon; tone?: Tone; className?: string }) {
  return (
    <span className={cx('grid size-11 shrink-0 place-items-center rounded-2xl', TONE[tone], className)}>
      <Icon size={21} />
    </span>
  );
}

const AVATAR_COLORS = [
  'bg-[#ffe1cc] text-[#a8480c]',
  'bg-[#d9ecff] text-[#17569f]',
  'bg-[#dcf5e3] text-[#1a7242]',
  'bg-[#ece4ff] text-[#5a3cc0]',
  'bg-[#ffe3ea] text-[#b02a52]',
  'bg-[#fff0c2] text-[#8a5a00]',
  'bg-[#d8f3f1] text-[#136b66]',
];

export function Avatar({ id, name, size = 44 }: { id: number; name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className={cx('grid shrink-0 place-items-center rounded-full font-extrabold', AVATAR_COLORS[id % AVATAR_COLORS.length])}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials(name)}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-3xl bg-surface p-4 shadow-card', className)}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-6 mb-2.5 flex items-center justify-between px-1">
      <h2 className="text-[17px] font-extrabold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

// ---------- Каркас страницы

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('px-4 pb-8', className)}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  back,
  right,
}: {
  title: string;
  subtitle?: string;
  /** Куда вести кнопку «назад», если истории переходов нет. */
  back?: string;
  right?: ReactNode;
}) {
  const navigate = useNavigate();
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(back ?? '/', { replace: true });
  };
  return (
    <header className="flex items-center gap-3 pt-5 pb-4">
      {back && (
        <button
          type="button"
          aria-label="Назад"
          onClick={goBack}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-surface shadow-card"
        >
          <ChevronLeft size={22} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[26px] leading-8 font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

export function Empty({ icon: Icon, title, text, children }: { icon: LucideIcon; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-ink/6 text-faint">
        <Icon size={28} />
      </span>
      <p className="mt-4 text-[17px] font-bold">{title}</p>
      {text && <p className="mt-1 text-sm text-muted">{text}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-3xl bg-ink/6" />
      ))}
    </div>
  );
}

/** Показывает скелет, ошибку с повтором или данные запроса. */
export function Loadable<T>({ query, rows, children }: { query: UseQueryResult<T>; rows?: number; children: (data: T) => ReactNode }) {
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.isError) {
    return (
      <Empty icon={CloudOff} title="Не удалось загрузить" text={query.error.message}>
        <Button small variant="soft" onClick={() => void query.refetch()}>
          Повторить
        </Button>
      </Empty>
    );
  }
  return <Skeleton rows={rows} />;
}

// ---------- Шторка снизу

export function Sheet({
  open,
  onClose,
  title,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 animate-fade bg-black/55" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[92dvh] w-full max-w-[480px] animate-sheet flex-col rounded-t-[28px] bg-surface"
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line" />
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-3 pb-3">
          <h2 className="min-w-0 truncate text-xl font-extrabold tracking-tight">{title}</h2>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-ink/6 text-muted"
          >
            <X size={18} />
          </button>
        </div>
        <div className={cx('min-h-0 flex-1 overflow-y-auto px-5', !footer && 'pb-[max(20px,env(safe-area-inset-bottom))]')}>
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 gap-2.5 border-t border-line px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ---------- Поля форм

const FIELD =
  'w-full rounded-2xl bg-surface-2 px-4 text-ink outline-none ring-accent/50 transition placeholder:text-faint focus:ring-2';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-[13px] font-bold text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[12px] text-faint">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(FIELD, 'h-13', className)} />;
}

export function Textarea({ className, rows = 3, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} {...props} className={cx(FIELD, 'resize-none py-3.5 leading-snug', className)} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cx(FIELD, 'h-13 appearance-none', className)}>
      {children}
    </select>
  );
}

/** Выбор одного варианта кнопками — удобнее выпадающего списка, когда вариантов мало. */
export function Choice<T extends string | number | null>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; tone?: Tone }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cx(
              'h-11 rounded-xl px-4 text-sm font-bold transition',
              active ? (option.tone ? TONE[option.tone] : 'bg-ink text-bg') : 'bg-surface-2 text-muted',
              active && option.tone && 'ring-2 ring-current',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="flex rounded-2xl bg-ink/6 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cx(
            'flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition',
            option.value === value ? 'bg-raised text-ink shadow-card' : 'text-muted',
          )}
        >
          {option.label}
          {!!option.count && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] text-white">
              {option.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold">{label}</span>
        {hint && <span className="block text-[13px] text-muted">{hint}</span>}
      </span>
      <span className={cx('relative h-7 w-12 shrink-0 rounded-full transition', checked ? 'bg-accent' : 'bg-faint/50')}>
        <span
          className={cx('absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition', checked && 'translate-x-5')}
        />
      </span>
    </button>
  );
}

// ---------- Всплывающие сообщения

interface ToastState {
  id: number;
  text: string;
  kind: 'ok' | 'error';
}

let currentToast: ToastState | null = null;
const toastListeners = new Set<() => void>();

function setToast(next: ToastState | null) {
  currentToast = next;
  toastListeners.forEach((listener) => listener());
}

export function toast(text: string, kind: 'ok' | 'error' = 'ok') {
  const id = Date.now();
  setToast({ id, text, kind });
  setTimeout(() => currentToast?.id === id && setToast(null), 2800);
}

export function Toaster() {
  const state = useSyncExternalStore(
    (listener) => {
      toastListeners.add(listener);
      return () => toastListeners.delete(listener);
    },
    () => currentToast,
  );
  if (!state) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-4" role="status">
      <div
        key={state.id}
        className={cx(
          'max-w-[440px] animate-pop rounded-2xl px-4 py-3 text-sm font-bold shadow-card',
          state.kind === 'error' ? 'bg-bad text-white' : 'bg-ink text-bg',
        )}
      >
        {state.text}
      </div>
    </div>,
    document.body,
  );
}
