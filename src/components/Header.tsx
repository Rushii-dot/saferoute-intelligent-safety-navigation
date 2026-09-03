import React from 'react';
import { Shield, Navigation } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="h-16 border-b border-slate-200 bg-white flex items-center px-6 sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <div className="bg-indigo-600 p-2 rounded-lg text-white">
          <Shield size={24} strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-none">SafeRoute</h1>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-500 mt-0.5">
            Intelligent Safety Navigation
          </p>
        </div>
      </div>
      
      <div className="ml-auto hidden sm:flex items-center gap-6">
        <nav className="flex items-center gap-4 text-sm font-medium text-slate-600">
          <a href="#" className="hover:text-indigo-600 transition-colors">Safety Dashboard</a>
          <a href="#" className="hover:text-indigo-600 transition-colors">Emergency Info</a>
        </nav>
        <button className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-2 rounded-full text-sm font-semibold hover:bg-indigo-100 transition-colors border border-indigo-100">
          <Navigation size={14} />
          Plan Trip
        </button>
      </div>
    </header>
  );
};
