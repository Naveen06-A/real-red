import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { Users, Plus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';

interface Agent {
  id: string;
  email: string;
  role: 'user' | 'agent' | 'admin';
  permissions: {
    canRegisterProperties: boolean;
    canEditProperties: boolean;
    canDeleteProperties: boolean;
  };
  name?: string;
  phone?: string;
}

export function AgentManagement() {
  const { profile } = useAuthStore();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState('');

  // Check if user is admin
  if (profile?.role !== 'admin') {
    return <div className="text-red-600">Unauthorized access</div>;
  }

  // Fetch agents
  useEffect(() => {
    const fetchAgents = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, email, role, permissions, name, phone')
          .in('role', ['agent', 'admin']);
        if (error) throw error;
        setAgents(data || []);
      } catch (error: any) {
        console.error('Fetch agents error:', error);
        toast.error('Failed to fetch agents: ' + error.message);
      } finally {
        setLoading(false);
      }
    };
    fetchAgents();
  }, []);

  // Generate secure password
  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  // Handle admin creation
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Use predefined email and password for Praveen.sha@harcourts.com.au
      const adminEmail = 'Praveen.sha@harcourts.com.au';
      const password = 'K9#mP2vL@x5N'; // Predefined password

      // Check if user already exists
      const { data: existingUser, error: fetchError } = await supabase
        .from('auth.users')
        .select('id')
        .eq('email', adminEmail)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw new Error(`Error checking existing user: ${fetchError.message}`);
      }

      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Create user in Supabase auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: adminEmail,
        password,
        email_confirm: true,
      });

      if (authError) {
        console.error('Auth error:', authError);
        throw new Error(`Failed to create user: ${authError.message}`);
      }

      if (!authData.user?.id) {
        throw new Error('User creation succeeded but no user ID returned');
      }

      // Insert profile in profiles table
      const profileData = {
        id: authData.user.id,
        email: adminEmail,
        role: 'admin' as const,
        permissions: {
          canRegisterProperties: true,
          canEditProperties: true,
          canDeleteProperties: true,
        },
        name: newAdminName || adminEmail.split('@')[0],
        phone: '',
      };

      const { error: profileError } = await supabase.from('profiles').insert(profileData);

      if (profileError) {
        console.error('Profile error:', profileError);
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }

      toast.success(`Admin created! Email: ${adminEmail}, Password: ${password}`);
      setAgents([...agents, profileData]);
      setShowModal(false);
      setNewAdminEmail('');
      setNewAdminName('');
      setGeneratedPassword('');
    } catch (error: any) {
      console.error('Create admin error:', error);
      toast.error(error.message || 'Failed to create admin');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-6 flex items-center">
        <Users className="w-6 h-6 mr-2" />
        Agent Management
      </h2>

      <button
        onClick={() => {
          setShowModal(true);
          setNewAdminEmail('Praveen.sha@harcourts.com.au');
          setGeneratedPassword('K9#mP2vL@x5N');
        }}
        className="mb-4 flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        <Plus className="w-5 h-5 mr-2" />
        Create Admin
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Create New Admin</h3>
            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Name (Optional)
                </label>
                <input
                  id="name"
                  type="text"
                  value={newAdminName}
                  onChange={(e) => setNewAdminName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  id="password"
                  type="text"
                  value={generatedPassword}
                  readOnly
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-600 rounded hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Existing Agents & Admins</h3>
        {loading ? (
          <div className="flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Email</th>
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Role</th>
                <th className="text-left py-2">Permissions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id} className="border-b">
                  <td className="py-2">{agent.email}</td>
                  <td className="py-2">{agent.name || '-'}</td>
                  <td className="py-2">{agent.role}</td>
                  <td className="py-2">
                    {Object.entries(agent.permissions)
                      .filter(([_, value]) => value)
                      .map(([key]) => key)
                      .join(', ') || 'None'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}