export interface TopLister {
  agent_name: string;
  count: number;
}

export interface CommissionEarner {
  agent_name: string;
  commission_earned: number;
}

export interface Agent {
  name: string;
  listings: number;
  sales: number;
  avg_sale_price: number;
  total_commission: number;
}

export interface Agency {
  name: string;
  listings: number;
  sales: number;
  avg_sale_price: number;
  total_commission: number;
}

export interface PropertyDetails {
  id: string;
  street_name: string | null;
  street_number: string | null;
  agent_name: string | null;
  suburb: string | null;
  postcode: string | null;
  price: number;
  sold_price: number | null;
  category: string | null;
  property_type: string | null;
  agency_name: string | null;
  commission: number | null;
  commission_earned: number | null;
  expected_price: number | null;
  sale_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  car_garage: number | null;
  sqm: number | null;
  landsize: number | null;
  listed_date: string | null;
  sold_date: string | null;
  flood_risk: string | null;
  bushfire_risk: string | null;
  contract_status: string | null;
  features: string[] | null;
  same_street_sales: any[] | null;
  past_records: any[] | null;
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
  ourAgentStats: Agent[];
  topAgencies: Agency[];
  ourAgencyStats: Agency[];
}

// Helper function to normalize suburb names to uppercase
export const normalizeSuburb = (suburb: string | undefined | null): string => {
  if (!suburb) return 'UNKNOWN';
  const trimmed = suburb.trim().toLowerCase();
  const suburbMap: { [key: string]: string } = {
    pullenvale: 'PULLENVALE 4069',
    'pullenvale qld': 'PULLENVALE 4069',
    'pullenvale qld (4069)': 'PULLENVALE 4069',
    brookfield: 'BROOKFIELD 4069',
    'brookfield qld': 'BROOKFIELD 4069',
    'brookfield qld (4069)': 'BROOKFIELD 4069',
    anstead: 'ANSTEAD 4070',
    'anstead qld': 'ANSTEAD 4070',
    'anstead qld (4070)': 'ANSTEAD 4070',
    'chapel hill': 'CHAPEL HILL 4069',
    'chapel hill qld': 'CHAPEL HILL 4069',
    'chapell hill qld (4069)': 'CHAPEL HILL 4069',
    kenmore: 'KENMORE 4069',
    'kenmore qld': 'KENMORE 4069',
    'kenmore qld (4069)': 'KENMORE 4069',
    'kenmore hills': 'KENMORE HILLS 4069',
    'kenmore hills qld': 'KENMORE HILLS 4069',
    'kenmore hills qld (4069)': 'KENMORE HILLS 4069',
    'fig tree pocket': 'FIG TREE POCKET 4069',
    'fig tree pocket qld': 'FIG TREE POCKET 4069',
    'fig tree pocket qld (4069)': 'FIG TREE POCKET 4069',
    'pinjarra hills': 'PINJARRA HILLS 4069',
    'pinjarra hills qld': 'PINJARRA HILLS 4069',
    'pinjarra hills qld (4069)': 'PINJARRA HILLS 4069',
    moggill: 'MOGGILL 4070',
    'moggill qld': 'MOGGILL 4070',
    'moggill qld (4070)': 'MOGGILL 4070',
    bellbowrie: 'BELLBOWRIE 4070',
    'bellbowrie qld': 'BELLBOWRIE 4070',
    'bellbowrie qld (4070)': 'BELLBOWRIE 4070',
  };
  const normalized = suburbMap[trimmed] || trimmed;
  const upperCaseNormalized = normalized.toUpperCase();
  console.log(`Normalizing suburb: ${suburb} -> ${upperCaseNormalized}`);
  return upperCaseNormalized;
};