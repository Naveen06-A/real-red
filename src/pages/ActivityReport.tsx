import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';
import { Phone, Users, DoorClosed, Link as LinkIcon, CheckCircle, TrendingUp, Edit2, Search, Download, Mic, Building, Bell, Calendar, Tag, Home, BarChart2, PieChart as PieChartIcon } from 'lucide-react';
import * as tf from '@tensorflow/tfjs';
import { Navigation } from '../components/Navigation';
type ActivityType = 'phone_call' | 'client_meeting' | 'door_knock' | 'connection';

interface Property {
  id: string;
  name: string;
  street_name?: string;
  property_type: string;
  features?: string[];
  city?: string;
  price?: number;
}

interface Activity {
  id: string;
  agent_id: string;
  activity_type: ActivityType;
  activity_date: string;
  notes?: string;
  tags?: string[];
  property_id?: string;
}

interface FormData {
  phone_call: string;
  client_meeting: string;
  door_knock: string;
  connection: string;
}

interface PerformanceMetrics {
  weeklyTrend: number;
  topActivity: ActivityType | null;
  activityEfficiency: Record<ActivityType, number>;
}

interface PredictionResult {
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  trend: number;
  historicalData: { dates: string[]; prices: number[] };
  bestTimeToSell?: string;
  estimatedValue?: number;
  marketCondition?: 'Rising' | 'Stable' | 'Declining';
  nextPrice?: number;
}

