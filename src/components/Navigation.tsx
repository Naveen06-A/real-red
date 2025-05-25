import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { LogOut, User, Building, BarChart3, Users, LogIn } from 'lucide-react';
import { Logo } from './Logo';

export function Navigation() {
  const { user, profile, signOut } = useAuthStore();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/agent-login');
  };

  return (
    <nav className="bg-white shadow-md">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-2">
            <Logo size="md" />
          </Link>

          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <Link to="/agent-properties" className="text-gray-600 hover:text-blue-600 flex items-center space-x-1">
                  <User className="w-5 h-5" />
                  <span>Properties</span>
                </Link>

                {profile?.role === 'agent' && (
                  <>
                    <Link to="/property-form" className="text-gray-600 hover:text-blue-600 flex items-center space-x-1">
                      <Building className="w-5 h-5" />
                      <span>Submit Property</span>
                    </Link>
                    <Link to="/agent-dashboard" className="text-gray-600 hover:text-blue-600 flex items-center space-x-1">
                      <User className="w-5 h-5" />
                      <span>Agent Dashboard</span>
                    </Link>
                    <Link to="/reports" className="text-gray-600 hover:text-blue-600 flex items-center space-x-1">
                      <BarChart3 className="w-5 h-5" />
                      <span>Reports</span>
                    </Link>
                  </>
                )}

                {profile?.role === 'admin' && (
                  <>
                    <Link to="/admin" className="text-gray-600 hover:text-blue-600 flex items-center space-x-1">
                      <User className="w-5 h-5" />
                      <span>Admin Dashboard</span>
                    </Link>
                    <Link to="/agent-management" className="text-gray-600 hover:text-blue-600 flex items-center space-x-1">
                      <Users className="w-5 h-5" />
                      <span>User Management</span>
                    </Link>
                  </>
                )}

                <div className="flex items-center space-x-2">
                  <User className="w-5 h-5 text-gray-600" />
                  <span className="text-gray-600">{user.email || 'User'}</span>
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex items-center space-x-1 text-red-600 hover:text-red-700"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : (
              <>
                <Link to="/agent-login" className="text-gray-600 hover:text-blue-600 flex items-center space-x-1">
                  <LogIn className="w-5 h-5" />
                  <span>Agent Login</span>
                </Link>
                <Link to="/login" className="text-gray-600 hover:text-blue-600 flex items-center space-x-1">
                  <LogIn className="w-5 h-5" />
                  <span>Admin Login</span>
                </Link>
                <Link
                  to="/agent-register"
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center space-x-1"
                >
                  <User className="w-5 h-5" />
                  <span>Register</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}