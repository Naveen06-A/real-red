import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { Lock, Mail, AlertCircle, CheckCircle, LogIn, Loader2 } from 'lucide-react';

export function AgentLogin() {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, initializeAuth, fetchProfile, loading: authLoading } = useAuthStore();
  const successMessage = location.state?.message;

  // Redirect if already logged in as agent
  useEffect(() => {
    if (user && profile?.role === 'agent') {
      console.log('Redirecting to agent-dashboard: User and profile verified', { user, profile });
      navigate('/agent-dashboard');
    }
  }, [user, profile, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError(null);
    setResetMessage(null);
  };

  const handleAgentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetMessage(null);
    setLoading(true);

    try {
      // Test Supabase connectivity
      const { data: testQuery, error: testError } = await supabase.from('profiles').select('count').limit(1);
      console.log('Supabase connectivity test:', { testQuery, testError });
      if (testError) throw new Error(`Supabase connectivity error: ${testError.message}`);

      // Sign in with Supabase
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });
      console.log('Auth Response:', { user: data?.user, session: data?.session, error: signInError });

      if (signInError) throw new Error(signInError.message || 'Invalid email or password.');
      if (!data.user) throw new Error('No user data returned from login.');

      // Initialize auth and fetch profile
      console.log('Initializing auth for user:', data.user.id);
      await initializeAuth();
      let currentProfile = useAuthStore.getState().profile;

      // Direct fetch if profile is null
      if (!currentProfile) {
        console.log('Profile not found after initializeAuth, attempting direct fetch...');
        await fetchProfile();
        currentProfile = useAuthStore.getState().profile;
      }

      console.log('Fetched Profile:', currentProfile);

      if (!currentProfile) {
        throw new Error(
          'Profile not found. Verify that the profiles table has a row with id matching the user ID from auth.users. ' +
          'Ensure read permissions are set for authenticated users. Register at /agent-register or contact support.'
        );
      }

      if (currentProfile.role === 'agent') {
        console.log('Role verified as agent, navigating to dashboard');
        navigate('/agent-dashboard');
      } else {
        console.log('Non-agent role detected:', currentProfile.role);
        navigate('/login', {
          state: { message: 'Access denied: This page is for agents only. Please use the standard login.' },
        });
      }
    } catch (err: any) {
      console.error('Login Error:', err);
      let errorMessage = err.message || 'Login failed. Please check your credentials and try again.';
      if (err.message.includes('permission denied')) {
        errorMessage = 'Permission denied: Unable to access profiles table. Check Supabase security rules for authenticated users.';
      } else if (err.message.includes('no rows found') || err.code === 'PGRST116') {
        errorMessage = 'No profile found for this user. Ensure the profile’s id matches the auth.users ID. Register at /agent-register.';
      } else if (err.message.includes('column') || err.message.includes('does not exist')) {
        errorMessage = 'Database schema error: The profiles table columns may be misconfigured. Verify the schema and query.';
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!formData.email) {
      setError('Please enter your email to reset your password.');
      return;
    }

    setLoading(true);
    setError(null);
    setResetMessage(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
        redirectTo: 'http://localhost:3000/reset-password',
      });

      if (error) throw new Error(error.message || 'Failed to send password reset email.');
      setResetMessage('Password reset email sent! Check your inbox.');
    } catch (err: any) {
      console.error('Forgot Password Error:', err);
      setError(err.message || 'Failed to send password reset email.');
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[600px]">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        <span className="ml-2">Loading...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto mt-12">
      <div className="bg-white p-8 rounded-lg shadow-lg min-h-[600px]">
        <div className="flex items-center justify-center mb-6">
          <LogIn className="w-8 h-8 text-blue-600 mr-2" />
          <h1 className="text-2xl font-bold text-gray-900">Agent Login</h1>
        </div>

        {successMessage && (
          <div className="bg-green-50 text-green-600 p-4 rounded mb-4 flex items-center space-x-2">
            <CheckCircle className="w-5 h-5" />
            <p>{successMessage}</p>
          </div>
        )}
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded mb-4 flex items-start space-x-2">
            <AlertCircle className="w-5 h-5 mt-0.5" />
            <p>{error}</p>
          </div>
        )}
        {resetMessage && (
          <div className="bg-green-50 text-green-600 p-4 rounded mb-4 flex items-center space-x-2">
            <CheckCircle className="w-5 h-5" />
            <p>{resetMessage}</p>
          </div>
        )}

        <form onSubmit={handleAgentLogin} className="space-y-6">
          <div>
            <label className="block text-gray-700 mb-2">Agent Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full pl-10 p-3 border rounded-lg"
                placeholder="your.email@agency.com"
                required
                disabled={loading}
              />
            </div>
          </div>
          <div>
            <label className="block text-gray-700 mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                className="w-full pl-10 p-3 border rounded-lg"
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>
          </div>
          <button
            type="submit"
            className={`w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 flex items-center justify-center ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Sign In'} {!loading && <LogIn className="w-5 h-5 ml-2" />}
          </button>
          <div className="text-center">
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-blue-600 hover:underline text-sm"
              disabled={loading}
            >
              Forgot Password?
            </button>
          </div>
          <p className="text-center text-gray-600">
            Not an agent? <Link to="/agent-register" className="text-blue-600 hover:underline">Register Now</Link>
          </p>
        </form>
      </div>
    </div>
  );
}