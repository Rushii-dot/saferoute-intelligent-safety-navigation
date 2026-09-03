import React, { useState, useCallback, useEffect } from 'react';
import { MapPin, Search, ArrowDownUp, Navigation, AlertCircle, CheckCircle2, Clock, Map as MapIcon, ChevronRight, ChevronDown, ChevronUp, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { RouteState, RouteOption, SafetyData } from '../types';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import { fetchSafetyData } from '../lib/safetyEngine';

interface SearchPanelProps {
  routeState: RouteState;
  setRouteState: React.Dispatch<React.SetStateAction<RouteState>>;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({ routeState, setRouteState }) => {
  const [isLocating, setIsLocating] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'error' | 'success' } | null>(null);
  const [debugInfo, setDebugInfo] = useState<{ url: string, rawCount: number, routes: any[] } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDirectionsIndex, setShowDirectionsIndex] = useState<number | null>(null);
  const [expandedEvidence, setExpandedEvidence] = useState<Record<number, string | null>>({});

  // Request location on load
  useEffect(() => {
    useCurrentLocation();
  }, []);
  
  const toggleEvidence = (routeIdx: number, section: string) => {
    setExpandedEvidence(prev => ({
      ...prev,
      [routeIdx]: prev[routeIdx] === section ? null : section
    }));
  };

  const handleStartSelect = useCallback((place: { lat: number; lng: number; name: string }) => {
    setRouteState(prev => ({
      ...prev,
      start: place,
      routes: [],
      selectedRouteIndex: 0
    }));
    setMessage(null);
  }, [setRouteState]);

  const handleDestinationSelect = useCallback((place: { lat: number; lng: number; name: string }) => {
    setRouteState(prev => ({
      ...prev,
      destination: place,
      routes: [],
      selectedRouteIndex: 0
    }));
    setMessage(null);
  }, [setRouteState]);

  const handleStartInputChange = useCallback((value: string) => {
    setRouteState(prev => {
      if (prev.start?.name === value) return prev;
      return { 
        ...prev, 
        start: value ? { name: value, lat: undefined as any, lng: undefined as any } : null, 
        routes: [],
        selectedRouteIndex: 0
      };
    });
  }, [setRouteState]);

  const handleDestinationInputChange = useCallback((value: string) => {
    setRouteState(prev => {
      if (prev.destination?.name === value) return prev;
      return { 
        ...prev, 
        destination: value ? { name: value, lat: undefined as any, lng: undefined as any } : null, 
        routes: [],
        selectedRouteIndex: 0
      };
    });
  }, [setRouteState]);

  async function useCurrentLocation() {
    setIsLocating(true);
    setMessage(null);
    
    if (!navigator.geolocation) {
      setMessage({ text: 'Geolocation is not supported by your browser.', type: 'error' });
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };

        let locationName = 'Current Location';

        try {
          // Using Nominatim for reverse geocoding with a timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}`,
            { 
              signal: controller.signal,
              headers: {
                'Accept-Language': 'en'
              }
            }
          );
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const data = await response.json();
            if (data && data.display_name) {
              locationName = data.display_name;
            }
          }
        } catch (e) {
          console.warn('Reverse geocoding failed (using fallback label):', e);
          // We don't set an error message here because we can still use the coordinates
        }
        
        setRouteState(prev => ({
          ...prev,
          start: { ...coords, name: locationName },
          current: { ...coords, name: 'Your Location' },
          routes: [],
          selectedRouteIndex: 0
        }));
        
        setIsLocating(false);
      },
      (error) => {
        let errorMsg = 'Failed to get your location.';
        if (error.code === error.PERMISSION_DENIED) {
          errorMsg = 'Location permission denied. Please enable it in your browser settings.';
        }
        setMessage({ text: errorMsg, type: 'error' });
        setIsLocating(false);
      }
    );
  }

  const handleFindRoutes = async () => {
    const startPos = routeState.start;
    const destPos = routeState.destination;

    if (!startPos || typeof startPos.lat !== 'number' || !destPos || typeof destPos.lat !== 'number') {
      setMessage({ text: 'Please select both start and destination from suggestions.', type: 'error' });
      return;
    }

    setIsCalculating(true);
    setMessage(null);

    try {
      // Using OSRM for free routing with more alternatives
      const url = `https://router.project-osrm.org/route/v1/driving/${startPos.lng},${startPos.lat};${destPos.lng},${destPos.lat}?overview=full&geometries=geojson&alternatives=3&steps=true`;
      console.log('OSRM Request URL:', url);

      const response = await fetch(url);
      const data = await response.json();

      if (data.code === 'Ok') {
        setDebugInfo({
          url,
          rawCount: data.routes.length,
          routes: data.routes.map((r: any) => ({
            distance: (r.distance / 1000).toFixed(2),
            duration: (r.duration / 60).toFixed(2)
          }))
        });

        console.log(`OSRM Response: Found ${data.routes.length} total routes`);
        data.routes.forEach((route: any, i: number) => {
          console.log(`Route ${i + 1}: Distance=${(route.distance / 1000).toFixed(2)}km, Duration=${(route.duration / 60).toFixed(2)}min`);
        });

        // Find the minimum distance to calculate the threshold
        const minDistance = Math.min(...data.routes.map((r: any) => r.distance));
        const MAX_ADDITIONAL_DISTANCE_METERS = 6000; // 6km limit

        const filteredRoutes = data.routes.filter((route: any, index: number) => {
          // Always keep the first (usually fastest/recommended) route
          if (index === 0) return true;
          // Keep alternatives that are not excessively longer (within 6km of the fastest)
          return (route.distance - minDistance) <= MAX_ADDITIONAL_DISTANCE_METERS;
        });

        const newRoutes: RouteOption[] = filteredRoutes.map((route: any, index: number) => {
          let label = `Route ${index + 1}`;
          if (index === 0) label = 'Recommended';
          else if (index === 1) label = 'Fastest';
          else label = 'Alternative';

          const distanceKm = (route.distance / 1000).toFixed(1) + ' km';
          const durationMin = Math.round(route.duration / 60) + ' min';

          return {
            id: `route-${index}`,
            distance: distanceKm,
            duration: durationMin,
            polyline: JSON.stringify(route.geometry.coordinates),
            summary: route.legs[0].summary || 'Direct Route',
            isRecommended: index === 0,
            label,
            // Keep coordinates for safety analysis
            coordinates: route.geometry.coordinates,
            rawDistance: route.distance,
            steps: route.legs[0].steps,
            safetyData: {
              status: 'loading',
              lighting: 0,
              shops: 0,
              residential: 0,
              hospitals: 0,
              police: 0,
              fireStations: 0,
              schools: 0,
              transit: 0,
              pedestrian: 0,
              parks: 0,
              roadTypes: {}
            }
          };
        });

        setRouteState(prev => ({
          ...prev,
          routes: newRoutes,
          selectedRouteIndex: 0
        }));

        // Safety Analysis V1: Fetch real infrastructure data for each route in parallel
        // We don't await this here so the main route search can "finish" and show results
        // while safety data loads progressively in the background.
        Promise.all(newRoutes.map(async (route, index) => {
          try {
            const safetyData = await fetchSafetyData(route.coordinates as any, route.rawDistance);
            setRouteState(prev => {
              const updatedRoutes = [...prev.routes];
              if (updatedRoutes[index]) {
                updatedRoutes[index] = { ...updatedRoutes[index], safetyData };
              }
              return { ...prev, routes: updatedRoutes };
            });
          } catch (error) {
            console.error(`Safety analysis failed for route ${index}:`, error);
          }
        }));
        
        const routeCountMsg = newRoutes.length === 1 
          ? 'Found 1 direct route for your journey.' 
          : `Found ${newRoutes.length} practical routes for your journey.`;
        setMessage({ text: routeCountMsg, type: 'success' });
        
        // Scroll to the bottom on mobile to show the map
        if (window.innerWidth < 768) {
          setTimeout(() => {
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          }, 500);
        }
      } else {
        setMessage({ text: 'Could not find a route between these locations.', type: 'error' });
      }
    } catch (error: any) {
      console.error('Routing service error:', error);
      setMessage({ text: 'An unexpected error occurred during route calculation.', type: 'error' });
    } finally {
      setIsCalculating(false);
    }
  };

  const handleRouteSelect = (index: number) => {
    setRouteState(prev => ({
      ...prev,
      selectedRouteIndex: index
    }));
  };

  return (
    <div className={`flex flex-col bg-white border-r border-slate-200 w-full md:w-96 md:h-full overflow-y-auto ${routeState.routes.length > 0 ? 'h-auto' : 'h-full'}`}>
      <div className="p-6 space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Where are you going?</h2>
            <button 
              onClick={useCurrentLocation}
              disabled={isLocating}
              className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {isLocating ? (
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                  <Navigation size={14} fill="currentColor" />
                </motion.div>
              ) : (
                <Navigation size={14} fill="currentColor" />
              )}
              {isLocating ? 'Locating...' : 'Current Location'}
            </button>
          </div>
          
          <div className="relative space-y-2">
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 z-10 pointer-events-none">
                <MapPin size={18} />
              </div>
              <PlaceAutocomplete 
                onPlaceSelect={handleStartSelect}
                onInputChange={handleStartInputChange}
                onClear={() => setRouteState(prev => ({ ...prev, start: null, routes: [], selectedRouteIndex: 0 }))}
                placeholder="Starting location"
                value={routeState.start?.name || ''}
                currentLocation={routeState.current}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
              />
            </div>

            <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
               <div className="bg-white border border-slate-200 p-1.5 rounded-lg text-slate-400 shadow-sm opacity-50">
                 <ArrowDownUp size={14} />
               </div>
            </div>
            
            <div className="relative pt-2">
              <div className="absolute left-3 top-[calc(50%+4px)] -translate-y-1/2 text-indigo-500 z-10 pointer-events-none">
                <MapPin size={18} />
              </div>
              <PlaceAutocomplete 
                onPlaceSelect={handleDestinationSelect}
                onInputChange={handleDestinationInputChange}
                onClear={() => setRouteState(prev => ({ ...prev, destination: null, routes: [], selectedRouteIndex: 0 }))}
                placeholder="Enter destination"
                value={routeState.destination?.name || ''}
                currentLocation={routeState.current}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          <AnimatePresence>
            {message && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`p-3 rounded-xl flex items-start gap-2 text-sm ${
                  message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                }`}
              >
                {message.type === 'error' ? <AlertCircle size={18} className="shrink-0 mt-0.5" /> : <CheckCircle2 size={18} className="shrink-0 mt-0.5" />}
                <span>{message.text}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            onClick={handleFindRoutes}
            disabled={isCalculating}
            className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-lg shadow-indigo-200 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isCalculating ? (
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                <Clock size={18} />
              </motion.div>
            ) : (
              <Search size={18} />
            )}
            {isCalculating ? 'Calculating Routes...' : 'Find Safe Routes'}
          </button>
        </div>

        <div className="pt-6 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Route Selection</h3>
          
          {routeState.routes.length > 0 ? (
            <div className="space-y-3">
              {routeState.routes.map((route, index) => (
                <div
                  key={route.id}
                  onClick={() => handleRouteSelect(index)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRouteSelect(index);
                    }
                  }}
                  className={`w-full cursor-pointer text-left p-4 rounded-2xl border transition-all ${
                    routeState.selectedRouteIndex === index 
                      ? 'bg-indigo-50 border-indigo-600 shadow-sm ring-1 ring-indigo-600' 
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      {route.isRecommended && (
                        <span className="inline-block px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-bold rounded-full uppercase tracking-wider mb-1">
                          {route.label}
                        </span>
                      )}
                      {!route.isRecommended && (
                        <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-full uppercase tracking-wider mb-1">
                          {route.label}
                        </span>
                      )}
                      <h4 className="font-bold text-slate-900">Route {index + 1}</h4>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">{route.duration}</p>
                      <p className="text-[10px] text-slate-500 font-medium">{route.distance}</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-1 mb-3">{route.summary}</p>
                  
                  {/* Safety Score V2 Presentation */}
                  {route.safetyData && route.safetyData.status === 'success' && (
                    <div className="mb-4 space-y-4">
                      <div className="flex items-center gap-4">
                        <div className={`px-4 py-2 rounded-2xl border flex flex-col items-center justify-center min-w-[85px] ${
                          route.safetyData.safetyScore! >= 90 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                          route.safetyData.safetyScore! >= 75 ? 'bg-blue-50 border-blue-200 text-blue-700' :
                          route.safetyData.safetyScore! >= 60 ? 'bg-amber-50 border-amber-200 text-amber-700' :
                          route.safetyData.safetyScore! >= 40 ? 'bg-orange-50 border-orange-200 text-orange-700' :
                          'bg-rose-50 border-rose-200 text-rose-700'
                        }`}>
                          <span className="text-[10px] font-bold uppercase tracking-tight leading-none mb-1">Safety Score</span>
                          <span className="text-2xl font-black leading-none">{route.safetyData.safetyScore}</span>
                          <span className="text-[8px] font-bold opacity-70 mt-0.5">/ 100</span>
                        </div>
                        
                        <div className="flex-1 space-y-1">
                          <div className="flex flex-col">
                            {route.safetyData.timeContext && (
                              <div className="flex items-center gap-1 mb-1">
                                {route.safetyData.timeContext === 'day' ? (
                                  <Sun size={10} className="text-amber-500" />
                                ) : (
                                  <Moon size={10} className="text-indigo-400" />
                                )}
                                <span className="text-[9px] font-bold uppercase tracking-tight text-slate-400">
                                  {route.safetyData.timeContext === 'day' ? 'Daytime' : 'Nighttime'} · Considered in analysis
                                </span>
                              </div>
                            )}
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-none mb-1">Contextual Favorability</span>
                            <span className={`text-base font-black uppercase tracking-tight leading-tight ${
                              route.safetyData.safetyScore! >= 90 ? 'text-emerald-600' :
                              route.safetyData.safetyScore! >= 75 ? 'text-blue-600' :
                              route.safetyData.safetyScore! >= 60 ? 'text-amber-600' :
                              route.safetyData.safetyScore! >= 40 ? 'text-orange-600' :
                              'text-rose-600'
                            }`}>
                              {route.safetyData.safetyRating}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Confidence:</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                              (route.safetyData.confidence || 0) >= 0.8 ? 'bg-emerald-100 text-emerald-700' :
                              (route.safetyData.confidence || 0) >= 0.5 ? 'bg-blue-100 text-blue-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {(route.safetyData.confidence || 0) >= 0.8 ? 'High' : 
                               (route.safetyData.confidence || 0) >= 0.5 ? 'Moderate' : 'Limited'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* V2 Component Breakdown */}
                      <div className="space-y-2.5 p-3.5 bg-white rounded-2xl border border-slate-100 shadow-sm">
                        {/* Road Environment */}
                        <div className="space-y-2">
                          <button 
                            onClick={(e) => { e.stopPropagation(); toggleEvidence(index, 'road'); }}
                            className="w-full flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-indigo-600 transition-colors"
                          >
                            <span className="flex items-center gap-1.5">
                              Road Environment
                              {expandedEvidence[index] === 'road' ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                            </span>
                            <span className="text-slate-900">{route.safetyData.roadEnvironmentScore} / 35</span>
                          </button>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-indigo-500 rounded-full transition-all duration-1000" 
                              style={{ width: `${(route.safetyData.roadEnvironmentScore! / 35) * 100}%` }}
                            />
                          </div>
                          <AnimatePresence>
                            {expandedEvidence[index] === 'road' && route.safetyData.evidence?.roadEnvironment && (
                              <motion.div 
                                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="p-2.5 bg-slate-50 rounded-xl space-y-2 text-[10px] text-slate-600 border border-slate-100">
                                  <div className="flex justify-between">
                                    <span>Route Complexity</span>
                                    <span className="font-bold text-slate-800">{route.safetyData.evidence.roadEnvironment.routeComplexity}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Detected Turns/Maneuvers</span>
                                    <span className="font-bold text-slate-800">{route.safetyData.evidence.roadEnvironment.turnCount}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Turn Density (per km)</span>
                                    <span className="font-bold text-slate-800">{route.safetyData.evidence.roadEnvironment.turnsPerKm}</span>
                                  </div>
                                  <p className="text-[9px] text-slate-400 italic">Geometric analysis derived from OSRM path data.</p>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                        
                        {/* Human Activity */}
                        <div className="space-y-2">
                          <button 
                            onClick={(e) => { e.stopPropagation(); toggleEvidence(index, 'activity'); }}
                            className="w-full flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-indigo-600 transition-colors"
                          >
                            <span className="flex items-center gap-1.5">
                              Human Activity
                              {expandedEvidence[index] === 'activity' ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                            </span>
                            <span className="text-slate-900">{route.safetyData.humanActivityScore} / 40</span>
                          </button>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-indigo-500 rounded-full transition-all duration-1000" 
                              style={{ width: `${(route.safetyData.humanActivityScore! / 40) * 100}%` }}
                            />
                          </div>
                          <AnimatePresence>
                            {expandedEvidence[index] === 'activity' && route.safetyData.evidence?.humanActivity && (
                              <motion.div 
                                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="p-2.5 bg-slate-50 rounded-xl space-y-2 text-[10px] text-slate-600 border border-slate-100">
                                  {/* Shops & Activity */}
                                  <div>
                                    <p className="font-bold text-indigo-600 mb-1 flex justify-between">
                                      <span>Shops & Activity</span>
                                      <span>{route.safetyData.evidence.humanActivity.shops.length}</span>
                                    </p>
                                    <div className="space-y-1 pl-1 border-l border-indigo-100">
                                      {route.safetyData.evidence.humanActivity.shops.slice(0, 5).map((p: any, i: number) => (
                                        <div key={i} className="flex justify-between gap-2">
                                          <span className="truncate">{p.name}</span>
                                          <span className="text-[9px] text-slate-400 shrink-0">{p.category}</span>
                                        </div>
                                      ))}
                                      {route.safetyData.evidence.humanActivity.shops.length > 5 && (
                                        <p className="text-[9px] text-slate-400 italic">...and {route.safetyData.evidence.humanActivity.shops.length - 5} more locations</p>
                                      )}
                                      {route.safetyData.evidence.humanActivity.shops.length === 0 && <p className="text-[9px] text-slate-400">No activity locations detected.</p>}
                                    </div>
                                  </div>
                                  {/* Transit */}
                                  <div>
                                    <p className="font-bold text-indigo-600 mb-1 flex justify-between">
                                      <span>Transit Facilities</span>
                                      <span>{route.safetyData.evidence.humanActivity.transit.length}</span>
                                    </p>
                                    <div className="space-y-1 pl-1 border-l border-indigo-100">
                                      {route.safetyData.evidence.humanActivity.transit.slice(0, 3).map((p: any, i: number) => (
                                        <div key={i} className="flex justify-between gap-2">
                                          <span className="truncate">{p.name}</span>
                                          <span className="text-[9px] text-slate-400 shrink-0">transit</span>
                                        </div>
                                      ))}
                                      {route.safetyData.evidence.humanActivity.transit.length > 3 && (
                                        <p className="text-[9px] text-slate-400 italic">...and {route.safetyData.evidence.humanActivity.transit.length - 3} more hubs</p>
                                      )}
                                      {route.safetyData.evidence.humanActivity.transit.length === 0 && <p className="text-[9px] text-slate-400">No transit hubs detected.</p>}
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Emergency Support */}
                        <div className="space-y-2">
                          <button 
                            onClick={(e) => { e.stopPropagation(); toggleEvidence(index, 'emergency'); }}
                            className="w-full flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-indigo-600 transition-colors"
                          >
                            <span className="flex items-center gap-1.5">
                              Emergency Support
                              {expandedEvidence[index] === 'emergency' ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                            </span>
                            <span className="text-slate-900">{route.safetyData.emergencySupportScore} / 25</span>
                          </button>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-indigo-500 rounded-full transition-all duration-1000" 
                              style={{ width: `${(route.safetyData.emergencySupportScore! / 25) * 100}%` }}
                            />
                          </div>
                          <AnimatePresence>
                            {expandedEvidence[index] === 'emergency' && route.safetyData.evidence?.emergencySupport && (
                              <motion.div 
                                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="p-2.5 bg-slate-50 rounded-xl space-y-2 text-[10px] text-slate-600 border border-slate-100">
                                  {/* Police */}
                                  <div>
                                    <p className="font-bold text-indigo-600 mb-1 flex justify-between">
                                      <span>Police Support</span>
                                      <span>{route.safetyData.evidence.emergencySupport.police.length}</span>
                                    </p>
                                    <div className="space-y-1 pl-1 border-l border-indigo-100">
                                      {route.safetyData.evidence.emergencySupport.police.map((p: any, i: number) => (
                                        <div key={i} className="flex justify-between gap-2">
                                          <span className="truncate">{p.name}</span>
                                          <span className="text-[9px] text-slate-400 shrink-0">police</span>
                                        </div>
                                      ))}
                                      {route.safetyData.evidence.emergencySupport.police.length === 0 && <p className="text-[9px] text-slate-400">No police facilities detected nearby.</p>}
                                    </div>
                                  </div>
                                  {/* Healthcare */}
                                  <div>
                                    <p className="font-bold text-indigo-600 mb-1 flex justify-between">
                                      <span>Healthcare Access</span>
                                      <span>{route.safetyData.evidence.emergencySupport.healthcare.length}</span>
                                    </p>
                                    <div className="space-y-1 pl-1 border-l border-indigo-100">
                                      {route.safetyData.evidence.emergencySupport.healthcare.slice(0, 3).map((p: any, i: number) => (
                                        <div key={i} className="flex justify-between gap-2">
                                          <span className="truncate">{p.name}</span>
                                          <span className="text-[9px] text-slate-400 shrink-0">{p.category}</span>
                                        </div>
                                      ))}
                                      {route.safetyData.evidence.emergencySupport.healthcare.length > 3 && (
                                        <p className="text-[9px] text-slate-400 italic">...and {route.safetyData.evidence.emergencySupport.healthcare.length - 3} more medical sites</p>
                                      )}
                                      {route.safetyData.evidence.emergencySupport.healthcare.length === 0 && <p className="text-[9px] text-slate-400">No medical facilities detected.</p>}
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>

                      {/* WHY THIS ROUTE? */}
                      {route.isRecommended && routeState.routes.length > 1 && (
                        <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
                          <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-1">Why this route?</p>
                          <p className="text-[10px] text-slate-600 leading-snug">
                            {(() => {
                              const others = routeState.routes.filter((_, i) => i !== index && _.safetyData?.status === 'success');
                              if (others.length === 0) return "Optimal balance of safety indicators.";
                              
                              const maxActivity = Math.max(...others.map(r => r.safetyData?.humanActivityScore || 0));
                              const maxEmergency = Math.max(...others.map(r => r.safetyData?.emergencySupportScore || 0));
                              
                              const betterActivity = (route.safetyData.humanActivityScore || 0) > maxActivity;
                              const betterEmergency = (route.safetyData.emergencySupportScore || 0) > maxEmergency;
                              
                              if (betterActivity && betterEmergency) return "Higher human activity and better access to emergency services than alternatives.";
                              if (betterActivity) return "Greater human presence and activity along this path.";
                              if (betterEmergency) return "Superior access to emergency support and healthcare facilities.";
                              return "Scores are similar.";
                            })()}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Loading/Error States */}
                  {route.safetyData && route.safetyData.status !== 'success' && (
                    <div className="mb-4 p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                      {route.safetyData.status === 'loading' ? (
                        <div className="flex flex-col items-center gap-2 py-2">
                          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}>
                            <Clock size={20} className="text-indigo-400" />
                          </motion.div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Executing V2 Safety Audit...</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 py-2 text-rose-500">
                          <AlertCircle size={20} />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Safety Data Temporarily Unavailable</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                     <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                           <Clock size={12} className="text-slate-400" />
                           <span className="text-[10px] font-medium text-slate-500">Fastest mode available</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDirectionsIndex(showDirectionsIndex === index ? null : index);
                          }}
                          className="flex items-center gap-1.5 py-1 px-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                        >
                          <Navigation size={10} className={showDirectionsIndex === index ? 'fill-indigo-600' : ''} />
                          <span className="text-[9px] font-bold uppercase tracking-wider">
                            {showDirectionsIndex === index ? 'Hide Directions' : 'View Directions'}
                          </span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (routeState.destination) {
                              const { lat, lng } = routeState.destination;
                              const origin = routeState.start ? `&origin=${routeState.start.lat},${routeState.start.lng}` : '';
                              window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}${origin}`, '_blank');
                            }
                          }}
                          className="flex items-center gap-1.5 py-1 px-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                        >
                          <MapIcon size={10} />
                          <span className="text-[9px] font-bold uppercase tracking-wider">Start Nav</span>
                        </button>
                     </div>
                     <ChevronRight size={14} className={routeState.selectedRouteIndex === index ? 'text-indigo-600' : 'text-slate-300'} />
                  </div>

                  <p className="text-[8px] text-slate-400 mt-2 italic text-right">
                    External navigation may recalculate the route.
                  </p>

                  {/* Turn-by-Turn Directions */}
                  <AnimatePresence>
                    {showDirectionsIndex === index && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mt-4 border-t border-slate-100 pt-4 overflow-hidden"
                      >
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col items-center gap-1">
                              <div className="w-2 h-2 rounded-full bg-indigo-500 ring-4 ring-indigo-100" />
                              <div className="w-0.5 h-4 bg-slate-200" />
                            </div>
                            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Start: {routeState.start?.name}</span>
                          </div>

                          <div className="space-y-4 ml-1">
                            {route.steps?.map((step, sIdx) => (
                              <div key={sIdx} className="flex gap-4">
                                <div className="flex flex-col items-center gap-1 mt-1">
                                  <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                  {sIdx < (route.steps?.length || 0) - 1 && <div className="w-0.5 h-full min-h-[20px] bg-slate-100" />}
                                </div>
                                <div className="flex-1">
                                  <p className="text-[11px] text-slate-700 font-medium leading-relaxed">
                                    {step.maneuver.instruction || `${step.maneuver.type} ${step.maneuver.modifier || ''} on ${step.name || 'Unnamed Road'}`}
                                  </p>
                                  <p className="text-[9px] text-slate-400 mt-0.5 font-bold uppercase tracking-wider">
                                    {(step.distance / 1000).toFixed(2)} km • {Math.round(step.duration / 60)} min
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="flex items-center gap-3 pt-2">
                            <MapPin size={12} className="text-rose-500" />
                            <span className="text-[10px] font-bold text-slate-900 uppercase tracking-wider">Destination: {routeState.destination?.name}</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}

              {/* Advanced Details Section */}
              <div className="mt-4 border-t border-slate-100 pt-4">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-wider"
                >
                  <ChevronDown size={14} className={`transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
                  <span>Advanced Details</span>
                </button>

                <AnimatePresence>
                  {showAdvanced && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 space-y-4">
                        {/* Selected Route Infrastructure Debug */}
                        {routeState.routes[routeState.selectedRouteIndex]?.safetyData?.debug && (
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[10px] font-mono text-slate-500">
                            <p className="font-bold text-indigo-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <CheckCircle2 size={10} />
                              <span>Infrastructure Debug (Selected Route)</span>
                            </p>
                            <div className="space-y-1">
                              <p>Provider: {routeState.routes[routeState.selectedRouteIndex].safetyData.debug.endpoint}</p>
                              <p>Status: {routeState.routes[routeState.selectedRouteIndex].safetyData.debug.status}</p>
                              <p>Unique Places: {routeState.routes[routeState.selectedRouteIndex].safetyData.debug.elementCount}</p>
                              <p>Samples: {routeState.routes[routeState.selectedRouteIndex].safetyData.debug.samplePoints}</p>
                              <p>Success: {routeState.routes[routeState.selectedRouteIndex].safetyData.debug.successfulQueries}</p>
                              <p>Processing Time: {routeState.routes[routeState.selectedRouteIndex].safetyData.debug.queryTime ? `${(routeState.routes[routeState.selectedRouteIndex].safetyData.debug.queryTime / 1000).toFixed(1)}s` : 'N/A'}</p>
                            </div>
                          </div>
                        )}

                        {/* OSRM Debug Info */}
                        {debugInfo && (
                          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-[10px] font-mono text-slate-400">
                            <div className="flex items-center gap-2 mb-2 text-indigo-400 font-bold uppercase tracking-wider">
                              <AlertCircle size={12} />
                              <span>OSRM Debug Panel</span>
                            </div>
                            <div className="space-y-2">
                              <div>
                                <p className="text-slate-500 mb-1">Request URL:</p>
                                <p className="break-all bg-slate-950 p-2 rounded border border-slate-800">{debugInfo.url}</p>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-slate-500">Raw Route Count:</p>
                                  <p className="text-white font-bold">{debugInfo.rawCount}</p>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-slate-500">Route Breakdown:</p>
                                  {debugInfo.routes.map((r, i) => (
                                    <p key={i} className="text-white">
                                      #{i+1}: {r.distance}km / {r.duration}min
                                    </p>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <>
              {routeState.start && routeState.destination ? (
                 <div className="space-y-4">
                    <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                       <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2">Trip Overview</p>
                       <div className="space-y-3">
                          <div className="flex gap-3">
                            <div className="w-5 h-5 bg-white rounded-full border-2 border-indigo-600 shrink-0 flex items-center justify-center text-[10px] font-bold">A</div>
                            <p className="text-sm font-medium text-slate-700">{routeState.start.name}</p>
                          </div>
                          <div className="w-0.5 h-4 bg-slate-200 ml-2.5"></div>
                          <div className="flex gap-3">
                            <div className="w-5 h-5 bg-red-600 rounded-full border-2 border-red-600 shrink-0 flex items-center justify-center text-white text-[10px] font-bold">B</div>
                            <p className="text-sm font-medium text-slate-700">{routeState.destination.name}</p>
                          </div>
                       </div>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center gap-2 text-center">
                       <MapIcon size={20} className="text-slate-400" />
                       <p className="text-xs text-slate-500 font-medium">Click "Find Safe Routes" to start calculation</p>
                    </div>
                 </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                   <div className="bg-slate-200 p-3 rounded-full mb-3">
                    <Search className="text-slate-400" size={20} />
                  </div>
                  <p className="text-sm font-medium text-slate-600">Enter locations to see safe route recommendations</p>
                  <p className="text-xs text-slate-400 mt-1">Route alternatives will appear here</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="space-y-3">
           <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Safety Status</h3>
           <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
             {routeState.routes[routeState.selectedRouteIndex]?.safetyData ? (
               <div className="space-y-2">
                 <p className="text-xs text-indigo-700 font-bold flex items-center gap-1.5">
                   <CheckCircle2 size={14} />
                   SafeRoute V2 Engine Active
                 </p>
                 <p className="text-[10px] text-slate-500 leading-relaxed italic">
                   "Calculated relative contextual favorability based on {routeState.routes[routeState.selectedRouteIndex]?.safetyData?.debug?.elementCount || 0} infrastructure markers and geometric turn density."
                 </p>
               </div>
             ) : (
               <p className="text-xs text-slate-500 leading-relaxed italic">
                 "Safety analysis will appear here after route safety data is connected."
               </p>
             )}
           </div>
        </div>
      </div>
    </div>
  );
};
