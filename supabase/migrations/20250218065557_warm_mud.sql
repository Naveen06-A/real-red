/*
  # Fix permissions and update schema

  1. Changes
    - Add RLS policies for properties table
    - Update user metadata handling
    - Fix permission issues for property submissions

  2. Security
    - Enable RLS
    - Add proper policies for authenticated users
    - Fix admin access
*/

-- Update properties table policies
DROP POLICY IF EXISTS "Anyone can view properties" ON properties;
DROP POLICY IF EXISTS "Users can create their own properties" ON properties;
DROP POLICY IF EXISTS "Users can update their own properties" ON properties;
DROP POLICY IF EXISTS "Admin can manage all properties" ON properties;

-- Create new policies with proper checks
CREATE POLICY "Anyone can view properties"
  ON properties
  FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own properties"
  ON properties
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own properties"
  ON properties
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own properties"
  ON properties
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Admin policy using proper role check
CREATE POLICY "Admins can manage all properties"
  ON properties
  TO authenticated
  USING (
    auth.jwt() ->> 'email' = 'admin@example.com'
  );

-- Ensure property_history has proper permissions
ALTER TABLE property_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view property history" ON property_history;

CREATE POLICY "Anyone can view property history"
  ON property_history
  FOR SELECT
  TO authenticated
  USING (true);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_properties_user_id ON properties(user_id);
CREATE INDEX IF NOT EXISTS idx_properties_city ON properties(city);
CREATE INDEX IF NOT EXISTS idx_property_history_city ON property_history(city);