import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, Download } from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabase';
import { normalizeSuburb } from '../utils/suburbUtils';
import { formatCurrency } from '../utils/formatters';
import { ErrorBoundary } from 'react-error-boundary';
import jsPDF from 'jspdf';

// Placeholder for Property interface (should be imported from a types file)
export interface Property {
  id: string;
  suburb: string;
  street_name: string;
  street_number: string;
  postcode: string;
  category: string;
  price: number;
  sold_price?: number;
  commission?: number;
  agent_name?: string;
  agency_name?: string;
  sold_date?: string;
  listed_date?: string;
  property_type?: string;
  bedrooms?: number;
  bathrooms?: number;
  car_garage?: number;
  sqm?: number;
  landsize?: number;
  status?: string;
  notes?: string;
}

// ExtendedProperty interface
export interface ExtendedProperty extends Property {
  latitude?: number;
  longitude?: number;
  same_street_sales?: Array<{
    address: string;
    sale_price: number;
    property_type: string;
    sale_date: string;
    suburb: string;
    latitude?: number;
    longitude?: number;
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
    listing_date: string;
    sale_date: string;
    status: string;
    notes: string;
  }>;
}

// Commission calculation function
export const calculateCommission = (property: ExtendedProperty): { commissionRate: number; commissionEarned: number } => {
  const commissionRate = property.commission || 0;
  const basePrice = property.sold_price || property.price || 0;
  const commissionEarned = commissionRate > 0 && basePrice > 0 ? basePrice * (commissionRate / 100) : 0;
  return { commissionRate, commissionEarned };
};

// Mock coordinates generator
export const generateMockCoordinates = (suburb: string | undefined, street_name: string | undefined, index: number = 0): { latitude: number; longitude: number } => {
  // Placeholder implementation for getSuburbCoordinates
  const getSuburbCoordinates = (suburb: string, street: string, idx: number): { latitude: number; longitude: number } => {
    // Mock logic: Generate pseudo-random coordinates based on suburb and street
    const baseLat = -33.8688 + (idx * 0.01); // Example: Sydney base latitude
    const baseLng = 151.2093 + (idx * 0.01); // Example: Sydney base longitude
    const hash = (suburb + street).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return {
      latitude: baseLat + (hash % 100) / 10000,
      longitude: baseLng + (hash % 100) / 10000,
    };
  };
  return getSuburbCoordinates(suburb || 'UNKNOWN', street_name || '', index);
};

// Debug flag
const DEBUG = true;

// Error Fallback Component
const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => {
  if (DEBUG) console.error('ErrorBoundary caught:', error);
  return (
    <div className="flex justify-center items-center h-screen text-red-600">
      <div className="text-center">
        <svg className="w-16 h-16 mx-auto mb-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xl font-semibold">Error: {error.message}</p>
        <motion.button
          onClick={resetErrorBoundary}
          className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label="Try again"
        >
          Try Again
        </motion.button>
      </div>
    </div>
  );
};

