import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  User, 
  Heart, 
  Cake, 
  Gift, 
  Coffee, 
  Utensils, 
  MapPin, 
  Film, 
  Bike, 
  Car, 
  CheckCircle, 
  DollarSign, 
  RotateCcw, 
  Save 
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { toast } from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { v4 as uuidv4 } from 'uuid';
import confetti from 'canvas-confetti';

interface AgentProfile {
  id?: string;
  agent_id: string;
  birthdate: string;
  spouse_birthdate?: string;
  marital_status: 'single' | 'married' | 'divorced';
  wedding_anniversary?: string;
  number_of_children: number;
  children_birthdays: string[];
  favorite_food: string;
  favorite_place: string;
  favorite_movie: string;
  favorite_bike: string;
  favorite_car: string;
  favourite_drink: string;
  created_at?: string;
  updated_at?: string;
}

export function AgentProfilePage() {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState<AgentProfile>({
    agent_id: user?.id || uuidv4(),
    birthdate: '',
    spouse_birthdate: '',
    marital_status: 'single',
    wedding_anniversary: '',
    number_of_children: 0,
    children_birthdays: [],
    favorite_food: '',
    favorite_place: '',
    favorite_movie: '',
    favorite_bike: '',
    favorite_car: '',
    favourite_drink: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    console.log('Current user:', user);
    if (user?.id) {
      fetchProfile();
    } else {
      console.warn('No user ID available, using fallback UUID for agent_id');
      toast.error('Please log in to load your profile');
    }
  }, [user?.id]);

  const fetchProfile = async () => {
    if (!user?.id) {
      console.warn('Cannot fetch profile: No user ID');
      toast.error('Please log in to load your profile');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('agent_profiles')
        .select('*')
        .eq('agent_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        console.log('Fetched profile data:', data);
        setProfile({ ...data, children_birthdays: data.children_birthdays || [] });
      } else {
        console.log('No profile found, using default state');
      }
    } catch (error: any) {
      console.error('Error fetching profile:', error);
      toast.error(`Failed to load profile: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const validateProfile = (profile: AgentProfile) => {
    if (!profile.birthdate) {
      return 'Please provide at least a birthdate';
    }
    if (!profile.agent_id) {
      return 'User ID is missing';
    }
    return null;
  };

  const saveProfile = async () => {
    if (!user?.id) {
      toast.error('Please log in to save your profile');
      console.warn('Save aborted: No user ID');
      return;
    }

    const validationError = validateProfile(profile);
    if (validationError) {
      toast.error(validationError);
      console.warn('Validation failed:', validationError);
      return;
    }

    setSaving(true);
    setSaveSuccess(false);
    try {
      const profileData = {
        ...profile,
        agent_id: user.id,
        updated_at: new Date().toISOString()
      };
      console.log('Saving profile with data:', profileData);

      if (profile.id) {
        console.log('Updating existing profile with ID:', profile.id);
        const { error } = await supabase
          .from('agent_profiles')
          .update(profileData)
          .eq('id', profile.id);
        if (error) throw error;
        toast.success('Profile updated successfully!');
      } else {
        const newId = uuidv4();
        console.log('Creating new profile with ID:', newId);
        const { data, error } = await supabase
          .from('agent_profiles')
          .insert([{ ...profileData, id: newId, created_at: new Date().toISOString() }])
          .select()
          .single();
        if (error) throw error;
        setProfile(data);
        toast.success('Profile created successfully!');
      }
      setSaveSuccess(true);
      setShowModal(true);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#3B82F6', '#60A5FA', '#93C5FD']
      });
      setTimeout(() => {
        setSaveSuccess(false);
        setShowModal(false);
      }, 4000);
    } catch (error: any) {
      console.error('Error saving profile:', error);
      let errorMessage = 'Failed to save profile';
      if (error.code === '42P01') {
        errorMessage = 'Profile table not found. Please create the table in Supabase.';
      } else if (error.code === '23502') {
        errorMessage = `Missing required field: ${error.details || 'Unknown field'}`;
      } else if (error.code === '42501') {
        errorMessage = 'Permission denied: Please check your Supabase RLS policies';
      } else {
        errorMessage = error.message || 'Unknown error';
      }
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const favoritesData = [
    { name: 'Favorite Food', value: profile.favorite_food, icon: Utensils, description: 'Your go-to comfort food!' },
    { name: 'Favorite Place', value: profile.favorite_place, icon: MapPin, description: 'A place that feels like home.' },
    { name: 'Favorite Movie', value: profile.favorite_movie, icon: Film, description: 'A cinematic masterpiece you love.' },
    { name: 'Favorite Bike', value: profile.favorite_bike, icon: Bike, description: 'Your dream ride on two wheels.' },
    { name: 'Favorite Car', value: profile.favorite_car, icon: Car, description: 'The car you’d love to cruise in.' },
    { name: 'Favorite Drink', value: profile.favourite_drink, icon: Coffee, description: 'Your perfect sip for any moment.' }
  ].filter(item => item.value && item.value.trim() !== '');

  const timelineData = [
    profile.birthdate && { name: 'Your Birthday', date: profile.birthdate, icon: 'Cake' },
    profile.wedding_anniversary && profile.marital_status === 'married' && { name: 'Wedding Anniversary', date: profile.wedding_anniversary, icon: 'Heart' },
    ...profile.children_birthdays.map((date, index) => ({ name: `Child ${index + 1} Birthday`, date, icon: 'Gift' }))
  ].filter(Boolean).map((item, index) => ({
    ...item,
    x: index * 100
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-blue-50 to-white py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-blue-900 flex items-center">
                <User className="w-8 h-8 mr-3 text-blue-600" />
                Agent Profile
              </h1>
              <p className="text-blue-600 mt-2">
                Personalize your profile and share your favorites
              </p>
            </div>
            <div className="flex space-x-3">
              <Link
                to="/agent-expenses"
                className="flex items-center px-4 py-2 bg-blue-200 text-blue-700 rounded-lg hover:bg-blue-300 transition-colors"
              >
                <DollarSign className="w-4 h-4 mr-2" />
                Manage Expenses
              </Link>
              <button
                onClick={() => {
                  const resetProfile = {
                    ...profile,
                    birthdate: '',
                    spouse_birthdate: '',
                    marital_status: 'single',
                    wedding_anniversary: '',
                    number_of_children: 0,
                    children_birthdays: [],
                    favorite_food: '',
                    favorite_place: '',
                    favorite_movie: '',
                    favorite_bike: '',
                    favorite_car: '',
                    favourite_drink: ''
                  };
                  console.log('Resetting profile to:', resetProfile);
                  setProfile(resetProfile);
                }}
                className="flex items-center px-4 py-2 bg-blue-200 text-blue-700 rounded-lg hover:bg-blue-300 transition-colors"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </button>
              <button
                onClick={saveProfile}
                disabled={saving || !user?.id}
                className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400 relative overflow-hidden"
              >
                <AnimatePresence>
                  {saving ? (
                    <motion.div
                      key="saving"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center"
                    >
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1 }}
                        className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin"
                      />
                      Saving...
                    </motion.div>
                  ) : saveSuccess ? (
                    <motion.div
                      key="success"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="flex items-center"
                    >
                      <CheckCircle className="w-4 h-4 mr-2 text-green-300" />
                      Saved!
                    </motion.div>
                  ) : (
                    <motion.div
                      key="default"
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Profile
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            </div>
          </div>
        </motion.div>

        {/* Save Confirmation Modal */}
        <AnimatePresence>
          {showModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            >
              <motion.div
                initial={{ scale: 0.8, y: 50 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.8, y: 50 }}
                className="bg-white rounded-lg p-6 max-w-lg w-full shadow-2xl"
              >
                <h2 className="text-xl font-bold text-blue-900 mb-4">Profile Saved Successfully!</h2>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="text-blue-700 font-semibold">Field</div>
                  <div className="text-blue-700 font-semibold">Value</div>
                  {profile.birthdate && (
                    <>
                      <div>Birthdate</div>
                      <div>{profile.birthdate}</div>
                    </>
                  )}
                  {profile.marital_status !== 'single' && profile.spouse_birthdate && (
                    <>
                      <div>Spouse's Birthdate</div>
                      <div>{profile.spouse_birthdate}</div>
                    </>
                  )}
                  {profile.marital_status === 'married' && profile.wedding_anniversary && (
                    <>
                      <div>Wedding Anniversary</div>
                      <div>{profile.wedding_anniversary}</div>
                    </>
                  )}
                  {profile.number_of_children > 0 && profile.children_birthdays.map((date, index) => (
                    <React.Fragment key={index}>
                      <div>Child {index + 1} Birthday</div>
                      <div>{date}</div>
                    </React.Fragment>
                  ))}
                  {profile.favorite_food && (
                    <>
                      <div>Favorite Food</div>
                      <div>{profile.favorite_food}</div>
                    </>
                  )}
                  {profile.favorite_place && (
                    <>
                      <div>Favorite Place</div>
                      <div>{profile.favorite_place}</div>
                    </>
                  )}
                  {profile.favorite_movie && (
                    <>
                      <div>Favorite Movie</div>
                      <div>{profile.favorite_movie}</div>
                    </>
                  )}
                  {profile.favorite_bike && (
                    <>
                      <div>Favorite Bike</div>
                      <div>{profile.favorite_bike}</div>
                    </>
                  )}
                  {profile.favorite_car && (
                    <>
                      <div>Favorite Car</div>
                      <div>{profile.favorite_car}</div>
                    </>
                  )}
                  {profile.favourite_drink && (
                    <>
                      <div>Favorite Drink</div>
                      <div>{profile.favourite_drink}</div>
                    </>
                  )}
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 bg-blue-200 text-blue-700 rounded-lg hover:bg-blue-300 transition-colors"
                  >
                    Close
                  </button>
                  <Link
                    to="/agent-profile"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Edit Profile
                  </Link>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Personal Details Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg p-6 shadow-sm border border-blue-200 mb-8"
        >
          <h2 className="text-lg font-semibold mb-4 text-blue-900 flex items-center">
            <User className="w-5 h-5 mr-2 text-blue-600" />
            Personal Details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-200"
            >
              <label className="block text-sm font-semibold text-blue-700 mb-2">Birthdate</label>
              <input
                type="date"
                value={profile.birthdate}
                onChange={(e) => {
                  console.log('Updating birthdate:', e.target.value);
                  setProfile({ ...profile, birthdate: e.target.value });
                }}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-blue-50 text-blue-800 focus:ring-2 focus:ring-blue-400"
              />
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-200"
            >
              <label className="block text-sm font-semibold text-blue-700 mb-2">Marital Status</label>
              <select
                value={profile.marital_status}
                onChange={(e) => {
                  console.log('Updating marital_status:', e.target.value);
                  setProfile({ ...profile, marital_status: e.target.value as 'single' | 'married' | 'divorced' });
                }}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-blue-50 text-blue-800 focus:ring-2 focus:ring-blue-400"
              >
                <option value="single">Single</option>
                <option value="married">Married</option>
                <option value="divorced">Divorced</option>
              </select>
            </motion.div>
            {profile.marital_status !== 'single' && (
              <>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-200"
                >
                  <label className="block text-sm font-semibold text-blue-700 mb-2">Spouse's Birthdate</label>
                  <input
                    type="date"
                    value={profile.spouse_birthdate}
                    onChange={(e) => {
                      console.log('Updating spouse_birthdate:', e.target.value);
                      setProfile({ ...profile, spouse_birthdate: e.target.value });
                    }}
                    className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-blue-50 text-blue-800 focus:ring-2 focus:ring-blue-400"
                  />
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-200"
                >
                  <label className="block text-sm font-semibold text-blue-700 mb-2">Wedding Anniversary</label>
                  <input
                    type="date"
                    value={profile.wedding_anniversary}
                    onChange={(e) => {
                      console.log('Updating wedding_anniversary:', e.target.value);
                      setProfile({ ...profile, wedding_anniversary: e.target.value });
                    }}
                    className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-blue-50 text-blue-800 focus:ring-2 focus:ring-blue-400"
                  />
                </motion.div>
              </>
            )}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-200"
            >
              <label className="block text-sm font-semibold text-blue-700 mb-2">Number of Children</label>
              <input
                type="number"
                value={profile.number_of_children}
                onChange={(e) => {
                  const num = parseInt(e.target.value) || 0;
                  console.log('Updating number_of_children:', num);
                  setProfile({
                    ...profile,
                    number_of_children: num,
                    children_birthdays: profile.children_birthdays.slice(0, num)
                  });
                }}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-blue-50 text-blue-800 focus:ring-2 focus:ring-blue-400"
                min="0"
              />
            </motion.div>
            {profile.number_of_children > 0 && (
              <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                <label className="block text-sm font-semibold text-blue-700 mb-2">Children's Birthdays</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Array.from({ length: profile.number_of_children }).map((_, index) => (
                    <motion.div
                      key={index}
                      whileHover={{ scale: 1.02 }}
                      className="bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-200"
                    >
                      <input
                        type="date"
                        value={profile.children_birthdays[index] || ''}
                        onChange={(e) => {
                          const newBirthdays = [...profile.children_birthdays];
                          newBirthdays[index] = e.target.value;
                          console.log('Updating child birthday', index + 1, ':', e.target.value);
                          setProfile({ ...profile, children_birthdays: newBirthdays });
                        }}
                        className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-blue-50 text-blue-800 focus:ring-2 focus:ring-blue-400"
                        placeholder={`Child ${index + 1} Birthday`}
                      />
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-200"
            >
              <label className="block text-sm font-semibold text-blue-700 mb-2">Favorite Food</label>
              <input
                type="text"
                value={profile.favorite_food}
                onChange={(e) => {
                  console.log('Updating favorite_food:', e.target.value);
                  setProfile({ ...profile, favorite_food: e.target.value });
                }}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-blue-50 text-blue-800 focus:ring-2 focus:ring-blue-400"
                placeholder="e.g., Pizza"
              />
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-200"
            >
              <label className="block text-sm font-semibold text-blue-700 mb-2">Favorite Place</label>
              <input
                type="text"
                value={profile.favorite_place}
                onChange={(e) => {
                  console.log('Updating favorite_place:', e.target.value);
                  setProfile({ ...profile, favorite_place: e.target.value });
                }}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-blue-50 text-blue-800 focus:ring-2 focus:ring-blue-400"
                placeholder="e.g., Paris"
              />
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-200"
            >
              <label className="block text-sm font-semibold text-blue-700 mb-2">Favorite Movie</label>
              <input
                type="text"
                value={profile.favorite_movie}
                onChange={(e) => {
                  console.log('Updating favorite_movie:', e.target.value);
                  setProfile({ ...profile, favorite_movie: e.target.value });
                }}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-blue-50 text-blue-800 focus:ring-2 focus:ring-blue-400"
                placeholder="e.g., The Shawshank Redemption"
              />
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-200"
            >
              <label className="block text-sm font-semibold text-blue-700 mb-2">Favorite Bike</label>
              <input
                type="text"
                value={profile.favorite_bike}
                onChange={(e) => {
                  console.log('Updating favorite_bike:', e.target.value);
                  setProfile({ ...profile, favorite_bike: e.target.value });
                }}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-blue-50 text-blue-800 focus:ring-2 focus:ring-blue-400"
                placeholder="e.g., Harley-Davidson"
              />
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-200"
            >
              <label className="block text-sm font-semibold text-blue-700 mb-2">Favorite Car</label>
              <input
                type="text"
                value={profile.favorite_car}
                onChange={(e) => {
                  console.log('Updating favorite_car:', e.target.value);
                  setProfile({ ...profile, favorite_car: e.target.value });
                }}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-blue-50 text-blue-800 focus:ring-2 focus:ring-blue-400"
                placeholder="e.g., Tesla Model S"
              />
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-200"
            >
              <label className="block text-sm font-semibold text-blue-700 mb-2">Favorite Drink</label>
              <input
                type="text"
                value={profile.favourite_drink}
                onChange={(e) => {
                  console.log('Updating favourite_drink:', e.target.value);
                  setProfile({ ...profile, favourite_drink: e.target.value });
                }}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-blue-50 text-blue-800 focus:ring-2 focus:ring-blue-400"
                placeholder="e.g., Espresso"
              />
            </motion.div>
          </div>
        </motion.div>

        {/* Favorites Showcase Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg p-6 shadow-sm border border-blue-200 mb-8"
        >
          <h2 className="text-lg font-semibold mb-4 text-blue-900 flex items-center">
            <Heart className="w-5 h-5 mr-2 text-blue-600" />
            Favorites Showcase
          </h2>
          {favoritesData.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {favoritesData.map((item, index) => (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.05, boxShadow: '0 10px 20px rgba(0, 0, 0, 0.1)' }}
                  className="relative bg-blue-100 p-4 rounded-lg shadow-sm border border-blue-200 group"
                >
                  <div className="flex items-center mb-2">
                    <item.icon className="w-6 h-6 text-blue-600 mr-2" />
                    <h3 className="text-sm font-semibold text-blue-700">{item.name}</h3>
                  </div>
                  <p className="text-blue-800">{item.value}</p>
                  <div className="absolute z-10 hidden group-hover:block bg-blue-800 text-white text-xs rounded py-2 px-4 -top-10 left-1/2 transform -translate-x-1/2 w-64">
                    {item.description}
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-blue-600">Add your favorite items to showcase them here!</p>
          )}
        </motion.div>

        {/* Life Highlights Timeline */}
        {timelineData.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-lg p-6 shadow-sm border border-blue-200 mb-8"
          >
            <h2 className="text-lg font-semibold mb-4 text-blue-900 flex items-center">
              <Cake className="w-5 h-5 mr-2 text-blue-600" />
              Life Highlights Timeline
            </h2>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timelineData} layout="vertical" margin={{ top: 20, right: 30, left: 50, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#BFDBFE" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" stroke="#1E3A8A" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#EFF6FF', borderColor: '#3B82F6' }}
                    formatter={(value: number, name: string, entry: any) => [entry.payload.date, entry.payload.name]}
                  />
                  <Bar dataKey="x" fill="#3B82F6" barSize={20}>
                    <LabelList dataKey="name" position="right" fill="#1E3A8A" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default AgentProfilePage;