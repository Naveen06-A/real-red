// AgentProfileOTP.tsx
import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';

export function AgentProfileOTP() {
  const { id } = useParams();
  const [otp, setOtp] = useState('');
  const [profile, setProfile] = useState<Agent | null>(null);

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase
        .from('share_links')
        .select('agentId, expiresAt')
        .eq('token', otp)
        .eq('agentId', id)
        .gte('expiresAt', format(new Date(), 'yyyy-MM-dd HH:mm:ss'))
        .single();
      if (error || !data) throw new Error('Invalid or expired OTP');

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, role, permissions, name, phone')
        .eq('id', data.agentId)
        .single();
      if (profileError) throw profileError;

      setProfile(profileData);
    } catch (error: any) {
      toast.error(error.message || 'Failed to verify OTP');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-4">Verify OTP</h2>
      {!profile ? (
        <form onSubmit={handleVerifyOTP} className="space-y-4 max-w-md">
          <div>
            <label htmlFor="otp" className="block text-sm font-medium text-gray-700">
              Enter OTP
            </label>
            <input
              id="otp"
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
              required
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Verify
          </button>
        </form>
      ) : (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold">Agent Profile</h3>
          <p>Email: {profile.email}</p>
          <p>Name: {profile.name || '-'}</p>
          <p>Role: {profile.role}</p>
          <p>Permissions: {Object.entries(profile.permissions).filter(([_, v]) => v).map(([k]) => k).join(', ') || 'None'}
          </p>
        </div>
      )}
    </div>
  );
}