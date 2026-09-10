import { useState, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./components/ui/Toast";
import Sidebar from "./components/layout/Sidebar";
import Topbar from "./components/layout/Topbar";
import ScrollTop from "./components/ui/ScrollTop";
import ErrorBoundary from "./components/ui/ErrorBoundary";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Borrowers from "./pages/Borrowers";
import BorrowerDetails from "./pages/BorrowerDetails";
import LoanRequests from "./pages/LoanRequests";
import LoanRequestDetail from "./pages/LoanRequestDetail";
import Loans from "./pages/Loans";
import LoanDetail from "./pages/LoanDetail";
import Cases from "./pages/Cases";
import FinancialOverview from "./pages/FinancialOverview";
import FinancialNews from "./pages/FinancialNews";
import FinancialNewsArticle from "./pages/FinancialNewsArticle";
import FinancialMarkets from "./pages/FinancialMarkets";
import FinancialMarketDetail from "./pages/FinancialMarketDetail";
import FinancialEconomy from "./pages/FinancialEconomy";
import FinancialCredit from "./pages/FinancialCredit";
import FinancialWatchlist from "./pages/FinancialWatchlist";
import FinancialAlerts from "./pages/FinancialAlerts";
import FinancialSources from "./pages/FinancialSources";
import Security from "./pages/Security";
import AdminModel from "./pages/AdminModel";
import AdminOverview from "./pages/AdminOverview";
import AdminApprovals from "./pages/AdminApprovals";
import AdminPolicies from "./pages/AdminPolicies";
import AdminSettings from "./pages/AdminSettings";
import AdminJobs from "./pages/AdminJobs";
import "./App.css";

function RequireAuth({ children }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>;
  if (!session) return <Navigate to="/auth" replace />;
  return children;
}

function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const location = useLocation();

  const prevPath = useRef(location.pathname);

  useEffect(() => {
    // Only clear the global search when leaving the Borrowers page,
    // so Topbar searches that navigate *to* /borrowers keep their query.
    if (prevPath.current === "/borrowers" && location.pathname !== "/borrowers") {
      setSearch("");
    }
    prevPath.current = location.pathname;
  }, [location.pathname]);

  return (
    <div className="app-layout">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className={`app-main ${collapsed ? "app-main-collapsed" : ""}`}>
        <Topbar searchQuery={search} onSearchChange={setSearch} />
        <div className="app-content">
          <ErrorBoundary>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/borrowers" element={<Borrowers searchQuery={search} />} />
            <Route path="/borrower/:id" element={<BorrowerDetails />} />
            <Route path="/loan-requests" element={<LoanRequests />} />
            <Route path="/loan-requests/:id" element={<LoanRequestDetail />} />
            <Route path="/loans" element={<Loans />} />
            <Route path="/loans/:id" element={<LoanDetail />} />
            <Route path="/cases" element={<Cases />} />
            <Route path="/financial-intelligence" element={<FinancialOverview />} />
            <Route path="/financial-intelligence/news" element={<FinancialNews />} />
            <Route path="/financial-intelligence/news/:id" element={<FinancialNewsArticle />} />
            <Route path="/financial-intelligence/markets" element={<FinancialMarkets />} />
            <Route path="/financial-intelligence/markets/:symbol" element={<FinancialMarketDetail />} />
            <Route path="/financial-intelligence/economy" element={<FinancialEconomy />} />
            <Route path="/financial-intelligence/credit" element={<FinancialCredit />} />
            <Route path="/financial-intelligence/watchlist" element={<FinancialWatchlist />} />
            <Route path="/financial-intelligence/alerts" element={<FinancialAlerts />} />
            <Route path="/financial-intelligence/sources" element={<FinancialSources />} />
            <Route path="/security" element={<Security />} />
            <Route path="/admin/overview" element={<AdminOverview />} />
            <Route path="/admin/approvals" element={<AdminApprovals />} />
            <Route path="/admin/model" element={<AdminModel />} />
            <Route path="/admin/policies" element={<AdminPolicies />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/jobs" element={<AdminJobs />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          </ErrorBoundary>
        </div>
        <ScrollTop />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/*" element={<RequireAuth><AppLayout /></RequireAuth>} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
