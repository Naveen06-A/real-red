export const allowedSuburbs = [
  'Pullenvale 4069',
  'Brookfield 4069',
  'Anstead 4070',
  'Chapell Hill 4069',
  'Kenmore 4069',
  'Kenmore Hills 4069',
  'Fig Tree Pocket 4069',
  'Pinjara Hills 4069',
  'Moggill QLD (4070)',
  'Bellbowrie QLD (4070)',
];

export const normalizeSuburb = (suburb: string | undefined | null): string => {
  if (!suburb) return 'Unknown';
  const trimmed = suburb.trim().toLowerCase();
  const suburbMap: { [key: string]: string } = {
    'pullenvale': 'Pullenvale 4069',
    'pullenvale qld': 'Pullenvale 4069',
    'pullenvale qld (4069)': 'Pullenvale 4069',
    'brookfield': 'Brookfield 4069',
    'brookfield qld': 'Brookfield 4069',
    'brookfield qld (4069)': 'Brookfield 4069',
    'anstead': 'Anstead 4070',
    'anstead qld': 'Anstead 4070',
    'anstead qld (4070)': 'Anstead 4070',
    'chapel hill': 'Chapell Hill 4069',
    'chapel hill qld': 'Chapell Hill 4069',
    'chapell hill qld (4069)': 'Chapell Hill 4069',
    'kenmore': 'Kenmore 4069',
    'kenmore qld': 'Kenmore 4069',
    'kenmore qld (4069)': 'Kenmore 4069',
    'kenmore hills': 'Kenmore Hills 4069',
    'kenmore hills qld': 'Kenmore Hills 4069',
    'kenmore hills qld (4069)': 'Kenmore Hills 4069',
    'fig tree pocket': 'Fig Tree Pocket 4069',
    'fig tree pocket qld': 'Fig Tree Pocket 4069',
    'fig tree pocket qld (4069)': 'Fig Tree Pocket 4069',
    'pinjarra hills': 'Pinjara Hills 4069',
    'pinjarra hills qld': 'Pinjara Hills 4069',
    'pinjarra hills qld (4069)': 'Pinjara Hills 4069',
    'moggill': 'Moggill QLD (4070)',
    'moggill qld': 'Moggill QLD (4070)',
    'moggill qld (4070)': 'Moggill QLD (4070)',
    'bellbowrie': 'Bellbowrie QLD (4070)',
    'bellbowrie qld': 'Bellbowrie QLD (4070)',
    'bellbowrie qld (4070)': 'Bellbowrie QLD (4070)',
  };
  const normalized = suburbMap[trimmed] || trimmed;
  console.log(`Normalizing suburb: ${suburb} -> ${normalized}`);
  return normalized;
};