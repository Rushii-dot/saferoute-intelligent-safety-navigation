import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RouteState } from '../types';

// Fix for default marker icons in Leaflet with React
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom icons for Start and Destination
const startIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [32, 52],
  iconAnchor: [16, 52],
  popupAnchor: [1, -45],
  shadowSize: [52, 52]
});

const destIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [32, 52],
  iconAnchor: [16, 52],
  popupAnchor: [1, -45],
  shadowSize: [52, 52]
});

const currentIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const PUNE_CENTER: [number, number] = [18.5204, 73.8567];

interface MapUpdaterProps {
  routeState: RouteState;
}

const MapUpdater: React.FC<MapUpdaterProps> = ({ routeState }) => {
  const map = useMap();

  useEffect(() => {
    if (routeState.routes.length > 0 && routeState.selectedRouteIndex !== undefined) {
      const selectedRoute = routeState.routes[routeState.selectedRouteIndex];
      if (selectedRoute && selectedRoute.polyline) {
        try {
          const coords = JSON.parse(selectedRoute.polyline);
          if (Array.isArray(coords) && coords.length > 0) {
            // OSRM returns [lng, lat], Leaflet needs [lat, lng]
            const bounds = L.latLngBounds(coords.map(c => [c[1], c[0]]));
            map.fitBounds(bounds, { padding: [50, 50] });
          }
        } catch (e) {
          console.error('Error parsing route polyline:', e);
        }
      }
    } else if (
      routeState.start && typeof routeState.start.lat === 'number' && !isNaN(routeState.start.lat) && typeof routeState.start.lng === 'number' && !isNaN(routeState.start.lng) &&
      routeState.destination && typeof routeState.destination.lat === 'number' && !isNaN(routeState.destination.lat) && typeof routeState.destination.lng === 'number' && !isNaN(routeState.destination.lng)
    ) {
      const bounds = L.latLngBounds([
        [routeState.start.lat, routeState.start.lng],
        [routeState.destination.lat, routeState.destination.lng]
      ]);
      map.fitBounds(bounds, { padding: [100, 100] });
    } else if (routeState.start && typeof routeState.start.lat === 'number' && !isNaN(routeState.start.lat) && typeof routeState.start.lng === 'number' && !isNaN(routeState.start.lng)) {
      map.setView([routeState.start.lat, routeState.start.lng], 14);
    } else if (routeState.current && typeof routeState.current.lat === 'number' && !isNaN(routeState.current.lat) && typeof routeState.current.lng === 'number' && !isNaN(routeState.current.lng)) {
      map.setView([routeState.current.lat, routeState.current.lng], 14);
    }
  }, [routeState, map]);

  return null;
};

interface AppMapProps {
  routeState: RouteState;
  setRouteState: React.Dispatch<React.SetStateAction<RouteState>>;
}

const ROUTE_COLORS = [
  '#22c55e', // green-500
  '#f97316', // orange-500
  '#a855f7', // purple-500
  '#ec4899', // pink-500
];

const SELECTED_COLOR = '#0f172a'; // slate-900 (Dark & Bold)

export const AppMap: React.FC<AppMapProps> = ({ routeState, setRouteState }) => {
  const [allRoutesCoords, setAllRoutesCoords] = useState<[number, number][][]>([]);

  useEffect(() => {
    if (routeState.routes.length > 0) {
      const coordsList = routeState.routes.map(route => {
        if (!route.polyline) return [];
        try {
          const coords = JSON.parse(route.polyline);
          return coords.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
        } catch (e) {
          console.error('Error parsing polyline:', e);
          return [];
        }
      });
      setAllRoutesCoords(coordsList);
    } else {
      setAllRoutesCoords([]);
    }
  }, [routeState.routes]);

  return (
    <div className="flex-1 relative h-full w-full bg-slate-100 min-h-[300px]">
      <MapContainer 
        center={PUNE_CENTER} 
        zoom={13} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <ZoomControl position="bottomright" />
        <MapUpdater routeState={routeState} />

        {routeState.start && typeof routeState.start.lat === 'number' && !isNaN(routeState.start.lat) && typeof routeState.start.lng === 'number' && !isNaN(routeState.start.lng) && (
          <Marker 
            position={[routeState.start.lat, routeState.start.lng]} 
            icon={startIcon}
          />
        )}

        {routeState.destination && typeof routeState.destination.lat === 'number' && !isNaN(routeState.destination.lat) && typeof routeState.destination.lng === 'number' && !isNaN(routeState.destination.lng) && (
          <Marker 
            position={[routeState.destination.lat, routeState.destination.lng]} 
            icon={destIcon}
          />
        )}

        {routeState.current && typeof routeState.current.lat === 'number' && !isNaN(routeState.current.lat) && typeof routeState.current.lng === 'number' && !isNaN(routeState.current.lng) && !routeState.start && (
          <Marker 
            position={[routeState.current.lat, routeState.current.lng]} 
            icon={currentIcon}
          />
        )}

        {/* Draw background routes (dimmed) */}
        {allRoutesCoords.map((coords, index) => {
          if (coords.length === 0 || index === routeState.selectedRouteIndex) return null;
          return (
            <Polyline 
              key={`route-bg-${index}`}
              positions={coords} 
              color={ROUTE_COLORS[index % ROUTE_COLORS.length]}
              weight={5} 
              opacity={0.3}
              lineJoin="round"
              lineCap="round"
              zIndex={1}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  setRouteState(prev => ({ ...prev, selectedRouteIndex: index }));
                },
                mouseover: (e) => {
                  e.target.setStyle({ opacity: 0.6, weight: 7 });
                },
                mouseout: (e) => {
                  e.target.setStyle({ opacity: 0.3, weight: 5 });
                }
              }}
            />
          );
        })}

        {/* Draw selected route (prominent) */}
        {routeState.selectedRouteIndex !== undefined && allRoutesCoords[routeState.selectedRouteIndex] && (
          <Polyline 
            positions={allRoutesCoords[routeState.selectedRouteIndex]} 
            color={SELECTED_COLOR}
            weight={8} 
            opacity={1}
            lineJoin="round"
            lineCap="round"
            zIndex={1000}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
              }
            }}
          />
        )}
      </MapContainer>
    </div>
  );
};
