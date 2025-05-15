/*
  # Enhanced Property Management Schema

  1. New Tables
    - `agents` - Store agent and agency information
    - `property_transactions` - Track property sales and listings
    - `property_market_data` - Store market statistics
    - `property_amenities` - Manage property amenities
    
  2. Changes
    - Add new columns to properties table
    - Add relationships between tables
    
  3. Security
    - Enable RLS on all new tables
    - Add appropriate policies for data access
*/

-- Create agents table
CREATE TABLE IF NOT EXISTS agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  agency_name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text,
  commission_rate numeric DEFAULT 2.5,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create property_transactions table
CREATE TABLE IF NOT EXISTS property_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) NOT NULL,
  agent_id uuid REFERENCES agents(id),
  transaction_type text NOT NULL CHECK (transaction_type IN ('listing', 'sold', 'under_offer')),
  sale_type text CHECK (sale_type IN ('private_treaty', 'auction', 'eoi')),
  list_price numeric NOT NULL,
  sold_price numeric,
  expected_price numeric,
  commission_earned numeric,
  listed_date timestamptz NOT NULL DEFAULT now(),
  sale_date timestamptz,
  days_on_market integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create property_market_data table
CREATE TABLE IF NOT EXISTS property_market_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suburb text NOT NULL,
  street text NOT NULL,
  property_type text NOT NULL,
  total_listings integer DEFAULT 0,
  total_sales integer DEFAULT 0,
  avg_days_on_market numeric DEFAULT 0,
  avg_sale_price numeric DEFAULT 0,
  avg_list_price numeric DEFAULT 0,
  period_start date NOT NULL,
  period_end date NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create property_amenities table
CREATE TABLE IF NOT EXISTS property_amenities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) NOT NULL,
  amenity text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add new columns to properties table
ALTER TABLE properties 
  ADD COLUMN IF NOT EXISTS street_number text,
  ADD COLUMN IF NOT EXISTS street_name text,
  ADD COLUMN IF NOT EXISTS suburb text,
  ADD COLUMN IF NOT EXISTS landmark text,
  ADD COLUMN IF NOT EXISTS facing_direction text,
  ADD COLUMN IF NOT EXISTS property_age integer,
  ADD COLUMN IF NOT EXISTS is_new boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES agents(id);

-- Enable RLS
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_market_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_amenities ENABLE ROW LEVEL SECURITY;

-- Create policies for agents
CREATE POLICY "Public agents are viewable by everyone"
  ON agents FOR SELECT
  USING (true);

CREATE POLICY "Agents can update their own records"
  ON agents FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = id::text)
  WITH CHECK (auth.uid()::text = id::text);

-- Create policies for property_transactions
CREATE POLICY "Property transactions are viewable by everyone"
  ON property_transactions FOR SELECT
  USING (true);

CREATE POLICY "Agents can manage their property transactions"
  ON property_transactions FOR ALL
  TO authenticated
  USING (
    agent_id IN (
      SELECT id FROM agents WHERE auth.uid()::text = agents.id::text
    )
  );

-- Create policies for property_market_data
CREATE POLICY "Market data is viewable by everyone"
  ON property_market_data FOR SELECT
  USING (true);

CREATE POLICY "Only admins can manage market data"
  ON property_market_data FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'email' = 'admin@example.com');

-- Create policies for property_amenities
CREATE POLICY "Property amenities are viewable by everyone"
  ON property_amenities FOR SELECT
  USING (true);

CREATE POLICY "Property owners can manage amenities"
  ON property_amenities FOR ALL
  TO authenticated
  USING (
    property_id IN (
      SELECT id FROM properties WHERE auth.uid() = properties.user_id
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_property_transactions_property_id ON property_transactions(property_id);
CREATE INDEX IF NOT EXISTS idx_property_transactions_agent_id ON property_transactions(agent_id);
CREATE INDEX IF NOT EXISTS idx_property_market_data_location ON property_market_data(suburb, street);
CREATE INDEX IF NOT EXISTS idx_property_amenities_property_id ON property_amenities(property_id);
CREATE INDEX IF NOT EXISTS idx_properties_agent_id ON properties(agent_id);
CREATE INDEX IF NOT EXISTS idx_properties_location ON properties(suburb, street_name);