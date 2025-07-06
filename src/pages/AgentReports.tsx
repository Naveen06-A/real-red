import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { Phone, Users, DoorClosed, Link as LinkIcon, CheckCircle, Edit2, Mic, Building, Bell, ArrowRight, BrainCircuit, Calendar, Tag, Home, MapPin, Download, Search } from 'lucide-react';
import * as tf from '@tensorflow/tfjs';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import nlp from 'compromise';
import Sentiment from 'sentiment';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { FixedSizeList as List } from 'react-window';
import Dexie from 'dexie';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { motion, AnimatePresence } from 'framer-motion';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type ActivityType = 'phone_call' | 'client_meeting' | 'door_knock' | 'connection' | 'desktop_appraisal' | 'in_person_appraisal';

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
  geo_location?: { lat: number; lng: number };
  client_name?: string;
  client_phone?: string;
  call_made?: boolean;
  call_picked?: boolean;
  knocks_made?: number;
  knocks_answered?: number;
  appraisal_feedback?: string;
}

interface FormData {
  phone_call: string;
  client_meeting: string;
  door_knock: string;
  connection: string;
  desktop_appraisal: string;
  in_person_appraisal: string;
}

interface EditForm {
  notes: string;
  tags: string[];
  property_id?: string;
  street_name?: string;
  client_name?: string;
  client_phone?: string;
  call_made?: boolean;
  call_picked?: boolean;
  knocks_made?: number;
  knocks_answered?: number;
  appraisal_feedback?: string;
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
  agent_id: string;
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

const sentiment = new Sentiment();

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
    desktop_appraisal: '',
    in_person_appraisal: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ notes: '', tags: [] });
  const [isRecording, setIsRecording] = useState(false);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [showPrediction, setShowPrediction] = useState(false);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [marketingPlan, setMarketingPlan] = useState<MarketingPlan | null>(null);
  const [recommendedStreet, setRecommendedStreet] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [showChart, setShowChart] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [geoLocation, setGeoLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [comments, setComments] = useState<{ [activityId: string]: string[] }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<ActivityType | ''>('');
  const [filterTags, setFilterTags] = useState<string[]>([]);

  const db = new Dexie('AgentActivities');
  db.version(1).stores({ activities: '++id,agent_id,activity_type,notes,activity_date,street_name,geo_location,client_name,client_phone,call_made,call_picked,knocks_made,knocks_answered,appraisal_feedback' });

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
          if (error) {
            console.error('Agent name fetch error:', error);
            toast.error('Failed to fetch agent name');
            setAgentName('Unknown Agent');
          } else {
            setAgentName(data?.name || 'Unknown Agent');
          }
        });
    } else {
      setAgentId(null);
      setAgentName(null);
    }
  }, [location.search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchMarketingPlan(),
        fetchActivities(),
        fetchProperties(),
        fetchComments(),
      ]);
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error('An error occurred while fetching data');
    } finally {
      setLoading(false);
    }
  }, [agentId, user]);

  useEffect(() => {
    if (!user && !agentId) {
      setLoading(false);
      toast.error('No user or agent ID provided');
      return;
    }

    fetchData();
    checkRealTimeNotifications();

    const channel = supabase
      .channel('agent_activities_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agent_activities', filter: `agent_id=eq.${agentId || user?.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setActivities((prev) => [payload.new, ...prev]);
            toast.info(`New activity added by ${payload.new.agent_id}`);
          } else if (payload.eventType === 'UPDATE') {
            setActivities((prev) =>
              prev.map((a) => (a.id === payload.new.id ? payload.new : a))
            );
          } else if (payload.eventType === 'DELETE') {
            setActivities((prev) => prev.filter((a) => a.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    const syncOfflineActivities = async () => {
      if (navigator.onLine) {
        const offlineActivities = await db.activities.toArray();
        if (offlineActivities.length > 0) {
          await supabase.from('agent_activities').insert(offlineActivities);
          await db.activities.clear();
          toast.success('Offline activities synced.');
          fetchActivities();
        }
      }
    };
    window.addEventListener('online', syncOfflineActivities);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('online', syncOfflineActivities);
    };
  }, [user, agentId, fetchData]);

  const fetchMarketingPlan = async () => {
    try {
      const { data, error } = await supabase
        .from('marketing_plans')
        .select('*')
        .eq('agent_id', agentId || user?.id)
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
          setRecommendedStreet(allStreets[Math.floor(Math.random() * allStreets.length)]);
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
      let query = supabase
        .from('agent_activities')
        .select('*')
        .eq('agent_id', agentId || user?.id)
        .order('activity_date', { ascending: false });

      if (searchQuery.trim()) {
        query = query.or(
          `notes.ilike.%${searchQuery.trim()}%,client_name.ilike.%${searchQuery.trim()}%,street_name.ilike.%${searchQuery.trim()}%`
        );
      }
      if (filterType) {
        query = query.eq('activity_type', filterType);
      }
      if (filterTags.length > 0) {
        query = query.contains('tags', filterTags);
      }

      const { data, error } = await query;
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
        .eq('agent_id', agentId || user?.id);
      if (error) throw error;
      setProperties(data || []);
    } catch (err) {
      console.error('Fetch properties error:', err);
      toast.error('Failed to fetch properties');
    }
  };

  const fetchComments = async () => {
    try {
      const { data: tableExists } = await supabase.rpc('table_exists', { table_name: 'activity_comments' });
      if (!tableExists) {
        console.warn('activity_comments table does not exist');
        setComments({});
        return;
      }

      const { data, error } = await supabase
        .from('activity_comments')
        .select('activity_id, comment')
        .eq('user_id', agentId || user?.id);
      if (error) throw error;
      const commentsByActivity = data.reduce((acc, { activity_id, comment }) => ({
        ...acc,
        [activity_id]: [...(acc[activity_id] || []), comment],
      }), {});
      setComments(commentsByActivity);
    } catch (err) {
      console.error('Fetch comments error:', err);
      toast.error('Failed to fetch comments');
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

  const syncWithCRM = async (activity: Activity) => {
    const crmApiKey = localStorage.getItem('crmApiKey');
    if (!crmApiKey) return;

    try {
      await fetch('https://api.crm.com/activities', {
        method: 'POST',
        headers: { Authorization: `Bearer ${crmApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: activity.activity_type,
          notes: activity.notes,
          date: activity.activity_date,
          client_name: activity.client_name,
          client_phone: activity.client_phone,
          call_made: activity.call_made,
          call_picked: activity.call_picked,
          knocks_made: activity.knocks_made,
          knocks_answered: activity.knocks_answered,
          appraisal_feedback: activity.appraisal_feedback,
        }),
      });
      toast.success('Activity synced with CRM.');
    } catch (error) {
      toast.error('Failed to sync with CRM.');
    }
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
        geo_location: activityType === 'door_knock' && geoLocation ? geoLocation : undefined,
        client_name: activityType === 'phone_call' || activityType === 'client_meeting' || activityType === 'in_person_appraisal' ? formData[activityType] : undefined,
        client_phone: activityType === 'phone_call' ? formData[activityType] : undefined,
        call_made: activityType === 'phone_call' ? true : undefined,
        call_picked: activityType === 'phone_call' ? Math.random() > 0.5 : undefined,
        knocks_made: activityType === 'door_knock' ? 1 : undefined,
        knocks_answered: activityType === 'door_knock' ? Math.random() > 0.5 ? 1 : 0 : undefined,
        appraisal_feedback: activityType === 'desktop_appraisal' || activityType === 'in_person_appraisal' ? notes : undefined,
      }));

    if (activitiesToSubmit.length === 0) return;

    setSubmitting(true);
    try {
      if (!navigator.onLine) {
        await db.activities.bulkAdd(activitiesToSubmit);
        toast.info('Activities saved offline, will sync when online.');
      } else {
        const { error } = await supabase.from('agent_activities').insert(activitiesToSubmit);
        if (error) throw error;
        activitiesToSubmit.forEach(syncWithCRM);
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setFormData({
          phone_call: '',
          client_meeting: '',
          door_knock: '',
          connection: '',
          desktop_appraisal: '',
          in_person_appraisal: '',
        });
        setGeoLocation(null);
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
          notes: editForm.notes,
          tags: editForm.tags,
          property_id: editForm.property_id,
          street_name: editForm.street_name,
          client_name: editForm.client_name,
          client_phone: editForm.client_phone,
          call_made: editForm.call_made,
          call_picked: editForm.call_picked,
          knocks_made: editForm.knocks_made,
          knocks_answered: editForm.knocks_answered,
          appraisal_feedback: editForm.appraisal_feedback,
        })
        .eq('id', editingActivity.id)
        .eq('agent_id', user.id);

      if (error) throw error;

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setEditingActivity(null);
        setEditForm({ notes: '', tags: [] });
        if (editForm.property_id && editForm.property_id !== editingActivity.property_id) {
          predictProperty(editForm.property_id);
        }
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

  const getSmartSuggestions = (notes: string, type: ActivityType) => {
    const doc = nlp(notes);
    const verbs = doc.verbs().out('array');
    const nouns = doc.nouns().out('array');
    const suggestions = [];

    if (type === 'phone_call' && verbs.includes('schedule')) {
      suggestions.push('Schedule follow-up call next week.');
    }
    if (nouns.includes('appraisal')) {
      suggestions.push('Link to property for appraisal.');
    }
    if (type === 'door_knock' && nouns.includes('interest')) {
      suggestions.push('Follow up with interested resident.');
    }
    if (type === 'desktop_appraisal' || type === 'in_person_appraisal') {
      suggestions.push('Provide detailed feedback for appraisal.');
    }
    return suggestions.slice(0, 3);
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
      setEditForm((prev) => ({ ...prev, notes: prev.notes + ' ' + transcript }));
      const sentimentResult = sentiment.analyze(transcript);
      if (sentimentResult.score < 0) {
        setEditForm((prev) => ({ ...prev, tags: [...prev.tags, 'needs-follow-up'] }));
        toast.info('Negative sentiment detected, tagged for follow-up.');
      }
    };
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
      toast.error('Speech recognition error');
    };

    recognition.start();
  };

  const applyPreset = (preset: string) => {
    const presets: Record<string, Partial<EditForm>> = {
      'Follow-up scheduled': { notes: 'Follow-up scheduled', tags: ['follow-up'] },
      'Completed': { notes: 'Completed', tags: ['done'] },
      'Pending': { notes: 'Pending', tags: ['pending'] },
      'Appraisal Feedback': { notes: 'Appraisal completed', tags: ['appraisal'], appraisal_feedback: 'Positive feedback received' },
    };
    setEditForm((prev) => ({ ...prev, ...presets[preset] }));
  };

  const getGeoLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (position) => setGeoLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => toast.error('Failed to get location')
    );
  };

  const addComment = async (activityId: string, comment: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('activity_comments')
        .insert({ activity_id: activityId, comment, user_id: user.id });
      if (!error) {
        setComments((prev) => ({
          ...prev,
          [activityId]: [...(prev[activityId] || []), comment],
        }));
      }
    } catch (err) {
      console.error('Add comment error:', err);
      toast.error('Failed to add comment');
    }
  };

  const checkRealTimeNotifications = () => {
    const overdueActivities = activities.filter(
      (a) => new Date(a.activity_date) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );
    if (overdueActivities.length > 0) {
      setNotifications([`You have ${overdueActivities.length} activities overdue.`]);
    }
  };

  const exportToCSV = () => {
    try {
      const headers = [
        'Activity Type',
        'Date',
        'Notes',
        'Client Name',
        'Client Phone',
        'Call Made',
        'Call Picked',
        'Knocks Made',
        'Knocks Answered',
        'Appraisal Feedback',
        'Street Name',
        'Property ID',
        'Tags',
      ];
      const rows = activities.map((a) => [
        a.activity_type.replace('_', ' '),
        new Date(a.activity_date).toLocaleString(),
        `"${a.notes || 'N/A'}"`,
        `"${a.client_name || 'N/A'}"`,
        `"${a.client_phone || 'N/A'}"`,
        a.call_made != null ? a.call_made.toString() : 'N/A',
        a.call_picked != null ? a.call_picked.toString() : 'N/A',
        a.knocks_made != null ? a.knocks_made.toString() : 'N/A',
        a.knocks_answered != null ? a.knocks_answered.toString() : 'N/A',
        `"${a.appraisal_feedback || 'N/A'}"`,
        `"${a.street_name || 'N/A'}"`,
        `"${a.property_id || 'N/A'}"`,
        `"${a.tags?.join(', ') || 'N/A'}"`,
      ]);
      const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `agent_activities_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('CSV exported successfully!');
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast.error('Failed to export CSV');
    }
  };

  const progress = marketingPlan
    ? {
        door_knocks: (activities.filter((a) => a.activity_type === 'door_knock').length /
          parseInt(marketingPlan.target_knocks || '1')) * 100,
        phone_calls: (activities.filter((a) => a.activity_type === 'phone_call').length /
          parseInt(marketingPlan.target_calls || '1')) * 100,
        connections: (activities.filter((a) => a.activity_type === 'connection').length /
          parseInt(marketingPlan.target_connects || '1')) * 100,
        desktop_appraisals: (activities.filter((a) => a.activity_type === 'desktop_appraisal').length /
          parseInt(marketingPlan.target_desktop_appraisals || '1')) * 100,
        in_person_appraisals: (activities.filter((a) => a.activity_type === 'in_person_appraisal').length /
          parseInt(marketingPlan.target_face_to_face_appraisals || '1')) * 100,
      }
    : {
        door_knocks: 0,
        phone_calls: 0,
        connections: 0,
        desktop_appraisals: 0,
        in_person_appraisals: 0,
      };

  const sections = [
    { type: 'phone_call', label: 'Phone Calls', icon: <Phone />, color: 'bg-blue-500' },
    { type: 'client_meeting', label: 'Client Meetings', icon: <Users />, color: 'bg-green-500' },
    { type: 'door_knock', label: 'Door Knocks', icon: <DoorClosed />, color: 'bg-yellow-500' },
    { type: 'connection', label: 'Connections', icon: <LinkIcon />, color: 'bg-orange-500' },
    { type: 'desktop_appraisal', label: 'Desktop Appraisals', icon: <Building />, color: 'bg-purple-500' },
    { type: 'in_person_appraisal', label: 'In-Person Appraisals', icon: <Home />, color: 'bg-teal-500' },
  ] as const;

  const ActivityRow = ({ index, style }: { index: number; style: any }) => {
    const activity = activities[index];
    const linkedProperty = properties.find((p) => p.id === activity.property_id);
    return (
      <div style={style} className="bg-white p-4 rounded-lg shadow-md flex justify-between items-center">
        <div>
          <p className="font-semibold capitalize">{activity.activity_type.replace('_', ' ')}</p>
          <p className="text-gray-600">{activity.notes || 'No notes'}</p>
          {activity.client_name && (
            <p className="text-sm text-gray-500">Client: {activity.client_name}</p>
          )}
          {activity.client_phone && (
            <p className="text-sm text-gray-500">Phone: {activity.client_phone}</p>
          )}
          {activity.activity_type === 'phone_call' && (
            <p className="text-sm text-gray-500">
              Call Status: {activity.call_made ? 'Made' : 'Not Made'}, {activity.call_picked ? 'Picked' : 'Not Picked'}
            </p>
          )}
          {activity.activity_type === 'door_knock' && (
            <p className="text-sm text-gray-500">
              Knocks: {activity.knocks_made || 0} made, {activity.knocks_answered || 0} answered
            </p>
          )}
          {activity.appraisal_feedback && (
            <p className="text-sm text-gray-500">Feedback: {activity.appraisal_feedback}</p>
          )}
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
          <div className="mt-2">
            {comments[activity.id]?.map((c, i) => (
              <p key={i} className="text-sm text-gray-500">{c}</p>
            ))}
            <input
              type="text"
              placeholder="Add a comment..."
              onKeyDown={(e: any) => {
                if (e.key === 'Enter' && e.target.value.trim()) {
                  addComment(activity.id, e.target.value.trim());
                  e.target.value = '';
                }
              }}
              className="w-full p-1 text-sm border rounded focus:ring-2 focus:ring-blue-500"
              aria-label="Add comment"
            />
          </div>
        </div>
        {profile?.role === 'agent' && (
          <button
            onClick={() => {
              setEditingActivity(activity);
              setEditForm({
                notes: activity.notes || '',
                tags: activity.tags || [],
                property_id: activity.property_id,
                street_name: activity.street_name,
                client_name: activity.client_name,
                client_phone: activity.client_phone,
                call_made: activity.call_made,
                call_picked: activity.call_picked,
                knocks_made: activity.knocks_made,
                knocks_answered: activity.knocks_answered,
                appraisal_feedback: activity.appraisal_feedback,
              });
            }}
            className="p-2 text-blue-500 hover:text-blue-700"
            aria-label="Edit activity"
          >
            <Edit2 className="w-5 h-5" />
          </button>
        )}
      </div>
    );
  };

  if (!profile || (profile.role !== 'agent' && profile.role !== 'admin')) {
    return <div className="p-4 text-center text-red-600">Access denied. Agents or Admins only.</div>;
  }

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!marketingPlan && profile.role === 'agent' && !agentId) {
    return (
      <div className="max-w-4xl mx-auto p-4 text-center">
        <h1 className="text-3xl font-bold mb-6">Agent Reports</h1>
        <div className="bg-red-100 p-6 rounded-lg shadow-md">
          <p className="text-red-600 text-lg font-semibold">
            Please create a marketing plan before logging activities.
          </p>
          <button
            onClick={() => navigate('/marketing-plan')}
            className="mt-4 py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center justify-center"
          >
            <ArrowRight className="w-5 h-5 mr-2" />
            Create Marketing Plan
          </button>
        </div>
      </div>
    );
  }

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

      {marketingPlan && (
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Marketing Plan Progress</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(progress).map(([key, value]) => (
              <div key={key} className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium capitalize">{key.replace('_', ' ')}</h4>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                  <div
                    className="bg-blue-500 h-2.5 rounded-full"
                    style={{ width: `${Math.min(value, 100)}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600">{value.toFixed(1)}% of target achieved</p>
                {value >= 100 && (
                  <p className="text-green-600 font-semibold">🎉 Goal Achieved!</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center gap-4">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              fetchActivities();
            }}
            placeholder="Search by notes, client name, or street..."
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => {
            setFilterType(e.target.value as ActivityType | '');
            fetchActivities();
          }}
          className="p-2 border rounded-lg"
        >
          <option value="">All Activities</option>
          {sections.map((section) => (
            <option key={section.type} value={section.type}>{section.label}</option>
          ))}
        </select>
        <input
          type="text"
          value={filterTags.join(', ')}
          onChange={(e) => {
            setFilterTags(e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean));
            fetchActivities();
          }}
          placeholder="Filter by tags (e.g., follow-up, urgent)"
          className="p-2 border rounded-lg"
        />
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
        >
          <Download className="w-5 h-5" /> Export CSV
        </button>
      </div>

      <button
        onClick={() => setShowChart(!showChart)}
        className="mb-4 py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        {showChart ? 'Hide Trends' : 'Show Activity Trends'}
      </button>
      {showChart && (
        <div className="mb-8">
          <Bar
            data={{
              labels: sections.map((s) => s.label),
              datasets: [
                {
                  label: 'Activities Last 30 Days',
                  data: sections.map(
                    (s) =>
                      activities.filter(
                        (a) =>
                          a.activity_type === s.type &&
                          new Date(a.activity_date) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                      ).length
                  ),
                  backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#f97316', '#8b5cf6', '#14b8a6'],
                  borderColor: ['#1e40af', '#065f46', '#b45309', '#c2410c', '#6d28d9', '#0f766e'],
                  borderWidth: 1,
                },
              ],
            }}
            options={{
              responsive: true,
              scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Number of Activities' } },
                x: { title: { display: true, text: 'Activity Type' } },
              },
              plugins: {
                legend: { display: true },
                title: { display: true, text: 'Agent Activity Trends' },
              },
            }}
          />
        </div>
      )}

      <button
        onClick={() => setShowMap(!showMap)}
        className="mb-4 py-2 px-4 bg-green-500 text-white rounded hover:bg-green-600"
      >
        {showMap ? 'Hide Map' : 'Show Door Knock Map'}
      </button>
      {showMap && (
        <MapContainer center={[-33.8688, 151.2093]} zoom={13} style={{ height: '400px', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {activities
            .filter((a) => a.activity_type === 'door_knock' && a.geo_location)
            .map((a) => (
              <Marker key={a.id} position={[a.geo_location!.lat, a.geo_location!.lng]}>
                <Popup>{a.notes || 'Door Knock'} - {a.client_name || 'No client'}</Popup>
              </Marker>
            ))}
        </MapContainer>
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
                aria-label={`Enter notes for ${section.label}`}
              />
              {section.type === 'door_knock' && (
                <button
                  onClick={getGeoLocation}
                  className="mt-2 text-sm text-blue-600 hover:underline"
                  aria-label="Tag current location"
                >
                  Tag Current Location
                </button>
              )}
              <div className="mt-2">
                {getSmartSuggestions(formData[section.type], section.type).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setFormData({ ...formData, [section.type]: s })}
                    className="text-sm text-blue-600 hover:underline mr-2"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button
            onClick={handleSubmit}
            disabled={submitting || !Object.values(formData).some((notes) => notes.trim())}
            className="md:col-span-2 mt-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
            aria-label="Log all activities"
          >
            {submitting ? 'Logging...' : 'Log All Activities'}
          </button>
          <AnimatePresence>
            {success && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 rounded-lg"
              >
                <CheckCircle className="w-12 h-12 text-green-500 animate-bounce" />
              </motion.div>
            )}
          </AnimatePresence>
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
                aria-label="Record notes"
              >
                <Mic className="w-5 h-5" />
              </button>
              <div className="flex gap-2">
                {['Follow-up scheduled', 'Completed', 'Pending', 'Appraisal Feedback'].map((preset) => (
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
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Update notes..."
                className="w-full p-3 border rounded focus:ring-2 focus:ring-blue-500 resize-none"
                rows={3}
                aria-label="Update notes"
              />
            </div>

            <div className="mb-4">
              <label className="block text-gray-700 mb-2 flex items-center"><Tag className="w-4 h-4 mr-2" />Tags</label>
              <input
                type="text"
                value={editForm.tags.join(', ')}
                onChange={(e) => setEditForm({ ...editForm, tags: e.target.value.split(',').map((tag) => tag.trim()) })}
                placeholder="e.g., follow-up, urgent"
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                aria-label="Enter tags"
              />
            </div>

            <div className="mb-4">
              <label className="block text-gray-700 mb-2 flex items-center"><MapPin className="w-4 h-4 mr-2" />Street Name</label>
              <select
                value={editForm.street_name || ''}
                onChange={(e) => setEditForm({ ...editForm, street_name: e.target.value || undefined })}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                aria-label="Select street name"
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
              <label className="block text-gray-700 mb-2 flex items-center"><Home className="w-4 h-4 mr-2" />Link to Property</label>
              <select
                value={editForm.property_id || ''}
                onChange={(e) => setEditForm({ ...editForm, property_id: e.target.value || undefined })}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                aria-label="Link to property"
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

            {(editingActivity.activity_type === 'phone_call' || editingActivity.activity_type === 'client_meeting' || editingActivity.activity_type === 'in_person_appraisal') && (
              <div className="mb-4">
                <label className="block text-gray-700 mb-2 flex items-center"><Users className="w-4 h-4 mr-2" />Client Name</label>
                <input
                  type="text"
                  value={editForm.client_name || ''}
                  onChange={(e) => setEditForm({ ...editForm, client_name

: e.target.value })}
                  placeholder="Enter client name"
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                  aria-label="Enter client name"
                />
              </div>
            )}

            {editingActivity.activity_type === 'phone_call' && (
              <>
                <div className="mb-4">
                  <label className="block text-gray-700 mb-2 flex items-center"><Phone className="w-4 h-4 mr-2" />Client Phone</label>
                  <input
                    type="text"
                    value={editForm.client_phone || ''}
                    onChange={(e) => setEditForm({ ...editForm, client_phone: e.target.value })}
                    placeholder="Enter client phone"
                    className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                    aria-label="Enter client phone"
                  />
                </div>
                <div className="mb-4 flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={editForm.call_made || false}
                      onChange={(e) => setEditForm({ ...editForm, call_made: e.target.checked })}
                      className="mr-2"
                    />
                    Call Made
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={editForm.call_picked || false}
                      onChange={(e) => setEditForm({ ...editForm, call_picked: e.target.checked })}
                      className="mr-2"
                    />
                    Call Picked
                  </label>
                </div>
              </>
            )}

            {editingActivity.activity_type === 'door_knock' && (
              <div className="mb-4 flex gap-4">
                <div>
                  <label className="block text-gray-700 mb-2 flex items-center"><DoorClosed className="w-4 h-4 mr-2" />Knocks Made</label>
                  <input
                    type="number"
                    value={editForm.knocks_made || 0}
                    onChange={(e) => setEditForm({ ...editForm, knocks_made: parseInt(e.target.value) || 0 })}
                    className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                    min="0"
                    aria-label="Enter knocks made"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 mb-2 flex items-center"><DoorClosed className="w-4 h-4 mr-2" />Knocks Answered</label>
                  <input
                    type="number"
                    value={editForm.knocks_answered || 0}
                    onChange={(e) => setEditForm({ ...editForm, knocks_answered: parseInt(e.target.value) || 0 })}
                    className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                    min="0"
                    aria-label="Enter knocks answered"
                  />
                </div>
              </div>
            )}

            {(editingActivity.activity_type === 'desktop_appraisal' || editingActivity.activity_type === 'in_person_appraisal') && (
              <div className="mb-4">
                <label className="block text-gray-700 mb-2 flex items-center"><Building className="w-4 h-4 mr-2" />Appraisal Feedback</label>
                <textarea
                  value={editForm.appraisal_feedback || ''}
                  onChange={(e) => setEditForm({ ...editForm, appraisal_feedback: e.target.value })}
                  placeholder="Enter appraisal feedback..."
                  className="w-full p-3 border rounded focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={3}
                  aria-label="Enter appraisal feedback"
                />
              </div>
            )}

            <div className="mb-4">
              <p className="text-sm font-medium mb-2 flex items-center"><Calendar className="w-4 h-4 mr-2" />Related Activities</p>
              <div className="max-h-32 overflow-y-auto">
                {activities
                  .filter((a) => a.activity_type === editingActivity.activity_type && a.id !== editingActivity.id)
                  .slice(0, 5)
                  .map((a) => (
                    <div key={a.id} className="text-sm text-gray-600 mb-1 flex items-center">
                      <Calendar className="w-3 h-3 mr-2" />
                      <span>{new Date(a.activity_date).toLocaleDateString()}:</span> {a.notes || 'No notes'} ({a.client_name || 'No client'})
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
                aria-label="Save changes"
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPrediction && prediction && editForm.property_id && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md transform transition-all duration-300 scale-100 hover:scale-105">
            <div className="flex items-center mb-4">
              <BrainCircuit className="w-6 h-6 text-blue-600 mr-2" />
              <h2 className="text-xl font-semibold">
                AI Prediction for {properties.find((p) => p.id === editForm.property_id)?.name}
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
              aria-label="Close prediction"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Recent Activities</h2>
        {activities.length > 0 ? (
          <List
            height={400}
            itemCount={activities.length}
            itemSize={160}
            width="100%"
          >
            {ActivityRow}
          </List>
        ) : (
          <p className="text-center">No activities found.</p>
        )}
      </div>
    </div>
  );
}