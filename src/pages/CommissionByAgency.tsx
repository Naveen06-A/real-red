
import { useState, useCallback, useMemo, useEffect } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  ArcElement,
  ChartOptions,
} from 'chart.js';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { PropertyDetails } from './Reports';
import { formatCurrency } from '../utils/formatters';
import { toast } from 'react-toastify';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { utils, writeFile } from 'xlsx';
import {
  Download,
  BarChart,
  ChevronLeft,
  ChevronRight,
  Home,
  Building2,
  User,
  Star,
  MapPin,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

// Register ChartJS components
ChartJS.register(BarElement, CategoryScale, LinearScale, ArcElement, Tooltip, Legend);

// Interfaces
interface User {
  id: string;
  email?: string;
  agent_name?: string;
  agency_name?: string;
}

interface CommissionSummary {
  totalCommission: number;
  totalProperties: number;
  topAgency: string;
  topAgent: { name: string; commission: number };
  agencyPropertyCounts: Record<string, number>;
  topStreet: { street: string; listedCount: number; commission: number };
}

interface AgencyTotal {
  agency: string;
  totalCommission: number;
  propertyCount: number;
  listedCount: number;
  soldCount: number;
  suburbs: string[];
  agents: AgentTotal[];
}

interface AgentTotal {
  name: string;
  totalCommission: number;
  propertiesListed: number;
  propertiesSold: number;
}

// Helper Functions
const calculateCommission = (property: PropertyDetails): { commissionRate: number; commissionEarned: number } => {
  const commissionRate = property.commission || 0;
  const basePrice = property.sold_price || property.price || 0;
  const commissionEarned = commissionRate > 0 && basePrice > 0 ? basePrice * (commissionRate / 100) : 0;
  return { commissionRate, commissionEarned };
};

const normalizeAgencyName = (agency: string | undefined | null): string => {
  if (!agency) return 'Unknown';
  const trimmed = agency.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

const normalizeAgentName = (agent: string | undefined | null): string => {
  if (!agent) return 'Unknown';
  return agent.trim();
};

const normalizeSuburbName = (suburb: string | undefined | null): string => {
  if (!suburb) return 'Unknown';
  const trimmed = suburb.trim().toLowerCase();
  const suburbMap: Record<string, string> = {
    pullenvale: 'PULLENVALE 4069',
    'pullenvale qld': 'PULLENVALE 4069',
    'pullenvale qld (4069)': 'PULLENVALE 4069',
    brookfield: 'BROOKFIELD 4069',
    'brookfield qld': 'BROOKFIELD 4069',
    'brookfield qld (4069)': 'BROOKFIELD 4069',
    anstead: 'ANSTEAD 4070',
    'anstead qld': 'ANSTEAD 4070',
    'anstead qld (4070)': 'ANSTEAD 4070',
    'chapel hill': 'CHAPEL HILL 4069',
    'chapel hill qld': 'CHAPEL HILL 4069',
    'chapell hill qld (4069)': 'CHAPEL HILL 4069',
    kenmore: 'KENMORE 4069',
    'kenmore qld': 'KENMORE 4069',
    'kenmore qld (4069)': 'KENMORE 4069',
    'kenmore hills': 'KENMORE HILLS 4069',
    'kenmore hills qld': 'KENMORE HILLS 4069',
    'kenmore hills qld (4069)': 'KENMORE HILLS 4069',
    'fig tree pocket': 'FIG TREE POCKET 4069',
    'fig tree pocket qld': 'FIG TREE POCKET 4069',
    'fig tree pocket qld (4069)': 'FIG TREE POCKET 4069',
    'pinjarra hills': 'PINJARRA HILLS 4069',
    'pinjarra hills qld': 'PINJARRA HILLS 4069',
    'pinjarra hills qld (4069)': 'PINJARRA HILLS 4069',
    moggill: 'MOGGILL 4070',
    'moggill qld': 'MOGGILL 4070',
    'moggill qld (4070)': 'MOGGILL 4070',
    bellbowrie: 'BELLBOWRIE 4070',
    'bellbowrie qld': 'BELLBOWRIE 4070',
    'bellbowrie qld (4070)': 'BELLBOWRIE 4070',
  };
  return suburbMap[trimmed] || 'Unknown';
};

// Collapsible Section Component
const CollapsibleSection: React.FC<{
  title: string;
  children: React.ReactNode;
  isOpen: boolean;
  toggleOpen: () => void;
}> = ({ title, children, isOpen, toggleOpen }) => (
  <motion.div
    className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
  >
    <button
      onClick={toggleOpen}
      className="w-full flex justify-between items-center p-4 text-lg font-semibold text-gray-800 hover:bg-indigo-50 transition-colors"
    >
      {title}
      {isOpen ? <ChevronUp className="w-5 h-5 text-indigo-600" /> : <ChevronDown className="w-5 h-5 text-indigo-600" />}
    </button>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="p-4"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  </motion.div>
);

// Progress Bar Component
const ProgressBar: React.FC<{ value: number; label: string; maxValue: number }> = ({ value, label, maxValue }) => {
  const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm text-gray-600">
        <span>{label}</span>
        <span>{formatCurrency(value)}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <motion.div
          className="bg-indigo-600 h-2.5 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
};

export default function CommissionByAgency() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'listed' | 'sold'>('all');
  const [dateRange, setDateRange] = useState<'all' | 'last30' | 'last90'>('all');
  const [selectedAgency, setSelectedAgency] = useState<string | null>(null);
  const [internalCommissionData, setInternalCommissionData] = useState<Record<string, Record<string, number>> | null>(null);
  const [internalAgentData, setInternalAgentData] = useState<Record<string, { commission: number; listed: number; sold: number }>>({});
  const [internalProperties, setInternalProperties] = useState<PropertyDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [openSections, setOpenSections] = useState({
    summary: true,
    ourPerformance: true,
    agencies: true,
    agents: true,
    streets: true,
  });
  const itemsPerPage = 10;
  const ourAgencyName = 'Harcourts Success';
  const { user } = useAuthStore((state: { user: User | null }) => ({ user: state.user }));
  const ourAgentName = user?.agent_name || 'Unknown';

  useEffect(() => {
    const fetchCommissionData = async () => {
      setIsLoading(true);
      setFetchError(null);
      try {
        const { data: propertiesData, error: propertiesError } = await supabase
          .from('properties')
          .select('id, agency_name, property_type, commission, price, sold_price, suburb, street_name, street_number, agent_name, postcode, category, listed_date, sale_type, expected_price, features, flood_risk, bushfire_risk, contract_status, same_street_sales, past_records, sold_date');

        if (propertiesError) throw propertiesError;

        const fetchedProperties = (propertiesData as PropertyDetails[]) || [];
        setInternalProperties(fetchedProperties);

        const newCommissionMap: Record<string, Record<string, number>> = {};
        const newAgentMap: Record<string, { commission: number; listed: number; sold: number }> = {};

        fetchedProperties.forEach((property) => {
          const agency = normalizeAgencyName(property.agency_name);
          const agent = normalizeAgentName(property.agent_name);
          const propertyType = property.property_type || 'Unknown';
          const { commissionEarned } = calculateCommission(property);
          const isSold = property.contract_status === 'sold' || !!property.sold_date;

          if (agency && commissionEarned > 0) {
            newCommissionMap[agency] = newCommissionMap[agency] || {};
            newCommissionMap[agency][propertyType] = (newCommissionMap[agency][propertyType] || 0) + commissionEarned;
          }

          if (agent) {
            newAgentMap[agent] = newAgentMap[agent] || { commission: 0, listed: 0, sold: 0 };
            newAgentMap[agent].listed += 1;
            newAgentMap[agent].sold += isSold ? 1 : 0;
            newAgentMap[agent].commission += commissionEarned;
          }
        });

        setInternalCommissionData(newCommissionMap);
        setInternalAgentData(newAgentMap);
      } catch (error: any) {
        console.error('Error fetching commission data:', error);
        setFetchError(error.message || 'Failed to fetch commission data.');
        toast.error(error.message || 'Failed to fetch commission data.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchCommissionData();
  }, []);

  const calculateSummary = useCallback((): CommissionSummary => {
    let totalCommission = 0;
    let totalProperties = 0;
    let topAgency = 'Unknown';
    let maxCommission = 0;
    const agencyPropertyCounts: Record<string, number> = {};
    let topAgent = { name: 'Unknown', commission: 0 };
    const streetMap: Record<string, { listedCount: number; commission: number }> = {};

    if (!internalCommissionData || !internalProperties) {
      return { totalCommission, totalProperties, topAgency, topAgent, agencyPropertyCounts, topStreet: { street: 'None', listedCount: 0, commission: 0 } };
    }

    Object.keys(internalCommissionData).forEach((agency) => {
      agencyPropertyCounts[agency] = 0;
    });

    internalProperties.forEach((property) => {
      const agency = normalizeAgencyName(property.agency_name);
      const agent = normalizeAgentName(property.agent_name);
      const { commissionEarned } = calculateCommission(property);
      const street = `${property.street_name}, ${normalizeSuburbName(property.suburb)}`;

      if (agency && internalCommissionData.hasOwnProperty(agency)) {
        agencyPropertyCounts[agency] += 1;
        totalProperties += 1;
        if (commissionEarned > 0) {
          totalCommission += commissionEarned;
          if (internalAgentData[agent]?.commission > topAgent.commission) {
            topAgent = { name: agent, commission: internalAgentData[agent].commission };
          }
        }
      }

      streetMap[street] = streetMap[street] || { listedCount: 0, commission: 0 };
      streetMap[street].listedCount += 1;
      streetMap[street].commission += commissionEarned;
    });

    Object.entries(internalCommissionData).forEach(([agency, types]) => {
      const agencyTotal = Object.values(types).reduce((sum, val) => sum + val, 0);
      if (agencyTotal > maxCommission) {
        maxCommission = agencyTotal;
        topAgency = agency;
      }
    });

    const topStreet = Object.entries(streetMap).reduce(
      (max, [street, data]) => (data.listedCount > max.listedCount || (data.listedCount === max.listedCount && data.commission > max.commission) ? { street, ...data } : max),
      { street: 'None', listedCount: 0, commission: 0 }
    );

    return { totalCommission, totalProperties, topAgency, topAgent, agencyPropertyCounts, topStreet };
  }, [internalCommissionData, internalProperties, internalAgentData]);

  const summary = calculateSummary();

  const agencyTotals = useMemo<AgencyTotal[]>(() => {
    if (!internalCommissionData) return [];
    const agencySuburbsMap: Record<string, Set<string>> = {};
    const agencyAgentsMap: Record<string, AgentTotal[]> = {};

    internalProperties.forEach((property) => {
      const agency = normalizeAgencyName(property.agency_name);
      const agent = normalizeAgentName(property.agent_name);
      const suburb = normalizeSuburbName(property.suburb);
      const isSold = property.contract_status === 'sold' || !!property.sold_date;

      if (agency && suburb !== 'Unknown') {
        agencySuburbsMap[agency] = agencySuburbsMap[agency] || new Set();
        agencySuburbsMap[agency].add(suburb);
      }
      if (agency && agent) {
        agencyAgentsMap[agency] = agencyAgentsMap[agency] || [];
        const agentData = internalAgentData[agent] || { commission: 0, listed: 0, sold: 0 };
        if (!agencyAgentsMap[agency].some((a) => a.name === agent)) {
          agencyAgentsMap[agency].push({
            name: agent,
            totalCommission: agentData.commission,
            propertiesListed: agentData.listed,
            propertiesSold: agentData.sold,
          });
        }
      }
    });

    return Object.entries(internalCommissionData)
      .map(([agency, types]) => {
        const properties = internalProperties.filter((p) => normalizeAgencyName(p.agency_name) === agency);
        return {
          agency,
          totalCommission: Object.values(types).reduce((sum, val) => sum + val, 0),
          propertyCount: summary.agencyPropertyCounts[agency] || 0,
          listedCount: properties.length,
          soldCount: properties.filter((p) => p.contract_status === 'sold' || !!p.sold_date).length,
          suburbs: Array.from(agencySuburbsMap[agency] || []),
          agents: agencyAgentsMap[agency] || [],
        };
      })
      .sort((a, b) => b.totalCommission - a.totalCommission);
  }, [internalCommissionData, internalProperties, summary.agencyPropertyCounts, internalAgentData]);

  const ourAgency = useMemo(() => agencyTotals.find((a) => a.agency === ourAgencyName), [agencyTotals, ourAgencyName]);
  const ourAgent = useMemo(() => {
    if (!ourAgency) return null;
    return ourAgency.agents.find((a) => a.name === ourAgentName) || null;
  }, [ourAgency, ourAgentName]);

  const topFiveAgencies = useMemo(() => agencyTotals.slice(0, 5).map((row) => row.agency), [agencyTotals]);
  const topFiveAgents = useMemo(
    () =>
      Object.entries(internalAgentData)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.commission - a.commission)
        .slice(0, 5),
    [internalAgentData]
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Chart Data
  const propertyTypes = useMemo(
    () =>
      Array.from(
        new Set(topFiveAgencies.flatMap((agency) => (internalCommissionData ? Object.keys(internalCommissionData[agency]) : [])))
      ),
    [topFiveAgencies, internalCommissionData]
  );

  const agencyChartData = useMemo(
    () => ({
      labels: topFiveAgencies,
      datasets: propertyTypes.map((type, index) => ({
        label: type,
        data: topFiveAgencies.map((agency) => internalCommissionData?.[agency]?.[type] || 0),
        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'][index % 5],
        stack: 'Stack 0',
      })),
    }),
    [topFiveAgencies, propertyTypes, internalCommissionData]
  );

  const agencyChartOptions: ChartOptions<'bar'> = {
    plugins: {
      legend: { position: 'top', labels: { font: { size: 14, family: 'Inter' } } },
      title: { display: true, text: 'Top 5 Agencies by Commission', font: { size: 18, weight: 'bold', family: 'Inter' } },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = context.parsed.y;
            const agency = context.label;
            const type = context.dataset.label;
            return `${type} in ${agency}: ${formatCurrency(value)}`;
          },
          footer: (tooltipItems) => {
            const agency = tooltipItems[0].label;
            const total = agencyChartData.datasets.reduce(
              (sum, dataset) => sum + (dataset.data[tooltipItems[0].dataIndex] || 0),
              0
            );
            return `Total: ${formatCurrency(total)}\nProperties: ${summary.agencyPropertyCounts[agency] || 0}`;
          },
        },
      },
    },
    scales: {
      x: { stacked: true, ticks: { font: { size: 12, family: 'Inter' } } },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: {
          callback: (value) => formatCurrency(value as number),
          font: { size: 12, family: 'Inter' },
        },
        title: { display: true, text: 'Commission (AUD)', font: { size: 14, family: 'Inter' } },
      },
    },
  };

  const agentChartData = useMemo(
    () => ({
      labels: topFiveAgents.map((agent) => agent.name),
      datasets: [
        {
          label: 'Agent Commission',
          data: topFiveAgents.map((agent) => agent.commission),
          backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'],
        },
      ],
    }),
    [topFiveAgents]
  );

  const agentChartOptions: ChartOptions<'doughnut'> = {
    plugins: {
      legend: { position: 'top', labels: { font: { size: 14, family: 'Inter' } } },
      title: { display: true, text: 'Top 5 Agents by Commission', font: { size: 18, weight: 'bold', family: 'Inter' } },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = context.parsed;
            const agent = context.label;
            const agentData = topFiveAgents.find((a) => a.name === agent);
            return `${agent}: ${formatCurrency(value)}\nListed: ${agentData?.listed || 0}, Sold: ${agentData?.sold || 0}`;
          },
        },
      },
    },
  };

  // Export Functions
  interface JsPDFWithAutoTable extends jsPDF {
    autoTable: (content: { head: string[][]; body: string[][] }, options?: any) => void;
    lastAutoTable: { finalY: number };
  }

  const exportCommissionPDF = () => {
    const doc = new jsPDF() as JsPDFWithAutoTable;
    doc.setFont('Inter', 'normal');
    doc.setFontSize(20);
    doc.setTextColor(79, 70, 229); // Indigo-600
    doc.text('Commission Performance Report', 20, 20);
    doc.setFontSize(12);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, 30);
    doc.setFontSize(10);
    doc.text('Harcourts Success - Powered by xAI', 20, 38);

    // Summary
    doc.autoTable({
      head: [['Metric', 'Value']],
      body: [
        ['Total Commission', formatCurrency(summary.totalCommission)],
        ['Total Properties', summary.totalProperties.toString()],
        ['Top Agency', summary.topAgency],
        ['Top Agent', `${summary.topAgent.name} (${formatCurrency(summary.topAgent.commission)})`],
        ['Most Active Street', `${summary.topStreet.street} (${summary.topStreet.listedCount} listed, ${formatCurrency(summary.topStreet.commission)})`],
        ['Our Agency', `${ourAgencyName} (${formatCurrency(ourAgency?.totalCommission || 0)}, ${ourAgency?.propertyCount || 0} properties)`],
        ['Our Agent', ourAgent ? `${ourAgentName} (${formatCurrency(ourAgent.totalCommission)})` : 'N/A'],
      ]
    }, {
      startY: 50,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], font: 'Inter' },
      bodyStyles: { fontSize: 10, font: 'Inter' },
    });

    // Agency Totals
    doc.autoTable({
      head: [['Agency', 'Total Commission', 'Listed', 'Sold', 'Suburbs']],
      body: agencyTotals.map((row) => [
        row.agency,
        formatCurrency(row.totalCommission),
        row.listedCount.toString(),
        row.soldCount.toString(),
        row.suburbs.join(', ') || 'None',
      ])
    }, {
      startY: doc.lastAutoTable.finalY + 20,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], font: 'Inter' },
      bodyStyles: { fontSize: 10, font: 'Inter' },
    });

    // Agent Totals
    doc.autoTable({
      head: [['Agent', 'Total Commission', 'Properties Listed', 'Properties Sold', 'Our Agent']],
      body: Object.entries(internalAgentData).map(([name, data]) => [
        name,
        formatCurrency(data.commission),
        data.listed.toString(),
        data.sold.toString(),
        name === ourAgentName && agencyTotals.some((a) => a.agency === ourAgencyName && a.agents.some((ag) => ag.name === name)) ? 'Yes' : 'No',
      ])
    }, {
      startY: doc.lastAutoTable.finalY + 20,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], font: 'Inter' },
      bodyStyles: { fontSize: 10, font: 'Inter' },
    });

    doc.save('commission_report.pdf');
    toast.success('Commission report exported as PDF');
  };

  const exportCommissionCSV = () => {
    const data = [
      ['Commission Performance Report'],
      [`Generated on: ${new Date().toLocaleString()}`],
      ['Harcourts Success - Powered by xAI'],
      [],
      ['Summary'],
      ['Metric', 'Value'],
      ['Total Commission', formatCurrency(summary.totalCommission)],
      ['Total Properties', summary.totalProperties.toString()],
      ['Top Agency', summary.topAgency],
      ['Top Agent', `${summary.topAgent.name} (${formatCurrency(summary.topAgent.commission)})`],
      ['Most Active Street', `${summary.topStreet.street} (${summary.topStreet.listedCount} listed, ${formatCurrency(summary.topStreet.commission)})`],
      ['Our Agency', `${ourAgencyName} (${formatCurrency(ourAgency?.totalCommission || 0)}, ${ourAgency?.propertyCount || 0} properties)`],
      ['Our Agent', ourAgent ? `${ourAgentName} (${formatCurrency(ourAgent.totalCommission)})` : 'N/A'],
      [],
      ['Agency Totals'],
      ['Agency', 'Total Commission', 'Listed', 'Sold', 'Suburbs'],
      ...agencyTotals.map((row) => [
        row.agency,
        formatCurrency(row.totalCommission),
        row.listedCount.toString(),
        row.soldCount.toString(),
        row.suburbs.join(', ') || 'None',
      ]),
      [],
      ['Agent Totals'],
      ['Agent', 'Total Commission', 'Properties Listed', 'Properties Sold', 'Our Agent'],
      ...Object.entries(internalAgentData).map(([name, data]) => [
        name,
        formatCurrency(data.commission),
        data.listed.toString(),
        data.sold.toString(),
        name === ourAgentName && agencyTotals.some((a) => a.agency === ourAgencyName && a.agents.some((ag) => ag.name === name)) ? 'Yes' : 'No',
      ]),
    ];

    const ws = utils.aoa_to_sheet(data);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Commission Report');
    writeFile(wb, 'commission_report.csv');
    toast.success('Commission report exported as CSV');
  };

  // Filter and Search Logic
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
    setSelectedAgency(null);
  };

  const handleStatusFilter = (status: 'all' | 'listed' | 'sold') => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  const handleDateRange = (range: 'all' | 'last30' | 'last90') => {
    setDateRange(range);
    setCurrentPage(1);
  };

  const filteredAgencyTotals = useMemo(() => {
    let filtered = agencyTotals;
    if (searchQuery) {
      filtered = filtered.filter((row) => row.agency.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter((row) => {
        const properties = internalProperties.filter((p) => normalizeAgencyName(p.agency_name) === row.agency);
        return properties.some((p) => (statusFilter === 'sold' ? p.contract_status === 'sold' || !!p.sold_date : true));
      });
    }
    if (dateRange !== 'all') {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - (dateRange === 'last30' ? 30 : 90));
      filtered = filtered.filter((row) => {
        const properties = internalProperties.filter((p) => normalizeAgencyName(p.agency_name) === row.agency);
        return properties.some((p) => (p.listed_date ? new Date(p.listed_date) >= cutoffDate : false));
      });
    }
    return filtered;
  }, [agencyTotals, searchQuery, statusFilter, dateRange, internalProperties]);

  const paginatedFilteredAgencyTotals = filteredAgencyTotals.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const filteredTotalPages = Math.ceil(filteredAgencyTotals.length / itemsPerPage);

  const filteredAgentData = useMemo(() => {
    let filtered = Object.entries(internalAgentData).map(([name, data]) => ({ name, ...data }));
    if (selectedAgency) {
      filtered = filtered.filter((agent) => {
        const properties = internalProperties.filter((p) => normalizeAgentName(p.agent_name) === agent.name);
        return properties.some((p) => normalizeAgencyName(p.agency_name) === selectedAgency);
      });
    }
    return filtered;
  }, [internalAgentData, selectedAgency, internalProperties]);

  // Loading State
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="h-32 bg-gray-200 rounded-xl animate-pulse" />
          <div className="h-20 bg-gray-200 rounded-xl animate-pulse" />
          <div className="h-64 bg-gray-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  // Error State
  if (fetchError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-10 bg-white rounded-xl shadow-lg">
          <p className="text-red-600 text-lg font-semibold">Error: {fetchError}</p>
          <button
            onClick={() => {
              setIsLoading(true);
              setFetchError(null);
              // Trigger refetch
              const fetchCommissionData = async () => {
                try {
                  const { data, error } = await supabase.from('properties').select('*');
                  if (error) throw error;
                  setInternalProperties(data as PropertyDetails[]);
                } catch (error: any) {
                  setFetchError(error.message);
                } finally {
                  setIsLoading(false);
                }
              };
              fetchCommissionData();
            }}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // No Data State
  if (!internalCommissionData || agencyTotals.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-10 bg-white rounded-xl shadow-lg">
          <p className="text-gray-600 text-lg">No commission data available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-gray-800">Commission Dashboard</h1>

        {/* Filters */}
        <motion.div
          className="bg-white p-4 rounded-xl shadow-lg flex flex-col sm:flex-row gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="relative w-full sm:w-64 group">
            <input
              type="text"
              placeholder="Search agencies..."
              value={searchQuery}
              onChange={handleSearch}
              className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full bg-gray-50"
            />
            <svg
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <div className="absolute hidden group-hover:block bg-gray-800 text-white text-xs rounded p-2 mt-2">Search by agency name</div>
          </div>
          <div className="flex gap-2">
            {['all', 'listed', 'sold'].map((status) => (
              <button
                key={status}
                onClick={() => handleStatusFilter(status as 'all' | 'listed' | 'sold')}
                className={`px-4 py-2 rounded-full text-sm capitalize ${
                  statusFilter === status ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {[
              { value: 'all', label: 'All Time' },
              { value: 'last30', label: 'Last 30 Days' },
              { value: 'last90', label: 'Last 90 Days' },
            ].map((range) => (
              <button
                key={range.value}
                onClick={() => handleDateRange(range.value as 'all' | 'last30' | 'last90')}
                className={`px-4 py-2 rounded-full text-sm ${
                  dateRange === range.value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Summary Section */}
        <CollapsibleSection
          title="Performance Summary"
          isOpen={openSections.summary}
          toggleOpen={() => setOpenSections({ ...openSections, summary: !openSections.summary })}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-indigo-50 rounded-lg">
              <p className="text-sm text-gray-600">Total Commission</p>
              <p className="text-2xl font-semibold text-indigo-600">{formatCurrency(summary.totalCommission)}</p>
            </div>
            <div className="p-4 bg-indigo-50 rounded-lg">
              <p className="text-sm text-gray-600">Total Properties</p>
              <p className="text-2xl font-semibold text-indigo-600">{summary.totalProperties}</p>
            </div>
            <div className="p-4 bg-indigo-50 rounded-lg">
              <p className="text-sm text-gray-600">Top Agency</p>
              <p className="text-lg font-semibold text-indigo-600 flex items-center">
                {summary.topAgency}
                {summary.topAgency === ourAgencyName && <Star className="w-4 h-4 ml-2 text-yellow-400" />}
              </p>
            </div>
            <div className="p-4 bg-indigo-50 rounded-lg">
              <p className="text-sm text-gray-600">Top Agent</p>
              <p className="text-lg font-semibold text-indigo-600 flex items-center">
                {summary.topAgent.name} ({formatCurrency(summary.topAgent.commission)})
                {summary.topAgent.name === ourAgentName && <Star className="w-4 h-4 ml-2 text-yellow-400" />}
              </p>
            </div>
          </div>
        </CollapsibleSection>

        {/* Our Performance Section */}
        <CollapsibleSection
          title="Our Performance (Harcourts Success)"
          isOpen={openSections.ourPerformance}
          toggleOpen={() => setOpenSections({ ...openSections, ourPerformance: !openSections.ourPerformance })}
        >
          {ourAgency ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-indigo-50 rounded-lg">
                  <p className="text-sm text-gray-600">Total Commission</p>
                  <p className="text-2xl font-semibold text-indigo-600">{formatCurrency(ourAgency.totalCommission)}</p>
                </div>
                <div className="p-4 bg-indigo-50 rounded-lg">
                  <p className="text-sm text-gray-600">Properties Listed</p>
                  <p className="text-2xl font-semibold text-indigo-600">{ourAgency.listedCount}</p>
                </div>
                <div className="p-4 bg-indigo-50 rounded-lg">
                  <p className="text-sm text-gray-600">Properties Sold</p>
                  <p className="text-2xl font-semibold text-indigo-600">{ourAgency.soldCount}</p>
                </div>
              </div>
              {ourAgent && (
                <div className="p-4 bg-yellow-50 rounded-lg">
                  <p className="text-sm text-gray-600">Our Agent: {ourAgentName}</p>
                  <p className="text-lg font-semibold text-indigo-600">
                    Commission: {formatCurrency(ourAgent.totalCommission)}, Listed: {ourAgent.propertiesListed}, Sold: {ourAgent.propertiesSold}
                  </p>
                </div>
              )}
              <ProgressBar
                value={ourAgency.totalCommission}
                label="Commission vs. Top Agency"
                maxValue={Math.max(...agencyTotals.map((a) => a.totalCommission))}
              />
              <ProgressBar
                value={ourAgency.soldCount}
                label="Sales vs. Top Agency"
                maxValue={Math.max(...agencyTotals.map((a) => a.soldCount))}
              />
            </div>
          ) : (
            <p className="text-gray-600">No data available for Harcourts Success.</p>
          )}
        </CollapsibleSection>

        {/* Agency Comparison Section */}
        <CollapsibleSection
          title="Agency Comparison"
          isOpen={openSections.agencies}
          toggleOpen={() => setOpenSections({ ...openSections, agencies: !openSections.agencies })}
        >
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agency</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Commission</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Listed</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sold</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Suburbs</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <AnimatePresence>
                {paginatedFilteredAgencyTotals.map((row, index) => (
                  <motion.tr
                    key={row.agency}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2, delay: index * 0.05 }}
                    className={`hover:bg-indigo-50 transition-colors cursor-pointer ${row.agency === ourAgencyName ? 'bg-indigo-100' : ''}`}
                    onClick={() => setSelectedAgency(row.agency)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 flex items-center">
                      {row.agency}
                      {row.agency === ourAgencyName && <Star className="w-4 h-4 ml-2 text-yellow-400" />}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(row.totalCommission)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.listedCount}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.soldCount}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{row.suburbs.join(', ') || 'None'}</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          {filteredTotalPages > 1 && (
            <div className="mt-4 flex justify-center items-center space-x-2">
              <motion.button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={`px-3 py-1 rounded-full flex items-center text-sm ${
                  currentPage === 1 ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
                whileHover={{ scale: currentPage === 1 ? 1 : 1.05 }}
                whileTap={{ scale: currentPage === 1 ? 1 : 0.95 }}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </motion.button>
              {Array.from({ length: filteredTotalPages }, (_, i) => i + 1).map((page) => (
                <motion.button
                  key={page}
                  onClick={() => handlePageChange(page)}
                  className={`px-3 py-1 rounded-full text-sm ${
                    currentPage === page ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {page}
                </motion.button>
              ))}
              <motion.button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === filteredTotalPages}
                className={`px-3 py-1 rounded-full flex items-center text-sm ${
                  currentPage === filteredTotalPages
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
                whileHover={{ scale: currentPage === filteredTotalPages ? 1 : 1.05 }}
                whileTap={{ scale: currentPage === filteredTotalPages ? 1 : 0.95 }}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </motion.button>
            </div>
          )}
          <div className="mt-6">
            <Bar data={agencyChartData} options={agencyChartOptions} />
          </div>
        </CollapsibleSection>

        {/* Agent Details Section */}
        {selectedAgency && (
          <CollapsibleSection
            title={`Agents for ${selectedAgency}`}
            isOpen={openSections.agents}
            toggleOpen={() => setOpenSections({ ...openSections, agents: !openSections.agents })}
          >
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setSelectedAgency(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 text-sm"
              >
                Back to Agencies
              </button>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Commission</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Properties Listed</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Properties Sold</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <AnimatePresence>
                  {filteredAgentData.map((agent, index) => (
                    <motion.tr
                      key={agent.name}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2, delay: index * 0.05 }}
                      className={`hover:bg-indigo-50 transition-colors ${agent.name === ourAgentName && selectedAgency === ourAgencyName ? 'bg-indigo-100' : ''}`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 flex items-center">
                        {agent.name}
                        {agent.name === ourAgentName && selectedAgency === ourAgencyName && <Star className="w-4 h-4 ml-2 text-yellow-400" />}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(agent.commission)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{agent.listed}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{agent.sold}</td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
            <div className="mt-6">
              <Doughnut data={agentChartData} options={agentChartOptions} />
            </div>
          </CollapsibleSection>
        )}

        {/* Street Insights Section */}
        <CollapsibleSection
          title="Street Insights"
          isOpen={openSections.streets}
          toggleOpen={() => setOpenSections({ ...openSections, streets: !openSections.streets })}
        >
          <div className="space-y-4">
            <div className="p-4 bg-indigo-50 rounded-lg">
              <p className="text-sm text-gray-600">Most Active Street</p>
              <p className="text-lg font-semibold text-indigo-600 flex items-center">
                <MapPin className="w-5 h-5 mr-2" />
                {summary.topStreet.street}
              </p>
              <p className="text-sm text-gray-600">
                Listed: {summary.topStreet.listedCount}, Commission: {formatCurrency(summary.topStreet.commission)}
              </p>
            </div>
            <div className="p-4 bg-gray-100 rounded-lg">
              <p className="text-sm text-gray-600">Street Heatmap (Placeholder)</p>
              <p className="text-gray-500 text-sm">Interactive map coming soon to visualize street-level activity.</p>
            </div>
          </div>
        </CollapsibleSection>

        {/* Export Buttons */}
        <div className="flex justify-end space-x-4">
          <motion.button
            onClick={exportCommissionPDF}
            className="flex items-center px-5 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-full hover:from-indigo-700 hover:to-indigo-800 transition-all"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Download className="w-4 h-4 mr-2" />
            PDF
          </motion.button>
          <motion.button
            onClick={exportCommissionCSV}
            className="flex items-center px-5 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-full hover:from-green-700 hover:to-green-800 transition-all"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Download className="w-4 h-4 mr-2" />
            CSV
          </motion.button>
        </div>
      </div>
    </div>
  );
}

export { CommissionByAgency };