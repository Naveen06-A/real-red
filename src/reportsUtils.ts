import moment from 'moment';
import { ChartData } from 'chart.js';
import { PropertyDetails, PropertyMetrics } from '../pages/Reports';

// Debug flag
const DEBUG = true;

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);

export const formatArray = (arr?: string[]) => (arr && arr.length > 0 ? arr.join(', ') : 'N/A');

export const formatDate = (date?: string) => (date ? moment(date).format('DD/MM/YYYY') : 'N/A');

// Calculate commission earned based on sold price and commission rate
export const calculateCommission = (property: PropertyDetails): { commissionEarned: number } => {
  const commissionRate = property.commission || 0; // Commission percentage (e.g., 2.5 for 2.5%)
  const soldPrice = property.sold_price || 0; // Use sold_price, fallback to 0
  const commissionEarned = soldPrice * (commissionRate / 100);
  return { commissionEarned };
};

export const normalizeSuburb = (suburb: string): string => {
  if (!suburb) return 'UNKNOWN';
  return suburb.trim().toUpperCase();
};

export const predictFutureAvgPriceBySuburb = (suburb: string, data: PropertyDetails[]) => {
  if (DEBUG) console.log('predictFutureAvgPriceBySuburb: Predicting for suburb:', suburb);
  const relevantData = data.filter((p) => normalizeSuburb(p.suburb) === normalizeSuburb(suburb) && (p.sold_price || p.price));
  if (relevantData.length < 2) return { predicted: relevantData[0]?.price || 0, lower: 0, upper: 0 };

  const prices = relevantData.map((p) => p.sold_price || p.price || 0);
  const n = prices.length;
  let xSum = 0, ySum = 0, xySum = 0, xSquaredSum = 0;
  prices.forEach((price, i) => {
    xSum += i;
    ySum += price;
    xySum += i * price;
    xSquaredSum += i * i;
  });
  const slope = (n * xySum - xSum * ySum) / (n * xSquaredSum - xSum * xSum);
  const intercept = (ySum - slope * xSum) / n;
  const predicted = slope * (n + 1) + intercept;

  const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
  const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  const confidenceInterval = stdDev;

  return {
    predicted: predicted,
    lower: predicted - confidenceInterval,
    upper: predicted + confidenceInterval,
  };
};

