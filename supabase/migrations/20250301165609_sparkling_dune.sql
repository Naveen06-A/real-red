/*
  # Property Enhancements

  1. New Tables
    - `property_sales_stats` - For tracking sales statistics by location, agent, and agency
    - `property_market_reports` - For storing aggregated market reports
  
  2. Changes
    - Add additional fields to existing tables to support new features
    - Add relationships between tables
  
  3. Security
    - Enable RLS on new tables
    - Add policies for data access
*/

-- Create property_sales_stats table
CREATE TABLE IF NOT EXISTS property_sales_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suburb text NOT NULL,
  street_name text,
  agent_id uuid REFERENCES agents(id),
  agency_name text,
  property_type text NOT NULL,
  sale_type text NOT NULL,
  total_listings integer DEFAULT 0,
  total_sales integer DEFAULT 0,
  avg_days_on_market numeric DEFAULT 0,
  avg_sale_price numeric DEFAULT 0,
  avg_list_price numeric DEFAULT 0,
  avg_commission numeric DEFAULT 0,
  unsold_properties integer DEFAULT 0,
  undersold_properties integer DEFAULT 0,
  oversold_properties integer DEFAULT 0,
  period_start date NOT NULL,
  period_end date NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create property_market_reports table
CREATE TABLE IF NOT EXISTS property_market_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL,
  report_title text NOT NULL,
  report_data jsonb NOT NULL,
  location_type text NOT NULL,
  location_value text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key to property_market_data to link with properties
ALTER TABLE property_market_data 
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES properties(id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_property_sales_stats_location ON property_sales_stats(suburb, street_name);
CREATE INDEX IF NOT EXISTS idx_property_sales_stats_agent ON property_sales_stats(agent_id);
CREATE INDEX IF NOT EXISTS idx_property_sales_stats_agency ON property_sales_stats(agency_name);
CREATE INDEX IF NOT EXISTS idx_property_market_reports_location ON property_market_reports(location_type, location_value);
CREATE INDEX IF NOT EXISTS idx_property_market_data_property_id ON property_market_data(property_id);

-- Enable RLS
ALTER TABLE property_sales_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_market_reports ENABLE ROW LEVEL SECURITY;

-- Create policies for property_sales_stats
CREATE POLICY "Property sales stats are viewable by everyone"
  ON property_sales_stats FOR SELECT
  USING (true);

CREATE POLICY "Only admins can manage property sales stats"
  ON property_sales_stats FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'email' = 'admin@example.com');

-- Create policies for property_market_reports
CREATE POLICY "Property market reports are viewable by everyone"
  ON property_market_reports FOR SELECT
  USING (true);

CREATE POLICY "Only admins can manage property market reports"
  ON property_market_reports FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'email' = 'admin@example.com');

-- Insert sample data for property_market_data
INSERT INTO property_market_data (suburb, street, property_type, total_listings, total_sales, avg_days_on_market, avg_sale_price, avg_list_price, period_start, period_end)
VALUES
  ('Bondi', 'Campbell Parade', 'apartment', 45, 32, 28, 1250000, 1300000, '2024-01-01', '2024-06-30'),
  ('Surry Hills', 'Crown Street', 'house', 22, 18, 35, 1850000, 1900000, '2024-01-01', '2024-06-30'),
  ('Paddington', 'Oxford Street', 'villa', 15, 12, 42, 2100000, 2200000, '2024-01-01', '2024-06-30'),
  ('Manly', 'The Corso', 'apartment', 38, 29, 31, 1150000, 1200000, '2024-01-01', '2024-06-30'),
  ('Newtown', 'King Street', 'house', 25, 20, 38, 1450000, 1500000, '2024-01-01', '2024-06-30'),
  ('Mosman', 'Military Road', 'villa', 18, 14, 45, 3200000, 3300000, '2024-01-01', '2024-06-30'),
  ('Double Bay', 'New South Head Road', 'apartment', 30, 24, 33, 1950000, 2000000, '2024-01-01', '2024-06-30'),
  ('Balmain', 'Darling Street', 'house', 20, 16, 40, 1750000, 1800000, '2024-01-01', '2024-06-30'),
  ('Coogee', 'Arden Street', 'unit', 35, 28, 30, 1050000, 1100000, '2024-01-01', '2024-06-30'),
  ('Randwick', 'Alison Road', 'house', 28, 22, 36, 1650000, 1700000, '2024-01-01', '2024-06-30');

-- Insert sample data for agents if not exists
INSERT INTO agents (name, agency_name, email, phone, commission_rate)
SELECT 
  'John Smith', 'Sydney Real Estate', 'john@sydneyrealestate.com', '0412345678', 2.5
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE email = 'john@sydneyrealestate.com');

INSERT INTO agents (name, agency_name, email, phone, commission_rate)
SELECT 
  'Sarah Johnson', 'Harbour Properties', 'sarah@harbourproperties.com', '0423456789', 2.2
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE email = 'sarah@harbourproperties.com');

