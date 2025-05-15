import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { UserPlus, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { Navigation } from './components/Navigation';

interface FormData {
  email: string;
  password: string;
  name: string;
  phone: string;
  agencyName: string;
}

export function AgentRegister() {
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: '',
    name: '',
    phone: '',
    agencyName: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setUser, fetchProfile } = useAuthStore();

  const validateForm = (): string | null => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.name.trim()) return 'Name is required';
    if (!formData.phone.trim() || !/^\+?\d{9,15}$/.test(formData.phone)) return 'Valid phone number is required';
    if (!emailRegex.test(formData.email)) return 'Valid email is required';
    if (!formData.agencyName.trim()) return 'Agency name is required';
    if (formData.password.length < 6) return 'Password must be at least 6 characters long';
    return null;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value.trim() }));
    setError(null);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      // First check if user exists
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('email')
        .eq('email', formData.email)
        .single();

      if (existingUser) {
        setError('This email is already registered. Please try logging in instead.');
        setLoading(false);
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            name: formData.name,
            phone: formData.phone,
          },
        },
      });

      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
          setError('This email is already registered. Please try logging in instead.');
        } else {
          throw new Error(`Registration failed: ${signUpError.message}`);
        }
        return;
      }

      if (!data.user) throw new Error('No user data returned from registration');

      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        name: formData.name,
        phone: formData.phone,
        email: formData.email,
        role: 'agent',
        agency_name: formData.agencyName,
      });

      if (profileError) throw new Error(`Profile creation failed: ${profileError.message}`);

      setUser(data.user);
      await fetchProfile();

      navigate('/agent-login', {
        state: { message: 'Registration successful! Please check your email to confirm, then log in.' },
      });
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <div className="bg-white p-8 rounded-lg shadow-md">
        <div className="flex items-center justify-center mb-6">
          <UserPlus className="w-12 h-12 text-blue-600" />
          <h2 className="text-2xl font-bold ml-2">Register as Agent</h2>
        </div>
        {error && (
          <div className="bg-red-50 text-red-500 p-4 rounded mb-4 flex items-start space-x-2">
            <AlertCircle className="w-5 h-5 mt-0.5" />
            <div>
              <p>{error}</p>
              {error.includes('already registered') && (
                <Link to="/agent-login" className="text-blue-600 hover:underline">
                  Go to Login
                </Link>
              )}
            </div>
          </div>
        )}
        <form onSubmit={handleRegister} className="space-y-4">
          {['name', 'email', 'phone', 'agencyName', 'password'].map((field) => (
            <div key={field}>
              <label htmlFor={field} className="block text-gray-700 mb-1 capitalize">
                {field.replace('agencyName', 'Agency Name')}
              </label>
              <input
                id={field}
                name={field}
                type={field === 'email' ? 'email' : field === 'password' ? 'password' : field === 'phone' ? 'tel' : 'text'}
                value={formData[field as keyof FormData]}
                onChange={handleChange}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                disabled={loading}
                required
                minLength={field === 'password' ? 6 : undefined}
              />
            </div>
          ))}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
            disabled={loading}
          >
            {loading ? 'Registering...' : 'Register'}
          </button>
          <p className="text-center text-sm text-gray-600">
            Already registered?{' '}
            <Link to="/agent-login" className="text-blue-600 hover:underline">
              Login here
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}