// Main Component
export function PropertyDetail() {
  const [property, setProperty] = useState<ExtendedProperty | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Fetch property data
  const fetchProperty = useCallback(async () => {
    if (!id) {
      setError('No property ID provided');
      setLoading(false);
      return;
    }

    if (DEBUG) console.log(`fetchProperty: Fetching property ${id}`);
    try {
      setLoading(true);
      setError(null);

      // Fetch main property
      const { data: propertyData, error: propertyError } = await supabase
        .from('properties')
        .select('*, commission')
        .eq('id', id)
        .single();

      if (propertyError) {
        throw new Error(`Supabase error: ${propertyError.message}`);
      }
      if (!propertyData) {
        throw new Error('Property not found');
      }

      // Normalize and validate property
      const normalizedProperty: ExtendedProperty = {
        ...propertyData,
        suburb: normalizeSuburb(propertyData.suburb),
        agent_name: propertyData.agent_name ?? 'Unknown',
        agency_name: propertyData.agency_name ?? 'Unknown',
        latitude: propertyData.latitude || generateMockCoordinates(propertyData.suburb, propertyData.street_name).latitude,
        longitude: propertyData.longitude || generateMockCoordinates(propertyData.suburb, propertyData.street_name).longitude,
      };

      // Fetch same street sales
      const { data: sameStreetData, error: sameStreetError } = await supabase
        .from('properties')
        .select('address, sale_price, property_type, sale_date, suburb, latitude, longitude')
        .eq('street_name', propertyData.street_name)
        .eq('suburb', propertyData.suburb)
        .neq('id', id)
        .limit(5);

      if (sameStreetError) {
        if (DEBUG) console.warn('fetchProperty: Failed to fetch same street sales:', sameStreetError);
      } else {
        normalizedProperty.same_street_sales = sameStreetData;
      }

      // Fetch past records
      const { data: pastRecordsData, error: pastRecordsError } = await supabase
        .from('property_history')
        .select('*')
        .eq('property_id', id);

      if (pastRecordsError) {
        if (DEBUG) console.warn('fetchProperty: Failed to fetch past records:', pastRecordsError);
      } else {
        normalizedProperty.past_records = pastRecordsData;
      }

      setProperty(normalizedProperty);
    } catch (err: any) {
      if (DEBUG) console.error('fetchProperty: Error:', err);
      setError(err.message || 'Failed to fetch property');
      toast.error(err.message || 'Failed to fetch property');
    } finally {
      if (DEBUG) console.log('fetchProperty: Completed, loading:', false);
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (DEBUG) console.log('useEffect: Initializing...');
    fetchProperty();

    const subscription = supabase
      .channel('properties')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'properties', filter: `id=eq.${id}` }, () => {
        if (DEBUG) console.log('useEffect: Property changed, refetching');
        fetchProperty();
      })
      .subscribe();

    return () => {
      if (DEBUG) console.log('useEffect: Cleaning up Supabase subscription');
      supabase.removeChannel(subscription);
    };
  }, [fetchProperty, id]);

  // Generate PDF report
  const generatePDFReport = () => {
    if (!property) return;

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Property Report', 20, 20);
    doc.setFontSize(12);
    doc.text(`Address: ${property.street_number} ${property.street_name}, ${property.suburb} ${property.postcode}`, 20, 30);
    doc.text(`Property Type: ${property.property_type || 'N/A'}`, 20, 40);
    doc.text(`Price: ${formatCurrency(property.sold_price || property.price || 0)}`, 20, 50);
    const { commissionRate, commissionEarned } = calculateCommission(property);
    doc.text(`Commission Rate: ${commissionRate}%`, 20, 60);
    doc.text(`Commission Earned: ${formatCurrency(commissionEarned)}`, 20, 70);
    doc.text(`Agent: ${property.agent_name}`, 20, 80);
    doc.text(`Agency: ${property.agency_name}`, 20, 90);

    if (property.same_street_sales?.length) {
      doc.text('Comparable Sales:', 20, 100);
      property.same_street_sales.forEach((sale, index) => {
        doc.text(
          `${sale.address}: ${formatCurrency(sale.sale_price)} (${sale.sale_date})`,
          30,
          110 + index * 10
        );
      });
    }

    doc.save(`Property_${property.id}_Report.pdf`);
  };

  // Render
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        if (DEBUG) console.log('ErrorBoundary: Reset triggered');
        setError(null);
        setProperty(null);
        setLoading(true);
        fetchProperty();
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
                onClick={() => {
                  if (DEBUG) console.log('Try Again clicked');
                  setError(null);
                  setLoading(true);
                  fetchProperty();
                }}
                className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label="Try again"
              >
                Try Again
              </motion.button>
            </div>
          </div>
        ) : property ? (
          <div className="max-w-7xl mx-auto">
            <motion.div
              className="flex justify-between items-center mb-8"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h1 className="text-4xl font-extrabold text-gray-900">Property Details</h1>
              <motion.button
                onClick={() => {
                  if (DEBUG) console.log('Navigating back');
                  navigate(-1);
                }}
                className="flex items-center px-5 py-2 bg-gray-600 text-white rounded-full hover:bg-gray-700 transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label="Back"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </motion.button>
            </motion.div>
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold text-gray-800">
                  {property.street_number} {property.street_name}, {property.suburb}
                </h2>
                <motion.button
                  onClick={generatePDFReport}
                  className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  aria-label="Download PDF"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download PDF
                </motion.button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-gray-600">Property Type</p>
                  <p className="text-lg font-semibold text-gray-900">{property.property_type || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Price</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {formatCurrency(property.sold_price || property.price || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Commission</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {calculateCommission(property).commissionRate}% ({formatCurrency(calculateCommission(property).commissionEarned)})
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Agent</p>
                  <p className="text-lg font-semibold text-gray-900">{property.agent_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Agency</p>
                  <p className="text-lg font-semibold text-gray-900">{property.agency_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Coordinates</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {property.latitude?.toFixed(4)}, {property.longitude?.toFixed(4)}
                  </p>
                </div>
              </div>
              {property.same_street_sales?.length ? (
                <div className="mt-8">
                  <h3 className="text-xl font-semibold text-gray-800 mb-4">Comparable Sales</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sale Price</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sale Date</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {property.same_street_sales.map((sale, index) => (
                          <tr key={index}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sale.address}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(sale.sale_price)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sale.sale_date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              {property.past_records?.length ? (
                <div className="mt-8">
                  <h3 className="text-xl font-semibold text-gray-800 mb-4">Past Records</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {property.past_records.map((record, index) => (
                          <tr key={index}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.sale_date}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(record.price)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex justify-center items-center h-screen text-gray-600">
            <p className="text-xl font-semibold">No property data available</p>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default PropertyDetail;