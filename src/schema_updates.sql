-- Add approved and tfa_enabled columns to profiles table
ALTER TABLE profiles
ADD COLUMN approved BOOLEAN DEFAULT FALSE,
ADD COLUMN tfa_enabled BOOLEAN DEFAULT FALSE;

-- Create auth_logs table
CREATE TABLE auth_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  details TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);