
import fs from 'fs';
import { execSync } from 'child_process';

const apiKey = process.env.GEOAPIFY_API_KEY;
const start = "73.6766,18.7302";
const end = "73.7973,18.6713";

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

async function run() {
    const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson&alternatives=3`;
    const osrmData = JSON.parse(execSync(`curl -s "${osrmUrl}"`).toString());

    if (osrmData.routes.length < 2) {
        console.log("Only 1 route found. Trying alternatives again...");
        return;
    }

    const route = osrmData.routes[1]; // ROUTE 2
    const coords = route.geometry.coordinates;
    const samplingCount = coords.length < 50 ? 5 : coords.length < 200 ? 10 : 15;
    const step = Math.max(1, Math.floor(coords.length / samplingCount));
    const sampled = [];
    for (let k = 0; k < coords.length; k += step) sampled.push(coords[k]);
    if (sampled[sampled.length-1] !== coords[coords.length-1]) sampled.push(coords[coords.length-1]);

    console.log(`--- ROUTE 2 ---`);
    const allPlaces = new Map();
    const rawSignals = [];

    for (let sIdx = 0; sIdx < sampled.length; sIdx++) {
        const [lng, lat] = sampled[sIdx];
        const url = `https://api.geoapify.com/v2/places?categories=healthcare,service,public_transport,education,leisure,commercial,catering&filter=circle:${lng},${lat},500&limit=50&apiKey=${apiKey}`;
        try {
            const data = JSON.parse(execSync(`curl -s "${url}"`).toString());
            if (data.features) {
                data.features.forEach(f => {
                    const cats = f.properties.categories || [];
                    if (cats.some(c => c.includes('public_transport') || c.includes('transport') || c.includes('bus') || c.includes('train') || c.includes('railway'))) {
                        rawSignals.push(f.properties);
                        if (!allPlaces.has(f.properties.place_id)) {
                            allPlaces.set(f.properties.place_id, {
                                ...f.properties,
                                samples: [sIdx + 1],
                                rule: cats.find(c => c.includes('public_transport') || c.includes('transport') || c.includes('bus') || c.includes('train') || c.includes('railway'))
                            });
                        } else {
                            allPlaces.get(f.properties.place_id).samples.push(sIdx + 1);
                        }
                    }
                });
            }
        } catch (e) {}
    }

    const transitList = Array.from(allPlaces.values());
    console.log(`Total Raw: ${rawSignals.length}`);
    console.log(`Total Unique: ${transitList.length}`);

    transitList.forEach((p, idx) => {
        console.log(`\n[RECORD ${idx+1}]`);
        console.log(`Name: ${p.name || 'Unnamed'}`);
        console.log(`Place ID: ${p.id || p.place_id}`);
        console.log(`Lat: ${p.lat}`);
        console.log(`Lon: ${p.lon}`);
        console.log(`Categories: ${p.categories.join(', ')}`);
        console.log(`Reason: "${p.rule}"`);
        console.log(`Samples: ${p.samples.join(', ')}`);
    });

    console.log(`\nPROXIMITY CHECK (ROUTE 2)`);
    for (let m = 0; m < transitList.length; m++) {
        for (let n = m + 1; n < transitList.length; n++) {
            const dist = getDistance(transitList[m].lat, transitList[m].lon, transitList[n].lat, transitList[n].lon);
            if (dist < 150) {
                console.log(`- DUPLICATE? "${transitList[m].name}" and "${transitList[n].name}" dist: ${dist.toFixed(1)}m`);
            }
        }
    }
}
run();
