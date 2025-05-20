import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { Building, Trash2, Bell } from 'lucide-react';
import { Property, StaticProperty, combineProperties, sortProperties, staticProperties } from '../data/PropertyData';
import toast, { Toaster } from 'react-hot-toast';
import { Link } from 'react-router-dom';

interface Agent {
  id: string;
  email: string;
  role: string;
  permissions: {
    canRegisterProperties: boolean;
    canEditProperties: boolean;
    canDeleteProperties: boolean;
    canManageAgents: boolean;
  };
}

export function AdminDashboard() {
  const { profile } = useAuthStore() as { profile: Agent | null };
  const [supabaseProperties, setSupabaseProperties] = useState<Property[]>([]);
  const [combinedProperties, setCombinedProperties] = useState<(Property | StaticProperty)[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Property | null; direction: 'asc' | 'desc' }>({
    key: null,
    direction: 'asc',
  });
  const [notifications, setNotifications] = useState<string[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    fetchProperties();
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

  async function deleteProperty(id: string) {
    try {
      const { error } = await supabase
        .from('properties')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await supabase.from('activity_logs').insert({
        agent_id: profile?.id,
        action: 'delete_property',
        property_id: id,
        details: { property_name: combinedProperties.find((p) => p.id === id)?.name },
      });

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
          {profile.permissions.canManageAgents && (
            <Link
              to="/agent-management"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              Manage Agents
            </Link>
          )}
        </div>
      </div>

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

      <style>{`
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