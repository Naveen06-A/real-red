// src/types.ts
export interface TopLister {
  agent: string;
  count: number;
}

export interface CommissionEarner {
  agent: string;
  commission: number;
}

export interface Agent {
  name: string;
  sales: number;
}

export interface Agency {
  name: string;
  sales: number;
}

export interface PropertyDetails {
  id: string;
  street_name: string;
  street_number: string;
  agent_name: string;
  suburb: string;
  postcode: string;
  price: number;
  sold_price?: number;
  category: string;
  property_type: string;
  agency_name?: string;
  commission?: number;
  commission_earned?: number;
  expected_price?: number;
  sale_type?: string;
  bedrooms?: number;
  bathrooms?: number;
  car_garage?: number;
  sqm?: number;
  landsize?: number;
  listed_date?: string;
  sold_date?: string;
  flood_risk?: string;
  bushfire_risk?: string;
  contract_status?: string;
  features?: string[];
  same_street_sales?: any[];
  past_records?: any[];
}

export interface PropertyMetrics {
  listingsBySuburb: Record<string, { listed: number; sold: number }>;
  listingsByStreetName: Record<string, { listed: number; sold: number }>;
  listingsByStreetNumber: Record<string, { listed: number; sold: number }>;
  listingsByAgent: Record<string, { listed: number; sold: number }>;
  listingsByAgency: Record<string, { listed: number; sold: number }>;
  avgSalePriceBySuburb: Record<string, number>;
  avgSalePriceByStreetName: Record<string, number>;
  avgSalePriceByStreetNumber: Record<string, number>;
  avgSalePriceByAgent: Record<string, number>;
  avgSalePriceByAgency: Record<string, number>;
  predictedAvgPriceBySuburb: Record<string, number>;
  predictedConfidenceBySuburb: Record<string, { lower: number; upper: number }>;
  priceTrendsBySuburb: Record<string, Record<string, number>>;
  commissionByAgency: Record<string, Record<string, number>>;
  propertyDetails: PropertyDetails[];
  totalListings: number;
  totalSales: number;
  overallAvgSalePrice: number;
  topListersBySuburb: Record<string, TopLister>;
  ourListingsBySuburb: Record<string, number>;
  topCommissionEarners: CommissionEarner[];
  ourCommission: number;
  topAgents: Agent[];
  ourAgentStats: Agent;
  topAgencies: Agency[];
  ourAgencyStats: Agency;
}