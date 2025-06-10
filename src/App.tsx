import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Home } from './pages/Home';
import  {PropertyForm } from './pages/PropertyForm';
import { PropertyList } from './pages/PropertyList';
import { PropertyDetail } from './pages/PropertyDetail';
import { Navigation } from './components/Navigation';
import { AgentLogin } from './pages/AgentLogin';
import { AgentDashboard } from './pages/AgentDashboard';
import { Reports } from './pages/Reports';
import { AgentReports } from './agent-reports';
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
import { LoadingOverlay } from './components/LoadingOverlay';
import { PropertyReportPage  } from './pages/PropertyReportPage';
import CommissionByAgency from './pages/CommissionByAgency';
import Comparisons from './pages/Comparisons';
import AdminCommissionByAgency from './pages/AdminCommissionByAgency';
import { AdminLogin } from './pages/AdminLogin';
import { AdminDashboard } from './pages/AdminDashboard';

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

function RouteChangeTracker() {
  const location = useLocation();
  const [isRouteLoading, setIsRouteLoading] = useState(false);

  useEffect(() => {
    console.log('Route changed to:', location.pathname);
    setIsRouteLoading(true);
    const timer = setTimeout(() => setIsRouteLoading(false), 1000);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  return isRouteLoading ? <LoadingOverlay message="Loading page..." /> : null;
}

function App() {
  const { initializeAuth, loading: authLoading } = useAuthStore();
  const [appLoading, setAppLoading] = useState(true);

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
        if (isMounted) setAppLoading(false);
      }
    };

    initAuth();

    return () => {
      isMounted = false;
      console.log('App cleanup');
    };
  }, [initializeAuth]); // Stable dependency

  console.log('App render - authLoading:', authLoading, 'appLoading:', appLoading);

  if (appLoading || authLoading) {
    return <LoadingOverlay message="Loading your experience..." />;
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 transition-all">
        <Navigation />
        <RouteChangeTracker />
        <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} closeOnClick draggable pauseOnHover />
        <main className="container mx-auto px-4 py-8 animate-fade-in">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/agent-login" element={<AgentLogin />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/agent-register" element={<AgentRegister />} />
            <Route path="/admin-login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
            <Route path="/admin-commission" element={<AdminRoute><AdminCommissionByAgency /></AdminRoute>} />
            <Route path="/progress-report" element={<ProgressReportPage />} />
            <Route path="/admin-dashboard" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
            <Route path="/agent-dashboard" element={<AgentRoute><AgentDashboard /></AgentRoute>} />
            <Route path="/agent-dashboard/door-knocks" element={<AgentRoute><DoorKnocks /></AgentRoute>} />
            <Route path="/agent-dashboard/phone-calls" element={<AgentRoute><PhoneCalls /></AgentRoute>} />
            <Route path="/marketing-plan" element={<MarketingPlanPage />} />
            <Route path='/property-report-page' element={<PropertyReportPage />}/>
            <Route path="/activity-logger" element={<AgentRoute><ActivityLogger /></AgentRoute>} />
            <Route path="/reports" element={<AgentRoute><Reports /></AgentRoute>} />
            <Route path="/agent-properties" element={<PropertyList />} />
            <Route path="/property-detail/:id" element={<PropertyDetail />} />
            <Route path="/market-reports" element={<PrivateRoute><MarketReports /></PrivateRoute>} />
            <Route path="/property-prediction/:id" element={<PrivateRoute><PropertyPrediction /></PrivateRoute>} />
            <Route path="/property-form" element={<PropertyForm />} />
            <Route path="/comparisons" element={<AgentRoute><Comparisons /></AgentRoute>} />
            <Route
              path="/commission-by-agency"
              element={
                <AgentRoute>
                  <CommissionByAgency commissionByAgency={{}} properties={[]} />
                </AgentRoute>
              }
            />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
export default App;