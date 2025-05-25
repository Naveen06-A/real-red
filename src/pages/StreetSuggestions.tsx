import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BarChart2, Home } from 'lucide-react';

// Coordinate generator for map
const generateCoordinates = (suburb: string) => {
  const baseCoords: { [key: string]: { latitude: number; longitude: number } } = {
    'Moggill QLD 4070': { latitude: -27.5716, longitude: 152.8731 },
    'Bellbowrie QLD 4070': { latitude: -27.5589, longitude: 152.8877 },
    'Pinjara Hills QLD 4069': { latitude: -27.5380, longitude: 152.9575 },
    'Fig Tree Pocket QLD 4069': { latitude: -27.5283, longitude: 152.9716 },
    'Pullenvale QLD 4069': { latitude: -27.5228, longitude: 152.8866 },
    'Brookfield QLD 4069': { latitude: -27.4985, longitude: 152.9007 },
    'Anstead QLD 4070': { latitude: -27.5387, longitude: 152.8621 },
    'Chapel Hill QLD 4069': { latitude: -27.5033, longitude: 152.9477 },
    'Kenmore QLD 4069': { latitude: -27.5076, longitude: 152.9388 },
    'Kenmore Hills QLD 4069': { latitude: -27.4988, longitude: 152.9322 },
  };
  const coords = baseCoords[suburb] || { latitude: -27.5, longitude: 152.9 };
  return {
    latitude: coords.latitude + (Math.random() - 0.5) * 0.01,
    longitude: coords.longitude + (Math.random() - 0.5) * 0.01,
  };
};

// Predefined suburbs
const PREDEFINED_SUBURBS = [
  'Moggill QLD 4070',
  'Bellbowrie QLD 4070',
  'Pullenvale QLD 4069',
  'Brookfield QLD 4069',
  'Anstead QLD 4070',
  'Chapel Hill QLD 4069',
  'Kenmore QLD 4069',
  'Kenmore Hills QLD 4069',
  'Fig Tree Pocket QLD 4069',
  'Pinjara Hills QLD 4069',
];

interface Property {
  id: string;
  street_name: string | null;
  street_number: string | null;
  suburb: string;
  price: number | null;
}

interface PastRecord {
  property_id: string;
  sold_price: number;
  sold_date: string;
}

interface StreetStats {
  street_name: string;
  listed_count: number;
  sold_count: number;
  total_properties: number;
  coordinates: { latitude: number; longitude: number };
}

interface StreetSuggestionsProps {
  suburb: string | null;
  onSelectStreet: (street: { name: string; why: string }) => void;
}

