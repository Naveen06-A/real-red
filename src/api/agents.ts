import { supabase } from '../lib/supabase';
import { Agent } from '../types/agent';

export const fetchAgents = async (): Promise<Agent[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, phone, permissions')
    .eq('role', 'agent');
  if (error) throw error;
  return data || [];
};

export const createAgentProfile = async (agent: Omit<Agent, 'id'> & { id: string }) => {
  const { error } = await supabase.from('profiles').insert([agent]);
  if (error) throw error;
};