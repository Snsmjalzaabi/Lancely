export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
};

export type Client = {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  notes?: string;
  created_at: string;
};

export type ProjectStatus = "lead" | "proposal_sent" | "in_progress" | "review" | "completed";

export type Project = {
  id: string;
  name: string;
  client_id: string;
  value: number;
  status: ProjectStatus;
  start_date?: string | null;
  due_date?: string | null;
  notes?: string;
  created_at: string;
};

export type QuoteItem = { service: string; description?: string; price: number };

export type Quote = {
  id: string;
  quote_number: string;
  client_id: string;
  title: string;
  items: QuoteItem[];
  notes: string;
  amount: number;
  status: "draft" | "sent" | "accepted" | "rejected";
  created_at: string;
};

export type InvoiceStatus = "pending" | "paid" | "partial" | "overdue";

export type Invoice = {
  id: string;
  invoice_number: string;
  client_id: string;
  project_id?: string | null;
  amount: number;
  paid_amount: number;
  status: InvoiceStatus;
  due_date: string;
  paid_date?: string | null;
  notes: string;
  created_at: string;
};

export type DashboardStats = {
  active_clients: number;
  active_projects: number;
  pending_invoices_amount: number;
  overdue_invoices_amount: number;
  revenue_this_month: number;
  total_earned: number;
  outstanding_balance: number;
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  ref_id: string;
  created_at: string;
};

export const PROJECT_STATUSES: { key: ProjectStatus; label: string }[] = [
  { key: "lead", label: "Lead" },
  { key: "proposal_sent", label: "Proposal Sent" },
  { key: "in_progress", label: "In Progress" },
  { key: "review", label: "Review" },
  { key: "completed", label: "Completed" },
];
