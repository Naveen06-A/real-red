import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2, Download, ArrowLeft, MapPin, DollarSign, Home, Calendar, Heart, ArrowRight, ShieldCheck, Zap, Building, Bed, Bath, Car, Maximize, LandPlot, User, Building2, AlertTriangle, Shield, CheckSquare, FileText } from 'lucide-react';
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

// Logo URL from Logo.tsx
const LOGO_URL = 'https://raw.githubusercontent.com/Naveen06-A/image-/451d7ca2516e5ab3862be90d6f5b448d48ade876/red-tulip-logo.jpg';

// Extend Property interface
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

// Helper functions
const calculateCommission = (property: ExtendedProperty): { commissionRate: number; commissionEarned: number } => {
  const commissionRate = property.commission || 0;
  const basePrice = property.sold_price || property.price || 0;
  const commissionEarned = commissionRate > 0 && basePrice > 0 ? basePrice * (commissionRate / 100) : 0;
  return { commissionRate, commissionEarned };
};

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
    'Springfield  4300': { lat: -27.653, lng: 152.918 },
    'Spring Mountain 4300': { lat: -27.690, lng: 152.895 },
  };
  const normalizedSuburb = normalizeSuburb(suburb);
  const base = baseCoords[normalizedSuburb] || { lat: -27.467, lng: 153.028 };
  const offset = index * 0.0005;
  return {
    latitude: base.lat + offset,
    longitude: base.lng + offset,
  };
};

const generatePDFReport = async (
  property: ExtendedProperty,
  options: {
    includeSameStreetSales: boolean;
    includePastRecords: boolean;
    includePrediction: boolean;
  }
) => {
  try {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const companyName = 'Red Tulip RealEsatate';
    const reportDate = moment().format('DD/MM/YYYY');

    // Add watermark function
    const addWatermark = async () => {
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = LOGO_URL;

        img.onload = () => {
          doc.saveGraphicsState();
          doc.setGState(new doc.GState({ opacity: 0.05 }));
          doc.addImage(img, 'JPEG', pageWidth / 4, pageHeight / 4, pageWidth / 2, pageHeight / 2);
          doc.restoreGraphicsState();
          resolve();
        };

        img.onerror = () => {
          console.warn('Failed to load logo image, skipping watermark');
          resolve(); // Resolve even on error to continue PDF generation
        };
      });
    };

    // Apply watermark to current page
    await addWatermark();

    // Header function
    const addHeader = () => {
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text(companyName, margin, 10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Report Date: ${reportDate}`, pageWidth - margin - 50, 10);
      doc.setLineWidth(0.5);
      doc.line(margin, 15, pageWidth - margin, 15);
    };

    // Footer function
    const addFooter = () => {
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Page ${doc.getCurrentPageInfo().pageNumber}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
      doc.text('© 2025 Red Tulip RealEstate', margin, pageHeight - 10);
    };

    // Cover page
    addHeader();
    addFooter();
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Property Report', pageWidth / 2, 50, { align: 'center' });
    doc.setFontSize(16);
    doc.text(
      `${property.street_number || 'N/A'} ${property.street_name || 'N/A'}, ${normalizeSuburb(property.suburb)}`,
      pageWidth / 2,
      70,
      { align: 'center', maxWidth: pageWidth - margin * 2 }
    );
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Prepared by: ${companyName}`, pageWidth / 2, 100, { align: 'center' });
    doc.text(`Date: ${reportDate}`, pageWidth / 2, 110, { align: 'center' });
    doc.addPage();

    // Property Details Section
    addHeader();
    addFooter();
    await addWatermark();
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Property Details', margin, 25);
    const { commissionRate, commissionEarned } = calculateCommission(property);
    const propertyTable = [
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
    autoTable(doc, {
      startY: 30,
      head: [['Field', 'Value']],
      body: propertyTable,
      theme: 'striped',
      headStyles: { fillColor: [0, 102, 204], textColor: [255, 255, 255] },
      styles: { cellPadding: 2, fontSize: 10 },
      margin: { left: margin, right: margin },
    });

    // Past Records Section
    if (options.includePastRecords && property.past_records.length > 0) {
      doc.addPage();
      addHeader();
      addFooter();
      await addWatermark();
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Past Records', margin, 25);
      const recordsTable = property.past_records.map(record => [
        normalizeSuburb(record.suburb),
        record.property_type || 'N/A',
        record.price ? formatCurrency(record.price) : 'N/A',
        record.bedrooms ?? 'N/A',
        record.bathrooms ?? 'N/A',
        record.car_garage ?? 'N/A',
        record.sqm ? `${record.sqm} sqm` : 'N/A',
        record.landsize ? `${record.landsize} sqm` : 'N/A',
        record.listing_date ? moment(record.listing_date).format('DD/MM/YYYY') : 'N/A',
        record.sale_date ? moment(record.sale_date).format('DD/MM/YYYY') : 'N/A',
        record.status || 'N/A',
        record.notes || 'N/A',
      ]);
      autoTable(doc, {
        startY: 30,
        head: [['Location', 'Type', 'Price', 'Beds', 'Baths', 'Garage', 'Floor Area', 'Land Size', 'Listing Date', 'Sale Date', 'Status', 'Notes']],
        body: recordsTable,
        theme: 'striped',
        headStyles: { fillColor: [0, 102, 204], textColor: [255, 255, 255] },
        styles: { cellPadding: 2, fontSize: 10 },
        margin: { left: margin, right: margin },
      });
    }

    // Save the PDF
    doc.save(`property_${property.id}_report.pdf`);
    console.log('PDF generated and saved successfully for property ID:', property.id);
    return true;
  } catch (err: any) {
    console.error('PDF generation error:', err.message);
    throw new Error(`Failed to generate PDF: ${err.message}`);
  }
};

