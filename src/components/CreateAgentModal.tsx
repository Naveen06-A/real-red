import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import toast, { Toaster } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/authStore';
import { Copy, Download, Share2 } from 'lucide-react';

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
  fetchAgents: () => Promise<any>;
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

  const handleCreateAgent = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setSuccess(null);

      // Validate inputs
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

      // Check admin authorization
      if (!profile || profile.role !== 'admin') {
        console.error('Admin authorization failed:', { profile });
        throw new Error('Only admins can create new agent accounts');
      }

      console.log('Attempting to create agent with:', {
        email: agentDetails.email,
        name: agentDetails.name,
        phone: agentDetails.phone,
        password: '****',
      });

      // Sign up user
      const { data, error: authError } = await supabase.auth.signUp({
        email: agentDetails.email,
        password: agentDetails.password,
        options: {
          data: {
            name: agentDetails.name,
            phone: agentDetails.phone,
            role: 'agent',
          },
          emailRedirectTo: undefined, // Disable confirmation for testing
        },
      });

      if (authError) {
        console.error('Supabase auth.signUp error:', {
          message: authError.message,
          code: authError.code,
          details: authError,
          email: agentDetails.email,
          metaDataSent: { name: agentDetails.name, phone: agentDetails.phone, role: 'agent' },
        });
        if (authError.code === 'user_already_exists') {
          throw new Error('This email is already registered. Please use a different email.');
        }
        throw new Error(`Authentication error: ${authError.message} (Code: ${authError.code || 'N/A'})`);
      }
      if (!data.user) {
        console.error('No user returned from Supabase auth.signUp', { response: data });
        throw new Error('Failed to create agent: No user returned');
      }

      console.log('User created in auth.users:', {
        userId: data.user.id,
        email: data.user.email,
        metaData: data.user.user_metadata,
      });

      // Insert into agents table
      const { error: agentError } = await supabase
        .from('agents')
        .upsert(
          {
            id: data.user.id,
            email: agentDetails.email,
            name: agentDetails.name,
            phone: agentDetails.phone,
            role: 'agent',
          },
          { onConflict: 'id' }
        );

      if (agentError) {
        console.error('Agent upsert error:', {
          message: agentError.message,
          code: agentError.code,
          details: agentError,
          userId: data.user.id,
        });
        throw new Error(`Failed to create agent record: ${agentError.message}`);
      }

      console.log('Agent successfully upserted for user:', data.user.id);

      setSuccess({
        id: data.user.id,
        email: agentDetails.email,
        name: agentDetails.name,
        phone: agentDetails.phone,
        password: agentDetails.password,
      });

      toast.success(
        `Agent created: ${agentDetails.email} (ID: ${data.user.id})\nPassword: ${agentDetails.password}\nPlease share this securely.`,
        {
          duration: 15000,
          style: { background: '#3B82F6', color: '#fff', borderRadius: '8px', maxWidth: '500px' },
        }
      );

      await fetchAgents();
      await fetchProperties();
    } catch (err: any) {
      const errorMessage = err.message || 'An unexpected error occurred';
      console.error('Agent creation failed:', {
        message: errorMessage,
        code: err.code,
        details: err,
        stack: err.stack,
      });
      setError(errorMessage);
      toast.error(`Failed to create agent: ${errorMessage}`, {
        style: { background: '#EF4444', color: '#fff', borderRadius: '8px' },
      });
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
        toast.success('Agent details shared successfully!', {
          style: { background: '#10B981', color: '#fff', borderRadius: '8px' },
        });
      } else {
        copyToClipboard(shareData.text, 'Agent Details');
      }
    } catch (err: any) {
      console.error('Share failed:', err);
      toast.error('Failed to share details. Copied to clipboard instead.', {
        style: { background: '#EF4444', color: '#fff', borderRadius: '8px' },
      });
      copyToClipboard(shareData.text, 'Agent Details');
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
    toast.success('Agent details downloaded!', {
      style: { background: '#10B981', color: '#fff', borderRadius: '8px' },
    });
  };

  const handleClose = () => {
    console.log('handleClose called, resetting agentDetails and closing modal');
    setAgentDetails({ email: '', name: '', phone: '', password: '', confirmPassword: '' });
    setSuccess(null);
    setError(null);
    setIsLoading(false);
    onClose();
  };

  if (!isOpen) {
    console.log('CreateAgentModal is not open, isOpen:', isOpen);
    return null;
  }

  console.log('Rendering CreateAgentModal, isOpen:', isOpen);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <Toaster position="top-center" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="bg-white/80 backdrop-blur-md rounded-lg shadow-xl p-8 w-full max-w-md border border-gray-200"
      >
        <h1 className="text-2xl font-bold mb-6 text-gray-900 text-center">Create New Agent</h1>
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
                  Agent ID:{' '}
                  <span className="font-mono font-semibold">{success.id}</span>
                  <button
                    onClick={() => copyToClipboard(success.id, 'Agent ID')}
                    className="ml-2 text-blue-600 hover:text-blue-800 focus:outline-none"
                    aria-label="Copy Agent ID"
                  >
                    <Copy className="w-4 h-4 inline" />
                  </button>
                </p>
                <p className="text-gray-700">
                  Name:{' '}
                  <span className="font-mono font-semibold">{success.name}</span>
                  <button
                    onClick={() => copyToClipboard(success.name, 'Name')}
                    className="ml-2 text-blue-600 hover:text-blue-800 focus:outline-none"
                    aria-label="Copy Name"
                  >
                    <Copy className="w-4 h-4 inline" />
                  </button>
                </p>
                <p className="text-gray-700">
                  Email:{' '}
                  <span className="font-mono font-semibold">{success.email}</span>
                  <button
                    onClick={() => copyToClipboard(success.email, 'Email')}
                    className="ml-2 text-blue-600 hover:text-blue-800 focus:outline-none"
                    aria-label="Copy Email"
                  >
                    <Copy className="w-4 h-4 inline" />
                  </button>
                </p>
                <p className="text-gray-700">
                  Phone:{' '}
                  <span className="font-mono font-semibold">{success.phone}</span>
                  <button
                    onClick={() => copyToClipboard(success.phone, 'Phone')}
                    className="ml-2 text-blue-600 hover:text-blue-800 focus:outline-none"
                    aria-label="Copy Phone"
                  >
                    <Copy className="w-4 h-4 inline" />
                  </button>
                </p>
                <p className="text-gray-700">
                  Password:{' '}
                  <span className="font-mono font-semibold">{success.password}</span>
                  <button
                    onClick={() => copyToClipboard(success.password, 'Password')}
                    className="ml-2 text-blue-600 hover:text-blue-800 focus:outline-none"
                    aria-label="Copy Password"
                  >
                    <Copy className="w-4 h-4 inline" />
                  </button>
                </p>
              </div>
              <div className="flex justify-between gap-2">
                <button
                  onClick={handleShareDetails}
                  className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                  aria-label="Share Agent Details"
                >
                  <Share2 className="w-5 h-5 mr-2" /> Share
                </button>
                <button
                  onClick={handleDownloadDetails}
                  className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                  aria-label="Download Agent Details"
                >
                  <Download className="w-5 h-5 mr-2" /> Download
                </button>
                <button
                  onClick={() => setSuccess(null)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  aria-label="Create another agent"
                >
                  Create Another
                </button>
              </div>
              <button
                onClick={handleClose}
                disabled={isLoading}
                className="px-4 py-2 text-gray-600 rounded-md hover:bg-gray-100"
                aria-label="Cancel"
              >
                Cancel
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
                  aria-required="true"
                  aria-invalid={!!error}
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
                  aria-required="true"
                  aria-invalid={!!error}
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
                  aria-required="true"
                  aria-invalid={!!error}
                />
              </div>
              <div className="mb-4">
                <label htmlFor="agent-password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  id="agent-password"
                  type="password"
                  value={agentDetails.password}
                  onChange={(e) => setAgentDetails({ ...agentDetails, password: e.target.value })}
                  className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white/50"
                  placeholder="Enter a password (minimum 6 characters)"
                  disabled={isLoading}
                  aria-required="true"
                  aria-invalid={!!error}
                />
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
                  aria-required="true"
                  aria-invalid={!!error}
                />
              </div>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-red-600 mb-4 text-sm"
                >
                  {error}
                </motion.p>
              )}
              <div className="flex justify-between gap-2">
                <button
                  onClick={handleClose}
                  disabled={isLoading}
                  className="px-4 py-2 text-gray-600 rounded-md hover:bg-gray-100"
                  aria-label="Cancel"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateAgent}
                  disabled={isLoading}
                  className={`px-4 py-2 rounded-lg text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                    isLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                  aria-label="Create agent account"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Creating...
                    </span>
                  ) : (
                    'Create Agent'
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}