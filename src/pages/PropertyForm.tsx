import { AlertTriangle, ArrowRight, Building, Calendar, Droplet, Flame, Loader2, MapPin, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

interface User {
  id: string;
  email?: string;
}

interface UserProfile {
  name: string;
  phone: string;
  email: string;
  role: 'user' | 'agent';
}

interface SameStreetSale {
  address: string;
  sale_price: number;
  sale_date: string;
  property_type: string;
}

interface PastRecord {
  street_number?: string;
  street_name?: string;
  suburb: string;
  postcode: string;
  property_type: string;
  price: string;
  bedrooms: string;
  bathrooms: string;
  car_garage: string;
  sqm: string;
  landsize: string;
  listing_date?: string;
  sale_date?: string;
  status?: 'Sold' | 'Listed' | 'Withdrawn';
  notes?: string;
}

interface PropertyData {
  id?: string;
  street_number?: string;
  street_name?: string;
  bedrooms: string;
  bathrooms: string;
  car_garage: string;
  sqm: string;
  landsize: string;
  suburb: string;
  agent_name: string;
  agency_name: string;
  postcode: string;
  property_type: string;
  price: string;
  offers_over?: boolean;
  expected_price: string;
  commission: string;
  features: string[];
  user_id?: string;
  created_at?: string;
  listed_date?: string;
  sold_date?: string;
  category?: string;
  sale_type?: 'Private Treaty' | 'Auction' | 'EOI';
  flood_risk?: 'No Risk' | 'Low' | 'Medium' | 'High';
  bushfire_risk?: 'No Risk' | 'Low' | 'Medium' | 'High';
  flood_notes?: string;
  bushfire_notes?: string;
  contract_status?: 'None' | 'Under Offer' | 'Under Contract' | 'Sale';
  same_street_sales?: SameStreetSale[];
  days_on_market?: number;
  past_records?: PastRecord[];
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
  { name:  'Spring Mountain',postcode:'4300'},
  { name:  'Springfield',postcode:'4300'},
];

export function PropertyForm() {
  const navigate = useNavigate();
  const { user, profile, loading, initializeAuth } = useAuthStore((state) => ({
    user: state.user as User | null,
    profile: state.getUserProfile() as UserProfile | null,
    loading: state.loading,
    initializeAuth: state.initializeAuth,
  }));

  const [formData, setFormData] = useState<PropertyData>({
    street_number: '',
    street_name: '',
    bedrooms: '0',
    bathrooms: '0',
    car_garage: '0',
    sqm: '',
    landsize: '',
    suburb: '',
    agent_name: '',
    agency_name: '',
    postcode: '',
    property_type: '',
    price: '',
    offers_over: false,
    expected_price: '',
    commission: '2.5',
    features: [],
    sale_type: 'Private Treaty',
    flood_risk: 'No Risk',
    bushfire_risk: 'No Risk',
    flood_notes: '',
    bushfire_notes: '',
    contract_status: 'None',
    same_street_sales: [],
    days_on_market: 0,
    past_records: [],
    listed_date: '',
    sold_date: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commissionEstimate, setCommissionEstimate] = useState<number>(0);
  const [newFeature, setNewFeature] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showSalesModal, setShowSalesModal] = useState(false);
  const [newSale, setNewSale] = useState<SameStreetSale>({
    address: '',
    sale_price: 0,
    sale_date: '',
    property_type: '',
  });
  const [sortConfig, setSortConfig] = useState<{
    key: keyof SameStreetSale | keyof PastRecord;
    direction: 'asc' | 'desc';
  } | null>(null);
  const [showPastDataModal, setShowPastDataModal] = useState(false);
  const [pastDataTab, setPastDataTab] = useState<'manual' | 'file'>('manual');
  const [newPastRecord, setNewPastRecord] = useState<Partial<PastRecord>>({
    bedrooms: '0',
    bathrooms: '0',
    car_garage: '0',
  });
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });

  // Capitalize first letter of a string
  const capitalizeFirstLetter = (value: string): string => {
    if (!value) return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
  };

  // Calculate days on market based on listed_date
  const calculateDaysOnMarket = (listedDate: string | undefined): number => {
    if (!listedDate) return 0;
    const listed = new Date(listedDate);
    const today = new Date();
    const diffTime = today.getTime() - listed.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  useEffect(() => {
    if (!loading && !user) {
      initializeAuth();
    }
  }, [loading, user, initializeAuth]);

  // Update commission estimate
  useEffect(() => {
    const expectedPrice = parseFloat(formData.expected_price.replace(/,/g, '')) || 0;
    const commissionRate = parseFloat(formData.commission) / 100 || 0;
    setCommissionEstimate(expectedPrice * commissionRate);
  }, [formData.expected_price, formData.commission]);

  // Update days_on_market when listed_date changes
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      days_on_market: calculateDaysOnMarket(prev.listed_date),
    }));
  }, [formData.listed_date]);

  const requiredFields: (keyof PropertyData)[] = [
    'suburb',
    'postcode',
    'property_type',
    'price',
    'expected_price',
    'agency_name',
    'commission',
    'agent_name',
  ];
  const completionPercentage = Math.round(
    (requiredFields.filter((field) => formData[field]?.toString().trim()).length / requiredFields.length) * 100
  );

  const formatPriceInput = (value: string): string => {
    let cleaned = value.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts[1];
    }
    const [integerPart, decimalPart] = cleaned.split('.');
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decimalPart !== undefined ? `${formattedInteger}.${decimalPart}` : formattedInteger;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    let formattedValue: string | number | boolean = value;

    if (name === 'suburb') {
      const selectedSuburb = ALLOWED_SUBURBS.find((s) => s.name === value);
      setFormData((prev) => ({
        ...prev,
        suburb: value,
        postcode: selectedSuburb ? selectedSuburb.postcode : prev.postcode,
      }));
      return;
    }

    if (name === 'postcode') {
      const formattedPostcode = value.replace(/\D/g, '').slice(0, 4);
      const matchingSuburb = ALLOWED_SUBURBS.find((s) => s.postcode === formattedPostcode);
      setFormData((prev) => ({
        ...prev,
        postcode: formattedPostcode,
        suburb: matchingSuburb ? matchingSuburb.name : prev.suburb,
      }));
      return;
    }

    if (['price', 'expected_price', 'sqm', 'landsize'].includes(name)) {
      formattedValue = formatPriceInput(value);
    } else if (name === 'commission') {
      formattedValue = value.replace(/[^0-9.]/g, '');
      const numValue = parseFloat(formattedValue);
      if (numValue > 100) formattedValue = '100';
    } else if (['street_number', 'street_name', 'agent_name', 'agency_name'].includes(name)) {
      formattedValue = capitalizeFirstLetter(value);
    }

    setFormData((prev) => ({ ...prev, [name]: formattedValue }));
  };

  const handleOffersOverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, offers_over: e.target.checked }));
  };

  const addFeature = () => {
    if (newFeature.trim() && !formData.features.includes(newFeature.trim())) {
      setFormData((prev) => ({
        ...prev,
        features: [...prev.features, capitalizeFirstLetter(newFeature.trim())],
      }));
      setNewFeature('');
    }
  };

  const removeFeature = (feature: string) => {
    setFormData((prev) => ({
      ...prev,
      features: prev.features.filter((f) => f !== feature),
    }));
  };

  const handleSaleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNewSale((prev) => ({
      ...prev,
      [name]: name === 'sale_price' ? parseFloat(value.replace(/[^0-9.]/g, '')) || 0 : name === 'address' ? capitalizeFirstLetter(value) : value,
    }));
  };

  const addSale = () => {
    if (
      newSale.address.trim() &&
      newSale.sale_price > 0 &&
      newSale.sale_date &&
      newSale.property_type
    ) {
      setFormData((prev) => ({
        ...prev,
        same_street_sales: [...(prev.same_street_sales || []), newSale],
      }));
      setNewSale({ address: '', sale_price: 0, sale_date: '', property_type: '' });
      setShowSalesModal(false);
    }
  };

  const removeSale = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      same_street_sales: (prev.same_street_sales || []).filter((_, i) => i !== index),
    }));
  };

  const sortData = (key: keyof SameStreetSale | keyof PastRecord, type: 'sales' | 'past') => {
    const direction =
      sortConfig?.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ key, direction });

    if (type === 'sales') {
      setFormData((prev) => ({
        ...prev,
        same_street_sales: [...(prev.same_street_sales || [])].sort((a, b) => {
          const aValue = a[key as keyof SameStreetSale];
          const bValue = b[key as keyof SameStreetSale];
          if (direction === 'asc') {
            return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
          }
          return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
        }),
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        past_records: [...(prev.past_records || [])].sort((a, b) => {
          const aValue = a[key as keyof PastRecord];
          const bValue = b[key as keyof PastRecord];
          if (direction === 'asc') {
            return (aValue || '') < (bValue || '') ? -1 : (aValue || '') > (bValue || '') ? 1 : 0;
          }
          return (aValue || '') > (bValue || '') ? -1 : (aValue || '') < (bValue || '') ? 1 : 0;
        }),
      }));
    }
  };

  const handlePastRecordChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    let formattedValue: string | number | undefined = value;

    if (name === 'suburb') {
      const selectedSuburb = ALLOWED_SUBURBS.find((s) => s.name === value);
      setNewPastRecord((prev) => ({
        ...prev,
        suburb: value,
        postcode: selectedSuburb ? selectedSuburb.postcode : prev.postcode,
      }));
      return;
    }

    if (name === 'postcode') {
      const formattedPostcode = value.replace(/\D/g, '').slice(0, 4);
      const matchingSuburb = ALLOWED_SUBURBS.find((s) => s.postcode === formattedPostcode);
      setNewPastRecord((prev) => ({
        ...prev,
        postcode: formattedPostcode,
        suburb: matchingSuburb ? matchingSuburb.name : prev.suburb,
      }));
      return;
    }

    if (['price', 'sqm', 'landsize'].includes(name)) {
      formattedValue = formatPriceInput(value);
    } else if (name === 'status') {
      const validStatuses = ['Sold', 'Listed', 'Withdrawn'] as const;
      formattedValue = validStatuses.includes(value as any)
        ? value as 'Sold' | 'Listed' | 'Withdrawn'
        : undefined;
    } else if (['street_number', 'street_name', 'notes'].includes(name)) {
      formattedValue = capitalizeFirstLetter(value);
    }

    setNewPastRecord((prev) => ({
      ...prev,
      [name]: formattedValue === '' ? undefined : formattedValue,
    }));
  };

  const validatePastRecord = (record: Partial<PastRecord>): string | null => {
    const requiredFields: (keyof PastRecord)[] = ['suburb', 'postcode', 'property_type', 'price'];
    for (const field of requiredFields) {
      if (!record[field]?.toString().trim()) {
        return `Missing ${field.replace('_', ' ')}`;
      }
    }

    if (!ALLOWED_SUBURBS.some((s) => s.name === record.suburb)) {
      return 'Invalid suburb. Please select from the allowed list.';
    }

    if (!/^\d{4}$/.test(record.postcode || '')) {
      return 'Postcode must be a 4-digit number';
    }

    const price = parseFloat(record.price?.replace(/,/g, '') || '');
    if (isNaN(price) || price <= 0) {
      return 'Price must be a positive number';
    }

    if (
      record.sale_date &&
      record.listing_date &&
      new Date(record.sale_date) < new Date(record.listing_date)
    ) {
      return 'Sale date cannot be before listing date';
    }

    return null;
  };

  const addPastRecord = () => {
    const validationError = validatePastRecord(newPastRecord);
    if (validationError) {
      setError(validationError);
      return;
    }

    setFormData((prev) => ({
      ...prev,
      past_records: [...(prev.past_records || []), newPastRecord as PastRecord],
    }));
    setNewPastRecord({ bedrooms: '1', bathrooms: '1', car_garage: '0' });
    setShowPastDataModal(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !['.csv', '.xlsx', '.xls'].some((ext) => file.name.toLowerCase().endsWith(ext))) {
      setFileError('Please upload a valid CSV or Excel file (.csv, .xlsx, .xls)');
      return;
    }

    setFileLoading(true);
    setFileError(null);

    if (file.name.toLowerCase().endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        try {
          const rows = text.split('\n').map((row) => row.split(',').map((cell) => cell.trim()));
          const headers = rows[0];
          const requiredHeaders = ['suburb', 'postcode', 'property_type', 'price'];
          const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));

          if (missingHeaders.length) {
            setFileError(`Missing required columns: ${missingHeaders.join(', ')}`);
            setFileLoading(false);
            return;
          }

          const newRecords: PastRecord[] = [];
          for (let i = 1; i < rows.length; i++) {
            if (rows[i].length < headers.length) continue;
            const record: Partial<PastRecord> = {};
            headers.forEach((header, index) => {
              let value = rows[i][index];
              if (['street_number', 'street_name', 'notes'].includes(header)) {
                value = capitalizeFirstLetter(value);
              }
              if (header === 'suburb') {
                const selectedSuburb = ALLOWED_SUBURBS.find((s) => s.name === value);
                if (!selectedSuburb) {
                  setFileError(`Invalid suburb in row ${i + 1}: ${value}`);
                  setFileLoading(false);
                  return;
                }
                record.suburb = selectedSuburb.name;
                record.postcode = selectedSuburb.postcode;
              } else if (header === 'price' || header === 'sqm' || header === 'landsize') {
                record[header as keyof PastRecord] = formatPriceInput(value);
              } else if (header === 'bedrooms' || header === 'bathrooms' || header === 'car_garage') {
                record[header as keyof PastRecord] = value || '0';
              } else if (header === 'status') {
                const validStatuses = ['Sold', 'Listed', 'Withdrawn'] as const;
                record.status = validStatuses.includes(value as any)
                  ? value as 'Sold' | 'Listed' | 'Withdrawn'
                  : undefined;
              } else if (header !== 'postcode') {
                record[header as keyof PastRecord] = value;
              }
            });

            const validationError = validatePastRecord(record);
            if (validationError) {
              setFileError(`Error in row ${i + 1}: ${validationError}`);
              setFileLoading(false);
              return;
            }

            newRecords.push(record as PastRecord);
          }

          setFormData((prev) => ({
            ...prev,
            past_records: [...(prev.past_records || []), ...newRecords],
          }));
          setFileLoading(false);
        } catch (err) {
          setFileError('Failed to parse CSV file');
          setFileLoading(false);
        }
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = event.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          const headers = rows[0].map((h: string) => h?.toString().trim().toLowerCase());
          const requiredHeaders = ['suburb', 'postcode', 'property_type', 'price'];
          const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h.toLowerCase()));

          if (missingHeaders.length) {
            setFileError(`Missing required columns: ${missingHeaders.join(', ')}`);
            setFileLoading(false);
            return;
          }

          const newRecords: PastRecord[] = [];
          for (let i = 1; i < rows.length; i++) {
            if (!rows[i] || rows[i].length === 0) continue;
            const record: Partial<PastRecord> = {};
            headers.forEach((header: string, index: number) => {
              let value = rows[i][index]?.toString().trim();
              if (!value) return;
              if (['street_number', 'street_name', 'notes'].includes(header)) {
                value = capitalizeFirstLetter(value);
              }
              if (header === 'suburb') {
                const selectedSuburb = ALLOWED_SUBURBS.find((s) => s.name === value);
                if (!selectedSuburb) {
                  setFileError(`Invalid suburb in row ${i + 1}: ${value}`);
                  setFileLoading(false);
                  return;
                }
                record.suburb = selectedSuburb.name;
                record.postcode = selectedSuburb.postcode;
              } else if (header === 'price' || header === 'sqm' || header === 'landsize') {
                record[header as keyof PastRecord] = formatPriceInput(value);
              } else if (header === 'bedrooms' || header === 'bathrooms' || header === 'car_garage') {
                record[header as keyof PastRecord] = value || '0';
              } else if (header === 'status') {
                const validStatuses = ['Sold', 'Listed', 'Withdrawn'] as const;
                record.status = validStatuses.includes(value as any)
                  ? value as 'Sold' | 'Listed' | 'Withdrawn'
                  : undefined;
              } else if (header !== 'postcode') {
                record[header as keyof PastRecord] = value;
              }
            });

            const validationError = validatePastRecord(record);
            if (validationError) {
              setFileError(`Error in row ${i + 1}: ${validationError}`);
              setFileLoading(false);
              return;
            }

            newRecords.push(record as PastRecord);
          }

          setFormData((prev) => ({
            ...prev,
            past_records: [...(prev.past_records || []), ...newRecords],
          }));
          setFileLoading(false);
        } catch (err) {
          setFileError('Failed to parse Excel file');
          setFileLoading(false);
        }
      };
      reader.readAsBinaryString(file);
    }
  };

  const removePastRecord = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      past_records: (prev.past_records || []).filter((_, i) => i !== index),
    }));
  };

  const validateForm = () => {
    for (const field of requiredFields) {
      if (!formData[field]?.toString().trim()) {
        setError(`Please enter a valid ${field.replace('_', ' ')}`);
        return false;
      }
    }

    if (!ALLOWED_SUBURBS.some((s) => s.name === formData.suburb)) {
      setError('Please select a valid suburb from the list');
      return false;
    }

    if (!/^\d{4}$/.test(formData.postcode)) {
      setError('Please enter a valid 4-digit postcode');
      return false;
    }

    const price = parseFloat(formData.price.replace(/,/g, ''));
    const expectedPrice = parseFloat(formData.expected_price.replace(/,/g, ''));
    const commission = parseFloat(formData.commission);

    if (isNaN(price) || price <= 0) {
      setError('Asking price must be a positive number');
      return false;
    }
    if (isNaN(expectedPrice) || expectedPrice <= 0) {
      setError('Expected price must be a positive number');
      return false;
    }
    if (isNaN(commission) || commission <= 0) {
      setError('Commission must be a positive percentage');
      return false;
    }

    if (
      formData.sold_date &&
      formData.listed_date &&
      new Date(formData.sold_date) < new Date(formData.listed_date)
    ) {
      setError('Sold date cannot be before listed date');
      return false;
    }

    if (formData.days_on_market && formData.days_on_market < 0) {
      setError('Days on market cannot be negative');
      return false;
    }

    setError(null);
    return true;
  };



