import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

// --- Types ---

type City = 'Dubai' | 'Sharjah' | 'Abu Dhabi';
type Theme = 'dark' | 'light';

interface Restaurant {
  name: string;
  rating: number;
  reviewCount: number;
  priceLevel: string; // $, $$, $$$
  cuisine: string;
  address: string;
  lat?: number;
  lng?: number;
  phoneNumber?: string;
  aiSummary: string;
  likelyAggregators: string[];
}

interface LocationState {
  lat: number;
  lng: number;
  usingGPS: boolean;
}

// --- Icons ---

const ShawarmaIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    {/* Wrap Body */}
    <path d="M7 18a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7Z" transform="rotate(-45 12 12)" />
    {/* Grill Marks */}
    <path d="M8.5 14.5l3-3" transform="rotate(-45 12 12)" />
    <path d="M8.5 11.5l5 5" transform="rotate(-45 12 12)" />
    <path d="M11.5 8.5l3 3" transform="rotate(-45 12 12)" />
    <path d="M12.5 15.5l2-2" transform="rotate(-45 12 12)" />
    {/* Filling / Lettuce Top */}
    <path d="M16 5c0-1.5 1.5-2 2-1s2 1 2 2-1 2-2 2" />
    <path d="M19 6c1.5 0 2.5-1 3.5 0" />
    <path d="M14 7c-1-1-1-2.5 0-3.5" />
    <path d="M17 3c1-1 2.5 0 3 1" />
  </svg>
);

// --- Configuration ---

const CUISINES = [
  { name: "Trending", icon: "fa-fire" },
  { name: "Turkish", icon: "fa-utensils" },
  { name: "Shawarma", icon: "custom-shawarma" }, 
  { name: "Mandi", icon: "fa-bowl-rice" },
  { name: "Chinese", icon: "fa-bowl-food" },
  { name: "Burgers", icon: "fa-burger" },
  { name: "Sushi", icon: "fa-fish" },
  { name: "Italian", icon: "fa-pizza-slice" },
  { name: "Indian", icon: "fa-pepper-hot" },
  { name: "Coffee", icon: "fa-mug-hot" },
  { name: "Healthy", icon: "fa-leaf" },
  { name: "Dessert", icon: "fa-ice-cream" }
];

const CITIES: City[] = ['Dubai', 'Abu Dhabi', 'Sharjah'];

// --- Gemini Service ---

const fetchRecommendations = async (
  location: LocationState, 
  city: City, 
  cuisine: string,
  customQuery: string
): Promise<Restaurant[]> => {
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  let retrievalConfig = undefined;

  const jsonInstruction = `
  Output strictly a valid JSON array. Do not include any markdown formatting.
  [
    {
      "name": "Name",
      "rating": 4.5,
      "reviewCount": 120,
      "priceLevel": "$$",
      "cuisine": "Cuisine",
      "address": "Full address here",
      "lat": 25.1234,
      "lng": 55.1234,
      "phoneNumber": "+971 4 123 4567",
      "aiSummary": "10 words max on why it's good.",
      "likelyAggregators": ["Talabat", "Deliveroo"]
    }
  ]
  `;

  // Determine query
  let queryTerm = "";
  if (cuisine === 'Trending') {
    queryTerm = 'popular trending restaurants';
  } else if (cuisine === 'Chinese') {
    queryTerm = 'Chinese restaurants, including options in Motor City, Sports City, and Dubai Production City. Also include popular Fusion Chinese (Indo-Chinese) spots.';
  } else {
    queryTerm = `${cuisine} restaurants`;
  }

  // Prioritize custom query if it exists
  const foodQuery = customQuery.trim() !== "" ? customQuery : queryTerm;

  let prompt = "";

  // Requesting 30 distinct places as requested
  if (location.usingGPS) {
    prompt = `Find 30 distinct places matching "${foodQuery}" within a 8km radius of my current location (lat: ${location.lat}, lng: ${location.lng}). 
    Only include places with a rating of 4.0 or higher.
    Analyze reviews to infer availability on delivery apps (Talabat, Deliveroo, Noon, Careem, Smash).
    Find the official phone number for reservations.
    Get the full address.
    Get the precise latitude and longitude for the map.
    Provide a very short, punchy "Concierge Verdict" on why I should eat here.
    ${jsonInstruction}`;
    
    retrievalConfig = {
      latLng: {
        latitude: location.lat,
        longitude: location.lng
      }
    };
  } else {
    prompt = `Find 30 distinct places matching "${foodQuery}" in ${city}, UAE.
    Only include places with a rating of 4.0 or higher.
    Analyze reviews to infer availability on delivery apps.
    Find the official phone number for reservations.
    Get the full address.
    Get the precise latitude and longitude for the map.
    Provide a very short, punchy "Concierge Verdict".
    ${jsonInstruction}`;
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: retrievalConfig ? { retrievalConfig } : undefined,
        systemInstruction: "You are a high-end UAE food concierge. You know the vibe, the price, the phone numbers, the exact location, and the delivery scene."
      }
    });

    let text = response.text;
    if (!text) return [];
    
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    // Sometimes the model might wrap it in text, try to find the array
    const startIndex = text.indexOf('[');
    const endIndex = text.lastIndexOf(']');
    if (startIndex !== -1 && endIndex !== -1) {
      text = text.substring(startIndex, endIndex + 1);
    }

    return JSON.parse(text) as Restaurant[];
  } catch (e) {
    console.error("Gemini Error:", e);
    throw e;
  }
};

