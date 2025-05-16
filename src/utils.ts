// src/utils.ts
import moment from 'moment';
import { PropertyDetails } from './pages/types/types';

export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);

export const formatArray = (arr?: string[]): string => (arr && arr.length > 0 ? arr.join(', ') : 'N/A');

export const formatDate = (date?: string): string => (date ? moment(date).format('DD/MM/YYYY') : 'N/A');

export const calculateCommission = (property: PropertyDetails): { commissionRate: number; commissionEarned: number } => {
  const commissionRate = property.commission || 0;
  const basePrice = property.sold_price || property.price || 0;
  const commissionEarned = commissionRate > 0 && basePrice > 0 ? basePrice * (commissionRate / 100) : 0;
  return { commissionRate, commissionEarned };
};