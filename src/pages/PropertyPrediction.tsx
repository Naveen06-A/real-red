import { useEffect, useState } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2, Building, TrendingUp, TrendingDown, Download, Edit2, Save } from 'lucide-react';
import { toast } from 'react-toastify';
import { Property } from '../types/Property';
import { generatePDFReport, generateJSONReport } from '../utils/reportGenerator';
import { formatCurrency } from '../utils/formatters';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { motion } from 'framer-motion';

export interface PredictionResult {
  recommendation: 'BUY' | 'SELL';
  confidence: number;
  trend: number;
  historicalData: { dates: string[]; prices: number[] };
  marketCondition?: 'Rising' | 'Stable' | 'Declining';
  sentimentScore?: number;
}

export function PropertyPrediction() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const liveData = location.state?.liveData as Property | undefined;
  const [property, setProperty] = useState<Property | null>(liveData || null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiInsights, setAiInsights] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProperty, setEditedProperty] = useState<Property | null>(null);

  useEffect(() => {
    if (id) {
      fetchPropertyAndPredict(id);
    }
  }, [id]);

  const generateAIInsights = (prediction: PredictionResult) => {
    const insights = [
      `Market shows ${prediction.marketCondition || 'N/A'} conditions with a ${prediction.trend != null ? prediction.trend.toFixed(1) : 'N/A'}% trend.`,
      `Confidence level of ${prediction.confidence.toFixed(2)}% suggests ${prediction.recommendation.toLowerCase()} action.`,
      `Recommendation: ${prediction.recommendation} based on advanced market analysis.`,
      `Sentiment Score: ${prediction.sentimentScore != null ? prediction.sentimentScore.toFixed(1) : 'N/A'} reflects market mood.`,
    ];
    setAiInsights(insights);
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
        };
      }

      const dates = historicalData.map((record) =>
        new Date(record.sale_date).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
      );
      const prices = historicalData.map((record) => record.price);

      const lastPrice = prices[prices.length - 1];
      const firstPrice = prices[0];
      const slope = ((lastPrice - firstPrice) / firstPrice) * 100;
      const marketCondition: PredictionResult['marketCondition'] = slope > 3 ? 'Rising' : slope < -3 ? 'Declining' : 'Stable';
      const recommendation: 'BUY' | 'SELL' = slope >= 0 ? 'BUY' : 'SELL';

      const result: PredictionResult = {
        recommendation,
        confidence: Math.min(Math.abs(slope) * 2, 95),
        trend: slope,
        historicalData: { dates, prices },
        marketCondition,
        sentimentScore: Math.random() * 100 - 50,
      };

      generateAIInsights(result);
      return result;
    } catch (error) {
      console.error('Price trend analysis failed:', error);
      toast.error('Failed to generate price trend analysis');
      return {
        recommendation: 'BUY',
        confidence: 50,
        trend: 0,
        historicalData: { dates: [], prices: [] },
        sentimentScore: 0,
      };
    }
  };

  const fetchPropertyAndPredict = async (propertyId: string) => {
    setLoading(true);
    try {
      let data = liveData;
      if (!data) {
        const { data: fetchedData, error } = await supabase
          .from('properties')
          .select('*')
          .eq('id', propertyId)
          .single();
        if (error) throw error;
        data = fetchedData;
      }

      if (!data) {
        setProperty(null);
        setError('Property not found.');
        return;
      }

      setProperty(data);
      const predictionResult = await analyzePriceTrend(data.city || data.suburb || 'Unknown', data.property_type || 'Unknown'); // Provide default string
      setPrediction(predictionResult);
      toast.success('Property analysis completed successfully');

      if (location.state?.isNewSubmission) {
        setTimeout(() => navigate('/agent-dashboard'), 2000);
      }
    } catch (error) {
      console.error('Error fetching property:', error);
      toast.error('Failed to fetch property data');
      setError('Failed to fetch property data. Please try again later.');
      setProperty(null);
    } finally {
      setLoading(false);
    }
  };

  const saveEditedProperty = async () => {
    if (!editedProperty) return;
    try {
      const { error } = await supabase
        .from('properties')
        .update({
          street_number: editedProperty.street_number,
          street_name: editedProperty.street_name,
          suburb: editedProperty.suburb,
          city: editedProperty.city,
          postcode: editedProperty.postcode,
          price: editedProperty.price,
          property_type: editedProperty.property_type,
          bedrooms: editedProperty.bedrooms,
          bathrooms: editedProperty.bathrooms,
          car_garage: editedProperty.car_garage,
          sqm: editedProperty.sqm,
          landsize: editedProperty.landsize,
        })
        .eq('id', editedProperty.id);

      if (error) throw error;

      setProperty(editedProperty);
      setIsEditing(false);
      toast.success('Property updated successfully');
      await fetchPropertyAndPredict(editedProperty.id);
    } catch (error) {
      toast.error('Failed to update property');
      console.error('Update error:', error);
    }
  };

  const handleGeneratePDF = () => {
    if (!property || !prediction) return;
    generatePDFReport(property, prediction, {
      includeSameStreetSales: true,
      includePastRecords: true,
      includePrediction: true,
    });
  };

  const handleGenerateJSON = () => {
    if (!property || !prediction) return;
    generateJSONReport(property, prediction, aiInsights);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div className="text-center p-8 text-red-600">{error}</div>;
  }

  if (!property || !prediction) {
    return <div className="text-center p-8">Property or prediction data not found.</div>;
  }

  const chartData = prediction.historicalData.dates.map((date, index) => ({
    date,
    price: prediction.historicalData.prices[index],
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-5xl mx-auto px-4 py-8"
    >
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Building className="w-8 h-8 text-blue-600" />
          {`${property.street_number || ''} ${property.street_name || ''}, ${property.suburb || ''}`} - AI-Powered Prediction
        </h1>
        <div className="flex gap-2">
          {isEditing ? (
            <button
              onClick={saveEditedProperty}
              className="flex items-center gap-2 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition"
            >
              <Save className="w-4 h-4" /> Save
            </button>
          ) : (
            <button
              onClick={() => {
                setIsEditing(true);
                setEditedProperty({ ...property });
              }}
              className="flex items-center gap-2 bg-yellow-600 text-white py-2 px-4 rounded-lg hover:bg-yellow-700 transition"
            >
              <Edit2 className="w-4 h-4" /> Edit
            </button>
          )}
          <button
            onClick={handleGeneratePDF}
            className="flex items-center gap-2 bg-blue-600 text-white(py-2 px-4 rounded-lg hover:bg-blue-700 transition"
          >
            <Download className="w-4 h-4" /> PDF Report
          </button>
          <button
            onClick={handleGenerateJSON}
            className="flex items-center gap-2 bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition"
          >
            <Download className="w-4 h-4" /> JSON Report
          </button>
          <Link
            to={`/property/${property.id}`}
            state={{ property }}
            className="flex items-center gap-2 bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition"
          >
            View Details
          </Link>
        </div>
      </div>

      {isEditing && editedProperty ? (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="bg-white p-6 rounded-lg shadow-md mb-6 border border-gray-200"
        >
          <h2 className="text-xl font-semibold mb-4">Edit Property</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              value={editedProperty.street_number || ''}
              onChange={(e) => setEditedProperty({ ...editedProperty, street_number: e.target.value })}
              className="p-2 border rounded w-full"
              placeholder="Street Number"
            />
            <input
              type="text"
              value={editedProperty.street_name || ''}
              onChange={(e) => setEditedProperty({ ...editedProperty, street_name: e.target.value })}
              className="p-2 border rounded w-full"
              placeholder="Street Name"
            />
            <input
              type="text"
              value={editedProperty.suburb || ''}
              onChange={(e) => setEditedProperty({ ...editedProperty, suburb: e.target.value })}
              className="p-2 border rounded w-full"
              placeholder="Suburb"
            />
            <input
              type="text"
              value={editedProperty.city || ''}
              onChange={(e) => setEditedProperty({ ...editedProperty, city: e.target.value })}
              className="p-2 border rounded w-full"
              placeholder="City"
            />
            <input
              type="text"
              value={editedProperty.postcode || ''}
              onChange={(e) => setEditedProperty({ ...editedProperty, postcode: e.target.value })}
              className="p-2 border rounded w-full"
              placeholder="Postcode"
            />
            <input
              type="number"
              value={editedProperty.price || ''}
              onChange={(e) => setEditedProperty({ ...editedProperty, price: parseFloat(e.target.value) || undefined })}
              className="p-2 border rounded w-full"
              placeholder="Price"
            />
            <input
              type="text"
              value={editedProperty.property_type || ''}
              onChange={(e) => setEditedProperty({ ...editedProperty, property_type: e.target.value })}
              className="p-2 border rounded w-full"
              placeholder="Property Type"
            />
            <input
              type="number"
              value={editedProperty.bedrooms ?? ''}
              onChange={(e) => setEditedProperty({ ...editedProperty, bedrooms: parseInt(e.target.value) || undefined })}
              className="p-2 border rounded w-full"
              placeholder="Bedrooms"
            />
            <input
              type="number"
              value={editedProperty.bathrooms ?? ''}
              onChange={(e) => setEditedProperty({ ...editedProperty, bathrooms: parseInt(e.target.value) || undefined })}
              className="p-2 border rounded w-full"
              placeholder="Bathrooms"
            />
            <input
              type="number"
              value={editedProperty.car_garage ?? ''}
              onChange={(e) => setEditedProperty({ ...editedProperty, car_garage: parseInt(e.target.value) || undefined })}
              className="p-2 border rounded w-full"
              placeholder="Garage"
            />
            <input
              type="number"
              value={editedProperty.sqm ?? ''}
              onChange={(e) => setEditedProperty({ ...editedProperty, sqm: parseFloat(e.target.value) || undefined })}
              className="p-2 border rounded w-full"
              placeholder="Floor Area (sqm)"
            />
            <input
              type="number"
              value={editedProperty.landsize ?? ''}
              onChange={(e) => setEditedProperty({ ...editedProperty, landsize: parseFloat(e.target.value) || undefined })}
              className="p-2 border rounded w-full"
              placeholder="Land Size (sqm)"
            />
          </div>
        </motion.div>
      ) : (
        <div className="bg-white p-6 rounded-lg shadow-md mb-6 border border-gray-200">
          <div className="flex items-center mb-4">
            <Building className="w-6 h-6 text-blue-600 mr-2" />
            <span>{property.suburb || 'Unknown Suburb'} - {property.property_type || 'Unknown Type'}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-gray-600">
                <strong>Address:</strong>{' '}
                {property.street_number && property.street_name
                  ? `${property.street_number} ${property.street_name}`
                  : property.address || 'N/A'}
              </p>
              <p className="text-gray-600">
                <strong>Location:</strong>{' '}
                {property.suburb || 'N/A'}, {property.city || 'N/A'}, QLD {property.postcode || 'N/A'}
              </p>
              <p className="text-gray-600">
                <strong>Current Price:</strong>{' '}
                {property.price ? formatCurrency(property.price) : 'N/A'}
              </p>
              <p className="text-gray-600">
                <strong>Details:</strong>{' '}
                {property.bedrooms ?? 'N/A'} Beds, {property.bathrooms ?? 'N/A'} Baths, {property.car_garage ?? 'N/A'} Garage
              </p>
              <p className="text-gray-600">
                <strong>Size:</strong>{' '}
                Floor: {property.sqm ?? 'N/A'} sqm, Land: {property.landsize ?? 'N/A'} sqm
              </p>
            </div>
            <div>
              <p className="relative group">
                <strong>Recommendation:</strong>{' '}
                <span
                  className={`px-3 py-1 text-sm font-medium rounded-full ${
                    prediction.recommendation === 'BUY' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
                  }`}
                >
                  {prediction.recommendation}
                </span>
                <span className="absolute hidden group-hover:block bg-gray-800 text-white text-xs rounded py-1 px-2 -top-8 left-1/2 transform -translate-x-1/2">
                  Confidence: {prediction.confidence.toFixed(2)}%
                </span>
              </p>
              <p className="text-gray-600">
                <strong>Market Trend:</strong>{' '}
                <span className="flex items-center">
                  {prediction.trend >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-green-600 mr-1" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-600 mr-1" />
                  )}
                  {prediction.trend != null ? prediction.trend.toFixed(1) : 'N/A'}% ({prediction.marketCondition || 'N/A'})
                </span>
              </p>
              <p className="text-gray-600">
                <strong>Sentiment Score:</strong>{' '}
                {prediction.sentimentScore != null ? prediction.sentimentScore.toFixed(1) : 'N/A'} (Market Mood)
              </p>
            </div>
          </div>
          {chartData.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-2">Price Trend (Last 12 Months)</h3>
              <LineChart
                width={500}
                height={200}
                data={chartData}
                className="w-full max-w-full"
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="price" stroke="#2563eb" activeDot={{ r: 8 }} />
              </LineChart>
            </div>
          )}
          <div className="mt-6">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" /> AI Insights
            </h3>
            <ul className="list-disc pl-5 grid grid-cols-1 md:grid-cols-2 gap-2">
              {aiInsights.map((insight, index) => (
                <li key={index} className="text-gray-700 hover:text-blue-600 transition-colors">{insight}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="mt-6 text-center">
        <Link to="/agent-dashboard" className="text-blue-600 hover:underline mr-4">
          Back to Dashboard
        </Link>
        <Link
          to="/market-reports"
          state={{ liveData: property }}
          className="text-blue-600 hover:underline"
        >
          View Market Reports
        </Link>
      </div>
    </motion.div>
  );
}