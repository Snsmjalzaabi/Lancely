import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { BillingProvider } from '@/contexts/BillingContext';
import AppShell from '@/components/layout/AppShell';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Dashboard from '@/pages/Dashboard';
import Clients from '@/pages/Clients';
import Quotations from '@/pages/Quotations';
import QuotationEditor from '@/pages/QuotationEditor';
import Invoices from '@/pages/Invoices';
import InvoiceEditor from '@/pages/InvoiceEditor';
import Projects from '@/pages/Projects';
import Payments from '@/pages/Payments';
import Recurring from '@/pages/Recurring';
import RecurringEditor from '@/pages/RecurringEditor';
import Expenses from '@/pages/Expenses';
import Reports from '@/pages/Reports';
import ActivityFeed from '@/pages/ActivityFeed';
import PublicInvoice from '@/pages/PublicInvoice';
import Settings from '@/pages/Settings';
import Pricing from '@/pages/Pricing';
import '@/App.css';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function ThemedRoot({ children }) {
  const { theme } = useTheme();
  return (
    <div className={`min-h-screen bg-background text-foreground ${theme === 'dark' ? 'dark' : ''}`}>{children}</div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ThemedRoot>
        <AuthProvider>
          <BrowserRouter>
            <BillingProvider>
              <Routes>
                <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
                <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="clients" element={<Clients />} />
                  <Route path="quotations" element={<Quotations />} />
                  <Route path="quotations/new" element={<QuotationEditor />} />
                  <Route path="quotations/:id" element={<QuotationEditor />} />
                  <Route path="invoices" element={<Invoices />} />
                  <Route path="invoices/new" element={<InvoiceEditor />} />
                  <Route path="invoices/:id" element={<InvoiceEditor />} />
                  <Route path="projects" element={<Projects />} />
                  <Route path="payments" element={<Payments />} />
                  <Route path="recurring" element={<Recurring />} />
                  <Route path="recurring/new" element={<RecurringEditor />} />
                  <Route path="recurring/:id" element={<RecurringEditor />} />
                  <Route path="expenses" element={<Expenses />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="activity" element={<ActivityFeed />} />
                  <Route path="settings" element={<Settings />} />
                </Route>
                <Route path="/p/:token" element={<PublicInvoice />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
              <Toaster position="top-right" richColors />
            </BillingProvider>
          </BrowserRouter>
        </AuthProvider>
      </ThemedRoot>
    </ThemeProvider>
  );
}

export default App;
