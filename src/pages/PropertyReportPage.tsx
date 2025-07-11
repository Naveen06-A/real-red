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
import { motion, AnimatePresence } from 'framer-motion';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ChevronDown,
  Download,
  Filter,
  Loader2,
  RefreshCcw,
  Trash2,
  X,
  Edit,
  MapPin,
  Home,
  DollarSign,
  Percent,
  Briefcase,
  Calendar,
  Shield,
  CheckSquare,
  List,
  BarChart2,
  TrendingUp,
  FileText,
} from 'lucide-react';
import moment from 'moment';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { useLocation, useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import {
  calculateCommission,
  formatArray,
  formatCurrency,
  formatDate,
  generateHeatmapData,
  generatePriceTrendsData,
  normalizeSuburb,
  selectStyles,
} from '../reportsUtils';
import { generatePdf } from '../utils/pdfUtils';
import { Filters, PropertyDetails } from './Reports';

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

const ITEMS_PER_PAGE = 10;

interface PropertyReportPageProps {}

interface PropertyFormData {
  id: string;
  street_number: string;
  street_name: string;
  suburb: string;
  postcode: string;
  agent_name: string;
  property_type: string;
  price: number;
  sold_price: number | null;
  category: string;
  commission: number | null;
  agency_name: string;
  expected_price: number | null;
  sale_type: string;
  bedrooms: number | null;
  bathrooms: number | null;
  car_garage: number | null;
  sqm: number | null;
  landsize: number | null;
  listed_date: string | null;
  sold_date: string | null;
  flood_risk: string;
  bushfire_risk: string;
  contract_status: string;
  features: string[];
}

export function PropertyReportPage(props: PropertyReportPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    propertyMetrics,
    filteredProperties: initialFilteredProperties = [],
    filters,
    filterSuggestions,
    manualInputs,
    filterPreviewCount,
    currentPage,
  } = location.state || {};

  const [localFilters, setLocalFilters] = useState<Filters>(filters || {
    suburbs: [],
    streetNames: [],
    streetNumbers: [],
    agents: [],
    agency_names: [],
    propertyTypes: [],
    categories: [],
  });

  const [localManualInputs, setLocalManualInputs] = useState({
    suburbs: '',
    streetNames: '',
    streetNumbers: '',
    agents: '',
    agency_names: '',
    propertyTypes: '',
    categories: '',
  });

  const [localFilterPreviewCount, setLocalFilterPreviewCount] = useState(filterPreviewCount || 0);
  const [localCurrentPage, setLocalCurrentPage] = useState(currentPage || 1);
  const [exportLoading, setExportLoading] = useState(false);
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [expandedFilters, setExpandedFilters] = useState({
    suburbs: false,
    streetNames: false,
    streetNumbers: false,
    agents: false,
    agency_names: false,
    propertyTypes: false,
    categories: false,
  });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editingProperty, setEditingProperty] = useState<PropertyFormData | null>(null);
  const [formErrors, setFormErrors] = useState<Partial<PropertyFormData>>({});
  const [filteredProperties, setFilteredProperties] = useState<PropertyDetails[]>(initialFilteredProperties);
  const [dynamicFilterSuggestions, setDynamicFilterSuggestions] = useState({
    suburbs: filterSuggestions?.suburbs || [],
    streetNames: filterSuggestions?.streetNames || [],
    streetNumbers: filterSuggestions?.streetNumbers || [],
    agents: filterSuggestions?.agents || [],
    agency_names: filterSuggestions?.agency_names || [],
    propertyTypes: filterSuggestions?.propertyTypes || [],
    categories: ['Listed', 'Sold'],
  });

  const propertiesTableRef = useRef<HTMLDivElement>(null);

  // Cleanup PDF URL to prevent memory leaks
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (filteredProperties.length === 0 && initialFilteredProperties.length > 0) {
      setFilteredProperties(initialFilteredProperties);
      setLocalFilterPreviewCount(initialFilteredProperties.length);
      // Initialize propertyTypes suggestions from initial data
      setDynamicFilterSuggestions((prev) => ({
        ...prev,
        propertyTypes: [...new Set(initialFilteredProperties.map((prop: PropertyDetails) => prop?.property_type || '').filter(Boolean))] || [],
      }));
    }
  }, [initialFilteredProperties]);

  useEffect(() => {
    console.log('filteredProperties updated:', filteredProperties);
  }, [filteredProperties]);

  useEffect(() => {
    console.log('localFilters updated:', localFilters);
  }, [localFilters]);

  useEffect(() => {
    console.log('dynamicFilterSuggestions updated:', dynamicFilterSuggestions);
  }, [dynamicFilterSuggestions]);

  useEffect(() => {
    const subscription = supabase
      .channel('properties-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'properties' },
        (payload) => {
          const updatedProperty = payload.new as PropertyDetails;
          console.log('Real-time update received:', updatedProperty);
          setFilteredProperties((prev) =>
            prev.map((prop) =>
              prop.id === updatedProperty.id
                ? { ...prop, ...updatedProperty, commission_earned: calculateCommission(updatedProperty).commissionEarned }
                : prop
            )
          );
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const paginatedProperties = useMemo(() => {
    const start = (localCurrentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return filteredProperties?.slice(start, end) || [];
  }, [filteredProperties, localCurrentPage]);

  const totalPages = Math.ceil((filteredProperties?.length || 0) / ITEMS_PER_PAGE);

  const updateFilterSuggestions = (selectedSuburbs: string[]) => {
    try {
      const baseProperties = selectedSuburbs.length === 0
        ? filteredProperties
        : filteredProperties.filter((prop: PropertyDetails) =>
            prop && selectedSuburbs.some((suburb) => normalizeSuburb(prop.suburb || '') === normalizeSuburb(suburb))
          );

      const newSuggestions = {
        suburbs: filterSuggestions?.suburbs || [],
        streetNames: [...new Set(baseProperties.map((prop: PropertyDetails) => prop?.street_name || '').filter(Boolean))] || [],
        streetNumbers: [...new Set(baseProperties.map((prop: PropertyDetails) => prop?.street_number || '').filter(Boolean))] || [],
        agents: [...new Set(baseProperties.map((prop: PropertyDetails) => prop?.agent_name || '').filter(Boolean))] || [],
        agency_names: [...new Set(baseProperties.map((prop: PropertyDetails) => prop?.agency_name || 'Unknown').filter(Boolean))] || [],
        propertyTypes: [...new Set(baseProperties.map((prop: PropertyDetails) => prop?.property_type || '').filter(Boolean))] || [],
        categories: ['Listed', 'Sold'],
      };

      console.log('New filter suggestions:', newSuggestions);

      setDynamicFilterSuggestions(newSuggestions);
      categories: [...new Set(availableCategories.filter(Boolean).map(c => c.trim()))], // Only include valid, trimmed categories from data

      setLocalFilters((prev: Filters) => ({
        ...prev,
        streetNames: prev.streetNames.filter((name) => newSuggestions.streetNames.includes(name)),
        streetNumbers: prev.streetNumbers.filter((num) => newSuggestions.streetNumbers.includes(num)),
        agents: prev.agents.filter((agent) => newSuggestions.agents.includes(agent)),
        agency_names: prev.agency_names.filter((agency) => newSuggestions.agency_names.includes(agency)),
        propertyTypes: prev.propertyTypes.filter((type) => newSuggestions.propertyTypes.includes(type)),
        categories: prev.categories.filter((category) => newSuggestions.categories.includes(category)),
      }));
    } catch (err) {
      console.error('Error updating filter suggestions:', err, { selectedSuburbs, filteredProperties });
      toast.error('Failed to update filter suggestions');
    }
  };

  const handleEditClick = (property: PropertyDetails) => {
    setEditingProperty({
      id: property.id,
      street_number: property.street_number || '',
      street_name: property.street_name || '',
      suburb: property.suburb || '',
      postcode: property.postcode || '',
      agent_name: property.agent_name || '',
      property_type: property.property_type || '',
      price: property.price || 0,
      sold_price: property.sold_price || null,
      category: property.category || '',
      commission: property.commission || null,
      agency_name: property.agency_name || '',
      expected_price: property.expected_price || null,
      sale_type: property.sale_type || '',
      bedrooms: property.bedrooms || null,
      bathrooms: property.bathrooms || null,
      car_garage: property.car_garage || null,
      sqm: property.sqm || null,
      landsize: property.landsize || null,
      listed_date: property.listed_date || null,
      sold_date: property.sold_date || null,
      flood_risk: property.flood_risk || '',
      bushfire_risk: property.bushfire_risk || '',
      contract_status: property.contract_status || '',
      features: property.features || [],
    });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProperty || isUpdating) return;

    setIsUpdating(true);
    try {
      const errors: Partial<PropertyFormData> = {};
      if (!editingProperty.street_name) errors.street_name = 'Street name is required';
      if (!editingProperty.suburb) errors.suburb = 'Suburb is required';
      if (editingProperty.price <= 0) errors.price = 'Price must be greater than 0';
      if (!editingProperty.property_type) errors.property_type = 'Property type is required';
      if (!editingProperty.category) errors.category = 'Category is required';

      if (Object.keys(errors).length > 0) {
        setFormErrors(errors);
        setIsUpdating(false);
        return;
      }

      const updatedProperty = {
        street_number: editingProperty.street_number || null,
        street_name: editingProperty.street_name,
        suburb: editingProperty.suburb,
        postcode: editingProperty.postcode || null,
        agent_name: editingProperty.agent_name || null,
        property_type: editingProperty.property_type,
        price: editingProperty.price,
        sold_price: editingProperty.sold_price,
        category: editingProperty.category,
        commission: editingProperty.commission,
        agency_name: editingProperty.agency_name || null,
        expected_price: editingProperty.expected_price,
        sale_type: editingProperty.sale_type || null,
        bedrooms: editingProperty.bedrooms,
        bathrooms: editingProperty.bathrooms,
        car_garage: editingProperty.car_garage,
        sqm: editingProperty.sqm,
        landsize: editingProperty.landsize,
        listed_date: editingProperty.listed_date,
        sold_date: editingProperty.sold_date,
        flood_risk: editingProperty.flood_risk || null,
        bushfire_risk: editingProperty.bushfire_risk || null,
        contract_status: editingProperty.contract_status || null,
        features: editingProperty.features.length > 0 ? editingProperty.features : null,
        updated_at: new Date().toISOString(),
      };

      console.log('Updating property with payload:', updatedProperty);

      const { data: updateData, error: updateError } = await supabase
        .from('properties')
        .update(updatedProperty)
        .eq('id', editingProperty.id)
        .select('*')
        .single();

      if (updateError) {
        console.error('Supabase update error:', updateError);
        throw new Error(`Failed to update property: ${updateError.message}`);
      }

      if (!updateData) {
        console.error('No data returned from update operation');
        throw new Error('Update operation did not return updated property');
      }

      console.log('Updated property from Supabase:', updateData);

      setFilteredProperties((prev) =>
        prev.map((prop) =>
          prop.id === editingProperty.id
            ? { ...prop, ...updateData, commission_earned: calculateCommission(updateData).commissionEarned }
            : prop
        )
      );

      toast.success('Property updated successfully');
      setIsEditModalOpen(false);
      setEditingProperty(null);
      setFormErrors({});
    } catch (err: any) {
      console.error('Update error:', err);
      toast.error(err.message || 'Failed to update property');
    } finally {
      setIsUpdating(false);
    }
  };

  if (!Array.isArray(filteredProperties)) {
    console.error('filteredProperties is not an array');
    return <p className="text-red-600 text-center">Invalid property data</p>;
  }

  const applyFilters = useCallback((newFilters: Filters, properties: PropertyDetails[]) => {
    try {
      console.log('Applying filters:', newFilters);
      console.log('Properties count before filtering:', properties.length);
      // Validate input properties
      if (!Array.isArray(properties)) {
        console.error('Invalid properties array:', properties);
        throw new Error('Properties data is not an array');
      }
      const filtered = properties.filter((prop: PropertyDetails) => {
        if (!prop || typeof prop !== 'object') {
          console.warn('Invalid property encountered:', prop);
          return false;
        }

        const suburbMatch =
          newFilters.suburbs.length === 0 ||
          newFilters.suburbs.some((suburb: string) => normalizeSuburb(prop.suburb || '') === normalizeSuburb(suburb));
        const streetNameMatch =
          newFilters.streetNames.length === 0 ||
          newFilters.streetNames.some((name: string) => (prop.street_name || '').toLowerCase() === name.toLowerCase());
        const streetNumberMatch =
          newFilters.streetNumbers.length === 0 ||
          newFilters.streetNumbers.some((num: string) => (prop.street_number || '').toLowerCase() === num.toLowerCase());
        const agentMatch =
          newFilters.agents.length === 0 ||
          newFilters.agents.some((agent: string) => (prop.agent_name || '').toLowerCase() === agent.toLowerCase());
        const agencyMatch =
          newFilters.agency_names.length === 0 ||
          newFilters.agency_names.some((agency: string) => (prop.agency_name || 'Unknown').toLowerCase() === agency.toLowerCase());
        const propertyTypeMatch =
          newFilters.propertyTypes.length === 0 ||
          newFilters.propertyTypes.some((type: string) => (prop.property_type || '').toLowerCase() === type.toLowerCase());
        const categoryMatch =
          newFilters.categories.length === 0 ||
          newFilters.categories.some((category: string) => {
            const propCategory = (prop.category || '').toLowerCase().trim();
            const filterCategory = category.toLowerCase().trim();
            if (!propCategory) {
              console.warn('Empty or invalid category for property:', { id: prop.id, property: prop });
              return false;
            }
            // Log mismatches for debugging
            if (propCategory !== filterCategory) {
              console.log('Category mismatch:', {
                propertyId: prop.id,
                propertyIndex: index,
                propertyCategory: propCategory,
                filterCategory: filterCategory,
              });
            }
            return propCategory === filterCategory;
          });

        return suburbMatch && streetNameMatch && streetNumberMatch && agentMatch && agencyMatch && propertyTypeMatch && categoryMatch;
      });
      console.log('Filtered properties count:', filtered.length);
      setFilteredProperties(filtered);
      setLocalFilterPreviewCount(filtered.length);
      setLocalCurrentPage(1);
    } catch (err) {
      console.error('Error applying filters:', err, {
        newFilters,
        propertiesCount: properties.length,
        sampleProperties: properties.slice(0, 2),
      });
      toast.error('Failed to apply filters');
    }
  }, []);

  const handleFilterChange = (filterType: keyof Filters, selected: Array<{ value: string; label: string }>) => {
    try {
      const newValues = selected.map((option) => option.value);
      console.log(`Filter changed: ${filterType} =`, newValues);
      setLocalFilters((prev: Filters) => {
        const newFilters = { ...prev, [filterType]: newValues };
        if (filterType === 'suburbs') {
          updateFilterSuggestions(newValues);
        }
        applyFilters(newFilters, filteredProperties);
        localStorage.setItem('reportFilters', JSON.stringify(newFilters));
        return newFilters;
      });
    } catch (err) {
      console.error('Error in handleFilterChange:', err);
      toast.error('Failed to update filters');
    }
  };

  const handleManualInputChange = (filterType: keyof typeof localManualInputs, value: string) => {
    setLocalManualInputs((prev) => ({ ...prev, [filterType]: value }));
  };

  const handleManualInputKeyDown = (
    filterType: keyof Filters,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === 'Enter') {
      const value = localManualInputs[filterType].trim();
      if (value && (dynamicFilterSuggestions[filterType] || []).includes(value)) {
        console.log(`Adding manual input for ${filterType}: ${value}`);
        setLocalFilters((prev: Filters) => {
          const newValues = [...new Set([...prev[filterType], value])];
          const newFilters: Filters = { ...prev, [filterType]: newValues };
          if (filterType === 'suburbs') {
            updateFilterSuggestions(newValues);
          }
          applyFilters(newFilters, filteredProperties);
          localStorage.setItem('reportFilters', JSON.stringify(newFilters));
          return newFilters;
        });
        setLocalManualInputs((prev) => ({ ...prev, [filterType]: '' }));
        toast.success(`Added ${filterType === 'agency_names' ? 'agency name' : filterType === 'propertyTypes' ? 'property type' : filterType === 'categories' ? 'status' : filterType.replace(/s$/, '')}: ${value}`);
      } else {
        toast.error(`Invalid ${filterType === 'agency_names' ? 'agency name' : filterType === 'propertyTypes' ? 'property type' : filterType === 'categories' ? 'status' : filterType.replace(/s$/, '')}. Please select from suggestions.`);
      }
    }
  };

  const resetFilters = () => {
    try {
      const emptyFilters: Filters = {
        suburbs: [],
        streetNames: [],
        streetNumbers: [],
        agents: [],
        agency_names: [],
        propertyTypes: [],
        categories: [],
      };
      console.log('Resetting filters');
      setLocalFilters(emptyFilters);
      setLocalManualInputs({
        suburbs: '',
        streetNames: '',
        streetNumbers: '',
        agents: '',
        agency_names: '',
        propertyTypes: '',
        categories: '',
      });
      setExpandedFilters({
        suburbs: false,
        streetNames: false,
        streetNumbers: false,
        agents: false,
        agency_names: false,
        propertyTypes: false,
        categories: false,
      });
      setFilteredProperties(initialFilteredProperties);
      setLocalFilterPreviewCount(initialFilteredProperties.length);
      setDynamicFilterSuggestions({
        suburbs: filterSuggestions?.suburbs || [],
        streetNames: filterSuggestions?.streetNames || [],
        streetNumbers: filterSuggestions?.streetNumbers || [],
        agents: filterSuggestions?.agents || [],
        agency_names: filterSuggestions?.agency_names || [],
        propertyTypes: [...new Set(initialFilteredProperties.map((prop: PropertyDetails) => prop?.property_type || '').filter(Boolean))] || [],
        categories: ['Listed', 'Sold'],
        
      });
      localStorage.removeItem('reportFilters');
      toast.success('Filters reset successfully');
      setLocalCurrentPage(1);
    } catch (err) {
      console.error('Error resetting filters:', err);
      toast.error('Failed to reset filters');
    }
  };

  const toggleFilterSection = (section: keyof typeof expandedFilters) => {
    setExpandedFilters((prev) => ({ ...prev, [section]: !prev[section] }));
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

      setFilteredProperties((prev) => prev.filter((prop) => prop.id !== propertyId));
      toast.success('Property deleted successfully');
    } catch (err: any) {
      console.error('Delete error:', err);
      toast.error(err.message || 'Failed to delete property');
    }
  };

  const exportPropertyReportPDF = async () => {
    if (!propertyMetrics) {
      toast.error('No property metrics available for export');
      return;
    }
    setExportLoading(true);
    try {
      const head = [
        [
          'Street Number',
          'Street Name',
          'Suburb',
          'Postcode',
          'Agent',
          'Type',
          'Price',
          'Sold Price',
          'Status',
          'Commission (%)',
          'Commission Earned',
          'Agency',
          'Expected Price',
          'Sale Type',
          'Bedrooms',
          'Bathrooms',
          'Car Garage',
          'SQM',
          'Land Size',
          'Listed Date',
          'Sold Date',
          'Flood Risk',
          'Bushfire Risk',
          'Contract Status',
          'Features',
        ],
      ];
      const body = filteredProperties.map((prop: PropertyDetails) => [
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
        String(prop.bedrooms ?? 'N/A'),
        String(prop.bathrooms ?? 'N/A'),
        String(prop.car_garage ?? 'N/A'),
        String(prop.sqm ?? 'N/A'),
        String(prop.landsize ?? 'N/A'),
        formatDate(prop.listed_date),
        formatDate(prop.sold_date),
        prop.flood_risk || 'N/A',
        prop.bushfire_risk || 'N/A',
        prop.contract_status || 'N/A',
        formatArray(prop.features || []),
      ]);

      console.log('Generating PDF with head:', head);
      console.log('Generating PDF with body sample:', body.slice(0, 2));

      const pdfBlob = await generatePdf('Property Report', head, body, 'property_report.pdf', 'blob');
      if (pdfBlob instanceof Blob) {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'property_report.pdf';
        a.click();
        URL.revokeObjectURL(url);
        toast.success('PDF downloaded successfully');
      } else {
        throw new Error('PDF generation did not return a Blob');
      }
    } catch (err: any) {
      console.error('PDF export error:', err);
      toast.error(err.message || 'Failed to export PDF');
    } finally {
      setExportLoading(false);
    }
  };

  const previewPropertyReportPDF = async () => {
    if (!propertyMetrics) {
      toast.error('No property metrics available for preview');
      return;
    }
    setExportLoading(true);
    try {
      const head = [
        [
          'Street Number',
          'Street Name',
          'Suburb',
          'Postcode',
          'Agent',
          'Type',
          'Price',
          'Sold Price',
          'Status',
          'Commission (%)',
          'Commission Earned',
          'Agency',
          'Expected Price',
          'Sale Type',
          'Bedrooms',
          'Bathrooms',
          'Car Garage',
          'SQM',
          'Land Size',
          'Listed Date',
          'Sold Date',
          'Flood Risk',
          'Bushfire Risk',
          'Contract Status',
          'Features',
        ],
      ];
      const body = filteredProperties.map((prop: PropertyDetails) => [
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
        String(prop.bedrooms ?? 'N/A'),
        String(prop.bathrooms ?? 'N/A'),
        String(prop.car_garage ?? 'N/A'),
        String(prop.sqm ?? 'N/A'),
        String(prop.landsize ?? 'N/A'),
        formatDate(prop.listed_date),
        formatDate(prop.sold_date),
        prop.flood_risk || 'N/A',
        prop.bushfire_risk || 'N/A',
        prop.contract_status || 'N/A',
        formatArray(prop.features || []),
      ]);

      console.log('Generating PDF preview with head:', head);
      console.log('Generating PDF preview with body sample:', body.slice(0, 2));

      const pdfDataUri = await generatePdf('Property Report', head, body, 'property_report.pdf', 'datauristring');
      if (typeof pdfDataUri === 'string') {
        setPdfUrl(pdfDataUri);
        setIsPdfPreviewOpen(true);
        toast.success('PDF preview generated successfully');
      } else {
        throw new Error('PDF generation did not return a data URI');
      }
    } catch (err: any) {
      console.error('PDF preview error:', err);
      toast.error(err.message || 'Failed to generate PDF preview');
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
          'Street Number',
          'Street Name',
          'Suburb',
          'Postcode',
          'Agent',
          'Type',
          'Price',
          'Sold Price',
          'Status',
          'Commission (%)',
          'Commission Earned',
          'Agency',
          'Expected Price',
          'Sale Type',
          'Bedrooms',
          'Bathrooms',
          'Car Garage',
          'SQM',
          'Land Size',
          'Listed Date',
          'Sold Date',
          'Flood Risk',
          'Bushfire Risk',
          'Contract Status',
          'Features',
        ],
        ...filteredProperties.map((prop: PropertyDetails) => [
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
          String(prop.bedrooms ?? 'N/A'),
          String(prop.bathrooms ?? 'N/A'),
          String(prop.car_garage ?? 'N/A'),
          String(prop.sqm ?? 'N/A'),
          String(prop.landsize ?? 'N/A'),
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
              body { font-family: Arial, sans-serif; margin: 20px; background: #E0F2FE; }
              .container { max-width: 1200px; margin: auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
              th { background-color: #60A5FA; color: white; }
              h1 { text-align: center; color: #1E3A8A; }
              .footer { text-align: center; color: #4B5563; font-size: 12px; margin-top: 20px; }
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
                ${filteredProperties
                  .map(
                    (prop: PropertyDetails) => `
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

      return <Bar data={{ ...heatmapData, datasets: [{ ...heatmapData.datasets[0], backgroundColor: '#60A5FA' }] }} options={options} />;
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

      return <Bar data={{ ...priceTrendsData, datasets: priceTrendsData.datasets.map(ds => ({ ...ds, backgroundColor: '#60A5FA' })) }} options={options} />;
    } catch (err) {
      console.error('Error rendering price trends:', err);
      return <p className="text-red-600 text-center">Failed to render price trends</p>;
    }
  };

  const calculateAveragePricesBySuburb = (properties: PropertyDetails[]) => {
    const listedPriceBySuburb: { [key: string]: { total: number; count: number } } = {};
    const soldPriceBySuburb: { [key: string]: { total: number; count: number } } = {};

    properties.forEach((prop) => {
      if (!prop || !prop.suburb) return;

      const suburb = normalizeSuburb(prop.suburb);
      
      // Listed price
      if (typeof prop.price === 'number' && prop.price > 0) {
        if (!listedPriceBySuburb[suburb]) {
          listedPriceBySuburb[suburb] = { total: 0, count: 0 };
        }
        listedPriceBySuburb[suburb].total += prop.price;
        listedPriceBySuburb[suburb].count += 1;
      }

      // Sold price
      if (typeof prop.sold_price === 'number' && prop.sold_price > 0) {
        if (!soldPriceBySuburb[suburb]) {
          soldPriceBySuburb[suburb] = { total: 0, count: 0 };
        }
        soldPriceBySuburb[suburb].total += prop.sold_price;
        soldPriceBySuburb[suburb].count += 1;
      }
    });

    const avgListedPriceBySuburb = Object.keys(listedPriceBySuburb).reduce(
      (acc, suburb) => {
        acc[suburb] = listedPriceBySuburb[suburb].total / listedPriceBySuburb[suburb].count;
        return acc;
      },
      {} as { [key: string]: number }
    );

    const avgSoldPriceBySuburb = Object.keys(soldPriceBySuburb).reduce(
      (acc, suburb) => {
        acc[suburb] = soldPriceBySuburb[suburb].total / soldPriceBySuburb[suburb].count;
        return acc;
      },
      {} as { [key: string]: number }
    );

    return { avgListedPriceBySuburb, avgSoldPriceBySuburb };
  };

  const renderGeneralCharts = () => {
    if (!filteredProperties || filteredProperties.length === 0) {
      console.warn('No properties available for general charts');
      return <p className="text-gray-500 text-center">No chart data available</p>;
    }

    try {
      const { avgListedPriceBySuburb, avgSoldPriceBySuburb } = calculateAveragePricesBySuburb(filteredProperties);

      const listedPriceData = {
        labels: Object.keys(avgListedPriceBySuburb),
        datasets: [
          {
            label: 'Average Listed Price',
            data: Object.values(avgListedPriceBySuburb),
            backgroundColor: '#60A5FA',
          },
        ],
      };

      const soldPriceData = {
        labels: Object.keys(avgSoldPriceBySuburb),
        datasets: [
          {
            label: 'Average Sold Price',
            data: Object.values(avgSoldPriceBySuburb),
            backgroundColor: '#93C5FD',
          },
        ],
      };

      const chartOptions: ChartOptions<'bar'> = {
        plugins: {
          legend: { position: 'top', labels: { font: { size: 14 } } },
          datalabels: { display: false },
          title: { display: true, font: { size: 18, weight: 'bold' } },
          tooltip: {
            callbacks: {
              label: (context) => `${context.dataset.label}: ${formatCurrency(context.raw as number)}`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (value) => formatCurrency(value as number), font: { size: 12 } },
          },
          x: { ticks: { font: { size: 12 } } },
        },
      };
      const listedPriceOptions: ChartOptions<'bar'> = {
      ...chartOptions,
      plugins: {
        ...chartOptions.plugins,
        title: {
          ...chartOptions.plugins.title,
          text: 'Average Listed Price by Suburb',
        },
      },
    };

    const soldPriceOptions: ChartOptions<'bar'> = {
      ...chartOptions,
      plugins: {
        ...chartOptions.plugins,
        title: {
          ...chartOptions.plugins.title,
          text: 'Average Sold Price by Suburb',
        },
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
              Average Listed Price by Suburb
            </h2>
            {listedPriceData.labels.length > 0 ? (
              <Bar data={listedPriceData} options= { listedPriceOptions} />
            ) : (
              <p className="text-gray-500 text-center">No listed price data available</p>
            )}
          </motion.div>
          <motion.div
            className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 hover:shadow-xl transition-all duration-300"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <h2 className="text-2xl font-semibold text-blue-800 mb-4 flex items-center">
              <svg className="w-6 h-6 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Average Sold Price by Suburb
            </h2>
            {soldPriceData.labels.length > 0 ? (
              <Bar data={soldPriceData} options={soldPriceOptions }  />
            ) : (
              <p className="text-gray-500 text-center">No sold price data available</p>
            )}
          </motion.div>
        </div>
      );
    } catch (err) {
      console.error('Error rendering general charts:', err);
      return <p className="text-red-600 text-center">Failed to render charts</p>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <motion.div
          className="flex justify-between items-center mb-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-2xl font-semibold text-blue-800 flex items-center">
            <Filter className="w-6 h-6 mr-2 text-blue-600" />
            Property Report
          </h2>
          <motion.button
            onClick={() => navigate('/reports')}
            className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            aria-label="Back to dashboard"
          >
            <X className="w-6 h-6" />
          </motion.button>
        </motion.div>

        <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 mb-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-semibold text-blue-800 flex items-center">
              <Filter className="w-5 h-5 mr-2 text-blue-600" />
              Filters
            </h3>
            <motion.button
              onClick={resetFilters}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
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
            Matching properties: <span className="font-semibold text-blue-600">{localFilterPreviewCount}</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4">
            {(['suburbs', 'streetNames', 'streetNumbers', 'agents', 'agency_names', 'propertyTypes', 'categories'] as const).map((filterType) => (
              <motion.div
                key={filterType}
                className="border border-blue-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200"
                title={`Filter by ${filterType === 'agency_names' ? 'agency name' : filterType === 'propertyTypes' ? 'property type' : filterType === 'categories' ? 'status' : filterType.replace(/s$/, '')}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <motion.button
                  onClick={() => toggleFilterSection(filterType)}
                  className={`w-full flex justify-between items-center p-4 font-medium rounded-t-xl bg-blue-50 text-blue-800 hover:bg-blue-100 transition-colors`}
                  whileHover={{ scale: 1.02 }}
                  aria-expanded={expandedFilters[filterType]}
                  aria-controls={`filter-${filterType}`}
                >
                  <span>
                    {filterType === 'agency_names'
                      ? 'Agency Name'
                      : filterType === 'propertyTypes'
                      ? 'Property Type'
                      : filterType === 'categories'
                      ? 'Status'
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
                    {console.log(`Filter suggestions for ${filterType}:`, dynamicFilterSuggestions[filterType])}
                    <input
                      type="text"
                      value={localManualInputs[filterType] || ''}
                      onChange={(e) => handleManualInputChange(filterType, e.target.value)}
                      onKeyDown={(e) => handleManualInputKeyDown(filterType, e)}
                      placeholder={`Enter ${filterType === 'agency_names' ? 'agency name' : filterType === 'propertyTypes' ? 'property type' : filterType === 'categories' ? 'status (Listed/Sold)' : filterType.replace(/s$/, '')} and press Enter`}
                      className="w-full p-3 mb-3 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all bg-blue-50"
                      aria-label={`Enter ${filterType === 'agency_names' ? 'agency name' : filterType === 'propertyTypes' ? 'property type' : filterType === 'categories' ? 'status' : filterType.replace(/s$/, '')}`}
                    />
                    <Select
                      isMulti
                      options={(dynamicFilterSuggestions[filterType] || []).map((item: string) => ({
                        value: item,
                        label: item,
                      }))}
                      value={(localFilters[filterType] || []).map((item: string) => ({ value: item, label: item }))}
                      onChange={(selected) => handleFilterChange(filterType, selected)}
                      placeholder={`Select ${filterType === 'agency_names' ? 'agency name' : filterType === 'propertyTypes' ? 'property type' : filterType === 'categories' ? 'status' : filterType.replace(/s$/, '')}...`}
                      styles={selectStyles}
                      noOptionsMessage={() => 'No options available'}
                      className="basic-multi-select"
                      classNamePrefix="select"
                      aria-label={`Select ${filterType === 'agency_names' ? 'agency name' : filterType === 'propertyTypes' ? 'property type' : filterType === 'categories' ? 'status' : filterType.replace(/s$/, '')}`}
                    />
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
          <div className="mt-6 flex justify-end space-x-4 relative">
            {exportLoading && (
              <motion.div
                className="absolute inset-0 flex items-center justify-center bg-blue-100 bg-opacity-50 rounded"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              </motion.div>
            )}
            <motion.button
              onClick={previewPropertyReportPDF}
              className="flex items-center px-5 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full hover:from-blue-600 hover:to-blue-700 transition-all"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Preview property report as PDF"
              aria-label="Preview as PDF"
              disabled={exportLoading}
            >
              <FileText className="w-4 h-4 mr-2" />
              Preview PDF
            </motion.button>
            <motion.button
              onClick={exportPropertyReportPDF}
              className="flex items-center px-5 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full hover:from-blue-600 hover:to-blue-700 transition-all"
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
              onClick={exportPropertyReportCSV}
              className="flex items-center px-5 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full hover:from-blue-600 hover:to-blue-700 transition-all"
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
              onClick={exportPropertyReportHTML}
              className="flex items-center px-5 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full hover:from-blue-600 hover:to-blue-700 transition-all"
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

        <AnimatePresence>
          {isPdfPreviewOpen && (
            <motion.div
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <motion.div
                className="bg-white p-8 rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <h3 className="text-2xl font-semibold text-blue-800 mb-6 flex items-center">
                  <FileText className="w-8 h-8 mr-3 text-blue-600" />
                  PDF Preview
                </h3>
                {pdfUrl && (
                  <iframe
                    src={pdfUrl}
                    className="w-full h-[80vh] border border-gray-200"
                    title="PDF Preview"
                  />
                )}
                <div className="mt-6 flex justify-end space-x-4">
                  <motion.button
                    onClick={() => {
                      setIsPdfPreviewOpen(false);
                      setPdfUrl(null);
                    }}
                    className="px-6 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Close
                  </motion.button>
                  <motion.button
                    onClick={exportPropertyReportPDF}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    disabled={exportLoading}
                  >
                    <Download className="w-5 h-5 inline-block mr-2" />
                    Download PDF
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {propertyMetrics ? (
          <>
            <motion.div
              className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 mb-6"
              ref={propertiesTableRef}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h3 className="text-xl font-semibold text-blue-800 mb-4 flex items-center">
                <FileText className="w-6 h-6 mr-2 text-blue-600" />
                Property Details
              </h3>
              {paginatedProperties.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse" role="grid">
                      <thead>
                        <tr className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                          <th className="p-4 text-left text-sm font-semibold"><MapPin className="w-4 h-4 inline-block mr-1" />Street Number</th>
                          <th className="p-4 text-left text-sm font-semibold"><MapPin className="w-4 h-4 inline-block mr-1" />Street Name</th>
                          <th className="p-4 text-left text-sm font-semibold"><MapPin className="w-4 h-4 inline-block mr-1" />Suburb</th>
                          <th className="p-4 text-left text-sm font-semibold"><MapPin className="w-4 h-4 inline-block mr-1" />Postcode</th>
                          <th className="p-4 text-left text-sm font-semibold"><Briefcase className="w-4 h-4 inline-block mr-1" />Agent Name</th>
                          <th className="p-4 text-left text-sm font-semibold"><Home className="w-4 h-4 inline-block mr-1" />Property Type</th>
                          <th className="p-4 text-left text-sm font-semibold"><DollarSign className="w-4 h-4 inline-block mr-1" />Price</th>
                          <th className="p-4 text-left text-sm font-semibold"><DollarSign className="w-4 h-4 inline-block mr-1" />Sold Price</th>
                          <th className="p-4 text-left text-sm font-semibold"><CheckSquare className="w-4 h-4 inline-block mr-1" />Status</th>
                          <th className="p-4 text-left text-sm font-semibold"><Percent className="w-4 h-4 inline-block mr-1" />Commission (%)</th>
                          <th className="p-4 text-left text-sm font-semibold"><DollarSign className="w-4 h-4 inline-block mr-1" />Commission Earned</th>
                          <th className="p-4 text-left text-sm font-semibold"><Briefcase className="w-4 h-4 inline-block mr-1" />Agency</th>
                          <th className="p-4 text-left text-sm font-semibold"><DollarSign className="w-4 h-4 inline-block mr-1" />Expected Price</th>
                          <th className="p-4 text-left text-sm font-semibold"><Briefcase className="w-4 h-4 inline-block mr-1" />Sale Type</th>
                          <th className="p-4 text-left text-sm font-semibold"><Home className="w-4 h-4 inline-block mr-1" />Bedrooms</th>
                          <th className="p-4 text-left text-sm font-semibold"><Home className="w-4 h-4 inline-block mr-1" />Bathrooms</th>
                          <th className="p-4 text-left text-sm font-semibold"><Home className="w-4 h-4 inline-block mr-1" />Car Garage</th>
                          <th className="p-4 text-left text-sm font-semibold"><Home className="w-4 h-4 inline-block mr-1" />SQM</th>
                          <th className="p-4 text-left text-sm font-semibold"><Home className="w-4 h-4 inline-block mr-1" />Land Size</th>
                          <th className="p-4 text-left text-sm font-semibold"><Calendar className="w-4 h-4 inline-block mr-1" />Listed Date</th>
                          <th className="p-4 text-left text-sm font-semibold"><Calendar className="w-4 h-4 inline-block mr-1" />Sold Date</th>
                          <th className="p-4 text-left text-sm font-semibold"><Shield className="w-4 h-4 inline-block mr-1" />Flood Risk</th>
                          <th className="p-4 text-left text-sm font-semibold"><Shield className="w-4 h-4 inline-block mr-1" />Bushfire Risk</th>
                          <th className="p-4 text-left text-sm font-semibold"><CheckSquare className="w-4 h-4 inline-block mr-1" />Contract Status</th>
                          <th className="p-4 text-left text-sm font-semibold"><List className="w-4 h-4 inline-block mr-1" />Features</th>
                          <th className="p-4 text-left text-sm font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedProperties.map((property: PropertyDetails) => {
                          const { commissionRate, commissionEarned } = calculateCommission(property);
                          return (
                            <motion.tr
                              key={property.id}
                              id={`property-${property.id}`}
                              className="border-b border-blue-200 hover:bg-blue-50 transition-colors"
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
                              <td className="p-4 text-gray-700 flex space-x-2">
                                <motion.button
                                  onClick={() => handleEditClick(property)}
                                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  aria-label={`Edit property ${property.street_number} ${property.street_name}`}
                                >
                                  <Edit className="w-4 h-4" />
                                </motion.button>
                                <motion.button
                                  onClick={() => handleDeleteProperty(property.id)}
                                  className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  aria-label={`Delete property ${property.street_number} ${property.street_name}`}
                                >
                                  <Trash2 className="w-4 h-4" />
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
                      onClick={() => setLocalCurrentPage((p: number) => Math.max(p - 1, 1))}
                      disabled={localCurrentPage === 1}
                      className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed"
                      whileHover={{ scale: 1.05 }}
                      aria-label="Previous page"
                    >
                      Previous
                    </motion.button>
                    <span className="text-gray-700">
                      Page {localCurrentPage} of {totalPages}
                    </span>
                    <motion.button
                      onClick={() => setLocalCurrentPage((p: number) => Math.min(p + 1, totalPages))}
                      disabled={localCurrentPage === totalPages}
                      className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      aria-label="Next page"
                    >
                      Next
                    </motion.button>
                  </div>
                </>
              ) : (
                <p className="text-gray-500 text-center">No properties found matching the current filters.</p>
              )}
            </motion.div>

            <AnimatePresence>
              {isEditModalOpen && (
                <motion.div
                  className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <motion.div
                    className="bg-white p-6 rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <h3 className="text-xl font-semibold text-blue-800 mb-4">Edit Property</h3>
                    <form onSubmit={handleEditSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Street Number</label>
                          <input
                            type="text"
                            value={editingProperty?.street_number || ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, street_number: e.target.value } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Street Name</label>
                          <input
                            type="text"
                            value={editingProperty?.street_name || ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, street_name: e.target.value } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                          {formErrors.street_name && (
                            <p className="mt-1 text-sm text-red-600">{formErrors.street_name}</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Suburb</label>
                          <input
                            type="text"
                            value={editingProperty?.suburb || ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, suburb: e.target.value } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                          {formErrors.suburb && (
                            <p className="mt-1 text-sm text-red-600">{formErrors.suburb}</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Postcode</label>
                          <input
                            type="text"
                            value={editingProperty?.postcode || ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, postcode: e.target.value } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Agent Name</label>
                          <input
                            type="text"
                            value={editingProperty?.agent_name || ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, agent_name: e.target.value } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Property Type</label>
                          <input
                            type="text"
                            value={editingProperty?.property_type || ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, property_type: e.target.value } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                          {formErrors.property_type && (
                            <p className="mt-1 text-sm text-red-600">{formErrors.property_type}</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Price</label>
                          <input
                            type="number"
                            value={editingProperty?.price || 0}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, price: parseFloat(e.target.value) } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                          {formErrors.price && (
                            <p className="mt-1 text-sm text-red-600">{formErrors.price}</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Sold Price</label>
                          <input
                            type="number"
                            value={editingProperty?.sold_price || ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, sold_price: e.target.value ? parseFloat(e.target.value) : null } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Category</label>
                          <select
                            value={editingProperty?.category || ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, category: e.target.value } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          >
                            <option value="">Select Category</option>
                            <option value="Listing">Listing</option>
                            <option value="Sold">Sold</option>
                            <option value="Under Offer">Under Offer</option>
                          </select>
                          {formErrors.category && (
                            <p className="mt-1 text-sm text-red-600">{formErrors.category}</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Commission (%)</label>
                          <input
                            type="number"
                            value={editingProperty?.commission || ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, commission: e.target.value ? parseFloat(e.target.value) : null } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Agency Name</label>
                          <input
                            type="text"
                            value={editingProperty?.agency_name || ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, agency_name: e.target.value } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Expected Price</label>
                          <input
                            type="number"
                            value={editingProperty?.expected_price || ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, expected_price: e.target.value ? parseFloat(e.target.value) : null } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Sale Type</label>
                          <input
                            type="text"
                            value={editingProperty?.sale_type || ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, sale_type: e.target.value } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Bedrooms</label>
                          <input
                            type="number"
                            value={editingProperty?.bedrooms || ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, bedrooms: e.target.value ? parseInt(e.target.value) : null } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Bathrooms</label>
                          <input
                            type="number"
                            value={editingProperty?.bathrooms || ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, bathrooms: e.target.value ? parseInt(e.target.value) : null } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Car Garage</label>
                          <input
                            type="number"
                            value={editingProperty?.car_garage || ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, car_garage: e.target.value ? parseInt(e.target.value) : null } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">SQM</label>
                          <input
                            type="number"
                            value={editingProperty?.sqm || ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, sqm: e.target.value ? parseInt(e.target.value) : null } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Land Size</label>
                          <input
                            type="number"
                            value={editingProperty?.landsize || ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, landsize: e.target.value ? parseInt(e.target.value) : null } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Listed Date</label>
                          <input
                            type="date"
                            value={editingProperty?.listed_date ? moment(editingProperty.listed_date).format('YYYY-MM-DD') : ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, listed_date: e.target.value || null } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Sold Date</label>
                          <input
                            type="date"
                            value={editingProperty?.sold_date ? moment(editingProperty.sold_date).format('YYYY-MM-DD') : ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, sold_date: e.target.value || null } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Flood Risk</label>
                          <input
                            type="text"
                            value={editingProperty?.flood_risk || ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, flood_risk: e.target.value } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Bushfire Risk</label>
                          <input
                            type="text"
                            value={editingProperty?.bushfire_risk || ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, bushfire_risk: e.target.value } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Contract Status</label>
                          <input
                            type="text"
                            value={editingProperty?.contract_status || ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, contract_status: e.target.value } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700">Features (comma-separated)</label>
                          <input
                            type="text"
                            value={editingProperty?.features?.join(', ') || ''}
                            onChange={(e) =>
                              setEditingProperty((prev) => prev ? { ...prev, features: e.target.value.split(',').map(f => f.trim()).filter(f => f) } : prev)
                            }
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          />
                        </div>
                      </div>
                      <div className="mt-6 flex justify-end space-x-3">
                        <motion.button
                          type="button"
                          onClick={() => setIsEditModalOpen(false)}
                          className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          Cancel
                        </motion.button>
                        <motion.button
                          type="submit"
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          disabled={isUpdating}
                        >
                          {isUpdating ? <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" /> : null}
                          Save Changes
                        </motion.button>
                      </div>
                    </form>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div
              className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <h3 className="text-xl font-semibold text-blue-800 mb-4 flex items-center">
                <BarChart2 className="w-6 h-6 mr-2 text-blue-600" />
                Sales Heatmap
              </h3>
              {renderPropertyHeatmap()}
            </motion.div>
            <motion.div
              className="bg-white p-6 rounded-xl shadow-lg border border-blue-100 mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <h3 className="text-xl font-semibold text-blue-800 mb-4 flex items-center">
                <TrendingUp className="w-6 h-6 mr-2 text-blue-600" />
                Price Trends
              </h3>
              {renderPriceTrends()}
            </motion.div>
            <motion.div
              className="bg-white p-6 rounded-xl shadow-lg border border-blue-100"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              <h3 className="text-xl font-semibold text-blue-800 mb-4 flex items-center">
                <BarChart2 className="w-6 h-6 mr-2 text-blue-600" />
                General Statistics
              </h3>
              {renderGeneralCharts()}
            </motion.div>
          </>
        ) : (
          <p className="text-gray-500 text-center">No property metrics available.</p>
        )}
      </div>
    </div>
  );
}
