/*
  # Add pincode column to properties table

  1. Changes
    - Add pincode column to properties table
    - Add index on pincode for better search performance

  2. Notes
    - Pincode is required for all properties
    - Added index to improve search performance by pincode
    - Uses a two-step process to handle existing records
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'properties' AND column_name = 'pincode'
  ) THEN
    -- First add the column with a default value
    ALTER TABLE properties ADD COLUMN pincode text DEFAULT '000000';
    
    -- Then make it NOT NULL
    ALTER TABLE properties ALTER COLUMN pincode SET NOT NULL;
    
    -- Create index for better performance
    CREATE INDEX IF NOT EXISTS idx_properties_pincode ON properties(pincode);
  END IF;
END $$;