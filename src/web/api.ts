import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { indexModel } from '../shared/derive';
import type { EntityName, Model } from '../shared/schema';

const USER_KEY = 'arch.user';

export function getUser(): string {
  try {
    return localStorage.getItem(USER_KEY) ?? '';
  } catch {
    return '';
  }
}
export function setUser(name: string) {
  try {
    localStorage.setItem(USER_KEY, name);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', 'x-user': encodeURIComponent(getUser()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText);
  return data as T;
}

export function useModel() {
  const q = useQuery({ queryKey: ['model'], queryFn: () => api<Model>('GET', '/api/model') });
  const idx = useMemo(() => (q.data ? indexModel(q.data) : null), [q.data]);
  return { ...q, model: q.data, idx };
}

type Collection = EntityName | 'scenarios';

/** Create/update/delete for any collection; refreshes the shared model afterwards. */
export function useSave() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ['model'] });
  const create = useMutation({
    mutationFn: ({ collection, body }: { collection: Collection; body: unknown }) => api('POST', `/api/${collection}`, body),
    onSuccess: done,
  });
  const update = useMutation({
    mutationFn: ({ collection, id, body }: { collection: Collection; id: string; body: unknown }) =>
      api('PUT', `/api/${collection}/${id}`, body),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: ({ collection, id }: { collection: Collection; id: string }) => api('DELETE', `/api/${collection}/${id}`),
    onSuccess: done,
  });
  return { create, update, remove };
}

export const newId = () => crypto.randomUUID();
