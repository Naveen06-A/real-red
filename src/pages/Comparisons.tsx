import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Loader2, RefreshCw, Moon, Sun, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Star, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { normalizeSuburb } from '../utils/subrubUtils';
import { ErrorBoundary } from 'react-error-boundary';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend } from 'chart.js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { utils, writeFile } from 'xlsx';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

// Debug flag
const DEBUG = true;

// Error Fallback Component
const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => {
  if (DEBUG) console.error('ErrorBoundary caught:', error);
  return (
    <div className="flex justify-center items-center h-screen bg-[#BFDBFE] text-[#1E3A8A]">
      <div className="text-center">
        <svg className="w-16 h-16 mx-auto mb-4 text-[#1E3A8A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xl font-semibold">Error: {error.message}</p>
        <button
          onClick={resetErrorBoundary}
          className="mt-4 px-6 py-2 bg-[#3B82F6] text-white rounded-md hover:bg-[#BFDBFE] hover:text-[#1E3A8A] transition-colors"
          aria-label="Try again"
        >
          Try Again
        </button>
      </div>
    </div>
  );
};

// Interfaces
interface User {
  id: string;
  email?: string;
  agent_name?: string;
  agency_name?: string;
}

interface PropertyDetails {
  id: string;
  suburb: string;
  street_name: string;
  street_number: string;
  postcode: string;
  category: string;
  agent_name?: string;
  agency_name?: string;
  sold_date?: string;
  latitude?: number;
  longitude?: number;
  commission?: number;
}

interface ComparisonMetrics {
  harcourtsSuccess: {
    totalListings: number;
    totalSold: number;
    agents: string[];
    topAgent: { name: string; listings: number; sales: number };
  };
  agencyComparison: {
    agency: string;
    listedCount: number;
    soldCount: number;
    agents: string[];
  }[];
  agentComparison: {
    agent: string;
    agency: string;
    listings: number;
    sales: number;
  }[];
  suburbComparison: {
    suburb: string;
    topAgency: string;
    topListings: number;
    harcourtsListings: number;
  }[];
  streetComparison: {
    street: string;
    listedCount: number;
    soldCount: number;
  };
}

interface AgencyCardProps {
  item: ComparisonMetrics['agencyComparison'][0];
  index: number;
  globalIndex: number;
  maxSold: number;
  isOurAgency: boolean;
  comparisonMetrics: ComparisonMetrics | null;
  ourAgentName: string;
}

