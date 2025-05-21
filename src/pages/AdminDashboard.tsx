import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { Building, Trash2, Bell, Download, Filter } from 'lucide-react';
import { Property, StaticProperty, combineProperties, sortProperties, staticProperties } from '../data/PropertyData';
import toast, { Toaster } from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { CSVLink } from 'react-csv';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

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

interface PropertyFilter {
  city?: string;
  property_type?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
}

export function AdminDashboard() {
  const { profile } = useAuthStore() as { profile: Agent | null };
  // Stores raw properties from Supabase, used to derive combinedProperties
  const [supabaseProperties, setSupabaseProperties] = useState<Property[]>([]);
  // Stores combined static and Supabase properties
  const [combinedProperties, setCombinedProperties] = useState<(Property | StaticProperty)[]>([]);
  // Stores filtered properties for display
  const [filteredProperties, setFilteredProperties] = useState<(Property | StaticProperty)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Property | null; direction: 'asc' | 'desc' }>({
    key: null,
    direction: 'asc',
  });
  const [notifications, setNotifications] = useState<string[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  // Stores filter criteria for properties
  const [filters, setFilters] = useState<PropertyFilter>({});
  const [newAgentId, setNewAgentId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchProperties();
    fetchNotifications();
    // setupWebSocket(); // Disabled for testing, re-enable with valid WebSocket URL
  }, []);

  const setupWebSocket = useCallback(() => {
    try {
      const ws = new WebSocket('wss://your-websocket-server-url');
      ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          setNotifications((prev) => [...prev, message.content]);
          await supabase.from('notifications').insert({ content: message.content, agent_id: profile?.id });
          toast.success(message.content, {
            duration: 4000,
            position: 'top-right',
            style: {
              background: '#10B981',
              color: '#fff',
              borderRadius: '8px',
            },
          });
        } catch (err) {
          console.error('WebSocket message error:', err);
          toast.error('Failed to process WebSocket message');
        }
      };
      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        toast.error('WebSocket connection failed');
      };
      ws.onclose = () => console.log('WebSocket connection closed');
      return () => ws.close();
    } catch (err) {
      console.error('WebSocket setup error:', err);
      toast.error('Failed to initialize WebSocket');
    }
  }, [profile?.id]);

  const fetchNotifications = useCallback(async () => {
    try {
      if (!profile?.id) throw new Error('No user profile found');
      const { data, error } = await supabase
        .from('notifications')
        .select('content')
        .eq('agent_id', profile.id);
      if (error) throw error;
      setNotifications(data?.map((n) => n.content) || []);
    } catch (err: any) {
      console.error('Fetch notifications error:', err.message);
      setError('Failed to fetch notifications: ' + err.message);
      toast.error('Failed to fetch notifications');
    }
  }, [profile?.id]);

  const fetchProperties = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSupabaseProperties(data || []);
      const combined = combineProperties(data || [], staticProperties);
      setCombinedProperties(combined);
      setFilteredProperties(combined);
    } catch (err: any) {
      console.error('Fetch properties error:', err.message);
      setError('Failed to fetch properties: ' + err.message);
      // Fallback to static properties
      setCombinedProperties(staticProperties);
      setFilteredProperties(staticProperties);
      toast.error('Failed to fetch properties, showing static data');
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteProperty = useCallback(async (id: string) => {
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

      setSupabaseProperties((prev) => prev.filter((property) => property.id !== id));
      setCombinedProperties((prev) => prev.filter((property) => property.id !== id));
      setFilteredProperties((prev) => prev.filter((property) => property.id !== id));
      toast.success('Property deleted successfully');
    } catch (err: any) {
      console.error('Delete property error:', err.message);
      toast.error('Failed to delete property: ' + err.message);
    }
  }, [profile?.id, combinedProperties]);

  const generateAgentId = useCallback(async () => {
    try {
      const newId = uuidv4();
      setNewAgentId(newId);
      await supabase.from('agents').insert({
        id: newId,
        email: 'pending@agent.com',
        role: 'agent',
        permissions: {
          canRegisterProperties: true,
          canEditProperties: true,
          canDeleteProperties: false,
          canManageAgents: false,
        },
      });
      toast.success(`New Agent ID: ${newId}`);
    } catch (err: any) {
      console.error('Generate agent ID error:', err.message);
      toast.error('Failed to generate agent ID: ' + err.message);
    }
  }, []);

  const handleSort = useCallback((key: keyof Property) => {
    setSortConfig((prev) => {
      const direction = prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc';
      const sortedData = sortProperties(filteredProperties, key, direction);
      setFilteredProperties(sortedData);
      return { key, direction };
    });
  }, [filteredProperties]);

  const applyFilters = useCallback((properties: (Property | StaticProperty)[], filters: PropertyFilter) => {
    return properties.filter((property) => {
      const matchesCity = filters.city ? property.city.toLowerCase().includes(filters.city.toLowerCase()) : true;
      const matchesType = filters.property_type ? property.property_type === filters.property_type : true;
      const matchesPrice =
        (filters.minPrice ? property.price >= filters.minPrice : true) &&
        (filters.maxPrice ? property.price <= filters.maxPrice : true);
      const matchesSearch = filters.search
        ? property.name.toLowerCase().includes(filters.search.toLowerCase()) ||
          property.address.toLowerCase().includes(filters.search.toLowerCase())
        : true;
      return matchesCity && matchesType && matchesPrice && matchesSearch;
    });
  }, []);

  const handleFilterChange = useCallback((key: keyof PropertyFilter, value: string | number | undefined) => {
    setFilters((prev) => {
      const newFilters = { ...prev, [key]: value };
      setFilteredProperties(applyFilters(combinedProperties, newFilters));
      setCurrentPage(1);
      return newFilters;
    });
  }, [combinedProperties, applyFilters]);

  const clearNotifications = useCallback(async () => {
    try {
      await supabase.from('notifications').delete().eq('agent_id', profile?.id);
      setNotifications([]);
      toast.success('Notifications cleared');
    } catch (err: any) {
      console.error('Clear notifications error:', err.message);
      toast.error('Failed to clear notifications: ' + err.message);
    }
  }, [profile?.id]);

  const paginatedProperties = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredProperties.slice(start, end);
  }, [filteredProperties, currentPage]);

  const priceRanges = useMemo(() => [
    { range: '0-500K', count: filteredProperties.filter((p) => p.price <= 500000).length },
    { range: '500K-1M', count: filteredProperties.filter((p) => p.price > 500000 && p.price <= 1000000).length },
    { range: '1M-2M', count: filteredProperties.filter((p) => p.price > 1000000 && p.price <= 2000000).length },
    { range: '2M+', count: filteredProperties.filter((p) => p.price > 2000000).length },
  ], [filteredProperties]);

  const csvData = useMemo(() => filteredProperties.map((property) => ({
    Name: property.name,
    Address: property.address,
    City: property.city,
    Country: property.country,
    Type: property.property_type,
    Price: property.price,
    Email: property.email,
    Phone: property.phone,
    Created: new Date(property.created_at).toLocaleDateString(),
  })), [filteredProperties]);

  const totalPages = Math.ceil(filteredProperties.length / itemsPerPage);

  if (profile?.role !== 'admin') {
    return (
      <div className="text-center p-8" role="alert">
        <h2 className="text-2xl font-bold text-red-600">Access Denied</h2>
        <p className="text-gray-600 mt-2">You do not have permission to access this page.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" role="status" aria-label="Loading"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8" role="alert">
        <h2 className="text-2xl font-bold text-red-600">Error</h2>
        <p className="text-gray-600 mt-2">{error}</p>
        <button
          onClick={fetchProperties}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600"
          aria-label="Retry fetching properties"
        >
          Retry
        </button>
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
              className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-transform transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-600"
              aria-label="Toggle notifications"
            >
              <Bell className="w-6 h-6 text-blue-600" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {notifications.length}
                </span>
              )}
            </button>
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl z-10 animate-slide-down" role="region" aria-label="Notifications">
                <div className="p-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                    <button
                      onClick={clearNotifications}
                      className="text-sm text-blue-600 hover:text-blue-800 focus:outline-none focus:underline"
                      aria-label="Clear all notifications"
                    >
                      Clear All
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-sm text-gray-500">No new notifications</p>
                  ) : (
                    <ul className="mt-2 space-y-2 max-h-60 overflow-y-auto" aria-live="polite">
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
            <Building className="w-6 h-6 text-blue-600" aria-hidden="true" />
            <span className="text-gray-600">{filteredProperties.length} Properties Listed</span>
          </div>
          {profile?.permissions.canManageAgents && (
            <>
              <button
                onClick={generateAgentId}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-600"
                aria-label="Generate new agent ID"
              >
                Generate Agent ID
              </button>
              <Link
                to="/agent-management"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600"
                aria-label="Manage agents"
              >
                Manage Agents
              </Link>
            </>
          )}
          <CSVLink
            data={csvData}
            filename="properties_export.csv"
            className="flex items-center bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-600"
            aria-label="Export properties as CSV"
          >
            <Download className="w-5 h-5 mr-2" aria-hidden="true" />
            Export CSV
          </CSVLink>
        </div>
      </div>

      {/* Dashboard Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow" role="region" aria-label="Total properties">
          <h3 className="text-lg font-semibold text-gray-900">Total Properties</h3>
          <p className="text-3xl font-bold text-blue-600">{filteredProperties.length}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow" role="region" aria-label="Average price">
          <h3 className="text-lg font-semibold text-gray-900">Average Price</h3>
          <p className="text-3xl font-bold text-blue-600">
            {filteredProperties.length
              ? Math.round(
                  filteredProperties.reduce((sum, p) => sum + p.price, 0) / filteredProperties.length
                ).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })
              : 'N/A'}
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow" role="region" aria-label="New agent ID">
          <h3 className="text-lg font-semibold text-gray-900">New Agent ID</h3>
          <p className="text-sm text-gray-600 truncate">{newAgentId || 'Click to generate'}</p>
        </div>
      </div>

      {/* Price Distribution Chart */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-8" role="region" aria-label="Price distribution chart">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Price Distribution</h3>
        <Bar
          data={{
            labels: priceRanges.map((r) => r.range),
            datasets: [
              {
                label: 'Number of Properties',
                data: priceRanges.map((r) => r.count),
                backgroundColor: [
                  'rgba(59, 130, 246, 0.6)',
                  'rgba(34, 197, 94, 0.6)',
                  'rgba(249, 115, 22, 0.6)',
                  'rgba(239, 68, 68, 0.6)',
                ],
                borderColor: [
                  'rgba(59, 130, 246, 1)',
                  'rgba(34, 197, 94, 1)',
                  'rgba(249, 115, 22, 1)',
                  'rgba(239, 68, 68, 1)',
                ],
                borderWidth: 1,
              },
            ],
          }}
          options={{
            responsive: true,
            scales: {
              y: {
                beginAtZero: true,
                title: {
                  display: true,
                  text: 'Number of Properties',
                },
              },
              x: {
                title: {
                  display: true,
                  text: 'Price Range',
                },
              },
            },
            plugins: {
              legend: {
                display: false,
              },
              tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                titleFont: { size: 14 },
                bodyFont: { size: 12 },
              },
            },
          }}
        />
      </div>

      {/* Filter Section */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-8" role="region" aria-label="Property filters">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Filter Properties</h3>
          <Filter className="w-6 h-6 text-blue-600" aria-hidden="true" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Search by name or address"
            value={filters.search || ''}
            className="border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
            onChange={(e) => handleFilterChange('search', e.target.value)}
            aria-label="Search properties"
          />
          <input
            type="text"
            placeholder="City"
            value={filters.city || ''}
            className="border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
            onChange={(e) => handleFilterChange('city', e.target.value)}
            aria-label="Filter by city"
          />
          <select
            value={filters.property_type || ''}
            className="border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
            onChange={(e) => handleFilterChange('property_type', e.target.value || undefined)}
            aria-label="Filter by property type"
          >
            <option value="">All Types</option>
            <option value="Apartment">Apartment</option>
            <option value="House">House</option>
            <option value="Villa">Villa</option>
          </select>
          <div className="flex space-x-2">
            <input
              type="number"
              placeholder="Min Price"
              value={filters.minPrice || ''}
              className="border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 w-1/2"
              onChange={(e) => handleFilterChange('minPrice', e.target.value ? Number(e.target.value) : undefined)}
              aria-label="Minimum price"
            />
            <input
              type="number"
              placeholder="Max Price"
              value={filters.maxPrice || ''}
              className="border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 w-1/2"
              onChange={(e) => handleFilterChange('maxPrice', e.target.value ? Number(e.target.value) : undefined)}
              aria-label="Maximum price"
            />
          </div>
        </div>
      </div>

      {/* Properties Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden" role="region" aria-label="Properties table">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  onClick={() => handleSort('name')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-blue-600 transition-colors focus:outline-none"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleSort('name')}
                  aria-sort={sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  Property {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort('city')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-blue-600 transition-colors focus:outline-none"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleSort('city')}
                  aria-sort={sortConfig.key === 'city' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  Location {sortConfig.key === 'city' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort('property_type')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-blue-600 transition-colors focus:outline-none"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleSort('property_type')}
                  aria-sort={sortConfig.key === 'property_type' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  Type {sortConfig.key === 'property_type' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort('price')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-blue-600 transition-colors focus:outline-none"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleSort('price')}
                  aria-sort={sortConfig.key === 'price' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
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
              {paginatedProperties.map((property) => (
                <tr key={property.id} className="hover:bg-gray-50 transition-colors">
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
                        className="text-red-600 hover:text-red-900 transition-colors focus:outline-none focus:ring-2 focus:ring-red-600"
                        aria-label={`Delete property ${property.name}`}
                      >
                        <Trash2 className="w-5 h-5" aria-hidden="true" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center px-6 py-4">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:bg-gray-300 hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600"
            aria-label="Previous page"
          >
            Previous
          </button>
          <span className="text-gray-600">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:bg-gray-300 hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600"
            aria-label="Next page"
          >
            Next
          </button>
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