export const generatePropertyMetrics = (
  data: PropertyDetails[],
  predictPrice: (suburb: string, data: PropertyDetails[]) => { predicted: number; lower: number; upper: number }
): PropertyMetrics => {
  if (DEBUG) console.log('generatePropertyMetrics: Starting with properties:', data?.length || 0);
  try {
    // Validate input
    if (!data || !Array.isArray(data) || data.length === 0) {
      if (DEBUG) console.warn('generatePropertyMetrics: No valid properties provided');
      return {
        listingsBySuburb: {},
        listingsByStreetName: {},
        listingsByStreetNumber: {},
        listingsByAgent: {},
        listingsByAgency: {},
        avgSalePriceBySuburb: {},
        avgSalePriceByStreetName: {},
        avgSalePriceByStreetNumber: {},
        avgSalePriceByAgent: {},
        avgSalePriceByAgency: {},
        predictedAvgPriceBySuburb: {},
        predictedConfidenceBySuburb: {},
        priceTrendsBySuburb: {},
        commissionByAgency: {},
        propertyDetails: [],
        totalListings: 0,
        totalSales: 0,
        overallAvgSalePrice: 0,
      };
    }

    const validProperties = data.filter((prop) => {
      const isValid = prop.id && prop.suburb && prop.street_name && prop.street_number && prop.postcode && prop.category;
      if (!isValid && DEBUG) console.warn('generatePropertyMetrics: Skipping invalid property:', prop);
      return isValid;
    });
    if (DEBUG) console.log('generatePropertyMetrics: Valid properties:', validProperties.length);

    if (validProperties.length === 0) {
      if (DEBUG) console.warn('generatePropertyMetrics: No valid properties after filtering');
      return {
        listingsBySuburb: {},
        listingsByStreetName: {},
        listingsByStreetNumber: {},
        listingsByAgent: {},
        listingsByAgency: {},
        avgSalePriceBySuburb: {},
        avgSalePriceByStreetName: {},
        avgSalePriceByStreetNumber: {},
        avgSalePriceByAgent: {},
        avgSalePriceByAgency: {},
        predictedAvgPriceBySuburb: {},
        predictedConfidenceBySuburb: {},
        priceTrendsBySuburb: {},
        commissionByAgency: {},
        propertyDetails: [],
        totalListings: 0,
        totalSales: 0,
        overallAvgSalePrice: 0,
      };
    }

    const listingsBySuburb: Record<string, { listed: number; sold: number }> = {};
    const listingsByAgency: Record<string, { listed: number; sold: number }> = {};
    const avgSalePriceBySuburb: Record<string, number> = {};
    const predictedAvgPriceBySuburb: Record<string, number> = {};
    const predictedConfidenceBySuburb: Record<string, { lower: number; upper: number }> = {};
    const commissionByAgency: Record<string, Record<string, number>> = {};
    const propertyDetails: PropertyDetails[] = [];
    let totalListings = 0;
    let totalSales = 0;
    let totalPriceSum = 0;

    validProperties.forEach((prop) => {
      const suburb = normalizeSuburb(prop.suburb);
      const agency = prop.agency_name || 'Unknown';
      const propertyType = prop.property_type || 'Unknown';

      listingsBySuburb[suburb] = listingsBySuburb[suburb] || { listed: 0, sold: 0 };
      listingsBySuburb[suburb].listed += 1;
      totalListings += 1;
      if (prop.category === 'Sold') {
        listingsBySuburb[suburb].sold += 1;
        totalSales += 1;
      }

      listingsByAgency[agency] = listingsByAgency[agency] || { listed: 0, sold: 0 };
      listingsByAgency[agency].listed += 1;
      if (prop.category === 'Sold') {
        listingsByAgency[agency].sold += 1;
      }

      const price = prop.sold_price || prop.price;
      if (price) {
        avgSalePriceBySuburb[suburb] =
          ((avgSalePriceBySuburb[suburb] || 0) * (listingsBySuburb[suburb].sold || listingsBySuburb[suburb].listed - 1) + price) /
          (listingsBySuburb[suburb].sold || listingsBySuburb[suburb].listed);
        totalPriceSum += price;
      }

      const { commissionRate, commissionEarned } = calculateCommission(prop);
      if (agency !== 'Unknown' && commissionEarned > 0) {
        commissionByAgency[agency] = commissionByAgency[agency] || {};
        commissionByAgency[agency][propertyType] =
          (commissionByAgency[agency][propertyType] || 0) + commissionEarned;
      }

      propertyDetails.push({ ...prop, commission: commissionRate, commission_earned: commissionEarned });
    });

    Object.keys(listingsBySuburb).forEach((suburb) => {
      const { predicted, lower, upper } = predictPrice(suburb, validProperties);
      predictedAvgPriceBySuburb[suburb] = predicted;
      predictedConfidenceBySuburb[suburb] = { lower, upper };
    });

    const overallAvgSalePrice = totalSales > 0 ? totalPriceSum / totalSales : 0;

    const result: PropertyMetrics = {
      listingsBySuburb,
      listingsByStreetName: {},
      listingsByStreetNumber: {},
      listingsByAgent: {},
      listingsByAgency,
      avgSalePriceBySuburb,
      avgSalePriceByStreetName: {},
      avgSalePriceByStreetNumber: {},
      avgSalePriceByAgent: {},
      avgSalePriceByAgency: {},
      predictedAvgPriceBySuburb,
      predictedConfidenceBySuburb,
      priceTrendsBySuburb: {},
      commissionByAgency,
      propertyDetails,
      totalListings,
      totalSales,
      overallAvgSalePrice,
    };

    if (DEBUG) console.log('generatePropertyMetrics: Result:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    if (DEBUG) console.error('generatePropertyMetrics: Error:', error);
    throw error;
  }
};

export const generateHeatmapData = (propertyMetrics: PropertyMetrics | null): ChartData<'bar'> | null => {
  if (!propertyMetrics) {
    if (DEBUG) console.warn('generateHeatmapData: No propertyMetrics provided');
    return null;
  }
  const suburbs = Object.keys(propertyMetrics.listingsBySuburb);
  const maxSales = Math.max(...Object.values(propertyMetrics.listingsBySuburb).map(d => d.sold));
  const minSales = Math.min(...Object.values(propertyMetrics.listingsBySuburb).map(d => d.sold));

  const getColor = (value: number) => {
    const ratio = (value - minSales) / (maxSales - minSales || 1);
    const r = Math.round(54 + (255 - 54) * ratio);
    const b = Math.round(184 - (184 - 132) * ratio);
    return `rgb(${r}, 99, ${b})`;
  };

  return {
    labels: suburbs,
    datasets: [
      {
        label: 'Sales Volume',
        data: suburbs.map((suburb) => propertyMetrics.listingsBySuburb[suburb].sold),
        backgroundColor: suburbs.map((suburb) => getColor(propertyMetrics.listingsBySuburb[suburb].sold)),
      },
    ],
  };
};

export const generatePriceTrendsData = (propertyMetrics: PropertyMetrics | null): ChartData<'bar'> | null => {
  if (!propertyMetrics) {
    if (DEBUG) console.warn('generatePriceTrendsData: No propertyMetrics provided');
    return null;
  }
  return {
    labels: [],
    datasets: [],
  };
};

export const selectStyles = {
  control: (provided: any) => ({
    ...provided,
    borderRadius: '8px',
    borderColor: '#E5E7EB',
    boxShadow: 'none',
    '&:hover': { borderColor: '#6366F1' },
    padding: '2px',
    backgroundColor: '#F9FAFB',
  }),
  multiValue: (provided: any) => ({
    ...provided,
    backgroundColor: '#E0E7FF',
    borderRadius: '6px',
  }),
  multiValueLabel: (provided: any) => ({
    ...provided,
    color: '#4B5563',
    fontWeight: '500',
  }),
  multiValueRemove: (provided: any) => ({
    ...provided,
    color: '#6B7280',
    '&:hover': { backgroundColor: '#C7D2FE', color: '#4338CA' },
  }),
  placeholder: (provided: any) => ({
    ...provided,
    color: '#9CA3AF',
  }),
  menu: (provided: any) => ({
    ...provided,
    borderRadius: '8px',
    marginTop: '2px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  }),
  option: (provided: any, state: any) => ({
    ...provided,
    backgroundColor: state.isSelected ? '#E0E7FF' : state.isFocused ? '#F9FAFB' : 'white',
    color: '#1F2937',
    '&:hover': { backgroundColor: '#F3F4F6' },
  }),
};