// Theme Toggle Component
const ThemeToggle: React.FC<{ isDark: boolean; setIsDark: (value: boolean) => void }> = ({ isDark, setIsDark }) => (
  <button
    onClick={() => setIsDark(!isDark)}
    className="p-2 rounded-md bg-[#BFDBFE] dark:bg-[#1E3A8A] text-[#1E3A8A] dark:text-[#BFDBFE] hover:bg-[#3B82F6] hover:text-white transition-colors"
    aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
  >
    {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
  </button>
);

// Progress Circle Component
const ProgressCircle: React.FC<{ progress: number; label: string }> = ({ progress, label }) => (
  <div className="relative w-24 h-24">
    <svg className="w-full h-full" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="45" fill="none" stroke="#BFDBFE" strokeWidth="10" />
      <motion.circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        stroke="#3B82F6"
        strokeWidth="10"
        strokeDasharray="283"
        strokeDashoffset={283 * (1 - progress / 100)}
        strokeLinecap="round"
        initial={{ strokeDashoffset: 283 }}
        animate={{ strokeDashoffset: 283 * (1 - progress / 100) }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />
    </svg>
    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
      <p className="text-base font-semibold text-[#1E3A8A]">{Math.round(progress)}%</p>
      <p className="text-xs text-[#1E3A8A]">{label}</p>
    </div>
  </div>
);

// Collapsible Section Component
const CollapsibleSection: React.FC<{
  title: string;
  children: React.ReactNode;
  isOpen: boolean;
  toggleOpen: () => void;
}> = ({ title, children, isOpen, toggleOpen }) => (
  <div className="border border-[#E5E7EB] bg-[#FFFFFF] rounded-md p-6">
    <button
      onClick={toggleOpen}
      className="w-full flex justify-between items-center text-xl font-semibold text-[#1E3A8A] mb-4 focus:outline-none"
    >
      {title}
      {isOpen ? <ChevronUp className="w-5 h-5 text-[#3B82F6]" /> : <ChevronDown className="w-5 h-5 text-[#3B82F6]" />}
    </button>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ blockSize: 0, opacity: 0 }}
          animate={{ blockSize: 'auto', opacity: 1 }}
          exit={{ blockSize: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

// Agency Card Component
const AgencyCard: React.FC<AgencyCardProps> = ({ item, index, globalIndex, maxSold, isOurAgency, comparisonMetrics, ourAgentName }) => {
  const progress = maxSold > 0 ? (item.soldCount / maxSold) * 100 : 0;
  const rankPercentile = comparisonMetrics?.agencyComparison?.length
    ? Math.ceil((globalIndex + 1) / comparisonMetrics.agencyComparison.length * 100)
    : 100;
  return (
    <motion.div
      className={`p-6 rounded-md border border-[#E5E7EB] relative ${
        isOurAgency ? 'bg-[#3B82F6] text-white' : 'bg-[#BFDBFE] text-[#1E3A8A]'
      }`}
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
    >
      {isOurAgency && (
        <motion.div
          className="absolute -top-3 -right-3 bg-[#BFDBFE] text-[#1E3A8A] rounded-full p-2 shadow-lg group"
          animate={{ boxShadow: ['0 0 0 0 rgba(59, 130, 246, 0.5)', '0 0 10px 5px rgba(59, 130, 246, 0.5)', '0 0 0 0 rgba(59, 130, 246, 0.5)'] }}
          transition={{ duration: 0.8, repeat: Infinity }}
          aria-label="Our Agency"
        >
          <Star className="w-4 h-4" />
          <div className="absolute hidden group-hover:block bg-[#BFDBFE] text-[#1E3A8A] text-xs rounded p-2 mt-2 right-0">
            Top {rankPercentile}% in Sales
          </div>
        </motion.div>
      )}
      <h3 className="text-lg font-semibold">Rank {globalIndex + 1}: {item.agency}</h3>
      <p className="text-sm mt-2">
        Agents: {item.agents.map((agent) => (
          agent === ourAgentName && isOurAgency ? (
            <span key={agent} className="font-semibold underline">{agent} (Our Agent)</span>
          ) : (
            agent
          )
        )).join(', ')}
      </p>
      <p className="text-sm">Listed: {item.listedCount}</p>
      <p className="text-sm">Sold: {item.soldCount}</p>
      <div className="mt-4">
        <ProgressCircle progress={progress} label="Sales" />
      </div>
    </motion.div>
  );
};

// Extend jsPDF with autoTable
interface JsPDFWithAutoTable extends jsPDF {
  autoTable: (content: { head: string[][]; body: string[][] }, options?: any) => void;
  lastAutoTable: { finalY: number };
}

// Main Component
export function ComparisonReport() {
  const [properties, setProperties] = useState<PropertyDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [openSections, setOpenSections] = useState({
    spotlight: true,
    agency: true,
    agent: true,
    suburb: true,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const itemsPerPage = 5;
  const { user } = useAuthStore((state: { user: User | null }) => ({ user: state.user }));
  const navigate = useNavigate();
  const location = useLocation();
  const ourAgentName = user?.agent_name || 'Our Agent';
  const ourAgencyName = 'Harcourts Success';

  // Log component lifecycle
  if (DEBUG) {
    console.log('ComparisonReport mounted at', new Date().toISOString());
    console.log('location.state:', JSON.stringify(location.state, null, 2));
    console.log('user:', user ? { id: user.id, agent_name: user.agent_name, agency_name: user.agency_name } : 'Not authenticated');
  }

  // Toggle theme
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // Generate mock coordinates
  const generateMockCoordinates = (suburb: string, streetName: string): { latitude: number; longitude: number } => {
    const seed = (suburb + streetName).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return {
      latitude: -33.8688 + (seed % 100) / 1000,
      longitude: 151.2093 + (seed % 100) / 1000,
    };
  };

  // Fetch data
  const fetchData = useCallback(async () => {
    if (DEBUG) console.log('fetchData: Starting...');
    try {
      setLoading(true);
      setError(null);

      let data: PropertyDetails[] = [];

      // Check for passed state
      const passedMetrics = location.state?.propertyMetrics;
      if (
        passedMetrics &&
        passedMetrics.propertyDetails &&
        Array.isArray(passedMetrics.propertyDetails) &&
        passedMetrics.propertyDetails.length > 0
      ) {
        if (DEBUG) console.log('fetchData: Using passed propertyMetrics:', passedMetrics.propertyDetails.length);
        data = passedMetrics.propertyDetails
          .map((prop: PropertyDetails, index: number) => {
            if (DEBUG) console.log(`fetchData: Processing property[${index}]:`, prop.id || 'No ID');
            try {
              if (!prop.id || !prop.suburb || !prop.street_name || !prop.street_number || !prop.postcode || !prop.category) {
                if (DEBUG) console.warn(`fetchData: Skipping invalid property[${index}]:`, prop);
                return null;
              }
              return {
                ...prop,
                suburb: normalizeSuburb(prop.suburb),
                agent_name: prop.agent_name ?? 'Unknown',
                agency_name: prop.agency_name ?? 'Unknown',
                latitude: prop.latitude ?? generateMockCoordinates(prop.suburb, prop.street_name).latitude,
                longitude: prop.longitude ?? generateMockCoordinates(prop.suburb, prop.street_name).longitude,
              } as PropertyDetails;
            } catch (err: any) {
              if (DEBUG) console.error(`fetchData: Error processing property[${index}]:`, err);
              return null;
            }
          })
          .filter((prop): prop is PropertyDetails => prop !== null);
        if (DEBUG) console.log('fetchData: Normalized properties from state:', data.length);
      } else {
        if (DEBUG) console.warn('fetchData: No valid propertyMetrics, fetching from Supabase');
        const { data: supabaseData, error: supabaseError } = await supabase
          .from('properties')
          .select('*, commission')
          .order('created_at', { ascending: false });
        if (DEBUG) console.log('fetchData: Supabase response:', {
          dataLength: supabaseData?.length,
          error: supabaseError,
        });
        if (supabaseError) {
          throw new Error(`Supabase error: ${supabaseError.message}`);
        }
        if (!supabaseData || supabaseData.length === 0) {
          throw new Error('No properties found in database');
        }
        data = supabaseData
          .map((prop: PropertyDetails, index: number) => {
            if (DEBUG) console.log(`fetchData: Processing Supabase property[${index}]:`, prop.id || 'No ID');
            try {
              if (!prop.id || !prop.suburb || !prop.street_name || !prop.street_number || !prop.postcode || !prop.category) {
                if (DEBUG) console.warn(`fetchData: Skipping invalid Supabase property[${index}]:`, prop);
                return null;
              }
              return {
                ...prop,
                suburb: normalizeSuburb(prop.suburb),
                agent_name: prop.agent_name ?? 'Unknown',
                agency_name: prop.agency_name ?? 'Unknown',
                latitude: prop.latitude ?? generateMockCoordinates(prop.suburb, prop.street_name).latitude,
                longitude: prop.longitude ?? generateMockCoordinates(prop.suburb, prop.street_name).longitude,
              } as PropertyDetails;
            } catch (err: any) {
              if (DEBUG) console.error(`fetchData: Error processing Supabase property[${index}]:`, err);
              return null;
            }
          })
          .filter((prop): prop is PropertyDetails => prop !== null);
        if (DEBUG) console.log('fetchData: Normalized properties from Supabase:', data.length);
      }

      if (data.length === 0) {
        throw new Error('No valid properties after processing');
      }

      setProperties(data);
    } catch (err: any) {
      if (DEBUG) console.error('fetchData: Error:', err);
      setError(err.message || 'Failed to fetch data');
      toast.error(err.message || 'Failed to fetch data');
    } finally {
      if (DEBUG) console.log('fetchData: Completed, loading:', false);
      setLoading(false);
    }
  }, [location.state]);

  useEffect(() => {
    if (DEBUG) console.log('useEffect: Initializing...');
    if (!user) {
      if (DEBUG) console.warn('useEffect: No user, setting error');
      setError('Please log in to view comparison report');
      setLoading(false);
      return;
    }

    fetchData();

    const subscription = supabase
      .channel('properties')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'properties' }, () => {
        if (DEBUG) console.log('useEffect: Properties table changed, refetching');
        fetchData();
      })
      .subscribe();

    return () => {
      if (DEBUG) console.log('useEffect: Cleaning up Supabase subscription');
      supabase.removeChannel(subscription);
    };
  }, [user, fetchData]);

  // Compute comparison metrics
  const comparisonMetrics = useMemo<ComparisonMetrics | null>(() => {
    if (!user || !properties.length) {
      if (DEBUG) console.warn('useMemo: No user or properties, returning null');
      return null;
    }

    if (DEBUG) console.log('useMemo: Computing metrics for', properties.length, 'properties');

    // 1. Harcourts Success Metrics
    const harcourtsProperties = properties.filter((prop: PropertyDetails) => prop.agency_name === ourAgencyName);
    const harcourtsAgents = [...new Set(harcourtsProperties.map((prop) => prop.agent_name || 'Unknown'))];
    const agentMetrics = harcourtsAgents.map((agent) => {
      const agentProps = harcourtsProperties.filter((prop) => prop.agent_name === agent);
      return {
        name: agent,
        listings: agentProps.length,
        sales: agentProps.filter((prop) => prop.sold_date).length,
      };
    });
    const topAgent = agentMetrics.reduce(
      (max, agent) => (agent.sales > max.sales ? agent : max),
      { name: 'Unknown', listings: 0, sales: 0 }
    );

    const harcourtsSuccess = {
      totalListings: harcourtsProperties.length,
      totalSold: harcourtsProperties.filter((prop) => prop.sold_date).length,
      agents: harcourtsAgents,
      topAgent,
    };

    // 2. Agency Comparison (Sorted Highest to Lowest by Listed, then Sold)
    const agencyMap: { [agency: string]: { listed: number; sold: number; agents: Set<string> } } = {};
    properties.forEach((prop: PropertyDetails) => {
      const agency = prop.agency_name || 'Unknown';
      const agent = prop.agent_name || 'Unknown';
      if (!agencyMap[agency]) {
        agencyMap[agency] = { listed: 0, sold: 0, agents: new Set() };
      }
      agencyMap[agency].listed += 1;
      if (prop.sold_date) agencyMap[agency].sold += 1;
      agencyMap[agency].agents.add(agent);
    });

    const agencyComparison = Object.entries(agencyMap)
      .map(([agency, { listed, sold, agents }]) => ({
        agency: agency.charAt(0).toUpperCase() + agency.slice(1),
        listedCount: listed,
        soldCount: sold,
        agents: Array.from(agents),
      }))
      .sort((a, b) => b.listedCount - a.listedCount || b.soldCount - a.soldCount);

    // 3. Agent Comparison (Sorted Highest to Lowest by Listings, then Sales)
    const agentMap: { [key: string]: { listings: number; sales: number; agency: string } } = {};
    properties.forEach((prop: PropertyDetails) => {
      const agent = prop.agent_name || 'Unknown';
      const agency = prop.agency_name || 'Unknown';
      const key = `${agent}-${agency}`;
      if (!agentMap[key]) {
        agentMap[key] = { listings: 0, sales: 0, agency };
      }
      agentMap[key].listings += 1;
      if (prop.sold_date) agentMap[key].sales += 1;
    });

    const agentComparison = Object.entries(agentMap)
      .map(([key, { listings, sales, agency }]) => ({
        agent: key.split('-')[0],
        agency: agency.charAt(0).toUpperCase() + agency.slice(1),
        listings,
        sales,
      }))
      .sort((a, b) => b.listings - a.listings || b.sales - a.sales)
      .slice(0, 10);

    // 4. Suburb Comparison (Sorted Highest to Lowest by Top Listings)
    const suburbMap: { [suburb: string]: { agencies: { [agency: string]: number } } } = {};
    properties.forEach((prop: PropertyDetails) => {
      const suburb = normalizeSuburb(prop.suburb);
      const agency = prop.agency_name || 'Unknown';
      if (!suburbMap[suburb]) suburbMap[suburb] = { agencies: {} };
      suburbMap[suburb].agencies[agency] = (suburbMap[suburb].agencies[agency] || 0) + 1;
    });

    const suburbComparison = Object.entries(suburbMap)
      .map(([suburb, { agencies }]) => {
        const topAgencyEntry = Object.entries(agencies).reduce(
          (max, [agency, count]) => (count > max.count ? { agency, count } : max),
          { agency: 'Unknown', count: 0 }
        );
        return {
          suburb,
          topAgency: topAgencyEntry.agency.charAt(0).toUpperCase() + topAgencyEntry.agency.slice(1),
          topListings: topAgencyEntry.count,
          harcourtsListings: agencies[ourAgencyName] || 0,
        };
      })
      .sort((a, b) => b.topListings - a.topListings || a.suburb.localeCompare(b.suburb));

    // 5. Street Comparison (Most Listed and Sold)
    const streetMap: { [street: string]: { listed: number; sold: number } } = {};
    properties.forEach((prop: PropertyDetails) => {
      const street = `${prop.street_name}, ${normalizeSuburb(prop.suburb)}`;
      if (!streetMap[street]) {
        streetMap[street] = { listed: 0, sold: 0 };
      }
      streetMap[street].listed += 1;
      if (prop.sold_date) streetMap[street].sold += 1;
    });

    const streetComparison = Object.entries(streetMap)
      .map(([street, { listed, sold }]) => ({
        street,
        listedCount: listed,
        soldCount: sold,
      }))
      .sort((a, b) => b.listedCount - a.listedCount || b.soldCount - a.soldCount)
      .slice(0, 1)[0]; // Get the top street

    return {
      harcourtsSuccess,
      agencyComparison,
      agentComparison,
      suburbComparison,
      streetComparison,
    };
  }, [properties, user, ourAgencyName]);

  // Pagination for Agency Comparison
  const totalPages = comparisonMetrics ? Math.ceil(comparisonMetrics.agencyComparison.length / itemsPerPage) : 1;
  const paginatedAgencies = useMemo(() => {
    if (!comparisonMetrics) return [];
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return comparisonMetrics.agencyComparison.slice(start, end);
  }, [comparisonMetrics, currentPage]);

  // Calculate visible page numbers for pagination
  const visiblePages = useMemo(() => {
    if (totalPages <= 3) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    let startPage = Math.max(1, currentPage - 1);
    let endPage = Math.min(totalPages, currentPage + 1);
    if (currentPage === 1) {
      endPage = 3;
    } else if (currentPage === totalPages) {
      startPage = totalPages - 2;
    }
    return Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);
  }, [currentPage, totalPages]);

  // Chart Data
  const agencyChartData = useMemo(() => {
    if (!comparisonMetrics) return { labels: [], datasets: [] };
    const labels = paginatedAgencies.map((item) => item.agency);
    const listedData = paginatedAgencies.map((item) => item.listedCount);
    const soldData = paginatedAgencies.map((item) => item.soldCount);
    return {
      labels,
      datasets: [
        {
          label: 'Properties Listed',
          data: listedData,
          backgroundColor: labels.map((label) => (label === ourAgencyName ? '#1E3A8A' : '#BFDBFE')),
          borderColor: labels.map((label) => (label === ourAgencyName ? '#1E3A8A' : '#BFDBFE')),
          borderWidth: 1,
        },
        {
          label: 'Properties Sold',
          data: soldData,
          backgroundColor: labels.map((label) => (label === ourAgencyName ? '#3B82F6' : '#93C5FD')),
          borderColor: labels.map((label) => (label === ourAgencyName ? '#3B82F6' : '#93C5FD')),
          borderWidth: 1,
        },
      ],
    };
  }, [paginatedAgencies, ourAgencyName]);

  const donutChartData = useMemo(() => {
    if (!comparisonMetrics) return { labels: [], datasets: [] };
    const ourAgency = comparisonMetrics.agencyComparison.find((item) => item.agency === ourAgencyName);
    const otherAgencies = comparisonMetrics.agencyComparison.filter((item) => item.agency !== ourAgencyName);
    return {
      labels: [ourAgencyName, 'Other Agencies'],
      datasets: [
        {
          data: [
            ourAgency?.soldCount || 0,
            otherAgencies.reduce((sum, item) => sum + item.soldCount, 0),
          ],
          backgroundColor: ['#1E3A8A', '#BFDBFE'],
          borderColor: ['#1E3A8A', '#BFDBFE'],
          borderWidth: 1,
        },
      ],
    };
  }, [comparisonMetrics, ourAgencyName]);

  // Generate PDF (used for both export and preview)
  const generatePDF = () => {
    if (!comparisonMetrics) return null;
    const doc = new jsPDF() as JsPDFWithAutoTable;
    const totalPages = doc.internal.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Defining addFooter function to add consistent pagination
    const addFooter = (page: number) => {
      doc.setPage(page);
      doc.setFillColor(191, 219, 254); // #BFDBFE
      doc.circle(pageWidth - 20, pageHeight - 15, 10, 'F'); // Circular badge
      doc.setFontSize(10);
      doc.setTextColor(30, 64, 175); // #1E3A8A
      doc.setFont('Inter', 'normal');
      doc.text(`Page ${page} of ${totalPages}`, pageWidth - 20, pageHeight - 15, { align: 'center' });
      // Add subtle divider line
      doc.setDrawColor(147, 197, 253); // #93C5FD
      doc.setLineWidth(0.5);
      doc.line(20, pageHeight - 25, pageWidth - 20, pageHeight - 25);
    };

    // Setting up document properties
    doc.setFont('Inter', 'normal');
    doc.setFontSize(16);
    doc.setTextColor(30, 64, 175); // Blue #1E3A8A
    doc.text('Harcourts Success Performance Comparison', 20, 20);

    // Harcourts Success Summary
    doc.setFontSize(14);
    doc.text('Harcourts Success Summary', 20, 30);
    doc.autoTable({
      head: [['Metric', 'Value']],
      body: [
        ['Total Listings', comparisonMetrics.harcourtsSuccess.totalListings.toString()],
        ['Total Sold', comparisonMetrics.harcourtsSuccess.totalSold.toString()],
        ['Agents', comparisonMetrics.harcourtsSuccess.agents.join(', ')],
        ['Top Agent', `${comparisonMetrics.harcourtsSuccess.topAgent.name} (${comparisonMetrics.harcourtsSuccess.topAgent.sales} sales)`],
        ['Most Active Street', `${comparisonMetrics.streetComparison.street} (${comparisonMetrics.streetComparison.listedCount} listed, ${comparisonMetrics.streetComparison.soldCount} sold)`],
      ],
      startY: 35,
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], font: 'Inter' },
      bodyStyles: { fillColor: [191, 219, 254], textColor: [30, 64, 175], font: 'Inter' },
      margin: { left: 20, right: 20 },
    });

    // Add section divider
    doc.setDrawColor(59, 130, 246); // #3B82F6
    doc.setLineWidth(1);
    doc.line(20, doc.lastAutoTable.finalY + 5, pageWidth - 20, doc.lastAutoTable.finalY + 5);

    // Agency Comparison
    doc.setFontSize(14);
    doc.text('Agency Comparison', 20, doc.lastAutoTable.finalY + 15);
    doc.autoTable({
      head: [['Rank', 'Agency', 'Agents', 'Properties Listed', 'Properties Sold']],
      body: comparisonMetrics.agencyComparison.map((item, index) => [
        (index + 1).toString(),
        item.agency,
        item.agents.join(', '),
        item.listedCount.toString(),
        item.soldCount.toString(),
      ]),
      startY: doc.lastAutoTable.finalY + 20,
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], font: 'Inter' },
      bodyStyles: { fillColor: [191, 219, 254], textColor: [30, 64, 175], font: 'Inter' },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        addFooter(doc.internal.getCurrentPageInfo().pageNumber);
      },
    });

    // Add section divider
    doc.setDrawColor(59, 130, 246);
    doc.setLineWidth(1);
    doc.line(20, doc.lastAutoTable.finalY + 5, pageWidth - 20, doc.lastAutoTable.finalY + 5);

    // Agent Comparison
    doc.setFontSize(14);
    doc.text('Agent Comparison', 20, doc.lastAutoTable.finalY + 15);
    doc.autoTable({
      head: [['Rank', 'Agent', 'Agency', 'Listings', 'Sales', 'Our Agent']],
      body: comparisonMetrics.agentComparison.map((item, index) => [
        (index + 1).toString(),
        item.agent,
        item.agency,
        item.listings.toString(),
        item.sales.toString(),
        item.agent === ourAgentName && item.agency === ourAgencyName ? 'Yes' : 'No',
      ]),
      startY: doc.lastAutoTable.finalY + 20,
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], font: 'Inter' },
      bodyStyles: { fillColor: [191, 219, 254], textColor: [30, 64, 175], font: 'Inter' },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        addFooter(doc.internal.getCurrentPageInfo().pageNumber);
      },
    });

    // Add section divider
    doc.setDrawColor(59, 130, 246);
    doc.setLineWidth(1);
    doc.line(20, doc.lastAutoTable.finalY + 5, pageWidth - 20, doc.lastAutoTable.finalY + 5);

    // Suburb Comparison
    doc.setFontSize(14);
    doc.text('Suburb Comparison', 20, doc.lastAutoTable.finalY + 15);
    doc.autoTable({
      head: [['Rank', 'Suburb', 'Top Agency', 'Top Listings', 'Harcourts Listings']],
      body: comparisonMetrics.suburbComparison.map((item, index) => [
        (index + 1).toString(),
        item.suburb,
        item.topAgency,
        item.topListings.toString(),
        item.harcourtsListings.toString(),
      ]),
      startY: doc.lastAutoTable.finalY + 20,
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], font: 'Inter' },
      bodyStyles: { fillColor: [191, 219, 254], textColor: [30, 64, 175], font: 'Inter' },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        addFooter(doc.internal.getCurrentPageInfo().pageNumber);
      },
    });

    // Ensure footer is added to all pages
    for (let i = 1; i <= totalPages; i++) {
      addFooter(i);
    }

    return doc;
  };

  // Export to PDF
  const exportToPDF = () => {
    const doc = generatePDF();
    if (doc) {
      doc.save('Harcourts_Success_Comparison.pdf');
    }
  };

  // Preview PDF
  const previewPDF = () => {
    const doc = generatePDF();
    if (doc) {
      const pdfUrl = doc.output('datauristring');
      setPdfPreviewUrl(pdfUrl);
      setIsPreviewOpen(true);
      if (DEBUG) console.log('previewPDF: Generated PDF URL for preview');
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    if (!comparisonMetrics) return;
    const ws = utils.json_to_sheet([
      { Metric: 'Total Listings', Value: comparisonMetrics.harcourtsSuccess.totalListings },
      { Metric: 'Total Sold', Value: comparisonMetrics.harcourtsSuccess.totalSold },
      { Metric: 'Agents', Value: comparisonMetrics.harcourtsSuccess.agents.join(', ') },
      { Metric: 'Top Agent', Value: `${comparisonMetrics.harcourtsSuccess.topAgent.name} (${comparisonMetrics.harcourtsSuccess.topAgent.sales} sales)` },
      { Metric: 'Most Active Street', Value: `${comparisonMetrics.streetComparison.street} (${comparisonMetrics.streetComparison.listedCount} listed, ${comparisonMetrics.streetComparison.soldCount} sold)` },
      {},
      ...comparisonMetrics.agencyComparison.map((item, index) => ({
        Rank: index + 1,
        Agency: item.agency,
        Agents: item.agents.join(', '),
        'Properties Listed': item.listedCount,
        'Properties Sold': item.soldCount,
      })),
      {},
      ...comparisonMetrics.agentComparison.map((item, index) => ({
        Rank: index + 1,
        Agent: item.agent,
        Agency: item.agency,
        Listings: item.listings,
        Sales: item.sales,
        'Our Agent': item.agent === ourAgentName && item.agency === ourAgencyName ? 'Yes' : 'No',
      })),
      {},
      ...comparisonMetrics.suburbComparison.map((item, index) => ({
        Rank: index + 1,
        Suburb: item.suburb,
        'Top Agency': item.topAgency,
        'Top Listings': item.topListings,
        'Harcourts Listings': item.harcourtsListings,
      })),
    ]);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Harcourts_Success');
    writeFile(wb, 'Harcourts_Success_Comparison.csv');
  };

  // Log state before render
  if (DEBUG) {
    console.log('Render state:', {
      loading,
      error,
      properties: properties.length,
      comparisonMetrics: comparisonMetrics ? 'Computed' : 'Not computed',
      currentPage,
      totalPages,
      visiblePages,
      ourAgentName,
      ourAgencyName,
      isPreviewOpen,
    });
  }

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        if (DEBUG) console.log('ErrorBoundary: Reset triggered');
        setError(null);
        setProperties([]);
        setLoading(true);
        fetchData();
      }}
    >
      <div className="min-h-screen bg-[#BFDBFE] py-8 px-4 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex justify-center items-center h-screen">
            <Loader2 className="w-12 h-12 text-[#3B82F6] animate-spin" />
          </div>
        ) : error ? (
          <div className="flex justify-center items-center h-screen text-[#1E3A8A]">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-[#1E3A8A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xl font-semibold">Error: {error}</p>
              <button
                onClick={() => {
                  if (DEBUG) console.log('Try Again clicked');
                  setError(null);
                  setLoading(true);
                  fetchData();
                }}
                className="mt-4 px-6 py-2 bg-[#3B82F6] text-white rounded-md hover:bg-[#BFDBFE] hover:text-[#1E3A8A] transition-colors"
                aria-label="Try again"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto">
            {/* PDF Preview Modal */}
            <AnimatePresence>
              {isPreviewOpen && pdfPreviewUrl && (
                <motion.div
                  className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <motion.div
                    className="bg-[#FFFFFF] rounded-lg shadow-xl w-full max-w-4xl h-[80vh] relative"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <button
                      onClick={() => {
                        setIsPreviewOpen(false);
                        setPdfPreviewUrl(null);
                        if (DEBUG) console.log('Preview modal closed');
                      }}
                      className="absolute top-4 right-4 p-2 rounded-full bg-[#3B82F6] text-white hover:bg-[#BFDBFE] hover:text-[#1E3A8A] transition-colors"
                      aria-label="Close preview"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    <iframe
                      src={pdfPreviewUrl}
                      className="w-full h-full rounded-lg"
                      title="PDF Preview"
                    />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex justify-between items-center mb-8">
              <h1 className="text-3xl font-semibold text-[#1E3A8A]">Harcourts Success Comparison Report</h1>
              <div className="flex items-center space-x-4">
                <ThemeToggle isDark={isDark} setIsDark={setIsDark} />
                <button
                  onClick={() => {
                    if (DEBUG) console.log('Navigating back to reports');
                    navigate('/reports');
                  }}
                  className="flex items-center px-5 py-2 bg-[#3B82F6] text-white rounded-md hover:bg-[#BFDBFE] hover:text-[#1E3A8A] transition-colors"
                  aria-label="Back to reports"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Reports
                </button>
              </div>
            </div>
            <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-md p-6">
              <h2 className="text-2xl font-semibold text-[#1E3A8A] mb-6">Performance Dashboard</h2>
              {comparisonMetrics ? (
                <div className="space-y-6">
                  {/* Harcourts Success Spotlight */}
                  <CollapsibleSection
                    title="Harcourts Success Overview"
                    isOpen={openSections.spotlight}
                    toggleOpen={() => setOpenSections({ ...openSections, spotlight: !openSections.spotlight })}
                  >
                    <div className="p-6 bg-[#BFDBFE] rounded-md">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                        <div className="p-4 bg-[#FFFFFF] border border-[#E5E7EB] rounded-md">
                          <p className="text-sm text-[#1E3A8A]">Total Listings</p>
                          <p className="text-2xl font-semibold text-[# injurious[#1E3A8A]">{comparisonMetrics.harcourtsSuccess.totalListings}</p>
                        </div>
                        <div className="p-4 bg-[#FFFFFF] border border-[#E5E7EB] rounded-md">
                          <p className="text-sm text-[#1E3A8A]">Total Sold</p>
                          <p className="text-2xl font-semibold text-[#1E3A8A]">{comparisonMetrics.harcourtsSuccess.totalSold}</p>
                        </div>
                        <div className="p-4 bg-[#FFFFFF] border border-[#E5E7EB] rounded-md">
                          <p className="text-sm text-[#1E3A8A]">Active Agents</p>
                          <p className="text-2xl font-semibold text-[#1E3A8A]">{comparisonMetrics.harcourtsSuccess.agents.length}</p>
                        </div>
                        <div className="p-4 bg-[#FFFFFF] border border-[#E5E7EB] rounded-md">
                          <p className="text-sm text-[#1E3A8A]">Top Agent</p>
                          <p className="text-base font-semibold text-[#1E3A8A]">
                            {comparisonMetrics.harcourtsSuccess.topAgent.name} ({comparisonMetrics.harcourtsSuccess.topAgent.sales} sales)
                          </p>
                        </div>
                        <div className="p-4 bg-[#FFFFFF] border border-[#E5E7EB] rounded-md">
                          <p className="text-sm text-[#1E3A8A]">Most Active Street</p>
                          <p className="text-base font-semibold text-[#1E3A8A]">
                            {comparisonMetrics.streetComparison.street} ({comparisonMetrics.streetComparison.listedCount} listed)
                          </p>
                        </div>
                      </div>
                      <div className="flex justify-around">
                        <ProgressCircle
                          progress={
                            (comparisonMetrics.harcourtsSuccess.totalSold /
                              Math.max(...comparisonMetrics.agencyComparison.map((item) => item.soldCount))) *
                            100
                          }
                          label="Sales vs. Top"
                        />
                        <ProgressCircle
                          progress={
                            (comparisonMetrics.harcourtsSuccess.totalListings /
                              Math.max(...comparisonMetrics.agencyComparison.map((item) => item.listedCount))) *
                            100
                          }
                          label="Listings vs. Top"
                        />
                      </div>
                    </div>
                  </CollapsibleSection>

                  {/* Agency Comparison with Carousel Pagination */}
                  <CollapsibleSection
                    title="Agency Comparison (Sorted by Listings)"
                    isOpen={openSections.agency}
                    toggleOpen={() => setOpenSections({ ...openSections, agency: !openSections.agency })}
                  >
                    <div className="relative">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={currentPage}
                          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          {paginatedAgencies.map((item, index) => (
                            <AgencyCard
                              key={item.agency}
                              item={item}
                              index={index}
                              globalIndex={(currentPage - 1) * itemsPerPage + index}
                              maxSold={Math.max(...comparisonMetrics.agencyComparison.map((i) => i.soldCount))}
                              isOurAgency={item.agency === ourAgencyName}
                              comparisonMetrics={comparisonMetrics}
                              ourAgentName={ourAgentName}
                            />
                          ))}
                        </motion.div>
                      </AnimatePresence>
                      <div className="flex justify-between items-center mt-4">
                        <motion.button
                          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
                          className="p-2 rounded-full bg-[#3B82F6] text-white hover:bg-[#BFDBFE] hover:text-[#1E3A8A] disabled:bg-[#E5E7EB] disabled:text-[#6B7280] transition-colors"
                          aria-label="Previous page"
                          whileHover={{ scale: 1.1, boxShadow: '0 0 8px rgba(59, 130, 246, 0.5)' }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </motion.button>
                        <div className="flex space-x-2">
                          {visiblePages.map((page) => (
                            <motion.button
                              key={page}
                              className={`px-4 py-2 rounded-md text-sm font-semibold ${
                                currentPage === page
                                  ? 'bg-[#1E3A8A] text-white scale-110'
                                  : 'bg-[#BFDBFE] text-[#1E3A8A] hover:bg-[#3B82F6] hover:text-white'
                              } transition-colors shadow-md`}
                              onClick={() => setCurrentPage(page)}
                              aria-label={`Page ${page}`}
                              aria-current={currentPage === page ? 'page' : undefined}
                              whileHover={{ scale: 1.1, boxShadow: '0 0 8px rgba(59, 130, 246, 0.5)' }}
                              whileTap={{ scale: 0.95 }}
                            >
                              {page}
                            </motion.button>
                          ))}
                        </div>
                        <motion.button
                          onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                          disabled={currentPage === totalPages}
                          className="p-2 rounded-full bg-[#3B82F6] text-white hover:bg-[#BFDBFE] hover:text-[#1E3A8A] disabled:bg-[#E5E7EB] disabled:text-[#6B7280] transition-colors"
                          aria-label="Next page"
                          whileHover={{ scale: 1.1, boxShadow: '0 0 8px rgba(59, 130, 246, 0.5)' }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <ChevronRight className="w-5 h-5" />
                        </motion.button>
                      </div>
                    </div>
                    <div className="mt-6 bg-[#FFFFFF] p-4 rounded-md border border-[#E5E7EB]">
                      <Bar
                        data={agencyChartData}
                        options={{
                          responsive: true,
                          plugins: {
                            legend: { position: 'top', labels: { color: '#1E3A8A', font: { family: 'Inter' } } },
                            title: { display: true, text: 'Agency Performance (Sorted by Listings)', color: '#1E3A8A', font: { family: 'Inter', size: 16 } },
                          },
                          scales: {
                            x: { stacked: true, ticks: { color: '#1E3A8A', font: { family: 'Inter' } } },
                            y: { stacked: true, ticks: { color: '#1E3A8A', font: { family: 'Inter' } } },
                          },
                        }}
                      />
                    </div>
                    <div className="mt-6 bg-[#FFFFFF] p-4 rounded-md border border-[#E5E7EB]">
                      <Doughnut
                        data={donutChartData}
                        options={{
                          responsive: true,
                          plugins: {
                            legend: { position: 'top', labels: { color: '#1E3A8A', font: { family: 'Inter' } } },
                            title: { display: true, text: 'Sales Share', color: '#1E3A8A', font: { family: 'Inter', size: 16 } },
                          },
                        }}
                      />
                    </div>
                  </CollapsibleSection>

                  {/* Agent Comparison */}
                  <CollapsibleSection
                    title="Agent Comparison (Sorted by Listings)"
                    isOpen={openSections.agent}
                    toggleOpen={() => setOpenSections({ ...openSections, agent: !openSections.agent })}
                  >
                    <div className="overflow-x-auto">
                      <table className="min-w-full border border-[#E5E7EB]">
                        <thead className="bg-[#1E3A8A] text-white">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Rank</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Agent</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Agency</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Listings</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Sales</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Our Agent</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Progress</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5E7EB]">
                          {comparisonMetrics.agentComparison.map((item, index) => {
                            const maxSales = Math.max(...comparisonMetrics.agentComparison.map((i) => i.sales));
                            const progress = maxSales > 0 ? (item.sales / maxSales) * 100 : 0;
                            const isOurAgent = item.agent === ourAgentName && item.agency === ourAgencyName;
                            const rankPercentile = comparisonMetrics.agentComparison.length
                              ? Math.ceil((index + 1) / comparisonMetrics.agentComparison.length * 100)
                              : 100;
                            return (
                              <tr
                                key={item.agent + item.agency}
                                className={`relative ${isOurAgent ? 'bg-[#3B82F6] text-white sticky top-0 z-10' : 'bg-[#BFDBFE] text-[#1E3A8A]'}`}
                              >
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{index + 1}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm relative group">
                                  {item.agent}
                                  {isOurAgent && (
                                    <motion.div
                                      className="absolute -top-3 -right-3 bg-[#BFDBFE] text-[#1E3A8A] rounded-full p-2 shadow-lg"
                                      animate={{ boxShadow: ['0 0 0 0 rgba(59, 130, 246, 0.5)', '0 0 10px 5px rgba(59, 130, 246, 0.5)', '0 0 0 0 rgba(59, 130, 246, 0.5)'] }}
                                      transition={{ duration: 0.8, repeat: Infinity }}
                                      aria-label="Our Agent"
                                    >
                                      <Star className="w-4 h-4" />
                                      <div className="absolute hidden group-hover:block bg-[#BFDBFE] text-[#1E3A8A] text-xs rounded p-2 mt-2 right-0">
                                        Top {rankPercentile}% in Sales
                                      </div>
                                    </motion.div>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{item.agency}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{item.listings}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{item.sales}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                  {isOurAgent ? (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#1E3A8A] text-white">
                                      Our Agent: {ourAgentName}
                                    </span>
                                  ) : (
                                    'No'
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <ProgressCircle progress={progress} label="Sales" />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CollapsibleSection>

                  {/* Suburb Comparison */}
                  <CollapsibleSection
                    title="Suburb Performance (Sorted by Top Listings)"
                    isOpen={openSections.suburb}
                    toggleOpen={() => setOpenSections({ ...openSections, suburb: !openSections.suburb })}
                  >
                    <div className="overflow-x-auto">
                      <table className="min-w-full border border-[#E5E7EB]">
                        <thead className="bg-[#1E3A8A] text-white">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Rank</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Suburb</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Top Agency</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Top Listings</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Harcourts Listings</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Progress</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5E7EB]">
                          {comparisonMetrics.suburbComparison.map((item, index) => {
                            const progress = item.topListings > 0 ? (item.harcourtsListings / item.topListings) * 100 : 0;
                            return (
                              <tr key={item.suburb} className="bg-[#BFDBFE] text-[#1E3A8A]">
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{index + 1}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{item.suburb}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{item.topAgency}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{item.topListings}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{item.harcourtsListings}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <ProgressCircle progress={progress} label="Listings" />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CollapsibleSection>

                  {/* Export Buttons */}
                  <div className="flex space-x-4">
                    <button
                      onClick={previewPDF}
                      className="px-4 py-2 bg-[#3B82F6] text-white rounded-md hover:bg-[#BFDBFE] hover:text-[#1E3A8A] transition-colors"
                      aria-label="Preview PDF"
                    >
                      Preview PDF
                    </button>
                    <button
                      onClick={exportToPDF}
                      className="px-4 py-2 bg-[#3B82F6] text-white rounded-md hover:bg-[#BFDBFE] hover:text-[#1E3A8A] transition-colors"
                      aria-label="Export to PDF"
                    >
                      Export PDF
                    </button>
                    <button
                      onClick={exportToCSV}
                      className="px-4 py-2 bg-[#3B82F6] text-white rounded-md hover:bg-[#BFDBFE] hover:text-[#1E3A8A] transition-colors"
                      aria-label="Export to CSV"
                    >
                      Export CSV
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-[#1E3A8A] mb-4">
                    No properties available. Try reloading or checking your data source.
                  </p>
                  <button
                    onClick={() => {
                      if (DEBUG) console.log('Reload clicked');
                      setLoading(true);
                      fetchData();
                    }}
                    className="flex items-center px-4 py-2 bg-[#3B82F6] text-white rounded-md hover:bg-[#BFDBFE] hover:text-[#1E3A8A] transition-colors"
                    aria-label="Reload data"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Reload
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default ComparisonReport;