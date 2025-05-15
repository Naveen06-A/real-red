/*
  # Add Property Data for Bellbowrie Area

  1. Changes
    - Insert property data for Bellbowrie area
    - Update property specifications and details
    - Include flood and bushfire risk information
    - Add sales history and street data

  2. Notes
    - All properties are in Bellbowrie area
    - Includes various property types (houses, units, land)
    - Contains flood and bushfire risk assessments
    - Includes open home dates and sale status
*/

-- Insert property data
INSERT INTO properties (
  street_number,
  street_name,
  suburb,
  property_type,
  bedrooms,
  bathrooms,
  car_garage,
  landsize,
  listed_date,
  days_on_market,
  sale_type,
  expected_price,
  price,
  agent_name,
  agency_name,
  flood_risk,
  bushfire_risk,
  open_home,
  contract_status,
  category,
  features
) VALUES
  ('121', 'Lather Road', 'BELLBOWRIE', 'house', 4, 3, 4, 14700, '2024-11-29', 68, 'Private Treaty', NULL, NULL, 'Kel Goesch', 'Bne RE', 'High', 'High', NULL, NULL, 'Listing', ARRAY['1.47 HA']),
  ('15', 'Stanaway Place', 'BELLBOWRIE', 'house', 5, 2, 2, 964, '2024-12-11', 70, 'Private Treaty', 1100000, NULL, 'Jane Martin', 'Plum', 'High', 'High', NULL, NULL, 'Listing', ARRAY['964 m2']),
  ('65', 'Westaway Crescent', 'BELLBOWRIE', 'house', 4, 2, 2, 1753, '2025-01-08', 53, 'Private Treaty', 1210000, 1100000, 'Gill Barr', 'BARR', 'High', 'High', '2025-01-23 13:00:00', NULL, 'Listing', ARRAY['1753 m2']),
  ('159', 'Pioneer Crescent', 'BELLBOWRIE', 'house', 5, 2, 3, 1567, '2025-01-04', 57, 'Negotiation', NULL, NULL, 'Nigel Page', '@Realty', 'Low', 'High', '2025-01-18 11:00:00', 'Under Offer', 'Under Offer', ARRAY['1567 m2']),
  ('5', 'Boxthorn Street', 'BELLBOWRIE', 'house', 5, 2, 1, 1055, '2024-09-20', 163, 'Private Treaty', 1340000, 1160000, 'Gill Barr', 'BARR', 'Medium', 'Medium', NULL, 'Under Offer', 'Under Offer', ARRAY['1055 m2']),
  ('30A', 'Church Road', 'BELLBOWRIE', 'house', 5, 2, 2, 1383, '2025-01-03', 58, 'Private Treaty', 1100000, NULL, 'Jane Martin', 'Plum', 'High', 'Low', NULL, NULL, 'Listing', ARRAY['1383 m2']),
  ('166', 'Pioneer Crescent', 'BELLBOWRIE', 'house', 4, 2, 3, 1400, '2024-12-04', 88, 'Private Treaty', 1250000, 1200000, 'Carrie & Richard Bischoff', 'Place (Karalee)', 'High', 'Low', '2025-01-18 11:15:00', NULL, 'Listing', ARRAY['1400 m2']),
  ('28', 'Limosa Street', 'BELLBOWRIE', 'house', 4, 2, 4, 1017, '2024-12-15', 25, 'Private Treaty', 822000, 1200000, 'Gill Barr', 'BARR', 'High', 'Low', NULL, NULL, 'Listing', ARRAY['1017 m2']),
  ('3026', 'Moggill Road', 'BELLBOWRIE', 'house', 5, 3, 4, 30200, '2025-01-16', 20, 'Auction', 3000000, NULL, 'Jason Yang', 'NGU', 'Low', 'High', '2025-01-25 12:15:00', NULL, 'Listing', ARRAY['3.02 HA']);

-- Insert same street sales data
INSERT INTO property_history (
  property_type,
  street_name,
  suburb,
  sale_date,
  price
) VALUES
  ('house', 'Stanaway Place', 'BELLBOWRIE', '2017-09-10', 580000),
  ('house', 'Westaway Crescent', 'BELLBOWRIE', '2001-06-26', 84000),
  ('house', 'Pioneer Crescent', 'BELLBOWRIE', '1993-02-10', 78000),
  ('house', 'Boxthorn Street', 'BELLBOWRIE', '2008-06-10', 380000),
  ('house', 'Church Road', 'BELLBOWRIE', '2007-06-29', 385000),
  ('house', 'Pioneer Crescent', 'BELLBOWRIE', '2015-10-08', 535000),
  ('house', 'Limosa Street', 'BELLBOWRIE', '2023-11-28', 665000),
  ('house', 'Moggill Road', 'BELLBOWRIE', '2009-07-28', 550000);

-- Update property market data
INSERT INTO property_market_data (
  suburb,
  street_name,
  property_type,
  total_listings,
  total_sales,
  avg_days_on_market,
  avg_sale_price,
  avg_list_price,
  period_start,
  period_end
) VALUES
  ('BELLBOWRIE', 'ALL', 'house', 25, 15, 45, 1250000, 1300000, '2024-01-01', '2025-01-01'),
  ('BELLBOWRIE', 'Pioneer Crescent', 'house', 3, 2, 60, 1100000, 1200000, '2024-01-01', '2025-01-01'),
  ('BELLBOWRIE', 'Moggill Road', 'house', 2, 1, 30, 2500000, 3000000, '2024-01-01', '2025-01-01'),
  ('BELLBOWRIE', 'Church Road', 'house', 4, 2, 50, 950000, 1100000, '2024-01-01', '2025-01-01');

-- Add property amenities
INSERT INTO property_amenities (
  property_id,
  amenity
) 
SELECT 
  p.id,
  unnest(ARRAY['Large Land', 'River Access', 'Bush Setting']) as amenity
FROM properties p
WHERE p.landsize > 10000;

-- Create market report
INSERT INTO property_market_reports (
  report_type,
  report_title,
  report_data,
  location_type,
  location_value,
  period_start,
  period_end
) VALUES (
  'suburb_analysis',
  'Bellbowrie Market Analysis Q1 2025',
  jsonb_build_object(
    'average_price', 1250000,
    'price_growth', 5.2,
    'days_on_market', 45,
    'total_listings', 25,
    'total_sales', 15,
    'popular_streets', ARRAY['Moggill Road', 'Pioneer Crescent', 'Church Road'],
    'risk_assessment', jsonb_build_object(
      'flood_risk', 'High in most areas',
      'bushfire_risk', 'High in elevated areas',
      'affected_percentage', 75
    )
  ),
  'suburb',
  'BELLBOWRIE',
  '2025-01-01',
  '2025-03-31'
);