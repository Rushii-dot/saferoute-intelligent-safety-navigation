
import fs from 'fs';
import { execSync } from 'child_process';

const apiKey = process.env.GEOAPIFY_API_KEY;
const start = "73.6766,18.7302"; // Talegaon Dabhade
const end = "73.7973,18.6713";   // More Wasti

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

async function runAudit() {
    if (!apiKey) {
        console.error("GEOAPIFY_API_KEY is missing");
        return;
    }

    const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson&alternatives=true`;
    const osrmData = JSON.parse(execSync(`curl -s "${osrmUrl}"`).toString());

    const categories = 'healthcare,service,public_transport,education,leisure,commercial,catering';

    for (let i = 0; i < osrmData.routes.length; i++) {
        const route = osrmData.routes[i];
        const coordinates = route.geometry.coordinates;
        
        // Sampling logic matching server.ts EXACTLY
        const samplingCount = coordinates.length < 50 ? 5 : coordinates.length < 200 ? 10 : 15;
        const step = Math.max(1, Math.floor(coordinates.length / samplingCount));
        const sampledPoints = [];
        for (let k = 0; k < coordinates.length; k += step) {
            sampledPoints.push(coordinates[k]);
        }
        if (sampledPoints[sampledPoints.length - 1] !== coordinates[coordinates.length - 1]) {
            sampledPoints.push(coordinates[coordinates.length - 1]);
        }

        const allPlacesMap = new Map();
        const transitPlaces = [];
        let rawTransitCount = 0;

        for (let sIdx = 0; sIdx < sampledPoints.length; sIdx++) {
            const [lng, lat] = sampledPoints[sIdx];
            const url = `https://api.geoapify.com/v2/places?categories=${categories}&filter=circle:${lng},${lat},500&limit=50&apiKey=${apiKey}`;
            
            try {
                const response = JSON.parse(execSync(`curl -s "${url}"`).toString());
                if (response.features) {
                    response.features.forEach(f => {
                        const props = f.properties;
                        const cats = props.categories || [];
                        const isTransit = cats.some(c => 
                            c.includes('public_transport') || 
                            c.includes('transport') || 
                            c.includes('bus') || 
                            c.includes('train') || 
                            c.includes('railway')
                        );

                        if (isTransit) {
                            rawTransitCount++;
                            if (!allPlacesMap.has(props.place_id)) {
                                const pData = {
                                    name: props.name || 'Unnamed',
                                    id: props.place_id,
                                    lat: props.lat,
                                    lon: props.lon,
                                    cats: cats,
                                    rule: cats.find(c => c.includes('public_transport') || c.includes('transport') || c.includes('bus') || c.includes('train') || c.includes('railway')),
                                    samples: [sIdx + 1]
                                };
                                allPlacesMap.set(props.place_id, pData);
                                transitPlaces.push(pData);
                            } else {
                                allPlacesMap.get(props.place_id).samples.push(sIdx + 1);
                            }
                        }
                    });
                }
            } catch (e) {}
        }

        console.log(`\nROUTE ${i + 1} AUDIT RESULT`);
        console.log(`Total Raw Signals: ${rawTransitCount}`);
        console.log(`Total Unique place_ids: ${transitPlaces.length}`);
        
        transitPlaces.forEach((p, idx) => {
            console.log(`\nRECORD ${idx + 1}:`);
            console.log(`Name: ${p.name}`);
            console.log(`Place ID: ${p.id}`);
            console.log(`Lat: ${p.lat}`);
            console.log(`Lon: ${p.lon}`);
            console.log(`Categories: ${p.cats.join(', ')}`);
            console.log(`Reason: Matches "${p.rule}"`);
            console.log(`Sampling Points: ${p.samples.join(', ')}`);
        });

        console.log(`\nPROXIMITY ANALYSIS (ROUTE ${i + 1})`);
        for (let m = 0; m < transitPlaces.length; m++) {
            for (let n = m + 1; n < transitPlaces.length; n++) {
                const dist = getDistance(transitPlaces[m].lat, transitPlaces[m].lon, transitPlaces[n].lat, transitPlaces[n].lon);
                if (dist < 100) {
                    console.log(`- SUSPECTED PHYSICAL DUPLICATE: "${transitPlaces[m].name}" and "${transitPlaces[n].name}"`);
                    console.log(`  Distance: ${dist.toFixed(1)}m`);
                }
            }
        }
    }
}

runAudit();
