import { useEffect, useState, Component, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Home } from './pages/Home';
import { PropertyForm } from './pages/PropertyForm';
import { PropertyList } from './pages/PropertyList';
import { PropertyDetail } from './pages/PropertyDetail';
import { Navigation } from './components/Navigation';
import { CreateAgentModal } from './components/CreateAgentModal';
import { AgentLogin } from './pages/AgentLogin';
import { AgentDashboard } from './pages/AgentDashboard';
import { Reports } from './pages/Reports';
import { AgentReports } from './pages/AgentReports';
import { AgentRegister } from './pages/AgentRegister';
import { useAuthStore } from './store/authStore';
import { PropertyPrediction } from './pages/PropertyPrediction';
import { MarketReports } from './pages/MarketReports';
import { MarketingPlanPage } from './pages/MarketingPlan';
import { DoorKnocks } from './pages/DoorKnocks';
import { PhoneCalls } from './pages/PhoneCalls';
import { ActivityLogger } from './pages/ActivityLogger';
import { ResetPassword } from './components/ResetPassword';
import { ProgressReportPage } from './pages/ProgressReportPage';
import { PropertyReportPage } from './pages/PropertyReportPage';
import  CommissionByAgency  from './pages/CommissionByAgency';
import  Comparisons  from './pages/Comparisons';
import  AdminCommissionByAgency  from './pages/AdminCommissionByAgency';
import { AdminLogin } from './pages/AdminLogin';
import { AdminDashboard } from './pages/AdminDashboard';
import { AgentManagement } from './pages/AgentManagement';
import AgentBusinessPlan from './pages/AgentBusinessPlan'; // Updated import (assuming default export)
import {AgentProfilePage} from './pages/AgentProfilePage';
import {AgentExpensesPage} from './pages/AgentExpensesPage';

import { LoadingOverlay } from './components/LoadingOverlay';

// Error Boundary to catch import or runtime errors
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: any }> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-7xl mx-auto p-6 text-center">
          <h1 className="text-3xl font-bold text-red-600">Something Went Wrong</h1>
          <p className="text-gray-600 mt-4">{this.state.error?.toString() || 'An unexpected error occurred.'}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// PrivateRoute for general authenticated users
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  console.log('PrivateRoute - loading:', loading, 'user:', !!user);
  if (loading) return <LoadingOverlay message="Authenticating..." />;
  return user ? <>{children}</> : <Navigate to="/agent-login" replace />;
}

// AgentRoute for agents and admins
function AgentRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuthStore();
  console.log('AgentRoute - loading:', loading, 'profile:', profile, 'user:', !!user);
  if (loading) return <LoadingOverlay message="Verifying access..." />;
  if (user && (profile?.role === 'agent' || profile?.role === 'admin')) return <>{children}</>;
  return <Navigate to="/agent-login" replace />;
}

// AdminRoute for admin-only access
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuthStore();
  console.log('AdminRoute - loading:', loading, 'profile:', profile);
  if (loading) return <LoadingOverlay message="Verifying admin..." />;
  return profile?.role === 'admin' ? <>{children}</> : <Navigate to="/admin-login" replace />;
}

// RouteChangeTracker for loading overlay during route changes
function RouteChangeTracker() {
  const location = useLocation();
  const [isRouteLoading, setIsRouteLoading] = useState(false);

  useEffect(() => {
    console.log('Route changed to:', location.pathname);
    setIsRouteLoading(true);
    const timer = setTimeout(() => setIsRouteLoading(false), 500); // Reduced timeout for smoother UX
    return () => clearTimeout(timer);
  }, [location.pathname]);

  return isRouteLoading ? <LoadingOverlay message="Loading page..." /> : null;
}

