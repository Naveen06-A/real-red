import { supabase } from '../lib/supabase';
import { Property } from '../types/property';

export const fetchProperties = async (): Promise<Property[]> => {
  const { data, error } = await supabase.from('properties').select('*');
  if (error) throw error;
  return data || [];
};

export const createProperty = async (property: Property) => {
  const { error } = await supabase.from('properties').insert([property]);
  if (error) throw error;
};