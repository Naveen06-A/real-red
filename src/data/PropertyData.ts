export interface Property {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  pincode: string;
  survey_number: string;
  phone: string;
  email: string;
  property_type: string;
  price: number;
  created_at: string;
  user_id: string;
  agent_id?: string; // Add optional agent_id
}

export interface StaticProperty extends Property {
  agent_id?: string; // Explicitly include to ensure consistency
}

export const staticProperties: StaticProperty[] = [
  {
    id: 'static-1',
    name: 'Luxury Villa',
    address: '123 Ocean Drive',
    city: 'Sydney',
    country: 'Australia',
    pincode: '200001',
    survey_number: 'SYD-1234',
    phone: '+61 2 1234 5678',
    email: 'info@luxuryvilla.com',
    property_type: 'villa',
    price: 2500000,
    created_at: '2024-01-15T10:30:00Z',
    user_id: 'static-user-1',
    agent_id: 'agent-001', // Example agent_id
  },
  {
    id: 'static-2',
    name: 'Beachfront Apartment',
    address: '45 Bondi Beach Road',
    city: 'Sydney',
    country: 'Australia',
    pincode: '200002',
    survey_number: 'SYD-5678',
    phone: '+61 2 2345 6789',
    email: 'sales@beachfrontapt.com',
    property_type: 'apartment',
    price: 1800000,
    created_at: '2024-01-20T14:45:00Z',
    user_id: 'static-user-2',
    agent_id: 'agent-002',
  },
  {
    id: 'static-3',
    name: 'City Center Penthouse',
    address: '789 CBD Avenue',
    city: 'Melbourne',
    country: 'Australia',
    pincode: '300001',
    survey_number: 'MEL-9012',
    phone: '+61 3 3456 7890',
    email: 'info@citycenterpenthouse.com',
    property_type: 'penthouse',
    price: 3200000,
    created_at: '2024-01-25T09:15:00Z',
    user_id: 'static-user-3',
    agent_id: 'agent-003',
  },
  {
    id: 'static-4',
    name: 'Suburban Family Home',
    address: '56 Quiet Street',
    city: 'Brisbane',
    country: 'Australia',
    pincode: '400001',
    survey_number: 'BRI-3456',
    phone: '+61 7 4567 8901',
    email: 'info@suburbanfamilyhome.com',
    property_type: 'house',
    price: 950000,
    created_at: '2024-02-01T11:00:00Z',
    user_id: 'static-user-4',
    agent_id: 'agent-004',
  },
  {
    id: 'static-5',
    name: 'Waterfront Estate',
    address: '12 Harbor View',
    city: 'Perth',
    country: 'Australia',
    pincode: '600001',
    survey_number: 'PER-7890',
    phone: '+61 8 5678 9012',
    email: 'sales@waterfrontestate.com',
    property_type: 'estate',
    price: 4500000,
    created_at: '2024-02-05T16:30:00Z',
    user_id: 'static-user-5',
    agent_id: 'agent-005',
  },
  {
    id: 'static-6',
    name: 'Mountain Retreat',
    address: '78 Alpine Road',
    city: 'Hobart',
    country: 'Australia',
    pincode: '700001',
    survey_number: 'HOB-1234',
    phone: '+61 3 6789 0123',
    email: 'info@mountainretreat.com',
    property_type: 'cabin',
    price: 1200000,
    created_at: '2024-02-10T13:45:00Z',
    user_id: 'static-user-6',
    agent_id: 'agent-006',
  },
  {
    id: 'static-7',
    name: 'Luxury Apartment',
    address: '123 Park Avenue',
    city: 'Mumbai',
    country: 'India',
    pincode: '400001',
    survey_number: 'MUM-1234',
    phone: '+91 22 1234 5678',
    email: 'info@luxuryapartment.com',
    property_type: 'apartment',
    price: 15000000,
    created_at: '2024-01-15T10:30:00Z',
    user_id: 'static-user-7',
    agent_id: 'agent-007',
  },
  {
    id: 'static-8',
    name: 'Sea View Villa',
    address: '45 Marine Drive',
    city: 'Mumbai',
    country: 'India',
    pincode: '400002',
    survey_number: 'MUM-5678',
    phone: '+91 22 2345 6789',
    email: 'sales@seaviewvilla.com',
    property_type: 'villa',
    price: 25000000,
    created_at: '2024-01-20T14:45:00Z',
    user_id: 'static-user-8',
    agent_id: 'agent-008',
  },
  {
    id: 'static-9',
    name: 'City Center Flat',
    address: '789 Connaught Place',
    city: 'Delhi',
    country: 'India',
    pincode: '110001',
    survey_number: 'DEL-9012',
    phone: '+91 11 3456 7890',
    email: 'info@citycenterflat.com',
    property_type: 'flat',
    price: 12000000,
    created_at: '2024-01-25T09:15:00Z',
    user_id: 'static-user-9',
    agent_id: 'agent-009',
  },
  {
    id: 'static-10',
    name: 'Garden House',
    address: '56 Green Park',
    city: 'Bangalore',
    country: 'India',
    pincode: '560001',
    survey_number: 'BLR-3456',
    phone: '+91 80 4567 8901',
    email: 'info@gardenhouse.com',
    property_type: 'house',
    price: 18000000,
    created_at: '2024-02-01T11:00:00Z',
    user_id: 'static-user-10',
    agent_id: 'agent-010',
  },
];

export function combineProperties(supabaseProperties: Property[], staticProps: StaticProperty[]): (Property | StaticProperty)[] {
  return [...supabaseProperties, ...staticProps];
}

export function sortProperties(
  properties: (Property | StaticProperty)[],
  key: keyof Property,
  direction: 'asc' | 'desc'
): (Property | StaticProperty)[] {
  return [...properties].sort((a, b) => {
    const aValue = key === 'agent_id' ? (a.agent_id || '') : a[key];
    const bValue = key === 'agent_id' ? (b.agent_id || '') : b[key];
    if (aValue < bValue) return direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}