export function AgentReports() {
  const { user, profile } = useAuthStore();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [formData, setFormData] = useState<FormData>({
    phone_call: '',
    client_meeting: '',
    door_knock: '',
    connection: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editPropertyId, setEditPropertyId] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [showPrediction, setShowPrediction] = useState(false);
  const [notifications, setNotifications] = useState<string[]>([]);

  useEffect(() => {
    if (user) {
      Promise.all([fetchActivities(), fetchProperties()]).finally(() => setLoading(false));
      checkRealTimeNotifications();
    }
  }, [user]);

  const fetchActivities = async () => {
    try {
      const { data, error } = await supabase
        .from('agent_activities')
        .select('*')
        .eq('agent_id', user?.id)
        .order('activity_date', { ascending: false });
      if (error) throw error;
      setActivities(data || []);
      calculatePerformanceMetrics(data || []);
    } catch (err) {
      console.error('Fetch activities error:', err);
    }
  };

  const fetchProperties = async () => {
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('id, name, street_name, property_type, features, city, price')
        .eq('user_id', user?.id);
      if (error) throw error;
      setProperties(data || []);
    } catch (err) {
      console.error('Fetch properties error:', err);
    }
  };

  const analyzePriceTrend = async (city: string, propertyType: string, currentPrice: number): Promise<PredictionResult> => {
    // ... (unchanged from original)
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
          recommendation: 'HOLD',
          confidence: 50,
          trend: 0,
          historicalData: { dates: [], prices: [] },
        };
      }

      const dates = historicalData.map((record) =>
        new Date(record.sale_date).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
      );
      const prices = historicalData.map((record) => record.price);

      const model = tf.sequential();
      model.add(tf.layers.dense({ units: 1, inputShape: [1] }));
      model.compile({ optimizer: 'sgd', loss: 'meanSquaredError' });

      const xs = tf.tensor1d(prices.map((_, i) => i));
      const ys = tf.tensor1d(prices);
      await model.fit(xs, ys, { epochs: 100 });

      const nextIndex = prices.length;
      const nextPriceTensor = model.predict(tf.tensor1d([nextIndex])) as tf.Tensor;
      const nextPrice = nextPriceTensor.dataSync()[0];

      const slope = ((nextPrice - prices[prices.length - 1]) / prices[prices.length - 1]) * 100;
      const marketCondition: 'Rising' | 'Stable' | 'Declining' = slope > 3 ? 'Rising' : slope < -3 ? 'Declining' : 'Stable';
      const recommendation: 'BUY' | 'SELL' | 'HOLD' = slope > 5 ? 'BUY' : slope < -5 ? 'SELL' : 'HOLD';
      const estimatedValue = currentPrice * (1 + slope / 100);

      const today = new Date();
      const sixMonthsFromNow = new Date(today.setMonth(today.getMonth() + 6));
      const bestTimeToSell = new Date(
        today.getTime() + Math.random() * (sixMonthsFromNow.getTime() - today.getTime())
      ).toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' });

      return {
        recommendation,
        confidence: Math.min(Math.abs(slope) * 2, 95),
        trend: slope,
        historicalData: { dates, prices },
        bestTimeToSell,
        estimatedValue,
        marketCondition,
        nextPrice,
      };
    } catch (error) {
      console.error('Error analyzing price trend:', error);
      return {
        recommendation: 'HOLD',
        confidence: 50,
        trend: 0,
        historicalData: { dates: [], prices: [] },
      };
    }
  };

  const predictProperty = async (propertyId: string) => {
    const property = properties.find((p) => p.id === propertyId);
    if (!property || !property.city || !property.price) return;

    setSubmitting(true);
    const predictionResult = await analyzePriceTrend(property.city, property.property_type, property.price);
    setPrediction(predictionResult);
    setShowPrediction(true);
    setSubmitting(false);
  };

  const handleSubmit = async () => {
    // ... (unchanged from original)
    if (!user || submitting) return;

    const activitiesToSubmit = Object.entries(formData)
      .filter(([, notes]) => notes.trim())
      .map(([activityType, notes]) => ({
        agent_id: user.id,
        activity_type: activityType as ActivityType,
        notes: notes.trim(),
        activity_date: new Date().toISOString(),
        tags: [],
      }));

    if (activitiesToSubmit.length === 0) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('agent_activities').insert(activitiesToSubmit);
      if (error) throw error;

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setFormData({ phone_call: '', client_meeting: '', door_knock: '', connection: '' });
        fetchActivities();
      }, 1500);
    } catch (err: any) {
      console.error('Submit activities error:', err);
      alert(`Failed to log activities: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async () => {
    // ... (unchanged from original)
    if (!editingActivity || !user) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('agent_activities')
        .update({ notes: editNotes, tags: editTags, property_id: editPropertyId })
        .eq('id', editingActivity.id)
        .eq('agent_id', user.id);

      if (error) throw error;

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setEditingActivity(null);
        setEditNotes('');
        setEditTags([]);
        if (editPropertyId && editPropertyId !== editingActivity.property_id) {
          predictProperty(editPropertyId);
        }
        setEditPropertyId(undefined);
        fetchActivities();
      }, 1500);
    } catch (err: any) {
      console.error('Edit activity error:', err);
      alert(`Failed to update activity: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const calculatePerformanceMetrics = (activities: Activity[]) => {
    // ... (unchanged from original)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const recentActivities = activities.filter((a) => new Date(a.activity_date) >= oneWeekAgo);
    const totalRecent = recentActivities.length;
    const totalPrevious = activities.filter(
      (a) =>
        new Date(a.activity_date) < oneWeekAgo &&
        new Date(a.activity_date) >= new Date(oneWeekAgo.getTime() - 7 * 24 * 60 * 60 * 1000)
    ).length;

    const weeklyTrend = totalPrevious > 0 ? ((totalRecent - totalPrevious) / totalPrevious) * 100 : totalRecent > 0 ? 100 : 0;

    const activityCounts = activities.reduce((acc, curr) => {
      acc[curr.activity_type] = (acc[curr.activity_type] || 0) + 1;
      return acc;
    }, {} as Record<ActivityType, number>);

    const topActivity = Object.entries(activityCounts).reduce(
      (max, [type, count]) => (count > (activityCounts[max] || 0) ? (type as ActivityType) : max),
      'phone_call' as ActivityType
    );

    const activityEfficiency = Object.keys(activityCounts).reduce((acc, type) => {
      const typeActivities = activities.filter((a) => a.activity_type === type);
      const avgTime =
        typeActivities.length > 0
          ? typeActivities.reduce(
              (sum, a) => sum + new Date().getTime() - new Date(a.activity_date).getTime(),
              0
            ) /
            typeActivities.length /
            (1000 * 60 * 60)
          : 0;
      acc[type as ActivityType] = avgTime > 0 ? activityCounts[type as ActivityType] / avgTime : activityCounts[type as ActivityType];
      return acc;
    }, {} as Record<ActivityType, number>);

    setPerformanceMetrics({
      weeklyTrend,
      topActivity,
      activityEfficiency,
    });
  };

  const getSuggestions = (type: ActivityType) => {
    // ... (unchanged from original)
    const pastActivities = activities.filter((a) => a.activity_type === type);
    const noteSuggestions = Array.from(new Set(pastActivities.map((a) => a.notes).filter(Boolean))).slice(0, 3);
    const tagSuggestions = Array.from(
      new Set(pastActivities.flatMap((a) => a.tags || []).filter(Boolean))
    ).slice(0, 5);
    return { noteSuggestions, tagSuggestions };
  };

  const startVoiceInput = () => {
    // ... (unchanged from original)
    if (!('webkitSpeechRecognition' in window)) {
      alert('Speech recognition not supported in this browser.');
      return;
    }

    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setEditNotes((prev) => prev + ' ' + transcript);
    };
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
    };

    recognition.start();
  };

  const applyPreset = (preset: string) => {
    // ... (unchanged from original)
    setEditNotes(preset);
    setEditTags(preset === 'Follow-up scheduled' ? ['follow-up'] : preset === 'Completed' ? ['done'] : []);
  };

  const checkRealTimeNotifications = () => {
    const overdueActivities = activities.filter(
      (a) => new Date(a.activity_date) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );
    if (overdueActivities.length > 0) {
      setNotifications([`You have ${overdueActivities.length} activities overdue.`]);
    }
  };

  const activityTotals = activities.reduce((acc, curr) => {
    acc[curr.activity_type] = (acc[curr.activity_type] || 0) + 1;
    return acc;
  }, {} as Record<ActivityType, number>);

  const chartData = Object.entries(
    activities.reduce((acc, curr) => {
      const date = new Date(curr.activity_date).toLocaleDateString();
      acc[date] = acc[date] || { date, phone_call: 0, client_meeting: 0, door_knock: 0, connection: 0 };
      acc[date][curr.activity_type]++;
      return acc;
    }, {} as Record<string, { date: string; phone_call: number; client_meeting: number; door_knock: number; connection: number }>)
  ).map(([, value]) => value);

  const pieData = Object.entries(activityTotals).map(([name, value]) => ({ name, value }));

  const filteredActivities = activities.filter(
    (activity) => {
      const property = properties.find((p) => p.id === activity.property_id);
      return (
        activity.notes?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        activity.tags?.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
        property?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        property?.street_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        property?.property_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        property?.features?.some((f) => f.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }
  );

  const exportToCSV = () => {
    // ... (unchanged from original)
    const headers = ['ID,Type,Date,Notes,Tags,Name,Street Name,Property Type,Features'];
    const rows = filteredActivities.map((activity) => {
      const property = properties.find((p) => p.id === activity.property_id);
      return `${activity.id},${activity.activity_type},${activity.activity_date},${activity.notes || ''},${activity.tags?.join(';') || ''},${property?.name || ''},${property?.street_name || ''},${property?.property_type || ''},${property?.features?.join(';') || ''}`;
    });
    const csvContent = [...headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `agent_activities_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!profile || (profile.role !== 'agent' && profile.role !== 'admin')) {
    return <div className="p-4 text-center text-red-600">Access denied. Agents or Admins only.</div>;
  }
  if (loading) return <div className="p-4 text-center">Loading...</div>;

  const sections = [
    { type: 'phone_call', label: 'Phone Calls', icon: <Phone />, color: 'bg-blue-500' },
    { type: 'client_meeting', label: 'Client Meetings', icon: <Users />, color: 'bg-green-500' },
    { type: 'door_knock', label: 'Door Knocks', icon: <DoorClosed />, color: 'bg-yellow-500' },
    { type: 'connection', label: 'Connections', icon: <LinkIcon />, color: 'bg-orange-500' },
  ] as const;

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300'];

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Agent Reports</h1>

      {notifications.length > 0 && (
        <div className="bg-yellow-100 p-4 rounded-lg mb-4 flex items-center">
          <Bell className="w-5 h-5 text-yellow-600 mr-2" />
          <p>{notifications[0]}</p>
        </div>
      )}

      {performanceMetrics && (
        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
          <h2 className="text-2xl font-semibold mb-4 flex items-center">
            <TrendingUp className="mr-2" /> Performance Overview
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 rounded">
              <p className="text-lg font-medium">Weekly Trend</p>
              <p className={`text-xl ${performanceMetrics.weeklyTrend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {performanceMetrics.weeklyTrend.toFixed(1)}%
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded">
              <p className="text-lg font-medium">Top Activity</p>
              <p className="text-xl capitalize">{performanceMetrics.topActivity?.replace('_', ' ')}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded">
              <p className="text-lg font-medium">Efficiency Score</p>
              <p className="text-xl">
                {Object.values(performanceMetrics.activityEfficiency).reduce((sum, val) => sum + val, 0).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 relative">
        {sections.map((section) => (
          <div key={section.type} className="bg-white p-4 rounded-lg shadow-md">
            <div className="flex items-center mb-3">
              <div className={`${section.color} p-2 rounded-full text-white mr-3`}>{section.icon}</div>
              <h2 className="text-lg font-semibold">{section.label}</h2>
            </div>
            <textarea
              value={formData[section.type]}
              onChange={(e) => setFormData({ ...formData, [section.type]: e.target.value })}
              placeholder={`Log ${section.label.toLowerCase()}...`}
              className="w-full p-3 border rounded focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2}
            />
          </div>
        ))}
        <button
          onClick={handleSubmit}
          disabled={submitting || !Object.values(formData).some((notes) => notes.trim())}
          className="md:col-span-2 mt-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
        >
          {submitting ? 'Logging...' : 'Log All Activities'}
        </button>
        {success && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 rounded-lg">
            <CheckCircle className="w-12 h-12 text-green-500 animate-bounce" />
          </div>
        )}
      </div>

      {editingActivity && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-lg">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <Edit2 className="mr-2" /> Smart Edit: {editingActivity.activity_type.replace('_', ' ')}
            </h2>

            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={startVoiceInput}
                className={`p-2 rounded-full ${isRecording ? 'bg-red-500 text-white' : 'bg-gray-200'}`}
                title="Record notes"
              >
                <Mic className="w-5 h-5" />
              </button>
              <div className="flex gap-2">
                {['Follow-up scheduled', 'Completed', 'Pending'].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => applyPreset(preset)}
                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-gray-700 mb-2 flex items-center"><Edit2 className="w-4 h-4 mr-2" />Notes</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Update notes..."
                className="w-full p-3 border rounded focus:ring-2 focus:ring-blue-500 resize-none"
                rows={3}
              />
            </div>

            <div className="mb-4">
              <label className="block text-gray-700 mb-2 flex items-center"><Tag className="w-4 h-4 mr-2" />Tags</label>
              <input
                type="text"
                value={editTags.join(', ')}
                onChange={(e) => setEditTags(e.target.value.split(',').map((tag) => tag.trim()))}
                placeholder="e.g., follow-up, urgent"
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="mb-4">
              <label className="block text-gray-700 mb-2 flex items-center"><Home className="w-4 h-4 mr-2" />Link to Property</label>
              <select
                value={editPropertyId || ''}
                onChange={(e) => setEditPropertyId(e.target.value || undefined)}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No property linked</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name} ({property.property_type})
                    {property.street_name ? ` - ${property.street_name}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <p className="text-sm font-medium mb-2 flex items-center"><Calendar className="w-4 h-4 mr-2" />Related Activities</p>
              <div className="max-h-32 overflow-y-auto">
                {activities
                  .filter((a) => a.activity_type === editingActivity.activity_type && a.id !== editingActivity.id)
                  .slice(0, 5)
                  .map((a) => (
                    <div key={a.id} className="text-sm text-gray-600 mb-1 flex items-center">
                      <Calendar className="w-3 h-3 mr-2" />
                      <span>{new Date(a.activity_date).toLocaleDateString()}:</span> {a.notes || 'No notes'}
                    </div>
                  ))}
              </div>
            </div>

            {performanceMetrics && (
              <div className="mb-4 p-3 bg-gray-50 rounded">
                <p className="text-sm font-medium">Impact Preview</p>
                <p className="text-sm">
                  Efficiency Score Change: {(performanceMetrics.activityEfficiency[editingActivity.activity_type] * 1.1).toFixed(2)} (est.)
                </p>
              </div>
            )}

            <div className="flex justify-end gap-4">
              <button onClick={() => setEditingActivity(null)} className="py-2 px-4 bg-gray-300 rounded hover:bg-gray-400">
                Cancel
              </button>
              <button
                onClick={handleEditSubmit}
                disabled={submitting}
                className="py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPrediction && prediction && editPropertyId && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md transform transition-all duration-300 scale-100 hover:scale-105">
            <div className="flex items-center mb-4">
              <Building className="w-6 h-6 text-blue-600 mr-2" />
              <h2 className="text-xl font-semibold">
                Prediction for {properties.find((p) => p.id === editPropertyId)?.name}
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <p>
                <strong>Recommendation:</strong> {prediction.recommendation} ({prediction.confidence}% confidence)
              </p>
              <p>
                <strong>Market Trend:</strong> {prediction.trend.toFixed(1)}% ({prediction.marketCondition})
              </p>
              <p>
                <strong>Estimated Value:</strong>{' '}
                {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(prediction.estimatedValue || 0)}
              </p>
              <p>
                <strong>Best Time to Sell:</strong> {prediction.bestTimeToSell}
              </p>
              <p>
                <strong>Next Month Prediction:</strong>{' '}
                {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(prediction.nextPrice || 0)}
              </p>
            </div>
            <button
              onClick={() => setShowPrediction(false)}
              className="mt-4 w-full py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition duration-200"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {sections.map((section) => (
          <div key={section.type} className={`${section.color.replace('500', '100')} p-4 rounded-lg text-center`}>
            <h3 className="text-lg font-medium">{section.label}</h3>
            <p className="text-2xl font-bold">{activityTotals[section.type] || 0}</p>
          </div>
        ))}
      </div>

      <div className="mb-8 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by notes, tags, name, street name, property type, or features..."
            className="w-full pl-10 p-2 border rounded focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={exportToCSV}
          className="py-2 px-4 bg-green-500 text-white rounded hover:bg-green-600 flex items-center"
        >
          <Download className="w-5 h-5 mr-2" /> Export CSV
        </button>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 flex items-center"><Calendar className="w-6 h-6 mr-2" />Recent Activities</h2>
        {filteredActivities.length > 0 ? (
          <div className="space-y-4">
            {filteredActivities.slice(0, 10).map((activity) => {
              const linkedProperty = properties.find((p) => p.id === activity.property_id);
              return (
                <div key={activity.id} className="bg-white p-4 rounded-lg shadow-md flex justify-between items-center">
                  <div className="flex items-center">
                    <div className="mr-4">
                      {activity.activity_type === 'phone_call' && <Phone className="w-6 h-6 text-blue-500" />}
                      {activity.activity_type === 'client_meeting' && <Users className="w-6 h-6 text-green-500" />}
                      {activity.activity_type === 'door_knock' && <DoorClosed className="w-6 h-6 text-yellow-500" />}
                      {activity.activity_type === 'connection' && <LinkIcon className="w-6 h-6 text-orange-500" />}
                    </div>
                    <div>
                      <p className="font-semibold capitalize">{activity.activity_type.replace('_', ' ')}</p>
                      <p className="text-gray-600">{activity.notes || 'No notes'}</p>
                      {linkedProperty && (
                        <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm mt-1">
                          <Home className="w-3 h-3 inline-block mr-1" />
                          {linkedProperty.name}
                        </span>
                      )}
                      <p className="text-sm text-gray-500 mt-1">
                        <Calendar className="w-3 h-3 inline-block mr-1" />
                        {new Date(activity.activity_date).toLocaleString()}
                        {activity.tags?.length ? ` | Tags: ${activity.tags.join(', ')}` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setEditingActivity(activity);
                      setEditNotes(activity.notes || '');
                      setEditTags(activity.tags || []);
                      setEditPropertyId(activity.property_id);
                    }}
                    className="p-2 text-blue-500 hover:text-blue-700"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-center">No activities match your search.</p>
        )}
      </div>

      <h2 className="text-2xl font-semibold mb-4 flex items-center"><BarChart2 className="w-6 h-6 mr-2" />Daily Activity</h2>
      {chartData.length > 0 ? (
        <BarChart width={600} height={300} data={chartData} className="mx-auto">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="phone_call" fill="#8884d8" name="Phone Calls" />
          <Bar dataKey="client_meeting" fill="#82ca9d" name="Client Meetings" />
          <Bar dataKey="door_knock" fill="#ffc658" name="Door Knocks" />
          <Bar dataKey="connection" fill="#ff7300" name="Connections" />
        </BarChart>
      ) : (
        <p className="text-center">No activities logged yet.</p>
      )}

      {pieData.length > 0 && (
        <div className="mt-8">
          <h2 className="text-2xl font-semibold mb-4 flex items-center"><PieChartIcon className="w-6 h-6 mr-2" />Activity Distribution</h2>
          <PieChart width={400} height={400} className="mx-auto">
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              outerRadius={150}
              fill="#8884d8"
              dataKey="value"
            >
              {pieData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </div>
      )}
    </div>
  );
}