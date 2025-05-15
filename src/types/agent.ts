export interface Agent {
  id: string;
  email: string;
  name: string;
  agency_name: string;
  phone: string;
  created_at: string;
}

export interface Property {
  id: string;
  agent_id: string;
  bedrooms: number;
  bathrooms: number;
  car_garage: number;
  square_feet: number;
  agent_name: string;
  agency_name: string;
  postcode: string;
  created_at: string;
}

export interface ActivityReport {
  id: string;
  agent_id: string;
  date: string;
  phone_calls: number;
  clients_met: number;
  door_knocks: number;
  connections_made: number;
  created_at: string;
}

export interface DashboardSummary {
  recent_properties: Property[];
  daily_activities: ActivityReport[];
  weekly_activities: ActivityReport[];
  monthly_activities: ActivityReport[];
}