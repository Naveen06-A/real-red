import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { LogOut, Home, FilePlus, LayoutDashboard, UserCircle, PieChart, Users, LogIn, Shield, Link as LinkIcon, Star, UserPlus } from 'lucide-react';
import { motion } from 'framer-motion';
import { Logo } from './Logo';

export function Navigation() {
  const { user, profile, signOut } = useAuthStore();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/agent-login');
  };

  // Animation variants for icons
  const iconVariants = {
    initial: { scale: 1, rotate: 0 },
    hover: { scale: 1.2, rotate: profile?.role === 'agent' ? 360 : 45, transition: { duration: 0.5 } }
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
                  <motion.div variants={iconVariants} initial="initial" whileHover="hover">
                    <Home className="w-5 h-5" />
                  </motion.div>
                  <span>Properties</span>
                </Link>

                {profile?.role === 'agent' && (
                  <>
                    <Link to="/property-form" className="text-gray-600 hover:text-blue-600 flex items-center space-x-1">
                      <motion.div variants={iconVariants} initial="initial" whileHover="hover">
                        <FilePlus className="w-5 h-5" />
                      </motion.div>
                      <span>Submit Property</span>
                    </Link>
                    <Link to="/agent-dashboard" className="text-gray-600 hover:text-blue-600 flex items-center space-x-1">
                      <motion.div variants={iconVariants} initial="initial" whileHover="hover">
                        <LayoutDashboard className="w-5 h-5" />
                      </motion.div>
                      <span>Agent Dashboard</span>
                    </Link>
                    <Link to="/agent-profile" className="text-gray-600 hover:text-blue-600 flex items-center space-x-1">
                      <motion.div className="relative" variants={iconVariants} initial="initial" whileHover="hover">
                        <UserCircle className="w-5 h-5" />
                        <motion.div className="absolute -top-1 -right-1" animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 1 }}>
                          <Star className="w-3 h-3 text-blue-600" fill="#3B82F6" />
                        </motion.div>
                      </motion.div>
                      <span>Profile</span>
                    </Link>
                    <Link to="/reports" className="text-gray-600 hover:text-blue-600 flex items-center space-x-1">
                      <motion.div variants={iconVariants} initial="initial" whileHover="hover">
                        <PieChart className="w-5 h-5" />
                      </motion.div>
                      <span>Reports</span>
                    </Link>
                  </>
                )}

                {profile?.role === 'admin' && (
                  <>
                    <Link to="/admin" className="text-gray-600 hover:text-blue-600 flex items-center space-x-1">
                      <Shield className="w-5 h-5" />
                      <span>Admin</span>
                    </Link>
                    <Link to="/agent-management" className="text-gray-600 hover:text-blue-600 flex items-center space-x-1">
                      <Users className="w-5 h-5" />
                      <span>Agents</span>
                    </Link>
                    
                    <a href="https://asrtovibe.netlify.app/" target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-blue-600 flex items-center space-x-1">
                      <LinkIcon className="w-5 h-5" />
                      <span>AstroVibe</span>
                    </a>
                  </>
                )}

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
                <Link to="/admin-login" className="text-gray-600 hover:text-blue-600 flex items-center space-x-1">
                  <LogIn className="w-5 h-5" />
                  <span>Admin Login</span>
                </Link>
                <Link
                  to="/agent-register"
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center space-x-1"
                >
                  <motion.div variants={iconVariants} initial="initial" whileHover="hover">
                    <UserPlus className="w-5 h-5" />
                  </motion.div>
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