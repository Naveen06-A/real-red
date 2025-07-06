import { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { toast, Toaster } from 'react-hot-toast';
import { Download, Search, ChevronLeft, ChevronRight, Pencil, CheckSquare, X, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../utils/formatters';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { utils, writeFile } from 'xlsx';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend, ArcElement } from 'chart.js';

// Register Chart.js components
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend, ArcElement);

// Interfaces
interface PropertyDetails {
  id: string;
  agency_name: string | null;
  agent_name: string | null;
  commission: number;
  price: number;
  sold_price: number | null;
  suburb: string | null;
  street_name: string | null;
  street_number: string | null;
  contract_status: string | null;
  sold_date: string | null;
}

interface AgentCommission {
  id?: string;
  property_id: string;
  agent_name: string;
  commission_rate: number;
}

interface CommissionEditState {
  isOpen: boolean;
  propertyId: string | null;
  agency: string | null;
  agent: string | null;
  newCommission: number;
}

interface BatchEditState {
  isOpen: boolean;
  selectedProperties: string[];
  newCommission: number;
}

interface SimulatorState {
  isOpen: boolean;
  commissionRate: number;
  selectedAgency: string | null;
}

// Helper Functions
const normalizeAgencyName = (agency: string | null): string => agency?.trim().toLowerCase() || 'Unknown';
const normalizeAgentName = (agent: string | null): string => agent?.trim() || 'Unknown';

// Collapsible Section Component
const CollapsibleSection: React.FC<{
  title: string;
  children: React.ReactNode;
  isOpen: boolean;
  toggleOpen: () => void;
}> = ({ title, children, isOpen, toggleOpen }) => (
  <motion.div
    className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
  >
    <button
      onClick={toggleOpen}
      className="w-full flex justify-between items-center p-5 text-xl font-semibold text-gray-800 hover:bg-blue-50 transition-colors duration-300"
    >
      {title}
      {isOpen ? <X className="w-6 h-6 text-blue-600" /> : <Pencil className="w-6 h-6 text-blue-600" />}
    </button>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="p-5"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  </motion.div>
);

const AdminCommissionByAgency = () => {
  const [properties, setProperties] = useState<PropertyDetails[]>([]);
  const [agentCommissions, setAgentCommissions] = useState<AgentCommission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);
  const [commissionEdit, setCommissionEdit] = useState<CommissionEditState>({
    isOpen: false,
    propertyId: null,
    agency: null,
    agent: null,
    newCommission: 0,
  });
  const [batchEdit, setBatchEdit] = useState<BatchEditState>({
    isOpen: false,
    selectedProperties: [],
    newCommission: 0,
  });
  const [simulator, setSimulator] = useState<SimulatorState>({
    isOpen: false,
    commissionRate: 2.5,
    selectedAgency: null,
  });
  const [previewImpact, setPreviewImpact] = useState<{ oldTotal: number; newTotal: number } | null>(null);
  const [selectedAgency, setSelectedAgency] = useState<string | null>(null);
  const [chartPage, setChartPage] = useState(1);
  const itemsPerPage = 10;
  const chartItemsPerPage = 5;
  const { user, profile } = useAuthStore();
  const navigate = useNavigate();

  // Debug user and profile state
  useEffect(() => {
    console.log('User object:', user);
    console.log('Profile object:', profile);
    if (!user) {
      toast.error('No user logged in. Redirecting to login...');
      setTimeout(() => navigate('/admin-login'), 2000);
    } else if (profile?.role !== 'admin') {
      toast.error(`Access denied. User role: ${profile?.role || 'none'}`);
    }
  }, [user, profile, navigate]);

  const isAdmin = profile?.role === 'admin';

  // Fetch data
  useEffect(() => {
    if (!isAdmin) return;
    const fetchData = async () => {
      setIsLoading(true);
      setFetchError(null);
      try {
        const { data: propertiesData, error: propertiesError } = await supabase
          .from('properties')
          .select('id, agency_name, agent_name, commission, price, sold_price, suburb, street_name, street_number, contract_status, sold_date');
        if (propertiesError) throw propertiesError;

        const { data: agentCommissionsData, error: agentCommissionsError } = await supabase
          .from('agent_commissions')
          .select('id, property_id, agent_name, commission_rate');
        if (agentCommissionsError) throw agentCommissionsError;

        setProperties(propertiesData || []);
        setAgentCommissions(agentCommissionsData || []);
      } catch (error: any) {
        setFetchError(error.message || 'Failed to fetch data.');
        toast.error(error.message || 'Failed to fetch data.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [isAdmin]);

  // Calculate top earners
  const topEarners = useMemo(() => {
    const agencyCommissions: { [key: string]: number } = {};
    const agentCommissionsMap: { [key: string]: number } = {};

    properties.forEach(p => {
      const price = p.sold_price || p.price || 0;
      const commissionRate = agentCommissions.find(ac => ac.property_id === p.id)?.commission_rate || p.commission || 0;
      const commission = price * (commissionRate / 100);
      const agency = normalizeAgencyName(p.agency_name);
      const agent = normalizeAgentName(p.agent_name);

      agencyCommissions[agency] = (agencyCommissions[agency] || 0) + commission;
      agentCommissionsMap[agent] = (agentCommissionsMap[agent] || 0) + commission;
    });

    const topAgency = Object.entries(agencyCommissions).reduce(
      (top, [name, total]) => (total > top.total ? { name, total } : top),
      { name: 'None', total: 0 }
    );

    const topAgent = Object.entries(agentCommissionsMap).reduce(
      (top, [name, total]) => (total > top.total ? { name, total } : top),
      { name: 'None', total: 0 }
    );

    return { topAgency, topAgent };
  }, [properties, agentCommissions]);

  // Calculate commission impact
  const calculateImpact = useCallback(
    (propertyIds: string[], newCommission: number) => {
      let oldTotal = 0;
      let newTotal = 0;
      properties
        .filter(p => propertyIds.includes(p.id))
        .forEach(p => {
          const price = p.sold_price || p.price || 0;
          const currentCommission = agentCommissions.find(ac => ac.property_id === p.id)?.commission_rate || p.commission || 0;
          oldTotal += price * (currentCommission / 100);
          newTotal += price * (newCommission / 100);
        });
      return { oldTotal, newTotal };
    },
    [properties, agentCommissions]
  );

  // Calculate commission data for listed and sold properties
  const commissionData = useMemo(() => {
    const agencyMap: { [key: string]: { listed: number; sold: number } } = {};
    properties.forEach(p => {
      const agency = normalizeAgencyName(p.agency_name);
      const price = p.sold_price || p.price || 0; // Use sold_price if available, otherwise price
      const commissionRate = agentCommissions.find(ac => ac.property_id === p.id)?.commission_rate || p.commission || 0;
      const commission = price * (commissionRate / 100);
      if (!agencyMap[agency]) agencyMap[agency] = { listed: 0, sold: 0 };
      if (p.contract_status === 'sold') agencyMap[agency].sold += commission;
      else agencyMap[agency].listed += commission; // Listed includes all non-sold statuses
    });
    return Object.entries(agencyMap).map(([agency, data]) => ({ agency, ...data }));
  }, [properties, agentCommissions]);

  // Paginate commission data
  const paginatedCommissionData = useMemo(() => {
    const start = (chartPage - 1) * chartItemsPerPage;
    const end = start + chartItemsPerPage;
    return commissionData.slice(start, end);
  }, [commissionData, chartPage]);

  const totalChartPages = Math.ceil(commissionData.length / chartItemsPerPage);

  // Property count
  const propertyCount = useMemo(() => {
    const total = properties.length;
    const listed = properties.filter(p => p.contract_status !== 'sold' && p.contract_status !== null).length;
    const sold = properties.filter(p => p.contract_status === 'sold').length;
    return { total, listed, sold };
  }, [properties]);

  // Simulator chart data
  const simulatorChartData = useMemo(() => {
    if (!simulator.isOpen || !simulator.selectedAgency) return null;
    const currentTotal = properties
      .filter(p => normalizeAgencyName(p.agency_name) === simulator.selectedAgency)
      .reduce((sum, p) => {
        const price = p.sold_price || p.price || 0;
        const commission = agentCommissions.find(ac => ac.property_id === p.id)?.commission_rate || p.commission || 0;
        return sum + (price * (commission / 100));
      }, 0);
    const simulatedTotal = properties
      .filter(p => normalizeAgencyName(p.agency_name) === simulator.selectedAgency)
      .reduce((sum, p) => {
        const price = p.sold_price || p.price || 0;
        return sum + (price * (simulator.commissionRate / 100));
      }, 0);
    return {
      type: 'bar',
      data: {
        labels: ['Current', 'Simulated'],
        datasets: [{
          label: `Commission for ${simulator.selectedAgency}`,
          data: [currentTotal, simulatedTotal],
          backgroundColor: ['rgba(59, 130, 246, 0.7)', 'rgba(16, 185, 129, 0.7)'],
          borderColor: ['#1E3A8A', '#065F46'],
          borderWidth: 1,
          barThickness: 40,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Commission ($)', font: { size: 14, family: 'Arial' } },
            grid: { color: 'rgba(229, 231, 235, 0.5)' },
            ticks: {
              font: { size: 12, family: 'Arial' },
              padding: 10,
              callback: (value: number) => formatCurrency(value),
            },
          },
          x: {
            title: { display: true, text: 'Type', font: { size: 14, family: 'Arial' } },
            grid: { display: false },
            ticks: {
              font: { size: 12, family: 'Arial' },
            },
          },
        },
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: `Commission Simulation for ${simulator.selectedAgency}`,
            font: { size: 18, weight: 'bold', family: 'Arial' },
            padding: { top: 15, bottom: 25 },
            color: '#1F2937',
          },
          tooltip: {
            backgroundColor: 'rgba(31, 41, 55, 0.9)',
            titleFont: { size: 16, family: 'Arial' },
            bodyFont: { size: 14, family: 'Arial' },
            padding: 12,
            cornerRadius: 8,
          },
        },
        layout: {
          padding: 20,
        },
      },
    };
  }, [simulator, properties, agentCommissions]);

  // Update single property commission
  const updateCommission = useCallback(async () => {
    if (!commissionEdit.propertyId || !isAdmin) return;
    const commissionValue = commissionEdit.newCommission;
    if (commissionValue <= 0 || commissionValue > 10) {
      toast.error('Commission rate must be between 0% and 10%.');
      return;
    }
    try {
      const property = properties.find(p => p.id === commissionEdit.propertyId);
      if (!property) throw new Error('Property not found.');

      const { error: propError } = await supabase
        .from('properties')
        .update({ commission: commissionValue })
        .eq('id', commissionEdit.propertyId);
      if (propError) throw propError;

      const existingCommission = agentCommissions.find(
        ac => ac.property_id === commissionEdit.propertyId && ac.agent_name === normalizeAgentName(commissionEdit.agent)
      );
      if (existingCommission) {
        const { error } = await supabase
          .from('agent_commissions')
          .update({ commission_rate: commissionValue })
          .eq('id', existingCommission.id);
        if (error) throw error;
      } else if (commissionEdit.agent) {
        const { error } = await supabase
          .from('agent_commissions')
          .insert({
            property_id: commissionEdit.propertyId,
            agent_name: commissionEdit.agent,
            commission_rate: commissionValue,
          });
        if (error) throw error;
      }

      const { data: propertiesData, error: propertiesError } = await supabase
        .from('properties')
        .select('id, agency_name, agent_name, commission, price, sold_price, suburb, street_name, street_number, contract_status, sold_date');
      const { data: agentCommissionsData, error: agentCommissionsError } = await supabase
        .from('agent_commissions')
        .select('id, property_id, agent_name, commission_rate');
      if (propertiesError || agentCommissionsError) throw propertiesError || agentCommissionsError;

      setProperties(propertiesData || []);
      setAgentCommissions(agentCommissionsData || []);
      toast.success(`Commission updated for property ${commissionEdit.propertyId}.`);
      setCommissionEdit({ isOpen: false, propertyId: null, agency: null, agent: null, newCommission: 0 });
      setPreviewImpact(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update commission.');
    }
  }, [commissionEdit, isAdmin, properties, agentCommissions]);

  // Batch update commissions
  const batchUpdateCommissions = useCallback(async () => {
    if (!batchEdit.selectedProperties.length || !isAdmin) return;
    const commissionValue = batchEdit.newCommission;
    if (commissionValue <= 0 || commissionValue > 10) {
      toast.error('Commission rate must be between 0% and 10%.');
      return;
    }
    try {
      const { error: propError } = await supabase
        .from('properties')
        .update({ commission: commissionValue })
        .in('id', batchEdit.selectedProperties);
      if (propError) throw propError;

      for (const propertyId of batchEdit.selectedProperties) {
        const property = properties.find(p => p.id === propertyId);
        if (!property) continue;
        const agentName = normalizeAgentName(property.agent_name);
        const existingCommission = agentCommissions.find(ac => ac.property_id === propertyId && ac.agent_name === agentName);
        if (existingCommission) {
          const { error } = await supabase
            .from('agent_commissions')
            .update({ commission_rate: commissionValue })
            .eq('id', existingCommission.id);
          if (error) throw error;
        } else if (agentName !== 'Unknown') {
          const { error } = await supabase
            .from('agent_commissions')
            .insert({ property_id: propertyId, agent_name: agentName, commission_rate: commissionValue });
          if (error) throw error;
        }
      }

      const { data: propertiesData, error: propertiesError } = await supabase
        .from('properties')
        .select('id, agency_name, agent_name, commission, price, sold_price, suburb, street_name, street_number, contract_status, sold_date');
      const { data: agentCommissionsData, error: agentCommissionsError } = await supabase
        .from('agent_commissions')
        .select('id, property_id, agent_name, commission_rate');
      if (propertiesError || agentCommissionsError) throw propertiesError || agentCommissionsError;

      setProperties(propertiesData || []);
      setAgentCommissions(agentCommissionsData || []);
      toast.success(`Commissions updated for ${batchEdit.selectedProperties.length} properties.`);
      setBatchEdit({ isOpen: false, selectedProperties: [], newCommission: 0 });
      setSelectedProperties([]);
      setPreviewImpact(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update commissions.');
    }
  }, [batchEdit, isAdmin, properties, agentCommissions]);

  // Export CSV
  const exportCSV = () => {
    const data = [
      ['Admin Commission Report', 'Generated on: ' + new Date().toLocaleString()],
      ['Total Properties', propertyCount.total],
      ['Listed Properties', propertyCount.listed],
      ['Sold Properties', propertyCount.sold],
      ['Top Agency', `${topEarners.topAgency.name} (${formatCurrency(topEarners.topAgency.total)})`],
      ['Top Agent', `${topEarners.topAgent.name} (${formatCurrency(topEarners.topAgent.total)})`],
      [],
      ['Property ID', 'Address', 'Agency', 'Agent', 'Commission Rate', 'Price', 'Status'],
      ...properties.map(p => [
        p.id,
        `${p.street_number} ${p.street_name}, ${p.suburb || 'Unknown'}`,
        normalizeAgencyName(p.agency_name),
        normalizeAgentName(p.agent_name),
        `${agentCommissions.find(ac => ac.property_id === p.id)?.commission_rate || p.commission || 0}%`,
        formatCurrency(p.sold_price || p.price || 0),
        p.contract_status || 'Unknown',
      ]),
    ];
    const ws = utils.aoa_to_sheet(data);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Commission Report');
    writeFile(wb, 'admin_commission_report.csv');
    toast.success('Commission report exported as CSV');
  };

  // Export PDF
  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Admin Commission Report', 20, 10);
    doc.setFontSize(12);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, 20);
    doc.text(`Total Properties: ${propertyCount.total}`, 20, 30);
    doc.text(`Listed Properties: ${propertyCount.listed}`, 20, 40);
    doc.text(`Sold Properties: ${propertyCount.sold}`, 20, 50);
    doc.text(`Top Agency: ${topEarners.topAgency.name} (${formatCurrency(topEarners.topAgency.total)})`, 20, 60);
    doc.text(`Top Agent: ${topEarners.topAgent.name} (${formatCurrency(topEarners.topAgent.total)})`, 20, 70);
    autoTable(doc, {
      head: [['Property ID', 'Address', 'Agency', 'Agent', 'Commission Rate', 'Price', 'Status']],
      body: properties.map(p => [
        p.id,
        `${p.street_number} ${p.street_name}, ${p.suburb || 'Unknown'}`,
        normalizeAgencyName(p.agency_name),
        normalizeAgentName(p.agent_name),
        `${agentCommissions.find(ac => ac.property_id === p.id)?.commission_rate || p.commission || 0}%`,
        formatCurrency(p.sold_price || p.price || 0),
        p.contract_status || 'Unknown',
      ]),
      startY: 80,
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255] },
    });
    doc.save('commission_report.pdf');
    toast.success('Commission report exported as PDF');
  };

  // Filter and paginate properties
  const filteredProperties = useMemo(() => {
    return properties.filter(
      p =>
        normalizeAgencyName(p.agency_name).includes(searchQuery.toLowerCase()) ||
        normalizeAgentName(p.agent_name).includes(searchQuery.toLowerCase()) ||
        `${p.street_number} ${p.street_name}`.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [properties, searchQuery]);

  const paginatedProperties = filteredProperties.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(filteredProperties.length / itemsPerPage);

  // Pagination range (show max 5 pages at a time)
  const getPaginationRange = () => {
    const maxPagesToShow = 5;
    const startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    const endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    const adjustedStartPage = Math.max(1, endPage - maxPagesToShow + 1);
    return Array.from({ length: endPage - adjustedStartPage + 1 }, (_, i) => adjustedStartPage + i);
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="p-8 bg-white rounded-2xl shadow-xl text-center text-red-600">
          <p className="text-xl font-semibold">Access denied. Admin only.</p>
          <motion.button
            onClick={() => navigate('/admin-login')}
            className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-full flex items-center mx-auto"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Go to Login
          </motion.button>
        </div>
      </div>
    );
  }
  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-100"><div className="text-xl text-gray-600 animate-pulse">Loading...</div></div>;
  if (fetchError) return <div className="min-h-screen flex items-center justify-center bg-gray-100"><div className="p-8 bg-white rounded-2xl shadow-xl text-center text-red-600">Error: {fetchError}</div></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 p-6 sm:p-8">
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <h1 className="text-4xl font-bold text-gray-900">Commission Management Dashboard</h1>
          <motion.button
            onClick={() => navigate('/admin-dashboard')}
            className="px-6 py-3 bg-blue-600 text-white rounded-full flex items-center shadow-lg"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Dashboard
          </motion.button>
        </div>

        {/* Top Earners Summary */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 gap-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800">Top Agency</h2>
            <p className="mt-2 text-2xl font-bold text-blue-600">{topEarners.topAgency.name}</p>
            <p className="text-sm text-gray-600">Total Commission: {formatCurrency(topEarners.topAgency.total)}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800">Top Agent</h2>
            <p className="mt-2 text-2xl font-bold text-blue-600">{topEarners.topAgent.name}</p>
            <p className="text-sm text-gray-600">Total Commission: {formatCurrency(topEarners.topAgent.total)}</p>
          </div>
        </motion.div>

        {/* Search and Filters */}
        <motion.div
          className="bg-white p-6 rounded-2xl shadow-xl flex flex-col sm:flex-row gap-4 items-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="relative w-full sm:w-80">
            <input
              type="text"
              placeholder="Search properties, agencies, agents..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-12 pr-4 py-3 border border-gray-200 rounded-full w-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-300"
              aria-label="Search properties, agencies, or agents"
            />
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          </div>
          <div className="flex gap-4">
            <motion.button
              onClick={() => setBatchEdit({ ...batchEdit, isOpen: true })}
              disabled={!selectedProperties.length}
              className={`px-6 py-3 rounded-full text-sm flex items-center shadow-lg ${
                selectedProperties.length ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
              whileHover={{ scale: selectedProperties.length ? 1.05 : 1 }}
              whileTap={{ scale: selectedProperties.length ? 0.95 : 1 }}
            >
              <CheckSquare className="w-5 h-5 mr-2" />
              Edit Selected ({selectedProperties.length})
            </motion.button>
            <motion.button
              onClick={exportCSV}
              className="px-6 py-3 bg-blue-600 text-white rounded-full flex items-center shadow-lg"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Download className="w-5 h-5 mr-2" />
              CSV
            </motion.button>
            <motion.button
              onClick={exportPDF}
              className="px-6 py-3 bg-blue-600 text-white rounded-full flex items-center shadow-lg"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Download className="w-5 h-5 mr-2" />
              PDF
            </motion.button>
          </div>
        </motion.div>

        {/* Commission Simulator */}
        <CollapsibleSection
          title="Commission Simulator"
          isOpen={simulator.isOpen}
          toggleOpen={() => setSimulator({ ...simulator, isOpen: !simulator.isOpen })}
        >
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Agency</label>
              <select
                value={simulator.selectedAgency || ''}
                onChange={e => setSimulator({ ...simulator, selectedAgency: e.target.value })}
                className="w-full p-3 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select an agency</option>
                {[...new Set(properties.map(p => normalizeAgencyName(p.agency_name)))].map(agency => (
                  <option key={agency} value={agency}>{agency}</option>
                ))}
              </select>
            </div>
            {simulator.selectedAgency && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Simulated Commission Rate (%)</label>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.1"
                    value={simulator.commissionRate}
                    onChange={e => setSimulator({ ...simulator, commissionRate: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-gray-200 rounded-full cursor-pointer focus:outline-none accent-blue-600"
                  />
                  <div className="text-center mt-3 text-lg font-medium text-gray-800">{simulator.commissionRate}%</div>
                </div>
                {simulatorChartData && (
                  <div className="h-80">
                    <Bar data={simulatorChartData.data} options={simulatorChartData.options} />
                  </div>
                )}
              </>
            )}
          </div>
        </CollapsibleSection>

        {/* Properties Table */}
        <CollapsibleSection
          title="Commission Management"
          isOpen={true}
          toggleOpen={() => {}}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={selectedProperties.length === filteredProperties.length && filteredProperties.length > 0}
                      onChange={e =>
                        setSelectedProperties(e.target.checked ? filteredProperties.map(p => p.id) : [])
                      }
                      className="rounded border-gray-300 focus:ring-blue-500"
                    />
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Property</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agency</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Commission</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <AnimatePresence>
                  {paginatedProperties.map((property, index) => (
                    <motion.tr
                      key={property.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2, delay: index * 0.05 }}
                      className="hover:bg-blue-50 transition-colors duration-200"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedProperties.includes(property.id)}
                          onChange={() =>
                            setSelectedProperties(
                              selectedProperties.includes(property.id)
                                ? selectedProperties.filter(id => id !== property.id)
                                : [...selectedProperties, property.id]
                            )
                          }
                          className="rounded border-gray-300 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {`${property.street_number} ${property.street_name}, ${property.suburb || 'Unknown'}`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {normalizeAgencyName(property.agency_name)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {normalizeAgentName(property.agent_name)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {agentCommissions.find(ac => ac.property_id === property.id)?.commission_rate ||
                          property.commission ||
                          0}
                        %
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <motion.button
                          onClick={() =>
                            setCommissionEdit({
                              isOpen: true,
                              propertyId: property.id,
                              agency: normalizeAgencyName(property.agency_name),
                              agent: normalizeAgentName(property.agent_name),
                              newCommission:
                                agentCommissions.find(ac => ac.property_id === property.id)?.commission_rate ||
                                property.commission ||
                                0,
                            })
                          }
                          className="px-4 py-2 bg-blue-600 text-white rounded-full flex items-center shadow-md"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </motion.button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="mt-6 flex justify-center items-center space-x-2">
              <motion.button
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className={`px-4 py-2 rounded-full text-sm font-medium shadow-md ${
                  currentPage === 1 ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
                whileHover={{ scale: currentPage === 1 ? 1 : 1.05 }}
                whileTap={{ scale: currentPage === 1 ? 1 : 0.95 }}
              >
                Prev
              </motion.button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, currentPage - 3), Math.min(totalPages, currentPage + 2)).map(page => (
                <motion.button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-4 py-2 rounded-full text-sm font-medium shadow-md ${
                    currentPage === page ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {page}
                </motion.button>
              ))}
              <motion.button
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className={`px-4 py-2 rounded-full text-sm font-medium shadow-md ${
                  currentPage === totalPages ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
                whileHover={{ scale: currentPage === totalPages ? 1 : 1.05 }}
                whileTap={{ scale: currentPage === totalPages ? 1 : 0.95 }}
              >
                Next
              </motion.button>
            </div>
          )}
        </CollapsibleSection>

        {/* Commission Distribution */}
        <CollapsibleSection
          title="Commission Distribution"
          isOpen={true}
          toggleOpen={() => {}}
        >
          <div className="space-y-8">
            {/* Property Count Summary */}
            <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Property Statistics</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="p-4 bg-blue-50 rounded-lg shadow-sm">
                  <p className="text-sm font-medium text-gray-600">Total Properties</p>
                  <p className="text-2xl font-bold text-blue-600">{propertyCount.total}</p>
                  <p className="text-xs text-gray-500 mt-1">All properties in the system</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg shadow-sm">
                  <p className="text-sm font-medium text-gray-600">Listed Properties</p>
                  <p className="text-2xl font-bold text-green-600">{propertyCount.listed}</p>
                  <p className="text-xs text-gray-500 mt-1">Properties not yet sold</p>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg shadow-sm">
                  <p className="text-sm font-medium text-gray-600">Sold Properties</p>
                  <p className="text-2xl font-bold text-purple-600">{propertyCount.sold}</p>
                  <p className="text-xs text-gray-500 mt-1">Properties marked as sold</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Commissions by Agency (Listed vs Sold)</h3>
              {commissionData.length > 0 ? (
                <div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agency</th>
                          <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Listed Commission ($)</th>
                          <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Sold Commission ($)</th>
                          <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Commission ($)</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {paginatedCommissionData.map((data, index) => (
                          <motion.tr
                            key={data.agency}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2, delay: index * 0.05 }}
                            className="hover:bg-blue-50 transition-colors duration-200"
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{data.agency}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">{formatCurrency(data.listed)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">{formatCurrency(data.sold)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">{formatCurrency(data.listed + data.sold)}</td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalChartPages > 1 && (
                    <div className="mt-6 flex justify-center items-center space-x-2">
                      <motion.button
                        onClick={() => setChartPage(p => Math.max(p - 1, 1))}
                        disabled={chartPage === 1}
                        className={`px-4 py-2 rounded-full text-sm font-medium shadow-md ${
                          chartPage === 1 ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                        whileHover={{ scale: chartPage === 1 ? 1 : 1.05 }}
                        whileTap={{ scale: chartPage === 1 ? 1 : 0.95 }}
                      >
                        Prev
                      </motion.button>
                      {Array.from({ length: totalChartPages }, (_, i) => i + 1).slice(Math.max(0, chartPage - 3), Math.min(totalChartPages, chartPage + 2)).map(page => (
                        <motion.button
                          key={page}
                          onClick={() => setChartPage(page)}
                          className={`px-4 py-2 rounded-full text-sm font-medium shadow-md ${
                            chartPage === page ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          {page}
                        </motion.button>
                      ))}
                      <motion.button
                        onClick={() => setChartPage(p => Math.min(p + 1, totalChartPages))}
                        disabled={chartPage === totalChartPages}
                        className={`px-4 py-2 rounded-full text-sm font-medium shadow-md ${
                          chartPage === totalChartPages ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                        whileHover={{ scale: chartPage === totalChartPages ? 1 : 1.05 }}
                        whileTap={{ scale: chartPage === totalChartPages ? 1 : 0.95 }}
                      >
                        Next
                      </motion.button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-center text-gray-600 text-lg">No data available for commission distribution.</p>
              )}
            </div>
          </div>
        </CollapsibleSection>

        {/* Single Commission Edit Modal */}
        {commissionEdit.isOpen && (
          <motion.div
            className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-2xl"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <h3 className="text-xl font-semibold text-gray-800 mb-6">
                Edit Commission for {commissionEdit.propertyId}
              </h3>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Commission Rate (%)</label>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.1"
                  value={commissionEdit.newCommission}
                  onChange={e =>
                    setCommissionEdit({ ...commissionEdit, newCommission: parseFloat(e.target.value) })
                  }
                  onMouseUp={() => setPreviewImpact(calculateImpact([commissionEdit.propertyId!], commissionEdit.newCommission))}
                  className="w-full h-2 bg-gray-200 rounded-full cursor-pointer focus:outline-none accent-blue-600"
                />
                <div className="text-center mt-3 text-lg font-medium text-gray-800">{commissionEdit.newCommission}%</div>
              </div>
              {previewImpact && (
                <div className="mb-6 p-4 bg-blue-50 rounded-lg shadow-inner">
                  <p className="text-sm text-gray-700">Current Commission: {formatCurrency(previewImpact.oldTotal)}</p>
                  <p className="text-sm text-gray-700">New Commission: {formatCurrency(previewImpact.newTotal)}</p>
                  <p className={`text-sm font-medium ${previewImpact.newTotal > previewImpact.oldTotal ? 'text-green-600' : 'text-red-600'}`}>
                    Change: {formatCurrency(previewImpact.newTotal - previewImpact.oldTotal)}
                  </p>
                </div>
              )}
              <div className="flex justify-end space-x-4">
                <motion.button
                  onClick={() => {
                    setCommissionEdit({ isOpen: false, propertyId: null, agency: null, agent: null, newCommission: 0 });
                    setPreviewImpact(null);
                  }}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-full shadow-md"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  onClick={updateCommission}
                  className="px-6 py-3 bg-blue-600 text-white rounded-full shadow-md"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Save
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Batch Edit Modal */}
        {batchEdit.isOpen && (
          <motion.div
            className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-2xl"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <h3 className="text-xl font-semibold text-gray-800 mb-6">
                Batch Edit Commissions ({batchEdit.selectedProperties.length} Properties)
              </h3>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Commission Rate (%)</label>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.1"
                  value={batchEdit.newCommission}
                  onChange={e =>
                    setBatchEdit({ ...batchEdit, newCommission: parseFloat(e.target.value) })
                  }
                  onMouseUp={() => setPreviewImpact(calculateImpact(batchEdit.selectedProperties, batchEdit.newCommission))}
                  className="w-full h-2 bg-gray-200 rounded-full cursor-pointer focus:outline-none accent-blue-600"
                />
                <div className="text-center mt-3 text-lg font-medium text-gray-800">{batchEdit.newCommission}%</div>
              </div>
              {previewImpact && (
                <div className="mb-6 p-4 bg-blue-50 rounded-lg shadow-inner">
                  <p className="text-sm text-gray-700">Current Total Commission: {formatCurrency(previewImpact.oldTotal)}</p>
                  <p className="text-sm text-gray-700">New Total Commission: {formatCurrency(previewImpact.newTotal)}</p>
                  <p className={`text-sm font-medium ${previewImpact.newTotal > previewImpact.oldTotal ? 'text-green-600' : 'text-red-600'}`}>
                    Change: {formatCurrency(previewImpact.newTotal - previewImpact.oldTotal)}
                  </p>
                </div>
              )}
              <div className="flex justify-end space-x-4">
                <motion.button
                  onClick={() => {
                    setBatchEdit({ isOpen: false, selectedProperties: [], newCommission: 0 });
                    setPreviewImpact(null);
                  }}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-full shadow-md"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  onClick={batchUpdateCommissions}
                  className="px-6 py-3 bg-blue-600 text-white rounded-full shadow-md"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Save
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default AdminCommissionByAgency;