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
import ChartDataLabels from 'chartjs-plugin-datalabels';
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
  ChevronLeft,
  ChevronRight,
  Star,
  MapPin,
  ChevronDown,
  ChevronUp,
  Pencil,
  ArrowLeft,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';

// Register ChartJS components and plugins
ChartJS.register(BarElement, CategoryScale, LinearScale, ArcElement, Tooltip, Legend, ChartDataLabels);

// Interfaces
interface User {
  id: string;
  email?: string;
  agent_name?: string;
  agency_name?: string;
  role?: string;
}

interface SuburbCommission {
  suburb: string;
  listedCommissionTotal: number;
  listedPropertyCount: number;
  soldCommissionTotal: number;
  soldPropertyCount: number;
  avgListedCommissionRate: number;
  avgSoldCommissionRate: number;
}

interface CommissionSummary {
  totalCommission: number;
  totalListedCommission: number;
  totalSoldCommission: number;
  totalProperties: number;
  totalListed: number;
  totalSold: number;
  topAgency: string;
  topAgencyCommissionRate: number;
  topAgencyTotalCommission: number;
  topAgencyPropertyCount: number;
  topAgent: { name: string; commission: number; propertyCount: number };
  agencyPropertyCounts: Record<string, number>;
  topStreet: { street: string; listedCount: number; commission: number };
  suburbCommissions: SuburbCommission[];
}

interface AgencyTotal {
  agency: string;
  totalCommission: number;
  listedCommission: number;
  soldCommission: number;
  commissionRate: number;
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
  commissionRate?: number;
}

interface CommissionEditState {
  isOpen: boolean;
  agency: string | null;
  newCommission: string;
}

interface AgentCommissionEditState {
  isOpen: boolean;
  agency: string | null;
  agent: string | null;
  newCommission: string;
}

interface AgentCommission {
  id?: string;
  property_id: string;
  agent_name: string;
  commission_rate: number;
}

// Helper Functions
const calculateCommission = (
  property: PropertyDetails,
  agentCommissions: AgentCommission[]
): { commissionRate: number; commissionEarned: number } => {
  const agentCommission = agentCommissions.find(
    (ac) => ac.property_id === property.id && ac.agent_name === normalizeAgentName(property.agent_name)
  );
  const commissionRate = agentCommission?.commission_rate || property.commission || 0;
  const basePrice = property.sold_price || property.price || 0;
  const commissionEarned = commissionRate > 0 && basePrice > 0 ? basePrice * (commissionRate / 100) : 0;
  return { commissionRate, commissionEarned };
};

