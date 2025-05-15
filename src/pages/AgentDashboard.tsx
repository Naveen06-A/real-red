import { useState, useEffect } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Mic, Clock, Search, Download, SlidersHorizontal, X, TrendingUp } from 'lucide-react';
import { IndividualPropertyReport } from './IndividualPropertyReport';
import { supabase } from '../lib/supabase';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Property } from '../types/Property';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency } from '../utils/formatters';
import { toast } from 'react-toastify';
import { LoadingOverlay } from '../components/LoadingOverlay';

interface PredictionResult {
  recommendation: 'BUY' | 'SELL';
  confidence: number;
  trend: number;
  historicalData: { dates: string[]; prices: number[] };
  marketCondition?: 'Rising' | 'Stable' | 'Declining';
  sentimentScore?: number;
}

const ALLOWED_SUBURBS = [
  { name: 'Moggill', postcode: '4070' },
  { name: 'Bellbowrie', postcode: '4070' },
  { name: 'Pullenvale', postcode: '4069' },
  { name: 'Brookfield', postcode: '4069' },
  { name: 'Anstead', postcode: '4070' },
  { name: 'Chapell Hill', postcode: '4069' },
  { name: 'Kenmore', postcode: '4069' },
  { name: 'Kenmore Hills', postcode: '4069' },
  { name: 'Fig Tree Pocket', postcode: '4069' },
  { name: 'Pinjara Hills', postcode: '4069' },
];

