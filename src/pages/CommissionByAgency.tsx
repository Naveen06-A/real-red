import { useState, useCallback, useMemo, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { PropertyDetails } from './Reports';
import { formatCurrency } from '../utils/formatters';
import { toast } from 'react-toastify';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Download, BarChart, ChevronLeft, ChevronRight, Home, Building2, User } from 'lucide-react';

// Register ChartJS components
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

interface CommissionSummary {
  totalCommission: number;
  totalProperties: number;
  topAgency: string;
  topAgent: { name: string; commission: number };
  agencyPropertyCounts: Record<string, number>;
}

interface AgencyTotal {
  agency: string;
  totalCommission: number;
  propertyCount: number;
  suburbs: string[];
}

// Helper function to calculate commission
const calculateCommission = (property: PropertyDetails): { commissionRate: number; commissionEarned: number } => {
  const commissionRate = property.commission || 0;
  const basePrice = property.sold_price || property.price || 0;
  const commissionEarned = commissionRate > 0 && basePrice > 0 ? basePrice * (commissionRate / 100) : 0;
  return { commissionRate, commissionEarned };
};

// Helper function to normalize and capitalize agency name
const normalizeAgencyName = (agency: string | undefined | null): string => {
  if (!agency) return '';
  const trimmed = agency.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

// Helper function to normalize agent name
const normalizeAgentName = (agent: string | undefined | null): string => {
  if (!agent) return 'Unknown';
  return agent.trim();
};

// Helper function to normalize suburb name
const normalizeSuburbName = (suburb: string | undefined | null): string => {
  if (!suburb) return 'Unknown';
  const trimmed = suburb.trim().toLowerCase();
  const suburbMap: Record<string, string> = {
    'pullenvale': 'PULLENVALE 4069',
    'pullenvale qld': 'PULLENVALE 4069',
    'pullenvale qld (4069)': 'PULLENVALE 4069',
    'brookfield': 'BROOKFIELD 4069',
    'brookfield qld': 'BROOKFIELD 4069',
    'brookfield qld (4069)': 'BROOKFIELD 4069',
    'anstead': 'ANSTEAD 4070',
    'anstead qld': 'ANSTEAD 4070',
    'anstead qld (4070)': 'ANSTEAD 4070',
    'chapel hill': 'CHAPEL HILL 4069',
    'chapel hill qld': 'CHAPEL HILL 4069',
    'chapell hill qld (4069)': 'CHAPEL HILL 4069',
    'kenmore': 'KENMORE 4069',
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
    'moggill': 'MOGGILL QLD (4070)',
    'moggill qld': 'MOGGILL QLD (4070)',
    'moggill qld (4070)': 'MOGGILL QLD (4070)',
    'bellbowrie': 'BELLBOWRIE QLD (4070)',
    'bellbowrie qld': 'BELLBOWRIE QLD (4070)',
    'bellbowrie qld (4070)': 'BELLBOWRIE QLD (4070)',
  };
  return suburbMap[trimmed] || 'Unknown';
};

export default function CommissionByAgency() {
  const [searchQuery, setSearchQuery] = useState('');
  const [internalCommissionData, setInternalCommissionData] = useState<Record<string, Record<string, number>> | null>(null);
  const [internalProperties, setInternalProperties] = useState<PropertyDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const fetchCommissionData = async () => {
      setIsLoading(true);
      setFetchError(null);
      try {
        const { data: propertiesData, error: propertiesError } = await supabase
          .from('properties')
          .select('id, agency_name, property_type, commission, price, sold_price, suburb, street_name, street_number, agent_name, postcode, category, listed_date, sale_type, expected_price, features, flood_risk, bushfire_risk, contract_status, same_street_sales, past_records');

        if (propertiesError) {
          throw propertiesError;
        }

        const fetchedProperties = propertiesData as PropertyDetails[] || [];
        setInternalProperties(fetchedProperties);

        const newCommissionMap: Record<string, Record<string, number>> = {};
        fetchedProperties.forEach((property) => {
          const agency = normalizeAgencyName(property.agency_name);
          const propertyType = property.property_type || 'Unknown';
          const { commissionEarned } = calculateCommission(property);

          if (agency && commissionEarned > 0) {
            newCommissionMap[agency] = newCommissionMap[agency] || {};
            newCommissionMap[agency][propertyType] = (newCommissionMap[agency][propertyType] || 0) + commissionEarned;
          }
        });
        setInternalCommissionData(newCommissionMap);
      } catch (error: any) {
        console.error("Error fetching commission data:", error);
        setFetchError(error.message || 'Failed to fetch commission data.');
        toast.error(error.message || 'Failed to fetch commission data.');
      }
      setIsLoading(false);
    };
    fetchCommissionData();
  }, []);

  const calculateSummary = useCallback((): CommissionSummary => {
    let totalCommission = 0;
    let totalProperties = 0;
    let topAgency = '';
    let maxCommission = 0;
    const agencyPropertyCounts: Record<string, number> = {};
    const agentCommissions: Record<string, number> = {};
    let topAgent = { name: 'Unknown', commission: 0 };

    if (!internalCommissionData || !internalProperties) {
      return { totalCommission, totalProperties, topAgency, topAgent, agencyPropertyCounts };
    }

    Object.keys(internalCommissionData).forEach((agency) => {
      agencyPropertyCounts[agency] = 0;
    });

    internalProperties.forEach((property, index) => {
      const rawAgency = property.agency_name;
      const agency = normalizeAgencyName(rawAgency);
      const agent = normalizeAgentName(property.agent_name);
      const { commissionEarned } = calculateCommission(property);

      if (agency && internalCommissionData.hasOwnProperty(agency)) {
        agencyPropertyCounts[agency] = (agencyPropertyCounts[agency] || 0) + 1;
        totalProperties += 1;
        if (commissionEarned > 0) {
          totalCommission += commissionEarned;
          agentCommissions[agent] = (agentCommissions[agent] || 0) + commissionEarned;
          if (agentCommissions[agent] > topAgent.commission) {
            topAgent = { name: agent, commission: agentCommissions[agent] };
          }
        }
      } else {
        console.warn(`Property ${index} skipped:`, {
          id: property.id,
          agency,
          commissionEarned,
          reason: !agency ? 'Missing agency' : `Agency "${agency}" not in commission data`,
        });
      }
    });

    Object.entries(internalCommissionData).forEach(([agency, types]) => {
      const agencyTotal = Object.values(types).reduce((sum, val) => sum + val, 0);
      if (agencyTotal > maxCommission) {
        maxCommission = agencyTotal;
        topAgency = agency;
      }
    });

    return { totalCommission, totalProperties, topAgency, topAgent, agencyPropertyCounts };
  }, [internalCommissionData, internalProperties]);

  const summary = calculateSummary();

  // Calculate agency totals with property counts and suburbs
  const agencyTotals = useMemo<AgencyTotal[]>(() => {
    if (!internalCommissionData) return [];
    const agencySuburbsMap: Record<string, Set<string>> = {};

    internalProperties.forEach((property) => {
      const agency = normalizeAgencyName(property.agency_name);
      const suburb = normalizeSuburbName(property.suburb);
      if (agency && suburb !== 'Unknown') {
        agencySuburbsMap[agency] = agencySuburbsMap[agency] || new Set();
        agencySuburbsMap[agency].add(suburb);
      }
    });

    return Object.entries(internalCommissionData)
      .map(([agency, types]) => ({
        agency,
        totalCommission: Object.values(types).reduce((sum, val) => sum + val, 0),
        propertyCount: summary.agencyPropertyCounts[agency] || 0,
        suburbs: Array.from(agencySuburbsMap[agency] || []),
      }))
      .sort((a, b) => b.totalCommission - a.totalCommission);
  }, [internalCommissionData, internalProperties, summary.agencyPropertyCounts]);

  // Get top 5 agencies for chart
  const topFiveAgencies = useMemo(() => {
    return agencyTotals.slice(0, 5).map(row => row.agency);
  }, [agencyTotals]);

  // Pagination logic for table
  const totalPages = Math.ceil(agencyTotals.length / itemsPerPage);
  const paginatedAgencyTotals = agencyTotals.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    console.log(`Changed to page ${page}`);
  };

  // Prepare chart data (top 5 agencies only)
  const propertyTypes = Array.from(
    new Set(topFiveAgencies.flatMap((agency) => internalCommissionData ? Object.keys(internalCommissionData[agency]) : []))
  );

  const chartData = {
    labels: topFiveAgencies,
    datasets: propertyTypes.map((type, index) => ({
      label: type,
      data: topFiveAgencies.map((agency) => internalCommissionData?.[agency]?.[type] || 0),
      backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'][index % 5],
      stack: 'Stack 0',
    })),
  };

  const chartOptions: ChartOptions<'bar'> = {
    plugins: {
      legend: { position: 'top', labels: { font: { size: 14 } } },
      title: { display: true, text: 'Top 5 Agencies by Commission', font: { size: 18, weight: 'bold' } },
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
            const total = chartData.datasets.reduce(
              (sum, dataset) => sum + (dataset.data[tooltipItems[0].dataIndex] || 0),
              0
            );
            return `Total: ${formatCurrency(total)}\nProperties: ${summary.agencyPropertyCounts[agency] || 0}`;
          },
        },
      },
    },
    scales: {
      x: { stacked: true, ticks: { font: { size: 12 } } },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: {
          callback: (value) => formatCurrency(value as number),
          font: { size: 12 },
        },
        title: { display: true, text: 'Commission (AUD)', font: { size: 14 } },
      },
    },
  };

  // Export functions
  const exportCommissionPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('Commission Report', 20, 20);
    doc.setFontSize(12);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, 30);
    doc.setFontSize(10);
    doc.text('Generated by xAI Property Management', 20, 38);

    autoTable(doc, {
      startY: 50,
      head: [['Agency', 'Total Commission', 'Property Count', 'Suburbs']],
      body: agencyTotals.map((row) => [
        row.agency,
        formatCurrency(row.totalCommission),
        row.propertyCount,
        row.suburbs.join(', ') || 'None',
      ]),
      theme: 'striped',
      headStyles: { fillColor: '#FF6384', textColor: '#fff' },
      bodyStyles: { fontSize: 10 },
    });

    doc.save('commission_report.pdf');
    toast.success('Commission report exported as PDF');
  };

  const exportCommissionCSV = () => {
    const data = [
      ['Commission Report'],
      [`Generated on: ${new Date().toLocaleString()}`],
      ['Generated by xAI Property Management'],
      [],
      ['Agency Totals'],
      ['Agency', 'Total Commission', 'Property Count', 'Suburbs'],
      ...agencyTotals.map((row) => [row.agency, formatCurrency(row.totalCommission), row.propertyCount, row.suburbs.join(', ') || 'None']),
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Commission Report');
    XLSX.writeFile(wb, 'commission_report.csv');
    toast.success('Commission report exported as CSV');
  };

  // Search handler
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1); // Reset to page 1 on search
  };

  // Filter agencies for chart and table
  const filteredTopFiveAgencies = topFiveAgencies.filter((agency) =>
    agency.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredChartData = {
    ...chartData,
    labels: filteredTopFiveAgencies,
    datasets: chartData.datasets.map((dataset) => ({
      ...dataset,
      data: filteredTopFiveAgencies.map((agency) => internalCommissionData?.[agency]?.[dataset.label || ''] || 0),
    })),
  };

  // Filter agency totals for table
  const filteredAgencyTotals = agencyTotals.filter((row) =>
    row.agency.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const paginatedFilteredAgencyTotals = filteredAgencyTotals.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const filteredTotalPages = Math.ceil(filteredAgencyTotals.length / itemsPerPage);

  if (isLoading) {
    return <div className="text-center p-10">Loading commission data...</div>;
  }

  if (fetchError) {
    return <div className="text-center p-10 text-red-600">Error: {fetchError}</div>;
  }

  if (!internalCommissionData || agencyTotals.length === 0) {
    return <div className="text-center p-10">No commission data available.</div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Summary Card */}
      <motion.div
        className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 rounded-xl shadow-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="space-y-2">
          <h3 className="text-xl font-semibold">Commission Summary</h3>
          <p className="text-2xl font-bold">{formatCurrency(summary.totalCommission)}</p>
          <p className="text-sm">
            {summary.totalCommission > 0 ? 'Total Commission Earned' : 'No commission data available'}
          </p>
          <motion.div
            className="inline-flex items-center px-3 py-1 bg-green-400 text-green-900 rounded-full text-sm font-semibold"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1, opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Home className="w-4 h-4 mr-1" />
            {summary.totalProperties} Total Properties
          </motion.div>
        </div>
        <div className="text-right space-y-2">
          {summary.topAgency && agencyTotals[0] && (
            <>
              <p className="text-lg font-semibold">Top Agency</p>
              <motion.span
                className="inline-flex items-center px-3 py-1 bg-yellow-400 text-yellow-900 rounded-full text-sm font-semibold"
                initial={{ scale: 0.8 }}
                animate={{ scale: 1, rotate: [0, 5, -5, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
              >
                {summary.topAgency}
              </motion.span>
              <p className="text-sm">{formatCurrency(agencyTotals[0].totalCommission)}</p>
              <motion.div
                className="inline-flex items-center px-3 py-1 bg-blue-400 text-blue-900 rounded-full text-sm font-semibold"
                initial={{ scale: 0.8 }}
                animate={{ scale: 1, opacity: [0.8, 1, 0.8] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <Building2 className="w-4 h-4 mr-1" />
                {agencyTotals[0].propertyCount} Properties
              </motion.div>
            </>
          )}
          {summary.topAgent.name !== 'Unknown' && (
            <>
              <p className="text-lg font-semibold mt-4">Top Agent</p>
              <motion.span
                className="inline-flex items-center px-3 py-1 bg-orange-400 text-orange-900 rounded-full text-sm font-semibold"
                initial={{ scale: 0.8 }}
                animate={{ scale: 1, rotate: [0, 5, -5, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
              >
                <User className="w-4 h-4 mr-1" />
                {summary.topAgent.name}
              </motion.span>
              <p className="text-sm">{formatCurrency(summary.topAgent.commission)}</p>
            </>
          )}
        </div>
      </motion.div>

      {/* Agency Totals Table */}
      <motion.div
        className="bg-white p-6 rounded-xl shadow-lg border border-gray-100"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <BarChart className="w-5 h-5 mr-2 text-indigo-600" />
          Total Commission by Agency
        </h3>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agency</th>
              <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Commission</th>
              <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Property Count</th>
              <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Suburbs</th>
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
                  className="hover:bg-indigo-50 transition-colors"
                >
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.agency}</td>
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(row.totalCommission)}</td>
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.propertyCount}</td>
                  <td className="px-4 sm:px-6 py-4 text-sm text-gray-900">{row.suburbs.join(', ') || 'None'}</td>
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
                currentPage === 1
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
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
                  currentPage === page
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
      </motion.div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <motion.div
          className="flex space-x-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <motion.div className="px-4 py-2 rounded-full flex items-center bg-indigo-600 text-white">
            <BarChart className="w-4 h-4 mr-2" />
            Chart View (Top 5 Agencies)
          </motion.div>
        </motion.div>
        <div className="relative w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search top 5 agencies..."
            value={searchQuery}
            onChange={handleSearch}
            className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-64 bg-gray-50"
          />
          <svg
            className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Chart */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
          <Bar data={filteredChartData} options={chartOptions} />
        </div>
      </motion.div>

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
  );
}

export { CommissionByAgency };