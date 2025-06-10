import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { Phone, Users, DoorClosed, Link as LinkIcon, CheckCircle, Edit2, Mic, Building, Bell } from 'lucide-react';
import * as tf from '@tensorflow/tfjs';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';

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
  street_name?: string;
}

interface FormData {
  phone_call: string;
  client_meeting: string;
  door_knock: string;
  connection: string;
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

interface MarketingPlan {
  id: string;
  agent: string;
  suburb: string;
  start_date: string;
  end_date: string;
  door_knock_streets: { id: string; name: string; why: string; house_count: string; target_knocks: string; target_answers: string }[];
  phone_call_streets: { id: string; name: string; why: string; target_calls: string }[];
  target_connects: string;
  target_desktop_appraisals: string;
  target_face_to_face_appraisals: string;
  created_at?: string;
  updated_at?: string;
}

export function AgentReports() {
  const { user, profile } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
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
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editPropertyId, setEditPropertyId] = useState<string | undefined>(undefined);
  const [editStreetName, setEditStreetName] = useState<string | undefined>(undefined);
  const [isRecording, setIsRecording] = useState(false);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [showPrediction, setShowPrediction] = useState(false);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [marketingPlan, setMarketingPlan] = useState<MarketingPlan | null>(null);
  const [recommendedStreet, setRecommendedStreet] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('agent_id');
    if (id) {
      setAgentId(id);
      supabase
        .from('profiles')
        .select('name')
        .eq('id', id)
        .single()
        .then(({ data, error }) => {
          if (!error && data) setAgentName(data.name);
        });
    }
  }, [location.search]);

  useEffect(() => {
    if (user || agentId) {
      Promise.all([fetchMarketingPlan(), fetchActivities(), fetchProperties()]).finally(() => setLoading(false));
      checkRealTimeNotifications();
    }
  }, [user, agentId]);

  const fetchMarketingPlan = async () => {
    try {
      const { data, error } = await supabase
        .from('marketing_plans')
        .select('*')
        .eq('agent', agentId || user?.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setMarketingPlan(data);
        const allStreets = [
          ...data.door_knock_streets.map((s) => s.name),
          ...data.phone_call_streets.map((s) => s.name),
        ];
        if (allStreets.length > 0) {
          const randomStreet = allStreets[Math.floor(Math.random() * allStreets.length)];
          setRecommendedStreet(randomStreet);
        }
      } else {
        setMarketingPlan(null);
      }
    } catch (err) {
      console.error('Fetch marketing plan error:', err);
      toast.error('Failed to fetch marketing plan');
    }
  };

  const fetchActivities = async () => {
    try {
      const { data, error } = await supabase
        .from('agent_activities')
        .select('*')
        .eq('agent_id', agentId || user?.id)
        .order('activity_date', { ascending: false });
      if (error) throw error;
      setActivities(data || []);
    } catch (err) {
      console.error('Fetch activities error:', err);
      toast.error('Failed to fetch activities');
    }
  };

  const fetchProperties = async () => {
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('id, name, street_name, property_type, features, city, price')
        .eq('user_id', agentId || user?.id);
      if (error) throw error;
      setProperties(data || []);
    } catch (err) {
      console.error('Fetch properties error:', err);
      toast.error('Failed to fetch properties');
    }
  };

  const analyzePriceTrend = async (city: string, propertyType: string, currentPrice: number): Promise<PredictionResult> => {
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
      toast.error('Failed to analyze price trend');
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
    if (!property || !property.city || !property.price) {
      toast.error('Property missing required data');
      return;
    }

    setSubmitting(true);
    const predictionResult = await analyzePriceTrend(property.city, property.property_type, property.price);
    setPrediction(predictionResult);
    setShowPrediction(true);
    setSubmitting(false);
  };

  const handleSubmit = async () => {
    if (!user || submitting || !marketingPlan) return;

    const activitiesToSubmit = Object.entries(formData)
      .filter(([, notes]) => notes.trim())
      .map(([activityType, notes]) => ({
        agent_id: user.id,
        activity_type: activityType as ActivityType,
        notes: notes.trim(),
        activity_date: new Date().toISOString(),
        tags: [],
        street_name: activityType === 'door_knock' || activityType === 'phone_call' ? recommendedStreet : undefined,
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
      toast.success('Activities logged successfully');
    } catch (err: any) {
      console.error('Submit activities error:', err);
      toast.error(`Failed to log activities: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!editingActivity || !user) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('agent_activities')
        .update({
          notes: editNotes,
          tags: editTags,
          property_id: editPropertyId,
          street_name: editStreetName,
        })
        .eq('id', editingActivity.id)
        .eq('agent_id', user.id);

      if (error) throw error;

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setEditingActivity(null);
        setEditNotes('');
        setEditTags([]);
        setEditStreetName(undefined);
        if (editPropertyId && editPropertyId !== editingActivity.property_id) {
          predictProperty(editPropertyId);
        }
        setEditPropertyId(undefined);
        fetchActivities();
      }, 1500);
      toast.success('Activity updated successfully');
    } catch (err: any) {
      console.error('Edit activity error:', err);
      toast.error(`Failed to update activity: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const getSuggestions = (type: ActivityType) => {
    const pastActivities = activities.filter((a) => a.activity_type === type);
    const noteSuggestions = Array.from(new Set(pastActivities.map((a) => a.notes).filter(Boolean))).slice(0, 3);
    const tagSuggestions = Array.from(
      new Set(pastActivities.flatMap((a) => a.tags || []).filter(Boolean))
    ).slice(0, 5);
    return { noteSuggestions, tagSuggestions };
  };

  const startVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window)) {
      toast.error('Speech recognition not supported in this browser');
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
      toast.error('Speech recognition error');
    };

    recognition.start();
  };

  const applyPreset = (preset: string) => {
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

  if (!profile || (profile.role !== 'agent' && profile.role !== 'admin')) {
    return <div className="p-4 text-center text-red-600">Access denied. Agents or Admins only.</div>;
  }

  if (loading) {
    return <div className="p-4 text-center">Loading...</div>;
  }

  if (!marketingPlan && profile.role === 'agent') {
    return (
      <div className="max-w-4xl mx-auto p-4 text-center">
        <h1 className="text-3xl font-bold mb-6">Agent Reports</h1>
        <div className="bg-red-100 p-6 rounded-lg shadow-md">
          <p className="text-red-600 text-lg font-semibold">
            Please create a marketing plan before logging activities.
          </p>
          <button
            onClick={() => navigate('/marketing-plan')}
            className="mt-4 py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Create Marketing Plan
          </button>
        </div>
      </div>
    );
  }

  const sections = [
    { type: 'phone_call', label: 'Phone Calls', icon: <Phone />, color: 'bg-blue-500' },
    { type: 'client_meeting', label: 'Client Meetings', icon: <Users />, color: 'bg-green-500' },
    { type: 'door_knock', label: 'Door Knocks', icon: <DoorClosed />, color: 'bg-yellow-500' },
    { type: 'connection', label: 'Connections', icon: <LinkIcon />, color: 'bg-orange-500' },
  ] as const;

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">
        Agent Reports {agentId && agentName ? `for ${agentName}` : ''}
      </h1>

      {notifications.length > 0 && (
        <div className="bg-yellow-100 p-4 rounded-lg mb-4 flex items-center">
          <Bell className="w-5 h-5 text-yellow-600 mr-2" />
          <p>{notifications[0]}</p>
        </div>
      )}

      {recommendedStreet && (
        <div className="bg-blue-100 p-4 rounded-lg mb-4 flex items-center">
          <p className="text-blue-600">
            Recommended Street: <strong>{recommendedStreet}</strong> (Suburb: {marketingPlan?.suburb || 'N/A'})
          </p>
        </div>
      )}

      {profile.role === 'agent' && (
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
                placeholder={
                  section.type === 'door_knock' || section.type === 'phone_call'
                    ? `Log ${section.label.toLowerCase()} for ${recommendedStreet || 'a street'}...`
                    : `Log ${section.label.toLowerCase()}...`
                }
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
      )}

      {editingActivity && profile.role === 'agent' && (
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
              <label className="block text-gray-700 mb-2">Notes</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Update notes..."
                className="w-full p-3 border rounded focus:ring-2 focus:ring-blue-500 resize-none"
                rows={3}
              />
              <div className="mt-1 text-sm text-gray-500">
                Suggestions:{' '}
                {getSuggestions(editingActivity.activity_type).noteSuggestions.map((suggestion) => (
                  <span
                    key={suggestion}
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => setEditNotes(suggestion!)}
                  >
                    {suggestion} |{' '}
                  </span>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-gray-700 mb-2">Tags</label>
              <input
                type="text"
                value={editTags.join(', ')}
                onChange={(e) => setEditTags(e.target.value.split(',').map((tag) => tag.trim()))}
                placeholder="e.g., follow-up, urgent"
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
              />
              <div className="mt-1 text-sm text-gray-500">
                Suggestions:{' '}
                {getSuggestions(editingActivity.activity_type).tagSuggestions.map((tag) => (
                  <span
                    key={tag}
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => setEditTags((prev) => [...prev, tag])}
                  >
                    {tag} |{' '}
                  </span>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-gray-700 mb-2">Street Name</label>
              <select
                value={editStreetName || ''}
                onChange={(e) => setEditStreetName(e.target.value || undefined)}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No street selected</option>
                {marketingPlan &&
                  [
                    ...marketingPlan.door_knock_streets.map((s) => s.name),
                    ...marketingPlan.phone_call_streets.map((s) => s.name),
                  ].map((street) => (
                    <option key={street} value={street}>
                      {street}
                    </option>
                  ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-gray-700 mb-2">Link to Property</label>
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
                    {property.features?.length ? ` - ${property.features.join(', ')}` : ''}
                  </option>
                ))}
              </select>
              {editPropertyId && (
                <div className="mt-2">
                  <span
                    className="inline-block px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm cursor-pointer"
                    onClick={() => setEditPropertyId(undefined)}
                  >
                    {properties.find((p) => p.id === editPropertyId)?.name} -{' '}
                    {properties.find((p) => p.id === editPropertyId)?.property_type}
                    {properties.find((p) => p.id === editPropertyId)?.street_name
                      ? ` (${properties.find((p) => p.id === editPropertyId)?.street_name})`
                      : ''}
                    {properties.find((p) => p.id === editPropertyId)?.features?.length
                      ? ` [${properties.find((p) => p.id === editPropertyId)?.features?.join(', ')}]`
                      : ''}{' '}
                    ✕
                  </span>
                </div>
              )}
            </div>

            <div className="mb-4">
              <p className="text-sm font-medium mb-2">Related Activities</p>
              <div className="max-h-32 overflow-y-auto">
                {activities
                  .filter((a) => a.activity_type === editingActivity.activity_type && a.id !== editingActivity.id)
                  .slice(0, 5)
                  .map((a) => (
                    <div key={a.id} className="text-sm text-gray-600 mb-1">
                      <span>{new Date(a.activity_date).toLocaleDateString()}:</span> {a.notes || 'No notes'}
                    </div>
                  ))}
              </div>
            </div>

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

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Recent Activities</h2>
        {activities.length > 0 ? (
          <div className="space-y-4">
            {activities.slice(0, 10).map((activity) => {
              const linkedProperty = properties.find((p) => p.id === activity.property_id);
              return (
                <div key={activity.id} className="bg-white p-4 rounded-lg shadow-md flex justify-between items-center">
                  <div>
                    <p className="font-semibold capitalize">{activity.activity_type.replace('_', ' ')}</p>
                    <p className="text-gray-600">{activity.notes || 'No notes'}</p>
                    {activity.street_name && (
                      <p className="text-sm text-gray-500">Street: {activity.street_name}</p>
                    )}
                    {linkedProperty && (
                      <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm mt-1">
                        {linkedProperty.name} - {linkedProperty.property_type}
                        {linkedProperty.street_name ? ` (${linkedProperty.street_name})` : ''}
                        {linkedProperty.features?.length ? ` [${linkedProperty.features.join(', ')}]` : ''}
                      </span>
                    )}
                    <p className="text-sm text-gray-500">
                      {new Date(activity.activity_date).toLocaleString()}
                      {activity.tags?.length ? ` | Tags: ${activity.tags.join(', ')}` : ''}
                    </p>
                  </div>
                  {profile.role === 'agent' && (
                    <button
                      onClick={() => {
                        setEditingActivity(activity);
                        setEditNotes(activity.notes || '');
                        setEditTags(activity.tags || []);
                        setEditPropertyId(activity.property_id);
                        setEditStreetName(activity.street_name);
                      }}
                      className="p-2 text-blue-500 hover:text-blue-700"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-center">No activities found.</p>
        )}
      </div>
    </div>
  );
}