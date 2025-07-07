import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BarChart2, Home } from 'lucide-react';
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
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { formatCurrency, normalizeSuburb } from '../reportsUtils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartDataLabels
);

// Coordinate generator for map
const generateCoordinates = (suburb: string) => {
  const baseCoords: { [key: string]: { latitude: number; longitude: number } } = {
    'Moggill': { latitude: -27.5716, longitude: 152.8731 },
    'Bellbowrie': { latitude: -27.5589, longitude: 152.8877 },
    'Pinjara Hills': { latitude: -27.5380, longitude: 152.9575 },
    'Fig Tree Pocket': { latitude: -27.5283, longitude: 152.9716 },
    'Pullenvale': { latitude: -27.5228, longitude: 152.8866 },
    'Brookfield': { latitude: -27.4985, longitude: 152.9007 },
    'Anstead': { latitude: -27.5387, longitude: 152.8621 },
    'Chapel Hill': { latitude: -27.5033, longitude: 152.9477 },
    'Kenmore': { latitude: -27.5076, longitude: 152.9388 },
    'Kenmore Hills': { latitude: -27.4988, longitude: 152.9322 },
    'Spring Mountain': { latitude: -27.690, longitude: 152.895 },
    'Springfield': { latitude: -27.653, longitude: 152.918 },
  };
  const coords = baseCoords[suburb] || { latitude: -27.5, longitude: 152.9 };
  return {
    latitude: coords.latitude + (Math.random() - 0.5) * 0.01,
    longitude: coords.longitude + (Math.random() - 0.5) * 0.01,
  };
};

interface Property {
  id: string;
  street_name: string | null;
  street_number: string | null;
  suburb: string;
  price: number | null;
  sold_price: number | null;
  sold_date: string | null;
  property_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  car_garage: number | null;
  sqm: number | null;
  landsize: number | null;
  status: 'Listed' | 'Sold';
}

interface StreetStats {
  street_name: string;
  listed_count: number;
  sold_count: number;
  total_properties: number;
  coordinates: { latitude: number; longitude: number };
  average_sold_price: number | null;
  properties: Property[];
}

interface StreetSuggestionsProps {
  suburb: string | null;
  soldPropertiesFilter: string;
  onSelectStreet: (street: { name: string; why: string }, type: 'door_knock' | 'phone_call') => void;
}

