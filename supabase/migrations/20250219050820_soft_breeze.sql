/*
  # Add property type specific fields

  1. Changes
    - Add new columns to properties table for different property types
    - Add validation check constraints
    - Update indexes for performance

  2. New Columns
    Common Fields:
    - bedrooms (integer)
    - bathrooms (integer)
    - square_footage (numeric)
    - year_built (integer)
    - property_condition (text)
    
    Property Type Specific:
    - floors (integer)
    - has_garage (boolean)
    - has_garden (boolean)
    - has_pool (boolean)
    - garden_size (numeric)
    - parking_spaces (integer)
    - luxury_features (text[])
    - amenities (text[])
    - floor_number (integer)
    - total_floors (integer)
    - has_balcony (boolean)
    - furnishing_status (text)
    - maintenance_charges (numeric)
    - land_area (numeric)
    - zoning_type (text)
    - has_utilities (boolean)
    - has_road_access (boolean)
    - topography (text)
    - commercial_usage (text)
    - lease_terms (jsonb)
*/

DO $$ 
BEGIN
  -- Common Fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'bedrooms') THEN
    ALTER TABLE properties 
      ADD COLUMN bedrooms integer,
      ADD COLUMN bathrooms integer,
      ADD COLUMN square_footage numeric,
      ADD COLUMN year_built integer,
      ADD COLUMN property_condition text CHECK (property_condition IN ('New', 'Renovated', 'Old'));
  END IF;

  -- Villa/House Specific
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'floors') THEN
    ALTER TABLE properties 
      ADD COLUMN floors integer,
      ADD COLUMN has_garage boolean DEFAULT false,
      ADD COLUMN has_garden boolean DEFAULT false,
      ADD COLUMN has_pool boolean DEFAULT false,
      ADD COLUMN garden_size numeric,
      ADD COLUMN parking_spaces integer DEFAULT 0,
      ADD COLUMN luxury_features text[];
  END IF;

  -- Apartment Specific
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'floor_number') THEN
    ALTER TABLE properties 
      ADD COLUMN floor_number integer,
      ADD COLUMN total_floors integer,
      ADD COLUMN amenities text[],
      ADD COLUMN has_balcony boolean DEFAULT false,
      ADD COLUMN furnishing_status text CHECK (furnishing_status IN ('Furnished', 'Semi-furnished', 'Unfurnished')),
      ADD COLUMN maintenance_charges numeric DEFAULT 0;
  END IF;

  -- Land Specific
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'land_area') THEN
    ALTER TABLE properties 
      ADD COLUMN land_area numeric,
      ADD COLUMN zoning_type text CHECK (zoning_type IN ('Residential', 'Commercial', 'Agricultural')),
      ADD COLUMN has_utilities boolean DEFAULT false,
      ADD COLUMN has_road_access boolean DEFAULT false,
      ADD COLUMN topography text CHECK (topography IN ('Flat', 'Hilly', 'Sloped'));
  END IF;

  -- Commercial Specific
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'commercial_usage') THEN
    ALTER TABLE properties 
      ADD COLUMN commercial_usage text CHECK (commercial_usage IN ('Office', 'Retail', 'Warehouse')),
      ADD COLUMN lease_terms jsonb;
  END IF;

  -- Create indexes for commonly queried fields
  CREATE INDEX IF NOT EXISTS idx_properties_property_type_bedrooms ON properties(property_type, bedrooms);
  CREATE INDEX IF NOT EXISTS idx_properties_price_range ON properties(price, property_type);
  CREATE INDEX IF NOT EXISTS idx_properties_location ON properties(city, property_type);
END $$;