import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Home, FileText, Activity, BarChart ,Link as LinkIcon, ExternalLink} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import { CreateAgentModal } from './AgentManagement';
import { Agent, Property } from '../types';

export function AdminDashboard() {
  const { user, profile } = useAuthStore();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<'agent' | 'property' | null>(null);
  const [propertyData, setPropertyData] = useState({
    street_number: '',
    street_name: '',
    suburb: '',
    property_type: '',
    price: '',
    bedrooms: '',
    bathrooms: '',
    car_garage: '',
    category: '',
    agent_id: '',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [jumpToPage, setJumpToPage] = useState('');

  const dashboardLinks = [
    { name: 'Create New Agent', icon: UserPlus, path:'/create-agent-modal' },
    { name: 'Add Property', icon: Home, path: '/property-form'},
    { name: 'Create Marketing Plan', path: '/marketing-plan', icon: FileText },
    { name: 'Activity Log', path: '/activity-logger', icon: Activity },
    { name: 'Progress Report', path: '/progress-report-page', icon: BarChart },
    { name: 'Reports', path: '/reports', icon: FileText },
    { name: 'Agent Report', path: '/agent-reports', icon: FileText },
    {name: 'Admin Commission', path: '/admin-commission', icon: FileText},
    
  
    {
    name: 'Agent Report',
    path: '/agent-reports',
    icon: FileText,
    action: () => {
      if (agents.length > 0) {
        // Navigate with the first agent's ID or prompt for selection
        navigate(`/agent-reports?agent_id=${agents[0].id}`);
      } else {
        toast.error('No agents available. Please create an agent first.');
      }
    },
  },
  ];

  const fetchAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, name, phone, permissions')
        .eq('role', 'agent');
      if (error) throw error;
      console.log('Fetched agents:', data);
      data?.forEach((agent, index) => {
        if (!agent.permissions) {
          console.warn(`Agent at index ${index} has no permissions:`, agent);
          toast.error(`Agent ${agent.email} has no permissions set`);
        }
      });
      setAgents(data || []);
      setError(null);
      return data;
    } catch (error: any) {
      toast.error('Failed to fetch agents: ' + error.message);
      setError('Failed to fetch agents');
      return [];
    }
  };

  const fetchProperties = async () => {
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('id, street_number, street_name, suburb, property_type, price, bedrooms, bathrooms, car_garage, category, agent_id, agent_name')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setProperties(data || []);
      setError(null);
    } catch (error: any) {
      toast.error('Failed to fetch properties: ' + error.message);
      setError('Failed to fetch properties');
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchAgents();
      await fetchProperties();
      setLoading(false);
    };
    if (profile?.role === 'admin') {
      loadData();
    }
  }, [profile]);

  const handleCreateProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const price = parseFloat(propertyData.price);
      const bedrooms = parseInt(propertyData.bedrooms);
      const bathrooms = parseInt(propertyData.bathrooms);
      const carGarage = parseInt(propertyData.car_garage) || 0;

      if (isNaN(price) || price < 0) throw new Error('Invalid price');
      if (isNaN(bedrooms) || bedrooms < 0) throw new Error('Invalid number of bedrooms');
      if (isNaN(bathrooms) || bathrooms < 0) throw new Error('Invalid number of bathrooms');

      const { error } = await supabase
        .from('properties')
        .insert({
          id: uuidv4(),
          street_number: propertyData.street_number,
          street_name: propertyData.street_name,
          suburb: propertyData.suburb,
          property_type: propertyData.property_type,
          price,
          bedrooms,
          bathrooms,
          car_garage: carGarage,
          category: propertyData.category,
          agent_id: propertyData.agent_id || null,
          created_at: new Date().toISOString(),
        });

      if (error) throw error;
      toast.success('Property added successfully!');
      setShowModal(null);
      setPropertyData({
        street_number: '',
        street_name: '',
        suburb: '',
        property_type: '',
        price: '',
        bedrooms: '',
        bathrooms: '',
        car_garage: '',
        category: '',
        agent_id: '',
      });
      await fetchProperties();
    } catch (error: any) {
      toast.error('Failed to add property: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(properties.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentProperties = properties.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setItemsPerPage(parseInt(e.target.value));
    setCurrentPage(1);
  };

  const handleJumpToPage = (e: React.FormEvent) => {
    e.preventDefault();
    const page = parseInt(jumpToPage);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      setJumpToPage('');
    } else {
      toast.error('Invalid page number');
    }
  };

  const getPageNumbers = () => {
    const pages = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-100 p-8 text-center">
        <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
        <p>Only admins can access this dashboard.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <motion.button
          onClick={() => navigate('/admin-dashboard')}
          className="flex items-center px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-full hover:from-green-700 hover:to-green-800 transition-all shadow-md"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Back to Dashboard
        </motion.button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {dashboardLinks.map((link, index) => (
          <motion.div
            key={index}
            className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer"
            whileHover={{ scale: 1.05 }}
            onClick={() => {
              if (link.action) {
                link.action();
              } else if (link.path) {
                navigate(link.path);
              }
            }}
          >
            <div className="flex items-center">
              <link.icon className="w-6 h-6 mr-2 text-blue-600" />
              <h2 className="text-xl font-semibold">{link.name}</h2>
            </div>
          </motion.div>
        ))}
      </div>

      <CreateAgentModal
        isOpen={showModal === 'agent'}
        onClose={() => setShowModal(null)}
        fetchAgents={fetchAgents}
        fetchProperties={fetchProperties}
      />

      {showModal === 'property' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg max-w-md w-full">
            <h2 className="text-2xl font-semibold mb-4">Add Property</h2>
            <form onSubmit={handleCreateProperty}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">Street Number</label>
                <input
                  type="text"
                  value={propertyData.street_number}
                  onChange={(e) => setPropertyData({ ...propertyData, street_number: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">Street Name</label>
                <input
                  type="text"
                  value={propertyData.street_name}
                  onChange={(e) => setPropertyData({ ...propertyData, street_name: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">Suburb</label>
                <input
                  type="text"
                  value={propertyData.suburb}
                  onChange={(e) => setPropertyData({ ...propertyData, suburb: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">Property Type</label>
                <input
                  type="text"
                  value={propertyData.property_type}
                  onChange={(e) => setPropertyData({ ...propertyData, property_type: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">Price</label>
                <input
                  type="number"
                  value={propertyData.price}
                  onChange={(e) => setPropertyData({ ...propertyData, price: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">Bedrooms</label>
                <input
                  type="number"
                  value={propertyData.bedrooms}
                  onChange={(e) => setPropertyData({ ...propertyData, bedrooms: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">Bathrooms</label>
                <input
                  type="number"
                  value={propertyData.bathrooms}
                  onChange={(e) => setPropertyData({ ...propertyData, bathrooms: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">Car Garage</label>
                <input
                  type="number"
                  value={propertyData.car_garage}
                  onChange={(e) => setPropertyData({ ...propertyData, car_garage: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">Category</label>
                <select
                  value={propertyData.category}
                  onChange={(e) => setPropertyData({ ...propertyData, category: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                >
                  <option value="">Select Category</option>
                  <option value="Listing">Listing</option>
                  <option value="Sold">Sold</option>
                  <option value="Under Offer">Under Offer</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">Agent</label>
                <select
                  value={propertyData.agent_id}
                  onChange={(e) => setPropertyData({ ...propertyData, agent_id: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">No Agent</option>
                  {agents
                    .filter(agent => agent && agent.permissions?.canRegisterProperties) // Only agents with permission
                    .map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name || agent.email}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex justify-end gap-4">
                <button
                  type="button"
                  onClick={() => setShowModal(null)}
                  className="px-4 py-2 text-gray-600 rounded-md hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Adding...' : 'Add Property'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-2xl font-semibold mb-4 flex items-center">
          <UserPlus className="w-6 h-6 mr-2" /> Agents
        </h2>
        {loading ? (
          <div className="text-center text-gray-600">Loading agents...</div>
        ) : agents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b">
                  <th className="py-2 px-4">Name</th>
                  <th className="py-2 px-4">Email</th>
                  <th className="py-2 px-4">Phone</th>
                </tr>
              </thead>
              <tbody>
                {agents
                  .filter(agent => agent && agent.permissions) // Filter valid agents
                  .map((agent) => (
                    <tr key={agent.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-4">{agent.name || '-'}</td>
                      <td className="py-2 px-4">{agent.email}</td>
                      <td className="py-2 px-4">{agent.phone || '-'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-600">No agents found.</p>
        )}
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-2xl font-semibold mb-4 flex items-center">
          <Home className="w-6 h-6 mr-2" /> Properties
        </h2>
        {loading ? (
          <div className="text-center text-gray-600">Loading properties...</div>
        ) : properties.length > 0 ? (
          <>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentPage}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="overflow-x-auto"
              >
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 px-4">Address</th>
                      <th className="py-2 px-4">Type</th>
                      <th className="py-2 px-4">Price</th>
                      <th className="py-2 px-4">Bedrooms</th>
                      <th className="py-2 px-4">Bathrooms</th>
                      <th className="py-2 px-4">Garage</th>
                      <th className="py-2 px-4">Category</th>
                      <th className="py-2 px-4">Agent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentProperties.map((property) => {
                      const agent = property.agent_id ? agents.find((a) => a.id === property.agent_id) : null;
                      return (
                        <motion.tr
                          key={property.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.2 }}
                          className="border-b hover:bg-gray-50"
                        >
                          <td className="py-2 px-4">{`${property.street_number} ${property.street_name}, ${property.suburb}`}</td>
                          <td className="py-2 px-4">{property.property_type}</td>
                          <td className="py-2 px-4">${property.price.toLocaleString()}</td>
                          <td className="py-2 px-4">{property.bedrooms}</td>
                          <td className="py-2 px-4">{property.bathrooms}</td>
                          <td className="py-2 px-4">{property.car_garage}</td>
                          <td className="py-2 px-4">{property.category}</td>
                          <td className="py-2 px-4">
                            {property.agent_id ? (
                              agent ? (
                                agent.name || agent.email
                              ) : (
                                <span className="text-red-600">
                                  Invalid Agent ID
                                  <button
                                    onClick={() => fetchAgents()}
                                    className="ml-2 text-sm text-blue-600 underline"
                                  >
                                    Retry
                                  </button>
                                </span>
                              )
                            ) : (
                              'Unassigned'
                            )}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </motion.div>
            </AnimatePresence>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Items per page:</label>
                <select
                  value={itemsPerPage}
                  onChange={handleItemsPerPageChange}
                  className="px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
              </div>

              <div className="flex items-center gap-4">
                <motion.button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-50 hover:bg-blue-700"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Previous
                </motion.button>

                <div className="flex gap-2">
                  {getPageNumbers().map((page) => (
                    <motion.button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      className={`px-3 py-1 rounded-md ${
                        currentPage === page ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      {page}
                    </motion.button>
                  ))}
                </div>

                <motion.button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-50 hover:bg-blue-700"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Next
                </motion.button>
              </div>

              <form onSubmit={handleJumpToPage} className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Go to page:</label>
                <input
                  type="number"
                  value={jumpToPage}
                  onChange={(e) => setJumpToPage(e.target.value)}
                  className="w-16 px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Page"
                  min={1}
                  max={totalPages}
                />
                <motion.button
                  type="submit"
                  className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Go
                </motion.button>
              </form>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Showing {startIndex + 1} to {Math.min(endIndex, properties.length)} of {properties.length} properties
            </p>
          </>
        ) : (
          <div className="text-gray-600">
            <p>No properties found.</p>
            <button
              onClick={() => setShowModal('property')}
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Add Property
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-100 p-4 rounded-lg text-red-700">
          <p>{error}</p>
          <button
            onClick={() => {
              fetchAgents();
              fetchProperties();
            }}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}