import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Home } from './pages/Home';
import { AdminDashboard } from './pages/AdminDashboard';
import { PropertyForm } from './pages/PropertyForm';
import { PropertyList } from './pages/PropertyList';
import { PropertyDetail } from './pages/PropertyDetail';
import { Navigation } from './components/Navigation';
import { AgentLogin } from './pages/AgentLogin';
import { AgentDashboard } from './pages/AgentDashboard';
import { Reports } from './pages/Reports';
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
import { CommissionByAgency } from './pages/CommissionByAgency';
import { ComparisonReport } from './pages/Comparisons';
import { CreateAdmin } from './pages/CreateAdmin';
// import { AgentManagement } from './pages/AgentManagement';
import { AdminLogin } from './pages/AdminLogin'; // Added import for AdminLogin

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();

  console.log('PrivateRoute - loading:', loading, 'user:', user);

  if (loading) {
    return <LoadingOverlay message="Authenticating..." />;
  }

  return user ? <>{children}</> : <Navigate to="/agent-login" />;
}

function AgentRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuthStore();

  console.log('AgentRoute - loading:', loading, 'profile:', profile);

  if (loading) {
    return <LoadingOverlay message="Verifying agent..." />;
  }

  return profile?.role === 'agent' || profile?.role === 'admin' ? <>{children}</> : <Navigate to="/agent-login" />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuthStore();

  console.log('AdminRoute - loading:', loading, 'profile:', profile);

  if (loading) {
    return <LoadingOverlay message="Verifying admin..." />;
  }

  return profile?.role === 'admin' ? <>{children}</> : <Navigate to="/login" />;
}

function RouteChangeTracker() {
  const location = useLocation();
  const [isRouteLoading, setIsRouteLoading] = useState(false);

  useEffect(() => {
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
    console.log('App initializing auth...');
    setAppLoading(true);
    initializeAuth()
      .then(() => {
        const state = useAuthStore.getState();
        console.log('App auth initialized - user:', state.user, 'profile:', state.profile);
      })
      .catch((err) => {
        console.error('Auth initialization failed:', err);
      })
      .finally(() => {
        setAppLoading(false);
      });
  }, [initializeAuth]);

  console.log('App - authLoading:', authLoading, 'appLoading:', appLoading);

  if (appLoading) {
    return <LoadingOverlay message="Loading your experience..." />;
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 transition-all">
        <Navigation />
        <RouteChangeTracker />
        <main className="container mx-auto px-4 py-8 animate-fade-in">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/agent-login" element={<AgentLogin />} />
            <Route path="/login" element={<AdminLogin />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/agent-register" element={<AgentRegister />} />
            <Route path="/progress-report" element={<ProgressReportPage />} />
            <Route path="/comparisons" element={<ComparisonReport />} />
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              }
            />
            <Route
              path="/create-admin"
              element={
                <AdminRoute>
                  <CreateAdmin />
                </AdminRoute>
              }
            />
          
            <Route
              path="/agent-dashboard"
              element={
                <AgentRoute>
                  <AgentDashboard />
                </AgentRoute>
              }
            />
            <Route
              path="/agent-dashboard/door-knocks"
              element={
                <AgentRoute>
                  <DoorKnocks />
                </AgentRoute>
              }
            />
            <Route
              path="/agent-dashboard/phone-calls"
              element={
                <AgentRoute>
                  <PhoneCalls />
                </AgentRoute>
              }
            />
            <Route
              path="/marketing-plan"
              element={
                <AgentRoute>
                  <MarketingPlanPage />
                </AgentRoute>
              }
            />
            <Route
              path="/activity-logger"
              element={
                <AgentRoute>
                  <ActivityLogger />
                </AgentRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <AgentRoute>
                  <Reports />
                </AgentRoute>
              }
            />
            <Route path="/agent-properties" element={<PropertyList />} />
            <Route path="/property-detail/:id" element={<PropertyDetail />} />
            <Route
              path="/market-reports"
              element={
                <PrivateRoute>
                  <MarketReports />
                </PrivateRoute>
              }
            />
            <Route
              path="/property-prediction/:id"
              element={
                <PrivateRoute>
                  <PropertyPrediction />
                </PrivateRoute>
              }
            />
            <Route
              path="/property-form"
              element={
                <AgentRoute>
                  <PropertyForm />
                </AgentRoute>
              }
            />
            <Route
              path="/commission-by-agency"
              element={
                <AgentRoute>
                  <CommissionByAgency />
                </AgentRoute>
              }
            />
            <Route path="/unauthorized" element={<div className="text-center p-8">Unauthorized Access</div>} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;