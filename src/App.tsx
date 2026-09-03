/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Header } from './components/Header';
import { SearchPanel } from './components/SearchPanel';
import { AppMap } from './components/AppMap';
import { RouteState } from './types';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  const [routeState, setRouteState] = useState<RouteState>({
    start: null,
    destination: null,
    current: null,
    routes: [],
    selectedRouteIndex: 0
  });

  return (
    <div className="flex flex-col h-screen bg-white text-slate-900 font-sans">
      <Header />
      
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Search & Results Panel */}
        <ErrorBoundary>
          <SearchPanel 
            routeState={routeState} 
            setRouteState={setRouteState} 
          />
        </ErrorBoundary>
        
        {/* Map Visualization Area */}
        <AppMap 
          routeState={routeState}
          setRouteState={setRouteState}
        />
      </main>
    </div>
  );
}