// ZoomControls Component
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

// PropertyMap Component
const PropertyMap: React.FC<{ property: ExtendedProperty }> = ({ property }) => {
  const [showSalesMarkers, setShowSalesMarkers] = useState(true);

  if (!property.latitude || !property.longitude) {
    return <p className="text-gray-500 text-center py-4">Map unavailable: No coordinates provided.</p>;
  }

  const center: LatLngTuple = [property.latitude, property.longitude];

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

  const getStreetViewUrl = (coords: LatLngTuple) => {
    return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coords[0]},${coords[1]}&fov=80&pitch=0`;
  };

  const getStaticStreetViewUrl = (coords: LatLngTuple) => {
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

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: string | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-4xl mx-auto mt-12 p-6 bg-white rounded-lg shadow-lg">
          <h1 className="text-2xl font-bold text-red-600">Something went wrong</h1>
          <p className="text-gray-600 mt-2">{this.state.error || 'An unexpected error occurred'}</p>
          <p className="text-gray-600 mt-2">Please try navigating back or refreshing the page.</p>
          <motion.button
            onClick={() => window.location.href = '/agent-dashboard'}
            className="mt-4 flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <ArrowLeft className="w-5 h-5 mr-1" /> Back to Agent Dashboard
          </motion.button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [property, setProperty] = useState<ExtendedProperty | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [allPropertyIds, setAllPropertyIds] = useState<string[]>([]);
  const [navLoading, setNavLoading] = useState(true); // Separate loading state for navigation
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    console.log('PropertyDetail - ID:', id, 'Location state:', location.state);

    if (!id) {
      console.error('No ID provided in URL');
      setError('Invalid property ID');
      setLoading(false);
      setNavLoading(false);
      setDebugInfo('Invalid property ID');
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setNavLoading(true);
      setDebugInfo('Fetching data...');
      try {
        // Fetch property
        let fetchedProperty = location.state?.property;
        if (!fetchedProperty) {
          console.log('No state property, fetching from Supabase for ID:', id);
          const { data: propertyData, error: propertyError } = await supabase
            .from('properties')
            .select('*, commission')
            .eq('id', id)
            .single();

          if (propertyError) {
            console.error('Supabase property error:', propertyError);
            throw new Error(`Failed to fetch property: ${propertyError.message}`);
          }
          if (!propertyData) {
            console.error('No property found for ID:', id);
            throw new Error('Property not found');
          }
          fetchedProperty = propertyData;
          fetchedProperty.suburb = normalizeSuburb(fetchedProperty.suburb);
          console.log('Fetched property data:', fetchedProperty);
        }

        // Fetch past records
        const { data: pastRecords, error: recordsError } = await supabase
          .from('past_records')
          .select('suburb, postcode, property_type, price, bedrooms, bathrooms, car_garage, sqm, landsize, listing_date, sale_date, status, notes')
          .eq('property_id', id);

        if (recordsError) {
          console.error('Supabase past records error:', recordsError);
          throw new Error(`Failed to fetch past records: ${recordsError.message}`);
        }

        const normalizedRecords = pastRecords?.map(record => ({
          ...record,
          suburb: normalizeSuburb(record.suburb),
          postcode: record.postcode || 'N/A',
        })) || [];

        const coords = generateMockCoordinates(fetchedProperty.suburb);
        const enrichedProperty: ExtendedProperty = {
          ...fetchedProperty,
          latitude: coords.latitude,
          longitude: coords.longitude,
          same_street_sales: [], // Removed sales data fetching
          past_records: normalizedRecords,
          features: fetchedProperty.features || [],
        };

        console.log('Enriched property:', enrichedProperty);
        setProperty(enrichedProperty);

        // Fetch all property IDs
        let propertyIds = location.state?.allPropertyIds || [];
        if (!propertyIds.length) {
          console.log('No property IDs in state, fetching from Supabase');
          const { data, error } = await supabase
            .from('properties')
            .select('id')
            .order('created_at', { ascending: false });
          if (error) {
            console.error('Supabase property IDs error:', error);
            throw new Error(`Failed to fetch property IDs: ${error.message}`);
          }
          propertyIds = data.map(item => item.id);
          console.log('Fetched property IDs:', propertyIds);
        }
        if (!propertyIds.includes(id)) {
          console.warn('Current ID not in allPropertyIds, appending:', id);
          propertyIds = [id, ...propertyIds.filter(pid => pid !== id)]; // Ensure no duplicates
        }
        setAllPropertyIds(propertyIds);
        setDebugInfo(`Fetched property and ${propertyIds.length} IDs`);
      } catch (err: any) {
        console.error('Fetch error:', err);
        setError(err.message || 'Failed to load property details');
        setDebugInfo(`Error: ${err.message}`);
      } finally {
        setLoading(false);
        setNavLoading(false); // Navigation ready when data is fetched
      }
    };

    fetchData();
  }, [id, location.state]);

  const handleGeneratePDF = useCallback(async () => {
    if (!property) {
      console.error('Cannot generate PDF: No property data');
      setPdfError('No property data available');
      setDebugInfo('PDF Error: No property data');
      return;
    }
    setPdfError(null);
    console.log('Generating PDF for property:', property.id);
    try {
      await generatePDFReport(property, {
        includeSameStreetSales: false,
        includePastRecords: true,
        includePrediction: false,
      });
      setDebugInfo('PDF generated successfully');
    } catch (err: any) {
      console.error('PDF generation failed:', err);
      setPdfError(err.message || 'Failed to generate PDF');
      setDebugInfo(`PDF Error: ${err.message}`);
    }
  }, [property]);

  const handleLike = useCallback(() => {
    setIsLiked(!isLiked);
    console.log(`Property ${property?.id} at ${property?.street_number || 'N/A'} ${property?.street_name || 'N/A'}, ${normalizeSuburb(property?.suburb || '')} ${isLiked ? 'unliked' : 'liked'}`);
  }, [isLiked, property]);

  const handleBack = useCallback(() => {
    console.log('Back button clicked - Attempting to navigate to /agent-dashboard');
    try {
      navigate('/agent-dashboard', { replace: false });
    } catch (err) {
      console.error('Navigation to /agent-dashboard failed:', err);
      navigate('/', { replace: false });
    }
  }, [navigate]);

  const currentIndex = allPropertyIds.findIndex(pid => pid === id) || 0; // Default to 0 if not found

  const handleNext = useCallback(() => {
    if (navLoading || allPropertyIds.length <= 1) return;
    console.log('Next button clicked - Current index:', currentIndex, 'Total IDs:', allPropertyIds.length);
    if (currentIndex < allPropertyIds.length - 1) {
      const nextId = allPropertyIds[currentIndex + 1];
      console.log('Navigating to next property:', nextId);
      try {
        navigate(`/property-detail/${nextId}`, {
          state: { allPropertyIds, property: null } // Clear property to force fetch
        });
      } catch (err) {
        console.error('Navigation to next property failed:', err);
        setDebugInfo(`Navigation Error: ${err.message}`);
      }
    } else {
      console.log('Cannot navigate next: At last property');
      setDebugInfo('Navigation: At last property');
    }
  }, [navigate, currentIndex, allPropertyIds, navLoading]);

  const handlePrevious = useCallback(() => {
    if (navLoading || allPropertyIds.length <= 1) return;
    console.log('Previous button clicked - Current index:', currentIndex, 'Total IDs:', allPropertyIds.length);
    if (currentIndex > 0) {
      const prevId = allPropertyIds[currentIndex - 1];
      console.log('Navigating to previous property:', prevId);
      try {
        navigate(`/property-detail/${prevId}`, {
          state: { allPropertyIds, property: null } // Clear property to force fetch
        });
      } catch (err) {
        console.error('Navigation to previous property failed:', err);
        setDebugInfo(`Navigation Error: ${err.message}`);
      }
    } else {
      console.log('Cannot navigate previous: At first property');
      setDebugInfo('Navigation: At first property');
    }
  }, [navigate, currentIndex, allPropertyIds, navLoading]);

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
        {/* <h1 className="text-2xl font-bold text-red-600">Error</h1> */}
        {/* <p className="text-gray-600 text-center mt-2">{error || 'Property not found'}</p> */}
        {/* <p className="text-gray-600 text-center mt-2">Debug Info: {debugInfo}</p> */}
        <motion.button
          onClick={handleBack}
          className="mt-4 flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <ArrowLeft className="w-5 h-5 mr-1" /> Back to Agent Dashboard
        </motion.button>
      </div>
    );
  }

  const { commissionRate, commissionEarned } = calculateCommission(property);
  const propertyStatus = property.sold_date ? 'Sold' : property.listed_date ? 'Listed' : 'Unknown';

  return (
    <ErrorBoundary>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-4xl mx-auto mt-12 p-6 bg-white rounded-lg shadow-lg"
      >
        {/* Debug Info */}
        <div className="mb-4 p-2 bg-gray-100 rounded">
          <p className="text-sm text-gray-600">Debug: Current Index: {currentIndex}, Total IDs: {allPropertyIds.length}</p>
          <p className="text-sm text-gray-600">Debug Info: {debugInfo}</p>
          {pdfError && <p className="text-sm text-red-600">PDF Error: {pdfError}</p>}
        </div>

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

        {/* Property Status */}
        <div className="mb-4">
          <span
            className={`px-3 py-1 rounded-full text-sm font-semibold ${
              propertyStatus === 'Sold' ? 'bg-green-100 text-green-800' : propertyStatus === 'Listed' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
            }`}
          >
            {propertyStatus}
          </span>
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
            <ArrowLeft className="w-5 h-5 mr-1" /> Back to Agent Dashboard
          </motion.button>
          <div className="flex gap-4">
            <motion.button
              onClick={handlePrevious}
              disabled={navLoading || currentIndex <= 0 || allPropertyIds.length <= 1}
              className={`flex items-center px-4 py-2 rounded-lg ${
                navLoading || currentIndex <= 0 || allPropertyIds.length <= 1 ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
              whileHover={{ scale: (navLoading || currentIndex <= 0 || allPropertyIds.length <= 1) ? 1 : 1.05 }}
              whileTap={{ scale: (navLoading || currentIndex <= 0 || allPropertyIds.length <= 1) ? 1 : 0.95 }}
            >
              <ArrowLeft className="w-5 h-5 mr-2" /> Previous
            </motion.button>
            <motion.button
              onClick={handleNext}
              disabled={navLoading || currentIndex >= allPropertyIds.length - 1 || allPropertyIds.length <= 1}
              className={`flex items-center px-4 py-2 rounded-lg ${
                navLoading || currentIndex >= allPropertyIds.length - 1 || allPropertyIds.length <= 1 ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
              whileHover={{ scale: (navLoading || currentIndex >= allPropertyIds.length - 1 || allPropertyIds.length <= 1) ? 1 : 1.05 }}
              whileTap={{ scale: (navLoading || currentIndex >= allPropertyIds.length - 1 || allPropertyIds.length <= 1) ? 1 : 0.95 }}
            >
              Next <ArrowRight className="w-5 h-5 ml-2" />
            </motion.button>
          </div>
        </div>
      </motion.div>
    </ErrorBoundary>
  );
}