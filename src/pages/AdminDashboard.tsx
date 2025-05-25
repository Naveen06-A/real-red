import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { Building, Trash2, Bell, UserPlus, X } from 'lucide-react';
import { Property, StaticProperty, combineProperties, sortProperties, staticProperties } from '../data/PropertyData';
import toast, { Toaster } from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import { Link } from 'react-router-dom';

interface Agent {
  id: string;
  agent_id: string;
  email: string;
  role: string;
  permissions: {
    canRegisterProperties: boolean;
    canEditProperties: boolean;
    canDeleteProperties: boolean;
  };
}

interface ExtendedProperty extends Property {
  agent_id?: string;
}

export function AdminDashboard() {
  const { profile, fetchProfile } = useAuthStore();
  const [supabaseProperties, setSupabaseProperties] = useState<ExtendedProperty[]>([]);
  const [combinedProperties, setCombinedProperties] = useState<(ExtendedProperty | StaticProperty)[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Property | null; direction: 'asc' | 'desc' }>({
    key: null,
    direction: 'asc',
  });
  const [notifications, setNotifications] = useState<string[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [newAgent, setNewAgent] = useState({
    email: '',
    canRegisterProperties: false,
    canEditProperties: false,
    canDeleteProperties: false,
  });
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        await fetchProfile();
        console.log('Profile data:', profile);
        if (profile) {
          fetchProperties();
          fetchAgents();
          setupWebSocket();
        }
      } catch (error: any) {
        console.error('Profile load error:', error);
        setProfileError(error.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [profile, fetchProfile]);

  const setupWebSocket = () => {
    const ws = new WebSocket('wss://your-websocket-server-url');
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      setNotifications((prev) => [...prev, message.content]);
      toast.success(message.content, {
        duration: 4000,
        position: 'top-right',
        style: {
          background: '#10B981',
          color: '#fff',
          borderRadius: '8px',
        },
      });
    };
    return () => ws.close();
  };

  async function fetchProperties() {
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('*, profiles!properties_user_id_fkey(agent_id, email)')
        .order('created_at', { ascending: false });

      if (error) throw new Error(`Failed to fetch properties: ${error.message}`);
      const supabaseData = data || [];
      setSupabaseProperties(supabaseData);
      const combined = combineProperties(supabaseData, staticProperties);
      setCombinedProperties(combined);
    } catch (error: any) {
      console.error('Error fetching properties:', error);
      toast.error(error.message || 'Failed to fetch properties');
    }
  }

  async function fetchAgents() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, agent_id, email, role, permissions')
        .eq('role', 'agent');

      if (error) throw new Error(`Failed to fetch agents: ${error.message}`);
      setAgents(data || []);
    } catch (error: any) {
      console.error('Error fetching agents:', error);
      toast.error(error.message || 'Failed to fetch agents');
    }
  }

  async function updateAgentPermissions(agentId: string, permissions: Agent['permissions']) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ permissions })
        .eq('id', agentId);

      if (error) throw new Error(`Failed to update permissions: ${error.message}`);
      setAgents(agents.map(agent =>
        agent.id === agentId ? { ...agent, permissions } : agent
      ));
      toast.success('Agent permissions updated successfully');
    } catch (error: any) {
      console.error('Error updating permissions:', error);
      toast.error(error.message || 'Failed to update permissions');
    }
  }

  async function createAgent(e: React.FormEvent) {
  e.preventDefault();
  try {
    if (!newAgent.email) throw new Error('Email is required');

    // First check if user exists in auth system
    const { data: { users }, error: authLookupError } = await supabase.auth.admin.listUsers();
    
    if (authLookupError) throw new Error(`Auth lookup failed: ${authLookupError.message}`);

    const existingAuthUser = users?.find(user => user.email === newAgent.email);

    if (existingAuthUser) {
      // User exists in auth - check if they're already an agent
      const { data: existingProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', existingAuthUser.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        throw new Error(`Profile lookup failed: ${profileError.message}`);
      }

      if (existingProfile) {
        if (existingProfile.role === 'agent') {
          throw new Error('User is already registered as an agent');
        }
        throw new Error('User exists but is not an agent');
      }

      // User exists in auth but not in profiles - add agent profile
      const uniqueAgentId = `AGENT-${uuidv4().slice(0, 8)}`;
      
      const { error: insertError } = await supabase.from('profiles').insert({
        id: existingAuthUser.id,
        agent_id: uniqueAgentId,
        email: newAgent.email,
        role: 'agent',
        permissions: {
          canRegisterProperties: newAgent.canRegisterProperties,
          canEditProperties: newAgent.canEditProperties,
          canDeleteProperties: newAgent.canDeleteProperties,
        },
      });

      if (insertError) throw new Error(`Profile creation failed: ${insertError.message}`);

      // Add to local state
      setAgents([...agents, {
        id: existingAuthUser.id,
        agent_id: uniqueAgentId,
        email: newAgent.email,
        role: 'agent',
        permissions: {
          canRegisterProperties: newAgent.canRegisterProperties,
          canEditProperties: newAgent.canEditProperties,
          canDeleteProperties: newAgent.canDeleteProperties,
        }
      }]);

      toast.success(`Existing user ${newAgent.email} added as agent`);
    } else {
      // Brand new user - full registration process
      const tempPassword = Math.random().toString(36).slice(-8);
      const uniqueAgentId = `AGENT-${uuidv4().slice(0, 8)}`;

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newAgent.email,
        password: tempPassword,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            role: 'agent'
          }
        },
      });

      if (authError) throw new Error(`Auth error: ${authError.message}`);
      if (!authData.user) throw new Error('Failed to create user: No user data returned');

      const { error: profileError } = await supabase.from('profiles').insert({
        id: authData.user.id,
        agent_id: uniqueAgentId,
        email: newAgent.email,
        role: 'agent',
        permissions: {
          canRegisterProperties: newAgent.canRegisterProperties,
          canEditProperties: newAgent.canEditProperties,
          canDeleteProperties: newAgent.canDeleteProperties,
        },
      });

      if (profileError) throw new Error(`Profile error: ${profileError.message}`);

      setAgents([...agents, {
        id: authData.user.id,
        agent_id: uniqueAgentId,
        email: newAgent.email,
        role: 'agent',
        permissions: {
          canRegisterProperties: newAgent.canRegisterProperties,
          canEditProperties: newAgent.canEditProperties,
          canDeleteProperties: newAgent.canDeleteProperties,
        }
      }]);

      toast.success(`Agent ${newAgent.email} invited. They will receive an email to set their password.`);
    }

    setShowAgentModal(false);
    setNewAgent({
      email: '',
      canRegisterProperties: false,
      canEditProperties: false,
      canDeleteProperties: false,
    });
  } catch (error: any) {
    console.error('Error creating agent:', error);
    toast.error(error.message || 'Failed to create agent');
  }
}

  async function deleteProperty(id: string) {
    try {
      const { error } = await supabase
        .from('properties')
        .delete()
        .eq('id', id);

      if (error) throw new Error(`Failed to delete property: ${error.message}`);
      setSupabaseProperties(supabaseProperties.filter((property) => property.id !== id));
      setCombinedProperties(combinedProperties.filter((property) => property.id !== id));
      toast.success('Property deleted successfully');
    } catch (error: any) {
      console.error('Error deleting property:', error);
      toast.error(error.message || 'Failed to delete property');
    }
  }

  const handleSort = (key: keyof Property) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    const sortedData = sortProperties(combinedProperties, key, direction);
    setCombinedProperties(sortedData);
    setSortConfig({ key, direction });
  };

  if (profileError) {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold text-red-600">Profile Error</h2>
        <p className="text-gray-600 mt-2">
          {profileError}. Register as an agent at{' '}
          <Link to="/agent-register" className="text-blue-600 hover:underline">
            /agent-register
          </Link>{' '}
          or contact support.
        </p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold text-red-600">Authentication Error</h2>
        <p className="text-gray-600 mt-2">No user profile found. Please log in again.</p>
      </div>
    );
  }

  if (profile.role !== 'admin') {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold text-red-600">Access Denied</h2>
        <p className="text-gray-600 mt-2">
          This page is for admins only. Your role is '{profile.role || 'unknown'}'.{' '}
          <Link to="/agent-register" className="text-blue-600 hover:underline">
            Register as an agent
          </Link>{' '}
          or contact support.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Toaster />
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <div className="flex items-center space-x-4">
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 rounded-full bg-gray-100 hover:bg-gray-200"
            >
              <Bell className="w-6 h-6 text-blue-600" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {notifications.length}
                </span>
              )}
            </button>
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl z-10 animate-slide-down">
                <div className="p-4">
                  <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                  {notifications.length === 0 ? (
                    <p className="text-sm text-gray-500">No new notifications</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {notifications.map((notification, index) => (
                        <li key={index} className="text-sm text-gray-600 p-2 rounded hover:bg-gray-50">
                          {notification}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Building className="w-6 h-6 text-blue-600" />
            <span className="text-gray-600">{combinedProperties.length} Properties Listed</span>
          </div>
        </div>
      </div>

      {/* Agent Management Section */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Agent Management</h2>
          <button
            onClick={() => setShowAgentModal(true)}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            <UserPlus className="w-5 h-5" />
            <span>Add New Agent</span>
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Register</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Edit</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Delete</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {agents.map((agent) => (
                <tr key={agent.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">{agent.agent_id}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{agent.email}</td>
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={agent.permissions.canRegisterProperties}
                      onChange={(e) =>
                        updateAgentPermissions(agent.id, {
                          ...agent.permissions,
                          canRegisterProperties: e.target.checked,
                        })
                      }
                      className="h-4 w-4 text-blue-600 rounded"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={agent.permissions.canEditProperties}
                      onChange={(e) =>
                        updateAgentPermissions(agent.id, {
                          ...agent.permissions,
                          canEditProperties: e.target.checked,
                        })
                      }
                      className="h-4 w-4 text-blue-600 rounded"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={agent.permissions.canDeleteProperties}
                      onChange={(e) =>
                        updateAgentPermissions(agent.id, {
                          ...agent.permissions,
                          canDeleteProperties: e.target.checked,
                        })
                      }
                      className="h-4 w-4 text-blue-600 rounded"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Agent Modal */}
      {showAgentModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Create New Agent</h3>
              <button
                onClick={() => setShowAgentModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={createAgent}>
              <div className="mb-4">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  value={newAgent.email}
                  onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">Permissions</label>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="canRegister"
                      checked={newAgent.canRegisterProperties}
                      onChange={(e) =>
                        setNewAgent({ ...newAgent, canRegisterProperties: e.target.checked })
                      }
                      className="h-4 w-4 text-blue-600 rounded"
                    />
                    <label htmlFor="canRegister" className="ml-2 text-sm text-gray-600">
                      Can Register Properties
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="canEdit"
                      checked={newAgent.canEditProperties}
                      onChange={(e) =>
                        setNewAgent({ ...newAgent, canEditProperties: e.target.checked })
                      }
                      className="h-4 w-4 text-blue-600 rounded"
                    />
                    <label htmlFor="canEdit" className="ml-2 text-sm text-gray-600">
                      Can Edit Properties
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="canDelete"
                      checked={newAgent.canDeleteProperties}
                      onChange={(e) =>
                        setNewAgent({ ...newAgent, canDeleteProperties: e.target.checked })
                      }
                      className="h-4 w-4 text-blue-600 rounded"
                    />
                    <label htmlFor="canDelete" className="ml-2 text-sm text-gray-600">
                      Can Delete Properties
                    </label>
                  </div>
                </div>
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAgentModal(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create Agent
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Properties Section */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  onClick={() => handleSort('name')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                >
                  Property {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort('city')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                >
                  Location {sortConfig.key === 'city' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort('property_type')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                >
                  Type {sortConfig.key === 'property_type' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort('price')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                >
                  Price {sortConfig.key === 'price' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort('agent_id')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                >
                  Agent {sortConfig.key === 'agent_id' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {combinedProperties.map((property) => (
                <tr key={property.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{property.name}</div>
                    <div className="text-sm text-gray-500">
                      Added {new Date(property.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{property.address}</div>
                    <div className="text-sm text-gray-500">
                      {property.city}, {property.country}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                      {property.property_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {property.country === 'India'
                      ? property.price.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })
                      : property.price.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {property.agent_id ? property.agent_id : 'Unassigned'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{property.email}</div>
                    <div className="text-sm text-gray-500">{property.phone}</div>
                  </td>
                  <td className="px-6 py-4">
                    {property.id.startsWith('static') ? (
                      <span className="text-gray-500">Static Data</span>
                    ) : (
                      <button
                        onClick={() => deleteProperty(property.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style>
        {`
        .animate-slide-down {
          animation: slideDown 0.3s ease-out;
        }
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        `}
      </style>
    </div>
  );
}