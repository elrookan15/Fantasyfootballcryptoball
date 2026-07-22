
import React, { useState, useEffect } from 'react';
import { MOCK_MARKET_DATA, MOCK_SCORE_METRICS } from '../constants';
import { searchGroundingFast } from '../services/geminiService';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const CryptoHub: React.FC = () => {
  const [news, setNews] = useState<{ text: string; sources: any[] } | null>(null);
  const [loadingNews, setLoadingNews] = useState(false);
  const [burnPulse, setBurnPulse] = useState(false);

  // Mock data for the burn chart
  const burnChartData = [
    { time: '01:00', burned: 1200 },
    { time: '04:00', burned: 2100 },
    { time: '08:00', burned: 1800 },
    { time: '12:00', burned: 4500 },
    { time: '16:00', burned: 3200 },
    { time: '20:00', burned: 5100 },
    { time: '23:59', burned: MOCK_SCORE_METRICS.lastBurnAmount },
  ];

  useEffect(() => {
    fetchHotNews();
    const pulseInterval = setInterval(() => {
      setBurnPulse(prev => !prev);
    }, 3000);
    return () => clearInterval(pulseInterval);
  }, []);

  const fetchHotNews = async () => {
    setNews(null);
    setLoadingNews(true);
    try {
      const query = `Provide a curated list of the top 5 most critical real-time cryptocurrency news headlines and market trends for today. Focus on institutional moves and major price catalysts. Keep descriptions punchy.`;
      const res = await searchGroundingFast(query);
      setNews(res);
    } catch (e) {
      console.error(e);
    }
    setLoadingNews(false);
  };

  return (
    <div className="grid grid-cols-12 gap-6 h-full animate-in fade-in duration-1000 pb-10 overflow-y-auto custom-scroll pr-2">
      
      {/* LEFT: DEFLATION ENGINE & BIG BOARD (8/12) */}
      <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">
        
        {/* DEFLATIONARY ENGINE HUD - Visualizing the Burn Mechanism */}
        <div className="hologram-panel p-8 border-red-500/30 relative overflow-hidden bg-red-500/5">
          <div className="corner-tl border-red-500"></div>
          <div className="absolute top-0 right-0 p-6 flex flex-col items-end">
             <div className={`w-4 h-4 rounded-full ${burnPulse ? 'bg-red-500 shadow-[0_0_20px_rgba(255,0,0,1)]' : 'bg-red-900'} transition-all duration-1000 mb-2`}></div>
             <span className="text-[8px] font-mono text-red-500 font-black animate-pulse uppercase tracking-[0.2em]">CORE_BURN_ACTIVE</span>
          </div>
          
          <div className="flex justify-between items-start mb-10">
            <div>
              <h2 className="text-2xl font-black uppercase text-red-500 tracking-[0.4em] mb-2 drop-shadow-[0_0_10px_rgba(255,0,0,0.4)]">DEFLATION_PROTOCOL // $SCORE</h2>
              <p className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.3em] max-w-lg leading-relaxed">
                Mechanical Contraction active. 15% of all DFS contest rake is automatically converted to $SCORE and removed from circulation.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
            <div className="p-6 bg-red-500/10 border-l-4 border-red-500 shadow-inner">
               <p className="text-[10px] font-mono text-red-300 uppercase mb-2 tracking-widest">Aggregate_Burned</p>
               <p className="text-3xl font-black text-white tracking-tighter">{MOCK_SCORE_METRICS.totalBurned.toLocaleString()}</p>
               <p className="text-[9px] text-red-500 font-bold mt-2">$SCORE_REMOVED</p>
            </div>
            <div className="p-6 bg-slate-900 border border-slate-800">
               <p className="text-[10px] font-mono text-slate-500 uppercase mb-2 tracking-widest">Active_Supply</p>
               <p className="text-3xl font-black text-white tracking-tighter">{(MOCK_SCORE_METRICS.totalSupply - MOCK_SCORE_METRICS.totalBurned).toLocaleString()}</p>
               <p className="text-[9px] text-slate-600 font-bold mt-2">REAL_TIME_NODE</p>
            </div>
            <div className="p-6 bg-red-500/10 border-r-4 border-red-500 text-right">
               <p className="text-[10px] font-mono text-red-300 uppercase mb-2 tracking-widest">Neural_Buyback</p>
               <p className="text-3xl font-black text-red-400 animate-pulse tracking-tighter">-{MOCK_SCORE_METRICS.lastBurnAmount.toLocaleString()}</p>
               <p className="text-[9px] text-red-500 font-bold mt-2">LAST_24H_CYCLE</p>
            </div>
          </div>

          {/* Burn Trend Chart */}
          <div className="h-48 w-full mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={burnChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#300" vertical={false} />
                <XAxis dataKey="time" stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1a0000', border: '1px solid #ff0000', borderRadius: '4px' }}
                  itemStyle={{ color: '#ff4444' }}
                />
                <Line type="monotone" dataKey="burned" stroke="#ff0000" strokeWidth={3} dot={{ r: 4, fill: '#ff0000', strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="w-full h-2 bg-slate-900 relative rounded-full">
             <div className="absolute h-full bg-red-600 shadow-[0_0_15px_rgba(255,0,0,0.8)] transition-all duration-2000 rounded-full" style={{ width: `${(MOCK_SCORE_METRICS.totalBurned / MOCK_SCORE_METRICS.totalSupply) * 100}%` }}></div>
          </div>
          <div className="flex justify-between mt-3 font-mono text-[9px] text-slate-600 uppercase tracking-[0.2em]">
             <span>Genesis_Supply: {MOCK_SCORE_METRICS.totalSupply.toLocaleString()}</span>
             <span className="text-red-500 font-black">CONTRACTION_INDEX: {((MOCK_SCORE_METRICS.totalBurned / MOCK_SCORE_METRICS.totalSupply) * 100).toFixed(2)}%</span>
          </div>
        </div>

        {/* Big Board */}
        <div className="hologram-panel p-6 border-orange-500/30">
          <div className="corner-tl border-orange-500"></div>
          <div className="flex justify-between items-center mb-8 border-b border-orange-500/20 pb-4">
            <h2 className="text-sm font-black uppercase text-orange-400 tracking-[0.4em]">CRYPTO_BIG_BOARD // MARKET_NODES</h2>
            <div className="flex gap-4 mono text-[9px] text-slate-500 uppercase tracking-widest">
              <span className="text-green-400">MCAP: $3.2T</span>
              <span className="text-cyan-400">VOL_24H: $142B</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase text-green-400 tracking-widest border-l-4 border-green-500 pl-3">Neural_Risers</h3>
              <div className="space-y-2">
                {MOCK_MARKET_DATA.risers.map((coin, i) => (
                  <div key={i} className="flex justify-between items-center p-4 bg-slate-900/50 border border-slate-800 hover:border-green-500/40 transition-all group">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-black text-white group-hover:text-green-400 transition-colors">{coin.ticker}</span>
                      <span className="mono text-[10px] text-slate-500">{coin.price}</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <span className="text-green-400 font-black text-xs">{coin.change}</span>
                       <span className="text-green-500 text-[10px] animate-bounce">▲</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase text-red-400 tracking-widest border-l-4 border-red-500 pl-3">Market_Retractions</h3>
              <div className="space-y-2">
                {MOCK_MARKET_DATA.losers.map((coin, i) => (
                  <div key={i} className="flex justify-between items-center p-4 bg-slate-900/50 border border-slate-800 hover:border-red-500/40 transition-all group">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-black text-white group-hover:text-red-400 transition-colors">{coin.ticker}</span>
                      <span className="mono text-[10px] text-slate-500">{coin.price}</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <span className="text-red-400 font-black text-xs">{coin.change}</span>
                       <span className="text-red-500 text-[10px]">▼</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT SIDEBAR (4/12) */}
      <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
        
        {/* WALLET ASSETS */}
        <div className="hologram-panel p-8 border-orange-500/30 relative bg-orange-500/5">
          <div className="corner-tr border-orange-400"></div>
          <h2 className="text-sm font-black uppercase text-orange-400 tracking-widest mb-6 border-b border-orange-500/20 pb-4">VAULT_INVENTORY</h2>
          <div className="space-y-6">
            <div className="text-center p-8 bg-black/60 border-2 border-orange-500/20 rounded-lg shadow-xl">
               <p className="mono text-[10px] text-slate-500 uppercase mb-2 tracking-[0.3em]">Total_Value_USD</p>
               <p className="text-5xl font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">$12,845.20</p>
               <div className="flex items-center justify-center gap-2 mt-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                  <p className="text-[10px] text-green-400 font-black tracking-widest uppercase">+12.5% PERFORMANCE</p>
               </div>
            </div>
            
            <div className="space-y-4">
               {[
                 { label: 'ETHEREUM', value: '1.245 ETH', usd: '$4,793', icon: '💎' },
                 { label: 'SOLANA', value: '42.5 SOL', usd: '$10,412', icon: '⚡' },
                 { label: 'SCORE_TOKEN', value: '85,420 $SCORE', usd: '$35,876', icon: '🔥' }
               ].map((asset, i) => (
                 <div key={i} className="p-4 border border-slate-800 bg-slate-900/80 flex justify-between items-center hover:border-orange-500/50 transition-all cursor-pointer">
                    <div className="flex items-center gap-4">
                       <span className="text-xl">{asset.icon}</span>
                       <div>
                          <p className="text-[11px] font-black text-white uppercase tracking-wider">{asset.label}</p>
                          <p className="mono text-[9px] text-slate-500 uppercase">{asset.value}</p>
                       </div>
                    </div>
                    <p className="mono text-xs text-orange-400 font-bold">{asset.usd}</p>
                 </div>
               ))}
            </div>

            <button className="w-full py-5 bg-orange-600 text-white font-black uppercase tracking-[0.4em] text-xs hover:bg-white hover:text-orange-600 transition-all shadow-lg">
              SYNC_WITH_METAMASK
            </button>
          </div>
        </div>

        {/* NEURAL NEWS FEED (FLASH LITE) */}
        <div className="hologram-panel flex-1 p-8 border-pink-500/30 bg-pink-500/5">
          <div className="flex justify-between items-center mb-8 border-b border-pink-500/20 pb-4">
            <div>
              <h2 className="text-sm font-black uppercase text-pink-500 tracking-widest">AETHER_ORACLE_FEED</h2>
              <p className="text-[8px] font-mono text-slate-600 uppercase mt-1">Grounded via Flash_Lite_L3</p>
            </div>
            <button onClick={fetchHotNews} className="p-2 border border-pink-500/30 text-pink-500 hover:bg-pink-500 hover:text-white transition-all rounded">
              <span className="text-xs">🔄</span>
            </button>
          </div>

          {loadingNews ? (
             <div className="py-20 flex flex-col items-center gap-6">
               <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(255,0,255,0.4)]"></div>
               <p className="mono text-[10px] text-pink-500 uppercase font-black tracking-[0.3em] animate-pulse">Establishing_Neural_Link...</p>
             </div>
          ) : news ? (
            <div className="space-y-8 animate-in fade-in duration-1000">
               <div className="text-[11px] leading-relaxed text-slate-300 bg-black/40 p-6 border-l-4 border-pink-500 font-mono italic whitespace-pre-wrap shadow-inner">
                 {news.text}
               </div>
               
               <div className="space-y-4">
                 <p className="text-[10px] mono text-slate-500 uppercase tracking-widest">Verification_Nodes:</p>
                 <div className="grid grid-cols-1 gap-3">
                   {news.sources?.slice(0, 3).map((source: any, i: number) => {
                     const uri = source.web?.uri || source.maps?.uri;
                     const title = source.web?.title || source.maps?.title || "Data Link";
                     if (!uri) return null;
                     return (
                       <a 
                         key={i} 
                         href={uri} 
                         target="_blank" 
                         rel="noopener noreferrer" 
                         className="flex items-center justify-between p-3 bg-slate-900/80 border border-slate-800 hover:border-cyan-500 transition-all group overflow-hidden"
                       >
                         <span className="text-[9px] text-cyan-400 uppercase font-black truncate max-w-[200px]">
                           {title}
                         </span>
                         <span className="text-[9px] text-slate-700 mono group-hover:text-white transition-colors">LINK_0{i+1}</span>
                       </a>
                     );
                   })}
                 </div>
               </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full opacity-20 py-20">
               <span className="text-4xl mb-4">📡</span>
               <p className="mono text-[10px] uppercase tracking-[0.4em]">Signal_Offline</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default CryptoHub;
