import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Clock, Send, CheckCircle, ChevronLeft, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { ErrorBoundary } from 'react-error-boundary';
import { toast } from 'react-toastify';

// Define interfaces (unchanged)
interface DoorKnockStreet {
  id: string;
  name: string;
  why: string;
  house_count: string;
  target_knocks: string;
  target_answers: string;
  desktop_appraisals: string;
  face_to_face_appraisals: string;
}

interface PhoneCallStreet {
  id: string;
  name: string;
  why: string;
  target_calls: string;
  target_connects: string;
  desktop_appraisals: string;
  face_to_face_appraisals: string;
}

interface MarketingPlan {
  id: string;
  agent: string;
  suburb: string;
  start_date: string;
  end_date: string;
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

interface UserProfile {
  id: string;
  role: string;
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
  planId,
  onBack,
  onDashboard,
  onProgressReport,
}: {
  log: ActivityLog;
  planId: string | null;
  onBack: () => void;
  onDashboard: () => void;
  onProgressReport: () => void;
}) {
  const formatDate = (date: string) => {
    const d = new Date(date);
    const weekday = d.toLocaleDateString('en-AU', { weekday: 'long' });
    const day = d.toLocaleDateString('en-AU', { day: 'numeric' });
    const month = d.toLocaleDateString('en-AU', { month: 'long' });
    const year = d.toLocaleDateString('en-AU', { year: 'numeric' });
    return `${weekday}, ${day} ${month} ${year}`;
  };

  const displayLog = log;

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
          className="mb-8 bg-green-100 p-4 rounded-lg flex items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <CheckCircle className="w-6 h-6 mr-2 text-green-600" />
          <p className="text-green-800">Activity logged successfully!</p>
        </motion.div>

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
              <p className="text-gray-900">{displayLog.type === 'phone_call' ? 'Phone Call' : 'Door Knock'}</p>
            </div>
            <div>
              <p className="text-gray-700 font-semibold">Street Name:</p>
              <p className="text-gray-900">{displayLog.street_name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-gray-700 font-semibold">Suburb:</p>
              <p className="text-gray-900">{displayLog.suburb}</p>
            </div>
            <div>
              <p className="text-gray-700 font-semibold">Date:</p>
              <p className="text-gray-900">{formatDate(displayLog.date)}</p>
            </div>
            {displayLog.type === 'phone_call' && (
              <>
                <div>
                  <p className="text-gray-700 font-semibold">Calls Connected:</p>
                  <p className="text-gray-900">{displayLog.calls_connected || '0'}</p>
                </div>
                <div>
                  <p className="text-gray-700 font-semibold">Calls Answered:</p>
                  <p className="text-gray-900">{displayLog.calls_answered || '0'}</p>
                </div>
                <div>
                  <p className="text-gray-700 font-semibold">Desktop Appraisals:</p>
                  <p className="text-gray-900">{displayLog.desktop_appraisals || '0'}</p>
                </div>
                <div>
                  <p className="text-gray-700 font-semibold">Face-to-Face Appraisals:</p>
                  <p className="text-gray-900">{displayLog.face_to_face_appraisals || '0'}</p>
                </div>
              </>
            )}
            {displayLog.type === 'door_knock' && (
              <>
                <div>
                  <p className="text-gray-700 font-semibold">Knocks Made:</p>
                  <p className="text-gray-900">{displayLog.knocks_made || '0'}</p>
                </div>
                <div>
                  <p className="text-gray-700 font-semibold">Knocks Answered:</p>
                  <p className="text-gray-900">
                    {displayLog.knocks_answered || '0'}{' '}
                    {displayLog.knocks_made && displayLog.knocks_answered
                      ? `(${((parseFloat(displayLog.knocks_answered) / parseFloat(displayLog.knocks_made)) * 100).toFixed(2)}% completion)`
                      : ''}
                  </p>
                  <div className="w-full h-2 bg-gray-200 rounded-full mt-2">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-indigo-700 rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(
                          (parseFloat(displayLog.knocks_answered || '0') / parseFloat(displayLog.knocks_made || '1')) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-gray-700 font-semibold">Desktop Appraisals:</p>
                  <p className="text-gray-900">{displayLog.desktop_appraisals || '0'}</p>
                </div>
                <div>
                  <p className="text-gray-700 font-semibold">Face-to-Face Appraisals:</p>
                  <p className="text-gray-900">{displayLog.face_to_face_appraisals || '0'}</p>
                </div>
              </>
            )}
            <div>
              <p className="text-gray-700 font-semibold">Notes:</p>
              <p className="text-gray-900">{displayLog.notes || 'No notes provided'}</p>
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

  const capitalizeFirstLetter = (str: string) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const getCurrentUTCDate = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      .toISOString()
      .split('T')[0];
  };

  const [activityLog, setActivityLog] = useState<ActivityLog>({
    type: 'door_knock',
    street_name: 'Main Street',
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
  const [marketingPlans, setMarketingPlans] = useState<MarketingPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isCustomStreet, setIsCustomStreet] = useState(true);
  const [recommendedStreet, setRecommendedStreet] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      initializeAuth().then(() => {
        const updatedUser = useAuthStore.getState().user;
        const updatedProfile = useAuthStore.getState().profile;
        if (!updatedUser || !updatedProfile || (updatedProfile.role !== 'agent' && updatedProfile.role !== 'admin')) {
          navigate('/agent-login');
        } else {
          loadMarketingPlans(updatedUser.id);
        }
      }).catch((err) => {
        setError('Failed to initialize authentication. Please try again.');
      });
    } else if (user && profile && (profile.role === 'agent' || profile.role === 'admin')) {
      loadMarketingPlans(user.id);
    } else {
      navigate('/agent-login');
    }
  }, [user, profile, loading, initializeAuth, navigate]);

  useEffect(() => {
    if (!selectedPlanId && marketingPlans.length > 0) {
      const firstPlan = marketingPlans[0];
      setSelectedPlanId(firstPlan.id);
      setActivityLog((prev) => ({
        ...prev,
        suburb: firstPlan.suburb,
      }));
    } else if (!selectedPlanId && !marketingPlans.length) {
      setActivityLog((prev) => ({
        ...prev,
        suburb: '',
      }));
    }
  }, [marketingPlans, selectedPlanId]);

  const dashboardPath = profile?.role === 'admin' ? '/admin-dashboard' : '/agent-dashboard';

  const loadMarketingPlans = async (userId: string) => {
    if (isLoadingPlans) return;
    setIsLoadingPlans(true);
    try {
      setError(null);
      let query = supabase
        .from('marketing_plans')
        .select('id, agent, suburb, start_date, end_date, door_knock_streets, phone_call_streets')
        .order('updated_at', { ascending: false });

      if (profile?.role === 'agent') {
        query = query.eq('agent', userId);
      }
      // For admins, fetch all plans (no agent filter)

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch marketing plans: ${error.message}`);
      }

      const plans: MarketingPlan[] = data.map((plan) => ({
        id: plan.id,
        agent: plan.agent,
        suburb: plan.suburb || '',
        start_date: plan.start_date || '',
        end_date: plan.end_date || '',
        door_knock_streets: (plan.door_knock_streets || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          why: s.why,
          house_count: s.house_count,
          target_knocks: s.target_knocks,
          target_answers: s.target_answers,
          desktop_appraisals: s.desktop_appraisals || '0',
          face_to_face_appraisals: s.face_to_face_appraisals || '0',
        })),
        phone_call_streets: (plan.phone_call_streets || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          why: s.why,
          target_calls: s.target_calls,
          target_connects: s.target_connects || '0',
          desktop_appraisals: s.desktop_appraisals || '0',
          face_to_face_appraisals: s.face_to_face_appraisals || '0',
        })),
      }));

      setMarketingPlans(plans);
    } catch (err: any) {
      setError('Failed to load marketing plans. Please try again or create a new plan.');
      toast.error('Failed to load marketing plans');
    } finally {
      setIsLoadingPlans(false);
    }
  };

  useEffect(() => {
    const selectedPlan = marketingPlans.find((plan) => plan.id === selectedPlanId);
    if (selectedPlan && !isCustomStreet) {
      let availableStreets: string[] = [];
      if (activityLog.type === 'phone_call') {
        availableStreets = selectedPlan.phone_call_streets.map((street) => street.name);
      } else if (activityLog.type === 'door_knock') {
        availableStreets = selectedPlan.door_knock_streets.map((street) => street.name);
      }
      if (availableStreets.length > 0) {
        const randomStreet = availableStreets[Math.floor(Math.random() * availableStreets.length)];
        setRecommendedStreet(randomStreet);
        setActivityLog((prev) => ({
          ...prev,
          street_name: randomStreet,
          suburb: selectedPlan.suburb,
        }));
      } else {
        setRecommendedStreet(null);
        setActivityLog((prev) => ({
          ...prev,
          street_name: 'Main Street',
          suburb: selectedPlan.suburb,
        }));
      }
    } else if (selectedPlan) {
      setActivityLog((prev) => ({
        ...prev,
        suburb: selectedPlan.suburb,
      }));
    }
  }, [activityLog.type, selectedPlanId, marketingPlans, isCustomStreet]);

  const validateActivityForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!activityLog.suburb.trim()) newErrors.suburb = 'Please select a suburb';
    if (!activityLog.street_name.trim()) newErrors.street_name = 'Please select or enter a street name';

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
      if (!activityLog.calls_connected || parseInt(activityLog.calls_connected) <= 0) {
        newErrors.calls_connected = 'Please enter at least 1 call connected';
      } else if (isNaN(parseInt(activityLog.calls_connected)) || parseInt(activityLog.calls_connected) < 0) {
        newErrors.calls_connected = 'Please enter a valid number (e.g., 1 or 5)';
      }
      if (
        activityLog.calls_answered &&
        (isNaN(parseInt(activityLog.calls_answered)) || parseInt(activityLog.calls_answered) < 0)
      ) {
        newErrors.calls_answered = 'Please enter a valid number (e.g., 0 or 3)';
      }
      if (
        activityLog.desktop_appraisals &&
        (isNaN(parseInt(activityLog.desktop_appraisals)) || parseInt(activityLog.desktop_appraisals) < 0)
      ) {
        newErrors.desktop_appraisals = 'Please enter a valid number (e.g., 0 or 2)';
      }
      if (
        activityLog.face_to_face_appraisals &&
        (isNaN(parseInt(activityLog.face_to_face_appraisals)) || parseInt(activityLog.face_to_face_appraisals) < 0)
      ) {
        newErrors.face_to_face_appraisals = 'Please enter a valid number (e.g., 0 or 1)';
      }
      if (
        activityLog.calls_connected &&
        activityLog.calls_answered &&
        parseInt(activityLog.calls_answered) > parseInt(activityLog.calls_connected)
      ) {
        newErrors.calls_answered = 'Cannot be more than calls connected';
      }
    } else if (activityLog.type === 'door_knock') {
      if (!activityLog.knocks_made || parseInt(activityLog.knocks_made) <= 0) {
        newErrors.knocks_made = 'Please enter at least 1 knock made';
      } else if (isNaN(parseInt(activityLog.knocks_made)) || parseInt(activityLog.knocks_made) < 0) {
        newErrors.knocks_made = 'Please enter a valid number (e.g., 1 or 15)';
      }
      if (
        activityLog.knocks_answered &&
        (isNaN(parseInt(activityLog.knocks_answered)) || parseInt(activityLog.knocks_answered) < 0)
      ) {
        newErrors.knocks_answered = 'Please enter a valid number (e.g., 0 or 5)';
      }
      if (
        activityLog.desktop_appraisals &&
        (isNaN(parseInt(activityLog.desktop_appraisals)) || parseInt(activityLog.desktop_appraisals) < 0)
      ) {
        newErrors.desktop_appraisals = 'Please enter a valid number (e.g., 0 or 2)';
      }
      if (
        activityLog.face_to_face_appraisals &&
        (isNaN(parseInt(activityLog.face_to_face_appraisals)) || parseInt(activityLog.face_to_face_appraisals) < 0)
      ) {
        newErrors.face_to_face_appraisals = 'Please enter a valid number (e.g., 0 or 1)';
      }
      if (
        activityLog.knocks_made &&
        activityLog.knocks_answered &&
        parseInt(activityLog.knocks_answered) > parseInt(activityLog.knocks_made)
      ) {
        newErrors.knocks_answered = 'Cannot be more than knocks made';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleActivitySubmit = async () => {
    if (!validateActivityForm()) {
      toast.error('Please fix the errors in the activity form before submitting.');
      return;
    }

    if (!user?.id) {
      toast.error('User not authenticated. Please log in.');
      navigate('/agent-login');
      return;
    }

    if (activityLog.submitting) {
      toast.error('Submission in progress. Please wait.');
      return;
    }

    setActivityLog({ ...activityLog, submitting: true });

    try {
      const { data: { user: supabaseUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !supabaseUser) {
        throw new Error('Failed to verify authenticated user: ' + (authError?.message || 'No user found'));
      }

      console.log('User ID from useAuthStore:', user.id);
      console.log('Authenticated User ID from Supabase:', supabaseUser.id);
      if (user.id !== supabaseUser.id) {
        throw new Error('Mismatch between useAuthStore user ID and Supabase authenticated user ID');
      }

      const activity = {
        agent_id: user.id, // Use the authenticated user's ID
        activity_type: activityLog.type,
        activity_date: new Date(activityLog.date).toISOString(),
        street_name: capitalizeFirstLetter(activityLog.street_name.trim()),
        suburb: activityLog.suburb.trim(),
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

      console.log('Inserting activity:', activity);

      const { error: activityError } = await supabase.from('agent_activities').insert([activity]);

      if (activityError) {
        console.error('Supabase insert error:', activityError);
        if (activityError.message.includes('violates row-level security policy')) {
          throw new Error('You do not have permission to log this activity. Please ensure your account is correctly set up or contact your administrator.');
        }
        throw new Error(`Failed to log activity: ${activityError.message}`);
      }

      const selectedPlan = marketingPlans.find((plan) => plan.id === selectedPlanId);
      if (selectedPlan && !isCustomStreet) {
        let updatedStreets: PhoneCallStreet[] | DoorKnockStreet[];
        if (activityLog.type === 'phone_call') {
          updatedStreets = selectedPlan.phone_call_streets.map((street) =>
            street.name === activityLog.street_name
              ? {
                  ...street,
                  desktop_appraisals: String(
                    parseInt(street.desktop_appraisals || '0') +
                    parseInt(activityLog.desktop_appraisals || '0')
                  ),
                  face_to_face_appraisals: String(
                    parseInt(street.face_to_face_appraisals || '0') +
                    parseInt(activityLog.face_to_face_appraisals || '0')
                  ),
                }
              : street
          );
        } else {
          updatedStreets = selectedPlan.door_knock_streets.map((street) =>
            street.name === activityLog.street_name
              ? {
                  ...street,
                  desktop_appraisals: String(
                    parseInt(street.desktop_appraisals || '0') +
                    parseInt(activityLog.desktop_appraisals || '0')
                  ),
                  face_to_face_appraisals: String(
                    parseInt(street.face_to_face_appraisals || '0') +
                    parseInt(activityLog.face_to_face_appraisals || '0')
                  ),
                }
              : street
          );
        }

        const updateData =
          activityLog.type === 'phone_call'
            ? { phone_call_streets: updatedStreets }
            : { door_knock_streets: updatedStreets };

        const { error: updateError } = await supabase
          .from('marketing_plans')
          .update({
            ...updateData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', selectedPlan.id);

        if (updateError) {
          console.error('Supabase update error:', updateError);
          throw new Error(`Failed to update marketing plan: ${updateError.message}`);
        }

        setMarketingPlans((prev) =>
          prev.map((plan) =>
            plan.id === selectedPlan.id
              ? {
                  ...plan,
                  ...(activityLog.type === 'phone_call' && { phone_call_streets: updatedStreets as PhoneCallStreet[] }),
                  ...(activityLog.type === 'door_knock' && { door_knock_streets: updatedStreets as DoorKnockStreet[] }),
                }
              : plan
          )
        );
      }

      const submittedLog: ActivityLog = {
        type: activityLog.type,
        street_name: capitalizeFirstLetter(activityLog.street_name.trim()),
        suburb: activityLog.suburb.trim(),
        date: activityLog.date,
        calls_connected: activityLog.calls_connected,
        calls_answered: activityLog.calls_answered,
        knocks_made: activityLog.knocks_made,
        knocks_answered: activityLog.knocks_answered,
        desktop_appraisals: activityLog.desktop_appraisals,
        face_to_face_appraisals: activityLog.face_to_face_appraisals,
        notes: activityLog.notes.trim() || 'No notes provided',
        submitting: false,
      };

      setSuccess(activityLog.type);
      setShowReport(true);
      toast.success('Activity logged successfully!');

      setActivityLog({
        type: activityLog.type,
        street_name: 'Main Street',
        suburb: marketingPlans.find((plan) => plan.id === selectedPlanId)?.suburb || '',
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
      setIsCustomStreet(true);

      setActivityLog(submittedLog);
    } catch (err: any) {
      console.error('Error logging activity:', err);
      const errorMessage = err.message || 'An unexpected error occurred while logging the activity.';
      toast.error(errorMessage);
      setError(errorMessage);
    } finally {
      setActivityLog((prev) => ({ ...prev, submitting: false }));
    }
  };

  const handleStreetSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const plan = marketingPlans.find(p => p.id === selectedPlanId);
    
    if (value === 'custom') {
      setIsCustomStreet(true);
      setActivityLog(prev => ({ ...prev, street_name: '' }));
    } else if (plan) {
      setIsCustomStreet(false);
      const streetExists = activityLog.type === 'door_knock'
        ? plan.door_knock_streets.some(s => s.name === value)
        : plan.phone_call_streets.some(s => s.name === value);
      
      if (streetExists) {
        setActivityLog(prev => ({ ...prev, street_name: value }));
      } else {
        toast.error('Selected street not found in marketing plan');
      }
    }
  };

  const getAvailableStreets = () => {
    const selectedPlan = marketingPlans.find((plan) => plan.id === selectedPlanId);
    if (!selectedPlan) return [];
    if (activityLog.type === 'phone_call') {
      return selectedPlan.phone_call_streets.map((street) => street.name);
    } else if (activityLog.type === 'door_knock') {
      return selectedPlan.door_knock_streets.map((street) => street.name);
    }
    return [];
  };

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

  // Updated role check to allow both agent and admin
  if (!profile || (profile.role !== 'agent' && profile.role !== 'admin')) {
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
            <p className="text-xl font-semibold text-red-600">Access denied. Agents or Admins only.</p>
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

  if (!marketingPlans.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <svg className="w-16 h-16 mx-auto mb-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xl font-semibold text-yellow-600">
              No marketing plans found. Please create a marketing plan to log activities.
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
    console.log('Rendering ActivityLogReport with log:', activityLog);
    return (
      <ActivityLogReport
        log={activityLog}
        planId={selectedPlanId}
        onBack={() => {
          setShowReport(false);
          setSuccess(null);
        }}
        onDashboard={() => navigate(dashboardPath)}
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
            className="mb-8 flex gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <motion.button
              onClick={() => navigate(dashboardPath)}
              className="flex items-center px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-full hover:from-green-700 hover:to-green-800 transition-all shadow-md"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Back to dashboard"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </motion.button>
            <motion.button
              onClick={() => navigate('/progress-report')}
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

          {recommendedStreet && !isCustomStreet && (
            <motion.div
              className="mb-8 p-4 bg-blue-100 rounded-lg flex items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <p className="text-blue-600">
                Recommended Street: <strong>{recommendedStreet}</strong> (Suburb:{' '}
                {marketingPlans.find((plan) => plan.id === selectedPlanId)?.suburb})
              </p>
            </motion.div>
          )}

          <motion.div
            className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 max-w-md hover:shadow-xl transition-all duration-300"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">Log Activity</h2>
            <div className="space-y-6">
              <div>
                <label className="block text-gray-800 font-semibold mb-2">Select Marketing Plan *</label>
                <select
                  value={selectedPlanId || ''}
                  onChange={(e) => {
                    const planId = e.target.value;
                    const plan = marketingPlans.find((p) => p.id === planId);
                    if (plan) {
                      setSelectedPlanId(plan.id);
                      setActivityLog((prev) => ({
                        ...prev,
                        suburb: plan.suburb,
                        street_name: 'Main Street',
                      }));
                      setIsCustomStreet(true);
                    } else {
                      setSelectedPlanId(null);
                      setActivityLog((prev) => ({
                        ...prev,
                        suburb: '',
                        street_name: 'Main Street',
                      }));
                    }
                    validateActivityForm();
                  }}
                  className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                  aria-label="Select marketing plan"
                >
                  <option value="">Select a marketing plan</option>
                  {marketingPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.suburb} ({new Date(plan.start_date).toLocaleDateString('en-AU')} -{' '}
                      {new Date(plan.end_date).toLocaleDateString('en-AU')})
                    </option>
                  ))}
                </select>
                {errors.suburb && (
                  <p className="text-red-600 text-sm mt-1 font-medium flex items-center">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {errors.suburb}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-gray-800 font-semibold mb-2">Activity Type *</label>
                <select
                  value={activityLog.type}
                  onChange={(e) => {
                    setActivityLog({
                      ...activityLog,
                      type: e.target.value as 'phone_call' | 'door_knock',
                      street_name: 'Main Street',
                      calls_connected: '',
                      calls_answered: '',
                      knocks_made: '',
                      knocks_answered: '',
                      desktop_appraisals: '',
                      face_to_face_appraisals: '',
                    });
                    setIsCustomStreet(true);
                    validateActivityForm();
                  }}
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
                  onChange={(e) => {
                    setActivityLog({ ...activityLog, date: e.target.value });
                    validateActivityForm();
                  }}
                  max={getCurrentUTCDate()}
                  min="2024-01-01"
                  className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                  placeholder="e.g., 2025-05-21"
                  aria-label="Select date"
                />
                {errors.date && (
                  <p className="text-red-600 text-sm mt-1 font-medium flex items-center">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {errors.date}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-gray-800 font-semibold mb-2">Suburb *</label>
                <input
                  type="text"
                  value={activityLog.suburb}
                  readOnly
                  className="w-full p-3 border border-gray-200 rounded-lg bg-gray-100"
                  aria-label="Suburb (read-only)"
                />
                {errors.suburb && (
                  <p className="text-red-600 text-sm mt-1 font-medium flex items-center">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {errors.suburb}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-gray-800 font-semibold mb-2">Street Name *</label>
                <select
                  value={isCustomStreet ? 'custom' : activityLog.street_name}
                  onChange={handleStreetSelect}
                  className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                  aria-label="Select street name"
                >
                  <option value="">Select a street</option>
                  {getAvailableStreets().map((street) => (
                    <option key={street} value={street}>
                      {street}
                    </option>
                  ))}
                  <option value="custom">Custom Street</option>
                </select>
                {isCustomStreet && (
                  <motion.input
                    type="text"
                    value={activityLog.street_name}
                    onChange={(e) => {
                      setActivityLog({
                        ...activityLog,
                        street_name: capitalizeFirstLetter(e.target.value),
                      });
                      validateActivityForm();
                    }}
                    className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50 mt-2"
                    placeholder="e.g., Main Street"
                    aria-label="Enter custom street name"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ duration: 0.3 }}
                  />
                )}
                {errors.street_name && (
                  <p className="text-red-600 text-sm mt-1 font-medium flex items-center">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {errors.street_name}
                  </p>
                )}
              </div>
              {activityLog.type === 'phone_call' && (
                <>
                  <div>
                    <label className="block text-gray-800 font-semibold mb-2">Calls Connected *</label>
                    <input
                      type="number"
                      value={activityLog.calls_connected}
                      onChange={(e) => {
                        setActivityLog({ ...activityLog, calls_connected: e.target.value });
                        validateActivityForm();
                      }}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                      placeholder="e.g., 3"
                      min="1"
                      step="1"
                      aria-label="Enter calls connected"
                    />
                    {errors.calls_connected && (
                      <p className="text-red-600 text-sm mt-1 font-medium flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.calls_connected}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-gray-800 font-semibold mb-2">Calls Answered</label>
                    <input
                      type="number"
                      value={activityLog.calls_answered}
                      onChange={(e) => {
                        setActivityLog({ ...activityLog, calls_answered: e.target.value });
                        validateActivityForm();
                      }}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                      placeholder="e.g., 2"
                      min="0"
                      step="1"
                      aria-label="Enter calls answered"
                    />
                    {errors.calls_answered && (
                      <p className="text-red-600 text-sm mt-1 font-medium flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.calls_answered}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-gray-800 font-semibold mb-2">Desktop Appraisals</label>
                    <input
                      type="number"
                      value={activityLog.desktop_appraisals}
                      onChange={(e) => {
                        setActivityLog({ ...activityLog, desktop_appraisals: e.target.value });
                        validateActivityForm();
                      }}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                      placeholder="e.g., 2"
                      min="0"
                      step="1"
                      aria-label="Enter desktop appraisals"
                    />
                    {errors.desktop_appraisals && (
                      <p className="text-red-600 text-sm mt-1 font-medium flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.desktop_appraisals}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-gray-800 font-semibold mb-2">
                      Face-to-Face Appraisals
                    </label>
                    <input
                      type="number"
                      value={activityLog.face_to_face_appraisals}
                      onChange={(e) => {
                        setActivityLog({
                          ...activityLog,
                          face_to_face_appraisals: e.target.value,
                        });
                        validateActivityForm();
                      }}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                      placeholder="e.g., 1"
                      min="0"
                      step="1"
                      aria-label="Enter face-to-face appraisals"
                    />
                    {errors.face_to_face_appraisals && (
                      <p className="text-red-600 text-sm mt-1 font-medium flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.face_to_face_appraisals}
                      </p>
                    )}
                  </div>
                </>
              )}
              {activityLog.type === 'door_knock' && (
                <>
                  <div>
                    <label className="block text-gray-800 font-semibold mb-2">Knocks Made *</label>
                    <input
                      type="number"
                      value={activityLog.knocks_made}
                      onChange={(e) => {
                        setActivityLog({ ...activityLog, knocks_made: e.target.value });
                        validateActivityForm();
                      }}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                      placeholder="e.g., 15"
                      min="1"
                      step="1"
                      aria-label="Enter knocks made"
                    />
                    {errors.knocks_made && (
                      <p className="text-red-600 text-sm mt-1 font-medium flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.knocks_made}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-gray-800 font-semibold mb-2">Knocks Answered</label>
                    <input
                      type="number"
                      value={activityLog.knocks_answered}
                      onChange={(e) => {
                        setActivityLog({ ...activityLog, knocks_answered: e.target.value });
                        validateActivityForm();
                      }}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                      placeholder="e.g., 5"
                      min="0"
                      step="1"
                      aria-label="Enter knocks answered"
                    />
                    {errors.knocks_answered && (
                      <p className="text-red-600 text-sm mt-1 font-medium flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.knocks_answered}
                      </p>
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
                      onChange={(e) => {
                        setActivityLog({ ...activityLog, desktop_appraisals: e.target.value });
                        validateActivityForm();
                      }}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                      placeholder="e.g., 2"
                      min="0"
                      step="1"
                      aria-label="Enter desktop appraisals"
                    />
                    {errors.desktop_appraisals && (
                      <p className="text-red-600 text-sm mt-1 font-medium flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.desktop_appraisals}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-gray-800 font-semibold mb-2">
                      Face-to-Face Appraisals
                    </label>
                    <input
                      type="number"
                      value={activityLog.face_to_face_appraisals}
                      onChange={(e) => {
                        setActivityLog({
                          ...activityLog,
                          face_to_face_appraisals: e.target.value,
                        });
                        validateActivityForm();
                      }}
                      className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50"
                      placeholder="e.g., 1"
                      min="0"
                      step="1"
                      aria-label="Enter face-to-face appraisals"
                    />
                    {errors.face_to_face_appraisals && (
                      <p className="text-red-600 text-sm mt-1 font-medium flex items-center">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        {errors.face_to_face_appraisals}
                      </p>
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
                  <svg
                    className="w-5 h-5 mr-2 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 12a8 8 0 1116 0 8 8 0 01-16 0zm8-8v2m0 12v2m8-8h-2m-12 0H2m15.364 5.364l-1.414-1.414M5.05 5.05l1.414 1.414m12.728 0l-1.414 1.414M5.05 18.95l1.414-1.414"
                    />
                  </svg>
                ) : (
                  <Send className="w-5 h-5 mr-2" />
                )}
                {activityLog.submitting ? 'Logging...' : 'Log Activity'}
                {(success === 'phone_call' || success === 'door_knock') && (
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
            </div>
          </motion.div>
        </div>
      </div>
    </ErrorBoundary>
  );
}