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
import { Bar, Line, Pie } from 'react-chartjs-2';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend, LineElement, PointElement, PieController, ArcElement } from 'chart.js';

// Register Chart.js components (updated to include Line and Pie elements)
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend, LineElement, PointElement, PieController, ArcElement);

// Interfaces (unchanged)
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

// Helper Functions (unchanged)
const normalizeAgencyName = (agency: string | null): string => agency?.trim().toLowerCase() || 'Unknown';
const normalizeAgentName = (agent: string | null): string => agent?.trim() || 'Unknown';

// Collapsible Section Component (unchanged)
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
  const itemsPerPage = 10;
  const { user, profile } = useAuthStore();
  const navigate = useNavigate();

  // Debug user and profile state (unchanged)
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

  // Fetch data (unchanged)
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

  // Calculate top earners (unchanged)
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

  // Calculate commission impact (unchanged)
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

  // Agency commission chart data
  const agencyChartData = useMemo(() => ({
    labels: [...new Set(properties.map(p => normalizeAgencyName(p.agency_name)))],
    datasets: [{
      label: 'Total Commission by Agency',
      data: [...new Set(properties.map(p => normalizeAgencyName(p.agency_name)))].map(agency =>
        properties
          .filter(p => normalizeAgencyName(p.agency_name) === agency)
          .reduce((sum, p) => {
            const price = p.sold_price || p.price || 0;
            const commission = agentCommissions.find(ac => ac.property_id === p.id)?.commission_rate || p.commission || 0;
            return sum + (price * (commission / 100));
          }, 0)
      ),
      backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'],
      borderColor: ['#1E3A8A', '#065F46', '#B45309', '#991B1B', '#5B21B6'],
      borderWidth: 1,
      hoverBackgroundColor: ['#2563EB', '#059669', '#D97706', '#DC2626', '#7C3AED'],
    }],
  }), [properties, agentCommissions]);

  // Agent commission chart data (for drill-down)
  const agentChartData = useMemo(() => {
    if (!selectedAgency) return null;
    const agents = [...new Set(
      properties
        .filter(p => normalizeAgencyName(p.agency_name) === selectedAgency)
        .map(p => normalizeAgentName(p.agent_name))
    )];
    return {
      labels: agents,
      datasets: [{
        label: `Commissions for ${selectedAgency}`,
        data: agents.map(agent =>
          properties
            .filter(p => normalizeAgencyName(p.agency_name) === selectedAgency && normalizeAgentName(p.agent_name) === agent)
            .reduce((sum, p) => {
              const price = p.sold_price || p.price || 0;
              const commission = agentCommissions.find(ac => ac.property_id === p.id)?.commission_rate || p.commission || 0;
              return sum + (price * (commission / 100));
            }, 0)
        ),
        backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'],
        borderColor: ['#1E3A8A', '#065F46', '#B45309', '#991B1B', '#5B21B6'],
        borderWidth: 1,
        hoverBackgroundColor: ['#2563EB', '#059669', '#D97706', '#DC2626', '#7C3AED'],
      }],
    };
  }, [properties, agentCommissions, selectedAgency]);

  // Pie chart for commission proportions
  const pieChartData = {
    type: 'pie',
    data: {
      labels: [...new Set(properties.map(p => normalizeAgencyName(p.agency_name)))],
      datasets: [{
        label: 'Commission Share by Agency',
        data: [...new Set(properties.map(p => normalizeAgencyName(p.agency_name)))].map(agency =>
          properties
            .filter(p => normalizeAgencyName(p.agency_name) === agency)
            .reduce((sum, p) => {
              const price = p.sold_price || p.price || 0;
              const commission = agentCommissions.find(ac => ac.property_id === p.id)?.commission_rate || p.commission || 0;
              return sum + (price * (commission / 100));
            }, 0)
        ),
        backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'],
        borderColor: ['#1E3A8A', '#065F46', '#B45309', '#991B1B', '#5B21B6'],
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { font: { size: 12 } } },
        title: {
          display: true,
          text: 'Commission Share by Agency',
          font: { size: 18, weight: 'bold' },
          padding: { top: 10, bottom: 20 },
        },
        tooltip: {
          backgroundColor: '#1f2937',
          titleFont: { size: 14 },
          bodyFont: { size: 12 },
          padding: 10,
        },
      },
    },
  };

  // Trend chart data (monthly commissions over last 12 months)
  const trendChartData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (11 - i));
      return date.toLocaleString('default', { month: 'short', year: 'numeric' });
    });
    const dataByAgency = [...new Set(properties.map(p => normalizeAgencyName(p.agency_name)))].map(agency => ({
      label: agency,
      data: months.map(month => {
        const [monthName, year] = month.split(' ');
        return properties
          .filter(p => {
            const soldDate = p.sold_date ? new Date(p.sold_date) : null;
            return (
              normalizeAgencyName(p.agency_name) === agency &&
              soldDate &&
              soldDate.toLocaleString('default', { month: 'short' }) === monthName &&
              soldDate.getFullYear().toString() === year
            );
          })
          .reduce((sum, p) => {
            const price = p.sold_price || p.price || 0;
            const commission = agentCommissions.find(ac => ac.property_id === p.id)?.commission_rate || p.commission || 0;
            return sum + (price * (commission / 100));
          }, 0);
      }),
      borderColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][
        [...new Set(properties.map(p => normalizeAgencyName(p.agency_name)))].indexOf(agency) % 5
      ],
      fill: false,
    }));
    return {
      type: 'line',
      data: {
        labels: months,
        datasets: dataByAgency,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Commission ($)', font: { size: 14 } },
            grid: { color: '#e5e7eb' },
          },
          x: {
            title: { display: true, text: 'Month', font: { size: 14 } },
            grid: { display: false },
          },
        },
        plugins: {
          legend: { position: 'top' },
          title: {
            display: true,
            text: 'Commission Trends Over Time',
            font: { size: 18, weight: 'bold' },
            padding: { top: 10, bottom: 20 },
          },
          tooltip: {
            backgroundColor: '#1f2937',
            titleFont: { size: 14 },
            bodyFont: { size: 12 },
            padding: 10,
          },
        },
      },
    };
  }, [properties, agentCommissions]);

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
          backgroundColor: ['#3B82F6', '#10B981'],
          borderColor: ['#1E3A8A', '#065F46'],
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Commission ($)', font: { size: 14 } },
            grid: { color: '#e5e7eb' },
          },
        },
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: `Commission Simulation for ${simulator.selectedAgency}`,
            font: { size: 18, weight: 'bold' },
            padding: { top: 10, bottom: 20 },
          },
          tooltip: {
            backgroundColor: '#1f2937',
            titleFont: { size: 14 },
            bodyFont: { size: 12 },
            padding: 10,
          },
        },
      },
    };
  }, [simulator, properties, agentCommissions]);

  // Update single property commission (unchanged)
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

  // Batch update commissions (unchanged)
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

  // Export CSV (unchanged)
  const exportCSV = () => {
    const data = [
      ['Admin Commission Report', 'Generated on: ' + new Date().toLocaleString()],
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

  // Export PDF (unchanged)
  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Admin Commission Report', 20, 10);
    doc.setFontSize(12);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, 20);
    doc.text(`Top Agency: ${topEarners.topAgency.name} (${formatCurrency(topEarners.topAgency.total)})`, 20, 30);
    doc.text(`Top Agent: ${topEarners.topAgent.name} (${formatCurrency(topEarners.topAgent.total)})`, 20, 40);
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
      startY: 50,
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255] },
    });
    doc.save('commission_report.pdf');
    toast.success('Commission report exported as PDF');
  };

  // Filter and paginate properties (unchanged)
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
            <div className="mt-6 flex justify-center space-x-2">
              <motion.button
                onClick={() => setCurrentPage(p => p - 1)}
                disabled={currentPage === 1}
                className={`px-4 py-2 rounded-full flex items-center text-sm shadow-md ${
                  currentPage === 1 ? 'bg-gray-200 text-gray-500' : 'bg-blue-600 text-white'
                }`}
                whileHover={{ scale: currentPage === 1 ? 1 : 1.05 }}
                whileTap={{ scale: currentPage === 1 ? 1 : 0.95 }}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Previous
              </motion.button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <motion.button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-4 py-2 rounded-full text-sm shadow-md ${
                    currentPage === page ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                  }`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {page}
                </motion.button>
              ))}
              <motion.button
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={currentPage === totalPages}
                className={`px-4 py-2 rounded-full flex items-center text-sm shadow-md ${
                  currentPage === totalPages ? 'bg-gray-200 text-gray-500' : 'bg-blue-600 text-white'
                }`}
                whileHover={{ scale: currentPage === totalPages ? 1 : 1.05 }}
                whileTap={{ scale: currentPage === totalPages ? 1 : 0.95 }}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-xl">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Total Commissions by Agency</h3>
              {properties.length > 0 ? (
                <div className="h-80">
                  <Bar
                    data={agencyChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: {
                        y: {
                          beginAtZero: true,
                          title: { display: true, text: 'Total Commission ($)', font: { size: 14 } },
                          grid: { color: '#e5e7eb' },
                        },
                        x: {
                          title: { display: true, text: 'Agency', font: { size: 14 } },
                          grid: { display: false },
                        },
                      },
                      plugins: {
                        legend: { display: false },
                        title: {
                          display: true,
                          text: 'Commission Distribution by Agency',
                          font: { size: 18, weight: 'bold' },
                          padding: { top: 10, bottom: 20 },
                        },
                        tooltip: {
                          backgroundColor: '#1f2937',
                          titleFont: { size: 14 },
                          bodyFont: { size: 12 },
                          padding: 10,
                        },
                      },
                      onClick: (event, elements) => {
                        if (elements.length > 0) {
                          const agency = agencyChartData.labels[elements[0].index];
                          setSelectedAgency(agency);
                        }
                      },
                    }}
                  />
                </div>
              ) : (
                <p className="text-center text-gray-600 text-lg">No data available for chart.</p>
              )}
            </div>
            {selectedAgency && agentChartData && (
              <div className="bg-white p-6 rounded-2xl shadow-xl">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Agent Commissions for {selectedAgency}</h3>
                <div className="h-80">
                  <Bar data={agentChartData} options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Commission ($)', font: { size: 14 } },
                        grid: { color: '#e5e7eb' },
                      },
                      x: {
                        title: { display: true, text: 'Agent', font: { size: 14 } },
                        grid: { display: false },
                      },
                    },
                    plugins: {
                      legend: { display: false },
                      title: {
                        display: true,
                        text: `Agent Commission Breakdown`,
                        font: { size: 18, weight: 'bold' },
                        padding: { top: 10, bottom: 20 },
                      },
                      tooltip: {
                        backgroundColor: '#1f2937',
                        titleFont: { size: 14 },
                        bodyFont: { size: 12 },
                        padding: 10,
                      },
                    },
                  }} />
                </div>
                <motion.button
                  onClick={() => setSelectedAgency(null)}
                  className="mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-full flex items-center mx-auto"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Back to Agency View
                </motion.button>
              </div>
            )}
            <div className="bg-white p-6 rounded-2xl shadow-xl">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Commission Share by Agency</h3>
              {properties.length > 0 ? (
                <div className="h-80">
                  <Pie data={pieChartData.data} options={pieChartData.options} />
                </div>
              ) : (
                <p className="text-center text-gray-600 text-lg">No data available for chart.</p>
              )}
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-xl">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Commission Trends Over Time</h3>
              {properties.length > 0 ? (
                <div className="h-80">
                  <Line data={trendChartData.data} options={trendChartData.options} />
                </div>
              ) : (
                <p className="text-center text-gray-600 text-lg">No data available for chart.</p>
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