import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2, Download, ArrowLeft, MapPin, DollarSign, Home, Calendar, Heart, ArrowRight, ShieldCheck, Zap, Building, Bed, Bath, Car, Maximize, LandPlot, User, Building2, AlertTriangle, Shield, CheckSquare, FileText } from 'lucide-react';
import { generatePdf } from '../utils/pdfUtils';
import { formatCurrency } from '../utils/formatters';
import { Property } from '../types/Property';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion } from 'framer-motion';
import moment from 'moment';
import { normalizeSuburb } from '../utils/subrubUtils';
import L, { LatLngTuple } from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Extend Property interface to include latitude, longitude, same_street_sales, and past_records
interface ExtendedProperty extends Property {
  latitude?: number;
  longitude?: number;
  same_street_sales: Array<{
    address: string;
    sale_price: number;
    property_type: string;
    sale_date: string;
    suburb: string;
    latitude?: number;
    longitude?: number;
  }>;
  features?: string[];
  past_records: Array<{
    suburb: string;
    postcode: string;
    property_type: string;
    price: number;
    bedrooms?: number;
    bathrooms?: number;
    car_garage?: number;
    sqm?: number;
    landsize?: number;
    listing_date?: string;
    sale_date?: string;
    status?: string;
    notes?: string;
  }>;
}

// Helper function to calculate commission
const calculateCommission = (property: ExtendedProperty): { commissionRate: number; commissionEarned: number } => {
  const commissionRate = property.commission || 0;
  const basePrice = property.sold_price || property.price || 0;
  const commissionEarned = commissionRate > 0 && basePrice > 0 ? basePrice * (commissionRate / 100) : 0;
  return { commissionRate, commissionEarned };
};

// Helper function to generate mock coordinates
const generateMockCoordinates = (suburb: string = 'Brisbane', index: number = 0): { latitude: number; longitude: number } => {
  const baseCoords: Record<string, { lat: number; lng: number }> = {
    'Pullenvale 4069': { lat: -27.522, lng: 152.885 },
    'Brookfield 4069': { lat: -27.493, lng: 152.897 },
    'Anstead 4070': { lat: -27.538, lng: 152.861 },
    'Chapell Hill 4069': { lat: -27.502, lng: 152.971 },
    'Kenmore 4069': { lat: -27.507, lng: 152.939 },
    'Kenmore Hills 4069': { lat: -27.502, lng: 152.929 },
    'Fig Tree Pocket 4069': { lat: -27.529, lng: 152.961 },
    'Pinjara Hills 4069': { lat: -27.537, lng: 152.906 },
    'Moggill 4070': { lat: -27.570, lng: 152.874 },
    'Bellbowrie 4070': { lat: -27.559, lng: 152.886 },
  };
  const normalizedSuburb = normalizeSuburb(suburb);
  const base = baseCoords[normalizedSuburb] || { lat: -27.467, lng: 153.028 }; // Default to Brisbane CBD
  const offset = index * 0.0005;
  return {
    latitude: base.lat + offset,
    longitude: base.lng + offset,
  };
};

