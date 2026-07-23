
import React, { useState, useEffect } from 'react';
import { 
  LineChart, 
  Line, 
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { MOCK_MARKET_DATA } from '../constants';
import { searchGroundingFast } from '../services/geminiService';

const PERFORMANCE_DATA = [
  { week: 'WK1', p_mahomes: 24.5, j_jefferson: 18.2, c_mccaffrey: 31.4 },
  { week: 'WK2', p_mahomes: 18.9, j_jefferson: 22.4, c_mccaffrey: 28.1 },
  { week: 'WK3', p_mahomes: 32.1, j_jefferson: 15.6, c_mccaffrey: 25.8 },
  { week: 'WK4', p_mahomes: 28.4, j_jefferson: 29.1, c_mccaffrey: 19.5 },
  { week: 'WK5', p_mahomes: 21.0, j_jefferson: 34.5, c_mccaffrey: 22.7 },
  { week: 'WK6', p_mahomes: 27.6, j_jefferson: 12.4, c_mccaffrey: 29.3 },
  { week: 'WK7', p_mahomes: 19.8, j_jefferson: 21.8, c_mccaffrey: 35.2 },
];

const LEAGUE_TREND_DATA = [
  { day: 'MON', volume: 1.2, prizePool: 24.5 },
  { day: 'TUE', volume: 2.3, prizePool: 26.1 },
  { day: 'WED', volume: 1.8, prizePool: 28.9 },
  { day: 'THU', volume: 4.5, prizePool: 35.8 },
  { day: 'FRI', volume: 3.1, prizePool: 41.2 },
  { day: 'SAT', volume: 6.8, prizePool: 48.7 },
  { day: 'SUN', volume: 8.5, prizePool: 59.4 },
];

const WALLET_REWARDS_DATA = [
  { time: '10:00', rewards: 120, performance: 1000 },
  { time: '11:00', rewards: 250, performance: 1050 },
  { time: '12:00', rewards: 410, performance: 1120 },
  { time: '13:00', rewards: 380, performance: 1080 },
  { time: '14:00', rewards: 512, performance: 1200 },
  { time: '15:00', rewards: 680, performance: 1250 },
  { time: '16:00', rewards: 890, performance: 1400 },
];

const Dashboard: React.FC<{ setActiveTab: (t: string) => void }> = ({ setActiveTab }) => {
  const [news, setNews] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchNews = async () => {
      setLoading(true);
      try {
        const res = await searchGroundingFast("Top fantasy sports and crypto market news for today.");
        setNews(res);
      } catch (err) {
        console.error("Failed to fetch market news feed:", err);
        setNews(null);
      } finally {
        setLoading(false);
      }
    };
    fetchNews();
  }, []);

  return (
    <div className="flex flex-col gap-8 h-full pb-10 overflow-y-auto custom-scroll pr-2 animate-in fade-in duration-1000">
      
      {/* Header Stat Strip */}
      <div className="flex justify-between items-center bg-slate-900/40 p-6 border border-cyan-500/20 rounded-lg">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-cyan-500/20 border border-cyan-500 flex items-center justify-center text-xl">👤</div>
          <div>
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Operator_Verified</p>
            <p className="text-lg font-black text-white uppercase tracking-tight">0x8a2f...9e21</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Total_Account_Value</p>
          <p className="text-3xl font-black text-[#00f2ff] drop-shadow-[0_0_10px_rgba(0,242,255,0.3)]">$12,845.20</p>
        </div>
      </div>

      {/* Telemetry and League Trends Section */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        
        {/* Telemetry Chart Section */}
        <div className="hologram-panel p-6 border-[#ff00ff]/20">
          <div className="corner-tl border-[#ff00ff]"></div>
          <h2 className="text-sm font-black uppercase text-[#ff00ff] tracking-[0.4em] mb-6">PLAYER_PERFORMANCE_TELEMETRY (PTS)</h2>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={PERFORMANCE_DATA} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="week" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#010409', border: '1px solid #1e293b', fontFamily: 'JetBrains Mono', fontSize: '10px', color: '#e2e8f0', borderRadius: '4px' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                />
                <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'JetBrains Mono', color: '#cbd5e1' }} />
                <Line type="monotone" dataKey="p_mahomes" name="P. Mahomes" stroke="#00f2ff" strokeWidth={2} dot={{ r: 4, fill: '#010409', strokeWidth: 2, stroke: '#00f2ff' }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="j_jefferson" name="J. Jefferson" stroke="#ff00ff" strokeWidth={2} dot={{ r: 4, fill: '#010409', strokeWidth: 2, stroke: '#ff00ff' }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="c_mccaffrey" name="C. McCaffrey" stroke="#39ff14" strokeWidth={2} dot={{ r: 4, fill: '#010409', strokeWidth: 2, stroke: '#39ff14' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* League Trends Section */}
        <div className="hologram-panel p-6 border-[#39ff14]/20">
          <div className="corner-tl border-[#39ff14]"></div>
          <h2 className="text-sm font-black uppercase text-[#39ff14] tracking-[0.4em] mb-6">GLOBAL_LEAGUE_LIQUIDITY (VOL vs POOL)</h2>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={LEAGUE_TREND_DATA} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="day" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                <YAxis yAxisId="left" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                <YAxis yAxisId="right" orientation="right" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#010409', border: '1px solid #1e293b', fontFamily: 'JetBrains Mono', fontSize: '10px', color: '#e2e8f0', borderRadius: '4px' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                />
                <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'JetBrains Mono', color: '#cbd5e1' }} />
                <Bar yAxisId="left" dataKey="volume" name="Tx Volume (M)" fill="#00f2ff" radius={[2, 2, 0, 0]} />
                <Bar yAxisId="right" dataKey="prizePool" name="Prize Pool (K)" fill="#39ff14" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Market Movers Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Risers */}
        <div className="hologram-panel p-6 border-green-500/20">
          <div className="corner-tl border-green-500"></div>
          <h2 className="text-sm font-black uppercase text-green-400 tracking-[0.4em] mb-6">TOP_25_RISERS</h2>
          <div className="space-y-3">
            {MOCK_MARKET_DATA.risers.map((coin, i) => (
              <div key={i} className="flex justify-between items-center p-3 bg-slate-900/60 border border-slate-800 hover:border-green-500/40 transition-all">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-white">{coin.ticker}</span>
                  <span className="font-mono text-[9px] text-slate-500">{coin.price}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-400 font-bold text-xs">{coin.change}</span>
                  <span className="text-green-500 text-[10px]">▲</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 h-12 w-full bg-green-500/5 relative overflow-hidden border-t border-green-500/20">
            <div className="absolute inset-0 flex items-end">
               <div className="w-full h-1/2 bg-gradient-to-t from-green-500/20 to-transparent"></div>
               <svg className="w-full h-full text-green-500/40" viewBox="0 0 100 10" preserveAspectRatio="none">
                 <path d="M0 10 L10 8 L20 9 L30 5 L40 7 L50 4 L60 6 L70 3 L80 5 L90 2 L100 1" stroke="currentColor" fill="none" strokeWidth="1" />
               </svg>
            </div>
          </div>
        </div>

        {/* Losers */}
        <div className="hologram-panel p-6 border-red-500/20">
          <div className="corner-tl border-red-500"></div>
          <h2 className="text-sm font-black uppercase text-red-400 tracking-[0.4em] mb-6">TOP_25_LOSERS</h2>
          <div className="space-y-3">
            {MOCK_MARKET_DATA.losers.map((coin, i) => (
              <div key={i} className="flex justify-between items-center p-3 bg-slate-900/60 border border-slate-800 hover:border-red-500/40 transition-all">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-white">{coin.ticker}</span>
                  <span className="font-mono text-[9px] text-slate-500">{coin.price}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-red-400 font-bold text-xs">{coin.change}</span>
                  <span className="text-red-500 text-[10px]">▼</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 h-12 w-full bg-red-500/5 relative overflow-hidden border-t border-red-500/20">
            <div className="absolute inset-0 flex items-end">
               <div className="w-full h-1/2 bg-gradient-to-t from-red-500/20 to-transparent"></div>
               <svg className="w-full h-full text-red-500/40" viewBox="0 0 100 10" preserveAspectRatio="none">
                 <path d="M0 1 L10 3 L20 2 L30 5 L40 4 L50 7 L60 5 L70 8 L80 6 L90 9 L100 10" stroke="currentColor" fill="none" strokeWidth="1" />
               </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Wallet & News */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="hologram-panel p-6 border-cyan-500/20">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-sm font-black uppercase text-cyan-400 tracking-[0.4em]">MY_WALLET_&_REWARDS</h2>
          </div>
          
          {/* External Crypto Integrations */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
            {['Coinbase', 'Kraken', 'MetaMask', 'Webull', 'BTCC'].map((wallet) => (
              <button key={wallet} className="flex flex-col items-center justify-center py-3 border border-slate-800 bg-slate-900/60 hover:bg-cyan-500/10 hover:border-cyan-500/40 transition-colors">
                <span className="text-[9px] uppercase font-black tracking-widest text-slate-300">{wallet}</span>
              </button>
            ))}
          </div>

          <div className="h-[200px] w-full mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={WALLET_REWARDS_DATA} margin={{ top: 5, right: 0, bottom: 5, left: -20 }}>
                <defs>
                  <linearGradient id="colorRewards" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00f2ff" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#00f2ff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#010409', border: '1px solid #1e293b', fontFamily: 'JetBrains Mono', fontSize: '10px', color: '#e2e8f0', borderRadius: '4px' }}
                />
                <Area type="monotone" dataKey="rewards" name="Total Rewards ($)" stroke="#00f2ff" fillOpacity={1} fill="url(#colorRewards)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-4">
            {[
              { label: 'ETHEREUM', value: '1.245 ETH', usd: '$4,793' },
              { label: 'SOLANA', value: '42.5 SOL', usd: '$10,412' },
              { label: 'SCORE_TOKEN', value: '85,420 $SCORE', usd: '$35,876' }
            ].map((asset, i) => (
              <div key={i} className="flex justify-between items-center p-4 border border-slate-800 bg-slate-900/50">
                <div>
                  <p className="text-[10px] font-black text-white uppercase">{asset.label}</p>
                  <p className="font-mono text-[9px] text-slate-500">{asset.value}</p>
                </div>
                <p className="font-mono text-sm text-cyan-400 font-bold">{asset.usd}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="hologram-panel p-6 border-orange-500/20">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-sm font-black uppercase text-orange-400 tracking-[0.4em]">NEURAL_NEWS_FEED</h2>
          </div>
          <div className="h-48 overflow-y-auto custom-scroll pr-4">
            {news ? (
              <div className="text-[10px] leading-relaxed text-slate-400 font-mono italic whitespace-pre-wrap">
                {news.text}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full opacity-30 font-mono text-[10px] uppercase">Awaiting Uplink...</div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="mt-4 flex gap-4">
        <button 
          onClick={() => setActiveTab('lobby')}
          className="flex-1 py-5 bg-[#00f2ff] text-black font-black uppercase tracking-[0.5em] text-sm hover:bg-white hover:shadow-[0_0_30px_rgba(0,242,255,0.4)] transition-all duration-300"
        >
          CREATE_NEW_DRAFT
        </button>
        <button className="w-20 bg-slate-900 border border-slate-800 text-2xl flex items-center justify-center hover:bg-slate-800 transition-colors">
          ➕
        </button>
      </div>

    </div>
  );
};

export default Dashboard;
