
const fs = require('fs');
const { execSync } = require('child_process');
const apiKey = process.env.GEOAPIFY_API_KEY;

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

const start = "73.67,18.73";
const end = "73.80,18.67";
const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson&alternatives=true`;
const resRaw = execSync(`curl -s "${osrmUrl}"`).toString();
console.log("JSON Start:", resRaw.substring(0, 100));
const osrmData = JSON.parse(resRaw);

console.log(`Auditing ${osrmData.routes.length} routes...`);

for (let i = 0; i < osrmData.routes.length; i++) {
    const route = osrmData.routes[i];
    const coords = route.geometry.coordinates;
    const samplingCount = coords.length < 50 ? 5 : coords.length < 200 ? 10 : 15;
    const step = Math.max(1, Math.floor(coords.length / samplingCount));
    const sampled = [];
    for (let k = 0; k < coords.length; k += step) sampled.push(coords[k]);
    if (sampled[sampled.length-1] !== coords[coords.length-1]) sampled.push(coords[coords.length-1]);

    const all = new Map();
    const raw = [];
    for (let sIdx = 0; sIdx < sampled.length; sIdx++) {
        const [lng, lat] = sampled[sIdx];
        const url = `https://api.geoapify.com/v2/places?categories=healthcare,service,public_transport,education,leisure,commercial,catering&filter=circle:${lng},${lat},500&limit=50&apiKey=${apiKey}`;
        const res = JSON.parse(execSync(`curl -s "${url}"`).toString());
        if (res.features) res.features.forEach(f => {
            const c = f.properties.categories || [];
            if (c.some(x => x.includes('public_transport') || x.includes('transport') || x.includes('bus') || x.includes('train') || x.includes('railway'))) {
                raw.push(f.properties);
                if (!all.has(f.properties.place_id)) {
                    all.set(f.properties.place_id, { ...f.properties, s: sIdx + 1 });
                }
            }
        });
    }

    const list = Array.from(all.values());
    console.log(`\n--- ROUTE ${i+1} ---`);
    console.log(`Total Raw: ${raw.length}`);
    console.log(`Total Unique place_ids: ${list.length}`);
    list.forEach((p, idx) => {
        console.log(`[REC ${idx+1}] ${p.name || 'Unnamed'} | ${p.place_id} | ${p.lat},${p.lon} | ${p.categories.join(', ')} | Sample: ${p.s}`);
    });

    console.log(`PROXIMITY ${i+1}:`);
    for (let m = 0; m < list.length; m++) {
        for (let n = m + 1; n < list.length; n++) {
            const d = getDistance(list[m].lat, list[m].lon, list[n].lat, list[n].lon);
            if (d < 150) console.log(`DUPE? ${list[m].name} / ${list[n].name} dist: ${d.toFixed(1)}m`);
        }
    }
}
