// Lancely shared-backend types.
// Matches the web FastAPI contract documented in MOBILE_INTEGRATION_BRIEF.md.

export type User = {
  id: string;
  email: string;
  name: string;
  business_name?: string;
  trn?: string;
  address?: string;
  phone?: string;
  website?: string;
  currency?: string;
  theme?: string;
  created_at?: string;
  // Local-only (RevenueCat client-side):
  is_pro?: boolean;
};

export type Client = {
  id: string;
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  trn?: string | null;
  notes?: string | null;
  user_id?: string;
  created_at?: string;
};

export type ProjectStatus = "active" | "on_hold" | "completed" | "cancelled";

export type Project = {
  id: string;
  name: string;
  client_id?: string | null;
  status: ProjectStatus;
  deadline?: string | null;
  value?: number;
  notes?: string | null;
  user_id?: string;
  created_at?: string;
};

export const PROJECT_STATUSES: { key: ProjectStatus; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "on_hold", label: "On Hold" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

export type LineItem = {
  description: string;
  quantity: number;
  rate: number;
};

export type QuotationStatus = "draft" | "sent" | "accepted" | "rejected";

export type Quotation = {
  id: string;
  number?: string;
  client_id: string;
  title?: string;
  issue_date?: string;
  valid_until?: string;
  notes?: string;
  status: QuotationStatus;
  items: LineItem[];
  subtotal?: number;
  vat?: number;
  total?: number;
  currency?: string;
  user_id?: string;
  created_at?: string;
};

// UI-friendly alias — code still says "Quote" everywhere
export type Quote = Quotation;
export type QuoteItem = LineItem;

export type InvoiceStatus = "unpaid" | "paid" | "overdue";

export type Payment = {
  id: string;
  amount: number;
  method?: string;
  payment_date?: string;
  notes?: string;
};

export type Invoice = {
  id: string;
  number?: string;
  client_id: string;
  project_id?: string | null;
  title?: string;
  issue_date?: string;
  due_date?: string;
  notes?: string;
  status: InvoiceStatus;
  items: LineItem[];
  subtotal?: number;
  vat?: number;
  total?: number;
  paid_amount?: number;
  payment_date?: string | null;
  payments?: Payment[];
  currency?: string;
  user_id?: string;
  created_at?: string;
};

export type DashboardStats = {
  total_clients: number;
  unpaid_count: number;
  unpaid_amount: number;
  overdue_count: number;
  overdue_amount: number;
  active_projects: number;
  total_revenue: number;
  monthly_earnings: { month: string; label?: string; earnings?: number; amount?: number }[];
  recent_invoices: Invoice[];
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  ref_id: string;
  created_at: string;
};

export type CurrencyOption = {
  code: string;
  symbol: string;
  name: string;
  locale?: string;
};
