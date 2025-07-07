export const suburbMap: { [key: string]: string } = {
  'moggill': 'MOGGILL QLD 4070',
  'moggill qld': 'MOGGILL QLD 4070',
  'moggill qld (4070)': 'MOGGILL QLD 4070',
  'bellbowrie': 'BELLBOWRIE QLD 4070',
  'bellbowrie qld': 'BELLBOWRIE QLD 4070',
  'bellbowrie qld (4070)': 'BELLBOWRIE QLD 4070',
  'pullenvale': 'PULLENVALE QLD 4069',
  'pullenvale qld': 'PULLENVALE QLD 4069',
  'pullenvale qld (4069)': 'PULLENVALE QLD 4069',
  'brookfield': 'BROOKFIELD QLD 4069',
  'brookfield qld': 'BROOKFIELD QLD 4069',
  'brookfield qld (4069)': 'BROOKFIELD QLD 4069',
  'anstead': 'ANSTEAD QLD 4070',
  'anstead qld': 'ANSTEAD QLD 4070',
  'anstead qld (4070)': 'ANSTEAD QLD 4070',
  'chapel hill': 'CHAPEL HILL QLD 4069',
  'chapel hill qld': 'CHAPEL HILL QLD 4069',
  'chapel hill qld (4069)': 'CHAPEL HILL QLD 4069',
  'chapell hill': 'CHAPEL HILL QLD 4069',
  'chapell hill qld': 'CHAPEL HILL QLD 4069',
  'chapell hill qld (4069)': 'CHAPEL HILL QLD 4069',
  'kenmore': 'KENMORE QLD 4069',
  'kenmore qld': 'KENMORE QLD 4069',
  'kenmore qld (4069)': 'KENMORE QLD 4069',
  'kenmore hills': 'KENMORE HILLS QLD 4069',
  'kenmore hills qld': 'KENMORE HILLS QLD 4069',
  'kenmore hills qld (4069)': 'KENMORE HILLS QLD 4069',
  'fig tree pocket': 'FIG TREE POCKET QLD 4069',
  'fig tree pocket qld': 'FIG TREE POCKET QLD 4069',
  'fig tree pocket qld (4069)': 'FIG TREE POCKET QLD 4069',
  'pinjarra hills': 'PINJARRA HILLS QLD 4069',
  'pinjarra hills qld': 'PINJARRA HILLS QLD 4069',
  'pinjarra hills qld (4069)': 'PINJARRA HILLS QLD 4069',
  'springfield': 'SPRINGFIELD QLD 4300',
  'springfield qld': 'SPRINGFIELD QLD 4300',
  'springfield qld (4300)': 'SPRINGFIELD QLD 4300',
  'spring mountain': 'SPRING MOUNTAIN QLD 4300',
  'spring mountain qld': 'SPRING MOUNTAIN QLD 4300',
  'spring mountain qld (4300)': 'SPRING MOUNTAIN QLD 4300',
};

export const baseCoords: Record<string, { lat: number; lng: number }> = {
  'MOGGILL QLD 4070': { lat: -27.570, lng: 152.874 },
  'BELLBOWRIE QLD 4070': { lat: -27.559, lng: 152.886 },
  'PULLENVALE QLD 4069': { lat: -27.522, lng: 152.885 },
  'BROOKFIELD QLD 4069': { lat: -27.493, lng: 152.897 },
  'ANSTEAD QLD 4070': { lat: -27.538, lng: 152.861 },
  'CHAPEL HILL QLD 4069': { lat: -27.502, lng: 152.971 },
  'KENMORE QLD 4069': { lat: -27.507, lng: 152.939 },
  'KENMORE HILLS QLD 4069': { lat: -27.502, lng: 152.929 },
  'FIG TREE POCKET QLD 4069': { lat: -27.529, lng: 152.961 },
  'PINJARRA HILLS QLD 4069': { lat: -27.537, lng: 152.906 },
  'SPRINGFIELD QLD 4300': { lat: -27.653, lng: 152.918 },
  'SPRING MOUNTAIN QLD 4300': { lat: -27.690, lng: 152.895 },
};

export const normalizeSuburb = (suburb: string | undefined | null): string => {
  if (!suburb) return 'UNKNOWN';
  const trimmed = suburb.trim().toLowerCase();
  const normalized = suburbMap[trimmed] || trimmed.toUpperCase();
  console.log(`Normalizing suburb: ${suburb} -> ${normalized}`);
  return normalized;
};

export const getSuburbCoordinates = (suburb: string, street_name: string, index: number = 0): { latitude: number; longitude: number } => {
  const normalizedSuburb = normalizeSuburb(suburb);
  const base = baseCoords[normalizedSuburb] || { lat: -27.467, lng: 153.028 }; // Default to Brisbane CBD
  if (!baseCoords[normalizedSuburb]) {
    console.warn(`No coordinates found for suburb: ${normalizedSuburb}, defaulting to Brisbane CBD`);
  }
  const offset = index * 0.0005;
  return {
    latitude: base.lat + offset,
    longitude: base.lng + offset,
  };
};

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(value);
};