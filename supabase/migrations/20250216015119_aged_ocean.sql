/*
  # Initial Schema Setup for Real Estate Platform

  1. New Tables
    - properties
      - id (uuid, primary key)
      - user_id (uuid, foreign key to auth.users)
      - name (text)
      - address (text)
      - city (text)
      - country (text)
      - survey_number (text)
      - phone (text)
      - email (text)
      - property_type (text)
      - price (numeric)
      - created_at (timestamp)
      - updated_at (timestamp)

  2. Security
    - Enable RLS on properties table
    - Add policies for:
      - Users can read all properties
      - Users can only insert/update their own properties
      - Admin can manage all properties
*/

-- Create properties table
CREATE TABLE IF NOT EXISTS properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  name text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  country text NOT NULL,
  survey_number text,
  phone text,
  email text,
  property_type text NOT NULL,
  price numeric NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view properties"
  ON properties
  FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own properties"
  ON properties
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own properties"
  ON properties
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin policies (based on email)
CREATE POLICY "Admin can manage all properties"
  ON properties
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.email = 'admin@example.com'
    )
  );