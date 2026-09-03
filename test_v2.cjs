const { execSync } = require('child_process');

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function getBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

const apiKey = process.env.GEOAPIFY_API_KEY;
const start = "73.6766,18.7302"; // Talegaon Dabhade
const end = "73.8567,18.5204";   // Pune

async function audit() {
    console.log("FETCHING OSRM ROUTES...");
    const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson&alternatives=true`;
    const osrmData = JSON.parse(execSync(`curl -s "${osrmUrl}"`).toString());

    for (let i = 0; i < osrmData.routes.length; i++) {
        const route = osrmData.routes[i];
        const coordinates = route.geometry.coordinates;
        const distanceKm = route.distance / 1000;

        const samplingCount = coordinates.length < 50 ? 5 : coordinates.length < 200 ? 10 : 15;
        const step = Math.max(1, Math.floor(coordinates.length / samplingCount));
        const sampledPoints = [];
        for (let k = 0; k < coordinates.length; k += step) sampledPoints.push(coordinates[k]);
        if (sampledPoints[sampledPoints.length - 1] !== coordinates[coordinates.length - 1]) sampledPoints.push(coordinates[coordinates.length - 1]);

        const allPlaces = new Map();
        for (const [lng, lat] of sampledPoints) {
            const url = `https://api.geoapify.com/v2/places?categories=healthcare,service,public_transport,education,leisure,commercial,catering&filter=circle:${lng},${lat},500&limit=50&apiKey=${apiKey}`;
            try {
                const res = JSON.parse(execSync(`curl -s "${url}"`).toString());
                if (res.features) res.features.forEach(f => allPlaces.set(f.properties.place_id, f.properties));
            } catch (e) {}
        }

        const counts = { police: 0, hospitals: 0, transit: 0, schools: 0, shops: 0 };
        const transitPlaces = [];

        allPlaces.forEach(p => {
            const cats = p.categories || [];
            if (cats.some(c => c.includes('police'))) counts.police++;
            if (cats.some(c => c.includes('hospital') || c.includes('clinic'))) counts.hospitals++;
            if (cats.some(c => c.includes('school') || c.includes('university') || c.includes('college'))) counts.schools++;
            if (cats.some(c => c.includes('shop') || c.includes('supermarket') || c.includes('mall') || c.includes('catering.') || c.includes('commercial.food'))) counts.shops++;
            if (cats.some(c => c.includes('public_transport') || c.includes('transport') || c.includes('bus') || c.includes('train') || c.includes('railway'))) transitPlaces.push(p);
        });

        // Transit Deduplication
        const transitGroups = [];
        for (const p of transitPlaces) {
            let matchedGroup = null;
            const pName = (p.name || "").toLowerCase();
            const isGenericP = !p.name || pName === "unnamed" || pName.includes("platform") || pName.includes("entrance") || pName.includes("exit") || pName.includes("access");
            for (const group of transitGroups) {
                const rep = group[0];
                const dist = getDistance(p.lat, p.lon, rep.lat, rep.lon);
                if (dist < 100) { matchedGroup = group; break; }
            }
            if (matchedGroup) matchedGroup.push(p); else transitGroups.push([p]);
        }
        counts.transit = transitGroups.length;

        // RECALIBRATED V2 CALCULATION
        const hour = new Date().getHours();
        const isNight = hour < 6 || hour >= 20;

        // 1. Road Environment
        let turns = 0;
        for (let j = 1; j < coordinates.length - 1; j++) {
            const b1 = getBearing(coordinates[j-1][1], coordinates[j-1][0], coordinates[j][1], coordinates[j][0]);
            const b2 = getBearing(coordinates[j][1], coordinates[j][0], coordinates[j+1][1], coordinates[j+1][0]);
            let diff = Math.abs(b1 - b2);
            if (diff > 180) diff = 360 - diff;
            if (diff > 30) turns++;
        }
        const turnDensity = turns / distanceKm;
        const roadScore = Math.max(0, Math.min(30, 35 * (0.9 - (turnDensity / 15))));

        // 2. Human Activity
        const activityCount = (counts.shops || 0) + (counts.transit || 0) + (counts.schools || 0);
        const activityDensity = activityCount / distanceKm;
        let activityScore = 40 * (1 - Math.exp(-activityDensity / 8));
        if (isNight && activityDensity < 1) activityScore *= 0.7;

        // 3. Emergency Support
        const emergencyCount = (counts.police || 0) + (counts.hospitals || 0);
        const emergencyDensity = emergencyCount / distanceKm;
        const emergencyScore = 25 * (1 - Math.exp(-emergencyDensity / 2));

        const finalScore = Math.round(roadScore + activityScore + emergencyScore);

        console.log(`\nROUTE ${i + 1} AUDIT (Talegaon -> Pune)`);
        console.log(`Summary: ${route.legs[0].summary || "Main Route"}`);
        console.log(`OSRM Distance: ${distanceKm.toFixed(2)} km`);
        console.log(`OSRM Duration: ${(route.duration / 60).toFixed(1)} mins`);
        console.log(`Turn Density: ${turnDensity.toFixed(2)} /km`);
        console.log(`Activity Density: ${activityDensity.toFixed(2)} /km`);
        console.log(`Emergency Density: ${emergencyDensity.toFixed(2)} /km`);
        console.log(`- Road Env Score: ${roadScore.toFixed(1)} /35`);
        console.log(`- Human Activity Score: ${activityScore.toFixed(1)} /40`);
        console.log(`- Emergency Support Score: ${emergencyScore.toFixed(1)} /25`);
        console.log(`FINAL SAFETY SCORE: ${finalScore} /100`);
        console.log(`Confidence: 0.65`);
        console.log(`Day/Night: ${isNight ? "Night" : "Day"}`);
    }
}
audit();
