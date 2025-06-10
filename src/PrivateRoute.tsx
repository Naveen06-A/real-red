import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const PrivateRoute = ({ children, adminOnly = false }: { children: JSX.Element; adminOnly?: boolean }) => {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/admin-login" />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/unauthorized" />;
  return children;
};

export default PrivateRoute;