export function StreetSuggestions({ suburb, onSelectStreet }: StreetSuggestionsProps) {
  const [streetStats, setStreetStats] = useState<StreetStats[]>([]);
  const [availableSuburbs, setAvailableSuburbs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStreet, setSelectedStreet] = useState<string | null>(null);

  // Normalize suburb names
  const normalizeSuburb = (rawSuburb: string): string => {
    const cleanSuburb = rawSuburb
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/qld\s*\d{4}/i, '')
      .replace(/\d{4}/, '');
    
    const suburbMap: { [key: string]: string } = {
      'chapell': 'Chapel Hill QLD 4069',
      'chapell hill': 'Chapel Hill QLD 4069',
      'chapel hill': 'Chapel Hill QLD 4069',
      'bellbowrie': 'Bellbowrie QLD 4070',
      'moggill': 'Moggill QLD 4070',
      'pulllenvale': 'Pullenvale QLD 4069',
      'pullenvale': 'Pullenvale QLD 4069',
      'fig tree pocket': 'Fig Tree Pocket QLD 4069',
      'kenmore': 'Kenmore QLD 4069',
      'brookfield': 'Brookfield QLD 4069',
      'anstead': 'Anstead QLD 4070',
      'kenmore hills': 'Kenmore Hills QLD 4069',
      'pinjara hills': 'Pinjara Hills QLD 4069',
      'pinjarra hills': 'Pinjara Hills QLD 4069',
    };

    return suburbMap[cleanSuburb] || PREDEFINED_SUBURBS.find((s) =>
      s.toLowerCase().includes(cleanSuburb)
    ) || rawSuburb;
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setStreetStats([]);

      try {
        // Fetch all suburbs
        const { data: allSuburbsData, error: suburbsError } = await supabase
          .from('properties')
          .select('suburb')
          .limit(1000);
        if (suburbsError) throw new Error(`Failed to fetch suburbs: ${suburbsError.message}`);
        
        const rawSuburbs = [...new Set(allSuburbsData?.map((p) => p.suburb) || [])];
        console.log('Raw suburbs from database:', rawSuburbs);

        const normalizedSuburbs = rawSuburbs.map(normalizeSuburb);
        const uniqueSuburbs = [...new Set(normalizedSuburbs)].filter((s) =>
          PREDEFINED_SUBURBS.includes(s)
        );
        setAvailableSuburbs([...new Set([...PREDEFINED_SUBURBS, ...uniqueSuburbs])].sort());
        console.log('Available suburbs:', uniqueSuburbs);

        if (!suburb) {
          setLoading(false);
          return;
        }

        // Fetch properties
        const normalizedInput = normalizeSuburb(suburb).toLowerCase().split(' qld')[0];
        const queryString = `%${normalizedInput}%`;
        console.log('Input suburb:', suburb, 'Query string:', queryString);

        const { data: properties, error: propError } = await supabase
          .from('properties')
          .select('id, street_name, street_number, suburb, price')
          .ilike('suburb', queryString);

        if (propError) {
          console.error('Property fetch error:', propError);
          throw new Error(`Failed to fetch properties: ${propError.message}`);
        }

        console.log('Fetched properties:', properties);
        if (!properties || properties.length === 0) {
          setError(`No data found for ${suburb}. Please add properties to the database.`);
          setLoading(false);
          return;
        }

        // Fetch past records
        const { data: pastRecords, error: pastError } = await supabase
          .from('past_records')
          .select('property_id, sold_price, sold_date');
        if (pastError) {
          console.warn('Past records error:', pastError);
        }
        console.log('Past records:', pastRecords);

        // Aggregate stats
        const soldPropertyIds = new Set(
          (pastRecords || []).map((record: PastRecord) => record.property_id)
        );
        const streetMap = new Map<string, { listed: number; sold: number; total: number }>();
        properties.forEach((prop) => {
          const streetName = prop.street_name?.trim() || 'Unknown Street';
          const stats = streetMap.get(streetName) || { listed: 0, sold: 0, total: 0 };
          stats.total += 1;
          if (prop.price !== null) stats.listed += 1;
          if (soldPropertyIds.has(prop.id)) stats.sold += 1;
          streetMap.set(streetName, stats);
        });

        console.log('Street stats:', Object.fromEntries(streetMap));

        const statsArray: StreetStats[] = Array.from(streetMap.entries()).map(
          ([street_name, stats], index) => ({
            street_name,
            listed_count: stats.listed,
            sold_count: stats.sold,
            total_properties: stats.total,
            coordinates: {
              latitude: generateCoordinates(suburb).latitude + index * 0.001,
              longitude: generateCoordinates(suburb).longitude,
            },
          })
        );

        statsArray.sort(
          (a, b) =>
            b.total_properties - a.total_properties ||
            b.listed_count - a.listed_count ||
            b.sold_count - a.sold_count
        );
        setStreetStats(statsArray.slice(0, 5));
      } catch (err: any) {
        console.error('Fetch error:', err);
        setError(`No data found for ${suburb}. Error: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [suburb]);

  const getSuggestionText = (street: StreetStats) => {
    if (street.sold_count > street.listed_count * 0.5 && street.sold_count > 0) {
      return `High sales rate (${street.sold_count}/${street.listed_count} sold). Target for door knocks.`;
    } else if (street.listed_count > 3) {
      return `Many listings (${street.listed_count}). Use phone calls.`;
    } else if (street.total_properties > 0) {
      return `Active street with ${street.total_properties} properties. Consider door knocks.`;
    }
    return `Moderate activity. Consider door knocks.`;
  };

  const handleSelectStreet = (street: StreetStats) => {
    onSelectStreet({
      name: street.street_name,
      why: getSuggestionText(street),
    });
    setSelectedStreet(street.street_name);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        >
          <BarChart2 className="w-8 h-8 text-indigo-600" />
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 mt-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
        <Home className="w-5 h-5 mr-2 text-indigo-600" />
        {suburb ? `Top Streets in ${suburb}` : 'Properties by Suburb'}
      </h2>
      {error && (
        <div className="text-red-600 text-center py-4">
          {error}
        </div>
      )}
      {!suburb && (
        <div className="mb-4">
          <h3 className="text-lg font-medium text-gray-800 mb-2">Available Suburbs</h3>
          {availableSuburbs.length === 0 ? (
            <p className="text-gray-600">No suburbs found in the database.</p>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {availableSuburbs.map((availSuburb) => (
                <li
                  key={availSuburb}
                  className="text-gray-700 hover:text-indigo-600 cursor-pointer"
                  onClick={() => onSelectStreet({ name: availSuburb, why: `Selected suburb: ${availSuburb}` })}
                >
                  {availSuburb}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {suburb && streetStats.length === 0 && !error && (
        <p className="text-gray-600">No data found for {suburb}.</p>
      )}
      {suburb && streetStats.length > 0 && (
        <div className="space-y-4">
          {streetStats.map((street, index) => (
            <motion.div
              key={street.street_name}
              className="border border-gray-200 p-4 rounded-lg bg-gray-50 hover:shadow-md transition-shadow duration-200"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-medium text-gray-800">
                  {index + 1}. {street.street_name}
                </h3>
                <motion.button
                  onClick={() => handleSelectStreet(street)}
                  className={`px-4 py-2 rounded-full text-white ${
                    selectedStreet === street.street_name
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  } transition-all shadow-md`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {selectedStreet === street.street_name ? 'Selected' : 'Add to Plan'}
                </motion.button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-700">
                    <strong>Total Properties:</strong> {street.total_properties}
                  </p>
                  <p className="text-gray-700">
                    <strong>Listings:</strong> {street.listed_count}
                  </p>
                  <p className="text-gray-700">
                    <strong>Sold:</strong> {street.sold_count}
                  </p>
                  <p className="text-gray-600 mt-2">{getSuggestionText(street)}</p>
                  <div className="mt-2">
                    <p className="text-sm text-gray-600">Sales Rate</p>
                    <div className="bg-gray-200 rounded-full h-3 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-indigo-500 to-indigo-700 h-3 rounded-full"
                        style={{
                          width: `${
                            street.listed_count
                              ? (street.sold_count / street.listed_count) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="h-32 rounded-lg overflow-hidden">
                  <MapContainer
                    center={[street.coordinates.latitude, street.coordinates.longitude]}
                    zoom={16}
                    style={{ height: '100%', width: '100%' }}
                    dragging={false}
                    zoomControl={false}
                    scrollWheelZoom={false}
                    doubleClickZoom={false}
                  >
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Marker
                      position={[street.coordinates.latitude, street.coordinates.longitude]}
                      icon={L.divIcon({
                        className: 'custom-icon',
                        html: `<div style="background-color: #FF5555; width: 12px; height: 12px; border-radius: 50%;"></div>`,
                        iconSize: [12, 12],
                        iconAnchor: [6, 6],
                      })}
                    >
                      <Popup>{street.street_name}</Popup>
                    </Marker>
                  </MapContainer>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}