// Helper function to generate PDF report
const generatePDFReport = async (
  property: ExtendedProperty,
  options: {
    includeSameStreetSales: boolean;
    includePastRecords: boolean;
    includePrediction: boolean;
  }
) => {
  const head = [['Field', 'Value']];
  const { commissionRate, commissionEarned } = calculateCommission(property);
  const body = [
    ['Address', `${property.street_number || 'N/A'} ${property.street_name || 'N/A'}, ${normalizeSuburb(property.suburb)}`],
    ['Price', property.price ? formatCurrency(property.price) : 'N/A'],
    ['Sold Price', property.sold_price ? formatCurrency(property.sold_price) : 'N/A'],
    ['Expected Price', property.expected_price ? formatCurrency(property.expected_price) : 'N/A'],
    ['Commission', commissionRate ? `${commissionRate}%` : 'N/A'],
    ['Commission Earned', commissionEarned ? formatCurrency(commissionEarned) : 'N/A'],
    ['Property Type', property.property_type || 'N/A'],
    ['Category', property.category || 'N/A'],
    ['Sale Type', property.sale_type || 'N/A'],
    ['Bedrooms', property.bedrooms ?? 'N/A'],
    ['Bathrooms', property.bathrooms ?? 'N/A'],
    ['Garage', property.car_garage ?? 'N/A'],
    ['Floor Area', property.sqm ? `${property.sqm} sqm` : 'N/A'],
    ['Land Size', property.landsize ? `${property.landsize} sqm` : 'N/A'],
    ['Listed Date', property.listed_date ? moment(property.listed_date).format('DD/MM/YYYY') : 'N/A'],
    ['Sold Date', property.sold_date ? moment(property.sold_date).format('DD/MM/YYYY') : 'N/A'],
    ['Agent', property.agent_name || 'N/A'],
    ['Agency', property.agency_name || 'N/A'],
    ['Flood Risk', property.flood_risk || 'N/A'],
    ['Bushfire Risk', property.bushfire_risk || 'N/A'],
    ['Contract Status', property.contract_status || 'N/A'],
    ['Features', property.features?.length ? property.features.join(', ') : 'N/A'],
    ['Latitude', property.latitude ? property.latitude.toFixed(6) : 'N/A'],
    ['Longitude', property.longitude ? property.longitude.toFixed(6) : 'N/A'],
  ];

  if (options.includeSameStreetSales && property.same_street_sales.length > 0) {
    body.push(['\nComparable Sales (Same Street)']);
    property.same_street_sales.forEach((sale) => {
      body.push(
        ['Address', sale.address || 'N/A'],
        ['Sale Price', sale.sale_price ? formatCurrency(sale.sale_price) : 'N/A'],
        ['Property Type', sale.property_type || 'N/A'],
        ['Sale Date', sale.sale_date ? moment(sale.sale_date).format('DD/MM/YYYY') : 'N/A']
      );
    });
  }

  if (options.includePastRecords && property.past_records.length > 0) {
    body.push(['\nPast Records']);
    property.past_records.forEach((record) => {
      body.push(
        ['Location', normalizeSuburb(record.suburb)],
        ['Type', record.property_type || 'N/A'],
        ['Price', record.price ? formatCurrency(record.price) : 'N/A']
      );
    });
  }

  await generatePdf('Property Report', head, body, `property_${property.id}_report.pdf`);
};

// Zoom Controls Component
function ZoomControls() {
  const map = useMap();

  const handleZoomIn = useCallback(() => {
    console.log('Zooming in');
    map.zoomIn();
  }, [map]);

  const handleZoomOut = useCallback(() => {
    console.log('Zooming out');
    map.zoomOut();
  }, [map]);

  return (
    <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
      <motion.button
        onClick={handleZoomIn}
        className="bg-white p-2 rounded-full shadow-md hover:bg-gray-100"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        title="Zoom In"
      >
        <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
        </svg>
      </motion.button>
      <motion.button
        onClick={handleZoomOut}
        className="bg-white p-2 rounded-full shadow-md hover:bg-gray-100"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        title="Zoom Out"
      >
        <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 12h16" />
        </svg>
      </motion.button>
    </div>
  );
}

