import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { Building, Trash2, Bell, UserPlus, X } from 'lucide-react';
import { Property, StaticProperty, combineProperties, sortProperties, staticProperties } from '../data/PropertyData';
import toast, { Toaster } from 'react-hot-toast';

interface Agent {
  id: string;
  email: string;
  role: string;
  permissions: {
    canRegisterProperties: boolean;
    canEditProperties: boolean;
    canDeleteProperties: boolean;
  };
}

export function AdminDashboard() {
  const { profile } = useAuthStore();
  const [supabaseProperties, setSupabaseProperties] = useState<Property[]>([]);
  const [combinedProperties, setCombinedProperties] = useState<(Property | StaticProperty)[]>([]);
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

  useEffect(() => {
    fetchProperties();
    fetchAgents();
    setupWebSocket();
  }, []);

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
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const supabaseData = data || [];
      setSupabaseProperties(supabaseData);
      const combined = combineProperties(supabaseData, staticProperties);
      setCombinedProperties(combined);
    } catch (error) {
      console.error('Error fetching properties:', error);
      toast.error('Failed to fetch properties');
    } finally {
      setLoading(false);
    }
  }

  async function fetchAgents() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, role, permissions')
        .eq('role', 'agent');

      if (error) throw error;
      setAgents(data || []);
    } catch (error) {
      console.error('Error fetching agents:', error);
      toast.error('Failed to fetch agents');
    }
  }

  async function updateAgentPermissions(agentId: string, permissions: Agent['permissions']) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ permissions })
        .eq('id', agentId);

      if (error) throw error;
      setAgents(agents.map(agent =>
        agent.id === agentId ? { ...agent, permissions } : agent
      ));
      toast.success('Agent permissions updated successfully');
    } catch (error) {
      console.error('Error updating permissions:', error);
      toast.error('Failed to update permissions');
    }
  }

  async function createAgent(e: React.FormEvent) {
    e.preventDefault();
    try {
      // Generate a temporary password
      const tempPassword = Math.random().toString(36).slice(-8);
      
      // Create user in Supabase auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: newAgent.email,
        password: tempPassword,
        email_confirm: true,
      });

      if (authError) throw authError;

      // Insert agent profile
      const { error: profileError } = await supabase.from('profiles').insert({
        id: authData.user?.id,
        email: newAgent.email,
        role: 'agent',
        permissions: {
          canRegisterProperties: newAgent.canRegisterProperties,
          canEditProperties: newAgent.canEditProperties,
          canDeleteProperties: newAgent.canDeleteProperties,
        },
      });

      if (profileError) throw profileError;

      // Update agents list
      setAgents([
        ...agents,
        {
          id: authData.user?.id!,
          email: newAgent.email,
          role: 'agent',
          permissions: {
            canRegisterProperties: newAgent.canRegisterProperties,
            canEditProperties: newAgent.canEditProperties,
            canDeleteProperties: newAgent.canDeleteProperties,
          },
        },
      ]);

      toast.success(`Agent ${newAgent.email} created successfully`);
      setShowAgentModal(false);
      setNewAgent({
        email: '',
        canRegisterProperties: false,
        canEditProperties: false,
        canDeleteProperties: false,
      });

      // Optionally, send email with temporary password (requires email service setup)
      // await sendEmail(newAgent.email, 'Agent Account Created', `Your temporary password is: ${tempPassword}`);
    } catch (error) {
      console.error('Error creating agent:', error);
      toast.error('Failed to create agent');
    }
  }

  async function deleteProperty(id: string) {
    try {
      const { error } = await supabase
        .from('properties')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setSupabaseProperties(supabaseProperties.filter((property) => property.id !== id));
      setCombinedProperties(combinedProperties.filter((property) => property.id !== id));
      toast.success('Property deleted successfully');
    } catch (error) {
      console.error('Error deleting property:', error);
      toast.error('Failed to delete property');
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

  if (profile?.role !== 'admin') {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold text-red-600">Access Denied</h2>
        <p className="text-gray-600 mt-2">You do not have permission to access this page.</p>
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Register</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Edit</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Delete</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {agents.map((agent) => (
                <tr key={agent.id} className="hover:bg-gray-50">
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

      <style jsx>{`
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
      `}</style>
    </div>
  );
}