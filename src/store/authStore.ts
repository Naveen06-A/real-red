import { create } from 'zustand';
import { supabase } from '../lib/supabase';

interface User {
  id: string;
  email?: string;
  agent_name?: string;
  agency_name?: string;
}
interface UserProfile {
  name: string;
  phone: string;
  email: string;
  role: 'user' | 'agent' | 'admin';
}

interface AuthState {
  user: { id: string; email?: string } | null;
  profile: UserProfile | null;
  loading: boolean;
  setUser: (user: User) => void;
  setProfile: (profile: UserProfile) => void;
  initializeAuth: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  getUserProfile: () => UserProfile | null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: false,
  setUser: (user) => {
    console.log('Setting user:', user);
    set({ user });
  },
  setProfile: (profile) => {
    console.log('Setting profile:', profile);
    set({ profile });
  },
  initializeAuth: async () => {
    console.log('Starting initializeAuth...');
    set({ loading: true });
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      console.log('Session response:', { session, error });
      if (error) throw new Error(`getSession error: ${error.message}`);
      if (session?.user) {
        set({ user: { id: session.user.id, email: session.user.email } });
        await get().fetchProfile();
      } else {
        set({ user: null, profile: null });
      }
    } catch (error) {
      console.error('initializeAuth failed:', error);
      set({ user: null, profile: null });
    } finally {
      set({ loading: false });
      console.log('initializeAuth completed');
    }
  },
  fetchProfile: async () => {
    const { user } = get();
    if (!user) {
      console.log('No user to fetch profile for');
      return;
    }
    try {
      console.log('Fetching profile for user:', user.id);
      const { data, error } = await supabase
        .from('profiles')
        .select('name, phone, email, role')
        .eq('id', user.id)
        .single();
      if (error) {
        if (error.code === 'PGRST116') {
          console.log('No profile found, creating one...');
          // Note: Defaulting to 'agent' role; consider dynamic role assignment (e.g., via registration)
          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert({
              id: user.id,
              name: user.email?.split('@')[0] || 'Unknown',
              phone: '',
              email: user.email || '',
              role: 'agent',
            })
            .select()
            .single();
          if (insertError) {
            console.error('Profile creation error:', insertError);
            throw new Error(`Profile creation error: ${insertError.message}`);
          }
          set({ profile: newProfile });
          console.log('Profile created:', newProfile);
        } else {
          console.error('fetchProfile error:', error);
          throw new Error(`fetchProfile error: ${error.message}`);
        }
      } else {
        set({ profile: data });
        console.log('Profile fetched:', data);
      }
    } catch (error) {
      console.error('fetchProfile failed:', error);
      set({ profile: null });
    }
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, profile: null, loading: false });
    console.log('Signed out');
  },
  getUserProfile: () => get().profile,
}));