// --- Components ---

const Header = ({ theme, toggleTheme }: { theme: Theme, toggleTheme: () => void }) => {
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = () => {
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          setInstallPrompt(null);
        }
      });
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 px-6 py-4 glass-nav flex justify-between items-center transition-all duration-300">
      <div className="flex items-center gap-2 group cursor-pointer">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform duration-300">
          <i className="fa-solid fa-location-arrow text-white text-xs"></i>
        </div>
        <div>
          <h1 className="font-bold text-lg leading-none tracking-tight text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">UAE EATS</h1>
          <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 tracking-widest uppercase">AI Concierge</span>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {installPrompt && (
          <button 
            onClick={handleInstall}
            className="px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300 transition-all flex items-center gap-2 border border-black/5 dark:border-white/5 active:scale-95"
          >
            <i className="fa-solid fa-download"></i> Install
          </button>
        )}
        
        <button 
            onClick={toggleTheme}
            className="w-9 h-9 rounded-lg glass-pill flex items-center justify-center text-slate-600 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/10 hover:scale-105 active:scale-90 transition-all duration-300"
        >
          <i className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'} transition-transform duration-500 ${theme === 'dark' ? 'rotate-90' : 'rotate-0'}`}></i>
        </button>
      </div>
    </div>
  );
};

const CuisineSelector = ({ selected, onSelect }: { selected: string, onSelect: (c: string) => void }) => (
  <div className="w-full px-4 mb-4">
    <div className="grid grid-cols-2 gap-3">
      {CUISINES.map((c) => (
        <button
          key={c.name}
          onClick={() => onSelect(c.name)}
          className={`
            relative flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-300 w-full
            ${selected === c.name 
              ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/30 ring-2 ring-indigo-400/50 dark:ring-indigo-400/30 scale-[1.02]' 
              : 'glass-card text-slate-700 dark:text-slate-200 hover:bg-white/50 dark:hover:bg-white/5 hover:-translate-y-0.5 hover:shadow-md'}
            active:scale-95
          `}
        >
          <div className={`
            w-8 h-8 rounded-full flex items-center justify-center text-sm transition-transform duration-500
            ${selected === c.name ? 'bg-white/20 rotate-12' : 'bg-indigo-50 dark:bg-white/10 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 group-hover:rotate-12'}
          `}>
            {c.icon === 'custom-shawarma' ? (
               <ShawarmaIcon className={`w-4 h-4 ${selected === c.name ? 'text-white' : 'text-indigo-600 dark:text-indigo-400'}`} />
            ) : (
              <i className={`fa-solid ${c.icon}`}></i>
            )}
          </div>
          <span className="truncate">{c.name}</span>
          {selected === c.name && (
            <div className="absolute right-3 w-2 h-2 rounded-full bg-white animate-pulse"></div>
          )}
        </button>
      ))}
    </div>
  </div>
);

