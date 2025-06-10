import { supabase } from '../lib/supabase';

export const signUp = async (email: string, password: string, data: { name: string; phone: string }) => {
  return await supabase.auth.signUp({ email, password, options: { data } });
};

export const signOut = async () => {
  return await supabase.auth.signOut();
};