const https = require('https');

const apiKey = process.env.GEOAPIFY_API_KEY;
if (!apiKey) {
    console.error("GEOAPIFY_API_KEY not found");
    process.exit(1);
}

const waypoints = "18.7302,73.6766|18.6713,73.7973";
const url = `https://api.geoapify.com/v1/routing?waypoints=${waypoints}&mode=drive&details=route_details&format=json&apiKey=${apiKey}`;

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.results && json.results.length > 0) {
                const route = json.results[0];
                console.log("ROUTE SUMMARY:");
                console.log("Distance:", route.distance);
                console.log("Time:", route.time);
                
                if (route.legs && route.legs[0].steps) {
                    const step = route.legs[0].steps[0];
                    console.log("\nSAMPLE STEP STRUCTURE:");
                    console.log(JSON.stringify(step, null, 2));
                }

                if (json.results[0].legs[0].steps) {
                    const stepWithDetails = json.results[0].legs[0].steps.find(s => s.road_class);
                    if (stepWithDetails) {
                        console.log("\nSTEP WITH ROAD CLASS:");
                        console.log(JSON.stringify(stepWithDetails, null, 2));
                    }
                }
                
                console.log("\nKEYS IN FIRST STEP:", Object.keys(json.results[0].legs[0].steps[0]));
            } else {
                console.log("No results found or error:", data);
            }
        } catch (e) {
            console.error("Parse error:", e);
            console.log("Raw data start:", data.substring(0, 500));
        }
    });
}).on('error', (e) => {
    console.error("Request error:", e);
});
