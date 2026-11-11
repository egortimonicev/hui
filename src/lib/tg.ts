// Обёртка над Telegram WebApp SDK. В обычном браузере все вызовы — безопасные пустышки.

interface TelegramWebApp {
  initData: string;
  colorScheme: 'light' | 'dark';
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  onEvent?(event: string, handler: () => void): void;
  showConfirm?(message: string, callback: (confirmed: boolean) => void): void;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium'): void;
    notificationOccurred(type: 'success' | 'error'): void;
  };
  BackButton?: {
    show(): void;
    hide(): void;
    onClick(handler: () => void): void;
    offClick(handler: () => void): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
    TelegramWebviewProxy?: unknown;
  }
}

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js';
const LAUNCH_FLAG = 'brigada-tg-launch';

/** WebApp-объект, только если приложение действительно открыто внутри Telegram. */
export function tg(): TelegramWebApp | undefined {
  const app = window.Telegram?.WebApp;
  return app?.initData ? app : undefined;
}

export const initData = () => tg()?.initData ?? '';

/**
 * Подключает SDK только при запуске из Telegram, чтобы демо в браузере не зависело от telegram.org.
 * Вызывать до старта роутера: параметры запуска лежат в hash адреса.
 */
export async function initTelegram(): Promise<void> {
  const launched =
    location.hash.includes('tgWebAppData') ||
    'TelegramWebviewProxy' in window ||
    sessionStorage.getItem(LAUNCH_FLAG) === '1';
  if (!launched) return;
  sessionStorage.setItem(LAUNCH_FLAG, '1');

  await new Promise<void>((resolve) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.onload = script.onerror = () => resolve();
    document.head.append(script);
    setTimeout(resolve, 5000);
  });

  const app = tg();
  if (!app) return;
  app.ready();
  app.expand();
  app.disableVerticalSwipes?.();
}

/** Подтверждение опасного действия: нативное окно Telegram, а в браузере — обычный confirm. */
export function confirmDialog(message: string): Promise<boolean> {
  const app = tg();
  if (app?.showConfirm) return new Promise((resolve) => app.showConfirm!(message, resolve));
  return Promise.resolve(window.confirm(message));
}

export function haptic(kind: 'light' | 'success' | 'error' = 'light') {
  const feedback = tg()?.HapticFeedback;
  if (!feedback) return;
  if (kind === 'light') feedback.impactOccurred('light');
  else feedback.notificationOccurred(kind);
}
