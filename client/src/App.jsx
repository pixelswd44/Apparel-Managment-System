import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { DirtyProvider } from './lib/dirtyContext';
import { AuthProvider, useAuth, canAccess } from './lib/authContext';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import SetupWizard from './pages/SetupWizard';
import Overview from './pages/Overview';
import Quotations from './pages/Quotations';
import QuotationForm from './pages/QuotationForm';
import QuotationTemplates from './pages/QuotationTemplates';
import Invoices from './pages/Invoices';
import InvoiceForm from './pages/InvoiceForm';
import Purchases from './pages/Purchases';
import Inventory from './pages/Inventory';
import Expenses from './pages/Expenses';
import Financials from './pages/Financials';
import Clients from './pages/Clients';
import Payroll from './pages/Payroll';
import MockupGenerator from './pages/MockupGenerator';
import Settings from './pages/Settings';
import Products from './pages/Products';
import ProductForm from './pages/ProductForm';
import Projects from './pages/Projects';
import Vendors from './pages/Vendors';
import Templates from './pages/Templates';
import ResetPassword from './pages/ResetPassword';
import api from './lib/api';

// Full-screen spinner
function Spinner() {
  return (
    <div className="min-h-screen bg-[#0f0f11] flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-white/20 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );
}

// Guard: redirect to login if not authenticated, or / if wrong role
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function AppRoutes({ needsWizard, onWizardComplete }) {
  const { user, loading, login } = useAuth();

  // Show wizard on fresh install
  if (needsWizard) {
    return (
      <SetupWizard onComplete={async ({ username, password, autoLogin, skipWizard }) => {
        if (skipWizard) { onWizardComplete(false); return; }
        if (autoLogin && username && password) {
          try { await login(username, password); } catch {}
        }
        onWizardComplete(false);
        window.location.replace('/');
      }} />
    );
  }

  if (loading) return <Spinner />;
  // Public reset-password route — accessible without login
  const isResetPage = window.location.pathname === '/reset-password';
  if (isResetPage) return <ResetPassword />;

  if (!user) return <Login />;

  return (
    <DirtyProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/"                   element={<Overview />} />
          <Route path="/quotations"         element={<ProtectedRoute path="/quotations"><Quotations /></ProtectedRoute>} />
          <Route path="/quotations/new"     element={<ProtectedRoute path="/quotations"><QuotationForm /></ProtectedRoute>} />
          <Route path="/quotations/:id/edit" element={<ProtectedRoute path="/quotations"><QuotationForm /></ProtectedRoute>} />
          <Route path="/quotation-templates" element={<ProtectedRoute path="/quotations"><QuotationTemplates /></ProtectedRoute>} />
          <Route path="/invoices"           element={<ProtectedRoute path="/invoices"><Invoices /></ProtectedRoute>} />
          <Route path="/invoices/new"       element={<ProtectedRoute path="/invoices"><InvoiceForm /></ProtectedRoute>} />
          <Route path="/invoices/:id/edit"  element={<ProtectedRoute path="/invoices"><InvoiceForm /></ProtectedRoute>} />
          <Route path="/purchases"          element={<ProtectedRoute path="/invoices"><Purchases /></ProtectedRoute>} />
          <Route path="/inventory"          element={<ProtectedRoute path="/inventory"><Inventory /></ProtectedRoute>} />
          <Route path="/products"           element={<ProtectedRoute path="/products"><Products /></ProtectedRoute>} />
          <Route path="/products/new"       element={<ProtectedRoute path="/products"><ProductForm /></ProtectedRoute>} />
          <Route path="/products/:id/edit"  element={<ProtectedRoute path="/products"><ProductForm /></ProtectedRoute>} />
          <Route path="/projects"           element={<ProtectedRoute path="/projects"><Projects /></ProtectedRoute>} />
          <Route path="/vendors"            element={<ProtectedRoute path="/vendors"><Vendors /></ProtectedRoute>} />
          <Route path="/expenses"           element={<ProtectedRoute path="/expenses"><Expenses /></ProtectedRoute>} />
          <Route path="/financials"         element={<ProtectedRoute path="/financials"><Financials /></ProtectedRoute>} />
          <Route path="/clients"            element={<ProtectedRoute path="/clients"><Clients /></ProtectedRoute>} />
          <Route path="/payroll"            element={<ProtectedRoute path="/payroll"><Payroll /></ProtectedRoute>} />
          <Route path="/mockup-generator"   element={<MockupGenerator />} />
          <Route path="/templates"          element={<ProtectedRoute path="/templates"><Templates /></ProtectedRoute>} />
          <Route path="/settings"           element={<ProtectedRoute path="/settings"><Settings /></ProtectedRoute>} />
        </Route>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*"      element={<Navigate to="/" replace />} />
      </Routes>
    </DirtyProvider>
  );
}

export default function App() {
  const [setupChecked, setSetupChecked] = useState(false);
  const [needsWizard, setNeedsWizard]   = useState(false);

  useEffect(() => {
    api.get('/setup/status')
      .then(r => {
        setNeedsWizard(r.data.needs_wizard);
        setSetupChecked(true);
      })
      .catch(() => setSetupChecked(true));
  }, []);

  if (!setupChecked) return <Spinner />;

  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes
          needsWizard={needsWizard}
          onWizardComplete={(stillNeeds) => setNeedsWizard(stillNeeds)}
        />
      </BrowserRouter>
    </AuthProvider>
  );
}
