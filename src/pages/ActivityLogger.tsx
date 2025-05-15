import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Clock, Send, CheckCircle, ChevronLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';
import { Navigation } from './components/Navigation';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { ErrorBoundary } from 'react-error-boundary';
import { toast } from 'react-toastify';

interface DoorKnockStreet {
  name: string;
  why: string;
  house_count: string;
  target_knocks: string;
  target_answers: string;
}

interface PhoneCallStreet {
  name: string;
  why: string;
  target_calls: string;
}

interface MarketingPlan {
  agent: string;
  suburb: string;
  door_knock_streets: DoorKnockStreet[];
  phone_call_streets: PhoneCallStreet[];
}

interface ActivityLog {
  type: 'phone_call' | 'door_knock';
  street_name: string;
  suburb: string;
  calls_connected?: string;
  calls_answered?: string;
  knocks_made?: string;
  knocks_answered?: string;
  desktop_appraisals?: string;
  face_to_face_appraisals?: string;
  notes: string;
  date: string;
  submitting?: boolean;
}

const ErrorFallback = ({ error }: { error: Error }) => (
  <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4 sm:px-6 lg:px-8">
    <div className="max-w-7xl mx-auto text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <svg className="w-16 h-16 mx-auto mb-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xl font-semibold text-red-600">Something went wrong: {error.message}</p>
        <motion.button
          onClick={() => window.location.reload()}
          className="mt-4 px-6 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-full hover:from-indigo-700 hover:to-indigo-800 transition-all shadow-md"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Reload Page
        </motion.button>
      </motion.div>
    </div>
  </div>
);