const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  if (!validateForm() || !user) {
    setError('Please complete all required fields or log in');
    setToast({ message: 'Please complete all required fields or log in', type: 'error', visible: true });
    setTimeout(() => setToast({ message: '', type: 'success', visible: false }), 5000);
    return;
  }

  // Validate user.id format (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(user.id)) {
    const errorMessage = 'Invalid user ID format';
    setError(errorMessage);
    setToast({ message: errorMessage, type: 'error', visible: true });
    setTimeout(() => setToast({ message: '', type: 'success', visible: false }), 5000);
    return;
  }

  setIsSubmitting(true);
  setError(null);
  try {
    const propertyData = {
      p_street_number: formData.street_number || null,
      p_street_name: formData.street_name || null,
      p_bedrooms: parseInt(formData.bedrooms) || 0,
      p_bathrooms: parseInt(formData.bathrooms) || 0,
      p_car_garage: parseInt(formData.car_garage) || 0,
      p_sqm: parseFloat(formData.sqm.replace(/,/g, '')) || 0,
      p_landsize: parseFloat(formData.landsize.replace(/,/g, '')) || 0,
      p_suburb: formData.suburb || null,
      p_agent_name: formData.agent_name || null,
      p_agency_name: formData.agency_name || null,
      p_postcode: formData.postcode || null,
      p_property_type: formData.property_type || null,
      p_price: parseFloat(formData.price.replace(/,/g, '')) || 0,
      p_offers_over: formData.offers_over || false,
      p_expected_price: parseFloat(formData.expected_price.replace(/,/g, '')) || 0,
      p_commission: parseFloat(formData.commission) || 0,
      p_features: formData.features || [],
      p_user_id: user.id,
      p_created_at: new Date().toISOString(),
      p_listed_date: formData.listed_date || null,
      p_sold_date: formData.sold_date || null,
      p_category: 'Listing',
      p_sale_type: formData.sale_type || null,
      p_flood_risk: formData.flood_risk || null,
      p_bushfire_risk: formData.bushfire_risk || null,
      p_flood_notes: formData.flood_notes || null,
      p_bushfire_notes: formData.bushfire_notes || null,
      p_contract_status: formData.contract_status || null,
      p_same_street_sales: formData.same_street_sales || [],
      p_days_on_market: formData.days_on_market || 0,
      p_past_records: formData.past_records?.map((record) => ({
        ...record,
        price: parseFloat(record.price.replace(/,/g, '')) || 0,
        sqm: parseFloat(record.sqm?.replace(/,/g, '') || '0'),
        landsize: parseFloat(record.landsize?.replace(/,/g, '') || '0'),
      })) || [],
    };

    console.log('Calling RPC with data:', propertyData);

    const { data, error } = await supabase.rpc('insert_property', propertyData);

    if (error) {
      console.error('RPC error:', error);
      throw new Error(`Failed to save property via RPC: ${error.message || 'Unknown error'}`);
    }

    console.log('RPC result:', data);

    if (!data || data.length === 0) {
      console.error('No data returned from RPC:', data);
      throw new Error('No property data returned from RPC');
    }

    if (data.length > 1) {
      console.error('Multiple rows returned from RPC:', data);
      throw new Error('Multiple rows returned by RPC. Check database triggers or function logic.');
    }

    const insertedProperty = data[0];
    if (!insertedProperty.id) {
      console.error('No valid ID in returned data:', insertedProperty);
      throw new Error('No valid property ID returned');
    }

    console.log('Property inserted via RPC:', insertedProperty);
    setSubmitted(true);
    setToast({ message: 'Property listed successfully!', type: 'success', visible: true });
    setTimeout(() => {
      setToast({ message: '', type: 'success', visible: false });
      if (profile?.role === 'agent') {
        navigate('/agent-dashboard');
        } else if (profile?.role === 'admin') {
      navigate('/admin-dashboard');
      } else {
        navigate(`/property-detail/${insertedProperty.id}`, { state: { property: insertedProperty } });
      }
    }, 4000);
  } catch (err: any) {
    console.error('Submission error:', err);
    const errorMessage = `Failed to submit property: ${err.message || 'Unknown error'}`;
    setError(errorMessage);
    setToast({ message: errorMessage, type: 'error', visible: true });
    setTimeout(() => {
      setToast({ message: '', type: 'success', visible: false });
    }, 5000);
  } finally {
    setIsSubmitting(false);
  }
};

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-4 text-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
        <p className="text-gray-600 mt-2">Loading authentication...</p>
      </div>
    );
  }

  if (!user || !profile || !['agent', 'admin'].includes(profile.role)) {
    console.warn('Unauthorized access detected, user:', user, 'profile:', profile);
    setTimeout(() => {
      setToast({ message: '', type: 'success', visible: false });
    if (profile?.role === 'agent') {
      navigate('/agent-dashboard');
    } else if (profile?.role === 'admin') {
      navigate('/admin-dashboard');
    } else {
      navigate(`/property-detail/${insertedProperty.id}`, { state: { property: insertedProperty } });
    }
  }, 4000);
    return (
      <div className="max-w-2xl mx-auto p-4 text-center">
        <h2 className="text-2xl font-bold text-red-600">Access Denied</h2>
        <p className="text-gray-600 mt-2">Only agents can add properties. Redirecting to login...</p>
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto mt-4" />
      </div>
    );
  }
  // Toast rendering
{toast.visible && (
  <div
    className={`fixed top-4 right-4 px-4 py-2 rounded-lg shadow-lg animate-fade-in ${
      toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
    }`}
  >
    {toast.message}
    <button
      type="button"
      onClick={() => setToast({ message: '', type: 'success', visible: false })}
      className="ml-2 text-white hover:text-gray-200"
    >
      <X className="w-4 h-4" />
    </button>
  </div>
)}

  if (submitted) {
  return (
    <div className="max-w-2xl mx-auto text-center py-12">
      <div className="bg-white p-8 rounded-lg shadow-md border-2 border-green-500">
        <Building className="w-16 h-16 text-green-600 mx-auto mb-4 animate-pulse" />
        <h2 className="text-3xl font-bold text-green-700 mb-4">Property Listed Successfully!</h2>
        <p className="text-gray-600 mb-6">Your property has been saved and will be available shortly.</p>
        <p className="text-gray-500 mb-4">
          Redirecting to {profile?.role === 'agent' ? 'Agent Dashboard' : profile?.role === 'admin' ? 'Admin Dashboard' : 'Property Details'}...
        </p>
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
        <button
          type="button"
          onClick={() => {
            setToast({ message: '', type: 'success', visible: false });
            if (profile?.role === 'agent') {
              navigate('/agent-dashboard');
              } else if (profile?.role === 'admin') {
              navigate('/admin-dashboard');
            } else {
              navigate('/property-detail');
            }
          }}
          className="mt-6 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          Go to {profile?.role === 'agent' ? 'Dashboard' : profile?.role === 'admin' ? 'Admin Dashboard' : 'Property Details'} Now
        </button>
      </div>
    </div>
  );
}

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'High':
        return 'bg-red-500 text-white';
      case 'Medium':
        return 'bg-yellow-500 text-black';
      case 'Low':
        return 'bg-green-500 text-white';
      case 'No Risk':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      {toast.visible && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg animate-fade-in">
          {toast.message}
        </div>
      )}
      <div className="bg-white p-8 rounded-lg shadow-md relative">
        <div className="absolute top-4 right-4">
          <div className="flex items-center">
            <span className="text-sm text-gray-600 mr-2">Form Completion:</span>
            <div className="w-24 bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full"
                style={{ width: `${completionPercentage}%` }}
              ></div>
            </div>
            <span className="text-sm text-gray-600 ml-2">{completionPercentage}%</span>
          </div>
        </div>
        <div className="flex items-center justify-center mb-6">
          <MapPin className="w-10 h-10 text-blue-600 mr-2" />
          <h2 className="text-2xl font-bold">List New Property</h2>
        </div>
        {error && <p className="text-red-600 text-center mb-4">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 mb-2" htmlFor="street_number">
                Street Number
              </label>
              <input
                id="street_number"
                name="street_number"
                type="text"
                value={formData.street_number ?? ''}
                onChange={handleChange}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                placeholder="Enter street number"
              />
            </div>
            <div>
              <label className="block text-gray-700 mb-2" htmlFor="street_name">
                Street Name
              </label>
              <input
                id="street_name"
                name="street_name"
                type="text"
                value={formData.street_name ?? ''}
                onChange={handleChange}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                placeholder="Enter street name"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 mb-2" htmlFor="suburb">
                Suburb
              </label>
              <select
                id="suburb"
                name="suburb"
                value={formData.suburb}
                onChange={handleChange}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select Suburb</option>
                {ALLOWED_SUBURBS.map((suburb) => (
                  <option key={suburb.name} value={suburb.name}>
                    {suburb.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-gray-700 mb-2" htmlFor="postcode">
                Postcode
              </label>
              <input
                id="postcode"
                name="postcode"
                type="text"
                value={formData.postcode}
                onChange={handleChange}
                maxLength={4}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                placeholder="Enter 4-digit postcode"
                required
              />
            </div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <MapPin className="w-5 h-5 text-blue-600 mr-2" />
                <label className="block text-gray-700 font-semibold">
                  Recent Sales in Same Street
                </label>
              </div>
              <button
                type="button"
                onClick={() => setShowSalesModal(true)}
                className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
              >
                Add Sale
              </button>
            </div>
            {formData.same_street_sales?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-100">
                    <tr>
                      <th
                        className="px-4 py-2 cursor-pointer"
                        onClick={() => sortData('address', 'sales')}
                      >
                        Address {sortConfig?.key === 'address' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        className="px-4 py-2 cursor-pointer"
                        onClick={() => sortData('sale_price', 'sales')}
                      >
                        Sale Price {sortConfig?.key === 'sale_price' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        className="px-4 py-2 cursor-pointer"
                        onClick={() => sortData('sale_date', 'sales')}
                      >
                        Sale Date {sortConfig?.key === 'sale_date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.same_street_sales.map((sale, index) => (
                      <tr key={index} className="border-b">
                        <td className="px-4 py-2">{sale.address}</td>
                        <td className="px-4 py-2">
                          {new Intl.NumberFormat('en-AU', {
                            style: 'currency',
                            currency: 'AUD',
                          }).format(sale.sale_price)}
                        </td>
                        <td className="px-4 py-2">
                          {new Date(sale.sale_date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2">{sale.property_type}</td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => removeSale(index)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-600">No sales added yet.</p>
            )}
          </div>
          {showSalesModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Add Sale Record</h3>
                  <button
                    type="button"
                    onClick={() => setShowSalesModal(false)}
                    className="text-gray-600 hover:text-gray-800"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-gray-700 mb-1" htmlFor="sale_address">
                      Address
                    </label>
                    <input
                      id="sale_address"
                      name="address"
                      type="text"
                      value={newSale.address}
                      onChange={handleSaleChange}
                      className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter address"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 mb-1" htmlFor="sale_price">
                      Sale Price (AUD)
                    </label>
                    <input
                      id="sale_price"
                      name="sale_price"
                      type="text"
                      value={newSale.sale_price}
                      onChange={handleSaleChange}
                      className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter sale price"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 mb-1" htmlFor="sale_date">
                      Sale Date
                    </label>
                    <input
                      id="sale_date"
                      name="sale_date"
                      type="date"
                      value={newSale.sale_date}
                      onChange={handleSaleChange}
                      className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 mb-1" htmlFor="sale_property_type">
                      Property Type
                    </label>
                    <select
                      id="sale_property_type"
                      name="property_type"
                      value={newSale.property_type}
                      onChange={handleSaleChange}
                      className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select</option>
                      <option value="house">House</option>
                      <option value="apartment">Apartment</option>
                      <option value="land">Land</option>
                      <option value="commercial">Commercial</option>
                      <option value="home_town">Home Town</option>
                      <option value="acreage">Acreage</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end mt-6">
                  <button
                    type="button"
                    onClick={addSale}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                  >
                    Add Sale
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <Calendar className="w-5 h-5 text-blue-600 mr-2" />
                <label className="block text-gray-700 font-semibold">
                  Past Property Records ({formData.past_records?.length || 0})
                </label>
              </div>
              <button
                type="button"
                onClick={() => setShowPastDataModal(true)}
                className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
              >
                Add Past Data
              </button>
            </div>
            {formData.past_records?.length ? (
              <div className="mb-4">
                <p className="text-sm text-gray-600">Price History Trend</p>
                <div className="flex items-center h-10">
                  {formData.past_records
                    .filter((r) => r.price)
                    .sort((a, b) => (a.sale_date || a.listing_date || '') < (b.sale_date || b.listing_date || '') ? -1 : 1)
                    .map((record, index, arr) => (
                      <div
                        key={index}
                        className="flex-1 h-full"
                        style={{
                          background: `linear-gradient(to top, #3b82f6 ${
                            ((parseFloat(record.price.replace(/,/g, '')) || 0) /
                              Math.max(...arr.map((r) => parseFloat(r.price.replace(/,/g, '')) || 0))) *
                            100
                          }%, transparent 0%)`,
                        }}
                        title={`$${parseFloat(record.price.replace(/,/g, ''))?.toLocaleString()} on ${
                          record.sale_date || record.listing_date
                        }`}
                      ></div>
                    ))}
                </div>
              </div>
            ) : null}
            {formData.past_records?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-100">
                    <tr>
                      <th
                        className="px-4 py-2 cursor-pointer"
                        onClick={() => sortData('suburb', 'past')}
                      >
                        Suburb {sortConfig?.key === 'suburb' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        className="px-4 py-2 cursor-pointer"
                        onClick={() => sortData('price', 'past')}
                      >
                        Price {sortConfig?.key === 'price' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        className="px-4 py-2 cursor-pointer"
                        onClick={() => sortData('sale_date', 'past')}
                      >
                        Sale Date {sortConfig?.key === 'sale_date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.past_records.map((record, index) => (
                      <tr key={index} className="border-b">
                        <td className="px-4 py-2">{record.suburb}</td>
                        <td className="px-4 py-2">
                          {new Intl.NumberFormat('en-AU', {
                            style: 'currency',
                            currency: 'AUD',
                          }).format(parseFloat(record.price.replace(/,/g, '')))}
                        </td>
                        <td className="px-4 py-2">
                          {record.sale_date
                            ? new Date(record.sale_date).toLocaleDateString()
                            : record.listing_date
                            ? new Date(record.listing_date).toLocaleDateString()
                            : 'N/A'}
                        </td>
                        <td className="px-4 py-2">{record.property_type}</td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => removePastRecord(index)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-600">No past records added yet.</p>
            )}
          </div>
          {showPastDataModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-lg shadow-xl max-w-2xl w-full">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Add Past Property Data</h3>
                  <button
                    type="button"
                    onClick={() => setShowPastDataModal(false)}
                    className="text-gray-600 hover:text-gray-800"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex border-b mb-4">
                  <button
                    className={`px-4 py-2 ${pastDataTab === 'manual' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
                    onClick={() => setPastDataTab('manual')}
                  >
                    Manual Entry
                  </button>
                  <button
                    className={`px-4 py-2 ${pastDataTab === 'file' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
                    onClick={() => setPastDataTab('file')}
                  >
                    File Upload
                  </button>
                </div>
                {pastDataTab === 'manual' ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-gray-700 mb-1" htmlFor="past_street_number">
                          Street Number
                        </label>
                        <input
                          id="past_street_number"
                          name="street_number"
                          type="text"
                          value={newPastRecord.street_number ?? ''}
                          onChange={handlePastRecordChange}
                          className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                          placeholder="Enter street number"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-700 mb-1" htmlFor="past_street_name">
                          Street Name
                        </label>
                        <input
                          id="past_street_name"
                          name="street_name"
                          type="text"
                          value={newPastRecord.street_name ?? ''}
                          onChange={handlePastRecordChange}
                          className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                          placeholder="Enter street name"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-gray-700 mb-1" htmlFor="past_suburb">
                          Suburb
                        </label>
                        <select
                          id="past_suburb"
                          name="suburb"
                          value={newPastRecord.suburb ?? ''}
                          onChange={handlePastRecordChange}
                          className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                          required
                        >
                          <option value="">Select Suburb</option>
                          {ALLOWED_SUBURBS.map((suburb) => (
                            <option key={suburb.name} value={suburb.name}>
                              {suburb.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-gray-700 mb-1" htmlFor="past_postcode">
                          Postcode
                        </label>
                        <input
                          id="past_postcode"
                          name="postcode"
                          type="text"
                          value={newPastRecord.postcode ?? ''}
                          onChange={handlePastRecordChange}
                          maxLength={4}
                          className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                          placeholder="Enter 4-digit postcode"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-gray-700 mb-1" htmlFor="past_property_type">
                        Property Type
                      </label>
                      <select
                        id="past_property_type"
                        name="property_type"
                        value={newPastRecord.property_type ?? ''}
                        onChange={handlePastRecordChange}
                        className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        <option value="">Select</option>
                        <option value="house">House</option>
                        <option value="apartment">Apartment</option>
                        <option value="land">Land</option>
                        <option value="commercial">Commercial</option>
                        <option value="home_town">Home Town</option>
                        <option value="acreage">Acreage</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-gray-700 mb-1" htmlFor="past_price">
                          Price (AUD)
                        </label>
                        <input
                          id="past_price"
                          name="price"
                          type="text"
                          value={newPastRecord.price ?? ''}
                          onChange={handlePastRecordChange}
                          className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                          placeholder="Enter price"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-gray-700 mb-1" htmlFor="past_landsize">
                          Land Size (sqm)
                        </label>
                        <input
                          id="past_landsize"
                          name="landsize"
                          type="text"
                          value={newPastRecord.landsize ?? ''}
                          onChange={handlePastRecordChange}
                          className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                          placeholder="Enter land size"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <label className="block text-gray-700 mb-1" htmlFor="past_bedrooms">
                          Beds
                        </label>
                        <select
                          id="past_bedrooms"
                          name="bedrooms"
                          value={newPastRecord.bedrooms ?? '0'}
                          onChange={handlePastRecordChange}
                          className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                        >
                          {[...Array(10)].map((_, i) => (
                            <option key={i + 1} value={i + 1}>
                              {i + 1}
                            </option>
                          ))}
                          <option value="10+">10+</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-gray-700 mb-1" htmlFor="past_bathrooms">
                          Baths
                        </label>
                        <select
                          id="past_bathrooms"
                          name="bathrooms"
                          value={newPastRecord.bathrooms ?? '0'}
                          onChange={handlePastRecordChange}
                          className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                        >
                          {[...Array(10)].map((_, i) => (
                            <option key={i + 1} value={i + 1}>
                              {i + 1}
                            </option>
                          ))}
                          <option value="10+">10+</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-gray-700 mb-1" htmlFor="past_car_garage">
                          Garage
                        </label>
                        <select
                          id="past_car_garage"
                          name="car_garage"
                          value={newPastRecord.car_garage ?? '0'}
                          onChange={handlePastRecordChange}
                          className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                        >
                          {[...Array(10)].map((_, i) => (
                            <option key={i + 1} value={i + 1}>
                              {i + 1}
                            </option>
                          ))}
                          <option value="10+">10+</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-gray-700 mb-1" htmlFor="past_sqm">
                          Sqm
                        </label>
                        <input
                          id="past_sqm"
                          name="sqm"
                          type="text"
                          value={newPastRecord.sqm ?? ''}
                          onChange={handlePastRecordChange}
                          className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                          placeholder="Enter sqm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-gray-700 mb-1" htmlFor="past_listing_date">
                          Listing Date
                        </label>
                        <input
                          id="past_listing_date"
                          name="listing_date"
                          type="date"
                          value={newPastRecord.listing_date ?? ''}
                          onChange={handlePastRecordChange}
                          className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-700 mb-1" htmlFor="past_sale_date">
                          Sale Date
                        </label>
                        <input
                          id="past_sale_date"
                          name="sale_date"
                          type="date"
                          value={newPastRecord.sale_date ?? ''}
                          onChange={handlePastRecordChange}
                          className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-gray-700 mb-1" htmlFor="past_status">
                        Status
                      </label>
                      <select
                        id="past_status"
                        name="status"
                        value={newPastRecord.status ?? ''}
                        onChange={handlePastRecordChange}
                        className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select (optional)</option>
                        <option value="Sold">Sold</option>
                        <option value="Listed">Listed</option>
                        <option value="Withdrawn">Withdrawn</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-700 mb-1" htmlFor="past_notes">
                        Notes
                      </label>
                      <textarea
                        id="past_notes"
                        name="notes"
                        value={newPastRecord.notes ?? ''}
                        onChange={handlePastRecordChange}
                        className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter any notes (e.g., renovations, market conditions)"
                        rows={3}
                      />
                    </div>
                    <div className="flex justify-end mt-4">
                      <button
                        type="button"
                        onClick={addPastRecord}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                      >
                        Add Record
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {fileError && <p className="text-red-600">{fileError}</p>}
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleFileUpload}
                      className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                    />
                    {fileLoading && (
                      <div className="flex items-center justify-center">
                        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                        <span className="ml-2 text-gray-600">Parsing file...</span>
                      </div>
                    )}
                    <p className="text-sm text-gray-600">
                      Expected columns (CSV or Excel): street_number, street_name, suburb, postcode, property_type,
                      price, bedrooms, bathrooms, car_garage, sqm, landsize, listing_date, sale_date,
                      status, notes
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 mb-2" htmlFor="property_type">
                Property Type
              </label>
              <select
                id="property_type"
                name="property_type"
                value={formData.property_type}
                onChange={handleChange}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select</option>
                <option value="house">House</option>
                <option value="apartment">Apartment</option>
                <option value="land">Land</option>
                <option value="commercial">Commercial</option>
                <option value="home_town">Home Town</option>
                <option value="acreage">Acreage</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-700 mb-2" htmlFor="landsize">
                Land Size (sqm)
              </label>
              <input
                id="landsize"
                name="landsize"
                type="text"
                value={formData.landsize}
                onChange={handleChange}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                placeholder="Enter land size in square meters"
              />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-gray-700 mb-2" htmlFor="bedrooms">
                Beds
              </label>
              <select
                id="bedrooms"
                name="bedrooms"
                value={formData.bedrooms}
                onChange={handleChange}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
              >
                <option value="0">0</option>
                {[...Array(10)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
                <option value="10+">10+</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-700 mb-2" htmlFor="bathrooms">
                Baths
              </label>
              <select
                id="bathrooms"
                name="bathrooms"
                value={formData.bathrooms}
                onChange={handleChange}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
              >
                <option value="0">0</option>
                {[...Array(10)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
                <option value="10+">10+</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-700 mb-2" htmlFor="car_garage">
                Garage
              </label>
              <select
                id="car_garage"
                name="car_garage"
                value={formData.car_garage}
                onChange={handleChange}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
              >
                <option value="0">0</option>
                {[...Array(10)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
                <option value="10+">10+</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-700 mb-2" htmlFor="sqm">
                Sqm
              </label>
              <input
                id="sqm"
                name="sqm"
                type="text"
                value={formData.sqm}
                onChange={handleChange}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                placeholder="Enter sqm"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-gray-700 mb-2">Property Features</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {formData.features.map((feature, index) => (
                <span
                  key={index}
                  className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm flex items-center"
                >
                  {feature}
                  <button
                    type="button"
                    onClick={() => removeFeature(feature)}
                    className="ml-1 text-red-600 hover:text-red-800"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newFeature}
                onChange={(e) => setNewFeature(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (addFeature(), e.preventDefault())}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                placeholder="Type a feature and press Enter or click Add"
              />
              <button
                type="button"
                onClick={addFeature}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Add
              </button>
            </div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center mb-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2" />
              <label className="block text-gray-700 font-semibold">
                Environmental Risk Assessment
              </label>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex items-center mb-2">
                  <Droplet className="w-5 h-5 text-blue-600 mr-2" />
                  <span>Flood Risk</span>
                </div>
                <div className="flex gap-2">
                  {['No Risk', 'Low', 'Medium', 'High'].map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, flood_risk: level as 'No Risk' | 'Low' | 'Medium' | 'High' }))
                      }
                      className={`px-4 py-2 rounded ${getRiskColor(level)} ${
                        formData.flood_risk === level ? 'ring-2 ring-blue-500' : ''
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <textarea
                  name="flood_notes"
                  value={formData.flood_notes ?? ''}
                  onChange={handleChange}
                  className="w-full p-2 border rounded mt-2 focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter any flood-related notes (e.g., historical flooding, mitigation measures)"
                  rows={3}
                />
              </div>
              <div>
                <div className="flex items-center mb-2">
                  <Flame className="w-5 h-5 text-red-600 mr-2" />
                  <span>Bushfire Risk</span>
                </div>
                <div className="flex gap-2">
                  {['No Risk', 'Low', 'Medium', 'High'].map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, bushfire_risk: level as 'No Risk' | 'Low' | 'Medium' | 'High' }))
                      }
                      className={`px-4 py-2 rounded ${getRiskColor(level)} ${
                        formData.bushfire_risk === level ? 'ring-2 ring-blue-500' : ''
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <textarea
                  name="bushfire_notes"
                  value={formData.bushfire_notes ?? ''}
                  onChange={handleChange}
                  className="w-full p-2 border rounded mt-2 focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter any bushfire-related notes (e.g., proximity to bushland, firebreaks)"
                  rows={3}
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-gray-700 mb-2" htmlFor="price">
                Asking Price (AUD)
              </label>
              <div className="relative">
                <input
                  id="price"
                  name="price"
                  type="text"
                  value={formData.price}
                  onChange={handleChange}
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter asking price (e.g., 900,000)"
                  required
                />
                <div className="mt-2 flex items-center">
                  <input
                    id="offers_over"
                    name="offers_over"
                    type="checkbox"
                    checked={formData.offers_over ?? false}
                    onChange={handleOffersOverChange}
                    className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="offers_over" className="text-sm text-gray-700">
                    Offers Over
                  </label>
                </div>
                {formData.offers_over && formData.price && (
                  <p className="mt-1 text-sm text-blue-600">
                    Listed as: Offers Over{' '}
                    {new Intl.NumberFormat('en-AU', {
                      style: 'currency',
                      currency: 'AUD',
                    }).format(parseFloat(formData.price.replace(/,/g, '')))}
                  </p>
                )}
              </div>
            </div>
            <div>
              <label className="block text-gray-700 mb-2" htmlFor="listed_date">
                Listed Date
              </label>
              <input
                id="listed_date"
                name="listed_date"
                type="date"
                value={formData.listed_date ?? ''}
                onChange={handleChange}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                placeholder="Select listing date"
              />
            </div>
            <div>
              <label className="block text-gray-700 mb-2" htmlFor="sold_date">
                Sold Date
              </label>
              <input
                id="sold_date"
                name="sold_date"
                type="date"
                value={formData.sold_date ?? ''}
                onChange={handleChange}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                placeholder="Select sold date"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 mb-2" htmlFor="expected_price">
                Expected Price (AUD)
              </label>
              <input
                id="expected_price"
                name="expected_price"
                type="text"
                value={formData.expected_price}
                onChange={handleChange}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                placeholder="Enter expected price"
                required
              />
            </div>
            <div>
              <label className="block text-gray-700 mb-2" htmlFor="commission">
                Commission (%)
              </label>
              <div className="relative">
                <input
                  id="commission"
                  name="commission"
                  type="text"
                  value={formData.commission}
                  onChange={handleChange}
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter commission %"
                  required
              />
                <span className="text-sm text-gray-500 absolute right-2 top-2">
                  Est:{' '}
                  {new Intl.NumberFormat('en-AU', {
                    style: 'currency',
                    currency: 'AUD',
                  }).format(commissionEstimate)}
                </span>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-gray-700 mb-2" htmlFor="days_on_market">
              Days on Market
              <span className="ml-2 text-gray-500 cursor-help" title="Automatically calculated based on listing date">
                ⓘ
              </span>
            </label>
            <div className="relative">
              <input
                id="days_on_market"
                name="days_on_market"
                type="number"
                value={formData.days_on_market ?? 0}
                readOnly
                className="w-full p-2 border rounded bg-gray-100 cursor-not-allowed"
                placeholder="Calculated automatically"
              />
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full"
                  style={{ width: `${Math.min((formData.days_on_market || 0) / 180 * 100, 100)}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {formData.days_on_market || 0} / 180 days (typical market range)
              </p>
            </div>
          </div>
          <div>
            <label className="block text-gray-700 mb-2" htmlFor="contract_status">
              Contract Status
            </label>
            <select
              id="contract_status"
              name="contract_status"
              value={formData.contract_status ?? 'None'}
              onChange={handleChange}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
            >
              <option value="None">None</option>
              <option value="Under Offer">Under Offer</option>
              <option value="Under Contract">Under Contract</option>
              <option value="Sale">Sale</option>
            </select>
            {formData.contract_status && formData.contract_status !== 'None' && (
              <div className="mt-2 p-2 bg-yellow-100 text-yellow-800 rounded flex items-center">
                <AlertTriangle className="w-4 h-4 mr-2" />
                <span>Property is {formData.contract_status.toLowerCase()}</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 mb-2" htmlFor="agent_name">
                Agent Name
              </label>
              <input
                id="agent_name"
                name="agent_name"
                type="text"
                value={formData.agent_name}
                onChange={handleChange}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                placeholder="Enter agent name"
                required
              />
            </div>
            <div>
              <label className="block text-gray-700 mb-2" htmlFor="agency_name">
                Agency
              </label>
              <input
                id="agency_name"
                name="agency_name"
                type="text"
                value={formData.agency_name}
                onChange={handleChange}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                placeholder="Enter agency name"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-gray-700 mb-2" htmlFor="sale_type">
              Sale Type
            </label>
            <select
              id="sale_type"
              name="sale_type"
              value={formData.sale_type ?? 'Private Treaty'}
              onChange={handleChange}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
            >
              <option value="Private Treaty">Private Treaty</option>
              <option value="Auction">Auction</option>
              <option value="EOI">Expression of Interest</option>
            </select>
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 flex items-center justify-center transition-all duration-300"
          >
            <span>Submit & Analyze</span>
            <ArrowRight className="w-5 h-5 ml-2" />
          </button>
        </form>
      </div>
    </div>
  );
}