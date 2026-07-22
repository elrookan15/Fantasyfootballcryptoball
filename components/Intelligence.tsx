
import React, { useState } from 'react';
import { searchGrounding, mapsGrounding, searchGroundingPro } from '../services/geminiService';

const Intelligence: React.FC = () => {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'search' | 'maps'>('search');
  const [deepThink, setDeepThink] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ text: string; sources: any[] } | null>(null);

  const handleExecute = async () => {
    if (!query) return;
    setLoading(true);
    try {
      let res;
      if (type === 'search') {
        if (deepThink) {
          res = await searchGroundingPro(query);
        } else {
          res = await searchGrounding(query);
        }
      } else {
        const pos = await new Promise<GeolocationPosition>((resolve) => navigator.geolocation.getCurrentPosition(resolve));
        res = await mapsGrounding(query, pos.coords.latitude, pos.coords.longitude);
      }
      setResult(res);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div className="hologram-panel p-10 border-cyan-500/20 mb-10">
      {/* Search Mode Buttons matching screenshot */}
      <div className="flex gap-4 mb-8">
        <button 
          onClick={() => setType('search')} 
          className={`px-10 py-3 text-[12px] font-black uppercase border-2 tracking-[0.2em] transition-all duration-300 ${type === 'search' ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10 shadow-[0_0_20px_rgba(0,242,255,0.1)]' : 'border-slate-800 text-slate-600 hover:border-slate-600'}`}
        >
          SEARCH_NET
        </button>
        <button 
          onClick={() => setType('maps')} 
          className={`px-10 py-3 text-[12px] font-black uppercase border-2 tracking-[0.2em] transition-all duration-300 ${type === 'maps' ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10 shadow-[0_0_20px_rgba(0,242,255,0.1)]' : 'border-slate-800 text-slate-600 hover:border-slate-600'}`}
        >
          MAP_GEO
        </button>
        
        {type === 'search' && (
          <button 
            onClick={() => setDeepThink(!deepThink)}
            className={`flex items-center gap-3 px-6 py-2 border-2 transition-all ml-auto ${deepThink ? 'border-pink-500 text-pink-500 bg-pink-500/10' : 'border-slate-800 text-slate-500'}`}
          >
            <div className={`w-2 h-2 rounded-full ${deepThink ? 'bg-pink-500 animate-pulse' : 'bg-slate-700'}`}></div>
            <span className="text-[10px] font-black uppercase tracking-widest">DEEP_THINK</span>
          </button>
        )}
      </div>

      {/* Command Input Area */}
      <div className="flex gap-4 items-stretch h-20">
        <div className="flex-1 relative h-full">
          <input 
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={`QUERY_THE_${type.toUpperCase()}...`}
            className="w-full h-full bg-[#0d1117]/80 border border-slate-800 px-8 text-sm font-mono text-[#00f2ff] focus:outline-none focus:border-[#00f2ff]/50 tracking-[0.2em] placeholder:text-slate-700 transition-all uppercase"
            onKeyDown={(e) => e.key === 'Enter' && handleExecute()}
          />
        </div>
        <button 
          onClick={handleExecute} 
          disabled={loading} 
          className="bg-[#00f2ff] px-14 font-black uppercase text-[14px] tracking-[0.4em] text-black hover:bg-white hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] transition-all duration-300 disabled:opacity-50 min-w-[200px]"
        >
          {loading ? 'WAITING...' : 'EXECUTE'}
        </button>
      </div>

      {/* Results Rendering */}
      {result && (
        <div className="mt-10 space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 border-t border-slate-800/50 pt-10">
          <div className="p-8 bg-[#00f2ff]/5 border-l-4 border-[#00f2ff] text-sm leading-relaxed text-slate-300 font-mono tracking-wide">
            <span className="text-[10px] text-[#00f2ff] mb-3 block font-black uppercase tracking-[0.3em]">NEURAL_DECRYPTION_SUCCESS:</span>
            {result.text}
          </div>
          <div className="space-y-4">
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.4em]">VERIFICATION_NODES:</p>
            <div className="flex flex-wrap gap-4">
              {result.sources?.map((chunk: any, i: number) => {
                const uri = chunk.web?.uri || chunk.maps?.uri;
                const title = chunk.web?.title || chunk.maps?.title;
                if (!uri) return null;
                return (
                  <a key={i} href={uri} target="_blank" rel="noopener noreferrer" className="text-[10px] bg-slate-900 px-5 py-3 border border-slate-800 hover:border-cyan-500 text-cyan-400 font-mono tracking-widest transition-all">
                    {title || `NODE_LINK_0${i+1}`}
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Intelligence;
