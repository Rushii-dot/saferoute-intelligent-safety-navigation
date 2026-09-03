
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// Route 1 Sample Data from previous turn
// Length ~11.5km (calculated from coordinates in turn 1)
const distanceKm = 11.5;
const counts = {
  police: 1,
  hospitals: 2,
  transit: 9,
  shops: 15,
  pharmacies: 2,
  schools: 3,
  fuelStations: 1,
  parks: 2
};

const benchmarks = {
  police: 0.5,      
  hospitals: 0.5,   
  transit: 2.0,     
  shops: 5.0,       
  pharmacies: 1.0,  
  schools: 0.5,     
  fuelStations: 0.2, 
  parks: 0.2        
};

const calculateSubScore = (count, benchmark) => {
  const density = count / distanceKm;
  return Math.min(100, (density / benchmark) * 100);
};

const weights = {
  police: 0.25,
  hospitals: 0.15,
  transit: 0.15,
  shops: 0.15,
  pharmacies: 0.10,
  schools: 0.05,
  fuelStations: 0.05,
  parks: 0.05
};

const policeScore = calculateSubScore(counts.police, benchmarks.police);
const hospitalsScore = calculateSubScore(counts.hospitals, benchmarks.hospitals);
const transitScore = calculateSubScore(counts.transit, benchmarks.transit);
const shopsScore = calculateSubScore(counts.shops, benchmarks.shops);
const pharmaciesScore = calculateSubScore(counts.pharmacies, benchmarks.pharmacies);
const schoolsScore = calculateSubScore(counts.schools, benchmarks.schools);
const fuelScore = calculateSubScore(counts.fuelStations, benchmarks.fuelStations);
const parksScore = calculateSubScore(counts.parks, benchmarks.parks);

const safetyScore = Math.round(
  policeScore * weights.police +
  hospitalsScore * weights.hospitals +
  transitScore * weights.transit +
  shopsScore * weights.shops +
  pharmaciesScore * weights.pharmacies +
  schoolsScore * weights.schools +
  fuelScore * weights.fuelStations +
  parksScore * weights.parks
);

console.log(`--- Score Verification ---`);
console.log(`Distance: ${distanceKm} km`);
console.log(`Sub-Scores:`);
console.log(`Police: ${policeScore.toFixed(1)}`);
console.log(`Health: ${hospitalsScore.toFixed(1)}`);
console.log(`Transit: ${transitScore.toFixed(1)}`);
console.log(`Shops: ${shopsScore.toFixed(1)}`);
console.log(`Pharmacies: ${pharmaciesScore.toFixed(1)}`);
console.log(`Schools: ${schoolsScore.toFixed(1)}`);
console.log(`Fuel: ${fuelScore.toFixed(1)}`);
console.log(`Parks: ${parksScore.toFixed(1)}`);
console.log(`TOTAL SCORE: ${safetyScore}`);
