import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  ChartOptions,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { motion } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { debounce } from 'lodash';
import { BarChart, ChevronDown, Download, Filter, Gauge, Loader2, RefreshCcw } from 'lucide-react';
import moment from 'moment';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { ErrorBoundary } from 'react-error-boundary';
import { useLocation, useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { AgentPropertyMap } from './AgentPropertyMap';
import { CommissionByAgency } from './CommissionByAgency';
import { EditModal } from './EditModal';
import {
  formatCurrency,
  formatArray,
  formatDate,
  calculateCommission,
  normalizeSuburb,
  predictFutureAvgPriceBySuburb,
  selectStyles,
  generateHeatmapData,
  generatePriceTrendsData,
  generatePropertyMetrics,
} from '../reportsUtils.ts';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  ChartDataLabels
);

// Interfaces
interface User {
  id: string;
  email?: string;
}

interface UserProfile {
  name: string;
  role: 'user' | 'agent' | 'admin';
}

export interface PropertyDetails {
  id: string;
  street_name: string;
  street_number: string;
  agent_name: string;
  suburb: string;
  postcode: string;
  price: number;
  sold_price?: number;
  category: string;
  property_type: string;
  agency_name?: string;
  commission?: number;
  commission_earned?: number;
  expected_price?: number;
  sale_type?: string;
  bedrooms?: number;
  bathrooms?: number;
  car_garage?: number;
  sqm?: number;
  landsize?: number;
  listed_date?: string;
  sold_date?: string;
  flood_risk?: string;
  bushfire_risk?: string;
  contract_status?: string;
  features?: string[];
  same_street_sales?: Array<{
    address: string;
    sale_price: number;
    property_type: string;
    sale_date: string;
  }>;
  past_records?: Array<{
    suburb: string;
    postcode: string;
    property_type: string;
    price: number;
    bedrooms: number;
    bathrooms: number;
    car_garage: number;
    sqm: number;
    landsize: number;
    listing_date?: string;
    sale_date?: string;
    status?: 'Sold' | 'Listed' | 'Withdrawn';
    notes?: string;
  }>;
}

export interface PropertyMetrics {
  listingsBySuburb: Record<string, { listed: number; sold: number }>;
  listingsByStreetName: Record<string, { listed: number; sold: number }>;
  listingsByStreetNumber: Record<string, { listed: number; sold: number }>;
  listingsByAgent: Record<string, { listed: number; sold: number }>;
  listingsByAgency: Record<string, { listed: number; sold: number }>;
  avgSalePriceBySuburb: Record<string, number>;
  avgSalePriceByStreetName: Record<string, number>;
  avgSalePriceByStreetNumber: Record<string, number>;
  avgSalePriceByAgent: Record<string, number>;
  avgSalePriceByAgency: Record<string, number>;
  predictedAvgPriceBySuburb: Record<string, number>;
  predictedConfidenceBySuburb: Record<string, { lower: number; upper: number }>;
  priceTrendsBySuburb: Record<string, Record<string, number>>;
  commissionByAgency: Record<string, Record<string, number>>;
  propertyDetails: PropertyDetails[];
  totalListings: number;
  totalSales: number;
  overallAvgSalePrice: number;
}

interface Filters {
  suburbs: string[];
  streetNames: string[];
  streetNumbers: string[];
  agents: string[];
  agency_names: string[];
}

const ITEMS_PER_PAGE = 10;

const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => (
  <div className="text-red-600 p-4" role="alert">
    <p>Error: {error.message}</p>
    <button
      onClick={resetErrorBoundary}
      className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      aria-label="Reload page"
    >
      Try Again
    </button>
  </div>
);

