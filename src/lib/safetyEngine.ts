import { SafetyData } from '../types';

/**
 * Samples a geometry to reduce the number of points for infrastructure analysis
 * @param coordinates Array of [lng, lat]
 * @param maxPoints Maximum number of points to sample
 */
function sampleCoordinates(coordinates: [number, number][], maxPoints = 25): [number, number][] {
  if (coordinates.length <= maxPoints) return coordinates;
  const step = Math.ceil(coordinates.length / maxPoints);
  const sampled: [number, number][] = [];
  for (let i = 0; i < coordinates.length; i += step) {
    sampled.push(coordinates[i]);
  }
  // Always include the last point
  if (sampled.length > 0 && sampled[sampled.length - 1] !== coordinates[coordinates.length - 1]) {
    sampled.push(coordinates[coordinates.length - 1]);
  }
  return sampled;
}

/**
 * Calculates the bearing between two points
 */
function getBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export async function fetchSafetyData(coordinates: [number, number][], distance?: number): Promise<SafetyData> {
  try {
    const response = await fetch('/api/infrastructure', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ coordinates, distance })
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      let errorMessage = `Service unavailable (${response.status})`;
      try {
        if (contentType && contentType.includes('application/json')) {
          const errData = await response.json();
          errorMessage = errData.error || errorMessage;
        }
      } catch (e) {}
      throw new Error(errorMessage);
    }
    
    const result = await response.json();
    const counts = result.counts;
    const backendEvidence = result.evidence || {};
    
    // SAFETY SCORE ENGINE V2: 3-Component Calculation
    const distanceKm = (distance || 1000) / 1000;
    const hour = new Date().getHours();
    const isNight = hour < 6 || hour >= 20;
    const timeContext = isNight ? 'night' : 'day';

    // 1. Road Environment (35 pts)
    // Calculate turn density from geometry
    let turns = 0;
    if (coordinates.length > 2) {
      for (let i = 1; i < coordinates.length - 1; i++) {
        const b1 = getBearing(coordinates[i-1][1], coordinates[i-1][0], coordinates[i][1], coordinates[i][0]);
        const b2 = getBearing(coordinates[i][1], coordinates[i][0], coordinates[i+1][1], coordinates[i+1][0]);
        let diff = Math.abs(b1 - b2);
        if (diff > 180) diff = 360 - diff;
        if (diff > 30) turns++;
      }
    }
    const turnDensity = turns / distanceKm;
    // Calibrated: More generous curve allowing up to 35 pts for straight, high-quality routes
    const roadScore = Math.max(0, Math.min(35, 35 * (1.0 - (turnDensity / 25))));

    // 2. Human Activity (40 pts)
    // Uses shops, transit, and schools for human presence
    const activityCount = (counts.shops || 0) + (counts.transit || 0) + (counts.schools || 0);
    const activityDensity = activityCount / distanceKm;
    // Calibrated: Responsive saturation (constant 3.5). Moderate density (4-5/km) now yields ~75% of score.
    let activityScore = 40 * (1 - Math.exp(-activityDensity / 3.5));
    // Night penalty for very low activity
    if (isNight && activityDensity < 0.5) {
      activityScore *= 0.7;
    }

    // 3. Emergency Support (25 pts)
    // Uses police and healthcare
    const emergencyCount = (counts.police || 0) + (counts.hospitals || 0);
    const emergencyDensity = emergencyCount / distanceKm;
    // Calibrated: High sensitivity (constant 0.6). These are critical but naturally sparse. 
    // Even 1 facility per 2km (0.5/km) now contributes meaningfully (~56% of component score).
    const emergencyScore = 25 * (1 - Math.exp(-emergencyDensity / 0.6));

    const finalScore = Math.round(roadScore + activityScore + emergencyScore);

    // Map to extended structure requested
    const stats = {
      status: 'success',
      score: finalScore,
      roadEnvironmentScore: Math.round(roadScore),
      humanActivityScore: Math.round(activityScore),
      emergencySupportScore: Math.round(emergencyScore),
      evidence: {
        roadEnvironment: {
          turnCount: turns,
          turnsPerKm: Number(turnDensity.toFixed(2)),
          routeComplexity: turnDensity > 15 ? 'High' : turnDensity > 5 ? 'Moderate' : 'Low'
        },
        humanActivity: backendEvidence.humanActivity || {},
        emergencySupport: backendEvidence.emergencySupport || {}
      },
      confidence: 0.65, // Moderate: lacks lighting, crash, and road-class data
      timeContext: timeContext,
      debug: {
        endpoint: result.provider,
        status: result.debug.status,
        elementCount: result.totalPlaces,
        queryTime: result.debug.queryTime,
        samplePoints: result.debug.samplePoints,
        successfulQueries: result.debug.successfulQueries
      },
      lighting: 0, 
      shops: counts.shops,
      residential: 0,
      hospitals: counts.hospitals,
      police: counts.police,
      fireStations: 0,
      schools: counts.schools,
      transit: counts.transit,
      pedestrian: 0,
      parks: counts.parks,
      pharmacies: counts.pharmacies,
      fuelStations: counts.fuelStations,
      safetyScore: finalScore,
      safetyRating: finalScore >= 90 ? 'Highly Favorable' : 
                    finalScore >= 75 ? 'Favorable' : 
                    finalScore >= 60 ? 'Moderately Favorable' : 
                    finalScore >= 40 ? 'Less Favorable' : 'Limited Favorability',
      roadTypes: {}
    } as any;

    return stats;
  } catch (error: any) {
    console.error('Safety Engine Error:', error);
    return {
      status: 'error',
      error: error.message,
      lighting: 0,
      shops: 0,
      residential: 0,
      hospitals: 0,
      police: 0,
      fireStations: 0,
      schools: 0,
      transit: 0,
      pedestrian: 0,
      parks: 0,
      roadTypes: {}
    };
  }
}