INSERT INTO agents (name, agency_name, email, phone, commission_rate)
SELECT 
  'Michael Wong', 'City Homes', 'michael@cityhomes.com', '0434567890', 2.8
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE email = 'michael@cityhomes.com');

-- Insert sample data for property_sales_stats
INSERT INTO property_sales_stats (suburb, street_name, agency_name, property_type, sale_type, total_listings, total_sales, avg_days_on_market, avg_sale_price, avg_list_price, avg_commission, unsold_properties, undersold_properties, oversold_properties, period_start, period_end)
VALUES
  ('Bondi', 'Campbell Parade', 'Sydney Real Estate', 'apartment', 'private_treaty', 28, 22, 30, 1250000, 1300000, 31250, 6, 8, 14, '2024-01-01', '2024-06-30'),
  ('Surry Hills', 'Crown Street', 'Harbour Properties', 'house', 'auction', 15, 12, 25, 1850000, 1900000, 40700, 3, 5, 7, '2024-01-01', '2024-06-30'),
  ('Paddington', 'Oxford Street', 'City Homes', 'villa', 'eoi', 10, 8, 45, 2100000, 2200000, 58800, 2, 3, 5, '2024-01-01', '2024-06-30'),
  ('Manly', 'The Corso', 'Sydney Real Estate', 'apartment', 'private_treaty', 22, 18, 32, 1150000, 1200000, 28750, 4, 6, 12, '2024-01-01', '2024-06-30'),
  ('Newtown', 'King Street', 'Harbour Properties', 'house', 'auction', 18, 15, 28, 1450000, 1500000, 31900, 3, 5, 10, '2024-01-01', '2024-06-30'),
  ('Mosman', 'Military Road', 'City Homes', 'villa', 'eoi', 12, 9, 50, 3200000, 3300000, 89600, 3, 2, 7, '2024-01-01', '2024-06-30');

-- Insert sample data for property_market_reports
INSERT INTO property_market_reports (report_type, report_title, report_data, location_type, location_value, period_start, period_end)
VALUES
  ('suburb_analysis', 'Bondi Market Analysis', 
   '{
     "total_properties": 120,
     "total_listings": 45,
     "total_sales": 32,
     "avg_price": 1250000,
     "price_growth": 5.2,
     "popular_property_types": ["apartment", "house", "unit"],
     "avg_days_on_market": 28,
     "price_ranges": {
       "under_1m": 12,
       "1m_to_2m": 18,
       "over_2m": 2
     },
     "sale_types": {
       "private_treaty": 22,
       "auction": 8,
       "eoi": 2
     }
   }',
   'suburb', 'Bondi', '2024-01-01', '2024-06-30'),
   
  ('agent_performance', 'Top Performing Agents', 
   '{
     "agents": [
       {
         "name": "John Smith",
         "agency": "Sydney Real Estate",
         "total_sales": 28,
         "total_value": 35000000,
         "avg_days_on_market": 25,
         "commission_earned": 875000
       },
       {
         "name": "Sarah Johnson",
         "agency": "Harbour Properties",
         "total_sales": 22,
         "total_value": 30000000,
         "avg_days_on_market": 30,
         "commission_earned": 660000
       },
       {
         "name": "Michael Wong",
         "agency": "City Homes",
         "total_sales": 18,
         "total_value": 40000000,
         "avg_days_on_market": 35,
         "commission_earned": 1120000
       }
     ]
   }',
   'city', 'Sydney', '2024-01-01', '2024-06-30'),
   
  ('market_trends', 'Sydney Market Trends', 
   '{
     "price_trends": {
       "house": {
         "current_avg": 1750000,
         "previous_avg": 1650000,
         "growth": 6.1
       },
       "apartment": {
         "current_avg": 1150000,
         "previous_avg": 1100000,
         "growth": 4.5
       },
       "villa": {
         "current_avg": 2200000,
         "previous_avg": 2050000,
         "growth": 7.3
       }
     },
     "days_on_market_trends": {
       "house": {
         "current_avg": 35,
         "previous_avg": 40,
         "change": -12.5
       },
       "apartment": {
         "current_avg": 28,
         "previous_avg": 32,
         "change": -12.5
       },
       "villa": {
         "current_avg": 42,
         "previous_avg": 45,
         "change": -6.7
       }
     },
     "sale_type_trends": {
       "private_treaty": {
         "current_percentage": 65,
         "previous_percentage": 70,
         "change": -7.1
       },
       "auction": {
         "current_percentage": 25,
         "previous_percentage": 20,
         "change": 25
       },
       "eoi": {
         "current_percentage": 10,
         "previous_percentage": 10,
         "change": 0
       }
     }
   }',
   'city', 'Sydney', '2024-01-01', '2024-06-30');