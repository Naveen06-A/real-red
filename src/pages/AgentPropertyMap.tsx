import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L, { LatLngTuple } from 'leaflet';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import 'leaflet/dist/leaflet.css';
import { PropertyDetails } from './Reports';
import { Plus, Minus, X, Eye, Home, DollarSign, User, CheckCircle } from 'lucide-react';

// Interfaces
interface NearbyProperties {
  sold: PropertyDetails[];
  listed: PropertyDetails[];
}

interface AgentPropertyMapProps {
  properties: PropertyDetails[];
  selectedProperty: PropertyDetails | null;
  onPropertySelect: (property: PropertyDetails | null) => void;
}

// Mock coordinates based on suburb
const getMockCoordinates = (suburb: string): LatLngTuple => {
  console.log('Getting coordinates for suburb:', suburb);
  const suburbMap: Record<string, LatLngTuple> = {
    'pullenvale 4069': [-27.5200, 152.9200],
    'brookfield 4069': [-27.5000, 152.9000],
    'anstead 4070': [-27.5400, 152.8600],
    'chapell hill 4069': [-27.5000, 152.9500],
    'kenmore 4069': [-27.5100, 152.9300],
    'kenmore hills 4069': [-27.5050, 152.9400],
    'fig tree pocket 4069': [-27.5300, 152.9600],
    'pinjarra hills 4069': [-27.5350, 152.9100],
    'moggill qld (4070)': [-27.5700, 152.8700],
    'bellbowrie qld (4070)': [-27.5600, 152.8800],
    'springfield qld (4300)': { lat: -27.653, lng: 152.918 },
    'spring mountain qld (4300': { lat: -27.690, lng: 152.895 },

    default: [-27.4705, 153.026], // Brisbane default
  };
  const normalizedSuburb = suburb.toLowerCase();
  const coords = suburbMap[normalizedSuburb] || suburbMap.default;
  console.log('Assigned coordinates:', coords);
  return coords;
};

// Custom icons
const selectedIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconSize: [38, 38],
  iconAnchor: [19, 38],
  popupAnchor: [0, -38],
});

const soldIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [0, -41],
});

const listedIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [0, -41],
});

// Accurate distance calculation using Haversine formula
const calculateDistance = (point1: LatLngTuple, point2: LatLngTuple): number => {
  const [lat1, lng1] = point1;
  const [lat2, lng2] = point2;
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
};

// Debounce function
const debounce = (func: (...args: any[]) => void, wait: number) => {
  let timeout: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
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
        <Plus className="w-6 h-6 text-gray-800" />
      </motion.button>
      <motion.button
        onClick={handleZoomOut}
        className="bg-white p-2 rounded-full shadow-md hover:bg-gray-100"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        title="Zoom Out"
      >
        <Minus className="w-6 h-6 text-gray-800" />
      </motion.button>
    </div>
  );
}

// Street View Modal Component
function StreetViewModal({
  coords,
  onClose,
}: {
  coords: LatLngTuple;
  onClose: () => void;
}) {
  const streetViewUrl = `https://www.google.com/maps/embed/v1/streetview?key=YOUR_API_KEY&location=${coords[0]},${coords[1]}&heading=0&pitch=0&fov=90`;

  return (
    <motion.div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="bg-white rounded-xl p-4 w-full max-w-3xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Street View</h3>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-800">
            <X className="w-6 h-6" />
          </button>
        </div>
        <iframe
          src={streetViewUrl}
          width="100%"
          height="400"
          style={{ border: 0 }}
          allowFullScreen
          loading="lazy"
        ></iframe>
      </div>
    </motion.div>
  );
}

