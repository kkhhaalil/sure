// Shapes of the /api/v1 responses the app reads. Only the fields used here.

export type Pagination = { page: number; per_page: number; total_count: number; total_pages: number };

export type CategoryRef = { id: string; name: string; color: string; icon?: string; lucide_icon?: string; parent_id?: string | null };

export type Transaction = {
  id: string;
  entry_id: string;
  date: string;
  amount: string;
  amount_cents: number;
  signed_amount_cents: number;
  currency: string;
  name: string;
  notes: string | null;
  classification: "income" | "expense";
  kind: string;
  excluded: boolean;
  reviewed_at: string | null;
  account: { id: string; name: string; account_type: string };
  category: CategoryRef | null;
  merchant: { id: string; name: string; logo_url?: string | null } | null;
  tags: { id: string; name: string; color: string }[];
  transfer: unknown | null;
};

export type Budget = {
  id: string;
  start_date: string;
  end_date: string;
  currency: string;
  current: boolean;
  initialized: boolean;
  budgeted_spending_cents: number | null;
  actual_spending_cents: number;
  available_to_spend_cents: number;
  expected_income_cents: number | null;
  actual_income_cents: number;
};

export type BudgetCategory = {
  id: string;
  budget_id: string;
  currency: string;
  subcategory: boolean;
  rollover_enabled: boolean;
  budgeted_spending_cents: number;
  actual_spending_cents: number;
  available_to_spend_cents: number;
  category: CategoryRef;
};

export type PacePoint = { date: string; actual_cumulative_cents: number; ideal_cumulative_cents: number };

export type Recurring = {
  id: string;
  name: string;
  amount: string;
  amount_cents: number;
  currency: string;
  next_expected_date: string | null;
  status: string;
  autopay: boolean | null;
  expected_amount_min_cents: number | null;
  expected_amount_max_cents: number | null;
  merchant?: { id: string; name: string } | null;
};

export type Account = {
  id: string;
  name: string;
  balance: string;
  balance_cents: number;
  currency: string;
  classification: "asset" | "liability";
  account_type: string;
  subtype: string | null;
  status: string;
  institution_name: string | null;
  institution_domain: string | null;
  logo_url: string | null;
};

export type SpendingRow = { id: string; name: string; color: string; total: string; normal: string | null; change: string | null; ratio: string | null };
export type SpendingVsNormal = { currency: string; total: string; normal_total: string | null; comparable: boolean; categories: SpendingRow[] };

export type Holding = {
  id: string;
  qty: string;
  price: string;
  amount: string;
  avg_cost: string | null;
  security: { id: string; ticker: string; name: string };
  account: { id: string; name: string };
};

export type Insight = { id: string; type: string; title: string; body: string; priority: string; status: string; period_start: string | null };

export type Message = { id: string; role: string; type: string; content: string; status: string; created_at: string; tool_calls?: { function_name: string }[] };
export type Chat = { id: string; title: string; messages?: Message[] };

export type Suggestion = { category_id: string; name: string; color: string; confidence: number; source: string };

export type ProviderConnection = {
  id: string;
  name: string;
  provider: string;
  status: string;
  requires_update: boolean;
  sync?: { latest?: { status: string; completed_at: string | null } | null } | null;
};
