export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function calculateDaysOnMarket(listedDate: string, saleDate: string | null): number {
  const listed = new Date(listedDate);
  const sold = saleDate ? new Date(saleDate) : new Date();
  const diffTime = Math.abs(sold.getTime() - listed.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}