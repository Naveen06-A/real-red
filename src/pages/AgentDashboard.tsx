import { useState, useEffect, useCallback } from 'react';
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
  avgDaysOnMarket: number;
  conversionRate: number;
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
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const fetchAvailableCategories = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('category')
        .not('category', 'is', null);
      if (error) throw error;
      const categories = [...new Set(data?.map(d => d.category?.trim()))].filter(c => c);
      console.debug('Available categories:', categories);
      setAvailableCategories(categories);
      return categories;
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('Failed to fetch property categories');
      return [];
    }
  }, []);

  const fetchPropertiesAndPredict = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      console.debug('Fetching properties...');
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('listed_date', { ascending: false });
      if (error) throw error;

      console.debug('Fetched properties:', data);
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
  }, []);

  const fetchSuburbProgress = useCallback(async () => {
    try {
      console.debug('Fetching suburb progress...');
      const progressPromises = ALLOWED_SUBURBS.map(async (suburb) => {
        const { data: properties, error } = await supabase
          .from('properties')
          .select('id, category, listed_date, sold_date')
          .ilike('suburb', suburb.name);
        if (error) throw error;

        const totalProperties = properties?.length || 0;
        const listedProperties = properties?.filter(p => p.category?.toLowerCase() === 'listing').length || 0;
        const soldProperties = properties?.filter(p => p.category?.toLowerCase() === 'sold').length || 0;

        const avgDaysOnMarket = properties
          ?.filter(p => p.sold_date && p.listed_date)
          .map(p => {
            const listed = new Date(p.listed_date);
            const sold = new Date(p.sold_date);
            return (sold.getTime() - listed.getTime()) / (1000 * 60 * 60 * 24);
          })
          .reduce((sum, days) => sum + days, 0) / (soldProperties || 1) || 0;

        return {
          suburb: suburb.name,
          totalProperties,
          listedProperties,
          soldProperties,
          avgDaysOnMarket: Math.round(avgDaysOnMarket),
          conversionRate: totalProperties ? (soldProperties / totalProperties) * 100 : 0,
        };
      });

      const progressData = await Promise.all(progressPromises);
      console.debug('Suburb progress data:', progressData);
      setSuburbProgress(progressData.filter(p => p.totalProperties > 0));
    } catch (error) {
      console.error('Error fetching suburb progress:', error);
      toast.error('Failed to fetch suburb progress data');
      setSuburbProgress([]);
    }
  }, []);

  useEffect(() => {
    console.debug('Checking auth state:', { user, profile });
    if (!user || !profile) {
      console.debug('No user or profile, redirecting to login');
      navigate('/agent-login');
      return;
    }
    if (profile?.role === 'agent') {
      console.debug('Fetching properties, suburb progress, and categories for agent');
      fetchPropertiesAndPredict();
      fetchSuburbProgress();
      fetchAvailableCategories();
    } else {
      console.debug('User is not an agent, redirecting to login');
      navigate('/agent-login');
    }
  }, [profile, user, navigate, fetchPropertiesAndPredict, fetchSuburbProgress, fetchAvailableCategories]);

  const applyFiltersAndSearch = useCallback(async (query: string = '') => {
    setLoading(true);
    setError(null);
    try {
      console.debug('Applying filters:', { query, filters });
      let queryBuilder = supabase.from('properties').select('*');

      const sanitizedFilters = {
        ...filters,
        bedrooms: filters.bedrooms ? parseInt(filters.bedrooms, 10) : null,
        bathrooms: filters.bathrooms ? parseInt(filters.bathrooms, 10) : null,
        car_garage: filters.car_garage ? parseInt(filters.car_garage, 10) : null,
        square_feet: filters.square_feet ? parseInt(filters.square_feet, 10) : null,
        price: filters.price ? parseInt(filters.price, 10) : null,
      };

      // Log unique suburb and category values in database for debugging
      const { data: debugData, error: debugError } = await supabase
        .from('properties')
        .select('suburb, category');
      if (debugError) {
        console.error('Debug data fetch error:', debugError);
      } else {
        console.debug('Database values:', {
          suburbs: [...new Set(debugData?.map(d => d.suburb?.trim()))],
          categories: [...new Set(debugData?.map(d => d.category?.trim()))],
        });
      }

      // Apply category filter with case-insensitive matching
      if (filters.categories.length > 0) {
        console.debug('Applying category filter:', filters.categories);
        queryBuilder = queryBuilder.or(
          filters.categories.map(c => `category.ilike.${c.trim()}`).join(',')
        );
      }

      if (query.trim()) {
        console.debug('Applying search query:', query.trim());
        queryBuilder = queryBuilder.or(
          `property_type.ilike.%${query.trim()}%,street_name.ilike.%${query.trim()}%,address.ilike.%${query.trim()}%,suburb.ilike.%${query.trim()}%`
        );
      }
      if (sanitizedFilters.bedrooms && !isNaN(sanitizedFilters.bedrooms)) {
        console.debug('Applying bedrooms filter:', sanitizedFilters.bedrooms);
        queryBuilder = queryBuilder.eq('bedrooms', sanitizedFilters.bedrooms);
      }
      if (sanitizedFilters.bathrooms && !isNaN(sanitizedFilters.bathrooms)) {
        console.debug('Applying bathrooms filter:', sanitizedFilters.bathrooms);
        queryBuilder = queryBuilder.eq('bathrooms', sanitizedFilters.bathrooms);
      }
      if (sanitizedFilters.car_garage && !isNaN(sanitizedFilters.car_garage)) {
        console.debug('Applying car_garage filter:', sanitizedFilters.car_garage);
        queryBuilder = queryBuilder.eq('car_garage', sanitizedFilters.car_garage);
      }
      if (sanitizedFilters.square_feet && !isNaN(sanitizedFilters.square_feet)) {
        console.debug('Applying square_feet filter:', sanitizedFilters.square_feet);
        queryBuilder = queryBuilder.gte('square_feet', sanitizedFilters.square_feet);
      }
      if (sanitizedFilters.price && !isNaN(sanitizedFilters.price)) {
        console.debug('Applying price filter:', sanitizedFilters.price);
        queryBuilder = queryBuilder.lte('price', sanitizedFilters.price);
      }
      if (filters.suburbs.length > 0) {
        console.debug('Applying suburbs filter:', filters.suburbs);
        queryBuilder = queryBuilder.or(
          filters.suburbs.map(s => `suburb.ilike.${s.trim()}`).join(',')
        );
      }
      if (filters.propertyTypes.length > 0) {
        console.debug('Applying propertyTypes filter:', filters.propertyTypes);
        queryBuilder = queryBuilder.or(
          filters.propertyTypes.map(p => `property_type.ilike.${p.trim()}`).join(',')
        );
      }
      if (filters.street_name.trim()) {
        console.debug('Applying street_name filter:', filters.street_name.trim());
        queryBuilder = queryBuilder.ilike('street_name', `%${filters.street_name.trim()}%`);
      }

      const { data, error } = await queryBuilder.order('listed_date', { ascending: false });
      if (error) throw error;

      console.debug('Query result:', { count: data?.length || 0, data });
      setProperties(data || []);

      if (data?.length === 0) {
        const categories = await fetchAvailableCategories();
        const errorMessage = filters.categories.length > 0
          ? `No properties found for status: ${filters.categories.join(', ')}. Available categories: ${categories.join(', ') || 'none'}. Check database or adjust filters.`
          : 'No properties match the applied filters. Try adjusting your filters or check if data exists.';
        setError(errorMessage);
      } else {
        setError(null);
      }

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
      console.error('Error applying filters:', error);
      setError('Failed to apply filters. Please try again or check your data.');
      toast.error('Failed to apply filters');
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }, [filters, searchQuery, fetchAvailableCategories]);

  useEffect(() => {
    const timer = setTimeout(() => {
      applyFiltersAndSearch();
    }, 300);
    return () => clearTimeout(timer);
  }, [filters, searchQuery, applyFiltersAndSearch]);

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
      console.error('Error analyzing price trend:', error);
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

  const fetchSuggestions = async (query: string) => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    try {
      console.debug('Fetching suggestions for query:', query);
      const { data, error } = await supabase
        .from('properties')
        .select('property_type, street_name, suburb')
        .or(`property_type.ilike.%${query.trim()}%,street_name.ilike.%${query.trim()}%,suburb.ilike.%${query.trim()}%`)
        .limit(10);
      if (error) throw error;

      const suggestionSet = new Set<string>();
      (data || []).forEach((property: any) => {
        if (property.property_type?.toLowerCase().includes(query.toLowerCase())) suggestionSet.add(property.property_type);
        if (property.street_name?.toLowerCase().includes(query.toLowerCase())) suggestionSet.add(property.street_name);
        if (property.suburb?.toLowerCase().includes(query.toLowerCase())) suggestionSet.add(property.suburb);
      });
      const suggestionsList = Array.from(suggestionSet).slice(0, 5);
      console.debug('Suggestions:', suggestionsList);
      setSuggestions(suggestionsList);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      setSuggestions([]);
    }
  };

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    fetchSuggestions(value);
  }, []);

  const handleSuggestionClick = (suggestion: string) => {
    setSearchQuery(suggestion);
    setSuggestions([]);
    applyFiltersAndSearch(suggestion);
  };

  const handleSearchSubmit = () => {
    applyFiltersAndSearch(searchQuery);
  };

  const countActiveFilters = useCallback(() => {
    let count = 0;
    if (searchQuery.trim()) count++;
    if (filters.bedrooms) count++;
    if (filters.bathrooms) count++;
    if (filters.car_garage) count++;
    if (filters.square_feet) count++;
    if (filters.price) count++;
    if (filters.suburbs.length > 0) count++;
    if (filters.propertyTypes.length > 0) count++;
    if (filters.street_name.trim()) count++;
    if (filters.categories.length > 0) count++;
    return count;
  }, [filters, searchQuery]);

  const clearAllFilters = () => {
    console.debug('Clearing all filters');
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
    setFilters((prev) => {
      const newCategories = prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category];
      return { ...prev, categories: newCategories };
    });
  };

  const generateReport = () => {
    setIsGeneratingPDF(true);
    console.debug('Starting PDF generation...');
    try {
      // Verify jsPDF and autoTable availability
      if (!jsPDF) {
        throw new Error('jsPDF library is not loaded');
      }
      if (!(window as any).jspdf?.autoTable) {
        throw new Error('jspdf-autotable plugin is not loaded');
      }

      console.debug('Creating new jsPDF instance...');
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      let yPos = margin;

      // Validate data
      console.debug('Validating data...', {
        properties: properties.length,
        suburbProgress: suburbProgress.length,
        filters: Object.keys(filters).length,
        profile: !!profile,
      });
      if (!Array.isArray(properties)) {
        throw new Error('Properties data is not an array');
      }
      if (!Array.isArray(suburbProgress)) {
        throw new Error('Suburb progress data is not an array');
      }

      // Set font
      console.debug('Setting font...');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(16);

      // Header
      console.debug('Adding header...');
      doc.setTextColor(0, 0, 0);
      doc.text('Agent Property Report', margin, yPos);
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Generated on: ${new Date().toLocaleDateString('en-AU')} by ${profile?.name || 'Agent'}`,
        pageWidth - margin - 60,
        yPos
      );
      yPos += 15;

      // Summary Statistics (simplified to isolate issue)
      console.debug('Adding summary statistics...');
      doc.setFontSize(12);
      doc.text('Summary Statistics', margin, yPos);
      yPos += 8;
      doc.setFontSize(10);
      const avgPrice = properties.reduce((sum, p) => sum + (p.price || 0), 0) / (properties.length || 1);
      const stats = [
        `Total Properties: ${properties.length}`,
        `Sold Properties: ${properties.filter(p => p.category?.toLowerCase() === 'sold').length}`,
        `Average Price: ${formatCurrency(avgPrice)}`,
      ];
      stats.forEach((stat) => {
        doc.text(stat, margin, yPos);
        yPos += 7;
        if (yPos > pageHeight - margin - 10) {
          console.debug('Adding new page for stats...');
          doc.addPage();
          yPos = margin;
        }
      });
      yPos += 10;

      // Properties Table
      console.debug('Preparing properties table...');
      doc.setFontSize(12);
      doc.text('Properties', margin, yPos);
      yPos += 8;
      if (properties.length === 0) {
        console.debug('No properties to display...');
        doc.setFontSize(10);
        doc.text('No properties available', margin, yPos);
        yPos += 10;
      } else {
        // Define table headers and column widths
        const headers = ['Address', 'Suburb', 'Price', 'Status'];
        const columnWidths = [60, 40, 40, 30];

        // Prepare table data with strict validation
        console.debug('Validating table data...');
        const tableData = properties.map((p, index) => {
          try {
            return [
              `${p.street_number || ''} ${p.street_name || ''}`.trim() || p.address || 'N/A',
              p.suburb || 'N/A',
              p.price ? formatCurrency(p.price) : 'N/A',
              p.category || 'N/A',
            ];
          } catch (e) {
            console.error(`Error processing property at index ${index}:`, p, e);
            return ['Error', 'Error', 'Error', 'Error'];
          }
        });

        console.debug('Generating table with', tableData.length, 'rows...');
        (doc as any).autoTable({
          head: [headers],
          body: tableData,
          startY: yPos,
          margin: { left: margin, right: margin },
          styles: {
            fontSize: 8,
            cellPadding: 2,
            overflow: 'linebreak',
            minCellHeight: 6,
          },
          headStyles: {
            fillColor: [0, 102, 204],
            textColor: [255, 255, 255],
            fontSize: 9,
            fontStyle: 'bold',
          },
          columnStyles: headers.reduce((acc, _, index) => {
            acc[index] = { cellWidth: columnWidths[index] };
            return acc;
          }, {} as Record<number, { cellWidth: number }>),
          didDrawPage: (data: any) => {
            console.debug('Table page drawn, updating yPos:', data.cursor.y);
            yPos = data.cursor.y + 10;
          },
          didParseCell: (data: any) => {
            if (data.section === 'body' && data.cell.text.length > 1) {
              console.debug(`Parsing cell in column ${data.column.index}:`, data.cell.text);
              data.cell.text = doc.splitTextToSize(data.cell.text.join(''), columnWidths[data.column.index] - 4);
            }
          },
        });
      }

      // Add footer
      console.debug('Adding footer...');
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin - 20, pageHeight - margin);
      }

      // Save the PDF
      console.debug('Saving PDF...');
      const fileName = `agent_dashboard_report_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      console.debug('PDF generated successfully:', fileName);
      toast.success('PDF report generated successfully!');
    } catch (error: any) {
      console.error('Error generating PDF report:', {
        message: error.message,
        stack: error.stack,
        properties: properties.length,
        suburbProgress: suburbProgress.length,
      });
      toast.error('Failed to generate PDF report. Check console for details.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const exportToCSV = () => {
    try {
      const headers = ['Address', 'Suburb', 'Street', 'Bedrooms', 'Bathrooms', 'Garage', 'Price', 'Agent', 'Status'];
      const rows = properties.map((p) => [
        `"${p.street_number && p.street_name ? `${p.street_number} ${p.street_name}` : p.address || 'N/A'}"`,
        `"${p.suburb || 'N/A'}"`,
        `"${p.street_name || 'N/A'}"`,
        p.bedrooms != null ? p.bedrooms.toString() : 'N/A',
        p.bathrooms != null ? p.bathrooms.toString() : 'N/A',
        p.car_garage != null ? p.car_garage.toString() : 'N/A',
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
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast.error('Failed to export CSV');
    }
  };

  const chartData = suburbProgress.length ? {
    labels: suburbProgress.map(p => p.suburb),
    datasets: [
      {
        label: 'Listing Progress (%)',
        data: suburbProgress.map(p => Number(((p.listedProperties / (p.totalProperties || 1)) * 100).toFixed(1))),
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
      },
      {
        label: 'Sold Properties (%)',
        data: suburbProgress.map(p => Number(((p.soldProperties / (p.totalProperties || 1)) * 100).toFixed(1))),
        backgroundColor: 'rgba(239, 68, 68, 0.6)',
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 1,
      },
      {
        label: 'Conversion Rate (%)',
        data: suburbProgress.map(p => Number(p.conversionRate.toFixed(1))),
        backgroundColor: 'rgba(16, 185, 129, 0.6)',
        borderColor: 'rgb(16, 185, 129)',
        borderWidth: 1,
      },
    ],
  } : {
    labels: ['No Data'],
    datasets: [
      {
        label: 'Listing Progress (%)',
        data: [0],
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
      },
      {
        label: 'Sold Properties (%)',
        data: [0],
        backgroundColor: 'rgba(239, 68, 68, 0.6)',
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 1,
      },
      {
        label: 'Conversion Rate (%)',
        data: [0],
        backgroundColor: 'rgba(16, 185, 129, 0.6)',
        borderColor: 'rgb(16, 185, 129)',
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
        text: 'Suburb Progress Overview',
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
          label: (context: any) => `${context.dataset.label}: ${context.parsed.y}%`,
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
        max: 100,
        ticks: {
          color: '#1F2937',
          stepSize: 20,
          callback: (tickValue: string | number) => {
            const value = typeof tickValue === 'string' ? parseFloat(tickValue) : tickValue;
            return Number.isFinite(value) ? `${value}%` : '';
          },
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
      },
    },
  };

  if (loading) {
    return <LoadingOverlay message="Loading dashboard..." />;
  }

  if (!user || !profile || profile?.role !== 'agent') {
    console.debug('Rendering redirect to /agent-login');
    return <Navigate to="/agent-login" />;
  }

  const marketInsights = {
    totalProperties: properties.length,
    avgPrice: properties.reduce((sum, p) => sum + (p.price || 0), 0) / (properties.length || 1),
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
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="p-2 rounded-full bg-gray-200 hover:bg-gray-300"
          >
            {showDebug ? 'Hide Debug' : 'Show Debug'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 p-4 rounded-lg shadow-md mb-8">
          <p className="text-red-600">{error}</p>
          <div className="flex gap-4 mt-4">
            <button
              onClick={clearAllFilters}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Reset Filters
            </button>
            <button
              onClick={fetchPropertiesAndPredict}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {showDebug && (
        <div className="bg-yellow-50 p-4 rounded-lg shadow-md mb-8">
          <h3 className="text-lg font-semibold text-gray-800">Debug Information</h3>
          <p className="text-sm text-gray-600">Available Categories: {availableCategories.join(', ') || 'None'}</p>
          <p className="text-sm text-gray-600">Current Filter: {filters.categories.join(', ') || 'None'}</p>
          <button
            onClick={fetchAvailableCategories}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Refresh Categories
          </button>
        </div>
      )}

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
          <p className="text-sm text-gray-600">Average Price: {formatCurrency(marketInsights.avgPrice)}</p>
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
                <option key={suburb.name} value={suburb.name}>{suburb.name}</option>
              ))}
            </select>
          </div>

          {suburbProgress.length === 0 ? (
            <div className="text-center py-4 text-gray-600">
              No suburb progress data available. Please try refreshing or check your data source.
            </div>
          ) : (
            <div className="mb-6" style={{ height: '300px', position: 'relative' }}>
              <Bar data={chartData} options={chartOptions} />
            </div>
          )}

          {selectedSuburb && suburbProgress.find(p => p.suburb === selectedSuburb) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 md:grid-cols-4 gap-4"
            >
              {(() => {
                const progress = suburbProgress.find(p => p.suburb === selectedSuburb);
                if (!progress) return null;
                return (
                  <>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold">Listing Progress</h3>
                      <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                        <div
                          className="bg-blue-600 h-2.5 rounded-full"
                          style={{ width: `${(progress.listedProperties / (progress.totalProperties || 1)) * 100}%` }}
                        ></div>
                      </div>
                      <p className="text-sm text-gray-600 mt-2">
                        {progress.listedProperties}/{progress.totalProperties} ({((progress.listedProperties / (progress.totalProperties || 1)) * 100).toFixed(1)}%)
                      </p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold">Sold Properties</h3>
                      <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                        <div
                          className="bg-red-600 h-2.5 rounded-full"
                          style={{ width: `${(progress.soldProperties / (progress.totalProperties || 1)) * 100}%` }}
                        ></div>
                      </div>
                      <p className="text-sm text-gray-600 mt-2">
                        {progress.soldProperties}/{progress.totalProperties} ({((progress.soldProperties / (progress.totalProperties || 1)) * 100).toFixed(1)}%)
                      </p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold">Conversion Rate</h3>
                      <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                        <div
                          className="bg-green-600 h-2.5 rounded-full"
                          style={{ width: `${progress.conversionRate}%` }}
                        ></div>
                      </div>
                      <p className="text-sm text-gray-600 mt-2">{progress.conversionRate.toFixed(1)}%</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold">Avg Days on Market</h3>
                      <p className="text-2xl font-bold text-blue-600">{progress.avgDaysOnMarket}</p>
                      <p className="text-sm text-gray-600">days</p>
                    </div>
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
              placeholder="Search properties (e.g., house, street, suburb)..."
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
            {searchQuery.trim() && (
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
              if ((typeof value === 'string' && value.trim()) || (Array.isArray(value) && value.length > 0)) {
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
                      setFilters((prev) => ({ ...prev, bedrooms: '3', bathrooms: '2', propertyTypes: ['House'] }));
                    }}
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full"
                  >
                    Family Homes
                  </button>
                  <button
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, propertyTypes: ['Apartment'], bedrooms: '1', bathrooms: '1' }));
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Bedrooms</label>
                <input
                  type="number"
                  value={filters.bedrooms}
                  onChange={(e) => setFilters((prev) => ({ ...prev, bedrooms: e.target.value }))}
                  placeholder="Enter number of bedrooms"
                  className="w-full p-2 border rounded"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bathrooms</label>
                <input
                  type="number"
                  value={filters.bathrooms}
                  onChange={(e) => setFilters((prev) => ({ ...prev, bathrooms: e.target.value }))}
                  placeholder="Enter number of bathrooms"
                  className="w-full p-2 border rounded"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Property Type</label>
                <select
                  multiple
                  value={filters.propertyTypes}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      propertyTypes: Array.from(e.target.selectedOptions).map((option) => option.value),
                    }))
                  }
                  className="w-full p-2 border rounded h-24"
                >
                  {['House', 'Apartment', 'Townhouse', 'Unit'].map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
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
                  step="1000"
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
                  {availableCategories.length > 0 ? (
                    availableCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))
                  ) : (
                    <option disabled>No categories available</option>
                  )}
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
          {availableCategories.map((category) => (
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
            disabled={isGeneratingPDF}
            className={`bg-purple-600 text-white py-2 px-4 rounded-lg flex items-center gap-2 shadow-md ${
              isGeneratingPDF ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-700'
            }`}
          >
            <Download className="w-5 h-5" /> {isGeneratingPDF ? 'Generating...' : 'Generate PDF Report'}
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
            <p className="text-gray-600 text-lg mb-4">{error || 'No properties match your criteria.'}</p>
            <button
              onClick={clearAllFilters}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Reset all filters
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
                  {property.suburb || 'Unknown Suburb'}
                </p>
                <p className="text-gray-600">Type: {property.property_type || 'Unknown'}</p>
                <div className="flex items-center text-gray-600 space-x-4 mt-2">
                  <div className="flex items-center">
                    <Home className="w-4 h-4 mr-1" />
                    <span>{property.bedrooms != null ? property.bedrooms.toString() : 'N/A'}</span>
                  </div>
                  <div className="flex items-center">
                    <Bath className="w-4 h-4 mr-1" />
                    <span>{property.bathrooms != null ? property.bathrooms.toString() : 'N/A'}</span>
                  </div>
                  <div className="flex items-center">
                    <Car className="w-4 h-4 mr-1" />
                    <span>{property.car_garage != null ? property.car_garage.toString() : 'N/A'}</span>
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