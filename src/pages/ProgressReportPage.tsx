import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { Loader2, Trash2, Edit, Download, FileText, BarChart, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, BarElement, CategoryScale, LinearScale, PointElement, LineElement } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { generatePdf } from '../utils/pdfUtils';

ChartJS.register(ArcElement, Tooltip, Legend, BarElement, CategoryScale, LinearScale, PointElement, LineElement);

// Interfaces
interface DoorKnockStreet {
  id: string;
  name: string;
  why: string;
  house_count: string;
  target_knocks: string;
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
  target_connects: string;
  target_desktop_appraisals: string;
  target_face_to_face_appraisals: string;
}

interface StreetProgress {
  name: string;
  completedKnocks?: number;
  targetKnocks?: number;
  completedCalls?: number;
  targetCalls?: number;
  desktopAppraisals: number;
  faceToFaceAppraisals: number;
}

interface ActualProgress {
  doorKnocks: { completed: number; target: number; streets: StreetProgress[] };
  phoneCalls: { completed: number; target: number; streets: StreetProgress[] };
  connects: { completed: number; target: number };
  desktopAppraisals: { completed: number; target: number };
  faceToFaceAppraisals: { completed: number; target: number };
}

interface PlanProgress {
  id: string;
  suburb: string;
  doorKnocks: { completed: number; target: number };
  phoneCalls: { completed: number; target: number };
  connects: { completed: number; target: number };
  desktopAppraisals: { completed: number; target: number };
  faceToFaceAppraisals: { completed: number; target: number };
}
// Add at the top of the file
const calculatePercentage = (completed: number, target: number): number => {
  if (target === 0) return completed > 0 ? 100 : 0;
  return Math.min(Math.round((completed / target) * 100), 100);
};
const formatDate = (date: string) => {
  if (!date) return 'Not specified';
  return new Date(date).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};
// Add date range validation
const isDateRangeValid = (plan: MarketingPlan) => {
  if (!plan.start_date || !plan.end_date) return false;
  const start = new Date(plan.start_date);
  const end = new Date(plan.end_date);
  return start <= end;
};

// Enhanced progress calculation
const calculateStreetProgress = (streets: StreetProgress[]) => {
  return streets.reduce((acc, street) => {
    return {
      completed: acc.completed + (street.completedKnocks || street.completedCalls || 0),
      target: acc.target + (street.targetKnocks || street.targetCalls || 0),
      appraisals: {
        desktop: acc.appraisals.desktop + (street.desktopAppraisals || 0),
        faceToFace: acc.appraisals.faceToFace + (street.faceToFaceAppraisals || 0)
      }
    };
  }, { completed: 0, target: 0, appraisals: { desktop: 0, faceToFace: 0 } });
};
// Radial Progress Component
const RadialProgress = ({ percentage, color, label, completed, target }: {
  percentage: number;
  color: string;
  label: string;
  completed: number;
  target: number;
}) => (
  <motion.div
    className="relative flex flex-col items-center bg-gradient-to-br from-white to-gray-100 p-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 group"
    initial={{ scale: 0.95, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ duration: 0.3 }}
    role="progressbar"
    aria-valuenow={calculatePercentage(completed, target)}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-label={`${label} progress: ${calculatePercentage(completed, target)}%`}
  >
    <div className="relative">
      <svg className="w-32 h-32" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={`${calculatePercentage(completed, target) * 2.51} 251`}
          strokeDashoffset="0"
          transform="rotate(-90 50 50)"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
        <span className="text-lg font-bold text-gray-800">{calculatePercentage(completed, target)}%</span>
      </div>
    </div>
    <p className="mt-2 text-sm font-medium text-gray-600">{label}</p>
    <p className="text-xs text-gray-500 font-semibold">
      {completed}/{target}
    </p>
    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded-md py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      {label}: {completed}/{target} ({calculatePercentage(completed, target)}%)
    </div>
  </motion.div>
);

// Error Boundary Component
const ErrorBoundary = ({ children, error }: { children: React.ReactNode; error: string | null }) => {
  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-6 rounded-2xl shadow-2xl"
      >
        <h1 className="text-4xl font-extrabold text-gray-900 mb-4">Progress Report</h1>
        <p className="text-red-600 font-medium">{error}</p>
      </motion.div>
    );
  }
  return <>{children}</>;
};

