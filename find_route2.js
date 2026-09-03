
import fs from 'fs';
import { execSync } from 'child_process';

const apiKey = process.env.GEOAPIFY_API_KEY;
const start = "73.6766,18.7302";
const endCandidates = ["73.7973,18.6713"];

async function run() {
    for (const end of endCandidates) {
        console.log(`\nTesting end: ${end}`);
        const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson&alternatives=3`;
        const rawRes = execSync(`curl -s "${osrmUrl}"`).toString();
        const data = JSON.parse(rawRes);
        console.log(`Raw JSON routes length: ${data.routes.length}`);
        console.log(`Found ${data.routes.length} routes.`);
        for (let i = 0; i < data.routes.length; i++) {
            const route = data.routes[i];
            const coords = route.geometry.coordinates;
            const samplingCount = coords.length < 50 ? 5 : coords.length < 200 ? 10 : 15;
            const step = Math.max(1, Math.floor(coords.length / samplingCount));
            const sampled = [];
            for (let k = 0; k < coords.length; k += step) sampled.push(coords[k]);
            if (sampled[sampled.length-1] !== coords[coords.length-1]) sampled.push(coords[coords.length-1]);

            const all = new Map();
            for (const [lng, lat] of sampled) {
                const url = `https://api.geoapify.com/v2/places?categories=healthcare,service,public_transport,education,leisure,commercial,catering&filter=circle:${lng},${lat},500&limit=50&apiKey=${apiKey}`;
                try {
                    const res = JSON.parse(execSync(`curl -s "${url}"`).toString());
                    if (res.features) res.features.forEach(f => {
                        const cats = f.properties.categories || [];
                        if (cats.some(c => c.includes('public_transport') || c.includes('transport') || c.includes('bus') || c.includes('train') || c.includes('railway'))) {
                            all.set(f.properties.place_id, f.properties);
                        }
                    });
                } catch (e) {}
            }
            console.log(`Route ${i+1} Transit: ${all.size}`);
            if (all.size === 5) {
                console.log(`FOUND ROUTE 2 WITH 5! Listing details...`);
                Array.from(all.values()).forEach((p, idx) => {
                    console.log(`[R2_RECORD ${idx+1}] ${p.name} (${p.place_id}) at ${p.lat}, ${p.lon}`);
                    console.log(`Categories: ${p.categories.join(', ')}`);
                });
            }
        }
    }
}
run();