export function Reports() {
  const [properties, setProperties] = useState<PropertyDetails[]>([]);
  const [filteredProperties, setFilteredProperties] = useState<PropertyDetails[]>([]);
  const [propertyMetrics, setPropertyMetrics] = useState<PropertyMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    suburbs: [],
    streetNames: [],
    streetNumbers: [],
    agents: [],
    agency_names: [],
  });
  const [manualInputs, setManualInputs] = useState({
    suburbs: '',
    streetNames: '',
    streetNumbers: '',
    agents: '',
    agency_names: '',
  });
  const [filterSuggestions, setFilterSuggestions] = useState({
    suburbs: [] as string[],
    streetNames: [] as string[],
    streetNumbers: [] as string[],
    agents: [] as string[],
    agency_names: [] as string[],
  });
  const [expandedFilters, setExpandedFilters] = useState({
    suburbs: false,
    streetNames: false,
    streetNumbers: false,
    agents: false,
    agency_names: false,
  });
  const [filterPreviewCount, setFilterPreviewCount] = useState(0);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<PropertyDetails | null>(null);
  const [selectedMapProperty, setSelectedMapProperty] = useState<PropertyDetails | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const location = useLocation();
  const userProperty = location.state?.liveData as PropertyDetails | undefined;
  const { user } = useAuthStore((state) => ({
    user: state.user as User | null,
  }));
  const propertiesTableRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    console.log('Clearing localStorage reportFilters and resetting filters on mount');
    localStorage.removeItem('reportFilters');
    setFilters({ suburbs: [], streetNames: [], streetNumbers: [], agents: [], agency_names: [] });
  }, []);

  const updateFilterSuggestions = useMemo(() => {
    return (data: PropertyDetails[]) => {
      const uniqueSuburbs = [...new Set(data.map((p) => normalizeSuburb(p.suburb)).filter(Boolean))].sort();
      const newSuggestions = {
        suburbs: uniqueSuburbs,
        streetNames: [...new Set(data.map((p) => p.street_name || '').filter(Boolean))].sort(),
        streetNumbers: [...new Set(data.map((p) => p.street_number || '').filter(Boolean))].sort(),
        agents: [...new Set(data.map((p) => p.agent_name || '').filter(Boolean))].sort(),
        agency_names: [...new Set(data.map((p) => p.agency_name || 'UNKNOWN').filter(Boolean))].sort(),
      };
      console.log('Updated filter suggestions:', newSuggestions);
      setFilterSuggestions(newSuggestions);
    };
  }, []);

  useEffect(() => {
    setFilteredProperties(properties);
    updateFilterSuggestions(properties);
  }, [properties, updateFilterSuggestions]);

  useEffect(() => {
    if (user) {
      console.log('User authenticated, fetching data:', user);
      fetchData();
      const subscription = supabase
        .channel('properties')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'properties' },
          () => {
            console.log('Properties table changed, refetching data');
            fetchData();
          }
        )
        .subscribe();

      return () => {
        console.log('Cleaning up Supabase subscription');
        supabase.removeChannel(subscription);
      };
    } else {
      console.warn('No user authenticated, skipping data fetch');
      setError('Please log in to view reports');
      setLoading(false);
    }
  }, [user]);

  const updateFilterPreview = useCallback(() => {
    try {
      const previewFiltered = properties.filter((prop) => {
        const suburbMatch =
          filters.suburbs.length === 0 ||
          filters.suburbs.some((suburb) => normalizeSuburb(prop.suburb) === normalizeSuburb(suburb));
        const streetNameMatch =
          filters.streetNames.length === 0 ||
          filters.streetNames.some((name) => (prop.street_name || '').toLowerCase() === name.toLowerCase());
        const streetNumberMatch =
          filters.streetNumbers.length === 0 ||
          filters.streetNumbers.some((num) => (prop.street_number || '').toLowerCase() === num.toLowerCase());
        const agentMatch =
          filters.agents.length === 0 ||
          filters.agents.some((agent) => (prop.agent_name || '').toLowerCase() === agent.toLowerCase());
        const agencyMatch =
          filters.agency_names.length === 0 ||
          filters.agency_names.some((agency) => (prop.agency_name || 'Unknown').toLowerCase() === agency.toLowerCase());

        return suburbMatch && streetNameMatch && streetNumberMatch && agentMatch && agencyMatch;
      });
      setFilterPreviewCount(previewFiltered.length);
      console.log('Filter preview count updated:', previewFiltered.length, 'with filters:', filters);
    } catch (err) {
      console.error('Error in updateFilterPreview:', err);
      setError('Failed to apply filters');
    }
  }, [filters, properties]);

  useEffect(() => {
    updateFilterPreview();
  }, [filters, properties, updateFilterPreview]);

  const debouncedGenerateMetrics = useCallback(
    debounce((props: PropertyDetails[]) => {
      try {
        console.log('Generating metrics for properties:', props.length);
        const metrics = generatePropertyMetrics(props, predictFutureAvgPriceBySuburb);
        setPropertyMetrics(metrics);
      } catch (err) {
        console.error('Error generating metrics:', err);
        setError('Failed to generate property metrics');
      }
    }, 300),
    []
  );

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Starting data fetch...');

      let query = supabase
        .from('properties')
        .select('*, commission')
        .order('created_at', { ascending: false });

      const { data: propData, error: propError } = await query;
      if (propError) {
        console.error('Property fetch error:', propError);
        throw new Error(`Property fetch error: ${propError.message}`);
      }
      console.log('Raw properties fetched from Supabase:', propData?.length || 0);

      if (!propData || propData.length === 0) {
        console.warn('No properties returned from Supabase');
        setProperties([]);
        setFilteredProperties([]);
        setPropertyMetrics(null);
        setLoading(false);
        return;
      }

      const normalizedPropData = propData.map((prop) => ({
        ...prop,
        suburb: normalizeSuburb(prop.suburb || ''),
      }));
      console.log('Normalized properties:', normalizedPropData.length);

      const propertiesWithUserData = userProperty && location.state
        ? [...normalizedPropData, { ...userProperty, suburb: normalizeSuburb(userProperty.suburb || '') }]
        : normalizedPropData;
      console.log('Properties with user data:', propertiesWithUserData.length);

      const enrichedProperties = await Promise.all(
        propertiesWithUserData.map(async (prop) => {
          try {
            const { data: sameStreetSales, error: salesError } = await supabase
              .from('properties')
              .select('address, sale_price, property_type, sale_date, suburb')
              .eq('street_name', prop.street_name || '')
              .neq('id', prop.id)
              .limit(5);

            if (salesError) {
              console.error('Supabase same street sales error:', salesError);
              throw salesError;
            }

            const normalizedSales = sameStreetSales?.map((sale) => ({
              ...sale,
              suburb: normalizeSuburb(sale.suburb || ''),
            })) || [];

            const { data: pastRecords, error: recordsError } = await supabase
              .from('past_records')
              .select('suburb, postcode, property_type, price, bedrooms, bathrooms, car_garage, sqm, landsize, listing_date, sale_date, status, notes')
              .eq('property_id', prop.id);

            if (recordsError) {
              console.error('Supabase past records error:', recordsError);
              throw recordsError;
            }

            const normalizedRecords = pastRecords?.map((record) => ({
              ...record,
              suburb: normalizeSuburb(record.suburb || ''),
            })) || [];

            return {
              ...prop,
              same_street_sales: normalizedSales,
              past_records: normalizedRecords,
            };
          } catch (err) {
            console.error('Error enriching property:', prop.id, err);
            return prop;
          }
        })
      );

      console.log('Enriched properties:', enrichedProperties.length);
      setProperties(enrichedProperties);
      setFilteredProperties(enrichedProperties);
      debouncedGenerateMetrics(enrichedProperties);
    } catch (err: any) {
      console.error('Fetch error:', err);
      setError(err.message || 'Failed to fetch data');
      toast.error(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
      console.log('Fetch completed, loading:', false);
    }
  };

  const applyFilters = (filters: Filters) => {
    try {
      console.log('Applying filters:', filters);
      const filtered = properties.filter((prop) => {
        const suburbMatch =
          filters.suburbs.length === 0 ||
          filters.suburbs.some((suburb) => normalizeSuburb(prop.suburb || '') === normalizeSuburb(suburb));
        const streetNameMatch =
          filters.streetNames.length === 0 ||
          filters.streetNames.some((name) => (prop.street_name || '').toLowerCase() === name.toLowerCase());
        const streetNumberMatch =
          filters.streetNumbers.length === 0 ||
          filters.streetNumbers.some((num) => (prop.street_number || '').toLowerCase() === num.toLowerCase());
        const agentMatch =
          filters.agents.length === 0 ||
          filters.agents.some((agent) => (prop.agent_name || '').toLowerCase() === agent.toLowerCase());
        const agencyMatch =
          filters.agency_names.length === 0 ||
          filters.agency_names.some((agency) => (prop.agency_name || 'Unknown').toLowerCase() === agency.toLowerCase());

        return suburbMatch && streetNameMatch && streetNumberMatch && agentMatch && agencyMatch;
      });
      console.log('Filtered properties:', filtered.length);
      setFilteredProperties(filtered);
      debouncedGenerateMetrics(filtered);
      setCurrentPage(1);
    } catch (err) {
      console.error('Error applying filters:', err);
      setError('Failed to apply filters');
    }
  };

  const handleFilterChange = (filterType: keyof Filters, selected: Array<{ value: string; label: string }>) => {
    try {
      const newValues = selected.map((option) => option.value);
      console.log(`Filter changed: ${filterType} =`, newValues);
      setFilters((prev) => {
        const newFilters = { ...prev, [filterType]: newValues };
        applyFilters(newFilters);
        localStorage.setItem('reportFilters', JSON.stringify(newFilters));
        return newFilters;
      });
    } catch (err) {
      console.error('Error in handleFilterChange:', err);
      setError('Failed to update filters');
    }
  };

  const handleManualInputChange = (filterType: keyof typeof manualInputs, value: string) => {
    setManualInputs((prev) => ({ ...prev, [filterType]: value }));
  };

  const handleManualInputKeyDown = (
    filterType: keyof Filters,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === 'Enter') {
      const value = manualInputs[filterType].trim();
      if (value && filterSuggestions[filterType].includes(value)) {
        console.log(`Adding manual input for ${filterType}: ${value}`);
        setFilters((prev) => {
          const newValues = [...new Set([...prev[filterType], value])];
          const newFilters: Filters = { ...prev, [filterType]: newValues };
          applyFilters(newFilters);
          localStorage.setItem('reportFilters', JSON.stringify(newFilters));
          return newFilters;
        });
        setManualInputs((prev) => ({ ...prev, [filterType]: '' }));
        toast.success(`Added ${filterType.replace(/s$/, '')}: ${value}`);
      } else {
        toast.error(`Invalid ${filterType.replace(/s$/, '')}. Please select from suggestions.`);
      }
    }
  };

  const resetFilters = () => {
    try {
      const emptyFilters: Filters = { suburbs: [], streetNames: [], streetNumbers: [], agents: [], agency_names: [] };
      console.log('Resetting filters');
      setFilters(emptyFilters);
      setManualInputs({ suburbs: '', streetNames: '', streetNumbers: '', agents: '', agency_names: '' });
      setExpandedFilters({ suburbs: false, streetNames: false, streetNumbers: false, agents: false, agency_names: false });
      setFilteredProperties(properties);
      debouncedGenerateMetrics(properties);
      localStorage.removeItem('reportFilters');
      toast.success('Filters reset successfully');
      setCurrentPage(1);
    } catch (err) {
      console.error('Error resetting filters:', err);
      setError('Failed to reset filters');
    }
  };

  const toggleFilterSection = (section: keyof typeof expandedFilters) => {
    setExpandedFilters((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const exportPropertyReportPDF = async () => {
    if (!propertyMetrics) {
      toast.error('No property metrics available for export');
      return;
    }
    setExportLoading(true);
    try {
      const doc = new jsPDF();
      doc.setFontSize(20);
      doc.text('Property Report', 20, 20);
      doc.setFontSize(12);
      doc.text(`Generated on: ${moment().format('MMMM Do YYYY, h:mm:ss a')}`, 20, 30);
      doc.setFontSize(10);
      doc.text('Generated by xAI Property Management', 20, 38);

      autoTable(doc, {
        startY: 50,
        head: [
          [
            'Street Number', 'Street Name', 'Suburb', 'Postcode', 'Agent', 'Type', 'Price', 'Sold Price', 'Status',
            'Commission (%)', 'Commission Earned', 'Agency', 'Expected Price', 'Sale Type', 'Bedrooms', 'Bathrooms',
            'Car Garage', 'SQM', 'Land Size', 'Listed Date', 'Sold Date', 'Flood Risk', 'Bushfire Risk', 'Contract Status',
            'Features',
          ],
        ],
        body: propertyMetrics.propertyDetails.map((prop) => [
          prop.street_number || 'N/A',
          prop.street_name || 'N/A',
          normalizeSuburb(prop.suburb || ''),
          prop.postcode || 'N/A',
          prop.agent_name || 'N/A',
          prop.property_type || 'N/A',
          formatCurrency(prop.price || 0),
          prop.sold_price ? formatCurrency(prop.sold_price) : 'N/A',
          prop.category || 'N/A',
          prop.commission ? `${prop.commission}%` : 'N/A',
          prop.commission_earned ? formatCurrency(prop.commission_earned) : 'N/A',
          prop.agency_name || 'N/A',
          prop.expected_price ? formatCurrency(prop.expected_price) : 'N/A',
          prop.sale_type || 'N/A',
          prop.bedrooms ?? 'N/A',
          prop.bathrooms ?? 'N/A',
          prop.car_garage ?? 'N/A',
          prop.sqm ?? 'N/A',
          prop.landsize ?? 'N/A',
          formatDate(prop.listed_date),
          formatDate(prop.sold_date),
          prop.flood_risk || 'N/A',
          prop.bushfire_risk || 'N/A',
          prop.contract_status || 'N/A',
          formatArray(prop.features || []),
        ]),
        theme: 'striped',
        headStyles: { fillColor: '#FF6384', textColor: '#fff' },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 15 },
          1: { cellWidth: 20 },
          2: { cellWidth: 20 },
          3: { cellWidth: 15 },
          4: { cellWidth: 20 },
          5: { cellWidth: 15 },
          6: { cellWidth: 20 },
          7: { cellWidth: 20 },
          8: { cellWidth: 15 },
          9: { cellWidth: 15 },
          10: { cellWidth: 20 },
          11: { cellWidth: 20 },
          12: { cellWidth: 15 },
          13: { cellWidth: 15 },
          14: { cellWidth: 10 },
          15: { cellWidth: 10 },
          16: { cellWidth: 10 },
          17: { cellWidth: 10 },
          18: { cellWidth: 10 },
          19: { cellWidth: 15 },
          20: { cellWidth: 15 },
          21: { cellWidth: 15 },
          22: { cellWidth: 15 },
          23: { cellWidth: 15 },
          24: { cellWidth: 25 },
        },
      });

      doc.setFontSize(8);
      doc.text(
        'Red Tulip Property Management - Confidential Report',
        doc.internal.pageSize.width / 2,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );

      doc.save('property_report.pdf');
      toast.success('PDF exported successfully');
    } catch (err) {
      toast.error('Failed to export PDF');
      console.error('PDF export error:', err);
    } finally {
      setExportLoading(false);
    }
  };

  const exportPropertyReportCSV = async () => {
    if (!propertyMetrics) {
      toast.error('No property metrics available for export');
      return;
    }
    setExportLoading(true);
    try {
      const data = [
        ['Property Report'],
        [`Generated on: ${moment().format('MMMM Do YYYY, h:mm:ss a')}`],
        ['Generated by xAI Property Management'],
        [],
        ['Property Details'],
        [
          'Street Number', 'Street Name', 'Suburb', 'Postcode', 'Agent', 'Type', 'Price', 'Sold Price', 'Status',
          'Commission (%)', 'Commission Earned', 'Agency', 'Expected Price', 'Sale Type', 'Bedrooms', 'Bathrooms',
          'Car Garage', 'SQM', 'Land Size', 'Listed Date', 'Sold Date', 'Flood Risk', 'Bushfire Risk', 'Contract Status',
          'Features',
        ],
        ...propertyMetrics.propertyDetails.map((prop) => [
          prop.street_number || 'N/A',
          prop.street_name || 'N/A',
          normalizeSuburb(prop.suburb || ''),
          prop.postcode || 'N/A',
          prop.agent_name || 'N/A',
          prop.property_type || 'N/A',
          formatCurrency(prop.price || 0),
          prop.sold_price ? formatCurrency(prop.sold_price) : 'N/A',
          prop.category || 'N/A',
          prop.commission ? `${prop.commission}%` : 'N/A',
          prop.commission_earned ? formatCurrency(prop.commission_earned) : 'N/A',
          prop.agency_name || 'N/A',
          prop.expected_price ? formatCurrency(prop.expected_price) : 'N/A',
          prop.sale_type || 'N/A',
          prop.bedrooms ?? 'N/A',
          prop.bathrooms ?? 'N/A',
          prop.car_garage ?? 'N/A',
          prop.sqm ?? 'N/A',
          prop.landsize ?? 'N/A',
          formatDate(prop.listed_date),
          formatDate(prop.sold_date),
          prop.flood_risk || 'N/A',
          prop.bushfire_risk || 'N/A',
          prop.contract_status || 'N/A',
          formatArray(prop.features || []),
        ]),
      ];

      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Property Report');
      XLSX.writeFile(wb, 'property_report.csv');
      toast.success('CSV exported successfully');
    } catch (err) {
      toast.error('Failed to export CSV');
      console.error('CSV export error:', err);
    } finally {
      setExportLoading(false);
    }
  };

  const exportPropertyReportHTML = async () => {
    if (!propertyMetrics) {
      toast.error('No property metrics available for export');
      return;
    }
    setExportLoading(true);
    try {
      const htmlContent = `
        <html>
          <head>
            <title>Property Report</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; background: #f4f4f4; }
              .container { max-inline-size: 1200px; margin: auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
              table { inline-size: 100%; border-collapse: collapse; margin-block-end: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: start; font-size: 12px; }
              th { background-color: #FF6384; color: white; }
              h1 { text-align: center; color: #333; }
              .footer { text-align: center; color: #666; font-size: 12px; margin-block-start: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Property Report</h1>
              <p>Generated on: ${moment().format('MMMM Do YYYY, h:mm:ss a')}</p>
              <p>Generated by xAI Property Management</p>
              <h2>Property Details</h2>
              <table>
                <tr>
                  <th>Street Number</th><th>Street Name</th><th>Suburb</th><th>Postcode</th><th>Agent</th><th>Type</th>
                  <th>Price</th><th>Sold Price</th><th>Status</th><th>Commission (%)</th><th>Commission Earned</th>
                  <th>Agency</th><th>Expected Price</th><th>Sale Type</th><th>Bedrooms</th><th>Bathrooms</th>
                  <th>Car Garage</th><th>SQM</th><th>Land Size</th><th>Listed Date</th><th>Sold Date</th>
                  <th>Flood Risk</th><th>Bushfire Risk</th><th>Contract Status</th><th>Features</th>
                </tr>
                ${propertyMetrics.propertyDetails
                  .map(
                    (prop) => `
                  <tr>
                    <td>${prop.street_number || 'N/A'}</td>
                    <td>${prop.street_name || 'N/A'}</td>
                    <td>${normalizeSuburb(prop.suburb || '')}</td>
                    <td>${prop.postcode || 'N/A'}</td>
                    <td>${prop.agent_name || 'N/A'}</td>
                    <td>${prop.property_type || 'N/A'}</td>
                    <td>${formatCurrency(prop.price || 0)}</td>
                    <td>${prop.sold_price ? formatCurrency(prop.sold_price) : 'N/A'}</td>
                    <td>${prop.category || 'N/A'}</td>
                    <td>${prop.commission ? `${prop.commission}%` : 'N/A'}</td>
                    <td>${prop.commission_earned ? formatCurrency(prop.commission_earned) : 'N/A'}</td>
                    <td>${prop.agency_name || 'N/A'}</td>
                    <td>${prop.expected_price ? formatCurrency(prop.expected_price) : 'N/A'}</td>
                    <td>${prop.sale_type || 'N/A'}</td>
                    <td>${prop.bedrooms ?? 'N/A'}</td>
                    <td>${prop.bathrooms ?? 'N/A'}</td>
                    <td>${prop.car_garage ?? 'N/A'}</td>
                    <td>${prop.sqm ?? 'N/A'}</td>
                    <td>${prop.landsize ?? 'N/A'}</td>
                    <td>${formatDate(prop.listed_date)}</td>
                    <td>${formatDate(prop.sold_date)}</td>
                    <td>${prop.flood_risk || 'N/A'}</td>
                    <td>${prop.bushfire_risk || 'N/A'}</td>
                    <td>${prop.contract_status || 'N/A'}</td>
                    <td>${formatArray(prop.features || [])}</td>
                  </tr>`
                  )
                  .join('')}
              </table>
              <div class="footer">xAI Property Management - Confidential Report</div>
            </div>
          </body>
        </html>
      `;
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'property_report.html';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('HTML exported successfully');
    } catch (err) {
      toast.error('Failed to export HTML');
      console.error('HTML export error:', err);
    } finally {
      setExportLoading(false);
    }
  };

  const renderPropertyHeatmap = () => {
    try {
      const heatmapData = generateHeatmapData(propertyMetrics);
      if (!heatmapData || !propertyMetrics) {
        console.warn('No heatmap data available');
        return <p className="text-gray-500 text-center">No heatmap data available</p>;
      }

      const options: ChartOptions<'bar'> = {
        plugins: {
          legend: { display: false },
          title: { display: true, text: 'Sales Heatmap by Suburb', font: { size: 18, weight: 'bold' } },
          tooltip: {
            callbacks: {
              label: (context) => `Sales: ${context.raw}`,
            },
          },
        },
        scales: {
          y: { beginAtZero: true },
          x: { ticks: { font: { size: 12 } } },
        },
      };

      return <Bar data={heatmapData} options={options} />;
    } catch (err) {
      console.error('Error rendering heatmap:', err);
      return <p className="text-red-600 text-center">Failed to render heatmap</p>;
    }
  };

  const renderPriceTrends = () => {
    try {
      const priceTrendsData = generatePriceTrendsData(propertyMetrics);
      if (!priceTrendsData || !propertyMetrics) {
        console.warn('No price trends data available');
        return <p className="text-gray-500 text-center">No price trends data available</p>;
      }

      const options: ChartOptions<'bar'> = {
        plugins: {
          legend: { position: 'top', labels: { font: { size: 14 } } },
          title: { display: true, text: 'Price Trends by Suburb', font: { size: 18, weight: 'bold' } },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (value) => formatCurrency(value as number), font: { size: 12 } },
          },
          x: { ticks: { font: { size: 12 } } },
        },
      };

      return <Bar data={priceTrendsData} options={options} />;
    } catch (err) {
      console.error('Error rendering price trends:', err);
      return <p className="text-red-600 text-center">Failed to render price trends</p>;
    }
  };

  const renderGeneralCharts = () => {
    if (!propertyMetrics) {
      console.warn('No property metrics for general charts');
      return <p className="text-gray-500 text-center">No chart data available</p>;
    }

    try {
      const avgPriceBySuburbData = {
        labels: Object.keys(propertyMetrics.avgSalePriceBySuburb) || [],
        datasets: [
          {
            label: 'Average Sale Price',
            data: Object.values(propertyMetrics.avgSalePriceBySuburb) || [],
            backgroundColor: '#36A2EB',
          },
          {
            label: 'Predicted Average Price',
            data: Object.values(propertyMetrics.predictedAvgPriceBySuburb) || [],
            backgroundColor: '#FF6384',
          },
        ],
      };

      const avgPriceBySuburbOptions: ChartOptions<'bar'> = {
        plugins: {
          legend: { position: 'top', labels: { font: { size: 14 } } },
          datalabels: { display: false },
          title: { display: true, text: 'Average Sale Price by Suburb', font: { size: 18, weight: 'bold' } },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (value) => formatCurrency(value as number), font: { size: 12 } },
          },
          x: { ticks: { font: { size: 12 } } },
        },
      };

      return (
        <div className="space-y-8">
          <motion.div
            className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
              <svg className="w-6 h-6 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Average Sale Price by Suburb
            </h2>
            <Bar data={avgPriceBySuburbData} options={avgPriceBySuburbOptions} />
          </motion.div>
        </div>
      );
    } catch (err) {
      console.error('Error rendering general charts:', err);
      return <p className="text-red-600 text-center">Failed to render charts</p>;
    }
  };

  const paginatedProperties = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return filteredProperties.slice(start, end);
  }, [filteredProperties, currentPage]);

  const totalPages = Math.ceil(filteredProperties.length / ITEMS_PER_PAGE);

  console.log('Current state:', {
    loading,
    error,
    properties: properties.length,
    filteredProperties: filteredProperties.length,
    propertyMetrics: !!propertyMetrics,
    user,
    filters,
    manualInputs,
    filterSuggestions,
    selectedMapProperty,
    currentPage,
    totalPages,
  });

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        setError(null);
        fetchData();
      }}
    >
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex justify-center items-center h-screen">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            >
              <Loader2 className="w-12 h-12 text-indigo-600" />
            </motion.div>
          </div>
        ) : error ? (
          <div className="flex justify-center items-center h-screen text-red-600">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xl font-semibold">Error: {error}</p>
              <motion.button
                onClick={() => fetchData()}
                className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label="Try again"
              >
                Try Again
              </motion.button>
            </div>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto">
            <motion.div
              className="flex justify-between items-center mb-8"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h1 className="text-4xl font-extrabold text-gray-900 flex items-center">
                <BarChart className="w-8 h-8 mr-3 text-indigo-600" />
                Property Reports Dashboard
              </h1>
              <motion.button
                onClick={() => {
                  console.log('Navigating to comparisons with propertyMetrics:', propertyMetrics);
                  navigate('/comparisons', { state: { propertyMetrics } });
                }}
                className="px-5 py-2 bg-gradient-to-r from-teal-600 to-teal-700 text-white rounded-full hover:from-teal-700 hover:to-teal-800 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label="View performance comparisons"
                disabled={!propertyMetrics}
              >
                View Performance Comparisons
              </motion.button>
            </motion.div>

            <motion.section
              className="mb-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <h2 className="text-2xl font-semibold text-gray-800 mb-6 flex items-center">
                <svg className="w-6 h-6 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Overview
              </h2>
              {renderGeneralCharts()}
            </motion.section>

            <motion.section
              className="mb-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <h2 className="text-2xl font-semibold text-gray-800 mb-6 flex items-center">
                <svg className="w-6 h-6 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Property Map View
              </h2>
              {filteredProperties.length > 0 ? (
                <AgentPropertyMap
                  properties={filteredProperties}
                  selectedProperty={selectedMapProperty}
                  onPropertySelect={setSelectedMapProperty}
                />
              ) : (
                <p className="text-gray-500 text-center">No properties available for map view</p>
              )}
            </motion.section>

            <motion.section
              className="mb-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <h2 className="text-2xl font-semibold text-gray-800 mb-6 flex items-center">
                <Filter className="w-6 h-6 mr-2 text-indigo-600" />
                Property Report
              </h2>
              <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 mb-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-semibold text-gray-800 flex items-center">
                    <Filter className="w-5 h-5 mr-2 text-indigo-600" />
                    Filters
                  </h3>
                  <motion.button
                    onClick={resetFilters}
                    className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-full hover:bg-gray-700 transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    title="Reset all filters to default"
                    aria-label="Reset all filters"
                  >
                    <RefreshCcw className="w-4 h-4 mr-2" />
                    Reset Filters
                  </motion.button>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Matching properties: <span className="font-semibold text-indigo-600">{filterPreviewCount}</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {(['suburbs', 'streetNames', 'streetNumbers', 'agents', 'agency_names'] as const).map((filterType) => (
                    <motion.div
                      key={filterType}
                      className="border border-gray-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200"
                      title={`Filter by ${filterType === 'agency_names' ? 'agency name' : filterType.replace(/s$/, '')}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <motion.button
                        onClick={() => toggleFilterSection(filterType)}
                        className={`w-full flex justify-between items-center p-4 font-medium rounded-t-xl ${
                          {
                            suburbs: 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100',
                            streetNames: 'bg-green-50 text-green-800 hover:bg-green-100',
                            streetNumbers: 'bg-orange-50 text-orange-800 hover:bg-orange-100',
                            agents: 'bg-yellow-50 text-yellow-800 hover:bg-yellow-100',
                            agency_names: 'bg-purple-50 text-purple-800 hover:bg-purple-100',
                          }[filterType]
                        } transition-colors`}
                        whileHover={{ scale: 1.02 }}
                        aria-expanded={expandedFilters[filterType]}
                        aria-controls={`filter-${filterType}`}
                      >
                        <span>
                          {filterType === 'agency_names'
                            ? 'Agency Name'
                            : filterType.charAt(0).toUpperCase() + filterType.slice(1).replace(/s$/, '')}
                        </span>
                        <ChevronDown
                          className={`w-5 h-5 transition-transform ${expandedFilters[filterType] ? 'rotate-180' : ''}`}
                        />
                      </motion.button>
                      {expandedFilters[filterType] && (
                        <motion.div
                          id={`filter-${filterType}`}
                          className="p-4 bg-white rounded-b-xl"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <input
                            type="text"
                            value={manualInputs[filterType]}
                            onChange={(e) => handleManualInputChange(filterType, e.target.value)}
                            onKeyDown={(e) => handleManualInputKeyDown(filterType, e)}
                            placeholder={`Enter ${filterType === 'agency_names' ? 'agency name' : filterType.replace(/s$/, '')} and press Enter`}
                            className="w-full p-3 mb-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all bg-gray-50"
                            aria-label={`Enter ${filterType.replace(/s$/, '')}`}
                          />
                          <Select
                            isMulti
                            options={filterSuggestions[filterType].map((item) => ({
                              value: item,
                              label: item,
                            }))}
                            value={filters[filterType].map((item) => ({ value: item, label: item }))}
                            onChange={(selected) => handleFilterChange(filterType, selected)}
                            placeholder={`Select ${filterType === 'agency_names' ? 'agency name' : filterType.replace(/s$/, '')}...`}
                            styles={selectStyles}
                            noOptionsMessage={() => 'No options available'}
                            className="basic-multi-select"
                            classNamePrefix="select"
                            aria-label={`Select ${filterType.replace(/s$/, '')}`}
                          />
                        </motion.div>
                      )}
                    </motion.div>
                  ))}
                </div>
                <div className="mt-6 flex justify-end space-x-4 relative">
                  {exportLoading && (
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-50 rounded"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                    </motion.div>
                  )}
                  <motion.button
                    onClick={() => exportPropertyReportPDF()}
                    className="flex items-center px-5 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-full hover:from-indigo-700 hover:to-indigo-800 transition-all"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    title="Export property report as PDF"
                    aria-label="Export as PDF"
                    disabled={exportLoading}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    PDF
                  </motion.button>
                  <motion.button
                    onClick={() => exportPropertyReportCSV()}
                    className="flex items-center px-5 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-full hover:from-green-700 hover:to-green-800 transition-all"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    title="Export property report as CSV"
                    aria-label="Export as CSV"
                    disabled={exportLoading}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    CSV
                  </motion.button>
                  <motion.button
                    onClick={() => exportPropertyReportHTML()}
                    className="flex items-center px-5 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-full hover:from-purple-700 hover:to-purple-800 transition-all"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    title="Export property report as HTML"
                    aria-label="Export as HTML"
                    disabled={exportLoading}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    HTML
                  </motion.button>
                </div>
              </div>
              {propertyMetrics ? (
                <>
                  <motion.div
                    className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 mb-6"
                    ref={propertiesTableRef}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                      <svg className="w-6 h-6 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Property Details
                    </h3>
                    {paginatedProperties.length > 0 ? (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse" role="grid">
                            <thead>
                              <tr className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white">
                                <th className="p-4 text-left text-sm font-semibold">Street Number</th>
                                <th className="p-4 text-left text-sm font-semibold">Street Name</th>
                                <th className="p-4 text-left text-sm font-semibold">Suburb</th>
                                <th className="p-4 text-left text-sm font-semibold">Postcode</th>
                                <th className="p-4 text-left text-sm font-semibold">Agent Name</th>
                                <th className="p-4 text-left text-sm font-semibold">Property Type</th>
                                <th className="p-4 text-left text-sm font-semibold">Price</th>
                                <th className="p-4 text-left text-sm font-semibold">Sold Price</th>
                                <th className="p-4 text-left text-sm font-semibold">Status</th>
                                <th className="p-4 text-left text-sm font-semibold">Commission (%)</th>
                                <th className="p-4 text-left text-sm font-semibold">Commission Earned</th>
                                <th className="p-4 text-left text-sm font-semibold">Agency</th>
                                <th className="p-4 text-left text-sm font-semibold">Expected Price</th>
                                <th className="p-4 text-left text-sm font-semibold">Sale Type</th>
                                <th className="p-4 text-left text-sm font-semibold">Bedrooms</th>
                                <th className="p-4 text-left text-sm font-semibold">Bathrooms</th>
                                <th className="p-4 text-left text-sm font-semibold">Car Garage</th>
                                <th className="p-4 text-left text-sm font-semibold">SQM</th>
                                <th className="p-4 text-left text-sm font-semibold">Land Size</th>
                                <th className="p-4 text-left text-sm font-semibold">Listed Date</th>
                                <th className="p-4 text-left text-sm font-semibold">Sold Date</th>
                                <th className="p-4 text-left text-sm font-semibold">Flood Risk</th>
                                <th className="p-4 text-left text-sm font-semibold">Bushfire Risk</th>
                                <th className="p-4 text-left text-sm font-semibold">Contract Status</th>
                                <th className="p-4 text-left text-sm font-semibold">Features</th>
                                <th className="p-4 text-left text-sm font-semibold">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paginatedProperties.map((property) => {
                                const { commissionRate, commissionEarned } = calculateCommission(property);
                                return (
                                  <motion.tr
                                    key={property.id}
                                    id={`property-${property.id}`}
                                    className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 0.3 }}
                                  >
                                    <td className="p-4 text-gray-700">{property.street_number || 'N/A'}</td>
                                    <td className="p-4 text-gray-700">{property.street_name || 'N/A'}</td>
                                    <td className="p-4 text-gray-700">{normalizeSuburb(property.suburb || '') || 'UNKNOWN'}</td>
                                    <td className="p-4 text-gray-700">{property.postcode || 'N/A'}</td>
                                    <td className="p-4 text-gray-700">{property.agent_name || 'N/A'}</td>
                                    <td className="p-4 text-gray-700">{property.property_type || 'N/A'}</td>
                                    <td className="p-4 text-gray-700">{property.price ? formatCurrency(property.price) : 'N/A'}</td>
                                    <td className="p-4 text-gray-700">{property.sold_price ? formatCurrency(property.sold_price) : 'N/A'}</td>
                                    <td className="p-4 text-gray-700">{property.category || 'N/A'}</td>
                                    <td className="p-4 text-gray-700">{commissionRate ? `${commissionRate}%` : 'N/A'}</td>
                                    <td className="p-4 text-gray-700">{commissionEarned ? formatCurrency(commissionEarned) : 'N/A'}</td>
                                    <td className="p-4 text-gray-700">{property.agency_name || 'N/A'}</td>
                                    <td className="p-4 text-gray-700">{property.expected_price ? formatCurrency(property.expected_price) : 'N/A'}</td>
                                    <td className="p-4 text-gray-700">{property.sale_type || 'N/A'}</td>
                                    <td className="p-4 text-gray-700">{property.bedrooms ?? 'N/A'}</td>
                                    <td className="p-4 text-gray-700">{property.bathrooms ?? 'N/A'}</td>
                                    <td className="p-4 text-gray-700">{property.car_garage ?? 'N/A'}</td>
                                    <td className="p-4 text-gray-700">{property.sqm ?? 'N/A'}</td>
                                    <td className="p-4 text-gray-700">{property.landsize ?? 'N/A'}</td>
                                    <td className="p-4 text-gray-700">{formatDate(property.listed_date)}</td>
                                    <td className="p-4 text-gray-700">{formatDate(property.sold_date)}</td>
                                    <td className="p-4 text-gray-700">{property.flood_risk || 'N/A'}</td>
                                    <td className="p-4 text-gray-700">{property.bushfire_risk || 'N/A'}</td>
                                    <td className="p-4 text-gray-700">{property.contract_status || 'N/A'}</td>
                                    <td className="p-4 text-gray-700">{formatArray(property.features || [])}</td>
                                    <td className="p-4 text-gray-700">
                                      <motion.button
                                        onClick={() => {
                                          setSelectedProperty(property);
                                          setShowEditModal(true);
                                        }}
                                        className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        aria-label={`Edit property ${property.street_number} ${property.street_name}`}
                                      >
                                        Edit
                                      </motion.button>
                                    </td>
                                  </motion.tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-between items-center mt-4">
                          <motion.button
                            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                            disabled={currentPage === 1}
                            className="px-4 py-2 bg-indigo-600 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            aria-label="Previous page"
                          >
                            Previous
                          </motion.button>
                          <span className="text-gray-700">
                            Page {currentPage} of {totalPages}
                          </span>
                          <motion.button
                            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                            disabled={currentPage === totalPages}
                            className="px-4 py-2 bg-indigo-600 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            aria-label="Next page"
                          >
                            Next
                          </motion.button>
                        </div>
                      </>
                    ) : (
                      <p className="text-gray-500 text-center">No properties match found matching the current filters.</p>
                    )}
                  </motion.div>
                  <motion.div
                    className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 mb-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                  >
                    <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                      <Gauge className="w-6 h-6 mr-2 text-indigo-600" />
                      Commission by Agency
                    </h3>
                    <CommissionByAgency />
                  </motion.div>
                  <motion.div
                    className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 mb-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                  >
                    <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                      <svg className="w-6 h-6 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                      </svg>
                      Sales Heatmap
                    </h3>
                    {renderPropertyHeatmap()}
                  </motion.div>
                  <motion.div
                    className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 mb-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                  >
                    <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                      <svg className="w-6 h-6 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                      Price Trends
                    </h3>
                    {renderPriceTrends()}
                  </motion.div>
                  <div className="flex justify-end space-x-4 relative">
                    {exportLoading && (
                      <motion.div
                        className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-50 rounded"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                      </motion.div>
                    )}
                    <motion.button
                      onClick={() => exportPropertyReportPDF()}
                      className="flex items-center px-5 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-full hover:from-indigo-700 hover:to-indigo-800 transition-all"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      title="Export property report as PDF"
                      aria-label="Export as PDF"
                      disabled={exportLoading}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      PDF
                    </motion.button>
                    <motion.button
                      onClick={() => exportPropertyReportCSV()}
                      className="flex items-center px-5 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-full hover:from-green-700 hover:to-green-800 transition-all"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      title="Export property report as CSV"
                      aria-label="Export as CSV"
                      disabled={exportLoading}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      CSV
                    </motion.button>
                    <motion.button
                      onClick={() => exportPropertyReportHTML()}
                      className="flex items-center px-5 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-full hover:from-purple-700 hover:to-purple-800 transition-all"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      title="Export property report as HTML"
                      aria-label="Export as HTML"
                      disabled={exportLoading}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      HTML
                    </motion.button>
                  </div>
                </>
              ) : (
                <p className="text-gray-500 text-center py-4">No property metrics available.</p>
              )}
            </motion.section>

            <EditModal
              showEditModal={showEditModal}
              setShowEditModal={setShowEditModal}
              selectedProperty={selectedProperty}
              setSelectedProperty={setSelectedProperty}
              properties={properties}
              setProperties={setProperties}
              filteredProperties={filteredProperties}
              setFilteredProperties={setFilteredProperties}
              debouncedGenerateMetrics={() => debouncedGenerateMetrics(properties)}
              propertiesTableRef={propertiesTableRef}
            />
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default Reports;