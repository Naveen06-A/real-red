import { useState, useEffect } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Mic, Search, Download, SlidersHorizontal, X, TrendingUp, BarChart2, PlusCircle, FileText, BarChart, Activity, CheckCircle, Home, Bath, Car } from 'lucide-react';
import { IndividualPropertyReport } from './IndividualPropertyReport';
import { supabase } from '../lib/supabase';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Property } from '../types/Property';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency } from '../utils/formatters';
import { toast } from 'react-toastify';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { normalizeSuburb } from '../utils/subrubUtils'; // Import normalizeSuburb

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface PredictionResult {
  recommendation: 'BUY' | 'SOLD';
  confidence: number;
  trend: number;
  historicalData: { dates: string[]; prices: number[] };
  marketCondition?: 'Rising' | 'Stable' | 'Declining';
  sentimentScore?: number;
}

interface SuburbProgress {
  suburb: string;
  totalProperties: number;
  listedProperties: number;
  soldProperties: number;
  unknownCategoryCount?: number; // Track properties with invalid/null categories
}

interface Filters {
  bedrooms: string;
  bathrooms: string;
  car_garage: string;
  square_feet: string;
  price: string;
  suburbs: string[];
  propertyTypes: string[];
  street_name: string;
  categories: string[];
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
  const [suburbProgress, setSuburbProgress] = useState<SuburbProgress[]>([]);
  const [selectedSuburb, setSelectedSuburb] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    bedrooms: '',
    bathrooms: '',
    car_garage: '',
    square_feet: '',
    price: '',
    suburbs: [],
    propertyTypes: [],
    street_name: '',
    categories: [],
  });

  useEffect(() => {
    if (profile?.role === 'agent') {
      fetchPropertiesAndPredict();
      fetchSuburbProgress();
    } else if (profile) {
      navigate('/agent-login');
    }
  }, [profile, navigate]);

  useEffect(() => {
    console.log('Filters changed:', { filters, searchQuery });
    applyFiltersAndSearch();
  }, [filters, searchQuery]);

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
          property.property_type || 'Unknown'
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

  const fetchSuburbProgress = async () => {
    try {
      const progressPromises = ALLOWED_SUBURBS.map(async (suburb) => {
        const normalizedSuburbName = normalizeSuburb(suburb.name);
        const { data: properties, error } = await supabase
          .from('properties')
          .select('id, category, suburb')
          .ilike('suburb', normalizedSuburbName); // Case-insensitive suburb match

        if (error) throw error;

        console.log(`Raw properties for ${normalizedSuburbName}:`, properties); // Debug log

        const totalProperties = properties?.length || 0;
        let listedProperties = 0;
        let soldProperties = 0;
        let unknownCategoryCount = 0;

        properties?.forEach((p) => {
          const category = (p.category || '').toLowerCase();
          if (category === 'listing') {
            listedProperties += 1;
          } else if (category === 'sold') {
            soldProperties += 1;
          } else {
            unknownCategoryCount += 1;
            console.warn(`Property ID ${p.id} in ${normalizedSuburbName} has invalid category: ${p.category}`);
          }
        });

        const progress: SuburbProgress = {
          suburb: normalizedSuburbName,
          totalProperties,
          listedProperties,
          soldProperties,
          unknownCategoryCount,
        };

        console.log(`Progress for ${normalizedSuburbName}:`, progress); // Debug log

        return progress;
      });

      const progressData = await Promise.all(progressPromises);
      console.log('All suburb progress data:', progressData);
      setSuburbProgress(progressData.filter(p => p.totalProperties > 0));

      // Warn if there are properties with unknown categories
      const totalUnknown = progressData.reduce((sum, p) => sum + (p.unknownCategoryCount || 0), 0);
      if (totalUnknown > 0) {
        toast.warn(`${totalUnknown} properties have invalid or missing categories. Check console for details.`);
      }
    } catch (error) {
      console.error('Error fetching suburb progress:', error);
      toast.error('Failed to fetch suburb progress data');
      setSuburbProgress([]);
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
      } else if (command.includes('show suburb progress')) {
        setSelectedSuburb(ALLOWED_SUBURBS[0].name);
      }
    };
    recognition.start();
  };

  const analyzePriceTrend = async (city: string, propertyType: string): Promise<PredictionResult> => {
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
        return {
          recommendation: 'BUY',
          confidence: 50,
          trend: 0,
          historicalData: { dates: [], prices: [] },
          sentimentScore: 0,
          marketCondition: 'Stable',
        };
      }

      const dates = historicalData.map((record) => new Date(record.sale_date).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }));
      const prices = historicalData.map((record) => record.price);
      const lastPrice = prices[prices.length - 1];
      const firstPrice = prices[0];
      const slope = ((lastPrice - firstPrice) / firstPrice) * 100;
      const marketCondition: PredictionResult['marketCondition'] = slope > 3 ? 'Rising' : slope < -3 ? 'Declining' : 'Stable';
      const recommendation: 'BUY' | 'SOLD' = slope >= 0 ? 'BUY' : 'SOLD';
      return {
        recommendation,
        confidence: Math.min(Math.abs(slope) * 2, 95),
        trend: slope,
        historicalData: { dates, prices },
        sentimentScore: Math.random() * 100 - 50,
        marketCondition,
      };
    } catch (error) {
      console.error('Price trend analysis failed:', error);
      return {
        recommendation: 'BUY',
        confidence: 50,
        trend: 0,
        historicalData: { dates: [], prices: [] },
        sentimentScore: 0,
        marketCondition: 'Stable',
      };
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

      // Apply category filter only if explicitly set
      if (filters.categories.length > 0) {
        console.log('Filtering by categories (in):', filters.categories);
        queryBuilder = queryBuilder.in('category', filters.categories.map(c => c.toLowerCase()));
      } else {
        console.log('No category filter applied, fetching all properties');
      }

      // Apply search query if present
      if (query) {
        queryBuilder = queryBuilder.or(
          `property_type.ilike.%${query}%,street_name.ilike.%${query}%,address.ilike.%${query}%`
        );
      }

      // Apply other filters
      if (filters.bedrooms) queryBuilder = queryBuilder.gte('bedrooms', parseInt(filters.bedrooms) || 0);
      if (filters.bathrooms) queryBuilder = queryBuilder.gte('bathrooms', parseInt(filters.bathrooms) || 0);
      if (filters.car_garage) queryBuilder = queryBuilder.gte('car_garage', parseInt(filters.car_garage) || 0);
      if (filters.square_feet) queryBuilder = queryBuilder.gte('square_feet', parseInt(filters.square_feet) || 0);
      if (filters.price) queryBuilder = queryBuilder.lte('price', parseInt(filters.price) || 0);
      if (filters.suburbs.length > 0) queryBuilder = queryBuilder.in('suburb', filters.suburbs.map(normalizeSuburb));
      if (filters.propertyTypes.length > 0) queryBuilder = queryBuilder.in('property_type', filters.propertyTypes);
      if (filters.street_name) queryBuilder = queryBuilder.ilike('street_name', `%${filters.street_name}%`);

      const { data, error } = await queryBuilder.order('listed_date', { ascending: false });
      if (error) throw error;

      console.log('Filtered properties:', data);
      setProperties(data || []);
      setError(data?.length === 0 ? 'No properties match the applied filters.' : null);

      // Fetch predictions for filtered properties
      const predictionPromises = (data || []).map(async (property) => {
        const prediction = await analyzePriceTrend(
          property.city || property.suburb || 'Unknown',
          property.property_type || 'Unknown'
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
    if (filters.categories.length > 0) count++;
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
      categories: [],
    });
    applyFiltersAndSearch('');
  };

  const handleCategoryClick = (category: string) => {
    console.log('Category clicked:', category);
    setFilters((prev) => {
      const newCategories = prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category];
      return { ...prev, categories: newCategories };
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
      (typeof value === 'string' && value && value !== '') || (Array.isArray(value) && value.length > 0)
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
    doc.text('Suburb Progress Summary', 20, yPos + 10);
    doc.setFontSize(10);
    yPos += 20;
    suburbProgress.forEach((progress) => {
      doc.text(`${progress.suburb}:`, 20, yPos);
      doc.text(`Listed Properties: ${progress.listedProperties}`, 40, yPos + 5);
      doc.text(`Sold Properties: ${progress.soldProperties}`, 40, yPos + 10);
      if (progress.unknownCategoryCount && progress.unknownCategoryCount > 0) {
        doc.text(`Unknown Category: ${progress.unknownCategoryCount}`, 40, yPos + 15);
        yPos += 5;
      }
      yPos += 20;
    });

    doc.setFontSize(14);
    doc.text('Summary Statistics', 20, yPos + 10);
    doc.setFontSize(10);
    yPos += 20;
    const avgPrice = properties.reduce((sum, p) => sum + (p.price || 0), 0) / properties.length || 0;
    doc.text(`Total Properties: ${properties.length}`, 20, yPos);
    doc.text(`Sold Properties: ${properties.filter(p => p.category?.toLowerCase() === 'sold').length}`, 20, yPos + 10);
    doc.text(`Average Price: ${formatCurrency(avgPrice)}`, 20, yPos + 20);

    yPos += 30;
    const tableData = properties.map((p) => [
      p.street_number && p.street_name ? `${p.street_number} ${p.street_name}` : p.address || 'N/A',
      normalizeSuburb(p.suburb || 'N/A'),
      p.street_name || 'N/A',
      p.bedrooms ?? 'N/A',
      p.bathrooms ?? 'N/A',
      p.car_garage ?? 'N/A',
      p.price ? formatCurrency(p.price) : 'N/A',
      p.agent_name || 'N/A',
      p.category || 'N/A',
    ]);
    (doc as any).autoTable({
      head: [['Address', 'Suburb', 'Street', 'Bedrooms', 'Bathrooms', 'Garage', 'Price', 'Agent', 'Status']],
      body: tableData,
      startY: yPos,
      styles: { fontSize: 8 },
    });

    doc.save(`agent_dashboard_report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToCSV = () => {
    const headers = ['Address', 'Suburb', 'Street', 'Bedrooms', 'Bathrooms', 'Garage', 'Price', 'Agent', 'Status'];
    const rows = properties.map((p) => [
      `"${p.street_number && p.street_name ? `${p.street_number} ${p.street_name}` : p.address || 'N/A'}"`,
      `"${normalizeSuburb(p.suburb || 'N/A')}"`,
      `"${p.street_name || 'N/A'}"`,
      p.bedrooms ?? 'N/A',
      p.bathrooms ?? 'N/A',
      p.car_garage ?? 'N/A',
      p.price ? formatCurrency(p.price) : 'N/A',
      `"${p.agent_name || 'N/A'}"`,
      `"${p.category || 'N/A'}"`,
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

  const chartData = suburbProgress.length ? {
    labels: suburbProgress.map(p => p.suburb),
    datasets: [
      {
        label: 'Listed Properties',
        data: suburbProgress.map(p => p.listedProperties),
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
      },
      {
        label: 'Sold Properties',
        data: suburbProgress.map(p => p.soldProperties),
        backgroundColor: 'rgba(239, 68, 68, 0.6)',
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 1,
      },
    ],
  } : {
    labels: ['No Data'],
    datasets: [
      {
        label: 'Listed Properties',
        data: [0],
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
      },
      {
        label: 'Sold Properties',
        data: [0],
        backgroundColor: 'rgba(239, 68, 68, 0.6)',
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          font: { size: 12 },
          color: '#1F2937',
          padding: 15,
        },
      },
      title: {
        display: true,
        text: 'Suburb Property Status',
        font: { size: 16 },
        color: '#1F2937',
        padding: { top: 10, bottom: 10 },
      },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleFont: { size: 12 },
        bodyFont: { size: 12 },
        callbacks: {
          label: (context: any) => `${context.dataset.label}: ${context.parsed.y}`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#1F2937',
          font: { size: 10 },
          maxRotation: 45,
          minRotation: 45,
          autoSkip: false,
        },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: '#1F2937',
          stepSize: 1,
          callback: (tickValue: string | number) => {
            const value = typeof tickValue === 'string' ? parseFloat(tickValue) : tickValue;
            return Number.isFinite(value) ? `${value}` : '';
          },
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
      },
    },
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
    soldCount: properties.filter((p) => p.category?.toLowerCase() === 'sold').length,
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
        <Link to="/property-form" className="bg-blue-600 text-white p-6 rounded-lg hover:bg-blue-700 transition flex flex-col items-center justify-center">
          <PlusCircle className="w-8 h-8 mb-2" />
          <h2 className="text-xl font-semibold text-center">Add Property</h2>
        </Link>
        <Link to="/marketing-plan" className="bg-purple-600 text-white p-6 rounded-lg hover:bg-purple-700 transition flex flex-col items-center justify-center">
          <FileText className="w-8 h-8 mb-2" />
          <h2 className="text-xl font-semibold text-center">Marketing Plan</h2>
        </Link>
        <Link to="/reports" className="bg-green-600 text-white p-6 rounded-lg hover:bg-green-700 transition flex flex-col items-center justify-center">
          <BarChart className="w-8 h-8 mb-2" />
          <h2 className="text-xl font-semibold text-center">Reports</h2>
        </Link>
        <Link to="/activity-logger" className="bg-orange-600 text-white p-6 rounded-lg hover:bg-orange-700 transition flex flex-col items-center justify-center">
          <Activity className="w-8 h-8 mb-2" />
          <h2 className="text-xl font-semibold text-center">Activity Logger</h2>
        </Link>
        <Link to="/progress-report" className="bg-teal-600 text-white p-6 rounded-lg hover:bg-teal-700 transition flex flex-col items-center justify-center">
          <CheckCircle className="w-8 h-8 mb-2" />
          <h2 className="text-xl font-semibold text-center">Progress Report</h2>
        </Link>
      </div>

      <div className="mb-8 p-4 bg-blue-50 rounded-lg shadow-md flex items-center gap-4">
        <TrendingUp className="w-6 h-6 text-blue-600" />
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Market Insights</h3>
          <p className="text-sm text-gray-600">Total Properties: {marketInsights.totalProperties}</p>
          <p className="text-sm text-gray-600">Sold Properties: {marketInsights.soldCount}</p>
          <p className="text-sm text-gray-600">Avg Price: {formatCurrency(marketInsights.avgPrice)}</p>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">Suburb Progress Plan</h2>
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 mb-6">
          <div className="flex items-center gap-4 mb-4">
            <BarChart2 className="w-6 h-6 text-blue-600" />
            <select
              value={selectedSuburb || ''}
              onChange={(e) => setSelectedSuburb(e.target.value || null)}
              className="p-2 border rounded-lg"
            >
              <option value="">Select a suburb</option>
              {ALLOWED_SUBURBS.map(suburb => (
                <option key={suburb.name} value={suburb.name}>{normalizeSuburb(suburb.name)}</option>
              ))}
            </select>
          </div>

          {suburbProgress.length === 0 ? (
            <div className="text-center py-4 text-gray-600">
              No suburb progress data available. Please check your data source or refresh.
            </div>
          ) : (
            <>
              <div className="mb-6" style={{ height: '300px', position: 'relative' }}>
                <Bar data={chartData} options={chartOptions} />
              </div>
              {suburbProgress.some(p => p.unknownCategoryCount && p.unknownCategoryCount > 0) && (
                <div className="bg-yellow-50 p-4 rounded-lg mb-4">
                  <p className="text-yellow-700 text-sm">
                    Warning: Some properties have invalid or missing categories, which may affect counts. Check console logs for details.
                  </p>
                </div>
              )}
            </>
          )}

          {selectedSuburb && suburbProgress.find(p => p.suburb === normalizeSuburb(selectedSuburb)) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              {(() => {
                const progress = suburbProgress.find(p => p.suburb === normalizeSuburb(selectedSuburb));
                if (!progress) return null;
                return (
                  <>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold text-gray-800">Listed Properties</h3>
                      <p className="text-2xl font-bold text-blue-600">{progress.listedProperties}</p>
                      <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                        <div
                          className="bg-blue-600 h-2.5 rounded-full"
                          style={{ width: `${(progress.listedProperties / (progress.totalProperties || 1)) * 100}%` }}
                        ></div>
                      </div>
                      <p className="text-sm text-gray-600 mt-2">
                        {progress.listedProperties} of {progress.totalProperties} ({((progress.listedProperties / (progress.totalProperties || 1)) * 100).toFixed(1)}%)
                      </p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold text-gray-800">Sold Properties</h3>
                      <p className="text-2xl font-bold text-red-600">{progress.soldProperties}</p>
                      <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                        <div
                          className="bg-red-600 h-2.5 rounded-full"
                          style={{ width: `${(progress.soldProperties / (progress.totalProperties || 1)) * 100}%` }}
                        ></div>
                      </div>
                      <p className="text-sm text-gray-600 mt-2">
                        {progress.soldProperties} of {progress.totalProperties} ({((progress.soldProperties / (progress.totalProperties || 1)) * 100).toFixed(1)}%)
                      </p>
                    </div>
                    {progress.unknownCategoryCount && progress.unknownCategoryCount > 0 && (
                      <div className="bg-yellow-50 p-4 rounded-lg col-span-2">
                        <h3 className="text-lg font-semibold text-gray-800">Data Issue</h3>
                        <p className="text-sm text-yellow-700">
                          {progress.unknownCategoryCount} properties in {progress.suburb} have invalid or missing categories. Please update the database.
                        </p>
                      </div>
                    )}
                  </>
                );
              })()}
            </motion.div>
          )}
        </div>

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
              if ((typeof value === 'string' && value && value !== '') || (Array.isArray(value) && value.length > 0)) {
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
                      {`${normalizeSuburb(suburb.name)} ${suburb.postcode}`}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  multiple
                  value={filters.categories}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      categories: Array.from(e.target.selectedOptions).map((option) => option.value),
                    }))
                  }
                  className="w-full p-2 border rounded h-24"
                >
                  {['Listing', 'Sold'].map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
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
          {['Listing', 'Sold'].map((category) => (
            <button
              key={category}
              onClick={() => handleCategoryClick(category)}
              className={`px-4 py-2 rounded-lg ${
                filters.categories.includes(category)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}
            >
              {category}
            </button>
          ))}
          <button
            onClick={() => setFilters((prev) => ({ ...prev, categories: [] }))}
            className={`px-4 py-2 rounded-lg ${
              filters.categories.length === 0 ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'
            }`}
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
        {filters.categories.length > 0 && (
          <p className="text-gray-600 mb-4">Showing {filters.categories.join(', ')} properties</p>
        )}

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
                  <span
                    className={`px-3 py-1 text-sm font-medium rounded-full ${
                      property.category?.toLowerCase() === 'sold'
                        ? 'bg-red-200 text-red-800'
                        : property.category?.toLowerCase() === 'listing'
                        ? 'bg-blue-200 text-blue-800'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    {property.category || 'N/A'}
                  </span>
                </div>
                <p className="text-gray-600 font-medium">
                  {normalizeSuburb(property.suburb || 'Unknown Suburb')}
                </p>
                <p className="text-gray-600">Type: {property.property_type || 'Unknown'}</p>
                <div className="flex items-center text-gray-600 space-x-4 mt-2">
                  <div className="flex items-center">
                    <Home className="w-4 h-4 mr-1" />
                    <span>{property.bedrooms ?? 'N/A'}</span>
                  </div>
                  <div className="flex items-center">
                    <Bath className="w-4 h-4 mr-1" />
                    <span>{property.bathrooms ?? 'N/A'}</span>
                  </div>
                  <div className="flex items-center">
                    <Car className="w-4 h-4 mr-1" />
                    <span>{property.car_garage ?? 'N/A'}</span>
                  </div>
                </div>
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