export function ProgressReportPage() {
  const { user, profile } = useAuthStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [actualProgress, setActualProgress] = useState<ActualProgress>({
    doorKnocks: { completed: 0, target: 0, streets: [] },
    phoneCalls: { completed: 0, target: 0, streets: [] },
    connects: { completed: 0, target: 0 },
    desktopAppraisals: { completed: 0, target: 0 },
    faceToFaceAppraisals: { completed: 0, target: 0 },
  });
  const [overallProgress, setOverallProgress] = useState<ActualProgress>({
    doorKnocks: { completed: 0, target: 0, streets: [] },
    phoneCalls: { completed: 0, target: 0, streets: [] },
    connects: { completed: 0, target: 0 },
    desktopAppraisals: { completed: 0, target: 0 },
    faceToFaceAppraisals: { completed: 0, target: 0 },
  });
  const [marketingPlans, setMarketingPlans] = useState<MarketingPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<MarketingPlan | null>(null);
  const [viewMode, setViewMode] = useState<'suburb' | 'overall'>('suburb');
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<MarketingPlan | null>(null);
  const [showPDFPreview, setShowPDFPreview] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const [planProgresses, setPlanProgresses] = useState<PlanProgress[]>([]);
  

  // Memoized functions
  const loadMarketingPlans = useCallback(async (userId: string) => {
    try {
    let query = supabase.from('marketing_plans').select('*').order('updated_at', { ascending: false });
    if (profile.role === 'agent') {
      query = query.eq('agent', userId);
    }
    const { data, error } = await query;

      if (error) throw new Error(`Failed to load marketing plans: ${error.message}`);

      const plans: MarketingPlan[] = data.map((plan) => ({
        id: plan.id,
        agent: plan.agent,
        suburb: plan.suburb || 'Not specified',
        start_date: plan.start_date || '',
        end_date: plan.end_date || '',
        door_knock_streets: (plan.door_knock_streets || []).map((s: any) => ({
          ...s,
          id: s.id || uuidv4(),
        })),
        phone_call_streets: (plan.phone_call_streets || []).map((s: any) => ({
          ...s,
          id: s.id || uuidv4(),
        })),
        target_connects: plan.target_connects || '0',
        target_desktop_appraisals: plan.target_desktop_appraisals || '0',
        target_face_to_face_appraisals: plan.target_face_to_face_appraisals || '0',
      }));

      setMarketingPlans(plans);
      if (plans.length > 0 && !selectedPlan) {
        setSelectedPlan(plans[0]);
        await fetchActualProgress(userId, plans[0]);
      } else if (!plans.length) {
        setSelectedPlan(null);
      }
      await fetchPlanProgresses(userId);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [profile,selectedPlan]);

  const fetchActualProgress = useCallback(async (agentId: string, plan: MarketingPlan) => {
  try {
    // Validate plan data
    if (!plan?.suburb?.trim()) throw new Error('Invalid marketing plan: Suburb is missing.');

    const { data: activities, error } = await supabase
      .from('agent_activities')
      .select('activity_type, street_name, suburb, knocks_made, calls_connected, calls_answered, desktop_appraisals, face_to_face_appraisals, activity_date')
      .eq('agent_id', agentId)
      .eq('suburb', plan.suburb.trim())
      .gte('activity_date', plan.start_date)
      .lte('activity_date', plan.end_date);

    if (error) throw new Error(`Failed to fetch activities: ${error.message}`);

    // Calculate targets with validation
    const totalTargetKnocks = plan.door_knock_streets.reduce(
      (sum, street) => sum + (parseInt(street.target_knocks || '0', 10) || 0),
      0
    );
    const totalTargetCalls = plan.phone_call_streets.reduce(
      (sum, street) => sum + (parseInt(street.target_calls || '0', 10) || 0),
      0
    );
    const totalTargetConnects = parseInt(plan.target_connects || '0', 10) || 0;
    const totalTargetDesktopAppraisals = parseInt(plan.target_desktop_appraisals || '0', 10) || 0;
    const totalTargetFaceToFaceAppraisals = parseInt(plan.target_face_to_face_appraisals || '0', 10) || 0;

    // Initialize street progress with validation
    const doorKnockStreetProgress: StreetProgress[] = plan.door_knock_streets.map((street) => ({
      name: street.name?.trim() || 'Unknown',
      completedKnocks: 0,
      targetKnocks: parseInt(street.target_knocks || '0', 10) || 0,
      desktopAppraisals: 0,
      faceToFaceAppraisals: 0,
    }));
    const phoneCallStreetProgress: StreetProgress[] = plan.phone_call_streets.map((street) => ({
      name: street.name?.trim() || 'Unknown',
      completedCalls: 0,
      targetCalls: parseInt(street.target_calls || '0', 10) || 0,
      desktopAppraisals: 0,
      faceToFaceAppraisals: 0,
    }));

    const progress = activities?.length
      ? activities.reduce(
          (acc, activity) => {
            const streetName = activity.street_name?.trim()?.toLowerCase();
            const activitySuburb = activity.suburb?.trim()?.toLowerCase();
            if (!streetName || !activitySuburb || activitySuburb !== plan.suburb.trim().toLowerCase()) {
              return acc; // Skip invalid activities
            }

            if (activity.activity_type === 'door_knock') {
              acc.doorKnocks.completed += activity.knocks_made || 0;
              acc.desktopAppraisals.completed += parseInt(activity.desktop_appraisals || '0', 10) || 0;
              acc.faceToFaceAppraisals.completed += parseInt(activity.face_to_face_appraisals || '0', 10) || 0;
              const street = acc.doorKnocks.streets.find((s) => s.name.trim().toLowerCase() === streetName);
              if (street) {
                street.completedKnocks = (street.completedKnocks || 0) + (activity.knocks_made || 0);
                street.desktopAppraisals += parseInt(activity.desktop_appraisals || '0', 10) || 0;
                street.faceToFaceAppraisals += parseInt(activity.face_to_face_appraisals || '0', 10) || 0;
              }
            } else if (activity.activity_type === 'phone_call') {
              acc.phoneCalls.completed += activity.calls_connected || 0;
              acc.connects.completed += activity.calls_answered || 0;
              acc.desktopAppraisals.completed += parseInt(activity.desktop_appraisals || '0', 10) || 0;
              acc.faceToFaceAppraisals.completed += parseInt(activity.face_to_face_appraisals || '0', 10) || 0;
              const street = acc.phoneCalls.streets.find((s) => s.name.trim().toLowerCase() === streetName);
              if (street) {
                street.completedCalls = (street.completedCalls || 0) + (activity.calls_connected || 0);
                street.desktopAppraisals += parseInt(activity.desktop_appraisals || '0', 10) || 0;
                street.faceToFaceAppraisals += parseInt(activity.face_to_face_appraisals || '0', 10) || 0;
              }
            }
            return acc;
          },
          {
            doorKnocks: { completed: 0, target: totalTargetKnocks, streets: doorKnockStreetProgress },
            phoneCalls: { completed: 0, target: totalTargetCalls, streets: phoneCallStreetProgress },
            connects: { completed: 0, target: totalTargetConnects },
            desktopAppraisals: { completed: 0, target: totalTargetDesktopAppraisals },
            faceToFaceAppraisals: { completed: 0, target: totalTargetFaceToFaceAppraisals },
          }
        )
      : {
          doorKnocks: { completed: 0, target: totalTargetKnocks, streets: doorKnockStreetProgress },
          phoneCalls: { completed: 0, target: totalTargetCalls, streets: phoneCallStreetProgress },
          connects: { completed: 0, target: totalTargetConnects },
          desktopAppraisals: { completed: 0, target: totalTargetDesktopAppraisals },
          faceToFaceAppraisals: { completed: 0, target: totalTargetFaceToFaceAppraisals },
        };

    setActualProgress(progress);
  } catch (err) {
    console.error('Error in fetchActualProgress:', err);
    setError(`Unable to fetch progress for ${plan.suburb}: ${(err as Error).message}`);
  }
}, []);

  const fetchOverallProgress = useCallback(async (agentId: string) => {
    try {
      const { data: activities, error } = await supabase
        .from('agent_activities')
        .select('activity_type, street_name, suburb, knocks_made, calls_connected, calls_answered, desktop_appraisals, face_to_face_appraisals')
        .eq('agent_id', agentId);

      if (error) throw new Error(`Failed to fetch activities: ${error.message}`);

      const totalTargetKnocks = marketingPlans.reduce(
        (sum, plan) =>
          sum + plan.door_knock_streets.reduce(
            (streetSum, street) => streetSum + parseInt(street.target_knocks || '0', 10),
            0
          ),
        0
      );
      const totalTargetCalls = marketingPlans.reduce(
        (sum, plan) =>
          sum + plan.phone_call_streets.reduce(
            (streetSum, street) => streetSum + parseInt(street.target_calls || '0', 10),
            0
          ),
        0
      );
      const totalTargetConnects = marketingPlans.reduce(
        (sum, plan) => sum + parseInt(plan.target_connects || '0', 10),
        0
      );
      const totalTargetDesktopAppraisals = marketingPlans.reduce(
        (sum, plan) => sum + parseInt(plan.target_desktop_appraisals || '0', 10),
        0
      );
      const totalTargetFaceToFaceAppraisals = marketingPlans.reduce(
        (sum, plan) => sum + parseInt(plan.target_face_to_face_appraisals || '0', 10),
        0
      );

      const streetProgressMap: { [key: string]: StreetProgress } = {};
      marketingPlans.forEach((plan) => {
        plan.door_knock_streets.forEach((street) => {
          const key = `door_${plan.suburb}_${street.name.trim()}`;
          streetProgressMap[key] = streetProgressMap[key] || {
            name: `${plan.suburb}: ${street.name}`,
            completedKnocks: 0,
            targetKnocks: parseInt(street.target_knocks || '0', 10),
            desktopAppraisals: 0,
            faceToFaceAppraisals: 0,
          };
        });
        plan.phone_call_streets.forEach((street) => {
          const key = `phone_${plan.suburb}_${street.name.trim()}`;
          streetProgressMap[key] = streetProgressMap[key] || {
            name: `${plan.suburb}: ${street.name}`,
            completedCalls: 0,
            targetCalls: parseInt(street.target_calls || '0', 10),
            desktopAppraisals: 0,
            faceToFaceAppraisals: 0,
          };
        });
      });

      const doorKnockStreetProgress = Object.values(streetProgressMap).filter((s) => s.name.includes('door_'));
      const phoneCallStreetProgress = Object.values(streetProgressMap).filter((s) => s.name.includes('phone_'));

      const progress = activities?.length
        ? activities.reduce(
            (acc, activity) => {
              const streetName = activity.street_name?.trim();
              const suburb = activity.suburb?.trim();
              if (activity.activity_type === 'door_knock' && streetName && suburb) {
                acc.doorKnocks.completed += activity.knocks_made || 0;
                acc.desktopAppraisals.completed += parseInt(activity.desktop_appraisals || '0', 10);
                acc.faceToFaceAppraisals.completed += parseInt(activity.face_to_face_appraisals || '0', 10);
                const street = acc.doorKnocks.streets.find((s) => s.name.trim() === `${suburb}: ${streetName}`);
                if (street) {
                  street.completedKnocks = (street.completedKnocks || 0) + (activity.knocks_made || 0);
                  street.desktopAppraisals += parseInt(activity.desktop_appraisals || '0', 10);
                  street.faceToFaceAppraisals += parseInt(activity.face_to_face_appraisals || '0', 10);
                }
              } else if (activity.activity_type === 'phone_call' && streetName && suburb) {
                acc.phoneCalls.completed += activity.calls_connected || 0;
                acc.connects.completed += activity.calls_answered || 0;
                acc.desktopAppraisals.completed += parseInt(activity.desktop_appraisals || '0', 10);
                acc.faceToFaceAppraisals.completed += parseInt(activity.face_to_face_appraisals || '0', 10);
                const street = acc.phoneCalls.streets.find((s) => s.name.trim() === `${suburb}: ${streetName}`);
                if (street) {
                  street.completedCalls = (street.completedCalls || 0) + (activity.calls_connected || 0);
                  street.desktopAppraisals += parseInt(activity.desktop_appraisals || '0', 10);
                  street.faceToFaceAppraisals += parseInt(activity.face_to_face_appraisals || '0', 10);
                }
              }
              return acc;
            },
            {
              doorKnocks: { completed: 0, target: totalTargetKnocks, streets: doorKnockStreetProgress },
              phoneCalls: { completed: 0, target: totalTargetCalls, streets: phoneCallStreetProgress },
              connects: { completed: 0, target: totalTargetConnects },
              desktopAppraisals: { completed: 0, target: totalTargetDesktopAppraisals },
              faceToFaceAppraisals: { completed: 0, target: totalTargetFaceToFaceAppraisals },
            }
          )
        : {
            doorKnocks: { completed: 0, target: totalTargetKnocks, streets: doorKnockStreetProgress },
            phoneCalls: { completed: 0, target: totalTargetCalls, streets: phoneCallStreetProgress },
            connects: { completed: 0, target: totalTargetConnects },
            desktopAppraisals: { completed: 0, target: totalTargetDesktopAppraisals },
            faceToFaceAppraisals: { completed: 0, target: totalTargetFaceToFaceAppraisals },
          };

      setOverallProgress(progress);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [marketingPlans]);

  const fetchPlanProgresses = useCallback(async (agentId: string) => {
  try {
    // Fetch all activities for the agent
    const { data: activities, error } = await supabase
      .from('agent_activities')
      .select('activity_type, suburb, knocks_made, calls_connected, calls_answered, desktop_appraisals, face_to_face_appraisals')
      .eq('agent_id', agentId);

    if (error) throw new Error(`Failed to fetch activities: ${error.message}`);

    // Group activities by suburb
    const activitiesBySuburb = activities?.reduce((acc, activity) => {
      const suburb = activity.suburb?.trim()?.toLowerCase();
      if (suburb) {
        acc[suburb] = acc[suburb] || [];
        acc[suburb].push(activity);
      }
      return acc;
    }, {} as { [key: string]: any[] }) || {};

    const progresses: PlanProgress[] = marketingPlans.map((plan) => {
      const suburb = plan.suburb.trim().toLowerCase();
      const planActivities = activitiesBySuburb[suburb] || [];

      const totalTargetKnocks = plan.door_knock_streets.reduce(
        (sum, street) => sum + (parseInt(street.target_knocks || '0', 10) || 0),
        0
      );
      const totalTargetCalls = plan.phone_call_streets.reduce(
        (sum, street) => sum + (parseInt(street.target_calls || '0', 10) || 0),
        0
      );
      const totalTargetConnects = parseInt(plan.target_connects || '0', 10) || 0;
      const totalTargetDesktopAppraisals = parseInt(plan.target_desktop_appraisals || '0', 10) || 0;
      const totalTargetFaceToFaceAppraisals = parseInt(plan.target_face_to_face_appraisals || '0', 10) || 0;

      const progress = planActivities.length
        ? planActivities.reduce(
            (acc, activity) => {
              if (activity.activity_type === 'door_knock') {
                acc.doorKnocks.completed += activity.knocks_made || 0;
                acc.desktopAppraisals.completed += parseInt(activity.desktop_appraisals || '0', 10) || 0;
                acc.faceToFaceAppraisals.completed += parseInt(activity.face_to_face_appraisals || '0', 10) || 0;
              } else if (activity.activity_type === 'phone_call') {
                acc.phoneCalls.completed += activity.calls_connected || 0;
                acc.connects.completed += activity.calls_answered || 0;
                acc.desktopAppraisals.completed += parseInt(activity.desktop_appraisals || '0', 10) || 0;
                acc.faceToFaceAppraisals.completed += parseInt(activity.face_to_face_appraisals || '0', 10) || 0;
              }
              return acc;
            },
            {
              doorKnocks: { completed: 0, target: totalTargetKnocks },
              phoneCalls: { completed: 0, target: totalTargetCalls },
              connects: { completed: 0, target: totalTargetConnects },
              desktopAppraisals: { completed: 0, target: totalTargetDesktopAppraisals },
              faceToFaceAppraisals: { completed: 0, target: totalTargetFaceToFaceAppraisals },
            }
          )
        : {
            doorKnocks: { completed: 0, target: totalTargetKnocks },
            phoneCalls: { completed: 0, target: totalTargetCalls },
            connects: { completed: 0, target: totalTargetConnects },
            desktopAppraisals: { completed: 0, target: totalTargetDesktopAppraisals },
            faceToFaceAppraisals: { completed: 0, target: totalTargetFaceToFaceAppraisals },
          };

      return { id: plan.id, suburb: plan.suburb, ...progress };
    });

    setPlanProgresses(progresses);
  } catch (err) {
    console.error('Error in fetchPlanProgresses:', err);
    setError(`Unable to fetch plan progresses: ${(err as Error).message}`);
  }
}, [marketingPlans]);

  const deleteMarketingPlan = useCallback(async (planId: string) => {
    if (!user?.id) return;
    const plan = marketingPlans.find((p) => p.id === planId);
    if (!plan) return;
    setShowDeleteModal(false);
    setShowConfirmDeleteModal(true);
    setPlanToDelete(plan);
  }, [user, marketingPlans]);

  const confirmDeletePlan = useCallback(async () => {
    if (!planToDelete || !user?.id) return;

    try {
      const { error } = await supabase
        .from('marketing_plans')
        .delete()
        .eq('id', planToDelete.id)
        .eq('agent', user.id);

      if (error) throw new Error(`Failed to delete marketing plan: ${error.message}`);

      setMarketingPlans((prev) => prev.filter((plan) => plan.id !== planToDelete.id));
      if (selectedPlan?.id === planToDelete.id) {
        setSelectedPlan(marketingPlans.length > 1 ? marketingPlans.filter((p) => p.id !== planToDelete.id)[0] : null);
        if (marketingPlans.length > 1) {
          await fetchActualProgress(user.id, marketingPlans.filter((p) => p.id !== planToDelete.id)[0]);
        } else {
          setActualProgress({
            doorKnocks: { completed: 0, target: 0, streets: [] },
            phoneCalls: { completed: 0, target: 0, streets: [] },
            connects: { completed: 0, target: 0 },
            desktopAppraisals: { completed: 0, target: 0 },
            faceToFaceAppraisals: { completed: 0, target: 0 },
          });
        }
      }
      setPlanProgresses((prev) => prev.filter((p) => p.id !== planToDelete.id));
      setShowConfirmDeleteModal(false);
      setPlanToDelete(null);
      setNotification(`Marketing plan for ${planToDelete.suburb} deleted successfully.`);
      setTimeout(() => setNotification(null), 3000);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [user, planToDelete, selectedPlan, marketingPlans, fetchActualProgress]);

  const generateCSV = useCallback(() => {
  if (viewMode === 'suburb' && !selectedPlan) return;

  const headers = [
    'Suburb',
    'Start Date',
    'End Date',
    'Street Name',
    'Activity Type',
    'Completed',
    'Target',
    'Progress (%)',
    'Desktop Appraisals',
    'Face-to-Face Appraisals',
    'Reason',
  ];
  const rows: string[][] = [];

  if (viewMode === 'suburb' && selectedPlan) {
    selectedPlan.door_knock_streets.forEach((street) => {
      const progress = actualProgress.doorKnocks.streets.find((s) => s.name === street.name);
      rows.push([
        selectedPlan.suburb,
        formatDate(selectedPlan.start_date),
        formatDate(selectedPlan.end_date),
        street.name,
        'Door Knock',
        (progress?.completedKnocks || 0).toString(),
        (progress?.targetKnocks || 0).toString(),
        calculatePercentage(progress?.completedKnocks || 0, progress?.targetKnocks || 0).toString(),
        (progress?.desktopAppraisals || 0).toString(),
        (progress?.faceToFaceAppraisals || 0).toString(),
        street.why || '',
      ]);
    });

    selectedPlan.phone_call_streets.forEach((street) => {
      const progress = actualProgress.phoneCalls.streets.find((s) => s.name === street.name);
      rows.push([
        selectedPlan.suburb,
        formatDate(selectedPlan.start_date),
        formatDate(selectedPlan.end_date),
        street.name,
        'Phone Call',
        (progress?.completedCalls || 0).toString(),
        (progress?.targetCalls || 0).toString(),
        calculatePercentage(progress?.completedCalls || 0, progress?.targetCalls || 0).toString(),
        (progress?.desktopAppraisals || 0).toString(),
        (progress?.faceToFaceAppraisals || 0).toString(),
        street.why || '',
      ]);
    });

    rows.push([
      selectedPlan.suburb,
      formatDate(selectedPlan.start_date),
      formatDate(selectedPlan.end_date),
      'Total',
      'Calls Answered',
      actualProgress.connects.completed.toString(),
      actualProgress.connects.target.toString(),
      calculatePercentage(actualProgress.connects.completed, actualProgress.connects.target).toString(),
      actualProgress.desktopAppraisals.completed.toString(),
      actualProgress.faceToFaceAppraisals.completed.toString(),
      '',
    ]);
  } else {
    marketingPlans.forEach((plan) => {
      const planProgress = planProgresses.find((p) => p.id === plan.id);
      plan.door_knock_streets.forEach((street) => {
        const progress = actualProgress.doorKnocks.streets.find((s) => s.name.includes(`${plan.suburb}: ${street.name}`));
        rows.push([
          plan.suburb,
          formatDate(plan.start_date),
          formatDate(plan.end_date),
          street.name,
          'Door Knock',
          (progress?.completedKnocks || 0).toString(),
          (progress?.targetKnocks || 0).toString(),
          calculatePercentage(progress?.completedKnocks || 0, progress?.targetKnocks || 0).toString(),
          (progress?.desktopAppraisals || 0).toString(),
          (progress?.faceToFaceAppraisals || 0).toString(),
          street.why || '',
        ]);
      });

      plan.phone_call_streets.forEach((street) => {
        const progress = actualProgress.phoneCalls.streets.find((s) => s.name.includes(`${plan.suburb}: ${street.name}`));
        rows.push([
          plan.suburb,
          formatDate(plan.start_date),
          formatDate(plan.end_date),
          street.name,
          'Phone Call',
          (progress?.completedCalls || 0).toString(),
          (progress?.targetCalls || 0).toString(),
          calculatePercentage(progress?.completedCalls || 0, progress?.targetCalls || 0).toString(),
          (progress?.desktopAppraisals || 0).toString(),
          (progress?.faceToFaceAppraisals || 0).toString(),
          street.why || '',
        ]);
      });

      rows.push([
        plan.suburb,
        formatDate(plan.start_date),
        formatDate(plan.end_date),
        'Total',
        'Calls Answered',
        (planProgress?.connects.completed || 0).toString(),
        (planProgress?.connects.target || 0).toString(),
        calculatePercentage(planProgress?.connects.completed || 0, planProgress?.connects.target || 0).toString(),
        (planProgress?.desktopAppraisals.completed || 0).toString(),
        (planProgress?.faceToFaceAppraisals.completed || 0).toString(),
        '',
      ]);
    });
  }

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Progress_Report_${viewMode === 'suburb' && selectedPlan ? selectedPlan.suburb : 'Overall'}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}, [viewMode, selectedPlan, actualProgress, marketingPlans, planProgresses]);

  const formatDate = useCallback((date: string) => {
    if (!date) return 'Not specified';
    return new Date(date).toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }, []);

  const generatePDF = useCallback(async (download: boolean = false) => {
  if (viewMode === 'suburb' && !selectedPlan) {
    setError('No marketing plan selected for PDF generation.');
    return;
  }

  try {
    const head = [
      [
        'Suburb',
        'Start Date',
        'End Date',
        'Street Name',
        'Activity Type',
        'Completed',
        'Target',
        'Progress (%)',
        'Desktop Appraisals',
        'Face-to-Face Appraisals',
        'Reason',
      ],
    ];
    const body: any[][] = [];

    if (viewMode === 'suburb' && selectedPlan) {
      selectedPlan.door_knock_streets.forEach((street) => {
        const progress = actualProgress.doorKnocks.streets.find((s) => s.name === street.name);
        body.push([
          selectedPlan.suburb || 'N/A',
          formatDate(selectedPlan.start_date),
          formatDate(selectedPlan.end_date),
          street.name || 'N/A',
          'Door Knock',
          (progress?.completedKnocks || 0).toString(),
          (progress?.targetKnocks || 0).toString(),
          calculatePercentage(progress?.completedKnocks || 0, progress?.targetKnocks || 0).toString(),
          (progress?.desktopAppraisals || 0).toString(),
          (progress?.faceToFaceAppraisals || 0).toString(),
          street.why || '',
        ]);
      });

      selectedPlan.phone_call_streets.forEach((street) => {
        const progress = actualProgress.phoneCalls.streets.find((s) => s.name === street.name);
        body.push([
          selectedPlan.suburb || 'N/A',
          formatDate(selectedPlan.start_date),
          formatDate(selectedPlan.end_date),
          street.name || 'N/A',
          'Phone Call',
          (progress?.completedCalls || 0).toString(),
          (progress?.targetCalls || 0).toString(),
          calculatePercentage(progress?.completedCalls || 0, progress?.targetCalls || 0).toString(),
          (progress?.desktopAppraisals || 0).toString(),
          (progress?.faceToFaceAppraisals || 0).toString(),
          street.why || '',
        ]);
      });
    } else {
      marketingPlans.forEach((plan) => {
        const planProgress = planProgresses.find((p) => p.id === plan.id);
        plan.door_knock_streets.forEach((street) => {
          const progress = overallProgress.doorKnocks.streets.find((s) => s.name.includes(`${plan.suburb}: ${street.name}`));
          body.push([
            plan.suburb || 'N/A',
            formatDate(plan.start_date),
            formatDate(plan.end_date),
            street.name || 'N/A',
            'Door Knock',
            (progress?.completedKnocks || 0).toString(),
            (progress?.targetKnocks || 0).toString(),
            calculatePercentage(progress?.completedKnocks || 0, progress?.targetKnocks || 0).toString(),
            (progress?.desktopAppraisals || 0).toString(),
            (progress?.faceToFaceAppraisals || 0).toString(),
            street.why || '',
          ]);
        });

        plan.phone_call_streets.forEach((street) => {
          const progress = overallProgress.phoneCalls.streets.find((s) => s.name.includes(`${plan.suburb}: ${street.name}`));
          body.push([
            plan.suburb || 'N/A',
            formatDate(plan.start_date),
            formatDate(plan.end_date),
            street.name || 'N/A',
            'Phone Call',
            (progress?.completedCalls || 0).toString(),
            (progress?.targetCalls || 0).toString(),
            calculatePercentage(progress?.completedCalls || 0, progress?.targetCalls || 0).toString(),
            (progress?.desktopAppraisals || 0).toString(),
            (progress?.faceToFaceAppraisals || 0).toString(),
            street.why || '',
          ]);
        });
      });
    }

    const fileName = `Progress_Report_${viewMode === 'suburb' && selectedPlan ? selectedPlan.suburb : 'Overall'}_${new Date().toISOString().split('T')[0]}.pdf`;

    if (download) {
      await generatePdf('Marketing Progress Report', head, body, fileName, 'save');
      setNotification('PDF downloaded successfully.');
      setTimeout(() => setNotification(null), 3000);
    } else {
      const blob = await generatePdf('Marketing Progress Report', head, body, fileName, 'blob');
      if (blob) {
        const url = URL.createObjectURL(blob);
        setPdfPreviewUrl(url);
        setShowPDFPreview(true);
      } else {
        setError('Failed to generate PDF preview.');
      }
    }
  } catch (error) {
    console.error('Error in generatePDF:', error);
    setError(`Failed to generate PDF: ${(error as Error).message}`);
  }
}, [viewMode, selectedPlan, actualProgress, overallProgress, marketingPlans, planProgresses, formatDate]);

  // Memoized progress metrics
  const getProgressMetrics = useMemo(() => {
  const progress = viewMode === 'suburb' ? actualProgress : overallProgress;
  return [
    { label: 'Door Knocks', data: progress.doorKnocks, color: '#3B82F6' },
    { label: 'Phone Calls Connected', data: progress.phoneCalls, color: '#10B981' },
    { label: 'Calls Answered', data: progress.connects, color: '#8B5CF6' },
    { label: 'Desktop Appraisals', data: progress.desktopAppraisals, color: '#F59E0B' },
    { label: 'Face-to-Face Appraisals', data: progress.faceToFaceAppraisals, color: '#EF4444' },
  ].filter((item) => item.data.target > 0 || item.data.completed > 0);
}, [viewMode, actualProgress, overallProgress]);

  // Chart plugin
  const chartPlugin = {
    id: 'customPercentageAndLine',
    afterDatasetsDraw(chart: any) {
      const { ctx, data, scales } = chart;
      const xAxis = scales.x;
      const yAxis = scales.y;

      data.datasets[1].data.forEach((value: number, index: number) => {
        const target = data.datasets[0].data[index];
        const percentage = target ? Math.round((value / target) * 100) : 0;
        const meta = chart.getDatasetMeta(1);
        const bar = meta.data[index];
        if (bar) {
          ctx.save();
          ctx.font = 'bold 12px Helvetica';
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${percentage}%`, bar.x, bar.y + bar.height / 2);
          ctx.restore();
        }
      });

      if (data.datasets[1].data.length > 1) {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = '#1F2937';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        data.datasets[1].data.forEach((value: number, index: number) => {
          const meta = chart.getDatasetMeta(1);
          const bar = meta.data[index];
          if (bar) {
            const x = bar.x;
            const y = bar.y;
            if (index === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
        });
        ctx.stroke();
        ctx.restore();
      }
    },
  };

  // Chart data
  const planVsActualChartData = useMemo(() => ({
    labels: getProgressMetrics.map((item) => item.label),
    datasets: [
      {
        label: 'Target',
        data: getProgressMetrics.map((item) => item.data.target),
        backgroundColor: getProgressMetrics.map((item) => `${item.color}80`),
        borderColor: getProgressMetrics.map((item) => item.color),
        borderWidth: 1,
        barPercentage: 0.45,
        categoryPercentage: 0.45,
      },
      {
        label: 'Completed',
        data: getProgressMetrics.map((item) => item.data.completed),
        backgroundColor: getProgressMetrics.map((item) => item.color),
        borderColor: getProgressMetrics.map((item) => item.color),
        borderWidth: 1,
        barPercentage: 0.45,
        categoryPercentage: 0.45,
      },
    ],
  }), [getProgressMetrics]);

  const comparisonChartData = useMemo(() => ({
    labels: planProgresses.map((p) => p.suburb),
    datasets: [
      { label: 'Door Knocks Completed', data: planProgresses.map((p) => p.doorKnocks.completed), backgroundColor: '#3B82F6' },
      { label: 'Door Knocks Target', data: planProgresses.map((p) => p.doorKnocks.target), backgroundColor: '#93C5FD' },
      { label: 'Phone Calls Connected', data: planProgresses.map((p) => p.phoneCalls.completed), backgroundColor: '#10B981' },
      { label: 'Phone Calls Target', data: planProgresses.map((p) => p.phoneCalls.target), backgroundColor: '#6EE7B7' },
      { label: 'Calls Answered', data: planProgresses.map((p) => p.connects.completed), backgroundColor: '#8B5CF6' },
      { label: 'Calls Answered Target', data: planProgresses.map((p) => p.connects.target), backgroundColor: '#C4B5FD' },
      { label: 'Desktop Appraisals Completed', data: planProgresses.map((p) => p.desktopAppraisals.completed), backgroundColor: '#F59E0B' },
      { label: 'Desktop Appraisals Target', data: planProgresses.map((p) => p.desktopAppraisals.target), backgroundColor: '#FCD34D' },
      { label: 'Face-to-Face Appraisals Completed', data: planProgresses.map((p) => p.faceToFaceAppraisals.completed), backgroundColor: '#EF4444' },
      { label: 'Face-to-Face Appraisals Target', data: planProgresses.map((p) => p.faceToFaceAppraisals.target), backgroundColor: '#FCA5A5' },
    ],
  }), [planProgresses]);
  

  // Effect for initialization
  useEffect(() => {
    if (!user || !profile) {
      setError('Please log in to view the progress report.');
      setLoading(false);
      navigate('/agent-login');
      return;
    }

    if (profile.role !== 'agent' && profile.role !== 'admin') {
      setError('You must be an agent to view this page.');
      setLoading(false);
      navigate('/agent-login');
      return;
    }

    let debounceTimeout: NodeJS.Timeout;
    const initialize = async () => {
      try {
        await loadMarketingPlans(user.id);
        await fetchOverallProgress(user.id);

        const activitySubscription = supabase
          .channel('agent_activities_changes')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'agent_activities', filter: `agent_id=eq.${user.id}` },
            async () => {
              setNotification('Progress updated automatically.');
              clearTimeout(debounceTimeout);
              debounceTimeout = setTimeout(async () => {
                if (viewMode === 'suburb' && selectedPlan) {
                  await fetchActualProgress(user.id, selectedPlan);
                } else if (viewMode === 'overall') {
                  await fetchOverallProgress(user.id);
                }
                if (viewMode === 'overall' || planProgresses.length > 1) {
                  await fetchPlanProgresses(user.id);
                }
                setTimeout(() => setNotification(null), 3000);
              }, 500);
            }
          )
          .subscribe();

        const planSubscription = supabase
          .channel('marketing_plans_changes')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'marketing_plans', filter: `agent=eq.${user.id}` },
            async () => {
              setNotification('Marketing plans updated automatically.');
              clearTimeout(debounceTimeout);
              debounceTimeout = setTimeout(async () => {
                await loadMarketingPlans(user.id);
                setTimeout(() => setNotification(null), 3000);
              }, 500);
            }
          )
          .subscribe();

        return () => {
          clearTimeout(debounceTimeout);
          supabase.removeChannel(planSubscription);
          supabase.removeChannel(activitySubscription);
        };
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [user, profile, navigate, selectedPlan, viewMode, loadMarketingPlans, fetchActualProgress, fetchOverallProgress, fetchPlanProgresses]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        <p className="ml-4 text-gray-700">Loading progress report...</p>
      </div>
    );
  }

  if (!marketingPlans.length || !selectedPlan) {
    return (
      <div className="max-w-7xl mx-auto p-6 bg-gray-100 min-h-screen">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-2xl shadow-2xl"
        >
          <h1 className="text-4xl font-extrabold text-gray-900 mb-4">Progress Report</h1>
          <p className="text-gray-700 font-medium mb-4">
            No marketing plans found. Please create a marketing plan to view progress.
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => navigate('/marketing-plan')}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700"
            >
              Create Marketing Plan
            </button>
            <button
              onClick={() => navigate('/agent-dashboard')}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Back to Dashboard
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const shouldShowDoorKnocks = () => {
    if (viewMode === 'suburb') {
      return (
        selectedPlan?.door_knock_streets?.length > 0 &&
        selectedPlan.door_knock_streets.some((street) => parseInt(street.target_knocks || '0', 10) > 0)
      );
    }
    return (
      overallProgress.doorKnocks.streets.length > 0 &&
      overallProgress.doorKnocks.streets.some((street) => (street.targetKnocks || 0) > 0 || (street.completedKnocks || 0) > 0)
    );
  };

  return (
    <ErrorBoundary error={error}>
      <div className="max-w-7xl mx-auto p-6 bg-gray-100 min-h-screen">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Progress Report</h1>
            <div className="flex flex-wrap gap-3">
              {viewMode === 'suburb' && (
                <div className="flex items-center gap-3 bg-white p-3 rounded-lg shadow-md">
                  <select
                    value={selectedPlan.id}
                    onChange={(e) => {
                      const plan = marketingPlans.find((p) => p.id === e.target.value);
                      if (plan) {
                        setSelectedPlan(plan);
                        fetchActualProgress(user?.id || '', plan);
                      }
                    }}
                    className="p-2 border border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500"
                    aria-label="Select marketing plan"
                  >
                    {marketingPlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.suburb} ({formatDate(plan.start_date)} - {formatDate(plan.end_date)})
                      </option>
                    ))}
                  </select>
                  <motion.button
                    onClick={() => navigate('/marketing-plan', { state: { plan: selectedPlan } })}
                    className="flex items-center bg-blue-600 text-white px-3 py-2 rounded-lg font-semibold hover:bg-blue-700"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    title={`Edit plan for ${selectedPlan.suburb}`}
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </motion.button>
                  <motion.button
                    onClick={() => setShowDeleteModal(true)}
                    className="flex items-center bg-red-600 text-white px-3 py-2 rounded-lg font-semibold hover:bg-red-700"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    title={`Delete plan for ${selectedPlan.suburb}`}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </motion.button>
                </div>
              )}
              <motion.button
                onClick={() => generatePDF(false)}
                className="flex items-center bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Download className="w-5 h-5 mr-2" />
                Preview PDF
              </motion.button>
              <motion.button
                onClick={() => generatePDF(true)}
                className="flex items-center bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Download className="w-5 h-5 mr-2" />
                Download PDF
              </motion.button>
              <motion.button
                onClick={generateCSV}
                className="flex items-center bg-teal-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-teal-700"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <FileText className="w-5 h-5 mr-2" />
                Export CSV
              </motion.button>
              <motion.button
                onClick={() => setViewMode(viewMode === 'suburb' ? 'overall' : 'suburb')}
                className="flex items-center bg-purple-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-purple-700"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <BarChart className="w-5 h-5 mr-2" />
                {viewMode === 'suburb' ? 'View Overall Progress' : 'View Suburb Progress'}
              </motion.button>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4">
            <button
              onClick={() => navigate('/agent-dashboard')}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Back to Dashboard
            </button>
            <button
              onClick={() => navigate('/activity-logger')}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Log Activity
            </button>
          </div>
        </motion.div>

        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6 bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded-lg"
            >
              <p>{notification}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showDeleteModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full"
              >
                <h2 className="text-xl font-bold text-gray-900 mb-4">Delete Marketing Plan</h2>
                <p className="text-gray-600 mb-4">Select a suburb's marketing plan to delete. This action cannot be undone.</p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {marketingPlans.map((plan) => (
                    <div key={plan.id} className="flex justify-between items-center p-2 bg-gray-100 rounded">
                      <span>
                        {plan.suburb} ({formatDate(plan.start_date)} - {formatDate(plan.end_date)})
                      </span>
                      <button
                        onClick={() => deleteMarketingPlan(plan.id)}
                        className="text-red-600 hover:text-red-800"
                        aria-label={`Delete plan for ${plan.suburb}`}
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="mt-4 w-full bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
                >
                  Cancel
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showConfirmDeleteModal && planToDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full"
              >
                <h2 className="text-xl font-bold text-gray-900 mb-4">Confirm Delete</h2>
                <p className="text-gray-600 mb-4">
                  Are you sure you want to delete the marketing plan for <strong>{planToDelete.suburb}</strong>? This action cannot be undone.
                </p>
                <div className="flex gap-4">
                  <button
                    onClick={confirmDeletePlan}
                    className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => {
                      setShowConfirmDeleteModal(false);
                      setPlanToDelete(null);
                    }}
                    className="flex-1 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showPDFPreview && pdfPreviewUrl && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="bg-white p-6 rounded-lg shadow-xl w-full h-full flex flex-col"
              >
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-gray-900">PDF Preview</h2>
                  <button onClick={() => setShowPDFPreview(false)} className="text-gray-600 hover:text-gray-800">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <iframe src={pdfPreviewUrl} className="w-full flex-grow border" title="PDF Preview" />
                <div className="flex gap-4 mt-4">
                  <button
                    onClick={() => generatePDF(true)}
                    className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                  >
                    Download PDF
                  </button>
                  <button
                    onClick={() => setShowPDFPreview(false)}
                    className="flex-1 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-2xl shadow-2xl"
        >
          <div ref={reportRef} className="p-6 bg-white">
            <div className="border-b pb-4 mb-4">
              <h1 className="text-3xl font-bold text-gray-900">Marketing Progress Report</h1>
              <p className="text-sm text-gray-600 mt-2">
                Generated on: {new Date().toLocaleDateString('en-AU', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
              <p className="text-sm text-gray-600">Agent: {profile?.name || 'Unknown'}</p>
            </div>

            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Marketing Plan Overview</h2>
              {viewMode === 'suburb' ? (
                <>
                  <p className="text-gray-600">
                    <span className="font-medium">Suburb:</span> {selectedPlan.suburb}
                  </p>
                  <p className="text-gray-600">
                    <span className="font-medium">Start Date:</span> {formatDate(selectedPlan.start_date)}
                  </p>
                  <p className="text-gray-600">
                    <span className="font-medium">End Date:</span> {formatDate(selectedPlan.end_date)}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-gray-600">
                    <span className="font-medium">Scope:</span> All Suburbs (Aggregated Progress)
                  </p>
                  <p className="text-gray-600 italic">Aggregated progress across all marketing plans.</p>
                </>
              )}
            </div>

            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Progress Summary</h2>
              {getProgressMetrics.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {getProgressMetrics.map((item, index) => (
                    <div key={index} className="flex items-center space-x-4">
                      <div className="relative">
                        <svg className="w-16 h-16" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="10" />
                          <circle
                            cx="50"
                            cy="50"
                            r="40"
                            fill="none"
                            stroke={item.color}
                            strokeWidth="10"
                            strokeDasharray={`${(item.data.target ? Math.min((item.data.completed / item.data.target) * 100, 100) : 0) * 2.51} 251`}
                            strokeDashoffset="0"
                            transform="rotate(-90 50 50)"
                          />
                        </svg>
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
                          <span className="text-sm font-bold text-gray-800">
                            {item.data.target ? Math.min(Math.round((item.data.completed / item.data.target) * 100), 100) : 0}%
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{item.label}</p>
                        <p className="text-xs text-gray-600 font-semibold">
                          {item.data.completed}/{item.data.target}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 italic">No progress data available for this plan.</p>
              )}
            </div>

            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Detailed Breakdown</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {shouldShowDoorKnocks() && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-800 mb-2">Door Knock Streets</h3>
                    {(viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.streets.length > 0 ? (
                      <table className="w-full text-sm text-gray-600">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="p-2 text-left">Street</th>
                            <th className="p-2 text-right">Completed</th>
                            <th className="p-2 text-right">Target</th>
                            <th className="p-2 text-right">Progress</th>
                            <th className="p-2 text-right">Desktop Appraisals</th>
                            <th className="p-2 text-right">F2F Appraisals</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.streets.map((street, index) => (
                            <tr key={index} className="border-b">
                              <td className="p-2">{street.name}</td>
                              <td className="p-2 text-right">{street.completedKnocks || 0}</td>
                              <td className="p-2 text-right">{street.targetKnocks || 0}</td>
                              <td className="p-2 text-right">{calculatePercentage(street.completedKnocks || 0, street.targetKnocks || 0)}%</td>
                              <td className="p-2 text-right">
                                {street.targetKnocks ? Math.round((street.completedKnocks! / street.targetKnocks) * 100) : 0}%
                              </td>
                              <td className="p-2 text-right">{street.desktopAppraisals}</td>
                              <td className="p-2 text-right">{street.faceToFaceAppraisals}</td>
                            </tr>
                          ))}
                          <tr className="border-b font-bold bg-gray-200">
                            <td className="p-2">Total</td>
                            <td className="p-2 text-right">{(viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.completed}</td>
                            <td className="p-2 text-right">{(viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.target}</td>
                              <td className="p-2 text-right">
                              {calculatePercentage(
                                (viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.completed,
                                (viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.target
                              )}%
                            </td>
                            <td className="p-2 text-right">
                              {(viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.target
                                ? Math.round(((viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.completed / (viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.target) * 100)
                                : 0}
                              %
                            </td>
                            <td className="p-2 text-right">{(viewMode === 'suburb' ? actualProgress : overallProgress).desktopAppraisals.completed}</td>
                            <td className="p-2 text-right">{(viewMode === 'suburb' ? actualProgress : overallProgress).faceToFaceAppraisals.completed}</td>
                          </tr>
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-gray-500 italic">No door knock activities logged.</p>
                    )}
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-medium text-gray-800 mb-2">Phone Call Streets</h3>
                  {(viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.streets.length > 0 ? (
                    <table className="w-full text-sm text-gray-600">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="p-2 text-left">Street</th>
                          <th className="p-2 text-right">Completed</th>
                          <th className="p-2 text-right">Target</th>
                          <th className="p-2 text-right">Progress</th>
                          <th className="p-2 text-right">Desktop Appraisals</th>
                          <th className="p-2 text-right">F2F Appraisals</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.streets.map((street, index) => (
                          <tr key={index} className="border-b">
                            <td className="p-2">{street.name}</td>
                            <td className="p-2 text-right">{street.completedCalls || 0}</td>
                            <td className="p-2 text-right">{street.targetCalls || 0}</td>
                            <td className="p-2 text-right">{calculatePercentage(street.completedCalls || 0, street.targetCalls || 0)}%</td>
                            <td className="p-2 text-right">
                              {street.targetCalls ? Math.round((street.completedCalls! / street.targetCalls) * 100) : 0}%
                            </td>
                            <td className="p-2 text-right">{street.desktopAppraisals}</td>
                            <td className="p-2 text-right">{street.faceToFaceAppraisals}</td>
                          </tr>
                        ))}
                        <tr className="border-b font-bold bg-gray-200">
                          <td className="p-2">Total</td>
                          <td className="p-2 text-right">{(viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.completed}</td>
                          <td className="p-2 text-right">{(viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.target}</td>
                          <td className="p-2 text-right">
                            {calculatePercentage(
                              (viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.completed,
                              (viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.target
                            )}%
                          </td>
                          <td className="p-2 text-right">
                            {(viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.target
                              ? Math.round(((viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.completed / (viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.target) * 100)
                              : 0}
                            %
                          </td>
                          <td className="p-2 text-right">{(viewMode === 'suburb' ? actualProgress : overallProgress).desktopAppraisals.completed}</td>
                          <td className="p-2 text-right">{(viewMode === 'suburb' ? actualProgress : overallProgress).faceToFaceAppraisals.completed}</td>
                        </tr>
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-gray-500 italic">No phone call activities logged.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="text-center text-sm text-gray-500 mt-6">
              <p>Generated by xAI Real Estate Platform</p>
              <p>Page {1} of {1}</p>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Marketing Plan vs Actual Progress</h2>
            <p className="text-gray-600 mt-2 font-medium">
              {viewMode === 'suburb' ? (
                <>
                  <span className="font-semibold">Suburb:</span> {selectedPlan.suburb} |{' '}
                  <span className="font-semibold">Start Date:</span> {formatDate(selectedPlan.start_date)} |{' '}
                  <span className="font-semibold">End Date:</span> {formatDate(selectedPlan.end_date)}
                  <span className="ml-4 inline-block bg-blue-100 text-blue-800 text-sm font-semibold px-2.5 py-0.5 rounded">
                    Showing progress for {selectedPlan.suburb}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-semibold">Scope:</span> All Suburbs (Aggregated Progress)
                </>
              )}
            </p>
          </div>

          <div className="mb-8">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Plan vs Actual Progress</h3>
            {getProgressMetrics.length > 0 ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="max-w-3xl mx-auto h-80"
              >
                <Bar
                  data={planVsActualChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'top',
                        labels: { boxWidth: 20, padding: 20 },
                      },
                      tooltip: {
                        callbacks: {
                          label: (context) => {
                            const datasetLabel = context.dataset.label || '';
                            const value = context.parsed.y;
                            const index = context.dataIndex;
                            const target = planVsActualChartData.datasets[0].data[index];
                            const percentage = target ? Math.round((value / target) * 100) : 0;
                            return `${datasetLabel}: ${value} ${datasetLabel === 'Target' ? '' : `(${percentage}%)`}`;
                          },
                        },
                      },
                    },
                    scales: {
                      x: {
                        grid: { display: false },
                        title: { display: true, text: 'Metrics' },
                      },
                      y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Count' },
                      },
                    },
                    animation: {
                      duration: 1000,
                      easing: 'easeOutQuart',
                    },
                  }}
                  plugins={[chartPlugin]}
                />
              </motion.div>
            ) : (
              <p className="text-gray-500 italic">No progress data available for this plan.</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {getProgressMetrics.map((item, index) => (
              <RadialProgress
                key={index}
                percentage={item.data.target ? Math.min(Math.round((item.data.completed / item.data.target) * 100), 100) : 0}
                color={item.color}
                label={item.label}
                completed={item.data.completed}
                target={item.data.target}
              />
            ))}
          </div>

          {viewMode === 'suburb' && (
            <div className="mb-8">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Suburb Comparison</h3>
              {planProgresses.length > 1 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white p-6 rounded-xl shadow-lg h-96"
                >
                  <Bar
                    data={comparisonChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: 'top',
                          labels: {
                            boxWidth: 20,
                            padding: 20,
                          },
                        },
                        tooltip: {
                          callbacks: {
                            label: (context) => `${context.dataset.label}: ${context.raw}`,
                          },
                        },
                      },
                      scales: {
                        y: { beginAtZero: true },
                        x: { stacked: true },
                      },
                    }}
                  />
                </motion.div>
              ) : (
                <p className="text-gray-500 italic">Add more marketing plans to compare progress across suburbs.</p>
              )}
            </div>
          )}

          <div className="mb-8">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Detailed Breakdown</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {shouldShowDoorKnocks() && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white p-6 rounded-xl shadow-lg space-y-4"
                >
                  <h4 className="text-lg font-semibold text-gray-800 mb-4">Door Knock Streets</h4>
                  {(viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.streets.length > 0 ? (
                    <div className="space-y-4">
                      <table className="w-full text-sm text-gray-600">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="p-2 text-left">Street</th>
                            <th className="p-2 text-right">Completed</th>
                            <th className="p-2 text-right">Target</th>
                            <th className="p-2 text-right">Progress</th>
                            <th className="p-2 text-right">Desktop Appraisals</th>
                            <th className="p-2 text-right">F2F Appraisals</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.streets.map((street, index) => (
                            <tr key={index} className="border-b">
                              <td className="p-2">{street.name}</td>
                              <td className="p-2 text-right">{street.completedKnocks || 0}</td>
                              <td className="p-2 text-right">{street.targetKnocks || 0}</td>
                              <td className="p-2 text-right">
                                {street.targetKnocks ? Math.round((street.completedKnocks! / street.targetKnocks) * 100) : 0}%
                              </td>
                              <td className="p-2 text-right">{street.desktopAppraisals}</td>
                              <td className="p-2 text-right">{street.faceToFaceAppraisals}</td>
                            </tr>
                          ))}
                          <tr className="border-b font-bold bg-gray-200">
                            <td className="p-2">Total</td>
                            <td className="p-2 text-right">{(viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.completed}</td>
                            <td className="p-2 text-right">{(viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.target}</td>
                            <td className="p-2 text-right">
                              {(viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.target
                                ? Math.round(((viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.completed / (viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.target) * 100)
                                : 0}
                              %
                            </td>
                            <td className="p-2 text-right">{(viewMode === 'suburb' ? actualProgress : overallProgress).desktopAppraisals.completed}</td>
                            <td className="p-2 text-right">{(viewMode === 'suburb' ? actualProgress : overallProgress).faceToFaceAppraisals.completed}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-gray-500 italic">No door knock activities logged.</p>
                  )}
                </motion.div>
              )}

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-6 rounded-xl shadow-lg"
              >
                <h4 className="text-lg font-semibold text-gray-800 mb-4">Phone Call Streets</h4>
                {(viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.streets.length > 0 ? (
                  <div className="space-y-4">
                    {(viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.streets.map((street, index) => (
                      <motion.div
                        key={index}
                        className="relative group bg-gray-100 p-3 rounded-lg"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <p className="text-gray-700 font-medium mb-2">
                          {street.name}: <span className="text-green-600">{street.completedCalls || 0}</span>/
                          {street.targetCalls || 0} calls
                          {viewMode === 'suburb' &&
                            selectedPlan.phone_call_streets.find((s) => s.name === street.name)?.why && (
                              <span className="block text-sm text-gray-500">
                                Reason: {selectedPlan.phone_call_streets.find((s) => s.name === street.name)?.why}
                              </span>
                            )}
                        </p>
                      </motion.div>
                    ))}
                    <div className="bg-gray-200 p-3 rounded-lg font-bold">
                      <p className="text-gray-800">
                        Total: <span className="text-green-600">{(viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.completed}</span>/
                        {(viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.target} calls (
                        {(viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.target
                          ? Math.round(((viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.completed / (viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.target) * 100)
                          : 0}
                        %)
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500 italic">No phone call streets planned or activities logged.</p>
                )}
              </motion.div>
            </div>
          </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <motion.button
            onClick={() => navigate('/agent-dashboard')}
            className="flex-1 bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-700"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Back to Dashboard
          </motion.button>
        </div>
      </motion.div>
    </div>
    </ErrorBoundary>
  );
}