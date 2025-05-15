import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { Loader2, Trash2, Edit, Download, FileText, BarChart, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, BarElement, CategoryScale, LinearScale, PointElement, LineElement } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { motion } from 'framer-motion';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

ChartJS.register(ArcElement, Tooltip, Legend, BarElement, CategoryScale, LinearScale, PointElement, LineElement);

interface DoorKnockStreet {
  id: string;
  name: string;
  why: string;
  house_count: string;
  target_knocks: string;
  target_answers: string;
}

interface PhoneCallStreet {
  id: string;
  name: string;
  why: string;
  target_calls: string;
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
  completed: number;
  target: number;
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
}

const RadialProgress = ({ percentage, color, label, completed, target }: { percentage: number; color: string; label: string; completed: number; target: number }) => {
  return (
    <motion.div
      className="relative flex flex-col items-center bg-gradient-to-br from-white to-gray-100 p-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 group"
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
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
            strokeDasharray={`${percentage * 2.51} 251`}
            strokeDashoffset="0"
            transform="rotate(-90 50 50)"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
          <span className="text-lg font-bold text-gray-800">{percentage}%</span>
        </div>
      </div>
      <p className="mt-2 text-sm font-medium text-gray-600">{label}</p>
      <p className="text-xs text-gray-500 font-semibold">
        {completed}/{target}
      </p>
      <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded-md py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        {label}: {completed}/{target} ({percentage}%)
      </div>
    </motion.div>
  );
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
  const [showPDFPreview, setShowPDFPreview] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const [planProgresses, setPlanProgresses] = useState<PlanProgress[]>([]);

  useEffect(() => {
    console.log('ProgressReportPage mounted', { user, profile, marketingPlans, selectedPlan });

    const initializeProgressReport = async () => {
      console.log('initializeProgressReport started');
      if (!user || !profile) {
        console.log('No user or profile, redirecting to login');
        setError('Please log in to view the progress report.');
        setLoading(false);
        navigate('/agent-login');
        return;
      }

      if (profile.role !== 'agent') {
        console.log('User is not an agent, redirecting');
        setError('You must be an agent to view this page.');
        setLoading(false);
        navigate('/agent-login');
        return;
      }

      try {
        console.log('Loading marketing plans for agent:', user.id);
        await loadMarketingPlans(user.id);
        console.log('Fetching overall progress');
        await fetchOverallProgress(user.id);

        console.log('Setting up Supabase subscriptions');
        const planSubscription = supabase
          .channel('marketing_plans_changes')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_plans', filter: `agent=eq.${user.id}` }, async (payload) => {
            console.log('Marketing plans changed:', payload);
            setNotification('Marketing plans updated automatically.');
            await loadMarketingPlans(user.id);
            setTimeout(() => setNotification(null), 3000);
          })
          .subscribe();

        const activitySubscription = supabase
          .channel('agent_activities_changes')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_activities', filter: `agent_id=eq.${user.id}` }, async (payload) => {
            console.log('Agent activities changed:', payload);
            setNotification('Progress updated automatically.');
            if (selectedPlan && viewMode === 'suburb') {
              await fetchActualProgress(user.id, selectedPlan);
            }
            await fetchOverallProgress(user.id);
            await fetchPlanProgresses(user.id);
            setTimeout(() => setNotification(null), 3000);
          })
          .subscribe();

        return () => {
          console.log('Cleaning up Supabase subscriptions');
          supabase.removeChannel(planSubscription);
          supabase.removeChannel(activitySubscription);
        };
      } catch (error: any) {
        console.error('Error in initializeProgressReport:', error);
        setError(`Failed to load progress report: ${error.message || 'Unknown error'}`);
      } finally {
        console.log('Setting loading to false');
        setLoading(false);
      }
    };

    initializeProgressReport();
  }, [user, profile, navigate, selectedPlan, viewMode]);

  const loadMarketingPlans = async (agentId: string) => {
    try {
      console.log('loadMarketingPlans called with agentId:', agentId);
      const { data, error } = await supabase
        .from('marketing_plans')
        .select('*')
        .eq('agent', agentId)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Supabase error in loadMarketingPlans:', error);
        throw new Error(`Failed to load marketing plans: ${error.message}`);
      }

      console.log('Marketing plans fetched:', data);
      const plans: MarketingPlan[] = data.map((plan) => ({
        id: plan.id,
        agent: plan.agent,
        suburb: plan.suburb || 'Not specified',
        start_date: plan.start_date || '',
        end_date: plan.end_date || '',
        door_knock_streets: (plan.door_knock_streets || []).map((s: DoorKnockStreet) => ({
          ...s,
          id: s.id,
        })),
        phone_call_streets: (plan.phone_call_streets || []).map((s: PhoneCallStreet) => ({
          ...s,
          id: s.id,
        })),
        target_connects: plan.target_connects || '0',
        target_desktop_appraisals: plan.target_desktop_appraisals || '0',
        target_face_to_face_appraisals: plan.target_face_to_face_appraisals || '0',
      }));

      console.log('Processed plans:', plans);
      setMarketingPlans(plans);
      if (plans.length > 0 && !selectedPlan) {
        console.log('Setting selectedPlan to first plan:', plans[0]);
        setSelectedPlan(plans[0]);
        await fetchActualProgress(agentId, plans[0]);
      } else if (!plans.length) {
        console.log('No plans found, setting selectedPlan to null');
        setSelectedPlan(null);
      }
      await fetchPlanProgresses(agentId);
    } catch (error: any) {
      console.error('Error in loadMarketingPlans:', error);
      throw error;
    }
  };

  const fetchActualProgress = async (agentId: string, plan: MarketingPlan) => {
    try {
      console.log('fetchActualProgress called for plan:', plan.suburb);
      const { data: activities, error } = await supabase
        .from('agent_activities')
        .select('*')
        .eq('agent_id', agentId)
        .eq('suburb', plan.suburb);

      if (error) {
        console.error('Supabase error in fetchActualProgress:', error);
        throw new Error(`Failed to fetch activities: ${error.message}`);
      }

      console.log('Activities fetched:', activities);
      const totalTargetKnocks = plan.door_knock_streets.reduce(
        (sum, street) => sum + parseInt(street.target_knocks || '0'),
        0
      );
      const totalTargetCalls = plan.phone_call_streets.reduce(
        (sum, street) => sum + parseInt(street.target_calls || '0'),
        0
      );
      const targetConnects = parseInt(plan.target_connects || '0');
      const targetDesktopAppraisals = parseInt(plan.target_desktop_appraisals || '0');
      const targetFaceToFaceAppraisals = parseInt(plan.target_face_to_face_appraisals || '0');

      const doorKnockStreetProgress: StreetProgress[] = plan.door_knock_streets.map((street) => ({
        name: street.name,
        completed: 0,
        target: parseInt(street.target_knocks || '0'),
      }));
      const phoneCallStreetProgress: StreetProgress[] = plan.phone_call_streets.map((street) => ({
        name: street.name,
        completed: 0,
        target: parseInt(street.target_calls || '0'),
      }));

      const progress = activities && activities.length > 0
        ? activities.reduce(
            (acc, activity) => {
              if (activity.activity_type === 'door_knock' && activity.street_name) {
                acc.doorKnocks.completed += activity.knocks_made || 0;
                const street = acc.doorKnocks.streets.find((s) => s.name === activity.street_name);
                if (street) {
                  street.completed += activity.knocks_made || 0;
                }
              } else if (activity.activity_type === 'phone_call' && activity.street_name) {
                acc.phoneCalls.completed += activity.calls_made || 0;
                acc.connects.completed += activity.calls_connected || 0;
                const street = acc.phoneCalls.streets.find((s) => s.name === activity.street_name);
                if (street) {
                  street.completed += activity.calls_made || 0;
                }
              } else if (activity.activity_type === 'appraisal') {
                acc.desktopAppraisals.completed += activity.desktop_appraisals || 0;
                acc.faceToFaceAppraisals.completed += activity.face_to_face_appraisals || 0;
              }
              return acc;
            },
            {
              doorKnocks: { completed: 0, target: totalTargetKnocks, streets: doorKnockStreetProgress },
              phoneCalls: { completed: 0, target: totalTargetCalls, streets: phoneCallStreetProgress },
              connects: { completed: 0, target: targetConnects },
              desktopAppraisals: { completed: 0, target: targetDesktopAppraisals },
              faceToFaceAppraisals: { completed: 0, target: targetFaceToFaceAppraisals },
            }
          )
        : {
            doorKnocks: { completed: 0, target: totalTargetKnocks, streets: doorKnockStreetProgress },
            phoneCalls: { completed: 0, target: totalTargetCalls, streets: phoneCallStreetProgress },
            connects: { completed: 0, target: targetConnects },
            desktopAppraisals: { completed: 0, target: targetDesktopAppraisals },
            faceToFaceAppraisals: { completed: 0, target: targetFaceToFaceAppraisals },
          };

      console.log('Progress calculated:', progress);
      setActualProgress(progress);
    } catch (error: any) {
      console.error('Error in fetchActualProgress:', error);
      throw error;
    }
  };

  const fetchOverallProgress = async (agentId: string) => {
    try {
      console.log('fetchOverallProgress called');
      const { data: activities, error } = await supabase
        .from('agent_activities')
        .select('*')
        .eq('agent_id', agentId);

      if (error) {
        console.error('Supabase error in fetchOverallProgress:', error);
        throw new Error(`Failed to fetch activities: ${error.message}`);
      }

      console.log('Overall activities fetched:', activities);
      const totalTargetKnocks = marketingPlans.reduce(
        (sum, plan) =>
          sum +
          plan.door_knock_streets.reduce(
            (streetSum, street) => streetSum + parseInt(street.target_knocks || '0'),
            0
          ),
        0
      );
      const totalTargetCalls = marketingPlans.reduce(
        (sum, plan) =>
          sum +
          plan.phone_call_streets.reduce(
            (streetSum, street) => streetSum + parseInt(street.target_calls || '0'),
            0
          ),
        0
      );
      const targetConnects = marketingPlans.reduce(
        (sum, plan) => sum + parseInt(plan.target_connects || '0'),
        0
      );
      const targetDesktopAppraisals = marketingPlans.reduce(
        (sum, plan) => sum + parseInt(plan.target_desktop_appraisals || '0'),
        0
      );
      const targetFaceToFaceAppraisals = marketingPlans.reduce(
        (sum, plan) => sum + parseInt(plan.target_face_to_face_appraisals || '0'),
        0
      );

      const streetProgressMap: { [key: string]: StreetProgress } = {};
      marketingPlans.forEach((plan) => {
        plan.door_knock_streets.forEach((street) => {
          const key = `door_${plan.suburb}_${street.name}`;
          if (!streetProgressMap[key]) {
            streetProgressMap[key] = {
              name: `${plan.suburb}: ${street.name}`,
              completed: 0,
              target: parseInt(street.target_knocks || '0'),
            };
          } else {
            streetProgressMap[key].target += parseInt(street.target_knocks || '0');
          }
        });
        plan.phone_call_streets.forEach((street) => {
          const key = `phone_${plan.suburb}_${street.name}`;
          if (!streetProgressMap[key]) {
            streetProgressMap[key] = {
              name: `${plan.suburb}: ${street.name}`,
              completed: 0,
              target: parseInt(street.target_calls || '0'),
            };
          } else {
            streetProgressMap[key].target += parseInt(street.target_calls || '0');
          }
        });
      });

      const doorKnockStreetProgress = Object.values(streetProgressMap).filter((s) => s.name.includes('door_'));
      const phoneCallStreetProgress = Object.values(streetProgressMap).filter((s) => s.name.includes('phone_'));

      const progress = activities && activities.length > 0
        ? activities.reduce(
            (acc, activity) => {
              if (activity.activity_type === 'door_knock' && activity.street_name && activity.suburb) {
                acc.doorKnocks.completed += activity.knocks_made || 0;
                const street = acc.doorKnocks.streets.find((s) => s.name === `${activity.suburb}: ${activity.street_name}`);
                if (street) {
                  street.completed += activity.knocks_made || 0;
                }
              } else if (activity.activity_type === 'phone_call' && activity.street_name && activity.suburb) {
                acc.phoneCalls.completed += activity.calls_made || 0;
                acc.connects.completed += activity.calls_connected || 0;
                const street = acc.phoneCalls.streets.find((s) => s.name === `${activity.suburb}: ${activity.street_name}`);
                if (street) {
                  street.completed += activity.calls_made || 0;
                }
              } else if (activity.activity_type === 'appraisal') {
                acc.desktopAppraisals.completed += activity.desktop_appraisals || 0;
                acc.faceToFaceAppraisals.completed += activity.face_to_face_appraisals || 0;
              }
              return acc;
            },
            {
              doorKnocks: { completed: 0, target: totalTargetKnocks, streets: doorKnockStreetProgress },
              phoneCalls: { completed: 0, target: totalTargetCalls, streets: phoneCallStreetProgress },
              connects: { completed: 0, target: targetConnects },
              desktopAppraisals: { completed: 0, target: targetDesktopAppraisals },
              faceToFaceAppraisals: { completed: 0, target: targetFaceToFaceAppraisals },
            }
          )
        : {
            doorKnocks: { completed: 0, target: totalTargetKnocks, streets: doorKnockStreetProgress },
            phoneCalls: { completed: 0, target: totalTargetCalls, streets: phoneCallStreetProgress },
            connects: { completed: 0, target: targetConnects },
            desktopAppraisals: { completed: 0, target: targetDesktopAppraisals },
            faceToFaceAppraisals: { completed: 0, target: targetFaceToFaceAppraisals },
          };

      console.log('Overall progress calculated:', progress);
      setOverallProgress(progress);
    } catch (error: any) {
      console.error('Error in fetchOverallProgress:', error);
      throw error;
    }
  };

  const fetchPlanProgresses = async (agentId: string) => {
    console.log('fetchPlanProgresses called');
    const progresses: PlanProgress[] = [];
    for (const plan of marketingPlans) {
      const { data: activities, error } = await supabase
        .from('agent_activities')
        .select('*')
        .eq('agent_id', agentId)
        .eq('suburb', plan.suburb);

      if (error) {
        console.error('Supabase error in fetchPlanProgresses:', error);
        continue;
      }

      console.log(`Activities for ${plan.suburb}:`, activities);
      const totalTargetKnocks = plan.door_knock_streets.reduce(
        (sum, street) => sum + parseInt(street.target_knocks || '0'),
        0
      );
      const totalTargetCalls = plan.phone_call_streets.reduce(
        (sum, street) => sum + parseInt(street.target_calls || '0'),
        0
      );
      const targetConnects = parseInt(plan.target_connects || '0');

      const progress = activities && activities.length > 0
        ? activities.reduce(
            (acc, activity) => {
              if (activity.activity_type === 'door_knock') {
                acc.doorKnocks.completed += activity.knocks_made || 0;
              } else if (activity.activity_type === 'phone_call') {
                acc.phoneCalls.completed += activity.calls_made || 0;
                acc.connects.completed += activity.calls_connected || 0;
              }
              return acc;
            },
            {
              doorKnocks: { completed: 0, target: totalTargetKnocks },
              phoneCalls: { completed: 0, target: totalTargetCalls },
              connects: { completed: 0, target: targetConnects },
            }
          )
        : {
            doorKnocks: { completed: 0, target: totalTargetKnocks },
            phoneCalls: { completed: 0, target: totalTargetCalls },
            connects: { completed: 0, target: targetConnects },
          };

      progresses.push({
        id: plan.id,
        suburb: plan.suburb,
        ...progress,
      });
    }
    console.log('Plan progresses:', progresses);
    setPlanProgresses(progresses);
  };

  const deleteMarketingPlan = async (planId: string) => {
    if (!user?.id) {
      console.log('No user ID, cannot delete plan');
      return;
    }

    const planToDelete = marketingPlans.find((p) => p.id === planId);
    if (!planToDelete) {
      console.log('Plan not found:', planId);
      return;
    }

    console.log('Deleting plan:', planToDelete.suburb);
    if (!window.confirm(`Are you sure you want to delete the marketing plan for ${planToDelete.suburb}? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('marketing_plans')
        .delete()
        .eq('id', planId)
        .eq('agent', user.id);

      if (error) {
        console.error('Supabase error in deleteMarketingPlan:', error);
        throw new Error(`Failed to delete marketing plan: ${error.message}`);
      }

      console.log('Plan deleted:', planId);
      setMarketingPlans((prev) => prev.filter((plan) => plan.id !== planId));
      if (selectedPlan?.id === planId) {
        console.log('Selected plan deleted, updating selectedPlan');
        setSelectedPlan(marketingPlans.length > 1 ? marketingPlans.filter((p) => p.id !== planId)[0] : null);
        if (marketingPlans.length > 1) {
          await fetchActualProgress(user.id, marketingPlans.filter((p) => p.id !== planId)[0]);
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
      setPlanProgresses((prev) => prev.filter((p) => p.id !== planId));
      setShowDeleteModal(false);
      setNotification(`Marketing plan for ${planToDelete.suburb} deleted successfully.`);
      setTimeout(() => setNotification(null), 3000);
    } catch (error: any) {
      console.error('Error in deleteMarketingPlan:', error);
      alert(`Failed to delete marketing plan: ${error.message || 'Please try again.'}`);
    }
  };

  const editMarketingPlan = (plan: MarketingPlan) => {
    console.log('Editing plan:', plan.suburb);
    navigate('/marketing-plan', { state: { plan } });
  };

  const generateCSV = () => {
    console.log('generateCSV called, viewMode:', viewMode, 'selectedPlan:', selectedPlan);
    if (viewMode === 'suburb' && !selectedPlan) {
      console.log('No selected plan in suburb mode, skipping CSV generation');
      return;
    }

    const headers = [
      'Suburb',
      'Start Date',
      'End Date',
      'Street Name',
      'Activity Type',
      'Completed',
      'Target',
      'Progress (%)',
      'Reason',
    ];
    const rows: string[][] = [];

    if (viewMode === 'suburb' && selectedPlan) {
      selectedPlan.door_knock_streets.forEach((street: DoorKnockStreet) => {
        const progress = actualProgress.doorKnocks.streets.find((s) => s.name === street.name);
        rows.push([
          selectedPlan.suburb,
          formatDate(selectedPlan.start_date),
          formatDate(selectedPlan.end_date),
          street.name,
          'Door Knock',
          (progress?.completed || 0).toString(),
          street.target_knocks,
          progress?.target ? Math.round((progress.completed / progress.target) * 100).toString() : '0',
          street.why || '',
        ]);
      });

      selectedPlan.phone_call_streets.forEach((street: PhoneCallStreet) => {
        const progress = actualProgress.phoneCalls.streets.find((s) => s.name === street.name);
        rows.push([
          selectedPlan.suburb,
          formatDate(selectedPlan.start_date),
          formatDate(selectedPlan.end_date),
          street.name,
          'Phone Call',
          (progress?.completed || 0).toString(),
          street.target_calls,
          progress?.target ? Math.round((progress.completed / progress.target) * 100).toString() : '0',
          street.why || '',
        ]);
      });

      rows.push([
        selectedPlan.suburb,
        formatDate(selectedPlan.start_date),
        formatDate(selectedPlan.end_date),
        'Total',
        'Connects',
        actualProgress.connects.completed.toString(),
        actualProgress.connects.target.toString(),
        actualProgress.connects.target
          ? Math.round((actualProgress.connects.completed / actualProgress.connects.target) * 100).toString()
          : '0',
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
            (progress?.completed || 0).toString(),
            street.target_knocks,
            progress?.target ? Math.round((progress.completed / progress.target) * 100).toString() : '0',
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
            (progress?.completed || 0).toString(),
            street.target_calls,
            progress?.target ? Math.round((progress.completed / progress.target) * 100).toString() : '0',
            street.why || '',
          ]);
        });

        rows.push([
          plan.suburb,
          formatDate(plan.start_date),
          formatDate(plan.end_date),
          'Total',
          'Connects',
          (planProgress?.connects.completed || 0).toString(),
          (planProgress?.connects.target || 0).toString(),
          planProgress?.connects.target
            ? Math.round((planProgress.connects.completed / planProgress.connects.target) * 100).toString()
            : '0',
          '',
        ]);
      });
    }

    console.log('CSV rows:', rows);
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
  };

  const formatDate = (date: string) => {
    if (!date) return 'Not specified';
    return new Date(date).toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const generatePDF = async (download: boolean = false) => {
    console.log('generatePDF called, download:', download);
    if (!reportRef.current || (viewMode === 'suburb' && !selectedPlan)) {
      console.log('Cannot generate PDF: no reportRef or no selectedPlan in suburb mode');
      return;
    }

    const pdf = new jsPDF('l', 'mm', 'a4');
    const pageWidth = 297;
    const pageHeight = 210;
    const margin = 10;

    pdf.setFillColor(220, 234, 255);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(24);
    pdf.setTextColor(31, 41, 55);
    pdf.text('Marketing Progress Report', pageWidth / 2, 60, { align: 'center' });
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Agent: ${profile?.name || 'Unknown'}`, pageWidth / 2, 80, { align: 'center' });
    pdf.text(`Generated on: ${new Date().toLocaleDateString('en-AU')}`, pageWidth / 2, 90, { align: 'center' });
    pdf.setFontSize(12);
    pdf.setTextColor(107, 114, 128);
    pdf.text('xAI Real Estate Platform', pageWidth / 2, pageHeight - 20, { align: 'center' });

    pdf.addPage();
    const canvas = await html2canvas(reportRef.current, { scale: 3 });
    const imgData = canvas.toDataURL('image/png');
    const imgWidth = pageWidth - 2 * margin;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = margin;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(107, 114, 128);
    pdf.text('xAI Real Estate Platform', margin, pageHeight - 10);
    pdf.text(`Page 1`, pageWidth - margin, pageHeight - 10, { align: 'right' });

    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
    heightLeft -= (pageHeight - 2 * margin);

    let pageCount = 1;
    while (heightLeft > 0) {
      pdf.addPage();
      pageCount++;
      position = heightLeft - imgHeight + margin;
      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(107, 114, 128);
      pdf.text('xAI Real Estate Platform', margin, pageHeight - 10);
      pdf.text(`Page ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
      heightLeft -= (pageHeight - 2 * margin);
    }

    if (download) {
      pdf.save(`Progress_Report_${viewMode === 'suburb' && selectedPlan ? selectedPlan.suburb : 'Overall'}_${new Date().toISOString().split('T')[0]}.pdf`);
    } else {
      const pdfBlob = pdf.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      setPdfPreviewUrl(pdfUrl);
      setShowPDFPreview(true);
    }
  };

  // Helper function to determine which metrics to show in Progress Summary
  const getProgressMetrics = () => {
    const progress = viewMode === 'suburb' ? actualProgress : overallProgress;
    return [
      {
        label: 'Door Knocks',
        data: progress.doorKnocks,
        color: '#3B82F6',
      },
      {
        label: 'Phone Calls',
        data: progress.phoneCalls,
        color: '#10B981',
      },
      {
        label: 'Connects',
        data: progress.connects,
        color: '#8B5CF6',
      },
      {
        label: 'Desktop Appraisals',
        data: progress.desktopAppraisals,
        color: '#F59E0B',
      },
      {
        label: 'Face-to-Face Appraisals',
        data: progress.faceToFaceAppraisals,
        color: '#EF4444',
      },
    ].filter((item) => item.data.target > 0 || item.data.completed > 0);
  };

  // Chart.js plugin for custom percentage labels and progress line
  const chartPlugin = {
    id: 'customPercentageAndLine',
    afterDatasetsDraw(chart: any) {
      const { ctx, data, scales } = chart;
      const xAxis = scales.x;
      const yAxis = scales.y;

      // Draw percentage labels on completed bars
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

      // Draw progress line connecting completed bars
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

  // Data for the Plan vs Actual chart
  const planVsActualChartData = {
    labels: getProgressMetrics().map((item) => item.label),
    datasets: [
      {
        label: 'Target',
        data: getProgressMetrics().map((item) => item.data.target),
        backgroundColor: getProgressMetrics().map((item) => `${item.color}80`), // Semi-transparent
        borderColor: getProgressMetrics().map((item) => item.color),
        borderWidth: 1,
        barPercentage: 0.45,
        categoryPercentage: 0.45,
      },
      {
        label: 'Completed',
        data: getProgressMetrics().map((item) => item.data.completed),
        backgroundColor: getProgressMetrics().map((item) => {
          const ctx = document.createElement('canvas').getContext('2d');
          if (ctx) {
            const gradient = ctx.createLinearGradient(0, 0, 0, 200);
            gradient.addColorStop(0, item.color);
            gradient.addColorStop(1, `${item.color}CC`);
            return gradient;
          }
          return item.color;
        }),
        borderColor: getProgressMetrics().map((item) => item.color),
        borderWidth: 1,
        barPercentage: 0.45,
        categoryPercentage: 0.45,
      },
    ],
  };

  const comparisonChartData = {
    labels: planProgresses.map((p) => p.suburb),
    datasets: [
      {
        label: 'Door Knocks Completed',
        data: planProgresses.map((p) => p.doorKnocks.completed),
        backgroundColor: '#3B82F6',
      },
      {
        label: 'Door Knocks Target',
        data: planProgresses.map((p) => p.doorKnocks.target),
        backgroundColor: '#93C5FD',
      },
      {
        label: 'Phone Calls Completed',
        data: planProgresses.map((p) => p.phoneCalls.completed),
        backgroundColor: '#10B981',
      },
      {
        label: 'Phone Calls Target',
        data: planProgresses.map((p) => p.phoneCalls.target),
        backgroundColor: '#6EE7B7',
      },
    ],
  };

  console.log('Rendering with state:', {
    loading,
    error,
    marketingPlans: marketingPlans.length,
    selectedPlan: !!selectedPlan,
    user: !!user,
    profile: !!profile,
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        <p className="ml-4 text-gray-700">Loading progress report...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-6 bg-gray-100 min-h-screen">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-2xl shadow-2xl"
        >
          <h1 className="text-4xl font-extrabold text-gray-900 mb-4">Progress Report</h1>
          <p className="text-red-600 font-medium">{error}</p>
          <button
            onClick={() => navigate('/agent-dashboard')}
            className="mt-4 text-blue-600 hover:text-blue-800 font-medium"
          >
            Back to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  if (!user || !profile) {
    console.log('Redirecting to login due to missing user or profile');
    navigate('/agent-login');
    return null;
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

  // Helper function to determine if door knock section should be shown
  const shouldShowDoorKnocks = () => {
    if (viewMode === 'suburb') {
      return (
        selectedPlan?.door_knock_streets?.length > 0 &&
        selectedPlan.door_knock_streets.some((street) => parseInt(street.target_knocks || '0') > 0)
      );
    }
    return (
      overallProgress.doorKnocks.streets.length > 0 &&
      overallProgress.doorKnocks.streets.some((street) => street.target > 0 || street.completed > 0)
    );
  };

  return (
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
                      console.log('Selected plan changed:', plan.suburb);
                      setSelectedPlan(plan);
                      fetchActualProgress(user?.id || '', plan);
                    }
                  }}
                  className="p-2 border border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500"
                >
                  {marketingPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.suburb} ({formatDate(plan.start_date)} - {formatDate(plan.end_date)})
                    </option>
                  ))}
                </select>
                <motion.button
                  onClick={() => editMarketingPlan(selectedPlan)}
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
        </div>
      </motion.div>

      {notification && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded-lg"
        >
          <p>{notification}</p>
        </motion.div>
      )}

      {showDeleteModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
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

      {showPDFPreview && pdfPreviewUrl && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white p-6 rounded-lg shadow-xl max-w-4xl w-full"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">PDF Preview</h2>
              <button onClick={() => setShowPDFPreview(false)} className="text-gray-600 hover:text-gray-800">
                <X className="w-6 h-6" />
              </button>
            </div>
            <iframe src={pdfPreviewUrl} className="w-full h-96 border" title="PDF Preview" />
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
            {getProgressMetrics().length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {getProgressMetrics().map((item, index) => (
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
                        </tr>
                      </thead>
                      <tbody>
                        {(viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.streets.map((street, index) => (
                          <tr key={index} className="border-b">
                            <td className="p-2">{street.name}</td>
                            <td className="p-2 text-right">{street.completed}</td>
                            <td className="p-2 text-right">{street.target}</td>
                            <td className="p-2 text-right">
                              {street.target ? Math.round((street.completed / street.target) * 100) : 0}%
                            </td>
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
                      </tr>
                    </thead>
                    <tbody>
                      {(viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.streets.map((street, index) => (
                        <tr key={index} className="border-b">
                          <td className="p-2">{street.name}</td>
                          <td className="p-2 text-right">{street.completed}</td>
                          <td className="p-2 text-right">{street.target}</td>
                          <td className="p-2 text-right">
                            {street.target ? Math.round((street.completed / street.target) * 100) : 0}%
                          </td>
                        </tr>
                      ))}
                      <tr className="border-b font-bold bg-gray-200">
                        <td className="p-2">Total</td>
                        <td className="p-2 text-right">{(viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.completed}</td>
                        <td className="p-2 text-right">{(viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.target}</td>
                        <td className="p-2 text-right">
                          {(viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.target
                            ? Math.round(((viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.completed / (viewMode === 'suburb' ? actualProgress : overallProgress).phoneCalls.target) * 100)
                            : 0}
                          %
                        </td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <p className="text-gray-500 italic">No phone call streets planned or activities logged.</p>
                )}
              </div>
            </div>
          </div>

          <div className="text-center text-sm text-gray-500 mt-6">
            <p>Generated by Red Tulip Real Estate Platform</p>
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
          {getProgressMetrics().length > 0 ? (
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
          {getProgressMetrics().map((item, index) => (
            <motion.div
              key={index}
              className="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <RadialProgress
                percentage={item.data.target ? Math.min(Math.round((item.data.completed / item.data.target) * 100), 100) : 0}
                color={item.color}
                label={item.label}
                completed={item.data.completed}
                target={item.data.target}
              />
            </motion.div>
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
                className="bg-white p-6 rounded-xl shadow-lg"
              >
                <h4 className="text-lg font-semibold text-gray-800 mb-4">Door Knock Streets</h4>
                {(viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.streets.length > 0 ? (
                  <div className="space-y-4">
                    {(viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.streets.map((street, index) => (
                      <motion.div
                        key={index}
                        className="relative group bg-gray-100 p-3 rounded-lg"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <p className="text-gray-700 font-medium mb-2">
                          {street.name}: <span className="text-blue-600">{street.completed}</span>/
                          {street.target} knocks
                          {viewMode === 'suburb' &&
                            selectedPlan.door_knock_streets.find((s) => s.name === street.name)?.why && (
                              <span className="block text-sm text-gray-500">
                                Reason: {selectedPlan.door_knock_streets.find((s) => s.name === street.name)?.why}
                              </span>
                            )}
                        </p>
                      </motion.div>
                    ))}
                    <div className="bg-gray-200 p-3 rounded-lg font-bold">
                      <p className="text-gray-800">
                        Total: <span className="text-blue-600">{(viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.completed}</span>/
                        {(viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.target} knocks (
                        {(viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.target
                          ? Math.round(((viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.completed / (viewMode === 'suburb' ? actualProgress : overallProgress).doorKnocks.target) * 100)
                          : 0}
                        %)
                      </p>
                    </div>
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
                        {street.name}: <span className="text-green-600">{street.completed}</span>/
                        {street.target} calls
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
  );
}