const CitySelector = ({ selected, onSelect }: { selected: City, onSelect: (c: City) => void }) => (
  <div className="w-full px-4 mb-6">
    <div className="p-1 bg-black/5 dark:bg-white/5 backdrop-blur-sm rounded-lg flex gap-1">
      {CITIES.map((city) => (
        <button
          key={city}
          onClick={() => onSelect(city)}
          className={`
            flex-1 py-2.5 text-sm font-medium rounded-md transition-all duration-300 relative overflow-hidden
            ${selected === city 
              ? 'bg-white dark:bg-white/10 text-indigo-600 dark:text-white shadow-sm scale-[1.02]' 
              : 'text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white/80 hover:bg-black/5 dark:hover:bg-white/5'}
          `}
        >
          {city}
        </button>
      ))}
    </div>
  </div>
);

const RestaurantCard: React.FC<{ r: Restaurant, index: number }> = ({ r, index }) => {
  const [activeOverlay, setActiveOverlay] = useState<'none' | 'map' | 'order'>('none');

  // Generate map URL (Embedded)
  const mapSrc = r.lat && r.lng 
    ? `https://www.google.com/maps/embed/v1/place?key=${process.env.API_KEY}&q=${r.lat},${r.lng}`
    : '';

  const getPriceLabel = (price: string) => {
    const level = price.length; // $, $$, $$$
    if (level === 1) return 'AED • Budget';
    if (level === 2) return 'AED • Moderate';
    return 'AED • Expensive';
  };

  // Helper for generating aggregator search links (Google Search Fallback is safest)
  const getAggregatorUrl = (platform: string) => {
    const platformQuery = platform === 'Noon' ? 'Noon Food' : platform;
    return `https://www.google.com/search?q=${encodeURIComponent(`${r.name} ${platformQuery} UAE order online`)}`;
  };

  // Default aggregators if none returned by AI
  const aggregators = (r.likelyAggregators && r.likelyAggregators.length > 0) 
    ? r.likelyAggregators 
    : ['Talabat', 'Deliveroo', 'Noon', 'Careem'];

  // Colors for aggregators
  const getBrandColor = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('talabat')) return 'bg-[#ff5a00]';
    if (n.includes('deliveroo')) return 'bg-[#00ccbc]';
    if (n.includes('noon')) return 'bg-[#fee600] text-black';
    if (n.includes('careem')) return 'bg-[#47a23f]';
    if (n.includes('zomato')) return 'bg-[#cb202d]';
    return 'bg-indigo-600';
  };

  return (
    <div 
      className="glass-card rounded-xl p-0 overflow-hidden hover:scale-[1.02] transition-all duration-500 animate-slide-up flex flex-col h-full group relative"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Top Half: Info */}
      <div className="p-4 relative z-10 bg-gradient-to-b from-white/50 to-transparent dark:from-white/5 dark:to-transparent flex-grow">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white leading-tight mb-1">{r.name}</h3>
            <div className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
               <span>{getPriceLabel(r.priceLevel)}</span>
               <span>•</span>
               <span>{r.cuisine}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
             <div className="flex items-center gap-1 bg-yellow-400/20 px-2 py-1 rounded-md border border-yellow-400/30">
              <i className="fa-solid fa-star text-yellow-500 text-[10px]"></i>
              <span className="text-xs font-bold text-yellow-700 dark:text-yellow-400">{r.rating}</span>
            </div>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">({r.reviewCount})</span>
          </div>
        </div>

        <div className="mt-3 mb-3">
          <p className="text-xs text-slate-600 dark:text-slate-300 italic border-l-2 border-indigo-500 pl-3 py-1">
            "{r.aiSummary}"
          </p>
        </div>
        
        <div className="flex flex-col gap-2 mb-3">
            {/* Address */}
           <div className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
             <i className="fa-solid fa-map-pin text-indigo-500 mt-0.5"></i>
             <span className="line-clamp-2">{r.address}</span>
           </div>

           {/* Phone */}
           {r.phoneNumber && (
             <a href={`tel:${r.phoneNumber}`} className="inline-flex items-center gap-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
               <i className="fa-solid fa-phone text-indigo-500"></i> {r.phoneNumber}
             </a>
           )}
        </div>
      </div>

      {/* Actions Footer */}
      <div className="p-3 bg-black/5 dark:bg-black/20 border-t border-black/5 dark:border-white/5 flex gap-2">
         {/* Map Toggle */}
        {r.lat && r.lng && (
          <button 
            onClick={() => setActiveOverlay(activeOverlay === 'map' ? 'none' : 'map')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-2
              ${activeOverlay === 'map' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' 
                : 'bg-white dark:bg-white/10 text-slate-700 dark:text-white hover:bg-indigo-50 dark:hover:bg-white/20'}
            `}
          >
            <i className={`fa-solid ${activeOverlay === 'map' ? 'fa-times' : 'fa-map-location-dot'}`}></i>
            {activeOverlay === 'map' ? 'Close' : 'Map'}
          </button>
        )}
        
        {/* Order Toggle */}
        <button 
            onClick={() => setActiveOverlay(activeOverlay === 'order' ? 'none' : 'order')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-2
              ${activeOverlay === 'order' 
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30' 
                : 'bg-white dark:bg-white/10 text-slate-700 dark:text-white hover:bg-emerald-50 dark:hover:bg-white/20'}
            `}
          >
            <i className={`fa-solid ${activeOverlay === 'order' ? 'fa-times' : 'fa-motorcycle'}`}></i>
            {activeOverlay === 'order' ? 'Close' : 'Order'}
        </button>
      </div>

      {/* Map Overlay */}
      {activeOverlay === 'map' && mapSrc && (
        <div className="absolute inset-0 z-20 bg-slate-100 dark:bg-slate-900 animate-slide-up">
           <iframe
             width="100%"
             height="100%"
             style={{ border: 0 }}
             loading="lazy"
             allowFullScreen
             src={mapSrc}
           ></iframe>
        </div>
      )}

      {/* Order Overlay */}
      {activeOverlay === 'order' && (
        <div className="absolute inset-0 z-20 bg-slate-50 dark:bg-slate-900 p-4 animate-slide-up flex flex-col">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <i className="fa-solid fa-utensils text-emerald-500"></i> Order via
          </h4>
          <div className="grid grid-cols-1 gap-2 overflow-y-auto no-scrollbar">
             {aggregators.map((agg) => (
               <a 
                 key={agg} 
                 href={getAggregatorUrl(agg)}
                 target="_blank" 
                 rel="noopener noreferrer"
                 className={`
                   flex items-center justify-between px-4 py-3 rounded-lg text-white text-xs font-bold uppercase tracking-wider shadow-md hover:scale-[1.02] active:scale-95 transition-all
                   ${getBrandColor(agg)}
                 `}
               >
                 <span>{agg}</span>
                 <i className="fa-solid fa-arrow-up-right-from-square opacity-70"></i>
               </a>
             ))}
          </div>
        </div>
      )}
    </div>
  );
};

