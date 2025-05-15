// src/types/property.ts
export interface Property {
    id: string;
    street_number?: string;
    street_name?: string;
    address: string;
    property_type: string;
    suburb: string;
    city: string;
    country: string;
    bedrooms: number;
    bathrooms: number;
    car_garage: number;
    square_feet: number;
    price: number;
    agent_name: string;
    agency_name: string;
    category: 'Listing' | 'Sold' | 'Under Offer';
    listed_date: string;
    sale_type?: 'Private Treaty' | 'Auction' | 'EOI';
    expected_price?: number;
    features?: string[];
  }