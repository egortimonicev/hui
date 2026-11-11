import type { ApiError } from '../../shared/types';
import { initData } from './tg';

const DEMO_KEY = 'brigada-demo-user';

/** Выбранный пользователь демо-режима (в Telegram не используется). */
export const demoUser = {
  get: (): number | null => Number(localStorage.getItem(DEMO_KEY)) || null,
  set(id: number | null) {
    if (id) localStorage.setItem(DEMO_KEY, String(id));
    else localStorage.removeItem(DEMO_KEY);
  },
};

export class ApiFail extends Error {
  status: number;
  data: ApiError;

  constructor(status: number, data: ApiError) {
    super(data.message);
    this.status = status;
    this.data = data;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const telegram = initData();
  const demoId = demoUser.get();
  if (telegram) headers.Authorization = `tma ${telegram}`;
  else if (demoId) headers['X-Demo-User'] = String(demoId);
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiFail(0, { error: 'network', message: 'Нет связи с сервером' });
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiFail(res.status, (data as ApiError | null) ?? { error: 'http', message: `Ошибка ${res.status}` });
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};