// Map Component
const PropertyMap: React.FC<{ property: ExtendedProperty }> = ({ property }) => {
  const [showSalesMarkers, setShowSalesMarkers] = useState(true);

  if (!property.latitude || !property.longitude) {
    return <p className="text-gray-500 text-center py-4">Map unavailable: No coordinates provided.</p>;
  }

  const center: LatLngTuple = [property.latitude, property.longitude];

  // Custom icons
  const mainIcon = L.divIcon({
    className: 'custom-icon',
    html: `<div style="background-color: #FF0000; width: 24px; height: 24px; border-radius: 50%; border: 2px solid #FFFFFF; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  const saleIcon = L.divIcon({
    className: 'custom-icon',
    html: `<div style="background-color: #36A2EB; width: 16px; height: 16px; border-radius: 50%; border: 1px solid #FFFFFF;"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

  // Generate Street View URL
  const getStreetViewUrl = (coords: LatLngTuple) => {
    return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coords[0]},${coords[1]}&fov=80&pitch=0`;
  };

  // Generate Static Street View Image URL (placeholder)
  const getStaticStreetViewUrl = (coords: LatLngTuple) => {
    // Replace YOUR_API_KEY with a valid Google Maps API key or handle gracefully
    return `https://via.placeholder.com/200x100?text=Street+View+Preview`;
  };

  return (
    <div className="relative bg-white rounded-lg shadow-md overflow-hidden">
      <div className="absolute top-4 left-4 z-[1000]">
        <motion.button
          onClick={() => {
            console.log('Toggling same-street sales markers:', !showSalesMarkers);
            setShowSalesMarkers(!showSalesMarkers);
          }}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title={showSalesMarkers ? 'Hide Same-Street Sales' : 'Show Same-Street Sales'}
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          {showSalesMarkers ? 'Hide Sales' : 'Show Sales'}
        </motion.button>
      </div>
      <MapContainer
        center={center}
        zoom={16}
        style={{ height: '400px', width: '100%' }}
        className="rounded-lg"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <ZoomControls />
        <Marker
          position={center}
          icon={mainIcon}
          eventHandlers={{
            mouseover: (e) => e.target.openPopup(),
            mouseout: (e) => e.target.closePopup(),
          }}
        >
          <Popup>
            <div className="text-sm max-w-[200px]">
              <h4 className="font-semibold">
                {property.street_number || 'N/A'} {property.street_name || 'N/A'}
              </h4>
              <p>Suburb: {normalizeSuburb(property.suburb)}</p>
              <p>Price: {property.price ? formatCurrency(property.price) : 'N/A'}</p>
              <p>Sold Price: {property.sold_price ? formatCurrency(property.sold_price) : 'N/A'}</p>
              <p>Type: {property.property_type || 'N/A'}</p>
              <p>Status: {property.category || 'N/A'}</p>
              <img
                src={getStaticStreetViewUrl(center)}
                alt="Street View Preview"
                className="mt-2 w-full h-24 object-cover rounded"
              />
              <a
                href={getStreetViewUrl(center)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-blue-600 hover:underline"
                onClick={() => console.log('Opening street view for main property')}
              >
                View Street View
              </a>
            </div>
          </Popup>
        </Marker>
        {showSalesMarkers && property.same_street_sales.slice(0, 5).map((sale, index) => {
          if (!sale.latitude || !sale.longitude) return null;
          const coords: LatLngTuple = [sale.latitude, sale.longitude];
          return (
            <Marker
              key={index}
              position={coords}
              icon={saleIcon}
              eventHandlers={{
                mouseover: (e) => e.target.openPopup(),
                mouseout: (e) => e.target.closePopup(),
              }}
            >
              <Popup>
                <div className="text-sm max-w-[200px]">
                  <h4 className="font-semibold">{sale.address || 'N/A'}</h4>
                  <p>Suburb: {normalizeSuburb(sale.suburb)}</p>
                  <p>Sale Price: {sale.sale_price ? formatCurrency(sale.sale_price) : 'N/A'}</p>
                  <p>Type: {sale.property_type || 'N/A'}</p>
                  <p>Sale Date: {sale.sale_date ? moment(sale.sale_date).format('DD/MM/YYYY') : 'N/A'}</p>
                  <img
                    src={getStaticStreetViewUrl(coords)}
                    alt="Street View Preview"
                    className="mt-2 w-full h-24 object-cover rounded"
                  />
                  <a
                    href={getStreetViewUrl(coords)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-blue-600 hover:underline"
                    onClick={() => console.log('Opening street view for sale:', sale.address)}
                  >
                    View Street View
                  </a>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [property, setProperty] = useState<ExtendedProperty | null>(location.state?.property || null);
  const [loading, setLoading] = useState(!location.state?.property);
  const [error, setError] = useState<string | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [allPropertyIds, setAllPropertyIds] = useState<string[]>(location.state?.allPropertyIds || []);

  useEffect(() => {
    console.log('PropertyDetail - ID:', id, 'State property:', property, 'Location state:', location.state);
    if (!id) {
      console.error('No ID provided in URL');
      setError('Invalid property ID');
      setLoading(false);
      return;
    }
    if (!property) {
      console.log('No state property, fetching from Supabase for ID:', id);
      fetchProperty();
    } else {
      const normalizedProperty: ExtendedProperty = {
        ...property,
        suburb: normalizeSuburb(property.suburb),
        latitude: property.latitude || generateMockCoordinates(property.suburb).latitude,
        longitude: property.longitude || generateMockCoordinates(property.suburb).longitude,
        same_street_sales: property.same_street_sales?.map((sale, index) => ({
          ...sale,
          suburb: normalizeSuburb(sale.suburb),
          latitude: sale.latitude || generateMockCoordinates(sale.suburb, index + 1).latitude,
          longitude: sale.longitude || generateMockCoordinates(sale.suburb, index + 1).longitude,
        })) || [],
        past_records: property.past_records?.map(record => ({
          ...record,
          suburb: normalizeSuburb(record.suburb),
          postcode: record.postcode || 'N/A',
        })) || [],
        features: property.features || [],
      };
      setProperty(normalizedProperty);
      console.log('Normalized state property:', normalizedProperty);
    }
  }, [id, property, location.state]);

  useEffect(() => {
    if (!allPropertyIds.length && !loading) {
      const fetchPropertyIds = async () => {
        try {
          const { data, error } = await supabase
            .from('properties')
            .select('id')
            .order('created_at', { ascending: false });
          if (error) throw error;
          setAllPropertyIds(data.map(item => item.id));
        } catch (err: any) {
          console.error('Error fetching property IDs:', err);
        }
      };
      fetchPropertyIds();
    }
  }, [allPropertyIds, loading]);

  const fetchProperty = async () => {
    setLoading(true);
    try {
      console.log('Querying Supabase: properties table, id =', id);
      const { data: propertyData, error: propertyError } = await supabase
        .from('properties')
        .select('*, commission')
        .eq('id', id)
        .single();

      if (propertyError) {
        console.error('Supabase property error:', propertyError);
        throw propertyError;
      }
      if (!propertyData) {
        console.error('No property found for ID:', id);
        throw new Error('Property not found');
      }

      propertyData.suburb = normalizeSuburb(propertyData.suburb);
      console.log('Fetched property data:', propertyData);

      const { data: sameStreetSales, error: salesError } = await supabase
        .from('properties')
        .select('address, sale_price, property_type, sale_date, suburb')
        .eq('street_name', propertyData.street_name)
        .neq('id', id)
        .limit(5);

      if (salesError) {
        console.error('Supabase same street sales error:', salesError);
        throw salesError;
      }

      const normalizedSales = sameStreetSales?.map((sale, index) => {
        const coords = generateMockCoordinates(sale.suburb, index + 1);
        return {
          ...sale,
          suburb: normalizeSuburb(sale.suburb),
          latitude: coords.latitude,
          longitude: coords.longitude,
        };
      }) || [];

      const { data: pastRecords, error: recordsError } = await supabase
        .from('past_records')
        .select('suburb, postcode, property_type, price, bedrooms, bathrooms, car_garage, sqm, landsize, listing_date, sale_date, status, notes')
        .eq('property_id', id);

      if (recordsError) {
        console.error('Supabase past records error:', recordsError);
        throw recordsError;
      }

      const normalizedRecords = pastRecords?.map(record => ({
        ...record,
        suburb: normalizeSuburb(record.suburb),
        postcode: record.postcode || 'N/A',
      })) || [];

      const coords = generateMockCoordinates(propertyData.suburb);
      const enrichedProperty: ExtendedProperty = {
        ...propertyData,
        latitude: coords.latitude,
        longitude: coords.longitude,
        same_street_sales: normalizedSales,
        past_records: normalizedRecords,
        features: propertyData.features || [],
      };

      console.log('Enriched property:', enrichedProperty);
      setProperty(enrichedProperty);
    } catch (err: any) {
      console.error('Fetch error:', err);
      setError(err.message || 'Failed to load property details');
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePDF = () => {
    if (!property) {
      console.error('Cannot generate PDF: No property data');
      return;
    }
    console.log('Generating PDF for property:', property.id);
    generatePDFReport(property, {
      includeSameStreetSales: true,
      includePastRecords: true,
      includePrediction: false,
    });
  };

  const handleLike = () => {
    setIsLiked(!isLiked);
    console.log(`Property ${property?.id} at ${property?.street_number || 'N/A'} ${property?.street_name || 'N/A'}, ${normalizeSuburb(property?.suburb || '')} ${isLiked ? 'unliked' : 'liked'}`);
  };

  const handleBack = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Back button clicked - Attempting to navigate to /admin-dashboard');
    console.log('Current location:', location.pathname, 'State:', location.state);
    try {
      navigate('/admin-dashboard', { replace: false });
      console.log('Navigation attempted with react-router-dom to /admin-dashboard');
    } catch (err) {
      console.error('react-router-dom navigation failed:', err);
      console.log('Falling back to window.location.href');
      window.location.href = '/admin-dashboard';
    }
  };

  const currentIndex = allPropertyIds.findIndex(pid => pid === id);

  const handleNext = () => {
    if (currentIndex < allPropertyIds.length - 1) {
      const nextId = allPropertyIds[currentIndex + 1];
      console.log('Navigating to next property:', nextId);
      navigate(`/properties/${nextId}`);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      const prevId = allPropertyIds[currentIndex - 1];
      console.log('Navigating to previous property:', prevId);
      navigate(`/properties/${prevId}`);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-300 z-50">
        <motion.div
          className="flex flex-col items-center"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="relative">
            <motion.div
              className="absolute inset-0 border-4 border-t-blue-600 border-r-blue-600 border-b-transparent border-l-transparent rounded-full"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              style={{ width: '80px', height: '80px' }}
            />
            <motion.div
              className="bg-white p-4 rounded-full shadow-lg"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
            </motion.div>
          </div>
          <motion.span
            className="mt-4 text-lg font-semibold text-gray-800"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 120 }}
          >
            Loading Property Details...
          </motion.span>
          <motion.div
            className="mt-2 text-sm text-gray-600"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            Powered by Red Tulip
          </motion.div>
        </motion.div>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="max-w-4xl mx-auto mt-12 p-6 bg-white rounded-lg shadow-lg">
        <p className="text-red-600 text-center">{error || 'Property not found'}</p>
        <motion.button
          onClick={handleBack}
          className="mt-4 flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <ArrowLeft className="w-5 h-5 mr-1" /> Back to Admin Dashboard
        </motion.button>
      </div>
    );
  }

  const { commissionRate, commissionEarned } = calculateCommission(property);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-4xl mx-auto mt-12 p-6 bg-white rounded-lg shadow-lg"
    >
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {`${property.street_number || 'N/A'} ${property.street_name || 'N/A'}, ${normalizeSuburb(property.suburb)}`}
        </h1>
        <div className="flex gap-2">
          <motion.button
            onClick={handleGeneratePDF}
            className="flex items-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Download className="w-5 h-5 mr-2" /> Download PDF
          </motion.button>
          <motion.button
            onClick={handleLike}
            className={`flex items-center px-4 py-2 rounded-lg ${
              isLiked ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title={isLiked ? 'Unlike Property' : 'Like Property'}
          >
            <Heart
              className={`w-5 h-5 mr-2 ${isLiked ? 'fill-current' : ''}`}
            />
            {isLiked ? 'Unlike' : 'Like'}
          </motion.button>
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2 flex items-center">
          <MapPin className="w-5 h-5 mr-2 text-blue-600" />
          Location Map
        </h2>
        <PropertyMap property={property} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <p className="flex items-center text-gray-600 mb-2">
            <MapPin className="w-5 h-5 mr-2" />
            {`${property.street_number || 'N/A'} ${property.street_name || 'N/A'}, ${normalizeSuburb(property.suburb)}`}
          </p>
          <p className="flex items-center text-gray-600 mb-2">
            <DollarSign className="w-5 h-5 mr-2" />
            {property.price ? formatCurrency(property.price) : 'N/A'}
          </p>
          <p className="flex items-center text-gray-600 mb-2">
            <Home className="w-5 h-5 mr-2" />
            {property.bedrooms ?? 'N/A'} Beds, {property.bathrooms ?? 'N/A'} Baths, {property.car_garage ?? 'N/A'} Garage
          </p>
          <p className="text-gray-600 mb-2">
            <strong>Type:</strong> {property.property_type || 'N/A'}
          </p>
          <p className="text-gray-600 mb-2">
            <strong>Category:</strong> {property.category || 'N/A'}
          </p>
          <p className="text-gray-600 mb-2">
            <strong>Sale Type:</strong> {property.sale_type || 'N/A'}
          </p>
          <p className="text-gray-600 mb-2">
            <strong>Floor Area:</strong> {property.sqm ? `${property.sqm} sqm` : 'N/A'}
          </p>
          <p className="text-gray-600 mb-2">
            <strong>Land Size:</strong> {property.landsize ? `${property.landsize} sqm` : 'N/A'}
          </p>
        </div>
        <div>
          <p className="flex items-center text-gray-600 mb-2">
            <Calendar className="w-5 h-5 mr-2" />
            Listed: {property.listed_date ? moment(property.listed_date).format('DD/MM/YYYY') : 'N/A'}
          </p>
          {property.sold_date && (
            <p className="text-gray-600 mb-2">
              <strong>Sold:</strong> {moment(property.sold_date).format('DD/MM/YYYY')}
            </p>
          )}
          <p className="text-gray-600 mb-2">
            <strong>Expected Price:</strong> {property.expected_price ? formatCurrency(property.expected_price) : 'N/A'}
          </p>
          <p className="text-gray-600 mb-2">
            <strong>Commission:</strong> {commissionRate ? `${commissionRate}%` : 'N/A'}
          </p>
          <p className="text-gray-600 mb-2">
            <strong>Commission Earned:</strong> {commissionEarned ? formatCurrency(commissionEarned) : 'N/A'}
          </p>
          <p className="flex items-center text-gray-600 mb-2">
            <User className="w-5 h-5 mr-2" />
            <strong>Agent:</strong> {property.agent_name || 'N/A'} ({property.agency_name || 'N/A'})
          </p>
          <p className="flex items-center text-gray-600 mb-2">
            <AlertTriangle className="w-5 h-5 mr-2 text-red-500" />
            <strong>Flood Risk:</strong> {property.flood_risk || 'N/A'}
          </p>
          <p className="flex items-center text-gray-600 mb-2">
            <Shield className="w-5 h-5 mr-2 text-orange-500" />
            <strong>Bushfire Risk:</strong> {property.bushfire_risk || 'N/A'}
          </p>
          <p className="flex items-center text-gray-600 mb-2">
            <CheckSquare className="w-5 h-5 mr-2 text-green-500" />
            <strong>Contract Status:</strong> {property.contract_status || 'N/A'}
          </p>
        </div>
      </div>

      {property.features && property.features.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2 flex items-center">
            <CheckSquare className="w-5 h-5 mr-2 text-blue-600" />
            Features
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {property.features.map((feature, index) => (
              <div key={index} className="flex items-center text-gray-600">
                <CheckSquare className="w-4 h-4 mr-2 text-green-500" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {property.same_street_sales.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Comparable Sales (Same Street)</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-4 py-2 border flex items-center"><MapPin className="w-4 h-4 mr-2" />Address</th>
                  <th className="px-4 py-2 border flex items-center"><Building className="w-4 h-4 mr-2" />Suburb</th>
                  <th className="px-4 py-2 border flex items-center"><DollarSign className="w-4 h-4 mr-2" />Sale Price</th>
                  <th className="px-4 py-2 border flex items-center"><Home className="w-4 h-4 mr-2" />Property Type</th>
                  <th className="px-4 py-2 border flex items-center"><Calendar className="w-4 h-4 mr-2" />Sale Date</th>
                </tr>
              </thead>
              <tbody>
                {property.same_street_sales.map((sale, index) => (
                  <tr key={index}>
                    <td className="px-4 py-2 border">{sale.address || 'N/A'}</td>
                    <td className="px-4 py-2 border">{normalizeSuburb(sale.suburb)}</td>
                    <td className="px-4 py-2 border">{sale.sale_price ? formatCurrency(sale.sale_price) : 'N/A'}</td>
                    <td className="px-4 py-2 border">{sale.property_type || 'N/A'}</td>
                    <td className="px-4 py-2 border">
                      {sale.sale_date ? moment(sale.sale_date).format('DD/MM/YYYY') : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {property.past_records.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Past Records</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-4 py-2 border flex items-center"><MapPin className="w-4 h-4 mr-2" />Location</th>
                  <th className="px-4 py-2 border flex items-center"><Home className="w-4 h-4 mr-2" />Type</th>
                  <th className="px-4 py-2 border flex items-center"><DollarSign className="w-4 h-4 mr-2" />Price</th>
                  <th className="px-4 py-2 border flex items-center"><Bed className="w-4 h-4 mr-2" />Beds</th>
                  <th className="px-4 py-2 border flex items-center"><Bath className="w-4 h-4 mr-2" />Baths</th>
                  <th className="px-4 py-2 border flex items-center"><Car className="w-4 h-4 mr-2" />Garage</th>
                  <th className="px-4 py-2 border flex items-center"><Maximize className="w-4 h-4 mr-2" />Floor Area</th>
                  <th className="px-4 py-2 border flex items-center"><LandPlot className="w-4 h-4 mr-2" />Land Size</th>
                  <th className="px-4 py-2 border flex items-center"><Calendar className="w-4 h-4 mr-2" />Listing Date</th>
                  <th className="px-4 py-2 border flex items-center"><Calendar className="w-4 h-4 mr-2" />Sale Date</th>
                  <th className="px-4 py-2 border flex items-center"><CheckSquare className="w-4 h-4 mr-2" />Status</th>
                  <th className="px-4 py-2 border flex items-center"><FileText className="w-4 h-4 mr-2" />Notes</th>
                </tr>
              </thead>
              <tbody>
                {property.past_records.map((record, index) => (
                  <tr key={index}>
                    <td className="px-4 py-2 border">{normalizeSuburb(record.suburb)}</td>
                    <td className="px-4 py-2 border">{record.property_type || 'N/A'}</td>
                    <td className="px-4 py-2 border">{record.price ? formatCurrency(record.price) : 'N/A'}</td>
                    <td className="px-4 py-2 border">{record.bedrooms ?? 'N/A'}</td>
                    <td className="px-4 py-2 border">{record.bathrooms ?? 'N/A'}</td>
                    <td className="px-4 py-2 border">{record.car_garage ?? 'N/A'}</td>
                    <td className="px-4 py-2 border">{record.sqm ? `${record.sqm} sqm` : 'N/A'}</td>
                    <td className="px-4 py-2 border">{record.landsize ? `${record.landsize} sqm` : 'N/A'}</td>
                    <td className="px-4 py-2 border">
                      {record.listing_date ? moment(record.listing_date).format('DD/MM/YYYY') : 'N/A'}
                    </td>
                    <td className="px-4 py-2 border">
                      {record.sale_date ? moment(record.sale_date).format('DD/MM/YYYY') : 'N/A'}
                    </td>
                    <td className="px-4 py-2 border">{record.status || 'N/A'}</td>
                    <td className="px-4 py-2 border">{record.notes || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-between items-center">
        <motion.button
          onClick={handleBack}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <ArrowLeft className="w-5 h-5 mr-1" /> Back to Admin Dashboard
        </motion.button>
        <div className="flex gap-4">
          <motion.button
            onClick={handlePrevious}
            disabled={currentIndex <= 0}
            className={`flex items-center px-4 py-2 rounded-lg ${
              currentIndex <= 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
            whileHover={{ scale: currentIndex <= 0 ? 1 : 1.05 }}
            whileTap={{ scale: currentIndex <= 0 ? 1 : 0.95 }}
          >
            <ArrowLeft className="w-5 h-5 mr-2" /> Previous
          </motion.button>
          <motion.button
            onClick={handleNext}
            disabled={currentIndex >= allPropertyIds.length - 1}
            className={`flex items-center px-4 py-2 rounded-lg ${
              currentIndex >= allPropertyIds.length - 1 ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
            whileHover={{ scale: currentIndex >= allPropertyIds.length - 1 ? 1 : 1.05 }}
            whileTap={{ scale: currentIndex >= allPropertyIds.length - 1 ? 1 : 0.95 }}
          >
            Next <ArrowRight className="w-5 h-5 ml-2" />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}