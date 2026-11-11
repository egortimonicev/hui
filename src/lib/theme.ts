import { tg } from './tg';

export type ThemeMode = 'auto' | 'light' | 'dark';

const KEY = 'brigada-theme';

export const getThemeMode = (): ThemeMode => (localStorage.getItem(KEY) as ThemeMode | null) ?? 'auto';

/** «Авто» берёт тему из Telegram, а в браузере — из системы. */
export function applyTheme(mode: ThemeMode = getThemeMode()) {
  const system = tg()?.colorScheme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = mode === 'auto' ? system : mode;

  const css = getComputedStyle(document.documentElement);
  const bg = css.getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  const app = tg();
  app?.setHeaderColor?.(bg);
  app?.setBackgroundColor?.(bg);
  app?.setBottomBarColor?.(css.getPropertyValue('--surface').trim());
}

export function setThemeMode(mode: ThemeMode) {
  localStorage.setItem(KEY, mode);
  applyTheme(mode);
}

export function initTheme() {
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());
  tg()?.onEvent?.('themeChanged', () => applyTheme());
}
