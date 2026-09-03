const https = require('https');

const apiKey = process.env.GEOAPIFY_API_KEY;
if (!apiKey) {
    console.error("GEOAPIFY_API_KEY not found");
    process.exit(1);
}

// Mumbai to Pune
const waypoints = "19.0760,72.8777|18.5204,73.8567";
// Testing with alternatives=3 and details=route_details
const url = `https://api.geoapify.com/v1/routing?waypoints=${waypoints}&mode=drive&details=route_details&alternatives=3&format=json&apiKey=${apiKey}`;

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.results && json.results.length > 0) {
                console.log(`TOTAL ROUTES RETURNED: ${json.results.length}\n`);

                json.results.forEach((route, i) => {
                    console.log(`--- ROUTE ${i + 1} ---`);
                    console.log(`Distance: ${route.distance} meters`);
                    console.log(`Time: ${route.time} seconds`);
                    
                    const steps = route.legs[0].steps || [];
                    console.log(`Steps: ${steps.length}`);

                    const roadClasses = new Set();
                    const speedLimits = new Set();
                    
                    steps.forEach(step => {
                        if (step.road_class) roadClasses.add(step.road_class);
                        if (step.speed_limit) speedLimits.add(step.speed_limit);
                    });

                    console.log(`Road Classes:`, Array.from(roadClasses).join(', '));
                    console.log(`Speed Limits:`, Array.from(speedLimits).join(', '));
                    
                    // Check if route_details are present (road_class is part of route_details)
                    const hasDetails = steps.length > 0 && steps[0].road_class !== undefined;
                    console.log(`Has route_details: ${hasDetails}`);
                    console.log('\n');
                });

            } else {
                console.log("No results found or error response:", data);
            }
        } catch (e) {
            console.error("Parse error:", e);
            console.log("Raw data:", data);
        }
    });
}).on('error', (e) => {
    console.error("Request error:", e);
});