const normalizeAgencyName = (agency: string | undefined | null): string => {
  if (!agency) return 'Unknown';
  const trimmed = agency.trim().toLowerCase();
  if (trimmed.includes('harcourts success')) return 'Harcourts Success';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
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
    springfield: 'SPRINGFIELD QLD 4300',
    'springfield qld': 'SPRINGFIELD QLD 4300',
    'springfield qld (4300)': 'SPRINGFIELD QLD 4300',
    'spring mountain': 'SPRING MOUNTAIN QLD 4300',
    'spring mountain qld': 'SPRING MOUNTAIN QLD 4300',
    'spring mountain qld (4300)': 'SPRING MOUNTAIN QLD 4300',
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

function CommissionByAgency() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'listed' | 'sold'>('all');
  const [dateRange, setDateRange] = useState<'all' | 'last30' | 'last90'>('all');
  const [selectedAgency, setSelectedAgency] = useState<string | null>(null);
  const [internalCommissionData, setInternalCommissionData] = useState<Record<string, Record<string, number>> | null>(null);
  const [internalAgentData, setInternalAgentData] = useState<Record<string, { commission: number; listed: number; sold: number; commissionRate?: number }>>({});
  const [internalProperties, setInternalProperties] = useState<PropertyDetails[]>([]);
  const [agentCommissions, setAgentCommissions] = useState<AgentCommission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [openSections, setOpenSections] = useState({
    summary: true,
    ourPerformance: true,
    agencies: true,
    agents: true,
    streets: true,
    suburbs: true,
  });
  const [commissionEdit, setCommissionEdit] = useState<CommissionEditState>({
    isOpen: false,
    agency: null,
    newCommission: '',
  });
  const [agentCommissionEdit, setAgentCommissionEdit] = useState<AgentCommissionEditState>({
    isOpen: false,
    agency: null,
    agent: null,
    newCommission: '',
  });
  const [isUpdatingCommission, setIsUpdatingCommission] = useState(false);
  const [isUpdatingAgentCommission, setIsUpdatingAgentCommission] = useState(false);
  const itemsPerPage = 10;
  const ourAgencyName = 'Harcourts Success';
  const ourAgentName = 'John Smith';
  const { user } = useAuthStore((state: { user: User | null }) => ({ user: state.user }));
  const isAdmin = user?.role === 'admin';
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCommissionData = async () => {
      setIsLoading(true);
      setFetchError(null);
      try {
        const { data: propertiesData, error: propertiesError } = await supabase
          .from('properties')
          .select('id, agency_name, property_type, commission, price, sold_price, suburb, street_name, street_number, agent_name, postcode, category, listed_date, sale_type, expected_price, features, flood_risk, bushfire_risk, contract_status, same_street_sales, past_records, sold_date');

        if (propertiesError) throw propertiesError;

        const { data: agentCommissionsData, error: agentCommissionsError } = await supabase
          .from('agent_commissions')
          .select('id, property_id, agent_name, commission_rate');

        if (agentCommissionsError) throw agentCommissionsError;

        const fetchedProperties = (propertiesData as PropertyDetails[]) || [];
        const fetchedAgentCommissions = (agentCommissionsData as AgentCommission[]) || [];

        setInternalProperties(fetchedProperties);
        setAgentCommissions(fetchedAgentCommissions);

        const newCommissionMap: Record<string, Record<string, number>> = {};
        const newAgentMap: Record<string, { commission: number; listed: number; sold: number; commissionRate?: number }> = {};

        fetchedProperties.forEach((property) => {
          const agency = normalizeAgencyName(property.agency_name);
          const agent = normalizeAgentName(property.agent_name);
          const propertyType = property.property_type || 'Unknown';
          const { commissionEarned, commissionRate } = calculateCommission(property, fetchedAgentCommissions);
          const isSold = property.contract_status === 'sold' || !!property.sold_date;

          if (agency && !isNaN(commissionEarned)) {
            newCommissionMap[agency] = newCommissionMap[agency] || {};
            newCommissionMap[agency][propertyType] = (newCommissionMap[agency][propertyType] || 0) + commissionEarned;
          }

          if (agent) {
            newAgentMap[agent] = newAgentMap[agent] || { commission: 0, listed: 0, sold: 0, commissionRate: undefined };
            newAgentMap[agent].listed += 1;
            newAgentMap[agent].sold += isSold ? 1 : 0;
            newAgentMap[agent].commission += isNaN(commissionEarned) ? 0 : commissionEarned;
            if (!newAgentMap[agent].commissionRate) {
              const agentPropertyCommission = fetchedAgentCommissions.find(
                (ac) => ac.property_id === property.id && ac.agent_name === agent
              );
              newAgentMap[agent].commissionRate = agentPropertyCommission?.commission_rate;
            }
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

  const updateAgencyCommission = useCallback(async () => {
    if (!commissionEdit.agency || !isAdmin) return;

    const commissionValue = parseFloat(commissionEdit.newCommission);
    if (isNaN(commissionValue) || commissionValue <= 0 || commissionValue > 10) {
      toast.error('Commission rate must be between 0% and 10%.');
      return;
    }

    setIsUpdatingCommission(true);
    try {
      const { error } = await supabase
        .from('properties')
        .update({ commission: commissionValue })
        .eq('agency_name', commissionEdit.agency);

      if (error) throw error;

      const { data: propertiesData, error: propertiesError } = await supabase
        .from('properties')
        .select('id, agency_name, property_type, commission, price, sold_price, suburb, street_name, street_number, agent_name, postcode, category, listed_date, sale_type, expected_price, features, flood_risk, bushfire_risk, contract_status, same_street_sales, past_records, sold_date');

      const { data: agentCommissionsData, error: agentCommissionsError } = await supabase
        .from('agent_commissions')
        .select('id, property_id, agent_name, commission_rate');

      if (propertiesError || agentCommissionsError) throw propertiesError || agentCommissionsError;

      const fetchedProperties = (propertiesData as PropertyDetails[]) || [];
      const fetchedAgentCommissions = (agentCommissionsData as AgentCommission[]) || [];

      setInternalProperties(fetchedProperties);
      setAgentCommissions(fetchedAgentCommissions);

      const newCommissionMap: Record<string, Record<string, number>> = {};
      const newAgentMap: Record<string, { commission: number; listed: number; sold: number; commissionRate?: number }> = {};

      fetchedProperties.forEach((property) => {
        const agency = normalizeAgencyName(property.agency_name);
        const agent = normalizeAgentName(property.agent_name);
        const propertyType = property.property_type || 'Unknown';
        const { commissionEarned, commissionRate } = calculateCommission(property, fetchedAgentCommissions);
        const isSold = property.contract_status === 'sold' || !!property.sold_date;

        if (agency && !isNaN(commissionEarned)) {
          newCommissionMap[agency] = newCommissionMap[agency] || {};
          newCommissionMap[agency][propertyType] = (newCommissionMap[agency][propertyType] || 0) + commissionEarned;
        }

        if (agent) {
          newAgentMap[agent] = newAgentMap[agent] || { commission: 0, listed: 0, sold: 0, commissionRate: undefined };
          newAgentMap[agent].listed += 1;
          newAgentMap[agent].sold += isSold ? 1 : 0;
          newAgentMap[agent].commission += isNaN(commissionEarned) ? 0 : commissionEarned;
          if (!newAgentMap[agent].commissionRate) {
            const agentPropertyCommission = fetchedAgentCommissions.find(
              (ac) => ac.property_id === property.id && ac.agent_name === agent
            );
            newAgentMap[agent].commissionRate = agentPropertyCommission?.commission_rate;
          }
        }
      });

      setInternalCommissionData(newCommissionMap);
      setInternalAgentData(newAgentMap);
      toast.success(`Commission rate for ${commissionEdit.agency} updated to ${commissionValue}%.`);
      setCommissionEdit({ isOpen: false, agency: null, newCommission: '' });
    } catch (error: any) {
      console.error('Error updating commission:', error);
      toast.error(error.message || 'Failed to update commission rate.');
    } finally {
      setIsUpdatingCommission(false);
    }
  }, [commissionEdit, isAdmin]);

  const updateAgentCommission = useCallback(async () => {
    if (!agentCommissionEdit.agency || !agentCommissionEdit.agent || !isAdmin) return;

    const commissionValue = parseFloat(agentCommissionEdit.newCommission);
    if (isNaN(commissionValue) || commissionValue <= 0 || commissionValue > 10) {
      toast.error('Commission rate must be between 0% and 10%.');
      return;
    }

    setIsUpdatingAgentCommission(true);
    try {
      const properties = internalProperties.filter(
        (p) => normalizeAgencyName(p.agency_name) === agentCommissionEdit.agency && normalizeAgentName(p.agent_name) === agentCommissionEdit.agent
      );

      for (const property of properties) {
        const existingCommission = agentCommissions.find(
          (ac) => ac.property_id === property.id && ac.agent_name === agentCommissionEdit.agent
        );

        if (existingCommission) {
          const { error } = await supabase
            .from('agent_commissions')
            .update({ commission_rate: commissionValue })
            .eq('id', existingCommission.id);

          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('agent_commissions')
            .insert({
              property_id: property.id,
              agent_name: agentCommissionEdit.agent,
              commission_rate: commissionValue,
            });

          if (error) throw error;
        }
      }

      const { data: propertiesData, error: propertiesError } = await supabase
        .from('properties')
        .select('id, agency_name, property_type, commission, price, sold_price, suburb, street_name, street_number, agent_name, postcode, category, listed_date, sale_type, expected_price, features, flood_risk, bushfire_risk, contract_status, same_street_sales, past_records, sold_date');

      const { data: agentCommissionsData, error: agentCommissionsError } = await supabase
        .from('agent_commissions')
        .select('id, property_id, agent_name, commission_rate');

      if (propertiesError || agentCommissionsError) throw propertiesError || agentCommissionsError;

      const fetchedProperties = (propertiesData as PropertyDetails[]) || [];
      const fetchedAgentCommissions = (agentCommissionsData as AgentCommission[]) || [];

      setInternalProperties(fetchedProperties);
      setAgentCommissions(fetchedAgentCommissions);

      const newCommissionMap: Record<string, Record<string, number>> = {};
      const newAgentMap: Record<string, { commission: number; listed: number; sold: number; commissionRate?: number }> = {};

      fetchedProperties.forEach((property) => {
        const agency = normalizeAgencyName(property.agency_name);
        const agent = normalizeAgentName(property.agent_name);
        const propertyType = property.property_type || 'Unknown';
        const { commissionEarned, commissionRate } = calculateCommission(property, fetchedAgentCommissions);
        const isSold = property.contract_status === 'sold' || !!property.sold_date;

        if (agency && !isNaN(commissionEarned)) {
          newCommissionMap[agency] = newCommissionMap[agency] || {};
          newCommissionMap[agency][propertyType] = (newCommissionMap[agency][propertyType] || 0) + commissionEarned;
        }

        if (agent) {
          newAgentMap[agent] = newAgentMap[agent] || { commission: 0, listed: 0, sold: 0, commissionRate: undefined };
          newAgentMap[agent].listed += 1;
          newAgentMap[agent].sold += isSold ? 1 : 0;
          newAgentMap[agent].commission += isNaN(commissionEarned) ? 0 : commissionEarned;
          if (!newAgentMap[agent].commissionRate) {
            const agentPropertyCommission = fetchedAgentCommissions.find(
              (ac) => ac.property_id === property.id && ac.agent_name === agent
            );
            newAgentMap[agent].commissionRate = agentPropertyCommission?.commission_rate;
          }
        }
      });

      setInternalCommissionData(newCommissionMap);
      setInternalAgentData(newAgentMap);
      toast.success(`Commission rate for agent ${agentCommissionEdit.agent} in ${agentCommissionEdit.agency} updated to ${commissionValue}%.`);
      setAgentCommissionEdit({ isOpen: false, agency: null, agent: null, newCommission: '' });
    } catch (error: any) {
      console.error('Error updating agent commission:', error);
      toast.error(error.message || 'Failed to update agent commission rate.');
    } finally {
      setIsUpdatingAgentCommission(false);
    }
  }, [agentCommissionEdit, isAdmin, internalProperties, agentCommissions]);

  const calculateSummary = useCallback((): CommissionSummary => {
    let totalCommission = 0;
    let totalListedCommission = 0;
    let totalSoldCommission = 0;
    let totalProperties = 0;
    let totalListed = 0;
    let totalSold = 0;
    let topAgency = 'Unknown';
    let topAgencyCommissionRate = 0;
    let topAgencyTotalCommission = 0;
    let topAgencyPropertyCount = 0;
    let maxCommission = 0;
    let topAgent = { name: 'Unknown', commission: 0, propertyCount: 0 };
    const agencyPropertyCounts: Record<string, number> = {};
    const streetMap: Record<string, { listedCount: number; commission: number }> = {};
    const suburbMap: Record<string, {
      listedCommissionTotal: number;
      listedPropertyCount: number;
      soldCommissionTotal: number;
      soldPropertyCount: number;
      listedCommissionRates: number[];
      soldCommissionRates: number[];
    }> = {};

    if (!internalCommissionData || !internalProperties) {
      console.warn('Missing commission data or properties:', { internalCommissionData, internalProperties });
      return {
        totalCommission,
        totalListedCommission,
        totalSoldCommission,
        totalProperties,
        totalListed,
        totalSold,
        topAgency,
        topAgencyCommissionRate,
        topAgencyTotalCommission,
        topAgencyPropertyCount,
        topAgent,
        agencyPropertyCounts,
        topStreet: { street: 'None', listedCount: 0, commission: 0 },
        suburbCommissions: [],
      };
    }

    // Initialize agency property counts
    Object.keys(internalCommissionData).forEach((agency) => {
      agencyPropertyCounts[agency] = 0;
    });

    // Calculate commissions and property counts
    internalProperties.forEach((property) => {
      const agency = normalizeAgencyName(property.agency_name);
      const agent = normalizeAgentName(property.agent_name);
      const suburb = normalizeSuburbName(property.suburb);
      const { commissionEarned, commissionRate } = calculateCommission(property, agentCommissions);
      const street = `${property.street_name || 'Unknown'}, ${suburb}`;
      const isSold = property.contract_status === 'sold' || !!property.sold_date;

      if (agency && !isNaN(commissionEarned)) {
        agencyPropertyCounts[agency] = (agencyPropertyCounts[agency] || 0) + 1;
        totalProperties += 1;
        if (isSold) {
          totalSold += 1;
          totalSoldCommission += commissionEarned;
        } else {
          totalListed += 1;
          totalListedCommission += commissionEarned;
        }
        if (commissionEarned > 0) {
          totalCommission += commissionEarned;
          if (internalAgentData[agent]?.commission > topAgent.commission) {
            topAgent = { name: agent, commission: internalAgentData[agent].commission, propertyCount: internalAgentData[agent].listed };
          }
        }
      }

      if (suburb && !isNaN(commissionEarned)) {
        suburbMap[suburb] = suburbMap[suburb] || {
          listedCommissionTotal: 0,
          listedPropertyCount: 0,
          soldCommissionTotal: 0,
          soldPropertyCount: 0,
          listedCommissionRates: [],
          soldCommissionRates: [],
        };
        if (isSold) {
          suburbMap[suburb].soldCommissionTotal += commissionEarned;
          suburbMap[suburb].soldPropertyCount += 1;
          suburbMap[suburb].soldCommissionRates.push(commissionRate);
        } else {
          suburbMap[suburb].listedCommissionTotal += commissionEarned;
          suburbMap[suburb].listedPropertyCount += 1;
          suburbMap[suburb].listedCommissionRates.push(commissionRate);
        }
      }

      streetMap[street] = streetMap[street] || { listedCount: 0, commission: 0 };
      streetMap[street].listedCount += 1;
      streetMap[street].commission += isNaN(commissionEarned) ? 0 : commissionEarned;
    });

    // Calculate top agency
    Object.entries(internalCommissionData).forEach(([agency, types]) => {
      const agencyTotal = Object.values(types).reduce((sum, val) => sum + (isNaN(val) ? 0 : val), 0);
      const agencyProperties = internalProperties.filter((p) => normalizeAgencyName(p.agency_name) === agency);
      const propertyCount = agencyProperties.length;
      const validCommissions = agencyProperties
        .map((p) => p.commission)
        .filter((c): c is number => c !== undefined && c !== null && !isNaN(c));
      const commissionRate = validCommissions.length > 0 
        ? validCommissions.reduce((sum, c) => sum + c, 0) / validCommissions.length 
        : 0;

      if (agencyTotal > maxCommission && !isNaN(agencyTotal) && agencyTotal > 0) {
        maxCommission = agencyTotal;
        topAgency = agency;
        topAgencyTotalCommission = agencyTotal;
        topAgencyPropertyCount = propertyCount;
        topAgencyCommissionRate = commissionRate;
      }
    });

    const topStreet = Object.entries(streetMap).reduce(
      (max, [street, data]) => 
        data.listedCount > max.listedCount || 
        (data.listedCount === max.listedCount && data.commission > max.commission) 
          ? { street, ...data } 
          : max,
      { street: 'None', listedCount: 0, commission: 0 }
    );

    const suburbCommissions: SuburbCommission[] = Object.entries(suburbMap).map(([suburb, data]) => ({
      suburb,
      listedCommissionTotal: data.listedCommissionTotal,
      listedPropertyCount: data.listedPropertyCount,
      soldCommissionTotal: data.soldCommissionTotal,
      soldPropertyCount: data.soldPropertyCount,
      avgListedCommissionRate: data.listedCommissionRates.length > 0
        ? data.listedCommissionRates.reduce((sum, rate) => sum + rate, 0) / data.listedCommissionRates.length
        : 0,
      avgSoldCommissionRate: data.soldCommissionRates.length > 0
        ? data.soldCommissionRates.reduce((sum, rate) => sum + rate, 0) / data.soldCommissionRates.length
        : 0,
    }));

    return {
      totalCommission,
      totalListedCommission,
      totalSoldCommission,
      totalProperties,
      totalListed,
      totalSold,
      topAgency,
      topAgencyCommissionRate,
      topAgencyTotalCommission,
      topAgencyPropertyCount,
      topAgent,
      agencyPropertyCounts,
      topStreet,
      suburbCommissions,
    };
  }, [internalCommissionData, internalProperties, internalAgentData, agentCommissions]);

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
        const agentData = internalAgentData[agent] || { commission: 0, listed: 0, sold: 0, commissionRate: undefined };
        if (!agencyAgentsMap[agency].some((a) => a.name === agent)) {
          agencyAgentsMap[agency].push({
            name: agent,
            totalCommission: agentData.commission,
            propertiesListed: agentData.listed,
            propertiesSold: agentData.sold,
            commissionRate: agentData.commissionRate,
          });
        }
      }
    });

    return Object.entries(internalCommissionData)
      .map(([agency, types]) => {
        const properties = internalProperties.filter((p) => normalizeAgencyName(p.agency_name) === agency);
        const listedCommission = properties
          .filter((p) => !(p.contract_status === 'sold' || !!p.sold_date))
          .reduce((sum, p) => {
            const { commissionEarned } = calculateCommission(p, agentCommissions);
            return sum + (isNaN(commissionEarned) ? 0 : commissionEarned);
          }, 0);
        const soldCommission = properties
          .filter((p) => p.contract_status === 'sold' || !!p.sold_date)
          .reduce((sum, p) => {
            const { commissionEarned } = calculateCommission(p, agentCommissions);
            return sum + (isNaN(commissionEarned) ? 0 : commissionEarned);
          }, 0);
        const validCommissions = properties
          .map((p) => p.commission)
          .filter((c): c is number => c !== undefined && c !== null && !isNaN(c));
        const commissionRate = validCommissions.length > 0 
          ? validCommissions.reduce((sum, c) => sum + c, 0) / validCommissions.length 
          : 0;

        return {
          agency,
          totalCommission: Object.values(types).reduce((sum, val) => sum + (isNaN(val) ? 0 : val), 0),
          listedCommission,
          soldCommission,
          commissionRate,
          propertyCount: properties.length,
          listedCount: properties.filter((p) => !(p.contract_status === 'sold' || !!p.sold_date)).length,
          soldCount: properties.filter((p) => p.contract_status === 'sold' || !!p.sold_date).length,
          suburbs: Array.from(agencySuburbsMap[agency] || []),
          agents: agencyAgentsMap[agency] || [],
        };
      })
      .sort((a, b) => b.totalCommission - a.totalCommission);
  }, [internalCommissionData, internalProperties, internalAgentData, agentCommissions]);

  const ourAgency = useMemo(() => {
    const agency = agencyTotals.find((a) => a.agency.toLowerCase() === ourAgencyName.toLowerCase());
    if (!agency) {
      console.warn(`No data found for agency: ${ourAgencyName}`);
      return null;
    }
    return agency;
  }, [agencyTotals, ourAgencyName]);

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

  const topFiveSuburbs = useMemo(
    () => summary.suburbCommissions.slice(0, 5).map((row) => row.suburb),
    [summary.suburbCommissions]
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

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
        backgroundColor: (context: any) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 400);
          const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'];
          gradient.addColorStop(0, colors[index % 5]);
          gradient.addColorStop(1, colors[index % 5] + '80');
          return gradient;
        },
        borderColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'][index % 5],
        borderWidth: 2,
        hoverBackgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'][index % 5],
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
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleFont: { size: 14, family: 'Inter' },
        bodyFont: { size: 12, family: 'Inter' },
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
            const properties = agencyTotals.find(a => a.agency === agency)?.propertyCount || 0;
            const commissionRate = agencyTotals.find(a => a.agency === agency)?.commissionRate || 0;
            return [
              `Total: ${formatCurrency(total)}`,
              `Properties: ${properties}`,
              `Avg. Commission Rate: ${commissionRate.toFixed(2)}%`
            ];
          },
        },
      },
      datalabels: {
        display: (context) => context.dataset.data[context.dataIndex] > 0,
        formatter: (value: number) => formatCurrency(value),
        color: '#fff',
        font: { size: 10, family: 'Inter', weight: 'bold' },
        anchor: 'end',
        align: 'top',
        offset: 5,
      },
    },
    scales: {
      x: {
        stacked: true,
        ticks: { font: { size: 12, family: 'Inter' } },
        grid: { display: false },
      },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: {
          callback: (value) => formatCurrency(value as number),
          font: { size: 12, family: 'Inter' },
        },
        title: { display: true, text: 'Commission (AUD)', font: { size: 14, family: 'Inter' } },
        grid: { color: 'rgba(0, 0, 0, 0.1)' },
      },
    },
    animation: {
      duration: 1500,
      easing: 'easeOutQuart',
    },
    maintainAspectRatio: false,
    responsive: true,
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
            return `${agent}: ${formatCurrency(value)}\nListed: ${agentData?.listed || 0}, Sold: ${agentData?.sold || 0}\nCommission Rate: ${agentData?.commissionRate ? `${agentData.commissionRate}%` : 'Agency Default'}`;
          },
        },
      },
    },
  };

  const suburbChartData = useMemo(
    () => ({
      labels: topFiveSuburbs,
      datasets: [
        {
          label: 'Avg Listed Commission',
          data: topFiveSuburbs.map((suburb) => {
            const data = summary.suburbCommissions.find((s) => s.suburb === suburb);
            return data ? data.listedCommissionTotal / (data.listedPropertyCount || 1) : 0;
          }),
          backgroundColor: 'rgba(54, 162, 235, 0.8)',
          borderColor: '#36A2EB',
          borderWidth: 2,
        },
        {
          label: 'Avg Sold Commission',
          data: topFiveSuburbs.map((suburb) => {
            const data = summary.suburbCommissions.find((s) => s.suburb === suburb);
            return data ? data.soldCommissionTotal / (data.soldPropertyCount || 1) : 0;
          }),
          backgroundColor: 'rgba(255, 99, 132, 0.8)',
          borderColor: '#FF6384',
          borderWidth: 2,
        },
      ],
    }),
    [topFiveSuburbs, summary.suburbCommissions]
  );

  const suburbChartOptions: ChartOptions<'bar'> = {
    plugins: {
      legend: { position: 'top', labels: { font: { size: 14, family: 'Inter' } } },
      title: { display: true, text: 'Average Commission by Suburb', font: { size: 18, weight: 'bold', family: 'Inter' } },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleFont: { size: 14, family: 'Inter' },
        bodyFont: { size: 12, family: 'Inter' },
        callbacks: {
          label: (context) => {
            const value = context.parsed.y;
            const suburb = context.label;
            const label = context.dataset.label;
            const data = summary.suburbCommissions.find((s) => s.suburb === suburb);
            return `${label} in ${suburb}: ${formatCurrency(value)}\nProperties: ${label.includes('Listed') ? data?.listedPropertyCount || 0 : data?.soldPropertyCount || 0}\nAvg Rate: ${(label.includes('Listed') ? data?.avgListedCommissionRate : data?.avgSoldCommissionRate)?.toFixed(2) || 0}%`;
          },
        },
      },
      datalabels: {
        display: (context) => context.dataset.data[context.dataIndex] > 0,
        formatter: (value: number) => formatCurrency(value),
        color: '#fff',
        font: { size: 10, family: 'Inter', weight: 'bold' },
        anchor: 'end',
        align: 'top',
        offset: 5,
      },
    },
    scales: {
      x: {
        ticks: { font: { size: 12, family: 'Inter' } },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => formatCurrency(value as number),
          font: { size: 12, family: 'Inter' },
        },
        title: { display: true, text: 'Average Commission (AUD)', font: { size: 14, family: 'Inter' } },
        grid: { color: 'rgba(0, 0, 0, 0.1)' },
      },
    },
    animation: {
      duration: 1500,
      easing: 'easeOutQuart',
    },
    maintainAspectRatio: false,
    responsive: true,
  };

  interface JsPDFWithAutoTable extends jsPDF {
    autoTable: (content: { head: string[][]; body: string[][] }, options?: any) => void;
    lastAutoTable: { finalY: number };
  }

  const exportCommissionPDF = () => {
    const doc = new jsPDF() as JsPDFWithAutoTable;
    doc.setFont('Inter', 'normal');
    doc.setFontSize(20);
    doc.setTextColor(79, 70, 229);
    doc.text('Commission Performance Report', 20, 20);
    doc.setFontSize(12);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, 30);
    doc.setFontSize(10);
    doc.text('Harcourts Success', 20, 38);

    doc.autoTable({
      head: [['Metric', 'Value']],
      body: [
        ['Total Commission', formatCurrency(summary.totalCommission)],
        ['Listed Commission', formatCurrency(summary.totalListedCommission)],
        ['Sold Commission', formatCurrency(summary.totalSoldCommission)],
        ['Total Properties', summary.totalProperties.toString()],
        ['Properties Listed', summary.totalListed.toString()],
        ['Properties Sold', summary.totalSold.toString()],
        ['Top Agency', `${summary.topAgency} (${formatCurrency(summary.topAgencyTotalCommission)}, ${summary.topAgencyCommissionRate.toFixed(2)}%, ${summary.topAgencyPropertyCount} properties)`],
        ['Top Agent', `${summary.topAgent.name} (${formatCurrency(summary.topAgent.commission)})`],
        ['Most Active Street', `${summary.topStreet.street} (${summary.topStreet.listedCount} listed, ${formatCurrency(summary.topStreet.commission)})`],
        ['Our Agency', `${ourAgencyName} (${formatCurrency(ourAgency?.totalCommission || 0)}, ${ourAgency?.commissionRate.toFixed(2) || 0}%, ${ourAgency?.propertyCount || 0} properties)`],
        ['Our Agent', ourAgent ? `${ourAgentName} (${formatCurrency(ourAgent.totalCommission || 0)})` : 'N/A'],
      ],
      startY: 50,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], font: 'Inter' },
      bodyStyles: { fontSize: 10, font: 'Inter' },
    });

    doc.autoTable({
      head: [['Agency', 'Commission Rate', 'Total Commission', 'Listed Commission', 'Sold Commission', 'Total Properties', 'Listed', 'Sold', 'Suburbs']],
      body: agencyTotals.map((row) => [
        row.agency,
        `${row.commissionRate.toFixed(2)}%`,
        formatCurrency(row.totalCommission),
        formatCurrency(row.listedCommission),
        formatCurrency(row.soldCommission),
        row.propertyCount.toString(),
        row.listedCount.toString(),
        row.soldCount.toString(),
        row.suburbs.join(', ') || 'None',
      ]),
      startY: doc.lastAutoTable.finalY + 20,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], font: 'Inter' },
      bodyStyles: { fontSize: 10, font: 'Inter' },
    });

    doc.autoTable({
      head: [['Agent', 'Commission Rate', 'Total Commission', 'Properties Listed', 'Properties Sold', 'Our Agent']],
      body: Object.entries(internalAgentData).map(([name, data]) => [
        name,
        data.commissionRate ? `${data.commissionRate.toFixed(2)}%` : 'Agency Default',
        formatCurrency(data.commission),
        data.listed.toString(),
        data.sold.toString(),
        name === ourAgentName && agencyTotals.some((a) => a.agency === ourAgencyName && a.agents.some((ag) => ag.name === name)) ? 'Yes' : 'No',
      ]),
      startY: doc.lastAutoTable.finalY + 20,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], font: 'Inter' },
      bodyStyles: { fontSize: 10, font: 'Inter' },
    });

    doc.autoTable({
      head: [['Suburb', 'Avg Listed Commission Rate', 'Listed Commission', 'Listed Properties', 'Avg Sold Commission Rate', 'Sold Commission', 'Sold Properties']],
      body: summary.suburbCommissions.map((row) => [
        row.suburb,
        `${row.avgListedCommissionRate.toFixed(2)}%`,
        formatCurrency(row.listedCommissionTotal),
        row.listedPropertyCount.toString(),
        `${row.avgSoldCommissionRate.toFixed(2)}%`,
        formatCurrency(row.soldCommissionTotal),
        row.soldPropertyCount.toString(),
      ]),
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
      [`Generated on: ${new Date().toLocaleString()}`, '', '', '', '', '', '', ''],
      ['Harcourts Success'],
      [],
      ['Summary'],
      ['Metric', 'Value'],
      ['Total Commission', formatCurrency(summary.totalCommission)],
      ['Listed Commission', formatCurrency(summary.totalListedCommission)],
      ['Sold Commission', formatCurrency(summary.totalSoldCommission)],
      ['Total Properties', summary.totalProperties.toString()],
      ['Properties Listed', summary.totalListed.toString()],
      ['Properties Sold', summary.totalSold.toString()],
      ['Top Agency', `${summary.topAgency} (${formatCurrency(summary.topAgencyTotalCommission)}, ${summary.topAgencyCommissionRate.toFixed(2)}%, ${summary.topAgencyPropertyCount} properties)`],
      ['Top Agent', `${summary.topAgent.name} (${formatCurrency(summary.topAgent.commission)})`],
      ['Most Active Street', `${summary.topStreet.street} (${summary.topStreet.listedCount} listed, ${formatCurrency(summary.topStreet.commission)})`],
      ['Our Agency', `${ourAgencyName} (${formatCurrency(ourAgency?.totalCommission || 0)}, ${ourAgency?.commissionRate.toFixed(2) || 0}%, ${ourAgency?.propertyCount || 0} properties)`],
      ['Our Agent', ourAgent ? `${ourAgentName} (${formatCurrency(ourAgent.totalCommission || 0)})` : 'N/A'],
      [],
      ['Agency Totals'],
      ['Agency', 'Commission Rate', 'Total Commission', 'Listed Commission', 'Sold Commission', 'Total Properties', 'Listed', 'Sold', 'Suburbs'],
      ...agencyTotals.map((row) => [
        row.agency,
        `${row.commissionRate.toFixed(2)}%`,
        formatCurrency(row.totalCommission),
        formatCurrency(row.listedCommission),
        formatCurrency(row.soldCommission),
        row.propertyCount.toString(),
        row.listedCount.toString(),
        row.soldCount.toString(),
        row.suburbs.join(', ') || 'None',
      ]),
      [],
      ['Agent Totals'],
      ['Agent', 'Commission Rate', 'Total Commission', 'Properties Listed', 'Properties Sold', 'Our Agent'],
      ...Object.entries(internalAgentData).map(([name, data]) => [
        name,
        data.commissionRate ? `${data.commissionRate.toFixed(2)}%` : 'Agency Default',
        formatCurrency(data.commission),
        data.listed.toString(),
        data.sold.toString(),
        name === ourAgentName && agencyTotals.some((a) => a.agency === ourAgencyName && a.agents.some((ag) => ag.name === name)) ? 'Yes' : 'No',
      ]),
      [],
      ['Suburb Totals'],
      ['Suburb', 'Avg Listed Commission Rate', 'Listed Commission', 'Listed Properties', 'Avg Sold Commission Rate', 'Sold Commission', 'Sold Properties'],
      ...summary.suburbCommissions.map((row) => [
        row.suburb,
        `${row.avgListedCommissionRate.toFixed(2)}%`,
        formatCurrency(row.listedCommissionTotal),
        row.listedPropertyCount.toString(),
        `${row.avgSoldCommissionRate.toFixed(2)}%`,
        formatCurrency(row.soldCommissionTotal),
        row.soldPropertyCount.toString(),
      ]),
    ];

    const ws = utils.array_to_sheet(data);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Commission Report');
    writeFile(wb, 'commission_report.csv');
    toast.success('Commission report exported as CSV');
  };

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
      filtered = filtered.filter((row) => normalizeAgencyName(row.agency).toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter((row) => {
        const properties = internalProperties.filter((p) => normalizeAgencyName(p.agency_name) === row.agency);
        return properties.some((p) => (statusFilter === 'sold' ? p.contract_status === 'sold' || !!p.sold_date : !(p.contract_status === 'sold' || !!p.sold_date)));
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

  const filteredSuburbCommissions = useMemo(() => {
    let filtered = summary.suburbCommissions;
    if (searchQuery) {
      filtered = filtered.filter((row) => row.suburb.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter((row) => {
        const properties = internalProperties.filter((p) => normalizeSuburbName(p.suburb) === row.suburb);
        return properties.some((p) => (statusFilter === 'sold' ? p.contract_status === 'sold' || !!p.sold_date : !(p.contract_status === 'sold' || !!p.sold_date)));
      });
    }
    if (dateRange !== 'all') {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - (dateRange === 'last30' ? 30 : 90));
      filtered = filtered.filter((row) => {
        const properties = internalProperties.filter((p) => normalizeSuburbName(p.suburb) === row.suburb);
        return properties.some((p) => (p.listed_date ? new Date(p.listed_date) >= cutoffDate : false));
      });
    }
    return filtered;
  }, [summary.suburbCommissions, searchQuery, statusFilter, dateRange, internalProperties]);

  const paginatedFilteredAgencyTotals = filteredAgencyTotals.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const paginatedFilteredSuburbCommissions = filteredSuburbCommissions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const filteredTotalPages = Math.max(
    Math.ceil(filteredAgencyTotals.length / itemsPerPage),
    Math.ceil(filteredSuburbCommissions.length / itemsPerPage)
  );

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

  if (fetchError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-10 bg-white rounded-xl shadow-lg">
          <p className="text-red-600 text-lg font-semibold">Error: {fetchError}</p>
          <button
            onClick={() => {
              setIsLoading(true);
              setFetchError(null);
              const fetchCommissionData = async () => {
                try {
                  const { data: propertiesData, error: propertiesError } = await supabase.from('properties').select('*');
                  const { data: agentCommissionsData, error: agentCommissionsError } = await supabase.from('agent_commissions').select('*');
                  if (propertiesError || agentCommissionsError) throw propertiesError || agentCommissionsError;
                  setInternalProperties(propertiesData as PropertyDetails[]);
                  setAgentCommissions(agentCommissionsData as AgentCommission[]);
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
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-800">Commission Dashboard</h1>
          <motion.button
            onClick={() => navigate('/reports')}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-all"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Commission Management
          </motion.button>
        </div>

        <motion.div
          className="bg-white p-4 rounded-xl shadow-lg flex flex-col sm:flex-row gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="relative w-full sm:w-64 group">
            <input
              type="text"
              placeholder="Search agencies or suburbs..."
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
            <div className="absolute hidden group-hover:block bg-gray-800 text-white text-xs rounded p-2 mt-2">Search by agency or suburb name</div>
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

        <CollapsibleSection
          title="Performance Summary"
          isOpen={openSections.summary}
          toggleOpen={() => setOpenSections({ ...openSections, summary: !openSections.summary })}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-4 bg-indigo-50 rounded-lg">
              <p className="text-sm text-gray-600">Total Commission</p>
              <p className="text-2xl font-semibold text-indigo-600">{formatCurrency(summary.totalCommission)}</p>
            </div>
            <div className="p-4 bg-indigo-50 rounded-lg">
              <p className="text-sm text-gray-600">Listed Commission</p>
              <p className="text-2xl font-semibold text-indigo-600">{formatCurrency(summary.totalListedCommission)}</p>
            </div>
            <div className="p-4 bg-indigo-50 rounded-lg">
              <p className="text-sm text-gray-600">Sold Commission</p>
              <p className="text-2xl font-semibold text-indigo-600">{formatCurrency(summary.totalSoldCommission)}</p>
            </div>
            <div className="p-4 bg-indigo-50 rounded-lg">
              <p className="text-sm text-gray-600">Total Properties</p>
              <p className="text-2xl font-semibold text-indigo-600">{summary.totalProperties}</p>
            </div>
            <div className="p-4 bg-indigo-50 rounded-lg">
              <p className="text-sm text-gray-600">Properties Listed</p>
              <p className="text-2xl font-semibold text-indigo-600">{summary.totalListed}</p>
            </div>
            <div className="p-4 bg-indigo-50 rounded-lg">
              <p className="text-sm text-gray-600">Properties Sold</p>
              <p className="text-2xl font-semibold text-indigo-600">{summary.totalSold}</p>
            </div>
            <div className="p-4 bg-indigo-50 rounded-lg">
              <p className="text-sm text-gray-600">Top Agency</p>
              <p className="text-lg font-semibold text-indigo-600 flex items-center">
                {summary.topAgency} ({formatCurrency(summary.topAgencyTotalCommission)}),( {summary.topAgencyCommissionRate.toFixed(2)}%), ({summary.topAgencyPropertyCount} properties)
                {summary.topAgency === ourAgencyName && <Star className="w-4 h-4 ml-2 text-yellow-400" />}
              </p>
            </div>
            <div className="p-4 bg-indigo-50 rounded-lg">
              <p className="text-sm text-gray-600">Top Agent</p>
              <p className="text-lg font-semibold text-indigo-600 flex items-center">
                {summary.topAgent.name} ({formatCurrency(summary.topAgent.commission)}),( {summary.topAgent.propertyCount} properties)
                {summary.topAgent.name === ourAgentName && <Star className="w-4 h-4 ml-2 text-yellow-400" />}
              </p>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Our Performance (Harcourts Success)"
          isOpen={openSections.ourPerformance}
          toggleOpen={() => setOpenSections({ ...openSections, ourPerformance: !openSections.ourPerformance })}
        >
          {ourAgency ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <motion.div
                  className="p-4 bg-indigo-50 rounded-lg shadow-sm"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <p className="text-sm text-gray-600">Total Commission</p>
                  <p className="text-2xl font-semibold text-indigo-600">{formatCurrency(ourAgency.totalCommission)}</p>
                </motion.div>
                <motion.div
                  className="p-4 bg-indigo-50 rounded-lg shadow-sm"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                >
                  <p className="text-sm text-gray-600">Listed Commission</p>
                  <p className="text-2xl font-semibold text-indigo-600">{formatCurrency(ourAgency.listedCommission)}</p>
                </motion.div>
                <motion.div
                  className="p-4 bg-indigo-50 rounded-lg shadow-sm"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                >
                  <p className="text-sm text-gray-600">Sold Commission</p>
                  <p className="text-2xl font-semibold text-indigo-600">{formatCurrency(ourAgency.soldCommission)}</p>
                </motion.div>
                <motion.div
                  className="p-4 bg-indigo-50 rounded-lg shadow-sm"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.3 }}
                >
                  <p className="text-sm text-gray-600">Commission Rate</p>
                  <p className="text-2xl font-semibold text-indigo-600">{ourAgency.commissionRate.toFixed(2)}%</p>
                </motion.div>
                <motion.div
                  className="p-4 bg-indigo-50 rounded-lg shadow-sm"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.4 }}
                >
                  <p className="text-sm text-gray-600">Properties Listed</p>
                  <p className="text-2xl font-semibold text-indigo-600">{ourAgency.listedCount}</p>
                </motion.div>
                <motion.div
                  className="p-4 bg-indigo-50 rounded-lg shadow-sm"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.5 }}
                >
                  <p className="text-sm text-gray-600">Properties Sold</p>
                  <p className="text-2xl font-semibold text-indigo-600">{ourAgency.soldCount}</p>
                </motion.div>
              </div>
              {ourAgent && (
                <motion.div
                  className="p-4 bg-yellow-50 rounded-lg shadow-sm"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <p className="text-sm text-gray-600">Agent Name</p>
                  <p className="text-lg font-semibold text-indigo-600 flex items-center">
                    {ourAgentName}
                    <Star className="w-4 h-4 ml-2 text-yellow-400" />
                  </p>
                  <p className="text-sm text-gray-600 mt-2">Performance</p>
                  <p className="text-lg font-semibold text-indigo-600">
                    Commission: {formatCurrency(ourAgent.totalCommission || 0)}, Listed: {ourAgent.propertiesListed}, Sold: {ourAgent.propertiesSold}
                    {ourAgent.commissionRate ? `, Commission Rate: ${ourAgent.commissionRate.toFixed(2)}%` : ''}
                  </p>
                </motion.div>
              )}
              <div className="p-4 bg-indigo-50 rounded-lg">
                <p className="text-sm text-gray-600">Active Suburbs</p>
                <p className="text-lg font-semibold text-indigo-600">{ourAgency.suburbs.join(', ') || 'None'}</p>
              </div>
              <ProgressBar
                value={ourAgency.totalCommission}
                label="Commission vs. Top Agency"
                maxValue={Math.max(...agencyTotals.map((a) => a.totalCommission), 1)}
              />
              <ProgressBar
                value={ourAgency.soldCount}
                label="Sales vs. Top Agency"
                maxValue={Math.max(...agencyTotals.map((a) => a.soldCount), 1)}
              />
              <ProgressBar
                value={ourAgency.listedCount}
                label="Listings vs. Top Agency"
                maxValue={Math.max(...agencyTotals.map((a) => a.listedCount), 1)}
              />
            </div>
          ) : (
            <div className="p-4 bg-red-50 rounded-lg">
              <p className="text-gray-600 font-semibold">No data available for Harcourts Success.</p>
              <p className="text-sm text-gray-500">Please verify the data in the properties table or contact support.</p>
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Agency Comparison"
          isOpen={openSections.agencies}
          toggleOpen={() => setOpenSections({ ...openSections, agencies: !openSections.agencies })}
        >
          <div className="relative h-[400px]">
            <Bar data={agencyChartData} options={agencyChartOptions} />
          </div>
          <table className="min-w-full divide-y divide-gray-200 mt-6">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agency</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Commission Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Commission</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Listed Commission</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sold Commission</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Properties</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Listed</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sold</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Suburbs</th>
                {isAdmin && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                )}
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.commissionRate.toFixed(2)}%</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(row.totalCommission)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(row.listedCommission)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(row.soldCommission)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.propertyCount}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.listedCount}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.soldCount}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{row.suburbs.join(', ') || 'None'}</td>
                    {isAdmin && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <motion.button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCommissionEdit({ isOpen: true, agency: row.agency, newCommission: '' });
                          }}
                          className="flex items-center px-3 py-1 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 text-sm"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Pencil className="w-4 h-4 mr-1" />
                          Edit Commission
                        </motion.button>
                      </td>
                    )}
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
              {filteredTotalPages <= 3 ? (
                Array.from({ length: filteredTotalPages }, (_, i) => i + 1).map((page) => (
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
                ))
              ) : (
                <>
                  {[1, 2, 3].map((page) => (
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
                </>
              )}
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
        </CollapsibleSection>

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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Commission Rate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Commission</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Properties Listed</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Properties Sold</th>
                  {isAdmin && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  )}
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
                      className={`hover:bg-indigo-50 transition-all ${
                        agent.name === ourAgentName && selectedAgency === ourAgencyName ? 'bg-indigo-100' : ''
                      }`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 flex items-center">
                        {agent.name}
                        {agent.name === ourAgentName && selectedAgency === ourAgencyName && <Star className="w-4 h-4 ml-2 text-yellow-400" />}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {agent.commissionRate ? `${agent.commissionRate.toFixed(2)}%` : 'Agency Default'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(agent.commission)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{agent.listed}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{agent.sold}</td>
                      {isAdmin && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <motion.button
                            onClick={(e) => {
                              e.stopPropagation();
                              setAgentCommissionEdit({
                                isOpen: true,
                                agency: selectedAgency,
                                agent: agent.name,
                                newCommission: '',
                              });
                            }}
                            className="flex items-center px-3 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <Pencil className="w-4 h-4 mr-1" />
                            Assign Commission
                          </motion.button>
                        </td>
                      )}
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

        {commissionEdit.isOpen && isAdmin && (
          <motion.div
            className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Edit Commission for {commissionEdit.agency}</h3>
                <button
                  onClick={() => setCommissionEdit({ isOpen: false, agency: null, newCommission: '' })}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  updateAgencyCommission();
                }}
              >
                <div className="mb-4">
                  <label htmlFor="commission" className="block text-sm font-medium text-gray-700">
                    New Commission Rate (%)
                  </label>
                  <input
                    type="number"
                    id="commission"
                    value={commissionEdit.newCommission}
                    onChange={(e) => setCommissionEdit({ ...commissionEdit, newCommission: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray--300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                    placeholder="e.g., 2.5"
                    step="0.1"
                    min="0"
                    max="10"
                    required
                  />
                  <p className="mt-1 text-sm text-gray-500">Enter a commission rate between 0% and 10%.</p>
                </div>
                <div className="flex justify-end space-x-2">
                  <motion.button
                    type="button"
                    onClick={() => setCommissionEdit({ isOpen: false, agency: null, newCommission: '' })}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    type="submit"
                    disabled={isUpdatingCommission}
                    className={`px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 ${
                      isUpdatingCommission ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    whileHover={{ scale: isUpdatingCommission ? 1 : 1.05 }}
                    whileTap={{ scale: isUpdatingCommission ? 1 : 0.95 }}
                  >
                    {isUpdatingCommission ? 'Saving...' : 'Save'}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {agentCommissionEdit.isOpen && isAdmin && (
          <motion.div
            className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800">
                  Assign Commission for {agentCommissionEdit.agent} in {agentCommissionEdit.agency}
                </h3>
                <button
                  onClick={() => setAgentCommissionEdit({ isOpen: false, agency: null, agent: null, newCommission: '' })}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  updateAgentCommission();
                }}
              >
                <div className="mb-4">
                  <label htmlFor="agent-commission" className="block text-sm font-medium text-gray-700">
                    New Commission Rate (%)
                  </label>
                  <input
                    type="number"
                    id="agent-commission"
                    value={agentCommissionEdit.newCommission}
                    onChange={(e) => setAgentCommissionEdit({ ...agentCommissionEdit, newCommission: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                    placeholder="e.g., 2.5"
                    step="0.1"
                    min="0"
                    max="10"
                    required
                  />
                  <p className="mt-1 text-sm text-gray-500">Enter a commission rate between 0% and 10%.</p>
                </div>
                <div className="flex justify-end space-x-2">
                  <motion.button
                    type="button"
                    onClick={() => setAgentCommissionEdit({ isOpen: false, agency: null, agent: null, newCommission: '' })}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    type="submit"
                    disabled={isUpdatingAgentCommission}
                    className={`px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 ${
                      isUpdatingAgentCommission ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    whileHover={{ scale: isUpdatingAgentCommission ? 1 : 1.05 }}
                    whileTap={{ scale: isUpdatingAgentCommission ? 1 : 0.95 }}
                  >
                    {isUpdatingAgentCommission ? 'Saving...' : 'Save'}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        <div className="flex justify-end space-x-4">
          <motion.button
            onClick={exportCommissionPDF}
            className="flex items-center px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </motion.button>
          <motion.button
            onClick={exportCommissionCSV}
            className="flex items-center px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Download className="w-4 h-4 mr-2" />
            Download CSV
          </motion.button>
        </div>
      </div>
    </div>
  );
}

export default CommissionByAgency;