function ActivityLogReport({
  log,
  onBack,
  onDashboard,
  onProgressReport,
}: {
  log: ActivityLog;
  onBack: () => void;
  onDashboard: () => void;
  onProgressReport: () => void;
}) {
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-AU', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <motion.h1
          className="text-4xl font-extrabold text-gray-900 mb-8 flex items-center"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Clock className="w-8 h-8 mr-3 text-indigo-600" />
          Activity Log Report
        </motion.h1>

        <motion.div
          className="mb-8 flex flex-wrap gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <motion.button
            onClick={onBack}
            className="flex items-center px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-full hover:from-indigo-700 hover:to-indigo-800 transition-all shadow-md"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Log another activity"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Log Another Activity
          </motion.button>
          <motion.button
            onClick={onDashboard}
            className="flex items-center px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-full hover:from-green-700 hover:to-green-800 transition-all shadow-md"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Go to dashboard"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011 1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Go to Dashboard
          </motion.button>
          <motion.button
            onClick={onProgressReport}
            className="flex items-center px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-full hover:from-purple-700 hover:to-purple-800 transition-all shadow-md"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="View progress report"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            View Progress Report
          </motion.button>
        </motion.div>

        <motion.div
          className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 max-w-md hover:shadow-xl transition-all duration-300"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <h2 className="text-2xl font-semibold text-gray-800 mb-6 flex items-center">
            <svg className="w-6 h-6 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            Activity Details
          </h2>
          <div className="grid grid-cols-1 gap-6">
            <div>
              <p className="text-gray-700 font-semibold">Activity Type:</p>
              <p className="text-gray-900">
                {log.type === 'phone_call' ? 'Phone Call' : 'Door Knock'}
              </p>
            </div>
            <div>
              <p className="text-gray-700 font-semibold">Street Name:</p>
              <p className="text-gray-900">{log.street_name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-gray-700 font-semibold">Suburb:</p>
              <p className="text-gray-900">{log.suburb}</p>
            </div>
            <div>
              <p className="text-gray-700 font-semibold">Date:</p>
              <p className="text-gray-900">{formatDate(log.date)}</p>
            </div>
            {log.type === 'phone_call' && (
              <>
                <div>
                  <p className="text-gray-700 font-semibold">Calls Connected:</p>
                  <p className="text-gray-900">{log.calls_connected || '0'}</p>
                </div>
                <div>
                  <p className="text-gray-700 font-semibold">Calls Answered:</p>
                  <p className="text-gray-900">{log.calls_answered || '0'}</p>
                </div>
                <div>
                  <p className="text-gray-700 font-semibold">Desktop Appraisals:</p>
                  <p className="text-gray-900">{log.desktop_appraisals || '0'}</p>
                </div>
                <div>
                  <p className="text-gray-700 font-semibold">Face-to-Face Appraisals:</p>
                  <p className="text-gray-900">{log.face_to_face_appraisals || '0'}</p>
                </div>
              </>
            )}
            {log.type === 'door_knock' && (
              <>
                <div>
                  <p className="text-gray-700 font-semibold">Knocks Made:</p>
                  <p className="text-gray-900">{log.knocks_made || '0'}</p>
                </div>
                <div>
                  <p className="text-gray-700 font-semibold">Knocks Answered:</p>
                  <p className="text-gray-900">{log.knocks_answered || '0'}</p>
                  <div className="w-full h-2 bg-gray-200 rounded-full mt-2">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-indigo-700 rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(
                          (parseFloat(log.knocks_answered || '0') / parseFloat(log.knocks_made || '1')) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-gray-700 font-semibold">Desktop Appraisals:</p>
                  <p className="text-gray-900">{log.desktop_appraisals || '0'}</p>
                </div>
                <div>
                  <p className="text-gray-700 font-semibold">Face-to-Face Appraisals:</p>
                  <p className="text-gray-900">{log.face_to_face_appraisals || '0'}</p>
                </div>
              </>
            )}
            <div>
              <p className="text-gray-700 font-semibold">Notes:</p>
              <p className="text-gray-900">{log.notes || 'No notes provided'}</p>
            </div>
          </div>
          <div className="mt-8 flex gap-4">
            <motion.button
              onClick={onBack}
              className="flex-1 flex items-center justify-center px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-full hover:from-indigo-700 hover:to-indigo-800 transition-all shadow-md"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Log Another Activity
            </motion.button>
            <motion.button
              onClick={onProgressReport}
              className="flex-1 flex items-center justify-center px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-full hover:from-purple-700 hover:to-purple-800 transition-all shadow-md"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              View Progress Report
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export function ActivityLogger() {
  const { user, profile, loading, initializeAuth } = useAuthStore();
  const navigate = useNavigate();

  // Utility function to capitalize the first letter
  const capitalizeFirstLetter = (str: string) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  // Static list of suburbs
  const suburbs = [
    'Pullenvale 4069',
    'Brookfield 4069',
    'Anstead 4070',
    'Chapell Hill 4069',
    'Kenmore 4069',
    'Kenmore Hills 4069',
    'Fig Tree Pocket 4069',
    'Pinjara Hills 4069',
    'Moggill QLD (4070)',
    'Bellbowrie QLD (4070)',
  ].map(capitalizeFirstLetter);

  // Get current date in UTC
  const getCurrentUTCDate = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      .toISOString()
      .split('T')[0];
  };

  const [activityLog, setActivityLog] = useState<ActivityLog>({
    type: 'phone_call',
    street_name: '',
    suburb: '',
    calls_connected: '',
    calls_answered: '',
    knocks_made: '',
    knocks_answered: '',
    desktop_appraisals: '',
    face_to_face_appraisals: '',
    notes: '',
    date: getCurrentUTCDate(),
    submitting: false,
  });
  const [success, setSuccess] = useState<'phone_call' | 'door_knock' | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [marketingPlan, setMarketingPlan] = useState<MarketingPlan | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isCustomSuburb, setIsCustomSuburb] = useState(false);
  const [recommendedStreet, setRecommendedStreet] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize auth and load marketing plan
  useEffect(() => {
    console.log('useEffect: Checking auth state', { user, profile, loading });
    if (!loading && !user) {
      initializeAuth().then(() => {
        const updatedUser = useAuthStore.getState().user;
        const updatedProfile = useAuthStore.getState().profile;
        console.log('Auth initialized', { updatedUser, updatedProfile });
        if (!updatedUser || !updatedProfile) {
          console.log('No user or profile, redirecting to /agent-login');
          navigate('/agent-login');
        } else if (updatedProfile.role !== 'agent') {
          console.log('User is not an agent, redirecting to /agent-login');
          navigate('/agent-login');
        } else {
          console.log('Loading marketing plan for agent:', updatedUser.id);
          loadMarketingPlan(updatedUser.id);
        }
      }).catch((err) => {
        console.error('Auth initialization error:', err);
        setError('Failed to initialize authentication');
      });
    } else if (user && profile?.role === 'agent') {
      console.log('User authenticated, loading marketing plan:', user.id);
      loadMarketingPlan(user.id);
    } else {
      console.log('Redirecting to /agent-login due to invalid user/profile');
      navigate('/agent-login');
    }
  }, [user, profile, loading, initializeAuth, navigate]);

  // Load marketing plan from Supabase
  const loadMarketingPlan = async (agentId: string) => {
    try {
      console.log('Fetching marketing plan for agent:', agentId);
      setError(null);
      const { data, error } = await supabase
        .from('marketing_plans')
        .select('agent, suburb, door_knock_streets, phone_call_streets')
        .eq('agent', agentId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new Error(`Supabase error: ${error.message}`);
      }

      if (data) {
        console.log('Marketing plan loaded:', data);
        setMarketingPlan(data);
        setActivityLog((prev) => ({
          ...prev,
          suburb: capitalizeFirstLetter(data.suburb || ''),
        }));
        const allStreets = [
          ...data.door_knock_streets.map((s) => s.name),
          ...data.phone_call_streets.map((s) => s.name),
        ];
        if (allStreets.length > 0) {
          const randomStreet = allStreets[Math.floor(Math.random() * allStreets.length)];
          console.log('Setting recommended street:', randomStreet);
          setRecommendedStreet(randomStreet);
          setActivityLog((prev) => ({
            ...prev,
            street_name: randomStreet,
          }));
        } else {
          console.warn('No streets available in marketing plan');
        }
      } else {
        console.warn('No marketing plan found for agent:', agentId);
        setMarketingPlan(null);
      }
    } catch (err: any) {
      console.error('Error loading marketing plan:', err.message);
      setError('Failed to load marketing plan. Please try again or create one.');
      toast.error('Failed to load marketing plan');
    }
  };

  // Update recommended street when activity type changes
  useEffect(() => {
    if (marketingPlan) {
      console.log('Activity type changed to:', activityLog.type);
      let availableStreets: string[] = [];
      if (activityLog.type === 'phone_call') {
        availableStreets = marketingPlan.phone_call_streets.map((street) => street.name);
      } else if (activityLog.type === 'door_knock') {
        availableStreets = marketingPlan.door_knock_streets.map((street) => street.name);
      }
      if (availableStreets.length > 0) {
        const randomStreet = availableStreets[Math.floor(Math.random() * availableStreets.length)];
        console.log('Setting recommended street for', activityLog.type, ':', randomStreet);
        setRecommendedStreet(randomStreet);
        setActivityLog((prev) => ({
          ...prev,
          street_name: randomStreet,
        }));
      } else {
        console.warn('No available streets for activity type:', activityLog.type);
        setRecommendedStreet(null);
        setActivityLog((prev) => ({
          ...prev,
          street_name: '',
        }));
      }
    }
  }, [activityLog.type, marketingPlan]);

  // Validate form inputs
  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
    console.log('Validating form:', activityLog);

    if (!activityLog.suburb.trim()) newErrors.suburb = 'Please select or enter a suburb (e.g., Moggill 4070)';
    if (!activityLog.street_name.trim()) newErrors.street_name = 'Please enter a street name';

    const selectedDateStr = activityLog.date;
    const todayStr = getCurrentUTCDate();

    if (!activityLog.date) {
      newErrors.date = 'Please select a date';
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDateStr)) {
      newErrors.date = 'Please enter a valid date (YYYY-MM-DD)';
    } else if (selectedDateStr > todayStr) {
      newErrors.date = `Please select today (${new Date(todayStr).toLocaleDateString('en-AU')}) or a past date`;
    }

    if (activityLog.type === 'phone_call') {
      if (
        activityLog.calls_connected &&
        (isNaN(parseInt(activityLog.calls_connected)) || parseInt(activityLog.calls_connected) < 0)
      )
        newErrors.calls_connected = 'Please enter a number like 0 or 5';
      if (
        activityLog.calls_answered &&
        (isNaN(parseInt(activityLog.calls_answered)) || parseInt(activityLog.calls_answered) < 0)
      )
        newErrors.calls_answered = 'Please enter a number like 0 or 3';
      if (
        activityLog.desktop_appraisals &&
        (isNaN(parseInt(activityLog.desktop_appraisals)) || parseInt(activityLog.desktop_appraisals) < 0)
      )
        newErrors.desktop_appraisals = 'Please enter a number like 0 or 2';
      if (
        activityLog.face_to_face_appraisals &&
        (isNaN(parseInt(activityLog.face_to_face_appraisals)) || parseInt(activityLog.face_to_face_appraisals) < 0)
      )
        newErrors.face_to_face_appraisals = 'Please enter a number like 0 or 1';
      if (
        activityLog.calls_connected &&
        activityLog.calls_answered &&
        parseInt(activityLog.calls_answered) > parseInt(activityLog.calls_connected)
      )
        newErrors.calls_answered = 'Cannot be more than calls connected';
    } else if (activityLog.type === 'door_knock') {
      if (
        activityLog.knocks_made &&
        (isNaN(parseInt(activityLog.knocks_made)) || parseInt(activityLog.knocks_made) < 0)
      )
        newErrors.knocks_made = 'Please enter a number like 0 or 15';
      if (
        activityLog.knocks_answered &&
        (isNaN(parseInt(activityLog.knocks_answered)) || parseInt(activityLog.knocks_answered) < 0)
      )
        newErrors.knocks_answered = 'Please enter a number like 0 or 5';
      if (
        activityLog.desktop_appraisals &&
        (isNaN(parseInt(activityLog.desktop_appraisals)) || parseInt(activityLog.desktop_appraisals) < 0)
      )
        newErrors.desktop_appraisals = 'Please enter a number like 0 or 2';
      if (
        activityLog.face_to_face_appraisals &&
        (isNaN(parseInt(activityLog.face_to_face_appraisals)) || parseInt(activityLog.face_to_face_appraisals) < 0)
      )
        newErrors.face_to_face_appraisals = 'Please enter a number like 0 or 1';
      if (
        activityLog.knocks_made &&
        activityLog.knocks_answered &&
        parseInt(activityLog.knocks_answered) > parseInt(activityLog.knocks_made)
      )
        newErrors.knocks_answered = 'Cannot be more than knocks made';
    }

    setErrors(newErrors);
    console.log('Validation errors:', newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleActivitySubmit = async () => {
    if (!validateForm()) {
      console.log('Form validation failed:', errors);
      toast.error('Please fix the errors in the form before submitting.');
      return;
    }

    const agentId = profile?.id || user?.id;
    if (!profile || !agentId || activityLog.submitting) {
      console.error('Cannot submit: Missing profile or already submitting', { profile, agentId, submitting: activityLog.submitting });
      toast.error('Unable to log activity. Please ensure you are logged in.');
      return;
    }

    console.log('Submitting activity:', activityLog);
    setActivityLog({ ...activityLog, submitting: true });

    try {
      const { data: agentData, error: agentError } = await supabase
        .from('agents')
        .select('agency_name')
        .eq('id', agentId)
        .single();

      if (agentError) throw new Error(`Failed to fetch agency: ${agentError.message}`);

      const activity = {
        agent_id: agentId,
        agency_name: agentData?.agency_name || '',
        activity_type: activityLog.type,
        activity_date: new Date(activityLog.date).toISOString(),
        street_name: activityLog.street_name.trim(),
        suburb: capitalizeFirstLetter(activityLog.suburb.trim()),
        notes: activityLog.notes.trim() || null,
        status: 'Completed',
        ...(activityLog.type === 'phone_call' && {
          calls_connected: parseInt(activityLog.calls_connected || '0'),
          calls_answered: parseInt(activityLog.calls_answered || '0'),
          desktop_appraisals: parseInt(activityLog.desktop_appraisals || '0'),
          face_to_face_appraisals: parseInt(activityLog.face_to_face_appraisals || '0'),
        }),
        ...(activityLog.type === 'door_knock' && {
          knocks_made: parseInt(activityLog.knocks_made || '0'),
          knocks_answered: parseInt(activityLog.knocks_answered || '0'),
          desktop_appraisals: parseInt(activityLog.desktop_appraisals || '0'),
          face_to_face_appraisals: parseInt(activityLog.face_to_face_appraisals || '0'),
        }),
      };

      console.log('Inserting activity into Supabase:', activity);
      const { error: activityError } = await supabase.from('agent_activities').insert([activity]);

      if (activityError) throw new Error(`Failed to log activity: ${activityError.message}`);

      console.log('Activity logged successfully');
      setSuccess(activityLog.type);
      setShowReport(true);
      toast.success('Activity logged successfully!');

      setActivityLog({
        type: 'phone_call',
        street_name: recommendedStreet || '',
        suburb: marketingPlan?.suburb ? capitalizeFirstLetter(marketingPlan.suburb) : '',
        calls_connected: '',
        calls_answered: '',
        knocks_made: '',
        knocks_answered: '',
        desktop_appraisals: '',
        face_to_face_appraisals: '',
        notes: '',
        date: getCurrentUTCDate(),
        submitting: false,
      });
      setErrors({});
      setIsCustomSuburb(false);
    } catch (err: any) {
      console.error('Activity logging error:', err.message);
      toast.error(`Failed to log activity: ${err.message}`);
      setError(`Failed to log activity: ${err.message}`);
    } finally {
      setActivityLog((prev) => ({ ...prev, submitting: false }));
    }
  };

  // Get available streets based on activity type
  const getAvailableStreets = () => {
    if (!marketingPlan) return [];
    if (activityLog.type === 'phone_call') {
      return marketingPlan.phone_call_streets.map((street) => street.name);
    } else if (activityLog.type === 'door_knock') {
      return marketingPlan.door_knock_streets.map((street) => street.name);
    }
    return [];
  };

  console.log('Current state:', {
    loading,
    user,
    profile,
    error,
    marketingPlan,
    activityLog,
    showReport,
    success,
    isCustomSuburb,
    recommendedStreet,
  });

  if (loading) {
    return <LoadingOverlay message="Loading activity logger..." />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <svg className="w-16 h-16 mx-auto mb-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xl font-semibold text-red-600">{error}</p>
            <motion.button
              onClick={() => navigate('/agent-login')}
              className="mt-4 px-6 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-full hover:from-indigo-700 hover:to-indigo-800 transition-all shadow-md"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Go to Login
            </motion.button>
          </motion.div>
        </div>
      </div>
    );
  }

  if (!profile || profile.role !== 'agent') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <svg className="w-16 h-16 mx-auto mb-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xl font-semibold text-red-600">Access denied. Agents only.</p>
            <motion.button
              onClick={() => navigate('/agent-login')}
              className="mt-4 px-6 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-full hover:from-indigo-700 hover:to-indigo-800 transition-all shadow-md"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Go to Login
            </motion.button>
          </motion.div>
        </div>
      </div>
    );
  }

  if (!marketingPlan) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <svg className="w-16 h-16 mx-auto mb-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xl font-semibold text-red-600">
              Please create a marketing plan before logging activities.
            </p>
            <motion.button
              onClick={() => navigate('/marketing-plan')}
              className="mt-4 px-6 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-full hover:from-indigo-700 hover:to-indigo-800 transition-all shadow-md"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Create Marketing Plan
            </motion.button>
          </motion.div>
        </div>
      </div>
    );
  }

  if (showReport) {
    return (
      <ActivityLogReport
        log={activityLog}
        onBack={() => {
          setShowReport(false);
          setSuccess(null);
        }}
        onDashboard={() => navigate('/agent-dashboard')}
        onProgressReport={() => navigate('/progress-report')}
      />
    );
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.h1
            className="text-4xl font-extrabold text-gray-900 mb-8 flex items-center"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Clock className="w-8 h-8 mr-3 text-indigo-600" />
            Activity Logger
          </motion.h1>

          <motion.div
            className="mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <motion.button
              onClick={() => navigate('/agent-dashboard')}
              className="flex items-center px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-full hover:from-green-700 hover:to-green-800 transition-all shadow-md"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Back to dashboard"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </motion.button>
          </motion.div>

          {recommendedStreet && (
            <motion.div
              className="mb-8 p-4 bg-blue-100 rounded-lg flex items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <p className="text-blue-600">
                Recommended Street: <strong>{recommendedStreet}</strong> (Suburb: {marketingPlan.suburb})
              </p>
            </motion.div>
          )}

          <motion.div
            className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 max-w-md hover:shadow-xl transition-all duration-300"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <div className="space-y-6">
              <div>
                <label className="block text-gray-800 font-semibold mb-2">Activity Type</label>
                <select
                  value={activityLog.type}
                  onChange={(e) =>
                    setActivityLog({
                      ...activityLog,
                      type: e.target.value as 'phone_call' | 'door_knock',
                      street_name: recommendedStreet || '',
                      calls_connected: '',
                      calls_answered: '',
                      knocks_made: '',
                      knocks_answered: '',
                      desktop_appraisals: '',
                      face_to_face_appraisals: '',
                    })
                  }
                  className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                  aria-label="Select activity type"
                >
                  <option value="phone_call">Phone Calls</option>
                  <option value="door_knock">Door Knocks</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-800 font-semibold mb-2">Date *</label>
                <input
                  type="date"
                  value={activityLog.date}
                  onChange={(e) => setActivityLog({ ...activityLog, date: e.target.value })}
                  onBlur={() => validateForm()}
                  max={getCurrentUTCDate()}
                  min="2024-01-01"
                  className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                  placeholder="e.g., 2024-04-30"
                  aria-label="Select date"
                />
                {errors.date && <p className="text-red-600 text-sm mt-1 font-medium">{errors.date}</p>}
              </div>
              <div>
                <label className="block text-gray-800 font-semibold mb-2">Suburb *</label>
                <select
                  value={isCustomSuburb ? 'custom' : activityLog.suburb}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === 'custom') {
                      setIsCustomSuburb(true);
                      setActivityLog({ ...activityLog, suburb: '' });
                    } else {
                      setIsCustomSuburb(false);
                      setActivityLog({ ...activityLog, suburb: value });
                    }
                  }}
                  className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                  aria-label="Select suburb"
                >
                  <option value="">Select a suburb</option>
                  {suburbs.map((suburb) => (
                    <option key={suburb} value={suburb}>
                      {suburb}
                    </option>
                  ))}
                  <option value="custom">Custom Suburb</option>
                </select>
                {isCustomSuburb && (
                  <motion.input
                    type="text"
                    value={activityLog.suburb}
                    onChange={(e) =>
                      setActivityLog({ ...activityLog, suburb: capitalizeFirstLetter(e.target.value) })
                    }
                    className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50 mt-2"
                    placeholder="e.g., Moggill 4070"
                    aria-label="Enter custom suburb"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ duration: 0.3 }}
                  />
                )}
                {errors.suburb && <p className="text-red-600 text-sm mt-1 font-medium">{errors.suburb}</p>}
              </div>
              <div>
                <label className="block text-gray-800 font-semibold mb-2">Street Name *</label>
                <select
                  value={activityLog.street_name}
                  onChange={(e) => setActivityLog({ ...activityLog, street_name: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                  aria-label="Select street name"
                >
                  <option value="">Select a street</option>
                  {getAvailableStreets().map((street) => (
                    <option key={street} value={street}>
                      {street}
                    </option>
                  ))}
                </select>
                {errors.street_name && (
                  <p className="text-red-600 text-sm mt-1 font-medium">{errors.street_name}</p>
                )}
              </div>
              {activityLog.type === 'phone_call' && (
                <>
                  <div>
                    <label className="block text-gray-800 font-semibold mb-2">Calls Connected</label>
                    <input
                      type="number"
                      value={activityLog.calls_connected}
                      onChange={(e) => setActivityLog({ ...activityLog, calls_connected: e.target.value })}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                      placeholder="e.g., 3"
                      min="0"
                      step="1"
                      aria-label="Enter calls connected"
                    />
                    {errors.calls_connected && (
                      <p className="text-red-600 text-sm mt-1 font-medium">{errors.calls_connected}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-gray-800 font-semibold mb-2">Calls Answered</label>
                    <input
                      type="number"
                      value={activityLog.calls_answered}
                      onChange={(e) => setActivityLog({ ...activityLog, calls_answered: e.target.value })}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                      placeholder="e.g., 2"
                      min="0"
                      step="1"
                      aria-label="Enter calls answered"
                    />
                    {errors.calls_answered && (
                      <p className="text-red-600 text-sm mt-1 font-medium">{errors.calls_answered}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-gray-800 font-semibold mb-2">Desktop Appraisals</label>
                    <input
                      type="number"
                      value={activityLog.desktop_appraisals}
                      onChange={(e) => setActivityLog({ ...activityLog, desktop_appraisals: e.target.value })}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                      placeholder="e.g., 2"
                      min="0"
                      step="1"
                      aria-label="Enter desktop appraisals"
                    />
                    {errors.desktop_appraisals && (
                      <p className="text-red-600 text-sm mt-1 font-medium">{errors.desktop_appraisals}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-gray-800 font-semibold mb-2">Face-to-Face Appraisals</label>
                    <input
                      type="number"
                      value={activityLog.face_to_face_appraisals}
                      onChange={(e) =>
                        setActivityLog({ ...activityLog, face_to_face_appraisals: e.target.value })
                      }
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                      placeholder="e.g., 1"
                      min="0"
                      step="1"
                      aria-label="Enter face-to-face appraisals"
                    />
                    {errors.face_to_face_appraisals && (
                      <p className="text-red-600 text-sm mt-1 font-medium">{errors.face_to_face_appraisals}</p>
                    )}
                  </div>
                </>
              )}
              {activityLog.type === 'door_knock' && (
                <>
                  <div>
                    <label className="block text-gray-800 font-semibold mb-2">Knocks Made</label>
                    <input
                      type="number"
                      value={activityLog.knocks_made}
                      onChange={(e) => setActivityLog({ ...activityLog, knocks_made: e.target.value })}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                      placeholder="e.g., 15"
                      min="0"
                      step="1"
                      aria-label="Enter knocks made"
                    />
                    {errors.knocks_made && (
                      <p className="text-red-600 text-sm mt-1 font-medium">{errors.knocks_made}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-gray-800 font-semibold mb-2">Knocks Answered</label>
                    <input
                      type="number"
                      value={activityLog.knocks_answered}
                      onChange={(e) => setActivityLog({ ...activityLog, knocks_answered: e.target.value })}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                      placeholder="e.g., 5"
                      min="0"
                      step="1"
                      aria-label="Enter knocks answered"
                    />
                    {errors.knocks_answered && (
                      <p className="text-red-600 text-sm mt-1 font-medium">{errors.knocks_answered}</p>
                    )}
                    {activityLog.knocks_made && (
                      <div className="w-full h-2 bg-gray-200 rounded-full mt-2">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-indigo-700 rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(
                              (parseFloat(activityLog.knocks_answered || '0') /
                                parseFloat(activityLog.knocks_made || '1')) *
                                100,
                              100
                            )}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-gray-800 font-semibold mb-2">Desktop Appraisals</label>
                    <input
                      type="number"
                      value={activityLog.desktop_appraisals}
                      onChange={(e) => setActivityLog({ ...activityLog, desktop_appraisals: e.target.value })}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                      placeholder="e.g., 2"
                      min="0"
                      step="1"
                      aria-label="Enter desktop appraisals"
                    />
                    {errors.desktop_appraisals && (
                      <p className="text-red-600 text-sm mt-1 font-medium">{errors.desktop_appraisals}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-gray-800 font-semibold mb-2">Face-to-Face Appraisals</label>
                    <input
                      type="number"
                      value={activityLog.face_to_face_appraisals}
                      onChange={(e) =>
                        setActivityLog({ ...activityLog, face_to_face_appraisals: e.target.value })
                      }
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                      placeholder="e.g., 1"
                      min="0"
                      step="1"
                      aria-label="Enter face-to-face appraisals"
                    />
                    {errors.face_to_face_appraisals && (
                      <p className="text-red-600 text-sm mt-1 font-medium">{errors.face_to_face_appraisals}</p>
                    )}
                  </div>
                </>
              )}
              <div>
                <label className="block text-gray-800 font-semibold mb-2">Notes</label>
                <textarea
                  value={activityLog.notes}
                  onChange={(e) => setActivityLog({ ...activityLog, notes: e.target.value })}
                  className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                  placeholder="e.g., Spoke to two homeowners"
                  rows={4}
                  aria-label="Enter notes"
                />
              </div>
              <motion.button
                onClick={handleActivitySubmit}
                disabled={activityLog.submitting}
                className="w-full flex items-center justify-center px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-full hover:from-indigo-700 hover:to-indigo-800 transition-all shadow-md disabled:opacity-50 relative"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="Log activity"
              >
                {activityLog.submitting ? (
                  <svg className="w-5 h-5 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 12a8 8 0 1116 0 8 8 0 01-16 0zm8-8v2m0 12v2m8-8h-2m-12 0H2m15.364 5.364l-1.414-1.414M5.05 5.05l1.414 1.414m12.728 0l-1.414 1.414M5.05 18.95l1.414-1.414" />
                  </svg>
                ) : (
                  <Send className="w-5 h-5 mr-2" />
                )}
                {activityLog.submitting ? 'Logging...' : 'Log Activity'}
                {success && (
                  <motion.div
                    className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <CheckCircle className="w-12 h-12 text-green-500" />
                  </motion.div>
                )}
              </motion.button>
              <p className="text-sm text-gray-500">* Required field</p>
            </div>
          </motion.div>
        </div>
      </div>
    </ErrorBoundary>
  );
}