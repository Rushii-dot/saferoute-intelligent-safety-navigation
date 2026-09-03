import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, MapPin, X } from 'lucide-react';

interface PlaceAutocompleteProps {
  onPlaceSelect: (place: { lat: number; lng: number; name: string }) => void;
  onInputChange?: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  value?: string;
  className?: string;
  currentLocation?: { lat: number; lng: number } | null;
}

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const PlaceAutocomplete: React.FC<PlaceAutocompleteProps> = ({ 
  onPlaceSelect, 
  onInputChange,
  onClear,
  placeholder,
  value,
  className,
  currentLocation
}) => {
  const [inputValue, setInputValue] = useState(value || '');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (value !== undefined) {
      setInputValue(value);
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSuggestions = async (query: string) => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      // Create a search bias using viewbox if currentLocation is available
      // bounded=1 tells Nominatim to strictly prefer results in the viewbox
      let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=15&addressdetails=1`;
      
      if (currentLocation && currentLocation.lat && currentLocation.lng) {
        // approx 0.3 degrees is roughly 30km - tighter viewbox for better local priority
        const viewbox = [
          currentLocation.lng - 0.3,
          currentLocation.lat + 0.3,
          currentLocation.lng + 0.3,
          currentLocation.lat - 0.3
        ].join(',');
        url += `&viewbox=${viewbox}&bounded=1`;
      }

      const response = await fetch(url);
      const data = await response.json();

      // Rank results by distance if currentLocation is available
      if (currentLocation && currentLocation.lat && currentLocation.lng) {
        data.sort((a: any, b: any) => {
          const distA = getDistance(currentLocation.lat, currentLocation.lng, parseFloat(a.lat), parseFloat(a.lon));
          const distB = getDistance(currentLocation.lat, currentLocation.lng, parseFloat(b.lat), parseFloat(b.lon));
          
          // Also boost results with higher importance (OSM's popularity score)
          const importanceA = a.importance || 0;
          const importanceB = b.importance || 0;
          
          // Weighted scoring: Distance is primary, Importance is secondary
          return (distA - distB) * 0.7 - (importanceA - importanceB) * 10;
        });
      }

      setSuggestions(data.slice(0, 5));
      setIsOpen(true);
    } catch (error) {
      console.error('Geocoding error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    if (onInputChange) onInputChange(val);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      fetchSuggestions(val);
    }, 500);
  };

  const handleSelect = (suggestion: any) => {
    const name = suggestion.display_name;
    const lat = parseFloat(suggestion.lat);
    const lng = parseFloat(suggestion.lon);

    setInputValue(name);
    setIsOpen(false);
    onPlaceSelect({ lat, lng, name });
  };

  const handleClear = () => {
    setInputValue('');
    setSuggestions([]);
    setIsOpen(false);
    if (onClear) onClear();
    if (onInputChange) onInputChange('');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative flex items-center pr-8">
        <input
          type="text"
          value={inputValue}
          onChange={handleChange}
          onFocus={() => inputValue.length >= 3 && setIsOpen(true)}
          placeholder={placeholder}
          className="w-full bg-transparent border-none p-0 focus:ring-0 text-slate-900 font-medium placeholder:text-slate-400"
        />
        <div className="absolute right-0 flex items-center gap-1">
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
          ) : (
            inputValue && (
              <button
                onClick={handleClear}
                className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors pointer-events-auto"
                type="button"
                aria-label="Clear location"
              >
                <X size={14} />
              </button>
            )
          )}
        </div>
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden max-h-60 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSelect(s)}
              className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-start gap-3 border-b border-slate-100 last:border-0"
            >
              <MapPin className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-slate-900 truncate">
                  {s.display_name.split(',')[0]}
                </span>
                <span className="text-xs text-slate-500 truncate">
                  {s.display_name}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
