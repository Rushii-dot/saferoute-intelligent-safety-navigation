
import fs from 'fs';
import { execSync } from 'child_process';

const apiKey = process.env.GEOAPIFY_API_KEY;
const start = "73.6766,18.7302"; // Talegaon
const endpoints = [
    { name: "More Wasti 1", coords: "73.7973,18.6713" },
    { name: "Sambhaji Nagar", coords: "73.8000,18.6638" },
    { name: "Akurdi/Nigdi", coords: "73.7654,18.6659" }
];

async function run() {
    for (const ep of endpoints) {
        console.log(`\nTesting destination: ${ep.name} (${ep.coords})`);
        const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${start};${ep.coords}?overview=full&geometries=geojson&alternatives=true`;
        const osrmData = JSON.parse(execSync(`curl -s "${osrmUrl}"`).toString());
        
        for (let i = 0; i < osrmData.routes.length; i++) {
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
                    const data = JSON.parse(execSync(`curl -s "${url}"`).toString());
                    if (data.features) {
                        data.features.forEach(f => {
                            if (f.properties.place_id) allPlaces.set(f.properties.place_id, f.properties);
                        });
                    }
                } catch (e) {}
            }

            let transit = 0;
            allPlaces.forEach(p => {
                const cats = p.categories || [];
                if (cats.some(c => c.includes('public_transport') || c.includes('transport') || c.includes('bus') || c.includes('train') || c.includes('railway'))) transit++;
            });

            console.log(`Route ${i + 1}: Transit Count = ${transit}`);
        }
    }
}

run();