export function AgentPropertyMap({ properties, selectedProperty, onPropertySelect }: AgentPropertyMapProps) {
  const [showStreetView, setShowStreetView] = useState(false);
  const [streetViewCoords, setStreetViewCoords] = useState<LatLngTuple | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Default center (Brisbane, AU)
  const defaultCenter: LatLngTuple = [-27.4705, 153.026];
  const center: LatLngTuple = selectedProperty
    ? [
        selectedProperty.lat ?? getMockCoordinates(selectedProperty.suburb)[0],
        selectedProperty.lng ?? getMockCoordinates(selectedProperty.suburb)[1],
      ]
    : defaultCenter;

  // Log state
  useEffect(() => {
    console.log('AgentPropertyMap rendered');
    console.log('Selected property:', selectedProperty);
    console.log('Map center:', center);
    console.log('Total properties:', properties.length);
  }, [selectedProperty, center, properties]);

  // Debounced property selection
  const debouncedOnPropertySelect = useCallback(
    debounce((prop: PropertyDetails | null) => {
      console.log('Debounced property select:', prop);
      onPropertySelect(prop);
    }, 500),
    [onPropertySelect]
  );

  // Filter nearby properties
  const nearbyProperties: NearbyProperties = useMemo(() => {
    console.log('Calculating nearby properties');
    if (!selectedProperty) {
      console.log('No selected property, returning empty');
      return { sold: [], listed: [] };
    }

    const maxProperties = 20; // Limit for performance
    const radiusInMeters = 1000; // 1000m
    console.log('Processing up to', maxProperties, 'properties with radius', radiusInMeters);

    try {
      const filtered = properties
        .slice(0, maxProperties)
        .filter((prop) => {
          if (prop.id === selectedProperty.id) return false;
          const propLat = prop.lat ?? getMockCoordinates(prop.suburb)[0];
          const propLng = prop.lng ?? getMockCoordinates(prop.suburb)[1];
          if (!propLat || !propLng) {
            console.warn('Property missing coordinates:', prop);
            return false;
          }
          const propPoint: LatLngTuple = [propLat, propLng];
          const distance = calculateDistance(center, propPoint);
          const isNearby = distance <= radiusInMeters;
          console.log('Property:', prop.id, 'Distance:', distance, 'Nearby:', isNearby);
          return isNearby;
        })
        .reduce(
          (acc: NearbyProperties, prop) => {
            const category = prop.category || (prop.sold_price ? 'Sold' : 'Listed');
            if (category === 'Sold') {
              acc.sold.push(prop);
            } else if (category === 'Listed') {
              acc.listed.push(prop);
            }
            return acc;
          },
          { sold: [], listed: [] }
        );

      console.log('Nearby properties:', {
        sold: filtered.sold.length,
        listed: filtered.listed.length,
      });
      return filtered;
    } catch (err) {
      console.error('Error filtering properties:', err);
      toast.error('Failed to filter nearby properties');
      return { sold: [], listed: [] };
    }
  }, [properties, selectedProperty, center]);

  // Handle empty properties
  if (!properties.length) {
    console.log('No properties available');
    return (
      <motion.div
        className="bg-white p-6 rounded-xl shadow-lg border border-gray-100"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Property Location Map</h3>
        <p className="text-gray-500">No properties available to display.</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 relative"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
        <Home className="w-6 h-6 mr-2 text-indigo-600" />
        Property Location Map
      </h3>
      <div className="mb-4">
        <select
          value={selectedProperty?.id || ''}
          onChange={(e) => {
            const prop = properties.find((p) => p.id === e.target.value) || null;
            console.log('Property selected in dropdown:', prop);
            debouncedOnPropertySelect(prop);
          }}
          className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
          aria-label="Select a property"
        >
          <option value="">Select a property</option>
          {properties.map((prop) => (
            <option key={prop.id} value={prop.id}>
              {prop.street_number} {prop.street_name}, {prop.suburb}
            </option>
          ))}
        </select>
      </div>
      <MapContainer
        center={center}
        zoom={15}
        style={{ height: '500px', width: '100%' }}
        className="rounded-lg"
        ref={mapRef}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <ZoomControls />
        {selectedProperty && (
          <Marker
            position={center}
            icon={selectedIcon}
            eventHandlers={{
              click: () => {
                console.log('Opening street view for selected property');
                setStreetViewCoords(center);
                setShowStreetView(true);
              },
            }}
          >
            <Popup>
              <div className="text-sm">
                <h4 className="font-semibold">
                  {selectedProperty.street_number} {selectedProperty.street_name}, {selectedProperty.suburb}
                </h4>
                <p className="flex items-center"><DollarSign className="w-4 h-4 mr-1" />Price: {selectedProperty.price ? formatCurrency(selectedProperty.price) : 'N/A'}</p>
                <p className="flex items-center"><DollarSign className="w-4 h-4 mr-1" />Sold Price: {selectedProperty.sold_price ? formatCurrency(selectedProperty.sold_price) : 'N/A'}</p>
                <p className="flex items-center"><Home className="w-4 h-4 mr-1" />Type: {selectedProperty.property_type || 'N/A'}</p>
                <p className="flex items-center"><User className="w-4 h-4 mr-1" />Agent: {selectedProperty.agent_name || 'N/A'}</p>
                <p className="flex items-center"><CheckCircle className="w-4 h-4 mr-1" />Status: {selectedProperty.category || 'N/A'}</p>
                <button
                  onClick={() => {
                    console.log('Opening street view from popup');
                    setStreetViewCoords(center);
                    setShowStreetView(true);
                  }}
                  className="mt-2 text-blue-600 hover:underline flex items-center"
                >
                  <Eye className="w-4 h-4 mr-1" />
                  View Street View
                </button>
              </div>
            </Popup>
          </Marker>
        )}
        {nearbyProperties.sold.slice(0, 10).map((prop) => {
          const coords: LatLngTuple = [
            prop.lat ?? getMockCoordinates(prop.suburb)[0],
            prop.lng ?? getMockCoordinates(prop.suburb)[1],
          ];
          return (
            <Marker
              key={prop.id}
              position={coords}
              icon={soldIcon}
              eventHandlers={{
                click: () => {
                  console.log('Opening street view for sold property:', prop.id);
                  setStreetViewCoords(coords);
                  setShowStreetView(true);
                },
              }}
            >
              <Popup>
                <div className="text-sm">
                  <h4 className="font-semibold">
                    {prop.street_number} {prop.street_name}, {prop.suburb}
                  </h4>
                  <p className="flex items-center"><DollarSign className="w-4 h-4 mr-1" />Price: {prop.price ? formatCurrency(prop.price) : 'N/A'}</p>
                  <p className="flex items-center"><DollarSign className="w-4 h-4 mr-1" />Sold Price: {prop.sold_price ? formatCurrency(prop.sold_price) : 'N/A'}</p>
                  <p className="flex items-center"><Home className="w-4 h-4 mr-1" />Type: {prop.property_type || 'N/A'}</p>
                  <p className="flex items-center"><User className="w-4 h-4 mr-1" />Agent: {prop.agent_name || 'N/A'}</p>
                  <p className="flex items-center"><CheckCircle className="w-4 h-4 mr-1" />Status: {prop.category || 'N/A'}</p>
                  <button
                    onClick={() => {
                      console.log('Opening street view from popup');
                      setStreetViewCoords(coords);
                      setShowStreetView(true);
                    }}
                    className="mt-2 text-blue-600 hover:underline flex items-center"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    View Street View
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
        {nearbyProperties.listed.slice(0, 10).map((prop) => {
          const coords: LatLngTuple = [
            prop.lat ?? getMockCoordinates(prop.suburb)[0],
            prop.lng ?? getMockCoordinates(prop.suburb)[1],
          ];
          return (
            <Marker
              key={prop.id}
              position={coords}
              icon={listedIcon}
              eventHandlers={{
                click: () => {
                  console.log('Opening street view for listed property:', prop.id);
                  setStreetViewCoords(coords);
                  setShowStreetView(true);
                },
              }}
            >
              <Popup>
                <div className="text-sm">
                  <h4 className="font-semibold">
                    {prop.street_number} {prop.street_name}, {prop.suburb}
                  </h4>
                  <p className="flex items-center"><DollarSign className="w-4 h-4 mr-1" />Price: {prop.price ? formatCurrency(prop.price) : 'N/A'}</p>
                  <p className="flex items-center"><DollarSign className="w-4 h-4 mr-1" />Sold Price: {prop.sold_price ? formatCurrency(prop.sold_price) : 'N/A'}</p>
                  <p className="flex items-center"><Home className="w-4 h-4 mr-1" />Type: {prop.property_type || 'N/A'}</p>
                  <p className="flex items-center"><User className="w-4 h-4 mr-1" />Agent: {prop.agent_name || 'N/A'}</p>
                  <p className="flex items-center"><CheckCircle className="w-4 h-4 mr-1" />Status: {prop.category || 'N/A'}</p>
                  <button
                    onClick={() => {
                      console.log('Opening street view from popup');
                      setStreetViewCoords(coords);
                      setShowStreetView(true);
                    }}
                    className="mt-2 text-blue-600 hover:underline flex items-center"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    View Street View
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      {showStreetView && streetViewCoords && (
        <StreetViewModal
          coords={streetViewCoords}
          onClose={() => {
            console.log('Closing street view');
            setShowStreetView(false);
            setStreetViewCoords(null);
          }}
        />
      )}
      {selectedProperty && (
        <div className="mt-4">
          <h4 className="text-lg font-semibold text-gray-800">Nearby Properties</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h5 className="text-md font-medium text-gray-700">Sold Properties ({nearbyProperties.sold.length})</h5>
              {nearbyProperties.sold.length > 0 ? (
                <ul className="list-disc pl-5 text-gray-600">
                  {nearbyProperties.sold.slice(0, 5).map((prop) => (
                    <li key={prop.id}>
                      {prop.street_number} {prop.street_name}, {prop.suburb} -{' '}
                      {prop.sold_price ? formatCurrency(prop.sold_price) : 'N/A'}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500">No sold properties nearby.</p>
              )}
            </div>
            <div>
              <h5 className="text-md font-medium text-gray-700">Listed Properties ({nearbyProperties.listed.length})</h5>
              {nearbyProperties.listed.length > 0 ? (
                <ul className="list-disc pl-5 text-gray-600">
                  {nearbyProperties.listed.slice(0, 5).map((prop) => (
                    <li key={prop.id}>
                      {prop.street_number} {prop.street_name}, {prop.suburb} -{' '}
                      {prop.price ? formatCurrency(prop.price) : 'N/A'}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500">No listed properties nearby.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// Helper function to format currency
const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);