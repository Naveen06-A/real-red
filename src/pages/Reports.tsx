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
import { debounce } from 'lodash';
import { BarChart, Loader2, FileText, PieChart, Users, Map } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { ErrorBoundary } from 'react-error-boundary';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { AgentPropertyMap } from './AgentPropertyMap';
import { EditModal } from './EditModal';
import { PropertyDetails, PropertyMetrics, Filters } from './Reports';
import { PropertyReportPage } from './PropertyReportPage';
import { CommissionByAgency } from './CommissionByAgency';
import {
  formatCurrency,
  normalizeSuburb,
  predictFutureAvgPriceBySuburb,
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
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    suburbs: [],
    streetNames: [],
    streetNumbers: [],
    agents: [],
    agency_names: [],
  });
  const [filterSuggestions, setFilterSuggestions] = useState({
    suburbs: [] as string[],
    streetNames: [] as string[],
    streetNumbers: [] as string[],
    agents: [] as string[],
    agency_names: [] as string[],
  });
  const [selectedMapProperty, setSelectedMapProperty] = useState<PropertyDetails | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<PropertyDetails | null>(null);
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

  const handleDeleteProperty = async (propertyId: string) => {
    try {
      if (!confirm('Are you sure you want to delete this property?')) return;

      const { error } = await supabase
        .from('properties')
        .delete()
        .eq('id', propertyId);

      if (error) {
        console.error('Error deleting property:', error);
        throw new Error(`Failed to delete property: ${error.message}`);
      }

      setProperties((prev) => {
        const updated = prev.filter((prop) => prop.id !== propertyId);
        return updated;
      });
      setFilteredProperties((prev) => {
        const updated = prev.filter((prop) => prop.id !== propertyId);
        debouncedGenerateMetrics(updated);
        return updated;
      });

      toast.success('Property deleted successfully');
    } catch (err: any) {
      console.error('Delete error:', err);
      toast.error(err.message || 'Failed to delete property');
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
            backgroundColor: '#60A5FA',
          },
          {
            label: 'Predicted Average Price',
            data: Object.values(propertyMetrics.predictedAvgPriceBySuburb) || [],
            backgroundColor: '#93C5FD',
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
            className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 hover:shadow-xl transition-all duration-300"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-2xl font-semibold text-blue-800 mb-4 flex items-center">
              <svg className="w-6 h-6 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

  console.log('Current state:', {
    loading,
    error,
    properties: properties.length,
    filteredProperties: filteredProperties.length,
    propertyMetrics: !!propertyMetrics,
    user,
    filters,
    filterSuggestions,
    selectedMapProperty,
    currentPage,
  });

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        setError(null);
        fetchData();
      }}
    >
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 py-8 px-4 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex justify-center items-center h-screen">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            >
              <Loader2 className="w-12 h-12 text-blue-600" />
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
                className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
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
              <h1 className="text-4xl font-extrabold text-blue-800 flex items-center">
                <BarChart className="w-8 h-8 mr-3 text-blue-600" />
                Property Reports Dashboard
              </h1>
              <div className="flex space-x-4">
                <motion.button
                  onClick={() => {
                    console.log('Navigating to property report with state:', {
                      propertyMetrics,
                      filteredProperties,
                      filters,
                      filterSuggestions,
                      currentPage,
                    });
                    navigate('/property-report-page', {
                      state: {
                        propertyMetrics,
                        filteredProperties,
                        filters,
                        filterSuggestions,
                        currentPage,
                      },
                    });
                  }}
                  className="px-5 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full hover:from-blue-600 hover:to-blue-700 transition-all"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  aria-label="View property report"
                  title="View detailed property report"
                >
                  <FileText className="w-5 h-5 mr-2" />
                  Property Report
                </motion.button>
                <motion.button
                  onClick={() => {
                    console.log('Navigating to commissions with propertyMetrics:', propertyMetrics);
                    navigate('/commission-by-agency', { state: { propertyMetrics } });
                  }}
                  className="px-5 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full hover:from-blue-600 hover:to-blue-700 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  aria-label="View commissions"
                  title="View detailed commission reports"
                  disabled={!propertyMetrics}
                >
                  <PieChart className="w-5 h-5 mr-2" />
                  Commissions
                </motion.button>
                <motion.button
                  onClick={() => {
                    console.log('Navigating to comparisons with propertyMetrics:', propertyMetrics);
                    navigate('/comparisons', { state: { propertyMetrics } });
                  }}
                  className="px-5 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full hover:from-blue-600 hover:to-blue-700 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  aria-label="View performance comparisons"
                  title="View performance comparisons"
                  disabled={!propertyMetrics}
                >
                  <Users className="w-5 h-5 mr-2" />
                  Comparisons
                </motion.button>
              </div>
            </motion.div>

            <motion.section
              className="mb-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <h2 className="text-2xl font-semibold text-blue-800 mb-6 flex items-center">
                <BarChart className="w-6 h-6 mr-2 text-blue-600" />
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
              <h2 className="text-2xl font-semibold text-blue-800 mb-6 flex items-center">
                <Map className="w-6 h-6 mr-2 text-blue-600" />
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