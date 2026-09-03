export interface Location {
  lat: number;
  lng: number;
  name: string;
}

export interface Evidence {
  roadEnvironment: {
    turnCount: number;
    turnsPerKm: number;
    routeComplexity: string;
  };
  humanActivity: {
    shops: any[];
    transit: any[];
    schools: any[];
  };
  emergencySupport: {
    police: any[];
    healthcare: any[];
  };
}

export interface SafetyData {
  status: 'loading' | 'success' | 'error';
  error?: string;
  evidence?: Evidence;
  debug?: {
    endpoint: string;
    status: number;
    elementCount: number;
    queryTime?: number;
    samplePoints?: number;
    successfulQueries?: number;
    contentType?: string;
  };
  lighting: number;
  shops: number;
  residential: number;
  hospitals: number;
  police: number;
  fireStations: number;
  schools: number;
  transit: number;
  pedestrian: number;
  parks: number;
  pharmacies?: number;
  fuelStations?: number;
  safetyScore?: number;
  safetyRating?: string;
  roadEnvironmentScore?: number;
  humanActivityScore?: number;
  emergencySupportScore?: number;
  confidence?: number;
  timeContext?: 'day' | 'night';
  roadTypes: Record<string, number>;
}

export interface Instruction {
  maneuver: {
    instruction?: string;
    type: string;
    modifier?: string;
  };
  name: string;
  distance: number;
  duration: number;
}

export interface RouteOption {
  id: string;
  distance: string;
  duration: string;
  polyline: string;
  summary: string;
  label: string;
  isRecommended: boolean;
  safetyData?: SafetyData;
  coordinates?: [number, number][];
  rawDistance?: number;
  steps?: Instruction[];
}

export interface RouteState {
  start: Location | null;
  destination: Location | null;
  current: Location | null;
  routes: RouteOption[];
  selectedRouteIndex: number;
}
