
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

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

async function runAudit() {
    if (!apiKey) {
        console.error("GEOAPIFY_API_KEY is missing");
        return;
    }

    console.log("Fetching OSRM routes...");
    const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson&alternatives=true`;
    const osrmResponse = execSync(`curl -s "${osrmUrl}"`).toString();
    const osrmData = JSON.parse(osrmResponse);

    const categories = 'healthcare,service,public_transport,education,leisure,commercial,catering';

    for (let i = 0; i < osrmData.routes.length; i++) {
        const route = osrmData.routes[i];
        const coordinates = route.geometry.coordinates;
        
        // Sampling logic
        const samplingCount = coordinates.length < 50 ? 5 : coordinates.length < 200 ? 10 : 15;
        const step = Math.max(1, Math.floor(coordinates.length / samplingCount));
        const sampledPoints = [];
        for (let k = 0; k < coordinates.length; k += step) {
            sampledPoints.push(coordinates[k]);
        }
        sampledPoints.push(coordinates[coordinates.length - 1]);

        console.log(`\n--- ROUTE ${i + 1} AUDIT ---`);
        console.log(`Distance: ${(route.distance / 1000).toFixed(2)} km`);
        console.log(`Coordinates: ${coordinates.length}`);
        console.log(`Sample Points: ${sampledPoints.length}`);

        const allPlacesMap = new Map(); // place_id -> data
        const rawTransitSignals = []; // all transit features found

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
                            rawTransitSignals.push({
                                ...props,
                                samplePoint: `${lat}, ${lng}`,
                                sampleIndex: sIdx
                            });

                            if (!allPlacesMap.has(props.place_id)) {
                                allPlacesMap.set(props.place_id, {
                                    ...props,
                                    foundAtSamples: [`Sample ${sIdx + 1}`],
                                    transitRule: cats.find(c => 
                                        c.includes('public_transport') || 
                                        c.includes('transport') || 
                                        c.includes('bus') || 
                                        c.includes('train') || 
                                        c.includes('railway')
                                    )
                                });
                            } else {
                                allPlacesMap.get(props.place_id).foundAtSamples.push(`Sample ${sIdx + 1}`);
                            }
                        }
                    });
                }
            } catch (e) {}
        }

        const transitList = Array.from(allPlacesMap.values());
        console.log(`Total Raw Transit Signals: ${rawTransitSignals.length}`);
        console.log(`Total Unique place_ids: ${transitList.length}`);

        transitList.forEach((p, idx) => {
            console.log(`\n[TRANSIT ${idx + 1}]`);
            console.log(`Name: ${p.name || 'Unnamed'}`);
            console.log(`Place ID: ${p.place_id}`);
            console.log(`Coords: ${p.lat}, ${p.lon}`);
            console.log(`Categories: ${p.categories.join(', ')}`);
            console.log(`Rule: "${p.transitRule}"`);
            console.log(`Found at Samples: ${p.foundAtSamples.join(', ')}`);
        });

        // Physical Proximity Check
        console.log(`\n--- PROXIMITY CHECK (ROUTE ${i + 1}) ---`);
        let duplicatesFound = false;
        for (let m = 0; m < transitList.length; m++) {
            for (let n = m + 1; n < transitList.length; n++) {
                const dist = getDistance(transitList[m].lat, transitList[m].lon, transitList[n].lat, transitList[n].lon);
                if (dist < 100) {
                    duplicatesFound = true;
                    console.log(`POSSIBLE PHYSICAL DUPLICATE:`);
                    console.log(`- ${transitList[m].name} (${transitList[m].place_id})`);
                    console.log(`- ${transitList[n].name} (${transitList[n].place_id})`);
                    console.log(`  Distance: ${dist.toFixed(1)} meters`);
                }
            }
        }
        if (!duplicatesFound) console.log("No physical duplicates (within 100m) found.");
    }
}

runAudit();
