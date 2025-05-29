
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { Trash2, Bell, UserPlus, X, Search, Download } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import { Link } from 'react-router-dom';
import { debounce } from 'lodash';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';
import * as tf from '@tensorflow/tfjs';

interface Agent {
  id: string;
  agent_id: string;
  email: string;
  role: string;
  permissions: {
    canRegisterProperties: boolean;
    canEditProperties: boolean;
    canDeleteProperties: boolean;
  };
}

interface Profile {
  id: string;
  email: string;
  role: string;
  agent_id?: string;
  permissions?: {
    canRegisterProperties: boolean;
    canEditProperties: boolean;
    canDeleteProperties: boolean;
  };
}

type ActivityType = 'phone_call' | 'client_meeting' | 'door_knock' | 'connection';

interface Activity {
  id: string;
  agent_id: string;
  activity_type: ActivityType;
  activity_date: string;
  notes?: string;
  tags?: string[];
  property_id?: string;
}

interface Property {
  id: string;
  property_type?: string | null;
  price?: number | null;
  name?: string | null;
  street_name?: string | null;
  features?: string[] | null;
}

interface PerformanceMetrics {
  weeklyTrend: number;
  topActivity: ActivityType | null;
  activityEfficiency: Record<ActivityType, number>;
}

interface PredictionResult {
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number | null;
  trend: number;
  estimatedValue?: number | null;
}

