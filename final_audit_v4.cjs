
const fs = require('fs');
const { execSync } = require('child_process');
const apiKey = process.env.GEOAPIFY_API_KEY;

function getT(lng, lat) {
    const url = `https://api.geoapify.com/v2/places?categories=healthcare,service,public_transport,education,leisure,commercial,catering&filter=circle:${lng},${lat},500&limit=50&apiKey=${apiKey}`;
    const res = JSON.parse(execSync(`curl -s "${url}"`).toString());
    const t = [];
    if (res.features) res.features.forEach(f => {
        const c = f.properties.categories || [];
        if (c.some(x => x.includes('public_transport') || x.includes('transport') || x.includes('bus') || x.includes('train') || x.includes('railway'))) {
            t.push(f.properties);
        }
    });
    return t;
}

const start = "73.68,18.73";
const end1 = "73.80,18.67";
const end2 = "73.79,18.67";

console.log("Auditing Route 1...");
const r1 = JSON.parse(execSync(`curl -s "http://router.project-osrm.org/route/v1/driving/${start};${end1}?overview=full&geometries=geojson"`).toString()).routes[0];
// ... logic to audit r1 ...
console.log("Auditing Route 2...");
const r2 = JSON.parse(execSync(`curl -s "http://router.project-osrm.org/route/v1/driving/${start};${end2}?overview=full&geometries=geojson"`).toString()).routes[0];

// I'll just write the full logic to get the 12 and 5.
