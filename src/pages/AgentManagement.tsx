import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import toast, { Toaster } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Plus, Loader2, Pencil, Trash2, Home, Copy, Download, Share2, Eye } from 'lucide-react';
import { Agent } from '../types';

interface AgentDetails {
  email: string;
  name: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

interface CreateAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  fetchAgents: () => Promise<void>;
  fetchProperties: () => Promise<void>;
}

export function CreateAgentModal({ isOpen, onClose, fetchAgents, fetchProperties }: CreateAgentModalProps) {
  const { profile } = useAuthStore();
  const [agentDetails, setAgentDetails] = useState<AgentDetails>({
    email: '',
    name: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id: string; email: string; name: string; phone: string; password: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const handleCreateAgent = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setSuccess(null);

      if (!agentDetails.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(agentDetails.email)) {
        throw new Error('Please enter a valid email address');
      }
      if (!agentDetails.name) {
        throw new Error('Please enter a name');
      }
      if (!agentDetails.phone) {
        throw new Error('Please enter a phone number');
      }
      if (!agentDetails.password || agentDetails.password.length < 6) {
        throw new Error('Password is required and must be at least 6 characters long');
      }
      if (agentDetails.password !== agentDetails.confirmPassword) {
        throw new Error('Passwords do not match');
      }

      if (!profile || profile.role !== 'admin') {
        throw new Error('Only admins can create new agent accounts');
      }

      console.log('Attempting to create agent with:', {
        email: agentDetails.email,
        name: agentDetails.name,
        phone: agentDetails.phone,
      });

      let authData;
      let authError;

      try {
        const { data, error } = await supabase.auth.signUp({
          email: agentDetails.email,
          password: agentDetails.password,
          options: {
            data: {
              name: agentDetails.name,
              phone: agentDetails.phone,
              role: 'agent',
            },
          },
        });
        authData = data;
        authError = error;
      } catch (signUpError: any) {
        console.warn('signUp failed, attempting admin.createUser:', signUpError);
        const { data, error } = await supabase.auth.admin.createUser({
          email: agentDetails.email,
          password: agentDetails.password,
          email_confirm: true,
          user_metadata: {
            name: agentDetails.name,
            phone: agentDetails.phone,
            role: 'agent',
          },
        });
        authData = data;
        authError = error;
      }

      if (authError) {
        console.error('Supabase auth error:', authError);
        if (authError.code === 'user_already_exists') {
          throw new Error('This email is already registered. Please use a different email.');
        }
        throw new Error(`Authentication error: ${authError.message}`);
      }
      if (!authData.user) {
        throw new Error('Failed to create agent: No user returned');
      }

      const { error: agentError } = await supabase
        .from('agents')
        .upsert(
          {
            id: authData.user.id,
            email: agentDetails.email,
            name: agentDetails.name,
            phone: agentDetails.phone,
            role: 'agent',
          },
          { onConflict: 'id' }
        );

      if (agentError) {
        throw new Error(`Failed to create agent record: ${agentError.message}`);
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: authData.user.id,
            email: agentDetails.email,
            name: agentDetails.name,
            phone: agentDetails.phone,
            role: 'agent',
            permissions: {
              canRegisterProperties: true,
              canEditProperties: true,
              canDeleteProperties: false,
            },
          },
          { onConflict: 'id' }
        );

      if (profileError) {
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }

      const { error: credentialError } = await supabase
        .from('agent_credentials')
        .insert({
          agent_id: authData.user.id,
          password: agentDetails.password,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });

      if (credentialError) {
        throw new Error(`Failed to store credentials: ${credentialError.message}`);
      }

      try {
        await useAuthStore.getState().fetchProfile(authData.user.id, agentDetails.email);
      } catch (profileFetchError) {
        console.warn('Profile fetch failed, but continuing:', profileFetchError);
      }

      setSuccess({
        id: authData.user.id,
        email: agentDetails.email,
        name: agentDetails.name,
        phone: agentDetails.phone,
        password: agentDetails.password,
      });

      toast.success(
        `Agent created: ${agentDetails.email} (ID: ${authData.user.id})\nPassword: ${agentDetails.password}\nPlease share this securely.`,
        {
          duration: 15000,
          style: { background: '#3B82F6', color: '#fff', borderRadius: '8px', maxWidth: '500px' },
        }
      );

      await fetchAgents();
      await fetchProperties();
    } catch (err: any) {
      const errorMessage = err.message || 'An unexpected error occurred';
      setError(errorMessage);
      toast.error(`Failed to create agent: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [agentDetails, profile, fetchAgents, fetchProperties]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`, {
      style: { background: '#10B981', color: '#fff', borderRadius: '8px' },
    });
  };

  const handleShareDetails = async () => {
    if (!success) return;

    const shareData = {
      title: 'New Agent Details',
      text: `Agent Details:\nID: ${success.id}\nName: ${success.name}\nEmail: ${success.email}\nPhone: ${success.phone}\nPassword: ${success.password}`,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        toast.success('Agent details shared successfully!');
      } else {
        copyToClipboard(shareData.text, 'Agent Details');
      }
    } catch (err: any) {
      copyToClipboard(shareData.text, 'Agent Details');
    }
  };

  const handleShareLink = async () => {
    if (!success) return;

    try {
      const response = await fetch('/api/generate-share-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: success.id }),
      });
      const { link } = await response.json();
      copyToClipboard(link, 'Share Link');
      toast.success('Secure share link copied to clipboard! Valid for 24 hours.');
    } catch (err: any) {
      toast.error('Failed to generate share link.');
    }
  };

  const handleDownloadDetails = () => {
    if (!success) return;
    const details = `
      Agent Details:
      ID: ${success.id}
      Name: ${success.name}
      Email: ${success.email}
      Phone: ${success.phone}
      Password: ${success.password}
    `;
    const blob = new Blob([details], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-details-${success.name}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Agent details downloaded!');
  };

  const handleClose = () => {
    setAgentDetails({ email: '', name: '', phone: '', password: '', confirmPassword: '' });
    setSuccess(null);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" role="dialog" aria-labelledby="create-agent-title">
      <Toaster position="top-center" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="bg-white/80 backdrop-blur-md rounded-lg shadow-xl p-8 w-full max-w-md border border-gray-200"
      >
        <h1 id="create-agent-title" className="text-2xl font-bold mb-6 text-gray-900 text-center">
          Create New Agent
        </h1>
        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
              className="text-center space-y-4"
            >
              <p className="text-green-600 font-semibold">Agent account created successfully!</p>
              <div className="text-left space-y-2">
                <p className="text-gray-700">
                  Agent ID: <span className="font-mono font-semibold">{success.id}</span>
                  <button onClick={() => copyToClipboard(success.id, 'Agent ID')} className="ml-2 text-blue-600 hover:text-blue-800">
                    <Copy className="w-4 h-4 inline" />
                  </button>
                </p>
                <p className="text-gray-700">
                  Name: <span className="font-mono font-semibold">{success.name}</span>
                  <button onClick={() => copyToClipboard(success.name, 'Name')} className="ml-2 text-blue-600 hover:text-blue-800">
                    <Copy className="w-4 h-4 inline" />
                  </button>
                </p>
                <p className="text-gray-700">
                  Email: <span className="font-mono font-semibold">{success.email}</span>
                  <button onClick={() => copyToClipboard(success.email, 'Email')} className="ml-2 text-blue-600 hover:text-blue-800">
                    <Copy className="w-4 h-4 inline" />
                  </button>
                </p>
                <p className="text-gray-700">
                  Phone: <span className="font-mono font-semibold">{success.phone}</span>
                  <button onClick={() => copyToClipboard(success.phone, 'Phone')} className="ml-2 text-blue-600 hover:text-blue-800">
                    <Copy className="w-4 h-4 inline" />
                  </button>
                </p>
                <p className="text-gray-700">
                  Password: <span className="font-mono font-semibold">{success.password}</span>
                  <button onClick={() => copyToClipboard(success.password, 'Password')} className="ml-2 text-blue-600 hover:text-blue-800">
                    <Copy className="w-4 h-4 inline" />
                  </button>
                </p>
              </div>
              <div className="flex justify-between gap-2">
                <button onClick={handleShareDetails} className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700">
                  <Share2 className="w-5 h-5 mr-2" /> Share
                </button>
                <button onClick={handleShareLink} className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
                  <Share2 className="w-5 h-5 mr-2" /> Share Link
                </button>
                <button onClick={handleDownloadDetails} className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
                  <Download className="w-5 h-5 mr-2" /> Download
                </button>
                <button onClick={() => setSuccess(null)} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                  Create Another
                </button>
              </div>
              <button onClick={handleClose} className="w-full mt-2 py-2 text-gray-600 rounded-md hover:bg-gray-100">
                Close
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
            >
              <div className="mb-4">
                <label htmlFor="agent-email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="agent-email"
                  type="email"
                  value={agentDetails.email}
                  onChange={(e) => setAgentDetails({ ...agentDetails, email: e.target.value })}
                  className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white/50"
                  placeholder="agent@example.com"
                  disabled={isLoading}
                  required
                />
              </div>
              <div className="mb-4">
                <label htmlFor="agent-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  id="agent-name"
                  type="text"
                  value={agentDetails.name}
                  onChange={(e) => setAgentDetails({ ...agentDetails, name: e.target.value })}
                  className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white/50"
                  placeholder="John Doe"
                  disabled={isLoading}
                  required
                />
              </div>
              <div className="mb-4">
                <label htmlFor="agent-phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  id="agent-phone"
                  type="tel"
                  value={agentDetails.phone}
                  onChange={(e) => setAgentDetails({ ...agentDetails, phone: e.target.value })}
                  className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white/50"
                  placeholder="+1234567890"
                  disabled={isLoading}
                  required
                />
              </div>
              <div className="mb-4">
                <label htmlFor="agent-password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    id="agent-password"
                    type="text"
                    value={agentDetails.password}
                    onChange={(e) => setAgentDetails({ ...agentDetails, password: e.target.value })}
                    className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white/50"
                    placeholder="Enter a password (minimum 6 characters)"
                    disabled={isLoading}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setAgentDetails({ ...agentDetails, password: generatePassword(), confirmPassword: '' })}
                    className="px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                  >
                    Generate
                  </button>
                </div>
              </div>
              <div className="mb-4">
                <label htmlFor="agent-confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password
                </label>
                <input
                  id="agent-confirm-password"
                  type="password"
                  value={agentDetails.confirmPassword}
                  onChange={(e) => setAgentDetails({ ...agentDetails, confirmPassword: e.target.value })}
                  className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white/50"
                  placeholder="Confirm your password"
                  disabled={isLoading}
                  required
                />
              </div>
              {error && <p className="text-red-600 mb-4 text-sm">{error}</p>}
              <button
                onClick={handleCreateAgent}
                disabled={isLoading}
                className={`w-full py-3 rounded-lg text-white ${isLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {isLoading ? 'Creating...' : 'Create Agent'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

export function AgentManagement() {
  const { profile } = useAuthStore();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState<Agent | null>(null);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState('');

  if (profile?.role !== 'admin') {
    return <div className="text-red-600" role="alert">Unauthorized access</div>;
  }

  useEffect(() => {
    console.log('AgentManagement mounted, fetching agents');
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, role, permissions, name, phone')
        .in('role', ['agent', 'admin']);
      if (error) throw error;
      console.log('Fetched agents:', data);
      data?.forEach((agent, index) => {
        if (!agent.permissions) {
          console.warn(`Agent at index ${index} has no permissions:`, agent);
          toast.error(`Agent ${agent.email} has no permissions set`);
        }
      });
      setAgents(data || []);
    } catch (error: any) {
      console.error('Fetch agents error:', error);
      toast.error('Failed to fetch agents: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchProperties = async () => {
    console.log('Fetching properties');
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  useEffect(() => {
    if (showAdminModal) {
      setGeneratedPassword(generatePassword());
    }
  }, [showAdminModal]);

  const fetchAgentDetails = async (agentId: string) => {
    try {
      const { data, error } = await supabase
        .from('agent_credentials')
        .select('password')
        .eq('agent_id', agentId)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data?.password || 'Not available';
    } catch (error: any) {
      return 'Not available';
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!newAdminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newAdminEmail)) {
        throw new Error('Please enter a valid email address');
      }
      if (!generatedPassword || generatedPassword.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      const { data: existingUser, error: fetchError } = await supabase
        .from('auth.users')
        .select('id')
        .eq('email', newAdminEmail)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw new Error(`Error checking existing user: ${fetchError.message}`);
      }

      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: newAdminEmail,
        password: generatedPassword,
        email_confirm: true,
      });

      if (authError) {
        throw new Error(`Failed to create user: ${authError.message}`);
      }

      if (!authData.user?.id) {
        throw new Error('User creation succeeded but no user ID returned');
      }

      const profileData = {
        id: authData.user.id,
        email: newAdminEmail,
        role: 'admin' as const,
        permissions: {
          canRegisterProperties: true,
          canEditProperties: true,
          canDeleteProperties: true,
        },
        name: newAdminName || newAdminEmail.split('@')[0],
        phone: '',
      };

      const { error: profileError } = await supabase.from('profiles').insert(profileData);

      if (profileError) {
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }

      const { error: credentialError } = await supabase
        .from('agent_credentials')
        .insert({
          agent_id: authData.user.id,
          password: generatedPassword,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });

      if (credentialError) {
        throw new Error(`Failed to store credentials: ${credentialError.message}`);
      }

      toast.success(`Admin created! Email: ${newAdminEmail}, Password: ${generatedPassword}\nPlease share this securely.`);
      setAgents([...agents, profileData]);
      setShowAdminModal(false);
      setNewAdminEmail('');
      setNewAdminName('');
      setGeneratedPassword('');
      await fetchAgents();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create admin');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const handleShareDetails = async (agent: Agent, password: string) => {
    const shareData = {
      title: 'Agent Details',
      text: `Agent Details:\nID: ${agent.id}\nName: ${agent.name || 'N/A'}\nEmail: ${agent.email}\nPhone: ${agent.phone || 'N/A'}\nPassword: ${password}`,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        toast.success('Agent details shared successfully!');
      } else {
        copyToClipboard(shareData.text, 'Agent Details');
      }
    } catch (err: any) {
      copyToClipboard(shareData.text, 'Agent Details');
    }
  };

  const handleShareLink = async (agentId: string) => {
    try {
      const response = await fetch('/api/generate-share-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId }),
      });
      const { link } = await response.json();
      copyToClipboard(link, 'Share Link');
      toast.success('Secure share link copied to clipboard! Valid for 24 hours.');
    } catch (err: any) {
      toast.error('Failed to generate share link.');
    }
  };

  const handleDownloadDetails = (agent: Agent, password: string) => {
    const details = `
      Agent Details:
      ID: ${agent.id}
      Name: ${agent.name || 'N/A'}
      Email: ${agent.email}
      Phone: ${agent.phone || 'N/A'}
      Password: ${password}
    `;
    const blob = new Blob([details], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-details-${agent.name || agent.email}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Agent details downloaded!');
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Toaster position="top-center" />
      <h2 className="text-2xl font-bold mb-6 flex items-center">
        <Users className="w-6 h-6 mr-2" />
        Agent Management
      </h2>

      <div className="flex space-x-4 mb-4">
        <button
          onClick={() => setShowAgentModal(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          <Plus className="w-5 h-5 mr-2" />
          Create Agent
        </button>
        <button
          onClick={() => setShowAdminModal(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          <Plus className="w-5 h-5 mr-2" />
          Create Admin
        </button>
      </div>

      <CreateAgentModal
        isOpen={showAgentModal}
        onClose={() => setShowAgentModal(false)}
        fetchAgents={fetchAgents}
        fetchProperties={fetchProperties}
      />

      {showAdminModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" role="dialog">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Create New Admin</h3>
            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div>
                <label htmlFor="admin-email" className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="admin@example.com"
                  required
                />
              </div>
              <div>
                <label htmlFor="admin-name" className="block text-sm font-medium text-gray-700">
                  Name (Optional)
                </label>
                <input
                  id="admin-name"
                  type="text"
                  value={newAdminName}
                  onChange={(e) => setNewAdminName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Admin Name"
                />
              </div>
              <div>
                <label htmlFor="admin-password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    id="admin-password"
                    type="text"
                    value={generatedPassword}
                    readOnly
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                  />
                  <button
                    type="button"
                    onClick={() => setGeneratedPassword(generatePassword())}
                    className="mt-1 px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                  >
                    Regenerate
                  </button>
                </div>
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminModal(false);
                    setNewAdminEmail('');
                    setNewAdminName('');
                    setGeneratedPassword('');
                  }}
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

      {showDetailsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" role="dialog">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="bg-white/80 backdrop-blur-md rounded-lg shadow-xl p-8 w-full max-w-md border border-gray-200"
          >
            <h3 className="text-lg font-bold mb-4">Agent Details</h3>
            <div className="space-y-2">
              <p className="text-gray-700">
                Agent ID: <span className="font-mono font-semibold">{showDetailsModal.id}</span>
                <button onClick={() => copyToClipboard(showDetailsModal.id, 'Agent ID')} className="ml-2 text-blue-600 hover:text-blue-800">
                  <Copy className="w-4 h-4 inline" />
                </button>
              </p>
              <p className="text-gray-700">
                Name: <span className="font-mono font-semibold">{showDetailsModal.name || 'N/A'}</span>
                <button onClick={() => copyToClipboard(showDetailsModal.name || 'N/A', 'Name')} className="ml-2 text-blue-600 hover:text-blue-800">
                  <Copy className="w-4 h-4 inline" />
                </button>
              </p>
              <p className="text-gray-700">
                Email: <span className="font-mono font-semibold">{showDetailsModal.email}</span>
                <button onClick={() => copyToClipboard(showDetailsModal.email, 'Email')} className="ml-2 text-blue-600 hover:text-blue-800">
                  <Copy className="w-4 h-4 inline" />
                </button>
              </p>
              <p className="text-gray-700">
                Phone: <span className="font-mono font-semibold">{showDetailsModal.phone || 'N/A'}</span>
                <button onClick={() => copyToClipboard(showDetailsModal.phone || 'N/A', 'Phone')} className="ml-2 text-blue-600 hover:text-blue-800">
                  <Copy className="w-4 h-4 inline" />
                </button>
              </p>
              <p className="text-gray-700">
                Password: <span className="font-mono font-semibold">{showDetailsModal.password || 'Not available'}</span>
                <button
                  onClick={() => copyToClipboard(showDetailsModal.password || 'Not available', 'Password')}
                  className="ml-2 text-blue-600 hover:text-blue-800"
                >
                  <Copy className="w-4 h-4 inline" />
                </button>
              </p>
            </div>
            <div className="flex justify-between gap-2 mt-4">
              <button
                onClick={() => handleShareDetails(showDetailsModal, showDetailsModal.password || 'Not available')}
                className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
              >
                <Share2 className="w-5 h-5 mr-2" /> Share
              </button>
              <button
                onClick={() => handleShareLink(showDetailsModal.id)}
                className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                <Share2 className="w-5 h-5 mr-2" /> Share Link
              </button>
              <button
                onClick={() => handleDownloadDetails(showDetailsModal, showDetailsModal.password || 'Not available')}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                <Download className="w-5 h-5 mr-2" /> Download
              </button>
            </div>
            <button
              onClick={() => setShowDetailsModal(null)}
              className="w-full mt-2 py-2 text-gray-600 rounded-md hover:bg-gray-100"
            >
              Close
            </button>
          </motion.div>
        </div>
      )}

      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Existing Agents & Admins</h3>
        {loading ? (
          <div className="flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="ml-2 text-gray-600">Loading agents...</span>
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center text-gray-600">No agents or admins found.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Email</th>
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Role</th>
                <th className="text-left py-2">Permissions</th>
                <th className="text-left py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents
                .filter(agent => agent && agent.permissions) // Filter out invalid agents
                .map((agent) => (
                  <tr key={agent.id} className="border-b">
                    <td className="py-2">{agent.email}</td>
                    <td className="py-2">{agent.name || '-'}</td>
                    <td className="py-2">{agent.role}</td>
                    <td className="py-2">
                      {agent.permissions ? (
                        <div className="flex items-center space-x-2">
                          {agent.permissions.canRegisterProperties && (
                            <Home className="w-4 h-4 text-green-600" title="Can Register Properties" />
                          )}
                          {agent.permissions.canEditProperties && (
                            <Pencil className="w-4 h-4 text-yellow-600" title="Can Edit Properties" />
                          )}
                          {agent.permissions.canDeleteProperties && (
                            <Trash2 className="w-4 h-4 text-red-600" title="Can Delete Properties" />
                          )}
                        </div>
                      ) : (
                        <span className="text-red-600">No permissions set</span>
                      )}
                    </td>
                    <td className="py-2">
                      <button
                        onClick={async () => {
                          const password = await fetchAgentDetails(agent.id);
                          setShowDetailsModal({ ...agent, password });
                        }}
                        className="p-1 text-blue-600 hover:text-blue-800"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          toast.info('Edit functionality not implemented yet');
                        }}
                        className="p-1 text-blue-600 hover:text-blue-800 ml-2"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          toast.info('Delete functionality not implemented yet');
                        }}
                        className="p-1 text-red-600 hover:text-red-800 ml-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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