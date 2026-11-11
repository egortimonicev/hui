import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import type {
  Announcement,
  AppConfig,
  AttendanceDay,
  AttendanceMonth,
  Brigade,
  MaterialRequest,
  Me,
  Overview,
  Report,
  Task,
  User,
} from '../../shared/types';
import { toast } from '../ui';
import { api } from './api';
import { haptic } from './tg';

export interface Session {
  me: Me;
  config: AppConfig;
  /** Демо-режим: вернуться к выбору пользователя. */
  logout: () => void;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('Нет сессии');
  return session;
}

export const useAnnouncements = () =>
  useQuery({ queryKey: ['announcements'], queryFn: () => api.get<Announcement[]>('/announcements') });

export const useTasks = () => useQuery({ queryKey: ['tasks'], queryFn: () => api.get<Task[]>('/tasks') });

export const useUsers = () => useQuery({ queryKey: ['users'], queryFn: () => api.get<User[]>('/users') });

export const useBrigades = () => useQuery({ queryKey: ['brigades'], queryFn: () => api.get<Brigade[]>('/brigades') });

export const useRequests = (enabled = true) =>
  useQuery({ queryKey: ['requests'], queryFn: () => api.get<MaterialRequest[]>('/requests'), enabled });

export const useReports = (enabled = true) =>
  useQuery({ queryKey: ['reports'], queryFn: () => api.get<Report[]>('/reports'), enabled });

export const useOverview = (enabled = true) =>
  useQuery({ queryKey: ['overview'], queryFn: () => api.get<Overview>('/overview'), enabled });

export const attendanceKey = (brigadeId: number | null, date: string) => ['attendance', brigadeId, date] as const;

export const useAttendanceDay = (brigadeId: number | null, date: string, enabled = true) =>
  useQuery({
    queryKey: attendanceKey(brigadeId, date),
    queryFn: () => api.get<AttendanceDay>(`/attendance?date=${date}&brigadeId=${brigadeId ?? ''}`),
    enabled: enabled && brigadeId !== null,
  });

export const useAttendanceMonth = (brigadeId: number | null, month: string, enabled = true) =>
  useQuery({
    queryKey: ['attendance-month', brigadeId, month],
    queryFn: () => api.get<AttendanceMonth>(`/attendance/month?month=${month}&brigadeId=${brigadeId ?? ''}`),
    enabled,
  });

/** Мутация с общим поведением: обновить связанные списки, показать тост, дать вибро-отклик. */
export function useAct<V = void, R = unknown>(
  fn: (vars: V) => Promise<R>,
  options: { invalidate?: string[]; done?: string; onSuccess?: (result: R, vars: V) => void } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result, vars) => {
      for (const key of options.invalidate ?? []) void queryClient.invalidateQueries({ queryKey: [key] });
      if (options.done) toast(options.done);
      haptic('success');
      options.onSuccess?.(result, vars);
    },
    onError: (error: Error) => {
      toast(error.message, 'error');
      haptic('error');
    },
  });
}
