
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

const apiKey = process.env.GEOAPIFY_API_KEY;
const start = "73.68,18.73";
const end = "73.78,18.66";

async function run() {
    console.log("Starting Comprehensive Transit Deduplication Audit...");
    const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson&alternatives=3`;
    console.log(`Querying OSRM: ${osrmUrl}`);
    const osrmData = JSON.parse(execSync(`curl -s "${osrmUrl}"`).toString());
    console.log(`Found ${osrmData.routes.length} routes.`);

    for (let i = 0; i < osrmData.routes.length; i++) {
        console.log(`\n--- Auditing Route ${i + 1} ---`);
        const route = osrmData.routes[i];
        const coordinates = route.geometry.coordinates;
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
                if (res.features) {
                    res.features.forEach(f => {
                        const cats = f.properties.categories || [];
                        if (cats.some(c => c.includes('public_transport') || c.includes('transport') || c.includes('bus') || c.includes('train') || c.includes('railway'))) {
                            allPlaces.set(f.properties.place_id, f.properties);
                        }
                    });
                }
            } catch (e) {}
        }

        const transitPlaces = Array.from(allPlaces.values());
        const oldTransitCount = transitPlaces.length;

        // Grouping logic from server.ts
        const transitGroups = [];
        for (const p of transitPlaces) {
            let matchedGroup = null;
            const pName = (p.name || "").toLowerCase();
            const isGenericP = !p.name || pName === "unnamed" || pName.includes("platform") || pName.includes("entrance") || pName.includes("exit") || pName.includes("access");

            for (const group of transitGroups) {
                const rep = group[0];
                const repName = (rep.name || "").toLowerCase();
                const isGenericRep = !rep.name || repName === "unnamed" || repName.includes("platform") || repName.includes("entrance") || repName.includes("exit") || repName.includes("access");
                const dist = getDistance(p.lat, p.lon, rep.lat, rep.lon);
                
                if (dist < 100) {
                    if (pName !== "" && pName !== "unnamed" && pName === repName) { matchedGroup = group; break; }
                    if (isGenericP || isGenericRep) { matchedGroup = group; break; }
                    if (pName.length > 3 && repName.length > 3 && (pName.includes(repName) || repName.includes(pName))) { matchedGroup = group; break; }
                }
            }
            if (matchedGroup) matchedGroup.push(p); else transitGroups.push([p]);
        }

        console.log(`\nROUTE ${i + 1} RESULT`);
        console.log(`Old Count (place_id only): ${oldTransitCount}`);
        console.log(`New Count (physical): ${transitGroups.length}`);
        
        transitGroups.forEach((group, idx) => {
            if (group.length > 1) {
                console.log(`\n[GROUP ${idx + 1}] Merged ${group.length} nodes:`);
                group.forEach(p => console.log(` - ${p.name || 'Unnamed'} (${p.place_id})`));
            }
        });
    }
}
run();
