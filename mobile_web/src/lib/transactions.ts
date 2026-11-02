import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { isoDate, today } from "./format";
import { invalidate, queryClient, useApi } from "./query";
import type { Budget, Transaction } from "./types";

export type TransactionPage = { transactions: Transaction[]; pagination: { page: number; total_pages: number; total_count: number } };

// The review queue: unreviewed spending and income from the last 30 days.
export const reviewQuery = (perPage: number) => ({
  reviewed: false,
  exclude_transfers: true,
  per_page: perPage,
  start_date: isoDate(new Date(Date.now() - 30 * 86_400_000)),
});

// Any list already on screen has the row, so a sheet opens with content.
export function cachedTransaction(id: string): Transaction | undefined {
  for (const [, data] of queryClient.getQueriesData<TransactionPage | { pages: TransactionPage[] }>({ predicate: (q) => q.queryKey[0] === "/transactions" })) {
    const pages = data && "pages" in data ? data.pages : data ? [data] : [];
    for (const page of pages) {
      const found = page.transactions?.find((t) => t.id === id);
      if (found) return found;
    }
  }
}

export function useTransaction(id: string) {
  return useQuery({
    queryKey: [`/transactions/${id}`],
    queryFn: () => api<Transaction>(`/transactions/${id}`),
    initialData: () => cachedTransaction(id),
    initialDataUpdatedAt: 0, // shown at once, then refreshed
  });
}

// Drop rows from every cached unreviewed list at once, so the next ones
// move up before the server answers.
function removeFromReviewLists(ids: string[]) {
  queryClient.setQueriesData<TransactionPage>({ predicate: (q) => q.queryKey[0] === "/transactions" && (q.queryKey[1] as { reviewed?: boolean } | undefined)?.reviewed === false }, (page) =>
    page?.transactions
      ? {
          ...page,
          transactions: page.transactions.filter((t) => !ids.includes(t.id)),
          pagination: { ...page.pagination, total_count: Math.max(0, page.pagination.total_count - page.transactions.filter((t) => ids.includes(t.id)).length) },
        }
      : page,
  );
}

function settle() {
  return invalidate("/transactions", "/budget", "/cash_flow", "/spending_vs_normal");
}

export function usePatchTransaction() {
  return useMutation({
    mutationFn: ({ id, attrs }: { id: string; attrs: Record<string, unknown> }) => api<Transaction>(`/transactions/${id}`, { method: "PATCH", body: { transaction: attrs } }),
    onMutate: ({ id, attrs }) => {
      if (attrs.reviewed) removeFromReviewLists([id]);
    },
    onSuccess: (updated) => queryClient.setQueryData([`/transactions/${updated.id}`], updated),
    onSettled: settle,
  });
}

export function useMarkReviewed() {
  return useMutation({
    mutationFn: (ids: string[]) => api<{ reviewed_count: number }>("/transactions/review", { method: "POST", body: { ids } }),
    onMutate: (ids) => removeFromReviewLists(ids),
    onSettled: settle,
  });
}

// Budgets list without spending amounts, so read the current one's detail.
export function useCurrentBudget() {
  const start = isoDate(new Date(today().getFullYear(), today().getMonth(), 1));
  const list = useApi<{ budgets: Budget[] }>("/budgets", { start_date: start, per_page: 5 });
  const summary = list.data?.budgets.find((b) => b.current) ?? list.data?.budgets[0];
  const detail = useApi<Budget>(summary ? `/budgets/${summary.id}` : null);
  return {
    budget: detail.data,
    // No budget this month is an answer, not a load in progress.
    missing: list.isSuccess && !summary,
    isError: list.isError || detail.isError,
    refetch: () => (list.isError ? list.refetch() : detail.refetch()),
  };
}
