import { keepPreviousData, QueryClient, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, ApiError } from "./api";

// Screens render the last response at once (what makes tab switches feel
// native) and refresh in the background; client errors are not retried.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 30 * 60_000,
      retry: (failures, error) => !(error instanceof ApiError && error.status < 500) && failures < 2,
    },
  },
});

export type Query = Record<string, unknown>;

// Keys start with the API path, so a write can invalidate by prefix.
export const apiKey = (path: string, query?: Query) => (query ? [path, query] : [path]);

export function useApi<T>(path: string | null, query?: Query, opts: { staleTime?: number; keepPrevious?: boolean } = {}) {
  return useQuery<T>({
    queryKey: apiKey(path ?? "", query),
    queryFn: () => api<T>(path!, { query }),
    enabled: !!path,
    staleTime: opts.staleTime,
    placeholderData: opts.keepPrevious ? keepPreviousData : undefined,
  });
}

export function invalidate(...prefixes: string[]) {
  return queryClient.invalidateQueries({ predicate: (q) => prefixes.some((p) => String(q.queryKey[0]).startsWith(p)) });
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
