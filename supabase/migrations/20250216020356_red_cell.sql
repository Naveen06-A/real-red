/*
  # Add Historical Property Data Table

  1. New Tables
    - property_history
      - id (uuid, primary key)
      - property_type (text)
      - city (text)
      - price (numeric)
      - sale_date (timestamp)
      - price_trend (numeric) - percentage change from previous quarter

  2. Security
    - Enable RLS on property_history table
    - Add policies for read access
*/

CREATE TABLE IF NOT EXISTS property_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_type text NOT NULL,
  city text NOT NULL,
  price numeric NOT NULL,
  sale_date timestamptz NOT NULL,
  price_trend numeric,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE property_history ENABLE ROW LEVEL SECURITY;

-- Allow read access to everyone
CREATE POLICY "Anyone can view property history"
  ON property_history
  FOR SELECT
  USING (true);