export function AdminDashboard() {
  const { profile, fetchProfile } = useAuthStore();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [newAgent, setNewAgent] = useState({
    email: '',
    canRegisterProperties: false,
    canEditProperties: false,
    canDeleteProperties: false,
  });
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'management' | 'reports'>('management');
  const [searchQuery, setSearchQuery] = useState('');
  const [predictions, setPredictions] = useState<Record<string, PredictionResult | null>>({});
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchAttempts, setFetchAttempts] = useState(0);
  const MAX_FETCH_ATTEMPTS = 3;

  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('Starting loadData at', new Date().toISOString());
        await fetchProfile();
        if (profile?.email) {
          await Promise.all([
            fetchAgents(),
            fetchActivities(),
            fetchProperties(),
          ]);
          setupRealtime();
        } else {
          setProfileError('No email found in profile');
        }
      } catch (error: any) {
        console.error('Profile load error:', error);
        setProfileError(error.message || 'Failed to load profile');
        toast.error(error.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [profile, fetchProfile]);

  const setupRealtime = () => {
    const profileChannel = supabase
      .channel('admin-notifications-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: 'role=eq.agent' }, (payload) => {
        const message = `Profile ${payload.eventType}: ${payload.new?.email || 'Unknown'}`;
        setNotifications((prev) => [...prev, message]);
        toast.success(message, {
          duration: 4000,
          position: 'top-right',
          style: { background: '#10B981', color: '#fff', borderRadius: '8px' },
        });
      })
      .subscribe();

    const activityChannel = supabase
      .channel('admin-notifications-activities')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_activities' }, (payload) => {
        const message = `New activity by agent ${payload.new.agent_id}: ${payload.new.activity_type}`;
        setNotifications((prev) => [...prev, message]);
        toast.success(message, {
          duration: 4000,
          position: 'top-right',
          style: { background: '#10B981', color: '#fff', borderRadius: '8px' },
        });
        fetchActivities();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(activityChannel);
    };
  };

  const fetchAgents = async () => {
    try {
      console.log('Fetching agents');
      const { data, error } = await supabase
        .from('profiles')
        .select('id, agent_id, email, role, permissions')
        .eq('role', 'agent');
      if (error) throw new Error(`Failed to fetch agents: ${error.message}`);
      setAgents(data || []);
      return true;
    } catch (error: any) {
      console.error('Error fetching agents:', error);
      setAgents([]);
      toast.error(error.message || 'Failed to fetch agents');
      return false;
    }
  };

  const fetchActivities = async () => {
    try {
      console.log('Fetching activities');
      const { data, error } = await supabase
        .from('agent_activities')
        .select('*')
        .order('activity_date', { ascending: false });
      if (error) throw error;
      setActivities(data || []);
      return true;
    } catch (error: any) {
      console.error('Fetch activities error:', error);
      setActivities([]);
      toast.error(error.message || 'Failed to fetch activities');
      return false;
    }
  };

  const fetchProperties = useCallback(async () => {
    if (fetchAttempts >= MAX_FETCH_ATTEMPTS) {
      console.warn('Max fetch attempts reached for properties. Using mock data.');
      setProperties([
        { id: 'mock1' },
        { id: 'mock2' },
      ]);
      setFetchError('Failed to fetch properties. Using mock data.');
      toast.error('Using mock properties');
      return true;
    }

    try {
      console.log('Fetching properties with query: SELECT id FROM properties');
      setFetchAttempts((prev) => prev + 1);
      const { data, error } = await supabase
        .from('properties')
        .select('id');
      if (error) {
        console.error('Supabase error details:', error);
        throw new Error(`Failed to fetch properties: ${error.message} (Code: ${error.code})`);
      }
      console.log('Properties fetched:', data);
      setProperties(data || []);
      setFetchError(null);
      setFetchAttempts(0);
      return true;
    } catch (error: any) {
      console.error('Fetch properties error:', error);
      const errorMessage = error.message || 'Failed to fetch properties.';
      setFetchError(errorMessage);
      toast.error(errorMessage);
      return false;
    }
  }, [fetchAttempts]);

  const debouncedUpdatePermissions = useCallback(
    debounce(async (agentId: string, permissions: Agent['permissions']) => {
      try {
        console.log('Updating permissions for agent:', agentId);
        const { error } = await supabase
          .from('profiles')
          .update({ permissions })
          .eq('id', agentId);
        if (error) throw new Error(`Failed to update permissions: ${error.message}`);
        setAgents(agents.map((agent) => (agent.id === agentId ? { ...agent, permissions } : agent)));
        toast.success('Agent permissions updated successfully');
      } catch (error: any) {
        console.error('Error updating permissions:', error);
        toast.error(error.message || 'Failed to update permissions');
      }
    }, 500),
    [agents]
  );

  async function createAgent(e: React.FormEvent) {
    e.preventDefault();
    setIsCreatingAgent(true);
    try {
      console.log('Creating agent with email:', newAgent.email);
      if (!newAgent.email) throw new Error('Email is required');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newAgent.email)) throw new Error('Invalid email format');

      const response = await fetch('/supabase/functions/create-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newAgent.email,
          permissions: {
            canRegisterProperties: newAgent.canRegisterProperties,
            canEditProperties: newAgent.canEditProperties,
            canDeleteProperties: newAgent.canDeleteProperties,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Server error: ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) throw new Error(result.message || 'Failed to create agent');

      setAgents([...agents, {
        id: result.id || uuidv4(),
        agent_id: result.agent_id || `AGENT-${uuidv4().slice(0, 8)}`,
        email: newAgent.email,
        role: 'agent',
        permissions: {
          canRegisterProperties: newAgent.canRegisterProperties,
          canEditProperties: newAgent.canEditProperties,
          canDeleteProperties: newAgent.canDeleteProperties,
        },
      }]);
      toast.success(result.message || 'Agent created successfully');
      setShowAgentModal(false);
      setNewAgent({ email: '', canRegisterProperties: false, canEditProperties: false, canDeleteProperties: false });
    } catch (error: any) {
      console.error('Error creating agent:', error);
      toast.error(error.message || 'Failed to create agent');
    } finally {
      setIsCreatingAgent(false);
    }
  }

  async function deleteAgent(agentId: string) {
    try {
      console.log('Deleting agent:', agentId);
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', agentId)
        .eq('role', 'agent');
      if (error) throw new Error(`Failed to delete agent: ${error.message}`);
      setAgents(agents.filter((agent) => agent.id !== agentId));
      toast.success('Agent deleted successfully');
    } catch (error: any) {
      console.error('Error deleting agent:', error);
      toast.error(error.message || 'Failed to delete agent');
    }
  }

  async function analyzePriceTrend(propertyType: string | null, currentPrice: number | null): Promise<PredictionResult> {
    console.log('Analyzing price trend:', { propertyType, currentPrice });
    if (!currentPrice || !propertyType) {
      return {
        recommendation: 'HOLD',
        confidence: null,
        trend: 0,
        estimatedValue: null,
      };
    }

    try {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const { data: historicalData, error } = await supabase
        .from('property_history')
        .select('sale_date, price')
        .eq('property_type', propertyType)
        .gte('sale_date', oneYearAgo.toISOString())
        .order('sale_date', { ascending: true });

      if (error || !historicalData || historicalData.length === 0) {
        console.warn('No historical data:', error?.message);
        return {
          recommendation: 'HOLD',
          confidence: null,
          trend: 0,
          estimatedValue: null,
        };
      }

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
      const recommendation: 'BUY' | 'SELL' | 'HOLD' = slope > 5 ? 'BUY' : slope < -5 ? 'SELL' : 'HOLD';

      return {
        recommendation,
        confidence: Math.min(Math.abs(slope) * 2, 95),
        trend: slope,
        estimatedValue: currentPrice * (1 + slope / 100),
      };
    } catch (error) {
      console.error('Error analyzing price trend:', error);
      return {
        recommendation: 'HOLD',
        confidence: null,
        trend: 0,
        estimatedValue: null,
      };
    }
  }

  const calculatePerformanceMetrics = (agentActivities: Activity[]): PerformanceMetrics => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const recentActivities = agentActivities.filter((a) => a.activity_date && new Date(a.activity_date) >= oneWeekAgo);
    const totalRecent = recentActivities.length;
    const totalPrevious = agentActivities.filter(
      (a) =>
        a.activity_date &&
        new Date(a.activity_date) < oneWeekAgo &&
        new Date(a.activity_date) >= new Date(oneWeekAgo.getTime() - 7 * 24 * 60 * 60 * 1000)
    ).length;

    const weeklyTrend = totalPrevious > 0 ? ((totalRecent - totalPrevious) / totalPrevious) * 100 : totalRecent > 0 ? 100 : 0;

    const activityCounts = agentActivities.reduce((acc, curr) => {
      acc[curr.activity_type] = (acc[curr.activity_type] || 0) + 1;
      return acc;
    }, {} as Record<ActivityType, number>);

    const topActivity = Object.entries(activityCounts).reduce(
      (max, [type, count]) => (count > (activityCounts[max] || 0) ? (type as ActivityType) : max),
      'phone_call' as ActivityType
    );

    const activityEfficiency = Object.keys(activityCounts).reduce((acc, type) => {
      const typeActivities = agentActivities.filter((a) => a.activity_type === type);
      const avgTime =
        typeActivities.length > 0
          ? typeActivities.reduce(
              (sum, a) => sum + (a.activity_date ? new Date().getTime() - new Date(a.activity_date).getTime() : 0),
              0
            ) /
            typeActivities.length /
            (1000 * 60 * 60)
          : 0;
      acc[type as ActivityType] = avgTime > 0 ? activityCounts[type as ActivityType] / avgTime : activityCounts[type as ActivityType] || 0;
      return acc;
    }, {} as Record<ActivityType, number>);

    return { weeklyTrend, topActivity, activityEfficiency };
  };

  const exportToCSV = () => {
    console.log('Exporting CSV');
    const headers = ['Agent ID,Email,Activity Type,Date,Notes,Tags,Property ID'];
    const rows = filteredAgents.flatMap((agent) =>
      activities
        .filter((a) => a.agent_id === agent.id)
        .map((activity) => {
          const property = properties.find((p) => p.id === activity.property_id);
          return `${agent.agent_id},${agent.email},${activity.activity_type || ''},${activity.activity_date || ''},${activity.notes || ''},${activity.tags?.join(';') || ''},${property?.id || ''}`;
        })
    );
    const csvContent = [...headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `agent_activities_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredAgents = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return agents.filter(
      (agent) =>
        agent.email.toLowerCase().includes(query) ||
        agent.agent_id.toLowerCase().includes(query) ||
        activities.some(
          (a) =>
            a.agent_id === agent.id &&
            (a.notes?.toLowerCase().includes(query) ||
             a.tags?.some((tag) => tag.toLowerCase().includes(query)))
        )
    );
  }, [agents, activities, searchQuery]);

  const chartData = useMemo(() => {
    if (!activities.length) return [];
    return Object.entries(
      activities.reduce((acc, curr) => {
        const date = curr.activity_date ? new Date(curr.activity_date).toLocaleDateString() : 'Unknown';
        acc[date] = acc[date] || { date, phone_call: 0, client_meeting: 0, door_knock: 0, connection: 0 };
        acc[date][curr.activity_type]++;
        return acc;
      }, {} as Record<string, { date: string; phone_call: number; client_meeting: number; door_knock: number; connection: number }>)
    ).map(([, value]) => value);
  }, [activities]);

  const pieData = useMemo(() => {
    if (!activities.length) return [];
    const activityTotals = activities.reduce((acc, curr) => {
      acc[curr.activity_type] = (acc[curr.activity_type] || 0) + 1;
      return acc;
    }, {} as Record<ActivityType, number>);
    return Object.entries(activityTotals).map(([name, value]) => ({ name, value }));
  }, [activities]);

  const topAgent = useMemo(() => {
    if (!agents.length || !activities.length) return null;
    return agents.reduce((top, agent) => {
      const agentActivities = activities.filter((a) => a.agent_id === agent.id);
      const metrics = calculatePerformanceMetrics(agentActivities);
      return !top || metrics.weeklyTrend > calculatePerformanceMetrics(activities.filter((a) => a.agent_id === top.id)).weeklyTrend
        ? agent
        : top;
    }, null as Agent | null);
  }, [agents, activities]);

  useEffect(() => {
    const loadPredictions = async () => {
      console.log('Loading predictions for agents:', agents.length);
      const newPredictions: Record<string, PredictionResult | null> = {};
      for (const agent of agents) {
        const agentActivities = activities.filter((a) => a.agent_id === agent.id);
        const linkedProperty = properties.find((p) =>
          agentActivities.some((a) => a.property_id === p.id)
        );
        newPredictions[agent.id] = await analyzePriceTrend(
          linkedProperty?.property_type ?? null,
          linkedProperty?.price ?? null
        );
      }
      setPredictions(newPredictions);
    };
    if (agents.length) {
      loadPredictions();
    }
  }, [agents, activities, properties]);

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300'];

  if (profileError) {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold text-red-600">Profile Error</h2>
        <p className="text-gray-600 mt-2">
          {profileError}. Register as an agent at{' '}
          <Link to="/agent-register" className="text-blue-600 hover:underline">
            /agent-register
          </Link>{' '}
          or contact support.
        </p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold text-red-600">Authentication Error</h2>
        <p className="text-gray-600 mt-2">No user profile found. Please log in again.</p>
      </div>
    );
  }

  if (profile.role !== 'admin') {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold text-red-600">Access Denied</h2>
        <p className="text-gray-600 mt-2">
          This page is for admins only. Your role is '{profile.role || 'unknown'}'.{' '}
          <Link to="/agent-register" className="text-blue-600 hover:underline">
            Register as an agent
          </Link>{' '}
          or contact support.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-4 text-gray-600">Loading Admin Dashboard...</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Toaster />
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200"
            aria-label="Toggle notifications"
          >
            <Bell className="w-6 h-6 text-blue-600" />
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {notifications.length}
              </span>
            )}
          </button>
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl z-10 animate-slide-down">
              <div className="p-4">
                <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                {notifications.length === 0 ? (
                  <p className="text-sm text-gray-500">No new notifications</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {notifications.map((notification, index) => (
                      <li key={index} className="text-sm text-gray-600 p-2 rounded hover:bg-gray-50">
                        {notification}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 flex space-x-4 border-b">
        <button
          onClick={() => setActiveTab('management')}
          className={`pb-2 px-4 text-sm font-medium ${activeTab === 'management' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}
          aria-selected={activeTab === 'management'}
        >
          Agent Management
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`pb-2 px-4 text-sm font-medium ${activeTab === 'reports' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}
          aria-selected={activeTab === 'reports'}
        >
          Agent Reports
        </button>
      </div>

      {activeTab === 'management' && (
        <div className="bg-white rounded-lg shadow-md p-6">
          {fetchError && (
            <div className="bg-red-100 p-4 rounded-lg text-red-600 mb-4">
              <p>{fetchError}</p>
              <p className="text-sm mt-2">
                Run this SQL to check schema:
                <br />
                <code>SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'properties';</code>
              </p>
              {fetchAttempts < MAX_FETCH_ATTEMPTS && (
                <button
                  onClick={() => fetchProperties()}
                  className="mt-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded"
                >
                  Retry Fetch
                </button>
              )}
            </div>
          )}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Agent Management</h2>
            <button
              onClick={() => setShowAgentModal(true)}
              className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              aria-label="Add new agent"
            >
              <UserPlus className="w-5 h-5" />
              <span>Add New Agent</span>
            </button>
          </div>
          {agents.length === 0 ? (
            <p className="text-center text-gray-600">No agents found. Add a new agent to get started.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Register</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Edit</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Delete</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredAgents.map((agent) => (
                    <tr key={agent.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">{agent.agent_id}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{agent.email}</td>
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={agent.permissions.canRegisterProperties}
                          onChange={(e) =>
                            debouncedUpdatePermissions(agent.id, {
                              ...agent.permissions,
                              canRegisterProperties: e.target.checked,
                            })
                          }
                          className="h-4 w-4 text-blue-600 rounded"
                          aria-label={`Toggle register permission for ${agent.email}`}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={agent.permissions.canEditProperties}
                          onChange={(e) =>
                            debouncedUpdatePermissions(agent.id, {
                              ...agent.permissions,
                              canEditProperties: e.target.checked,
                            })
                          }
                          className="h-4 w-4 text-blue-600 rounded"
                          aria-label={`Toggle edit permission for ${agent.email}`}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={agent.permissions.canDeleteProperties}
                          onChange={(e) =>
                            debouncedUpdatePermissions(agent.id, {
                              ...agent.permissions,
                              canDeleteProperties: e.target.checked,
                            })
                          }
                          className="h-4 w-4 text-blue-600 rounded"
                          aria-label={`Toggle delete permission for ${agent.email}`}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => deleteAgent(agent.id)}
                          className="text-red-600 hover:text-red-900"
                          aria-label={`Delete agent ${agent.email}`}
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="space-y-6">
          {fetchError && (
            <div className="bg-red-100 p-4 rounded-lg text-red-600">
              <p>{fetchError}</p>
              <p className="text-sm mt-2">
                Run this SQL to check schema:
                <br />
                <code>SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'properties';</code>
              </p>
              {fetchAttempts < MAX_FETCH_ATTEMPTS && (
                <button
                  onClick={() => fetchProperties()}
                  className="mt-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded"
                >
                  Retry Fetch
                </button>
              )}
            </div>
          )}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Agent Reports</h2>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by email, agent ID, notes, or tags..."
                  className="pl-10 p-2 border rounded focus:ring-2 focus:ring-blue-500"
                  aria-label="Search agents"
                />
              </div>
              <button
                onClick={exportToCSV}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                aria-label="Export agent reports to CSV"
              >
                <Download className="w-5 h-5 mr-2" />
                Export to CSV
              </button>
            </div>
          </div>

          {topAgent ? (
            <div className="bg-white p-6 rounded-lg shadow-md transform hover:scale-105 transition-transform">
              <h3 className="text-lg font-semibold mb-2">Top Performing Agent</h3>
              <p className="text-gray-600">Agent: {topAgent.email} ({topAgent.agent_id})</p>
              <p className="text-gray-600">
                Weekly Trend: {calculatePerformanceMetrics(activities.filter((a) => a.agent_id === topAgent.id)).weeklyTrend.toFixed(2)}%
              </p>
              <p className="text-gray-600">
                Top Activity: {calculatePerformanceMetrics(activities.filter((a) => a.agent_id === topAgent.id)).topActivity?.replace('_', ' ') || 'N/A'}
              </p>
            </div>
          ) : (
            <p className="text-center text-gray-600">No top agent data available.</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold mb-4">Activity Trends</h3>
              {chartData.length > 0 ? (
                <BarChart width={500} height={300} data={chartData} className="mx-auto">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="phone_call" fill="#8884d8" name="Phone Calls" />
                  <Bar dataKey="client_meeting" fill="#82ca9d" name="Meetings" />
                  <Bar dataKey="door_knock" fill="#ffc658" name="Knocks" />
                  <Bar dataKey="connection" fill="#ff7300" name="Connections" />
                </BarChart>
              ) : (
                <p className="text-center text-gray-600">No activity trends available.</p>
              )}
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold mb-4">Activity Distribution</h3>
              {pieData.length > 0 ? (
                <PieChart width={400} height={400} className="mx-auto">
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(2)}%`}
                    outerRadius={120}
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
              ) : (
                <p className="text-center text-gray-600">No activity distribution available.</p>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold mb-4">Agent Performance</h3>
            {filteredAgents.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Weekly Trend</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Top Activity</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Market Prediction</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredAgents.map((agent) => {
                      const agentActivities = activities.filter((a) => a.agent_id === agent.id);
                      const metrics = calculatePerformanceMetrics(agentActivities);
                      const prediction = predictions[agent.id];

                      return (
                        <tr key={agent.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm text-gray-900">{agent.email}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            <span className={metrics.weeklyTrend >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {metrics.weeklyTrend.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900 capitalize">
                            {metrics.topActivity?.replace('_', ' ') || 'N/A'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {prediction && prediction.confidence ? (
                              <span className={`font-medium ${prediction.recommendation === 'BUY' ? 'text-green-600' : prediction.recommendation === 'SELL' ? 'text-red-600' : 'text-gray-600'}`}>
                                {prediction.recommendation} ({prediction.confidence.toFixed(1)}% confidence)
                              </span>
                            ) : (
                              'No prediction available'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center text-gray-600">No agents match your search.</p>
            )}
          </div>
        </div>
      )}

      {showAgentModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Create New Agent</h3>
              <button
                onClick={() => setShowAgentModal(false)}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={createAgent}>
              <div className="mb-4">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  id="email"
                  value={newAgent.email}
                  onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  required
                  aria-required="true"
                  aria-label="Email address"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">Permissions</label>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="canRegisterProperties"
                      checked={newAgent.canRegisterProperties}
                      onChange={(e) => {
                        setNewAgent({ ...newAgent, canRegisterProperties: e.target.checked });
                      }}
                      className="h-4 w-4 text-blue-600 rounded"
                      aria-label="Can register properties permission"
                    />
                    <label htmlFor="canRegisterProperties" className="ml-2 text-sm text-gray-600">
                      Can Register Properties
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="canEditProperties"
                      checked={newAgent.canEditProperties}
                      onChange={(e) => {
                        setNewAgent({ ...newAgent, canEditProperties: e.target.checked });
                      }}
                      className="h-4 w-4 text-blue-600 rounded"
                      aria-label="Can edit properties permission"
                    />
                    <label htmlFor="canEditProperties" className="ml-2 text-sm text-gray-600">
                      Can Edit Properties
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="canDeleteProperties"
                      checked={newAgent.canDeleteProperties}
                      onChange={(e) => {
                        setNewAgent({ ...newAgent, canDeleteProperties: e.target.checked });
                      }}
                      className="h-4 w-4 text-blue-600 rounded"
                      aria-label="Can delete properties permission"
                    />
                    <label htmlFor="canDeleteProperties" className="ml-2 text-sm text-gray-600">
                      Can Delete Properties
                    </label>
                  </div>
                </div>
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAgentModal(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  aria-label="Cancel agent creation"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingAgent}
                  className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 ${isCreatingAgent ? 'opacity-50 cursor-not-allowed' : ''}`}
                  aria-label="Create new agent"
                >
                  {isCreatingAgent ? 'Creating...' : 'Create Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .animate-slide-down {
          animation: slideDown 0.3s ease-out;
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
