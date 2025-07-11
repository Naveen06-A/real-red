import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Mic, Search, Download, SlidersHorizontal, X, TrendingUp, BarChart2, PlusCircle, FileText, BarChart, Activity, CheckCircle, Home, Bath, Car, Eye } from 'lucide-react';
import { IndividualPropertyReport } from './IndividualPropertyReport';
import { supabase } from '../lib/supabase';
import { generatePdf } from '../utils/pdfUtils';
import { Property } from '../types/Property';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency } from '../utils/formatters';
import { toast } from 'react-toastify';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { Bar } from 'react-chartjs-2';
import * as pdfjsLib from 'pdfjs-dist';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Set pdf.js worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

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
  { name: 'Chapel Hill', postcode: '4069' },
  { name: 'Kenmore', postcode: '4069' },
  { name: 'Kenmore Hills', postcode: '4069' },
  { name: 'Fig Tree Pocket', postcode: '4069' },
  { name: 'Pinjara Hills', postcode: '4069' },
  { name: 'Springfield', postcode: '4300' },
  { name: 'Spring Mountain', postcode: '4300' },
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
  const [showDebug, setShowDebug] = useState(true);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);

  // Handle PDF rendering with pdf.js
  useEffect(() => {
    if (showPreviewModal && pdfDataUrl && pdfCanvasRef.current && !pdfDataUrl.startsWith('blob:')) {
      const loadPdf = async () => {
        try {
          console.debug('Attempting to load PDF:', { dataUrlLength: pdfDataUrl.length });
          const pdf = await pdfjsLib.getDocument(pdfDataUrl).promise;
          console.debug('PDF loaded, page count:', pdf.numPages);
          const page = await pdf.getPage(1);

          const [pageWidth, pageHeight] = page.getViewport({ scale: 1 }).viewBox.slice(2, 4);
          const isLandscape = pageWidth > pageHeight;

          const canvas = pdfCanvasRef.current;
          const modalWidth = window.innerWidth * 0.98;
          const modalHeight = window.innerHeight * 0.98 - 100;
          const scale = Math.min(modalWidth / pageWidth, modalHeight / pageHeight) * 2.5;

          const viewport = page.getViewport({ scale });
          const context = canvas.getContext('2d');
          if (!context) {
            throw new Error('Failed to get canvas context');
          }

          canvas.height = viewport.height * window.devicePixelRatio;
          canvas.width = viewport.width * window.devicePixelRatio;
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          context.scale(window.devicePixelRatio, window.devicePixelRatio);

          await page.render({ canvasContext: context, viewport }).promise;
          console.debug('PDF page 1 rendered on canvas', {
            orientation: isLandscape ? 'landscape' : 'portrait',
            scale,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            devicePixelRatio: window.devicePixelRatio,
          });
          toast.success('PDF preview loaded successfully!');
        } catch (error: any) {
          console.error('Error rendering PDF with pdf.js:', {
            error: error.message,
            stack: error.stack,
            dataUrlLength: pdfDataUrl.length,
            timestamp: new Date().toISOString(),
          });
          try {
            const base64Part = pdfDataUrl.split(',')[1];
            const binary = atob(base64Part);
            const array = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              array[i] = binary.charCodeAt(i);
            }
            const blob = new Blob([array], { type: 'application/pdf' });
            const blobUrl = URL.createObjectURL(blob);
            setPdfDataUrl(blobUrl);
            console.debug('Falling back to Blob URL for iframe:', blobUrl);
          } catch (fallbackError) {
            console.error('Error creating Blob URL:', fallbackError);
            toast.error('Failed to render PDF preview. Try downloading or check console for details.');
          }
        }
      };
      loadPdf();
    }
  }, [showPreviewModal, pdfDataUrl]);

  const fetchAvailableCategories = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('category')
        .not('category', 'is', null);
      if (error) throw error;
      const categories = [...new Set(data?.map(d => d.category?.trim()))].filter(c => c) as string[];
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
      console.debug('Fetched properties:', { count: data?.length || 0, sample: data?.slice(0, 2) });
      setProperties(data || []);
      if (!data || data.length === 0) {
        setError('No properties found in the database.');
        toast.warn('No properties found. Check database or filters.');
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
        console.debug(`Querying properties for suburb: ${suburb.name}`);
        const { data: properties, error } = await supabase
          .from('properties')
          .select('id, category, listed_date, sold_date, suburb')
          .ilike('suburb', `%${suburb.name.trim().toUpperCase()}%`);
        if (error) {
          console.error(`Error querying ${suburb.name}:`, error);
          throw error;
        }
        console.debug(`Properties for ${suburb.name}:`, {
          count: properties?.length || 0,
          sample: properties?.slice(0, 2),
        });

        // Fallback to mock data if no properties are found (remove in production)
        if (!properties || properties.length === 0) {
          console.debug(`No properties for ${suburb.name}, using mock data for testing`);
          return {
            suburb: suburb.name,
            totalProperties: 10,
            listedProperties: 5,
            soldProperties: 3,
            avgDaysOnMarket: 30,
            conversionRate: 30,
          };
        }

        const totalProperties = properties.length;
        const listedProperties = properties.filter(p => p.category?.toLowerCase() === 'listing').length || 0;
        const soldProperties = properties.filter(p => p.category?.toLowerCase() === 'sold').length || 0;

        const avgDaysOnMarket = properties
          .filter(p => p.sold_date && p.listed_date)
          .map(p => {
            const listed = new Date(p.listed_date);
            const sold = new Date(p.sold_date);
            return (sold.getTime() - listed.getTime()) / (1000 * 60 * 60 * 24);
          })
          .reduce((sum, days) => sum + days, 0) / (soldProperties || 1) || 0;

        const progress = {
          suburb: suburb.name,
          totalProperties,
          listedProperties,
          soldProperties,
          avgDaysOnMarket: Math.round(avgDaysOnMarket),
          conversionRate: totalProperties ? (soldProperties / totalProperties) * 100 : 0,
        };
        console.debug(`Progress for ${suburb.name}:`, progress);
        return progress;
      });

      const progressData = await Promise.all(progressPromises);
      console.debug('All suburb progress data:', progressData);
      const filteredProgress = progressData.filter(p => p.totalProperties > 0);
      console.debug('Filtered suburb progress:', filteredProgress);
      setSuburbProgress(filteredProgress);
      if (filteredProgress.length === 0) {
        toast.warn(
          `No suburb progress data available. No properties found for suburbs: ${ALLOWED_SUBURBS.map(s => s.name).join(', ')}.`
        );
      }
    } catch (error) {
      console.error('Error fetching suburb progress:', error);
      toast.error('Failed to fetch suburb progress data. Check console for details.');
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
          filters.suburbs.map(s => `suburb.ilike.%${s.trim().toUpperCase()}%`).join(',')
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

      console.debug('Query result:', { count: data?.length || 0, sample: data?.slice(0, 2) });
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

  const generateReport = async (action: 'save' | 'preview') => {
    setIsGeneratingPDF(true);
    console.debug(`Starting PDF ${action} at ${new Date().toISOString()}...`);
    try {
      console.debug('Properties for PDF:', properties.map(p => ({
        id: p.id,
        address: p.address,
        street_number: p.street_number,
        street_name: p.street_name,
        suburb: p.suburb,
        price: p.price,
        category: p.category,
      })));

      const headers = [['Address', 'Suburb', 'Price', 'Status']];
      const tableData = properties.map((p) => {
        const address = (p.address || `${p.street_number || ''} ${p.street_name || ''}`.trim() || 'N/A').toString();
        const suburb = (p.suburb || 'N/A').toString();
        const price = p.price != null && !isNaN(p.price) ? formatCurrency(p.price) : 'N/A';
        const category = (p.category || 'N/A').toString();
        return [address, suburb, price, category];
      });

      if (!properties.length) {
        console.debug('No properties to generate PDF');
        toast.warn('No properties available to generate PDF');
        return;
      }

      const isValidTableData = tableData.every(
        row => Array.isArray(row) && row.length === 4 && row.every(cell => typeof cell === 'string' && cell != null)
      );
      if (!isValidTableData) {
        console.error('Invalid tableData:', { sample: tableData.slice(0, 2), totalRows: tableData.length });
        throw new Error('Invalid table data: All cells must be non-null strings');
      }

      console.debug('PDF input data:', {
        headers,
        tableDataSample: tableData.slice(0, 2),
        totalRows: tableData.length,
        profileName: profile?.name || 'Unknown',
        timestamp: new Date().toISOString(),
      });

      const fileName = `agent_dashboard_report_${new Date().toISOString().split('T')[0]}.pdf`;
      const output = action === 'preview' ? 'datauristring' : 'blob';
      const result = await generatePdf(
        `Agent Property Report - ${profile?.name || 'Agent'}`,
        headers,
        tableData,
        fileName,
        output
      );

      console.debug('generatePdf result:', {
        action,
        type: typeof result,
        isBlob: result instanceof Blob,
        dataUrlPrefix: typeof result === 'string' ? result.substring(0, 50) : 'N/A',
        dataLength: typeof result === 'string' ? result.length : result instanceof Blob ? result.size : 'N/A',
        timestamp: new Date().toISOString(),
      });

      if (action === 'preview') {
        if (typeof result !== 'string' || !result.startsWith('data:application/pdf;base64,')) {
          throw new Error(`Invalid PDF data URL: ${typeof result}`);
        }
        const base64Part = result.split(',')[1];
        if (!base64Part || base64Part.length < 100) {
          throw new Error(`Invalid PDF data URL: Base64 content too short (${base64Part.length} characters)`);
        }
        try {
          atob(base64Part);
          console.debug('Base64 decoding successful');
        } catch (e) {
          console.error('Invalid base64 content:', e);
          throw new Error('Invalid base64 content in PDF data URL');
        }
        setPdfDataUrl(result);
        setShowPreviewModal(true);
        console.debug('PDF preview set, data URL length:', base64Part.length);
        toast.success('PDF preview ready!');
      } else {
        if (!(result instanceof Blob)) {
          throw new Error(`Expected Blob for save, got ${typeof result}`);
        }
        const url = URL.createObjectURL(result);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        console.debug('PDF downloaded successfully:', fileName);
        toast.success('PDF report downloaded successfully!');
      }
    } catch (error: any) {
      console.error(`Error generating PDF ${action}:`, {
        message: error.message,
        stack: error.stack,
        propertiesCount: properties.length,
        sampleProperties: properties.slice(0, 2).map(p => ({
          id: p.id,
          address: p.address,
          suburb: p.suburb,
          price: p.price,
          category: p.category,
        })),
        timestamp: new Date().toISOString(),
      });
      toast.error(`Failed to generate PDF ${action}. Check console for details.`);
      setShowPreviewModal(false);
      setPdfDataUrl(null);
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
      {/* Modal for PDF Preview */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[98vw] h-[98vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-2xl font-semibold text-gray-800">PDF Preview</h2>
              <button
                onClick={() => {
                  setShowPreviewModal(false);
                  setPdfDataUrl(null);
                }}
                className="text-gray-600 hover:text-gray-800"
              >
                <X className="w-8 h-8" />
              </button>
            </div>
            <div className="flex-grow p-8 overflow-auto">
              {pdfDataUrl ? (
                pdfDataUrl.startsWith('blob:') ? (
                  <iframe
                    src={pdfDataUrl}
                    className="w-full h-full"
                    title="PDF Preview"
                  />
                ) : (
                  <>
                    <canvas ref={pdfCanvasRef} className="w-full h-auto max-h-[80vh] mx-auto" />
                    <p className="text-sm text-gray-600 mt-4">
                      If the preview fails to load, try downloading the PDF or check the console for details.
                    </p>
                    {showDebug && (
                      <p className="text-sm text-yellow-600 mt-2">
                        Debug: Check console for errors (e.g., 'Error rendering PDF with pdf.js'). Ensure properties data is valid and pdf.js worker is accessible.
                      </p>
                    )}
                  </>
                )
              ) : (
                <p className="text-gray-600">Loading preview...</p>
              )}
            </div>
            <div className="flex justify-end p-4 border-t gap-4">
              <button
                onClick={() => generateReport('preview')}
                className="bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                disabled={isGeneratingPDF}
              >
                <Eye className="w-5 h-5" /> Retry Preview
              </button>
              <button
                onClick={() => generateReport('save')}
                className="bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 flex items-center gap-2"
                disabled={isGeneratingPDF}
              >
                <Download className="w-5 h-5" /> Download PDF
              </button>
            </div>
          </div>
        </div>
      )}

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
          <p className="text-sm text-gray-600">Properties Count: {properties.length}</p>
          <p className="text-sm text-gray-600">Suburb Progress Count: {suburbProgress.length}</p>
          <button
            onClick={fetchAvailableCategories}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Refresh Categories
          </button>
          {/* <button
            onClick={() => console.log('Suburb Progress Debug:', suburbProgress)}
            className="mt-2 ml-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
          >
            Log Suburb Progress
          </button> */}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-8">
        <Link to="/property-form" className="bg-blue-600 text-white p-6 rounded-lg hover:bg-blue-700 transition flex flex-col items-center justify-center">
          <PlusCircle className="w-8 h-8 mb-2" />
          <h2 className="text-xl font-semibold text-center">Add Property</h2>
        </Link>

        <Link to="/agent-business-plan" className="bg-blue-600 text-white p-6 rounded-lg hover:bg-blue-700 transition flex flex-col items-center justify-center">
          <PlusCircle className="w-8 h-8 mb-2" />
          <h2 className="text-xl font-semibold text-center">Business Plan</h2>
        
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
              <p>No suburb progress data available. This may be due to:</p>
              <ul className="list-disc list-inside text-left max-w-md mx-auto">
                <li>No properties found for the specified suburbs ({ALLOWED_SUBURBS.map(s => s.name).join(', ')}).</li>
                <li>Database connection issues or missing data in the properties table.</li>
                <li>Suburb names in the database not matching the expected format.</li>
              </ul>
              <div className="mt-4 flex gap-4 justify-center">
                <button
                  onClick={fetchSuburbProgress}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Retry Fetching Data
                </button>
                <button
                  onClick={() => console.log('Suburb Progress Debug:', suburbProgress)}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
                >
                  Log Debug Info
                </button>
              </div>
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
            onClick={() => generateReport('preview')}
            disabled={isGeneratingPDF}
            className={`bg-blue-600 text-white py-2 px-4 rounded-lg flex items-center gap-2 shadow-md ${
              isGeneratingPDF ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
            }`}
          >
            <Eye className="w-5 h-5" /> {isGeneratingPDF ? 'Generating...' : 'Preview PDF Report'}
          </button>
          <button
            onClick={() => generateReport('save')}
            disabled={isGeneratingPDF}
            className={`bg-purple-600 text-white py-2 px-4 rounded-lg flex items-center gap-2 shadow-md ${
              isGeneratingPDF ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-700'
            }`}
          >
            <Download className="w-5 h-5" /> {isGeneratingPDF ? 'Generating...' : 'Download PDF Report'}
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