// Centralized route definitions
const routes = [
  { path: '/', element: <Home /> },
  { path: '/agent-login', element: <AgentLogin /> },
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/agent-register', element: <AgentRegister /> },
  { path: '/admin-login', element: <AdminLogin /> },
  { path: '/admin', element: <AdminRoute><AdminDashboard /></AdminRoute> },
  { path: '/admin-commission', element: <AdminRoute><AdminCommissionByAgency /></AdminRoute> },
  { path: '/progress-report', element: <ProgressReportPage /> },
  { path: '/admin-dashboard', element: <AdminRoute><AdminDashboard /></AdminRoute> },
  { path: '/agent-dashboard', element: <AgentRoute><AgentDashboard /></AgentRoute> },
  { path: '/agent-management', element: <AgentRoute><AgentManagement /></AgentRoute> },
  { path: '/agent-business-plan', element: <AgentRoute><AgentBusinessPlan /></AgentRoute> }, // Updated path
  { path: '/agent-profile', element: <AgentRoute><AgentProfilePage /></AgentRoute> },
  { path: '/agent-reports', element: <AgentReports /> },
  { path: '/agent-dashboard/door-knocks', element: <AgentRoute><DoorKnocks /></AgentRoute> },
  {path: '/agent-expenses', element: <AgentRoute><AgentExpensesPage /></AgentRoute>},
  { path: '/agent-dashboard/phone-calls', element: <AgentRoute><PhoneCalls /></AgentRoute> },
  { path: '/marketing-plan', element: <MarketingPlanPage /> },
  { path: '/property-report-page', element: <PropertyReportPage /> },
  { path: '/create-agent-modal', element: <AdminRoute><CreateAgentModal /></AdminRoute> },
  { path: '/progress-report-page', element: <AgentRoute><ProgressReportPage /></AgentRoute> },
  { path: '/activity-logger', element: <AgentRoute><ActivityLogger /></AgentRoute> },
  { path: '/reports', element: <AgentRoute><Reports /></AgentRoute> },
  { path: '/agent-properties', element: <PropertyList /> },
  { path: '/property-detail/:id', element: <PropertyDetail /> },
  { path: '/market-reports', element: <PrivateRoute><MarketReports /></PrivateRoute> },
  { path: '/property-prediction/:id', element: <PrivateRoute><PropertyPrediction /></PrivateRoute> },
  { path: '/property-form', element: <PropertyForm /> },
  { path: '/comparisons', element: <AgentRoute><Comparisons /></AgentRoute> },
  {
    path: '/commission-by-agency',
    element: (
      <AgentRoute>
        <CommissionByAgency commissionByAgency={null} properties={null} />
      </AgentRoute>
    ),
  },
  { path: '*', element: <div className="text-center py-12 text-gray-600">404 - Page Not Found</div> }, // 404 route
];

function App() {
  const { initializeAuth, loading: authLoading } = useAuthStore();

  useEffect(() => {
    console.log('Starting app initialization');
    let isMounted = true;

    const initAuth = async () => {
      try {
        await initializeAuth();
        const state = useAuthStore.getState();
        console.log('App auth initialized - user:', !!state.user, 'profile:', state.profile);
      } catch (err) {
        console.error('Auth initialization failed:', err);
      } finally {
        if (isMounted) {
          console.log('App initialization complete');
        }
      }
    };

    initAuth();

    return () => {
      isMounted = false;
      console.log('App cleanup');
    };
  }, [initializeAuth]);

  if (authLoading) {
    return <LoadingOverlay message="Loading your experience..." />;
  }

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <div className="min-h-screen bg-gray-50 transition-all">
          <Navigation />
          <RouteChangeTracker />
          <ToastContainer
            position="top-right"
            autoClose={3000}
            hideProgressBar={false}
            closeOnClick
            draggable
            pauseOnHover
          />
          <main className="container mx-auto px-4 py-8 animate-fade-in">
            <Routes>
              {routes.map(({ path, element }) => (
                <Route key={path} path={path} element={element} />
              ))}
            </Routes>
          </main>
        </div>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;