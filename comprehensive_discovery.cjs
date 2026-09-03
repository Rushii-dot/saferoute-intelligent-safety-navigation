
const fs = require('fs');
const { execSync } = require('child_process');
const apiKey = process.env.GEOAPIFY_API_KEY;

function getTransit(coords) {
    const samplingCount = coords.length < 50 ? 5 : coords.length < 200 ? 10 : 15;
    const step = Math.max(1, Math.floor(coords.length / samplingCount));
    const sampled = [];
    for (let k = 0; k < coords.length; k += step) sampled.push(coords[k]);
    if (sampled[sampled.length-1] !== coords[coords.length-1]) sampled.push(coords[coords.length-1]);

    const all = new Map();
    for (const [lng, lat] of sampled) {
        const url = `https://api.geoapify.com/v2/places?categories=healthcare,service,public_transport,education,leisure,commercial,catering&filter=circle:${lng},${lat},500&limit=50&apiKey=${apiKey}`;
        const res = JSON.parse(execSync(`curl -s "${url}"`).toString());
        if (res.features) res.features.forEach(f => {
            const c = f.properties.categories || [];
            if (c.some(x => x.includes('public_transport') || x.includes('transport') || x.includes('bus') || x.includes('train') || x.includes('railway'))) {
                all.set(f.properties.place_id, f.properties);
            }
        });
    }
    return Array.from(all.values());
}

const start = "73.68,18.73";
const ends = ["73.80,18.67", "73.79,18.67", "73.78,18.67", "73.77,18.67", "73.76,18.67"];

ends.forEach(end => {
    const url = `http://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson&alternatives=3`;
    const data = JSON.parse(execSync(`curl -s "${url}"`).toString());
    data.routes.forEach((r, idx) => {
        const t = getTransit(r.geometry.coordinates);
        console.log(`End: ${end} Route ${idx+1} Transit: ${t.length}`);
        if (t.length === 5 || t.length === 12) {
            console.log(`DETAILS FOR ${t.length}:`);
            t.forEach((p, pIdx) => console.log(`${pIdx+1}. ${p.name} (${p.place_id}) at ${p.lat}, ${p.lon} | ${p.categories.join(',')}`));
        }
    });
});
