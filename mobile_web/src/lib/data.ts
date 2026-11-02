import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "./api";

// A small stale-while-revalidate cache: screens render the last response
// immediately (what makes tab switches feel native), then refresh in place.
type Entry = { data?: unknown; error?: Error; promise?: Promise<unknown>; at: number };

const cache = new Map<string, Entry>();
const subscribers = new Map<string, Set<() => void>>();

function notify(key: string) {
  subscribers.get(key)?.forEach((fn) => fn());
}

function keyFor(path: string, query?: Record<string, unknown>) {
  return query ? `${path}?${JSON.stringify(query)}` : path;
}

async function load(key: string, path: string, query?: Record<string, unknown>) {
  const entry = cache.get(key) ?? { at: 0 };
  if (entry.promise) return entry.promise;
  const promise = api(path, { query })
    .then((data) => {
      cache.set(key, { data, at: Date.now() });
      return data;
    })
    .catch((error: Error) => {
      cache.set(key, { ...entry, promise: undefined, error, at: Date.now() });
      throw error;
    })
    .finally(() => notify(key));
  cache.set(key, { ...entry, promise });
  notify(key);
  return promise;
}

export function useApi<T>(path: string | null, query?: Record<string, unknown>, maxAgeMs = 30_000) {
  const key = path ? keyFor(path, query) : "";
  const queryRef = useRef(query);
  queryRef.current = query;

  const subscribe = useCallback(
    (fn: () => void) => {
      if (!key) return () => {};
      const set = subscribers.get(key) ?? new Set();
      set.add(fn);
      subscribers.set(key, set);
      return () => set.delete(fn);
    },
    [key],
  );
  const snapshot = useSyncExternalStore(subscribe, () => (key ? cache.get(key) : undefined));

  useEffect(() => {
    if (!path) return;
    const entry = cache.get(key);
    if (!entry || Date.now() - entry.at > maxAgeMs) load(key, path, queryRef.current).catch(() => {});
  }, [key, path, maxAgeMs]);

  const reload = useCallback(() => (path ? load(key, path, queryRef.current) : Promise.resolve()), [key, path]);

  return {
    data: snapshot?.data as T | undefined,
    error: snapshot?.error,
    loading: !!snapshot?.promise && snapshot?.data === undefined,
    refreshing: !!snapshot?.promise,
    reload,
  };
}

// Writes go through here so the screens reading those resources refresh.
export function invalidate(prefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      const entry = cache.get(key)!;
      cache.set(key, { ...entry, at: 0 });
      notify(key);
    }
  }
}

export function setCached<T>(path: string, query: Record<string, unknown> | undefined, update: (data: T) => T) {
  const key = keyFor(path, query);
  const entry = cache.get(key);
  if (entry?.data === undefined) return;
  cache.set(key, { ...entry, data: update(entry.data as T) });
  notify(key);
}

export function clearCache() {
  cache.clear();
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener("online", on);
    addEventListener("offline", off);
    return () => {
      removeEventListener("online", on);
      removeEventListener("offline", off);
    };
  }, []);
  return online;
}
