import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Agent, Property, ActivityReport, DashboardSummary } from '../types/agent';

interface AgentState {
  agent: Agent | null;
  properties: Property[];
  activities: ActivityReport[];
  dashboardSummary: DashboardSummary | null;
  loading: boolean;
  error: string | null;
  setAgent: (agent: Agent | null) => void;
  fetchProperties: () => Promise<void>;
  fetchActivities: () => Promise<void>;
  fetchDashboardSummary: () => Promise<void>;
  addProperty: (property: Omit<Property, 'id' | 'created_at'>) => Promise<void>;
  addActivityReport: (report: Omit<ActivityReport, 'id' | 'created_at'>) => Promise<void>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agent: null,
  properties: [],
  activities: [],
  dashboardSummary: null,
  loading: false,
  error: null,

  setAgent: (agent) => set({ agent }),

  fetchProperties: async () => {
    try {
      set({ loading: true, error: null });
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .eq('agent_id', get().agent?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      set({ properties: data || [] });
    } catch (error: any) {
      set({ error: error.message });
    } finally {
      set({ loading: false });
    }
  },

  fetchActivities: async () => {
    try {
      set({ loading: true, error: null });
      const { data, error } = await supabase
        .from('activity_reports')
        .select('*')
        .eq('agent_id', get().agent?.id)
        .order('date', { ascending: false });

      if (error) throw error;
      set({ activities: data || [] });
    } catch (error: any) {
      set({ error: error.message });
    } finally {
      set({ loading: false });
    }
  },

  fetchDashboardSummary: async () => {
    try {
      set({ loading: true, error: null });
      const agent = get().agent;
      if (!agent) throw new Error('No agent logged in');

      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      const [propertiesResponse, activitiesResponse] = await Promise.all([
        supabase
          .from('properties')
          .select('*')
          .eq('agent_id', agent.id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('activity_reports')
          .select('*')
          .eq('agent_id', agent.id)
          .gte('date', startOfMonth.toISOString())
          .order('date', { ascending: false })
      ]);

      if (propertiesResponse.error) throw propertiesResponse.error;
      if (activitiesResponse.error) throw activitiesResponse.error;

      const activities = activitiesResponse.data || [];
      const dailyActivities = activities.filter(a => 
        new Date(a.date).toDateString() === today.toDateString()
      );
      const weeklyActivities = activities.filter(a => 
        new Date(a.date) >= startOfWeek
      );
      const monthlyActivities = activities;

      set({
        dashboardSummary: {
          recent_properties: propertiesResponse.data || [],
          daily_activities: dailyActivities,
          weekly_activities: weeklyActivities,
          monthly_activities: monthlyActivities
        }
      });
    } catch (error: any) {
      set({ error: error.message });
    } finally {
      set({ loading: false });
    }
  },

  addProperty: async (property) => {
    try {
      set({ loading: true, error: null });
      const { data, error } = await supabase
        .from('properties')
        .insert([{ ...property, agent_id: get().agent?.id }])
        .select()
        .single();

      if (error) throw error;
      set(state => ({
        properties: [data, ...state.properties]
      }));
    } catch (error: any) {
      set({ error: error.message });
    } finally {
      set({ loading: false });
    }
  },

  addActivityReport: async (report) => {
    try {
      set({ loading: true, error: null });
      const { data, error } = await supabase
        .from('activity_reports')
        .insert([{ ...report, agent_id: get().agent?.id }])
        .select()
        .single();

      if (error) throw error;
      set(state => ({
        activities: [data, ...state.activities]
      }));
      await get().fetchDashboardSummary();
    } catch (error: any) {
      set({ error: error.message });
    } finally {
      set({ loading: false });
    }
  }
}));