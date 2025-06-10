import { supabase } from '../lib/supabase';
import { MarketingPlan } from '../types/marketingPlan';

export const fetchMarketingPlans = async (): Promise<MarketingPlan[]> => {
  const { data, error } = await supabase.from('marketing_plans').select('*');
  if (error) throw error;
  return data || [];
};

export const createMarketingPlan = async (plan: MarketingPlan) => {
  const { error } = await supabase.from('marketing_plans').insert([plan]);
  if (error) throw error;
};