export function AgentDashboard() {
  const { profile, user } = useAuthStore();
  const navigate = useNavigate();
  const [performanceScore] = useState(75);
  const [isRecording, setIsRecording] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [predictions, setPredictions] = useState<Record<string, PredictionResult>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [filters, setFilters] = useState<{
    bedrooms: string;
    bathrooms: string;
    car_garage: string;
    square_feet: string;
    price: string;
    suburbs: string[];
    propertyTypes: string[];
    street_name: string;
    category: string;
  }>({
    bedrooms: '',
    bathrooms: '',
    car_garage: '',
    square_feet: '',
    price: '',
    suburbs: [],
    propertyTypes: [],
    street_name: '',
    category: '',
  });

  useEffect(() => {
    if (profile?.role === 'agent') {
      fetchPropertiesAndPredict();
    } else if (profile && profile.role !== 'agent') {
      navigate('/agent-login');
    }
  }, [profile, navigate]);

  useEffect(() => {
    console.log('Filters changed:', filters);
    applyFiltersAndSearch();
  }, [filters]);

  const fetchPropertiesAndPredict = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('Fetching all properties...');
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('listed_date', { ascending: false });
      if (error) throw error;

      console.log('Fetched properties:', data);
      const fetchedProperties = data || [];
      setProperties(fetchedProperties);

      const predictionPromises = fetchedProperties.map(async (property) => {
        const prediction = await analyzePriceTrend(
          property.city || property.suburb || 'Unknown',
          property.property_type || 'Unknown',
          property.price || 0
        );
        return { id: property.id, prediction };
      });
      const predictionResults = await Promise.all(predictionPromises);
      const predictionMap = predictionResults.reduce((acc, { id, prediction }) => {
        acc[id] = prediction;
        return acc;
      }, {} as Record<string, PredictionResult>);
      setPredictions(predictionMap);
    } catch (error: any) {
      console.error('Error fetching properties:', error);
      setError('Failed to load properties. Please try again later.');
      toast.error('Failed to fetch properties');
      setProperties([]);
    } finally {
      setLoading(false);
    }
  };

  const startVoiceCommand = () => {
    if (!('webkitSpeechRecognition' in window)) {
      toast.error('Voice commands not supported in this browser.');
      return;
    }
    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onresult = (event: any) => {
      const command = event.results[0][0].transcript.toLowerCase();
      if (command.includes('add property')) {
        navigate('/property-form');
      } else if (command.includes('view reports')) {
        navigate('/reports');
      } else if (command.includes('log activity')) {
        navigate('/activity-logger');
      } else if (command.includes('view progress report')) {
        navigate('/progress-report');
      }
    };
    recognition.start();
  };

  const analyzePriceTrend = async (city: string, propertyType: string, currentPrice: number): Promise<PredictionResult> => {
    try {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const { data: historicalData, error } = await supabase
        .from('property_history')
        .select('sale_date, price')
        .eq('city', city)
        .eq('property_type', propertyType)
        .gte('sale_date', oneYearAgo.toISOString())
        .order('sale_date', { ascending: true });
      if (error) throw error;

      if (!historicalData || historicalData.length === 0) {
        return { recommendation: 'BUY', confidence: 50, trend: 0, historicalData: { dates: [], prices: [] }, sentimentScore: 0 };
      }

      const dates = historicalData.map((record) => new Date(record.sale_date).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }));
      const prices = historicalData.map((record) => record.price);
      const lastPrice = prices[prices.length - 1];
      const firstPrice = prices[0];
      const slope = ((lastPrice - firstPrice) / firstPrice) * 100;
      const marketCondition: PredictionResult['marketCondition'] = slope > 3 ? 'Rising' : slope < -3 ? 'Declining' : 'Stable';
      const recommendation: 'BUY' | 'SELL' = slope >= 0 ? 'BUY' : 'SELL';
      return {
        recommendation,
        confidence: Math.min(Math.abs(slope) * 2, 95),
        trend: slope,
        historicalData: { dates, prices },
        sentimentScore: Math.random() * 100 - 50,
      };
    } catch (error) {
      console.error('Price trend analysis failed:', error);
      return { recommendation: 'BUY', confidence: 50, trend: 0, historicalData: { dates: [], prices: [] }, sentimentScore: 0 };
    }
  };

  const debounce = (func: (...args: any[]) => void, delay: number) => {
    let timeoutId: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  };

  const fetchSuggestions = async (query: string) => {
    if (!query) {
      setSuggestions([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('property_type, street_name')
        .or(`property_type.ilike.%${query}%,street_name.ilike.%${query}%`)
        .limit(10);
      if (error) throw error;

      const suggestionSet = new Set<string>();
      (data || []).forEach((property: any) => {
        if (property.property_type?.toLowerCase().includes(query.toLowerCase())) suggestionSet.add(property.property_type);
        if (property.street_name?.toLowerCase().includes(query.toLowerCase())) suggestionSet.add(property.street_name);
      });
      setSuggestions(Array.from(suggestionSet).slice(0, 5));
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      setSuggestions([]);
    }
  };

  const handleSearchChange = debounce((value: string) => {
    setSearchQuery(value);
    fetchSuggestions(value);
  }, 300);

  const handleSuggestionClick = (suggestion: string) => {
    setSearchQuery(suggestion);
    setSuggestions([]);
    applyFiltersAndSearch(suggestion);
  };

  const handleSearchSubmit = () => {
    applyFiltersAndSearch(searchQuery);
  };

  const applyFiltersAndSearch = async (query: string = searchQuery) => {
    setLoading(true);
    setError(null);
    try {
      console.log('Applying filters:', { filters, query });
      let queryBuilder = supabase.from('properties').select('*');

      if (filters.category) {
        console.log('Filtering by category (eq):', filters.category);
        queryBuilder = queryBuilder.eq('category', filters.category);
      } else {
        console.log('No category filter applied, fetching all properties');
      }

      if (query) {
        queryBuilder = queryBuilder.or(
          `property_type.ilike.%${query}%,street_name.ilike.%${query}%,address.ilike.%${query}%`
        );
      }

      if (filters.bedrooms) queryBuilder = queryBuilder.gte('bedrooms', parseInt(filters.bedrooms) || 0);
      if (filters.bathrooms) queryBuilder = queryBuilder.gte('bathrooms', parseInt(filters.bathrooms) || 0);
      if (filters.car_garage) queryBuilder = queryBuilder.gte('car_garage', parseInt(filters.car_garage) || 0);
      if (filters.square_feet) queryBuilder = queryBuilder.gte('square_feet', parseInt(filters.square_feet) || 0);
      if (filters.price) queryBuilder = queryBuilder.lte('price', parseInt(filters.price) || 0);
      if (filters.suburbs.length > 0) queryBuilder = queryBuilder.in('suburb', filters.suburbs);
      if (filters.propertyTypes.length > 0) queryBuilder = queryBuilder.in('property_type', filters.propertyTypes);
      if (filters.street_name) queryBuilder = queryBuilder.ilike('street_name', `%${filters.street_name}%`);

      const { data, error } = await queryBuilder.order('listed_date', { ascending: false });
      if (error) throw error;

      console.log('Filtered properties:', data);
      setProperties(data || []);
      setError(data?.length === 0 ? 'No properties match the applied filters.' : null);

      const predictionPromises = (data || []).map(async (property) => {
        const prediction = await analyzePriceTrend(
          property.city || property.suburb || 'Unknown',
          property.property_type || 'Unknown',
          property.price || 0
        );
        return { id: property.id, prediction };
      });
      const predictionResults = await Promise.all(predictionPromises);
      const predictionMap = predictionResults.reduce((acc, { id, prediction }) => {
        acc[id] = prediction;
        return acc;
      }, {} as Record<string, PredictionResult>);
      setPredictions(predictionMap);
    } catch (error: any) {
      console.error('Error applying filters and search:', error);
      setError('Failed to apply filters. Please try again.');
      toast.error('Failed to apply filters');
      setProperties([]);
    } finally {
      setLoading(false);
    }
  };

  const countActiveFilters = () => {
    let count = 0;
    if (searchQuery) count++;
    if (filters.bedrooms) count++;
    if (filters.bathrooms) count++;
    if (filters.car_garage) count++;
    if (filters.square_feet) count++;
    if (filters.price) count++;
    if (filters.suburbs.length > 0) count++;
    if (filters.propertyTypes.length > 0) count++;
    if (filters.street_name) count++;
    if (filters.category) count++;
    return count;
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setSuggestions([]);
    setFilters({
      bedrooms: '',
      bathrooms: '',
      car_garage: '',
      square_feet: '',
      price: '',
      suburbs: [],
      propertyTypes: [],
      street_name: '',
      category: '',
    });
  };

  const handleCategoryClick = (category: string) => {
    const newCategory = filters.category === category ? '' : category;
    setFilters((prev) => {
      console.log('Setting category filter to:', newCategory);
      return { ...prev, category: newCategory };
    });
  };

  const generateReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Agent Property Report', 20, 20);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-AU')}`, 20, 30);

    doc.setFontSize(14);
    doc.text('Applied Filters', 20, 40);
    doc.setFontSize(10);
    let yPos = 50;
    const activeFilters = Object.entries(filters).filter(([_, value]) =>
      (typeof value === 'string' && value) || (Array.isArray(value) && value.length > 0)
    );
    if (searchQuery) activeFilters.unshift(['Search', searchQuery]);
    if (activeFilters.length === 0) {
      doc.text('No filters applied', 20, yPos);
    } else {
      activeFilters.forEach(([key, value]) => {
        doc.text(`${key}: ${Array.isArray(value) ? value.join(', ') : value}`, 20, yPos);
        yPos += 10;
      });
    }

    doc.setFontSize(14);
    doc.text('Summary Statistics', 20, yPos + 10);
    doc.setFontSize(10);
    yPos += 20;
    const avgPrice = properties.reduce((sum, p) => sum + (p.price || 0), 0) / properties.length || 0;
    doc.text(`Total Properties: ${properties.length}`, 20, yPos);
    doc.text(`Average Price: ${formatCurrency(avgPrice)}`, 20, yPos + 10);

    yPos += 20;
    const tableData = properties.map((p) => [
      p.street_number && p.street_name ? `${p.street_number} ${p.street_name}` : p.address || 'N/A',
      p.suburb || 'N/A',
      p.street_name || 'N/A',
      p.bedrooms ?? 'N/A',
      p.bathrooms ?? 'N/A',
      p.car_garage ?? 'N/A',
      p.price ? formatCurrency(p.price) : 'N/A',
      p.agent_name || 'N/A',
      predictions[p.id]?.recommendation || 'N/A',
    ]);
    (doc as any).autoTable({
      head: [['Address', 'Suburb', 'Street', 'Bedrooms', 'Bathrooms', 'Garage', 'Price', 'Agent', 'Recommendation']],
      body: tableData,
      startY: yPos,
      styles: { fontSize: 8 },
    });

    doc.save(`agent_dashboard_report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToCSV = () => {
    const headers = ['Address', 'Suburb', 'Street', 'Bedrooms', 'Bathrooms', 'Garage', 'Price', 'Agent', 'Recommendation'];
    const rows = properties.map((p) => [
      `"${p.street_number && p.street_name ? `${p.street_number} ${p.street_name}` : p.address || 'N/A'}"`,
      `"${p.suburb || 'N/A'}"`,
      `"${p.street_name || 'N/A'}"`,
      p.bedrooms ?? 'N/A',
      p.bathrooms ?? 'N/A',
      p.car_garage ?? 'N/A',
      p.price ? formatCurrency(p.price) : 'N/A',
      `"${p.agent_name || 'N/A'}"`,
      `"${predictions[p.id]?.recommendation || 'N/A'}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `agent_properties_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!user || profile?.role !== 'agent') {
    return <Navigate to="/agent-login" />;
  }

  if (loading) {
    return <LoadingOverlay message="Loading dashboard..." />;
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">Agent Dashboard</h1>
        <div className="bg-red-50 p-4 rounded-lg shadow-md">
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchPropertiesAndPredict}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const marketInsights = {
    totalProperties: properties.length,
    avgPrice: properties.reduce((sum, p) => sum + (p.price || 0), 0) / properties.length || 0,
    buyCount: properties.filter((p) => predictions[p.id]?.recommendation === 'BUY').length,
    sellCount: properties.filter((p) => predictions[p.id]?.recommendation === 'SELL').length,
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Agent Dashboard</h1>
        <div className="flex items-center space-x-4">
          <span className="text-gray-600">Performance Score: {performanceScore}%</span>
          <button
            onClick={startVoiceCommand}
            className={`p-2 rounded-full ${isRecording ? 'bg-red-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
          >
            <Mic className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-8">
        <Link to="/property-form" className="bg-blue-600 text-white p-6 rounded-lg hover:bg-blue-700 transition">
          <h2 className="text-xl font-semibold">Add Property</h2>
          <p className="text-blue-100">List a new property</p>
        </Link>
        <Link to="/marketing-plan" className="bg-purple-600 text-white p-6 rounded-lg hover:bg-purple-700 transition">
          <h2 className="text-xl font-semibold">Marketing Plan</h2>
          <p className="text-purple-100">Plan your weekly activities</p>
        </Link>
        <Link to="/reports" className="bg-green-600 text-white p-6 rounded-lg hover:bg-green-700 transition">
          <h2 className="text-xl font-semibold">Reports</h2>
          <p className="text-green-100">View performance metrics</p>
        </Link>
        <Link to="/activity-logger" className="bg-orange-600 text-white p-6 rounded-lg hover:bg-orange-700 transition">
          <h2 className="text-xl font-semibold flex items-center">
            <Clock className="mr-2" /> Activity Logger
          </h2>
          <p className="text-orange-100">Log phone calls & door knocks</p>
        </Link>
        <Link to="/progress-report" className="bg-teal-600 text-white p-6 rounded-lg hover:bg-teal-700 transition">
          <h2 className="text-xl font-semibold">Progress Report</h2>
          <p className="text-teal-100">View marketing & activity progress</p>
        </Link>
      </div>

      <div className="mb-8 p-4 bg-blue-50 rounded-lg shadow-md flex items-center gap-4">
        <TrendingUp className="w-6 h-6 text-blue-600" />
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Market Insights</h3>
          <p className="text-sm text-gray-600">Total Properties: {marketInsights.totalProperties}</p>
          <p className="text-sm text-gray-600">Avg Price: {formatCurrency(marketInsights.avgPrice)}</p>
          <p className="text-sm text-green-600">BUY: {marketInsights.buyCount} | SELL: {marketInsights.sellCount}</p>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-grow">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="w-5 h-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
              placeholder="Search properties (e.g., house, street)..."
              className="block w-full pl-10 pr-12 py-2 border border-gray-300 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={handleSearchSubmit}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              <Search className="w-5 h-5 text-gray-400 hover:text-gray-600" />
            </button>
            {suggestions.length > 0 && (
              <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg mt-1 shadow-lg max-h-40 overflow-auto">
                {suggestions.map((suggestion, index) => (
                  <li
                    key={index}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm text-gray-700"
                  >
                    {suggestion}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <SlidersHorizontal className="w-5 h-5" />
            <span>Filters</span>
            {countActiveFilters() > 0 && (
              <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-blue-600 rounded-full">
                {countActiveFilters()}
              </span>
            )}
          </button>
        </div>

        {countActiveFilters() > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {searchQuery && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                Search: "{searchQuery}"
                <button
                  onClick={() => {
                    setSearchQuery('');
                    applyFiltersAndSearch('');
                  }}
                  className="ml-1.5 inline-flex text-blue-400 hover:text-blue-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </span>
            )}
            {Object.entries(filters).map(([key, value]) => {
              if ((typeof value === 'string' && value) || (Array.isArray(value) && value.length > 0)) {
                return (
                  <span key={key} className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                    {key}: {Array.isArray(value) ? value.join(', ') : value}
                    <button
                      onClick={() => {
                        setFilters((prev) => ({
                          ...prev,
                          [key]: Array.isArray(prev[key]) ? [] : '',
                        }));
                      }}
                      className="ml-1.5 inline-flex text-blue-400 hover:text-blue-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </span>
                );
              }
              return null;
            })}
            <button onClick={clearAllFilters} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              Clear all
            </button>
          </div>
        )}

        {showFilters && (
          <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-2">
                <h3 className="font-medium text-gray-900">Quick Filters</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, bedrooms: '3', bathrooms: '2' }));
                    }}
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full"
                  >
                    Family Homes
                  </button>
                  <button
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, propertyTypes: ['Apartment'] }));
                    }}
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full"
                  >
                    Apartments
                  </button>
                  <button
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, price: '500000' }));
                    }}
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full"
                  >
                    Under $500k
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Bedrooms</label>
                <input
                  type="number"
                  value={filters.bedrooms}
                  onChange={(e) => setFilters((prev) => ({ ...prev, bedrooms: e.target.value }))}
                  placeholder="Enter min bedrooms"
                  className="w-full p-2 border rounded"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Bathrooms</label>
                <input
                  type="number"
                  value={filters.bathrooms}
                  onChange={(e) => setFilters((prev) => ({ ...prev, bathrooms: e.target.value }))}
                  placeholder="Enter min bathrooms"
                  className="w-full p-2 border rounded"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Property Type</label>
                <input
                  type="text"
                  value={filters.propertyTypes.join(', ')}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      propertyTypes: e.target.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean),
                    }))
                  }
                  placeholder="e.g., House, Apartment"
                  className="w-full p-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Suburb</label>
                <select
                  multiple
                  value={filters.suburbs}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      suburbs: Array.from(e.target.selectedOptions).map((option) => option.value),
                    }))
                  }
                  className="w-full p-2 border rounded h-24"
                >
                  {ALLOWED_SUBURBS.map((suburb) => (
                    <option key={`${suburb.name}-${suburb.postcode}`} value={suburb.name}>
                      {`${suburb.name} ${suburb.postcode}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Price</label>
                <input
                  type="number"
                  value={filters.price}
                  onChange={(e) => setFilters((prev) => ({ ...prev, price: e.target.value }))}
                  placeholder="Enter max price"
                  className="w-full p-2 border rounded"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Square Feet</label>
                <input
                  type="number"
                  value={filters.square_feet}
                  onChange={(e) => setFilters((prev) => ({ ...prev, square_feet: e.target.value }))}
                  placeholder="Enter min sq ft"
                  className="w-full p-2 border rounded"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Street Name</label>
                <input
                  type="text"
                  value={filters.street_name}
                  onChange={(e) => setFilters((prev) => ({ ...prev, street_name: e.target.value }))}
                  placeholder="Enter street name"
                  className="w-full p-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Garage</label>
                <input
                  type="number"
                  value={filters.car_garage}
                  onChange={(e) => setFilters((prev) => ({ ...prev, car_garage: e.target.value }))}
                  placeholder="Enter min garage"
                  className="w-full p-2 border rounded"
                  min="0"
                />
              </div>

              <div>
                <button
                  onClick={() => applyFiltersAndSearch()}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-4 mb-4">
          <button
            onClick={() => handleCategoryClick('Listing')}
            className={`px-4 py-2 rounded-lg ${filters.category === 'Listing' ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
          >
            Listings
          </button>
          <button
            onClick={() => handleCategoryClick('Sold')}
            className={`px-4 py-2 rounded-lg ${filters.category === 'Sold' ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
          >
            Sold
          </button>
          <button
            onClick={() => handleCategoryClick('Under Offer')}
            className={`px-4 py-2 rounded-lg ${filters.category === 'Under Offer' ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
          >
            Under Offer
          </button>
          <button
            onClick={() => handleCategoryClick('')}
            className={`px-4 py-2 rounded-lg ${filters.category === '' ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
          >
            All
          </button>
        </div>

        <div className="flex gap-4">
          <button
            onClick={generateReport}
            className="bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 flex items-center gap-2 shadow-md"
          >
            <Download className="w-5 h-5" /> Generate PDF Report
          </button>
          <button
            onClick={exportToCSV}
            className="bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 flex items-center gap-2 shadow-md"
          >
            <Download className="w-5 h-5" /> Export to CSV
          </button>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">Properties ({properties.length})</h2>
        {filters.category && <p className="text-gray-600 mb-4">Showing {filters.category} properties</p>}

        {properties.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg mb-4">No properties match your criteria.</p>
            <button
              onClick={clearAllFilters}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {properties.map((property) => (
              <motion.div
                key={property.id}
                className="bg-gray-50 p-4 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 group relative"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-xl font-semibold truncate">
                    {property.street_number && property.street_name
                      ? `${property.street_number} ${property.street_name}`
                      : property.address || 'Unknown Address'}
                  </h3>
                  <div className="relative group/badge">
                    <span
                      className={`px-3 py-1 text-sm font-medium rounded-full ${
                        predictions[property.id]?.recommendation === 'BUY'
                          ? 'bg-green-200 text-green-800'
                          : 'bg-red-200 text-red-800'
                      }`}
                    >
                      {predictions[property.id]?.recommendation || 'N/A'}
                    </span>
                    <span className="absolute hidden group-hover/badge:block bg-gray-800 text-white text-xs rounded py-1 px-2 -top-8 left-1/2 transform -translate-x-1/2">
                      Confidence: {predictions[property.id]?.confidence?.toFixed(2) || 'N/A'}%
                    </span>
                  </div>
                </div>
                <p className="text-gray-600 font-medium">
                  {property.suburb || 'Unknown Suburb'}
                </p>
                <p className="text-gray-600">Type: {property.property_type || 'Unknown'}</p>
                <p className="text-gray-600">Category: {property.category || 'Unknown'}</p>
                <p className="text-gray-600">
                  Beds: {property.bedrooms ?? 'N/A'} | Baths: {property.bathrooms ?? 'N/A'} | Garage:{' '}
                  {property.car_garage ?? 'N/A'}
                </p>
                <p className="text-green-600 font-bold mt-2">
                  {property.price ? formatCurrency(property.price) : 'Price N/A'}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setExpandedReport(expandedReport === property.id ? null : property.id)}
                    className="text-blue-600 hover:underline text-sm"
                  >
                    {expandedReport === property.id ? 'Hide Report' : 'Show Report'}
                  </button>
                  <Link
                    to={`/property-detail/${property.id}`}
                    state={{ property }}
                    className="text-blue-600 hover:underline text-sm"
                  >
                    Full Details
                  </Link>
                </div>

                <AnimatePresence>
                  {expandedReport === property.id && predictions[property.id] && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="mt-4 overflow-hidden"
                    >
                      <IndividualPropertyReport
                        property={property}
                        prediction={predictions[property.id]}
                        onUpdate={(updatedProperty: Property) => {
                          setProperties((prev) =>
                            prev.map((p) => (p.id === updatedProperty.id ? updatedProperty : p))
                          );
                        }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}