const LoadingState = ({ step }: { step: number }) => {
  const steps = [
    "Triangulating your location...",
    "Scanning Google Maps...",
    "Analyzing customer reviews...",
    "Checking delivery availability...",
    "Finalizing top recommendations..."
  ];

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="relative w-20 h-20 mb-6">
        <div className="absolute inset-0 border-4 border-indigo-200 dark:border-indigo-900/50 rounded-full"></div>
        <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
        <i className="fa-solid fa-utensils absolute inset-0 m-auto w-6 h-6 text-indigo-600 flex items-center justify-center animate-pulse"></i>
      </div>
      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 animate-pulse">{steps[step % steps.length]}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400">Powered by Gemini 2.5 Flash</p>
    </div>
  );
};

// --- Main App ---

const App = () => {
  const [location, setLocation] = useState<LocationState>({ lat: 0, lng: 0, usingGPS: false });
  const [city, setCity] = useState<City>('Dubai');
  const [cuisine, setCuisine] = useState<string>('Trending');
  const [customQuery, setCustomQuery] = useState<string>("");
  const [results, setResults] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>('dark');

  // Theme Effect
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  // Loading Steps Effect
  useEffect(() => {
    let interval: any;
    if (loading) {
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep(s => (s + 1) % 5);
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const executeSearch = async (loc: LocationState, selectedCity: City, selectedCuisine: string, query: string) => {
    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const data = await fetchRecommendations(loc, selectedCity, selectedCuisine, query);
      setResults(data);
      if (data.length === 0) {
        setError("No restaurants found. Try a different area or cuisine.");
      }
    } catch (err) {
      setError("AI is busy analyzing tasty food. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    executeSearch(location, city, cuisine, customQuery);
  };

  const handleGPSRequest = () => {
    if (navigator.geolocation) {
      setLoading(true); // Show loading immediately
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLoc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            usingGPS: true
          };
          setLocation(newLoc);
          // Automatically trigger search after getting location
          executeSearch(newLoc, city, cuisine, customQuery);
        },
        (err) => {
          console.error(err);
          setError("Could not access location. Please check permissions.");
          setLoading(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setError("Geolocation is not supported by this browser.");
    }
  };

  const handleCuisineSelect = (c: string) => {
    setCuisine(c);
    setCustomQuery(""); // Clear custom search if category is picked
  };

  return (
    <div className="min-h-screen pt-20 pb-10 px-4 flex flex-col items-center relative z-10">
      <Header theme={theme} toggleTheme={toggleTheme} />

      <div className="w-full max-w-7xl mx-auto">
        {/* Controls Container */}
        <div className="w-full max-w-2xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-8 animate-float">
            <h2 className="text-4xl md:text-5xl font-extrabold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 dark:from-white dark:via-indigo-200 dark:to-indigo-400 drop-shadow-sm py-1">
              Uncover the Finest Flavors in UAE
            </h2>
            <p className="text-slate-600 dark:text-slate-300 font-medium text-sm md:text-base">
              Dubai • Abu Dhabi • Sharjah
            </p>
          </div>

          {/* Search Input */}
          <div className="w-full px-4 mb-4">
             <div className="relative group">
               <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                 <i className="fa-solid fa-magnifying-glass text-slate-400 group-focus-within:text-indigo-500 transition-colors"></i>
               </div>
               <input
                 type="text"
                 value={customQuery}
                 onChange={(e) => setCustomQuery(e.target.value)}
                 placeholder="Search specific dish (e.g. 'Matcha Latte') or restaurant..."
                 className="w-full pl-11 pr-4 py-3.5 bg-white/80 dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-xl shadow-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                 onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
               />
             </div>
          </div>

          <CitySelector selected={city} onSelect={(c) => { setCity(c); setLocation({ ...location, usingGPS: false }); }} />
          
          <CuisineSelector selected={cuisine} onSelect={handleCuisineSelect} />

          {/* Main Action Buttons */}
          <div className="w-full px-4 flex flex-col gap-3 mb-8">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-[#ce1126] via-[#00732f] to-black text-white font-bold text-lg shadow-lg shadow-red-900/20 dark:shadow-black/50 hover:shadow-xl hover:scale-[1.02] active:scale-95 transition-all duration-300 animate-pulse-glow disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loading ? <i className="fa-solid fa-circle-notch animate-spin"></i> : <i className="fa-solid fa-utensils"></i>}
                {loading ? 'Consulting AI...' : 'Find Food Nearby'}
              </span>
            </button>

            {!location.usingGPS && (
              <button
                onClick={handleGPSRequest}
                className="w-full py-3 rounded-xl glass-card text-indigo-600 dark:text-indigo-400 font-semibold text-sm hover:bg-indigo-50 dark:hover:bg-white/5 transition-all flex items-center justify-center gap-2"
              >
                <i className="fa-solid fa-location-crosshairs"></i>
                Use my current location instead
              </button>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="w-full max-w-md mx-auto mb-6 p-4 glass-card bg-red-50/50 dark:bg-red-900/20 border-red-200 dark:border-red-500/30 rounded-xl text-center text-red-600 dark:text-red-300 text-sm animate-slide-up">
            <i className="fa-solid fa-circle-exclamation mr-2"></i>
            {error}
          </div>
        )}

        {/* Results Grid */}
        {loading ? (
          <LoadingState step={loadingStep} />
        ) : (
          results.length > 0 && (
            <div className="animate-slide-up">
               <div className="flex items-center gap-3 mb-6 px-4">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Concierge Picks ({results.length})</h3>
                  <div className="h-px flex-grow bg-slate-200 dark:bg-white/10"></div>
               </div>
               <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 px-2">
                {results.map((r, i) => (
                  <RestaurantCard key={i} r={r} index={i} />
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);