export function StreetSuggestions({ suburb, soldPropertiesFilter, onSelectStreet }: StreetSuggestionsProps) {
  const [streetStats, setStreetStats] = useState<StreetStats[]>([]);
  const [availableSuburbs, setAvailableSuburbs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStreet, setSelectedStreet] = useState<string | null>(null);
  const [localFilter, setLocalFilter] = useState(soldPropertiesFilter);

  useEffect(() => {
    setLocalFilter(soldPropertiesFilter);
  }, [soldPropertiesFilter]);

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
        const normalizedSuburbs = rawSuburbs.map(normalizeSuburb);
        const predefinedSuburbs = [
          'Moggill',
          'Bellbowrie',
          'Pullenvale',
          'Brookfield',
          'Anstead',
          'Chapel Hill',
          'Kenmore',
          'Kenmore Hills',
          'Fig Tree Pocket',
          'Pinjara Hills',
          'Spring Mountain',
          'Springfield',
        ];
        const uniqueSuburbs = [...new Set([...predefinedSuburbs, ...normalizedSuburbs])].sort();
        setAvailableSuburbs(uniqueSuburbs);

        if (!suburb) {
          setLoading(false);
          return;
        }

        // Normalize suburb for query
        const normalizedInput = normalizeSuburb(suburb);
        const queryString = `%${normalizedInput.toLowerCase().split(' qld')[0]}%`;

        console.log('Fetching properties for suburb:', suburb, 'Normalized:', normalizedInput, 'Query:', queryString);

        // Fetch all properties for the suburb (ignore sold_date filter initially)
        const { data: propertiesData, error: propError } = await supabase
          .from('properties')
          .select('id, street_name, street_number, suburb, price, sold_price, sold_date, property_type, bedrooms, bathrooms, car_garage, sqm, landsize')
          .ilike('suburb', queryString);

        if (propError) throw new Error(`Failed to fetch properties: ${propError.message}`);

        if (!propertiesData || propertiesData.length === 0) {
          setError(`No properties found for ${suburb}. Please add properties to the database or check the suburb name format.`);
          setLoading(false);
          return;
        }

        console.log('All properties fetched:', propertiesData);

        // Apply sold_date filter if needed
        let filteredProperties = propertiesData;
        if (localFilter !== 'all') {
          const now = new Date('2025-07-07T09:46:00+05:30'); // Current date: July 7, 2025, 9:46 AM IST
          let startDate: Date;
          switch (localFilter) {
            case '30_days':
              startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
              break;
            case '3_months':
              startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
              break;
            case '6_months':
              startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
              break;
            case '12_months':
              startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
              break;
            default:
              startDate = new Date(0);
          }
          console.log('Applying filter:', localFilter, 'Start date:', startDate.toISOString());
          filteredProperties = propertiesData.filter(
            (prop) => !prop.sold_date || new Date(prop.sold_date) >= startDate
          );
        }

        if (filteredProperties.length === 0) {
          setError(
            `No properties found for ${suburb} with filter "${localFilter.replace('_', ' ')}". ` +
            `Try selecting a broader filter (e.g., "All Time") or ensure sold_date is populated for sold properties.`
          );
          setLoading(false);
          return;
        }

        // Map properties to include status
        const combinedProperties: Property[] = filteredProperties.map((prop) => ({
          id: prop.id,
          street_name: prop.street_name,
          street_number: prop.street_number,
          suburb: prop.suburb,
          price: prop.price,
          sold_price: prop.sold_price || null,
          sold_date: prop.sold_date || null,
          property_type: prop.property_type,
          bedrooms: prop.bedrooms,
          bathrooms: prop.bathrooms,
          car_garage: prop.car_garage,
          sqm: prop.sqm,
          landsize: prop.landsize,
          status: (prop.sold_price || prop.sold_date) ? 'Sold' : 'Listed',
        }));

        console.log('Filtered properties:', combinedProperties);

        // Aggregate street stats
        const streetMap = new Map<
          string,
          { listed: number; sold: number; total: number; totalSoldPrice: number; properties: Property[] }
        >();
        combinedProperties.forEach((prop) => {
          const streetName = prop.street_name?.trim() || 'Unknown Street';
          const stats = streetMap.get(streetName) || { listed: 0, sold: 0, total: 0, totalSoldPrice: 0, properties: [] };
          stats.total += 1;
          if (prop.status === 'Listed') stats.listed += 1;
          if (prop.status === 'Sold') {
            stats.sold += 1;
            if (prop.sold_price) stats.totalSoldPrice += prop.sold_price;
          }
          stats.properties.push(prop);
          streetMap.set(streetName, stats);
        });

        const statsArray: StreetStats[] = Array.from(streetMap.entries()).map(
          ([street_name, stats], index) => ({
            street_name,
            listed_count: stats.listed,
            sold_count: stats.sold,
            total_properties: stats.total,
            coordinates: {
              latitude: generateCoordinates(normalizedInput).latitude + index * 0.001,
              longitude: generateCoordinates(normalizedInput).longitude,
            },
            average_sold_price: stats.sold > 0 ? stats.totalSoldPrice / stats.sold : null,
            properties: stats.properties,
          })
        );

        statsArray.sort(
          (a, b) =>
            b.sold_count - a.sold_count ||
            b.total_properties - a.total_properties ||
            b.listed_count - a.listed_count
        );

        console.log('Street stats:', statsArray);

        setStreetStats(statsArray);
      } catch (err: any) {
        setError(`Error fetching data for ${suburb}: ${err.message}`);
        console.error('Fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [suburb, localFilter]);

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

  const handleSelectStreet = (street: StreetStats, type: 'door_knock' | 'phone_call') => {
    onSelectStreet(
      {
        name: street.street_name,
        why: getSuggestionText(street),
      },
      type
    );
    setSelectedStreet(street.street_name === selectedStreet ? null : street.street_name);
  };

  // Chart for sold properties and average sold price
  const soldPropertiesChart = {
    labels: selectedStreet
      ? [selectedStreet]
      : streetStats.map((street) => street.street_name),
    datasets: [
      {
        label: 'Sold Properties',
        data: selectedStreet
          ? [streetStats.find((s) => s.street_name === selectedStreet)?.sold_count || 0]
          : streetStats.map((street) => street.sold_count),
        backgroundColor: '#60A5FA',
        yAxisID: 'y',
      },
      {
        label: 'Average Sold Price',
        data: selectedStreet
          ? [
              streetStats.find((s) => s.street_name === selectedStreet)?.average_sold_price || 0,
            ]
          : streetStats.map((street) =>
              street.average_sold_price !== null ? street.average_sold_price : 0
            ),
        backgroundColor: '#93C5FD',
        yAxisID: 'y1',
      },
    ],
  };

  const chartOptions = {
    plugins: {
      legend: { position: 'top' as const, labels: { font: { size: 14 } } },
      title: {
        display: true,
        text: `Sold Properties and Average Sold Price by Street in ${suburb || 'Selected Suburb'} (Filter: ${localFilter.replace('_', ' ')})`,
        font: { size: 18, weight: 'bold' as const },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            if (context.dataset.label === 'Sold Properties') {
              return `${context.dataset.label}: ${context.raw}`;
            }
            return `${context.dataset.label}: ${formatCurrency(context.raw)}`;
          },
        },
      },
      datalabels: {
        display: true,
        color: '#1E3A8A',
        font: { size: 12 },
        formatter: (value: number, context: any) => {
          if (context.dataset.label === 'Sold Properties') {
            return value > 0 ? value : '';
          }
          return value > 0 ? formatCurrency(value) : '';
        },
      },
    },
    scales: {
      y: {
        type: 'linear' as const,
        position: 'left' as const,
        title: { display: true, text: 'Number of Sold Properties' },
        beginAtZero: true,
        ticks: { stepSize: 1 },
      },
      y1: {
        type: 'linear' as const,
        position: 'right' as const,
        title: { display: true, text: 'Average Sold Price' },
        beginAtZero: true,
        grid: { drawOnChartArea: false },
        ticks: {
          callback: (value: number) => formatCurrency(value),
        },
      },
      x: {
        ticks: { font: { size: 12 } },
      },
    },
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
        {suburb ? `Street Suggestions in ${suburb} (Filter: ${localFilter.replace('_', ' ')})` : 'Properties by Suburb'}
      </h2>
      {error && (
        <div className="text-red-600 text-center py-4">{error}</div>
      )}
      {!suburb && (
        <div className="mb-4">
          <h3 className="text-lg font-medium text-gray-800 mb-2">
            Available Suburbs
          </h3>
          {availableSuburbs.length === 0 ? (
            <p className="text-gray-600">No suburbs found in the database.</p>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {availableSuburbs.map((availSuburb) => (
                <li
                  key={availSuburb}
                  className="text-gray-700 hover:text-indigo-600 cursor-pointer"
                  onClick={() =>
                    onSelectStreet(
                      { name: availSuburb, why: `Selected suburb: ${availSuburb}` },
                      'door_knock'
                    )
                  }
                >
                  {availSuburb}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {suburb && streetStats.length === 0 && !error && (
        <p className="text-gray-600">No properties found for {suburb} with the selected filter.</p>
      )}
      {suburb && streetStats.length > 0 && (
        <div className="space-y-8">
          {/* Filter Dropdown */}
          <div>
            <label className="block text-gray-800 font-semibold mb-2">Filter Sold Properties</label>
            <select
              value={localFilter}
              onChange={(e) => setLocalFilter(e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
              aria-label="Select sold properties filter"
            >
              <option value="all">All Time</option>
              <option value="30_days">Last 30 Days</option>
              <option value="3_months">Last 3 Months</option>
              <option value="6_months">Last 6 Months</option>
              <option value="12_months">Last 12 Months</option>
            </select>
          </div>

          {/* Street Statistics Section */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Street Statistics</h3>
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
                    <h4
                      className="text-lg font-medium text-gray-800 cursor-pointer hover:text-indigo-600"
                      onClick={() => handleSelectStreet(street, 'door_knock')}
                    >
                      {index + 1}. {street.street_name}
                    </h4>
                    <div className="flex gap-2">
                      <motion.button
                        onClick={() => handleSelectStreet(street, 'door_knock')}
                        className={`px-4 py-2 rounded-full text-white ${
                          selectedStreet === street.street_name &&
                          getSuggestionText(street).includes('door knocks')
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-indigo-600 hover:bg-indigo-700'
                        } transition-all shadow-md`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        {selectedStreet === street.street_name &&
                        getSuggestionText(street).includes('door knocks')
                          ? 'Selected'
                          : 'Add to Door Knocks'}
                      </motion.button>
                      <motion.button
                        onClick={() => handleSelectStreet(street, 'phone_call')}
                        className={`px-4 py-2 rounded-full text-white ${
                          selectedStreet === street.street_name &&
                          getSuggestionText(street).includes('phone calls')
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-indigo-600 hover:bg-indigo-700'
                        } transition-all shadow-md`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        {selectedStreet === street.street_name &&
                        getSuggestionText(street).includes('phone calls')
                          ? 'Selected'
                          : 'Add to Phone Calls'}
                      </motion.button>
                    </div>
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
                      <p className="text-gray-700">
                        <strong>Average Sold Price:</strong>{' '}
                        {street.average_sold_price
                          ? formatCurrency(street.average_sold_price)
                          : 'N/A'}
                      </p>
                      <p className="text-gray-600 mt-2">
                        {getSuggestionText(street)}
                      </p>
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
                  {/* Property Details for Selected Street */}
                  {selectedStreet === street.street_name && (
                    <motion.div
                      className="mt-4"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.3 }}
                    >
                      <h5 className="text-md font-semibold text-gray-800 mb-2">
                        Properties on {street.street_name}
                      </h5>
                      <p className="text-gray-700 mb-4">
                        <strong>Total Properties:</strong> {street.properties.length}
                        <span className="mx-2">|</span>
                        <strong>Listed Properties:</strong>{' '}
                        {street.properties.filter((p) => p.status === 'Listed').length}
                        <span className="mx-2">|</span>
                        <strong>Sold Properties:</strong>{' '}
                        {street.properties.filter((p) => p.status === 'Sold').length}
                        <span className="mx-2">|</span>
                        <strong>Average Sold Price:</strong>{' '}
                        {street.average_sold_price
                          ? formatCurrency(street.average_sold_price)
                          : 'N/A'}
                      </p>
                      {street.properties.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="bg-indigo-600 text-white">
                                <th className="p-3 text-left">Street Number</th>
                                <th className="p-3 text-left">Street Name</th>
                                <th className="p-3 text-left">Suburb</th>
                                <th className="p-3 text-left">Property Type</th>
                                <th className="p-3 text-left">Bedrooms</th>
                                <th className="p-3 text-left">Bathrooms</th>
                                <th className="p-3 text-left">Car Garage</th>
                                <th className="p-3 text-left">SQM</th>
                                <th className="p-3 text-left">Land Size</th>
                                <th className="p-3 text-left">Listed Price</th>
                                <th className="p-3 text-left">Sold Price</th>
                                <th className="p-3 text-left">Sold Date</th>
                                <th className="p-3 text-left">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {street.properties.map((property) => (
                                <motion.tr
                                  key={property.id}
                                  className="border-b border-gray-200 hover:bg-gray-100"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  transition={{ duration: 0.3 }}
                                >
                                  <td className="p-3">{property.street_number || 'N/A'}</td>
                                  <td className="p-3">{property.street_name || 'N/A'}</td>
                                  <td className="p-3">{normalizeSuburb(property.suburb)}</td>
                                  <td className="p-3">{property.property_type || 'N/A'}</td>
                                  <td className="p-3">{property.bedrooms ?? 'N/A'}</td>
                                  <td className="p-3">{property.bathrooms ?? 'N/A'}</td>
                                  <td className="p-3">{property.car_garage ?? 'N/A'}</td>
                                  <td className="p-3">{property.sqm ?? 'N/A'}</td>
                                  <td className="p-3">{property.landsize ?? 'N/A'}</td>
                                  <td className="p-3">{property.price ? formatCurrency(property.price) : 'N/A'}</td>
                                  <td className="p-3">{property.sold_price ? formatCurrency(property.sold_price) : 'N/A'}</td>
                                  <td className="p-3">{property.sold_date ? new Date(property.sold_date).toLocaleDateString() : 'N/A'}</td>
                                  <td className="p-3">{property.status}</td>
                                </motion.tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-gray-600">No properties found for {street.street_name}.</p>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>

          {/* Chart Section */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
              <BarChart2 className="w-5 h-5 mr-2 text-indigo-600" />
              Sales Overview
            </h3>
            {soldPropertiesChart.labels.length > 0 ? (
              <Bar data={soldPropertiesChart} options={chartOptions} />
            ) : (
              <p className="text-gray-600">No data available for chart.</p>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}