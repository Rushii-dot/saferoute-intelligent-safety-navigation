import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

// Helper function for geographic distance (Haversine)
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Safety Data Proxy Endpoint
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  // Infrastructure Data Proxy Endpoint (Geoapify)
  app.post("/api/infrastructure", async (req, res) => {
    const { coordinates, distance } = req.body;
    
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length === 0) {
      return res.status(400).json({ error: "No route coordinates provided" });
    }

    const apiKey = process.env.GEOAPIFY_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ 
        error: "Geoapify API key not configured. Infrastructure analysis unavailable." 
      });
    }

    // In-memory cache for Geoapify responses to avoid redundant API calls
    // Global cache outside the handler to persist between requests
    if (!(global as any).geoapifyCache) {
      (global as any).geoapifyCache = new Map<string, { data: any, timestamp: number }>();
    }
    const cache = (global as any).geoapifyCache;
    const CACHE_TTL = 1000 * 60 * 60; // 1 hour

    // STEP 4: Dynamic sampling strategy based on route length
    const totalDistance = distance || 0;
    let sampleInterval = 800; // Default for short routes
    let searchRadius = 500;   // Default for short routes
    let searchLimit = 100;    // Increased default for better coverage

    if (totalDistance > 15000) { // Long routes (>15km)
      sampleInterval = 4500;
      searchRadius = 3000;
      searchLimit = 500;
    } else if (totalDistance > 5000) { // Medium routes (5-15km)
      sampleInterval = 2000;
      searchRadius = 1500;
      searchLimit = 250;
    }

    const sampledPoints = [];
    let currentDistance = 0;
    let lastPoint = coordinates[0];
    sampledPoints.push(lastPoint);

    for (let i = 1; i < coordinates.length; i++) {
      const p = coordinates[i];
      const d = getDistance(lastPoint[1], lastPoint[0], p[1], p[0]);
      currentDistance += d;
      
      if (currentDistance >= sampleInterval) { 
        sampledPoints.push(p);
        lastPoint = p;
        currentDistance = 0;
      }
    }
    
    // Always include the last point if not already added
    if (sampledPoints.length > 0) {
      const finalPoint = coordinates[coordinates.length - 1];
      const distToLast = getDistance(sampledPoints[sampledPoints.length-1][1], sampledPoints[sampledPoints.length-1][0], finalPoint[1], finalPoint[0]);
      if (distToLast > 100) { // Only add if it adds significant new coverage
        sampledPoints.push(finalPoint);
      }
    }

    // Categories to query
    const categories = [
      'healthcare',
      'service',
      'public_transport',
      'education',
      'leisure',
      'commercial',
      'catering'
    ].join(',');

    const allPlaces = new Map();
    let successfulQueries = 0;
    let failedQueries = 0;
    let cacheHits = 0;
    const startOverallTime = Date.now();

    try {
      const pendingQueries = [];
      
      for (const [lng, lat] of sampledPoints) {
        // Round to 4 decimal places (~11m precision) for cache key
        const cacheKey = `${lng.toFixed(4)},${lat.toFixed(4)}`;
        const cached = cache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
          cacheHits++;
          if (cached.data) {
            cached.data.forEach((feature: any) => {
              const placeId = feature.properties.place_id;
              if (placeId && !allPlaces.has(placeId)) {
                allPlaces.set(placeId, feature.properties);
              }
            });
          }
          successfulQueries++;
        } else {
          pendingQueries.push([lng, lat, cacheKey]);
        }
      }

      const batches = [];
      const batchSize = 4; // Increased batch size for better throughput
      for (let i = 0; i < pendingQueries.length; i += batchSize) {
        batches.push(pendingQueries.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        const batchPromises = batch.map(async ([lng, lat, cacheKey]) => {
          const url = `https://api.geoapify.com/v2/places?categories=${categories}&filter=circle:${lng},${lat},${searchRadius}&limit=${searchLimit}&apiKey=${apiKey}`;
          
          let retryCount = 0;
          const maxRetries = 2;
          
          while (retryCount <= maxRetries) {
            try {
              const response = await fetch(url);
              
              if (response.status === 429) {
                const waitTime = (retryCount + 1) * 1000;
                await new Promise(resolve => setTimeout(resolve, waitTime));
                retryCount++;
                continue;
              }

              if (!response.ok) {
                failedQueries++;
                return null;
              }

              const data: any = await response.json();
              const features = data.features || [];
              
              // Store in cache
              cache.set(cacheKey as string, { data: features, timestamp: Date.now() });
              
              successfulQueries++;
              return features;
            } catch (e: any) {
              retryCount++;
              if (retryCount > maxRetries) failedQueries++;
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          }
          return null;
        });

        const results = await Promise.all(batchPromises);
        results.forEach(features => {
          if (features) {
            features.forEach((feature: any) => {
              const placeId = feature.properties.place_id;
              if (placeId && !allPlaces.has(placeId)) {
                allPlaces.set(placeId, feature.properties);
              }
            });
          }
        });
        
        // Dynamic delay based on batch size to stay within 5 req/sec
        // 4 requests per batch means we should wait ~800ms between batches ideally
        if (batches.indexOf(batch) < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 850));
        }
      }

      // Aggregate results from deduplicated set
      const counts = {
        police: 0,
        hospitals: 0,
        pharmacies: 0,
        transit: 0,
        schools: 0,
        parks: 0,
        shops: 0,
        fuelStations: 0
      };

      const transitPlaces: any[] = [];
      const shopPlaces: any[] = [];
      const healthcarePlaces: any[] = [];
      const policePlaces: any[] = [];
      const schoolPlaces: any[] = [];

      allPlaces.forEach((place: any) => {
        const cats = place.categories || [];
        
        if (cats.some((c: string) => c.includes('police'))) {
          counts.police++;
          policePlaces.push({ name: place.name || "Police Facility", category: "police", lat: place.lat, lon: place.lon });
        }
        if (cats.some((c: string) => c.includes('hospital') || c.includes('clinic'))) {
          counts.hospitals++;
          healthcarePlaces.push({ name: place.name || "Healthcare Facility", category: "healthcare", lat: place.lat, lon: place.lon });
        }
        if (cats.some((c: string) => c.includes('pharmacy'))) {
          counts.pharmacies++;
          healthcarePlaces.push({ name: place.name || "Pharmacy", category: "pharmacy", lat: place.lat, lon: place.lon });
        }
        
        if (cats.some((c: string) => c.includes('public_transport') || c.includes('transport') || c.includes('bus') || c.includes('train') || c.includes('railway'))) {
          transitPlaces.push(place);
        }

        if (cats.some((c: string) => c.includes('school') || c.includes('university') || c.includes('college'))) {
          counts.schools++;
          schoolPlaces.push({ name: place.name || "Educational Facility", category: "education", lat: place.lat, lon: place.lon });
        }
        if (cats.some((c: string) => c.includes('park') || c.includes('garden'))) counts.parks++;
        if (cats.some((c: string) => c.includes('shop') || c.includes('supermarket') || c.includes('mall') || c.includes('catering.') || c.includes('commercial.food'))) {
          counts.shops++;
          shopPlaces.push({ name: place.name || "Retail/Activity Location", category: "shop", lat: place.lat, lon: place.lon });
        }
        if (cats.some((c: string) => c.includes('fuel'))) counts.fuelStations++;
      });

      // SECONDARY DEDUPLICATION FOR TRANSIT
      const transitGroups: any[][] = [];
      for (const p of transitPlaces) {
        let matchedGroup = null;
        const pName = (p.name || "").toLowerCase();
        const isGenericP = !p.name || pName === "unnamed" || pName.includes("platform") || 
                           pName.includes("entrance") || pName.includes("exit") || pName.includes("access");

        for (const group of transitGroups) {
          const rep = group[0];
          const repName = (rep.name || "").toLowerCase();
          const isGenericRep = !rep.name || repName === "unnamed" || repName.includes("platform") || 
                               repName.includes("entrance") || repName.includes("exit") || repName.includes("access");
          
          const dist = getDistance(p.lat, p.lon, rep.lat, rep.lon);
          
          if (dist < 100) {
            if (pName !== "" && pName !== "unnamed" && pName === repName) {
              matchedGroup = group;
              break;
            }
            if (isGenericP || isGenericRep) {
              matchedGroup = group;
              break;
            }
            if (pName.length > 3 && repName.length > 3) {
              if (pName.includes(repName) || repName.includes(pName)) {
                matchedGroup = group;
                break;
              }
            }
          }
        }
        if (matchedGroup) matchedGroup.push(p); else transitGroups.push([p]);
      }
      counts.transit = transitGroups.length;

      // Map transit groups to evidence list
      const dedupedTransitPlaces = transitGroups.map(group => {
        const p = group[0];
        return { name: p.name || "Transit Facility", category: "transit", lat: p.lat, lon: p.lon };
      });

      const distanceKm = Math.max(0.1, (req.body.distance || 0) / 1000);

      // Density-based Safety Score Calculation (0-100)
      // Weights: Police (25%), Health (15%), Transit (15%), Shops (15%), Pharmacies (10%), Education (5%), Fuel (5%), Parks (5%)
      
      // Define benchmark densities (points per km for a score of 100 in that category)
      const benchmarks = {
        police: 0.5,      // 1 per 2km
        hospitals: 0.5,   // 1 per 2km
        transit: 2.0,     // 2 per 1km
        shops: 5.0,       // 5 per 1km
        pharmacies: 1.0,  // 1 per 1km
        schools: 0.5,     // 1 per 2km
        fuelStations: 0.2, // 1 per 5km
        parks: 0.2        // 1 per 5km
      };

      const calculateSubScore = (count: number, benchmark: number) => {
        const density = count / distanceKm;
        return Math.min(100, (density / benchmark) * 100);
      };

      const weights = {
        police: 0.25,
        hospitals: 0.15,
        transit: 0.15,
        shops: 0.15,
        pharmacies: 0.10,
        schools: 0.05,
        fuelStations: 0.05,
        parks: 0.05
      };

      const safetyScore = Math.round(
        calculateSubScore(counts.police, benchmarks.police) * weights.police +
        calculateSubScore(counts.hospitals, benchmarks.hospitals) * weights.hospitals +
        calculateSubScore(counts.transit, benchmarks.transit) * weights.transit +
        calculateSubScore(counts.shops, benchmarks.shops) * weights.shops +
        calculateSubScore(counts.pharmacies, benchmarks.pharmacies) * weights.pharmacies +
        calculateSubScore(counts.schools, benchmarks.schools) * weights.schools +
        calculateSubScore(counts.fuelStations, benchmarks.fuelStations) * weights.fuelStations +
        calculateSubScore(counts.parks, benchmarks.parks) * weights.parks
      );

      let safetyRating = "Low";
      if (safetyScore >= 90) safetyRating = "Excellent";
      else if (safetyScore >= 75) safetyRating = "Good";
      else if (safetyScore >= 60) safetyRating = "Moderate";
      else if (safetyScore >= 40) safetyRating = "Low";
      else safetyRating = "Very Low";

      res.json({
        status: "success",
        provider: "geoapify",
        counts: {
          ...counts,
          safetyScore,
          safetyRating
        },
        evidence: {
          humanActivity: {
            shops: shopPlaces,
            transit: dedupedTransitPlaces,
            schools: schoolPlaces
          },
          emergencySupport: {
            police: policePlaces,
            healthcare: healthcarePlaces
          }
        },
        totalPlaces: allPlaces.size,
        debug: {
          status: 200,
          samplePoints: sampledPoints.length,
          successfulQueries,
          queryTime: Date.now() - startOverallTime
        }
      });

    } catch (error: any) {
      console.error("[Geoapify Proxy] Global Error:", error);
      res.status(500).json({ error: "Failed to retrieve infrastructure data from Geoapify" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    try {
      const vite = await createViteServer({
        server: { 
          middlewareMode: true,
          hmr: process.env.DISABLE_HMR !== 'true' ? { port: 24678 } : false,
          watch: process.env.DISABLE_HMR === 'true' ? null : {},
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("[Server] Vite middleware mounted");
    } catch (e) {
      console.error("[Server] Failed to create Vite server:", e);
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
