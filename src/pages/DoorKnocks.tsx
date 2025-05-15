// src/pages/DoorKnocks.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { DoorClosed } from 'lucide-react';

type ActivityType = 'phone_call' | 'door_knock' | 'desktop_appraisal' | 'inperson_appraisal';

interface Activity {
  id: string;
  agent_id: string;
  activity_type: ActivityType;
  activity_date: string;
  notes?: string;
  property_id?: string;
  status: 'Pending' | 'In Progress' | 'Completed' | 'Escalated';
  calls_made?: number;
  calls_attended?: number;
  calls_connected?: number;
  client_name?: string;
  client_phone?: string;
  knocks_made?: number;
  knocks_answered?: number;
  street_name?: string;
  street_number?: string;
  appraisal_report?: string;
  appraisal_feedback?: string;
}

export function DoorKnocks() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    if (user) {
      fetchActivities();
    }
  }, [user]);

  const fetchActivities = async () => {
    const { data, error } = await supabase
      .from('agent_activities')
      .select('*')
      .eq('agent_id', user?.id)
      .eq('activity_type', 'door_knock')
      .order('activity_date', { ascending: false });
    if (error) console.error('Error fetching door knocks:', error);
    else setActivities(data || []);
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4 flex items-center">
        <DoorClosed className="mr-2" /> Door Knocks
      </h1>
      <button onClick={() => navigate('/agent-dashboard')} className="text-blue-600 hover:underline mb-4">
        Back to Dashboard
      </button>
      {activities.map((activity) => (
        <div key={activity.id} className="bg-white p-4 rounded-lg shadow-md mb-4">
          <p><strong>Street:</strong> {activity.street_name}</p>
          <p><strong>Knocks Made:</strong> {activity.knocks_made}</p>
          <p><strong>Knocks Answered:</strong> {activity.knocks_answered}</p>
          <p><strong>Notes:</strong> {activity.notes || 'N/A'}</p>
          <p><strong>Date:</strong> {new Date(activity.activity_date).toLocaleDateString()}</p>
        </div>
      ))}
    </div>
  );
}