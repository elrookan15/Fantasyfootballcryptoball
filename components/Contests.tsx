
import React, { useState, useEffect, useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { MOCK_PLAYERS, STRATEGIES } from '../constants';
import { getAssistantGMSuggestion, analyzeRoster, searchGroundingFast } from '../services/geminiService';
import { Player, Strategy } from '../types';

interface AIRecommendation {
  recommendedPlayerId: string;
  playerName: string;
  confidence: number;
  reasoning: string;
  alignment: string;
}

interface RosterAnalysis {
  rating: number;
  winProbability: number;
  summary: string;
  keyAsset: string;
  vulnerability: string;
}

/**
 * AMM Bonding Curve Logic
 * Player salaries adjust based on real-time demand (ownership).
 * Formula: Price = Base * (1 + (Ownership / 40)^2)
 */
const calculateAMMPrice = (baseSalary: number, ownership: number): number => {
  const curvePower = 2.0; 
  const pivotPoint = 40;  
  const multiplier = 1 + Math.pow(ownership / pivotPoint, curvePower);
  return Math.round(baseSalary * multiplier);
};

const DraftRoom: React.FC<{ setActiveTab: (t: string) => void }> = ({ setActiveTab }) => {
  const [lineup, setLineup] = useState<Player[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy>(STRATEGIES[0]);
  const [aiRecommendation, setAiRecommendation] = useState<AIRecommendation | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalyzingRoster, setIsAnalyzingRoster] = useState(false);
  const [rosterAnalysis, setRosterAnalysis] = useState<RosterAnalysis | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [showStrategyPicker, setShowStrategyPicker] = useState(false);
  const [positionFilter, setPositionFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [byeWeekFilter, setByeWeekFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('PROJ_POINTS_DESC');
  
  const [savedLineups, setSavedLineups] = useState<{ id: string, name: string, players: Player[] }[]>([]);
  const [showSavedLineupsModal, setShowSavedLineupsModal] = useState(false);
  const [newLineupName, setNewLineupName] = useState('');

  const [playerIntel, setPlayerIntel] = useState<{player: Player, intel: string} | null>(null);
  const [isFetchingIntel, setIsFetchingIntel] = useState(false);

  const [activeBoardView, setActiveBoardView] = useState<'MARKET_BOARD' | 'LINEUP_PROJECTIONS' | 'DRAFT_BOARD'>('MARKET_BOARD');
  const [selectedTrendPlayerId, setSelectedTrendPlayerId] = useState<string>('TOTAL_LINEUP');
  
  const [viewingRosterId, setViewingRosterId] = useState<string>('MY_TEAM');
  // Mock Opponent Rosters for visualization
  const MOCK_OPPONENTS = useMemo(() => [
    { id: 'TEAM_ALPHA', name: 'Team Alpha', players: MOCK_PLAYERS.slice(0, 3) },
    { id: 'TEAM_BETA', name: 'Team Beta', players: MOCK_PLAYERS.slice(3, 6) },
    { id: 'TEAM_GAMMA', name: 'Team Gamma', players: MOCK_PLAYERS.slice(6, 9) }
  ], []);

  const ROSTER_LIMITS: Record<string, number> = {
    QB: 2,
    RB: 4,
    WR: 4,
    TE: 2,
    FLEX: 2
  };

  const getPlayerProjectedForDay = (player: Player, day: number): number => {
    const base = player.projVal || player.lastScore || 15;
    // deterministic pseudo-random variation based on player.id and day
    const seed = (parseInt(player.id || '1') * 3 + day * 7) % 11;
    const variation = (seed - 5.5) / 50; // approx -11% to +11% variation
    
    let matchupMultiplier = 1.0;
    if (player.matchupRating === 'FAVORABLE') matchupMultiplier = 1.20;
    else if (player.matchupRating === 'UNFAVORABLE') matchupMultiplier = 0.80;

    return Math.round(base * matchupMultiplier * (1 + variation) * 10) / 10;
  };

  const trendData = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => {
      const dayNum = i + 1;
      const dayLabel = `Day ${dayNum}`;

      if (selectedTrendPlayerId === 'TOTAL_LINEUP') {
        if (lineup.length === 0) {
          return { day: dayLabel, Points: 0, Average: 0 };
        }
        let totalPoints = 0;
        lineup.forEach(p => {
          totalPoints += getPlayerProjectedForDay(p, dayNum);
        });
        totalPoints = Math.round(totalPoints * 10) / 10;
        const baseline = Math.round((lineup.length * 20) * 10) / 10;
        return {
          day: dayLabel,
          Points: totalPoints,
          Average: baseline,
        };
      } else {
        const player = MOCK_PLAYERS.find(p => p.id === selectedTrendPlayerId);
        if (!player) return { day: dayLabel, Points: 0, Average: 0 };
        
        const playerPoints = getPlayerProjectedForDay(player, dayNum);
        return {
          day: dayLabel,
          Points: playerPoints,
          Average: Math.round((player.projVal || player.lastScore || 15) * 10) / 10,
        };
      }
    });
  }, [lineup, selectedTrendPlayerId]);

  const matchupSummary = useMemo(() => {
    let favorable = 0;
    let unfavorable = 0;
    let neutral = 0;
    lineup.forEach(p => {
      if (p.matchupRating === 'FAVORABLE') favorable++;
      else if (p.matchupRating === 'UNFAVORABLE') unfavorable++;
      else neutral++;
    });
    return { favorable, unfavorable, neutral };
  }, [lineup]);

  const fetchPlayerIntel = async (player: Player) => {
    setIsFetchingIntel(true);
    setPlayerIntel({ player, intel: '' });
    try {
       const news = await searchGroundingFast(`Latest fantasy football news, weather, or injury updates for ${player.name} (${player.position}, ${player.team}). Keep it brief and tactical.`);
       setPlayerIntel({ player, intel: news.text });
    } catch(err) {
       setPlayerIntel({ player, intel: "Error fetching data feed." });
    }
    setIsFetchingIntel(false);
  };

  // Compute live AMM prices and market status for the pool
  const playersWithAMM = useMemo(() => {
    return MOCK_PLAYERS.map(p => ({
      ...p,
      ammSalary: calculateAMMPrice(p.salary, p.ownership),
      isChalk: p.ownership >= 45, // Field favorites
      isValue: p.ownership <= 15, // Deep value sleepers
    })).sort((a, b) => b.ammSalary - a.ammSalary);
  }, []);

  const visiblePlayers = useMemo(() => {
    let filtered = playersWithAMM.filter(p => {
      const matchPosition = positionFilter === 'ALL' || p.position === positionFilter;
      const matchBye = byeWeekFilter === 'ALL' || (p.byeWeek !== undefined && p.byeWeek.toString() === byeWeekFilter);
      const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.team.toLowerCase().includes(searchQuery.toLowerCase());
      return matchPosition && matchBye && matchSearch;
    });

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'PROJ_POINTS_DESC':
          return (b.projVal || 0) - (a.projVal || 0);
        case 'PROJ_POINTS_ASC':
          return (a.projVal || 0) - (b.projVal || 0);
        case 'ADP_DESC':
          return (b.adp || 0) - (a.adp || 0);
        case 'ADP_ASC':
          return (a.adp || 0) - (b.adp || 0);
        case 'PRICE_DESC':
          return (b.ammSalary || 0) - (a.ammSalary || 0);
        case 'PRICE_ASC':
          return (a.ammSalary || 0) - (b.ammSalary || 0);
        default:
          return 0;
      }
    });
  }, [playersWithAMM, positionFilter, byeWeekFilter, searchQuery, sortBy]);

  const budget = 120000; 
  const currentCost = lineup.reduce((acc, p) => acc + calculateAMMPrice(p.salary, p.ownership), 0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => (prev <= 0 ? 60 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleDraft = (player: Player) => {
    const ammPrice = calculateAMMPrice(player.salary, player.ownership);
    if (lineup.length >= 8 || currentCost + ammPrice > budget || lineup.find(p => p.id === player.id)) return;
    setLineup([...lineup, player]);
    setAiRecommendation(null);
  };

  const handleRemove = (id: string) => {
    setLineup(lineup.filter(p => p.id !== id));
    setRosterAnalysis(null);
  };

  const handleDragStart = (e: React.DragEvent, player: Player) => {
    e.dataTransfer.setData('playerId', player.id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const playerId = e.dataTransfer.getData('playerId');
    if (playerId) {
      const player = MOCK_PLAYERS.find(p => p.id === playerId);
      if (player) {
         handleDraft(player);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleAnalyzeRoster = async () => {
    setIsAnalyzingRoster(true);
    const result = await analyzeRoster(lineup.map(p => ({ ...p, ammSalary: calculateAMMPrice(p.salary, p.ownership) } as any)));
    setRosterAnalysis(result as RosterAnalysis);
    setIsAnalyzingRoster(false);
  };

  const runAssistantGM = async () => {
    setIsAnalyzing(true);
    const contextPlayers = visiblePlayers
      .filter(p => !lineup.some(lp => lp.id === p.id))
      .map(p => ({ ...p, salary: p.ammSalary }));

    const result = await getAssistantGMSuggestion(
      contextPlayers as any,
      budget - currentCost,
      selectedStrategy,
      lineup.map(p => ({ ...p, salary: calculateAMMPrice(p.salary, p.ownership) })) as any
    );
    if (result) setAiRecommendation(result as AIRecommendation);
    setIsAnalyzing(false);
  };

  const saveCurrentLineup = () => {
    if (!newLineupName.trim()) return;
    setSavedLineups([
      ...savedLineups, 
      { id: Math.random().toString(36).substring(7), name: newLineupName, players: [...lineup] }
    ]);
    setNewLineupName('');
  };

  const loadLineup = (savedLineup: { id: string, name: string, players: Player[] }) => {
    setLineup(savedLineup.players);
    setAiRecommendation(null);
    setRosterAnalysis(null);
    setShowSavedLineupsModal(false);
  };

  const deleteLineup = (id: string) => {
    setSavedLineups(savedLineups.filter(l => l.id !== id));
  };

  return (
    <div className="flex flex-col gap-6 h-full animate-in fade-in duration-700 pb-10 relative">
      
      {/* Top Header Strip */}
      <div className="flex justify-between items-center bg-slate-900/60 p-6 border-b border-cyan-500/20 rounded-t-xl">
         <div className="flex gap-10 items-center">
            <div className="flex flex-col">
               <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">PRIZE_POOL</span>
               <span className="text-2xl font-black text-green-400 uppercase tracking-tighter">3.5 ETH</span>
            </div>
            <div className="h-10 w-px bg-slate-800"></div>
            <div className="flex flex-col">
               <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">DRAFT_STRATEGY</span>
               <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-white uppercase">{selectedStrategy.name}</span>
                  <button 
                    onClick={() => setShowStrategyPicker(!showStrategyPicker)}
                    className="text-[10px] text-cyan-400 border border-cyan-500/30 px-2 py-0.5 hover:bg-cyan-500/10"
                  >
                    CHANGE
                  </button>
               </div>
            </div>
         </div>

         {/* Draft Cycle Sync Timer */}
         <div className="flex flex-col items-center justify-center">
            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-2 animate-pulse">ON_THE_CLOCK // SYNCED</span>
            <div className="flex items-center gap-6">
               <div className="text-right hidden sm:block">
                  <span className="block text-[10px] font-mono text-cyan-400">CURRENT: PICK 1.04</span>
                  <span className="block text-xs font-black text-white uppercase mt-0.5 tracking-wider">TEAM_NEURAL</span>
               </div>
               <div className="relative flex items-center justify-center">
                  <svg className="w-16 h-16 -rotate-90">
                     <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-slate-800/80" />
                     <circle 
                        cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="3" fill="transparent" 
                        className={`${timeLeft <= 10 ? 'text-[#ff00ff] drop-shadow-[0_0_8px_rgba(255,0,255,0.8)]' : 'text-[#00f2ff] drop-shadow-[0_0_8px_rgba(0,242,255,0.6)]'} transition-all duration-1000`}
                        strokeDasharray={176}
                        strokeDashoffset={176 - (176 * timeLeft) / 60}
                     />
                  </svg>
                  <div className={`absolute font-mono text-xl font-black ${timeLeft <= 10 ? 'text-[#ff00ff] animate-pulse' : 'text-white'}`}>{timeLeft}</div>
               </div>
               <div className="text-left hidden sm:block">
                  <span className="block text-[10px] font-mono text-slate-600">ON DECK: PICK 1.05</span>
                  <span className="block text-xs font-black text-slate-400 uppercase mt-0.5 tracking-wider">TEAM_ALPHA</span>
               </div>
            </div>
         </div>

         <div className="flex gap-4">
            <div className="text-right hidden md:block">
               <p className="text-[10px] font-mono text-slate-500 uppercase">System_Load</p>
               <p className="text-xs font-bold text-cyan-400 font-mono">OPTIMAL</p>
            </div>
            <button 
              onClick={() => setActiveTab('lobby')}
              className="px-6 py-2 border border-slate-700 text-slate-500 font-black uppercase text-[10px] hover:text-white transition-colors"
            >
              QUIT
            </button>
         </div>
      </div>

      {/* Draft Train Tracker */}
      <div className="flex items-stretch bg-slate-900/40 border border-slate-800/80 rounded-xl overflow-x-auto no-scrollbar mx-6 relative">
         <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-slate-950 to-transparent pointer-events-none z-10" />
         <div className="flex w-full divide-x divide-slate-800/50">
           {/* Mock Data for next 5 picks */}
           {[
             { team: 'TEAM_NEURAL', pick: '1.04', status: 'ON_THE_CLOCK', isAutoPick: false },
             { team: 'TEAM_ALPHA', pick: '1.05', status: 'WAITING', isAutoPick: false },
             { team: 'TEAM_OMEGA', pick: '1.06', status: 'WAITING', isAutoPick: true },
             { team: 'TEAM_BETA', pick: '1.07', status: 'WAITING', isAutoPick: false },
             { team: 'TEAM_GAMMA', pick: '1.08', status: 'WAITING', isAutoPick: false },
           ].map((slot, index) => (
             <div 
               key={slot.pick} 
               className={`flex-1 min-w-[150px] p-4 flex flex-col justify-center relative transition-colors ${
                 slot.status === 'ON_THE_CLOCK' 
                   ? 'bg-cyan-900/20 shadow-[inset_0_0_20px_rgba(0,242,255,0.1)]' 
                   : 'bg-transparent hover:bg-slate-800/20'
               }`}
             >
               {slot.status === 'ON_THE_CLOCK' && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-cyan-400 animate-pulse shadow-[0_0_10px_rgba(0,242,255,0.8)]" />
               )}
               <div className="flex justify-between items-start mb-1.5">
                  <span className={`text-[10px] font-mono font-bold tracking-widest ${slot.status === 'ON_THE_CLOCK' ? 'text-cyan-400' : 'text-slate-500'}`}>
                    PICK {slot.pick}
                  </span>
                  {slot.isAutoPick && (
                    <span className="px-1.5 py-0.5 rounded-sm bg-orange-500/20 border border-orange-500/40 text-[8px] font-mono text-orange-400 uppercase tracking-widest flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-orange-400 animate-ping" /> AUTO
                    </span>
                  )}
               </div>
               <span className={`text-sm font-black uppercase tracking-wider ${slot.status === 'ON_THE_CLOCK' ? 'text-white' : 'text-slate-300'}`}>
                  {slot.team}
               </span>
               {slot.status === 'ON_THE_CLOCK' && (
                 <span className="absolute bottom-2 right-4 text-[8px] font-mono text-cyan-500 animate-pulse uppercase">
                   On the Clock
                 </span>
               )}
             </div>
           ))}
         </div>
         <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-950 to-transparent pointer-events-none z-10" />
      </div>

      <div className="grid grid-cols-12 gap-6 flex-1 overflow-hidden">
        
        {/* Left Column (Anchored Roster) */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6 h-full">
          <div className="hologram-panel flex-1 p-6 border-cyan-500/30 overflow-hidden flex flex-col">
            <div className="mb-4">
              <h3 className="text-[11px] font-black uppercase text-cyan-400 tracking-[0.2em] mb-2 flex items-center gap-2">
                 <span className="animate-pulse">⚓</span> ANCHORED_ROSTER
              </h3>
              
              <div className="relative mt-3">
                <select 
                  value={viewingRosterId}
                  onChange={(e) => setViewingRosterId(e.target.value)}
                  className="w-full bg-slate-900 border border-cyan-500/30 text-white text-[10px] font-black uppercase tracking-widest p-2 appearance-none outline-none focus:border-cyan-400 transition-colors"
                >
                  <option value="MY_TEAM">MY_TEAM (ACTIVE)</option>
                  {MOCK_OPPONENTS.map(opp => (
                    <option key={opp.id} value={opp.id}>{opp.id}</option>
                  ))}
                </select>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-cyan-500 pointer-events-none">▼</div>
              </div>
            </div>
            
            {/* Roster Limit Trackers */}
            <div className="mb-4 grid grid-cols-5 gap-1 border-b border-slate-800 pb-4">
               {['QB', 'RB', 'WR', 'TE', 'FLEX'].map(pos => {
                 const currentRoster = viewingRosterId === 'MY_TEAM' 
                   ? lineup 
                   : MOCK_OPPONENTS.find(o => o.id === viewingRosterId)?.players || [];
                   
                 let count = 0;
                 if (pos === 'FLEX') {
                   count = currentRoster.filter(p => ['RB', 'WR', 'TE'].includes(p.position)).length;
                 } else {
                   count = currentRoster.filter(p => p.position === pos).length;
                 }
                 const limit = ROSTER_LIMITS[pos];
                 const isFull = count >= limit;
                 
                 return (
                   <div key={pos} className="flex flex-col items-center bg-slate-900/50 border border-slate-800 p-1 rounded-sm">
                     <span className="text-[7px] font-mono text-slate-500 uppercase">{pos}</span>
                     <span className={`text-[9px] font-black ${isFull ? 'text-red-400' : 'text-cyan-400'}`}>
                       {count}/{limit}
                     </span>
                   </div>
                 );
               })}
            </div>

            {/* Persistent Roster View */}
            <div className="flex-1 overflow-y-auto custom-scroll pr-1 space-y-2">
               {(() => {
                 const currentRoster = viewingRosterId === 'MY_TEAM' 
                   ? lineup 
                   : MOCK_OPPONENTS.find(o => o.id === viewingRosterId)?.players || [];
                   
                 if (currentRoster.length === 0) {
                   return (
                     <div className="h-full flex flex-col items-center justify-center opacity-20 pointer-events-none pb-10">
                        <span className="text-3xl mb-3">👻</span>
                        <p className="font-black text-[9px] uppercase tracking-widest text-center text-slate-300">Roster_Empty</p>
                     </div>
                   );
                 }
                 
                 return currentRoster.map(p => (
                   <div key={p.id} className="p-2 bg-slate-900 border border-cyan-500/20 flex items-center justify-between group hover:border-cyan-500 transition-all">
                       <div className="flex items-center gap-2">
                         <span className={`w-6 h-6 flex items-center justify-center text-[8px] font-mono font-bold border ${
                           p.position === 'QB' ? 'border-pink-500/40 text-pink-400 bg-pink-500/10' :
                           p.position === 'RB' ? 'border-blue-500/40 text-blue-400 bg-blue-500/10' :
                           p.position === 'WR' ? 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10' :
                           'border-green-500/40 text-green-400 bg-green-500/10'
                         }`}>
                           {p.position}
                         </span>
                         <div>
                             <p className="text-[9px] font-black text-white uppercase truncate max-w-[120px]">{p.name}</p>
                             <p className="text-[7px] font-mono text-slate-500 uppercase">{p.team} • BYE {p.byeWeek}</p>
                         </div>
                       </div>
                   </div>
                 ));
               })()}
            </div>
          </div>
        </div>

        {/* Center Column (Draft Board) */}
        <div className="col-span-12 lg:col-span-6 flex flex-col overflow-hidden">
           <div className="hologram-panel flex-1 p-8 border-cyan-500/20 flex flex-col relative">
              <div className="flex justify-between items-center mb-4">
                 <div>
                    <h2 className="text-lg font-black uppercase text-cyan-400 tracking-[0.4em]">
                       {activeBoardView === 'MARKET_BOARD' ? 'MARKET_BOARD' : activeBoardView === 'LINEUP_PROJECTIONS' ? 'WAR_ROOM_TRENDS' : 'DRAFT_BOARD'}
                    </h2>
                    <p className="text-[8px] font-mono text-slate-600 uppercase mt-1">
                       {activeBoardView === 'MARKET_BOARD' ? 'Global_Ownership_Index' : activeBoardView === 'LINEUP_PROJECTIONS' ? '5_Day_Performance_Projection_Curve' : 'Global_League_Overview'}
                    </p>
                 </div>
                 <div className="flex border border-slate-800 bg-slate-900/50 p-0.5 rounded">
                    <button
                      onClick={() => setActiveBoardView('MARKET_BOARD')}
                      className={`px-3 py-1 text-[9px] font-black uppercase tracking-wider transition-all ${
                        activeBoardView === 'MARKET_BOARD'
                          ? 'bg-cyan-500 text-black font-bold shadow-[0_0_10px_rgba(0,242,255,0.3)]'
                          : 'text-slate-500 hover:text-white'
                      }`}
                    >
                      MARKET_ASSETS
                    </button>
                    <button
                      onClick={() => setActiveBoardView('LINEUP_PROJECTIONS')}
                      className={`px-3 py-1 text-[9px] font-black uppercase tracking-wider transition-all ${
                        activeBoardView === 'LINEUP_PROJECTIONS'
                          ? 'bg-cyan-500 text-black font-bold shadow-[0_0_10px_rgba(0,242,255,0.3)]'
                          : 'text-slate-500 hover:text-white'
                      }`}
                    >
                      PROJECTIONS & MATCHUPS
                    </button>
                    <button
                      onClick={() => setActiveBoardView('DRAFT_BOARD')}
                      className={`px-3 py-1 text-[9px] font-black uppercase tracking-wider transition-all ${
                        activeBoardView === 'DRAFT_BOARD'
                          ? 'bg-cyan-500 text-black font-bold shadow-[0_0_10px_rgba(0,242,255,0.3)]'
                          : 'text-slate-500 hover:text-white'
                      }`}
                    >
                      DRAFT_BOARD
                    </button>
                 </div>
              </div>

              {activeBoardView === 'LINEUP_PROJECTIONS' ? (
                 <div className="flex-1 flex flex-col gap-5 overflow-y-auto custom-scroll pr-2">
                    {/* Matchup Summary Panel */}
                    <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                       <div>
                          <h4 className="text-[9px] font-black uppercase text-purple-400 tracking-wider">ACTIVE_SQUAD_MATCHUP_SCORE</h4>
                          <p className="text-[7.5px] font-mono text-slate-500 mt-0.5">Live matchup metrics for drafted assets</p>
                       </div>
                       <div className="flex gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 border border-green-500/20 bg-green-500/5 px-2 py-1 rounded">
                             <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                             <span className="text-[8px] font-mono text-green-400 uppercase font-bold">
                                FAVORABLE: {matchupSummary.favorable}
                             </span>
                          </div>
                          <div className="flex items-center gap-1.5 border border-red-500/20 bg-red-500/5 px-2 py-1 rounded">
                             <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                             <span className="text-[8px] font-mono text-red-400 uppercase font-bold">
                                UNFAVORABLE: {matchupSummary.unfavorable}
                             </span>
                          </div>
                          <div className="flex items-center gap-1.5 border border-slate-800 bg-slate-900/60 px-2 py-1 rounded">
                             <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                             <span className="text-[8px] font-mono text-slate-400 uppercase font-bold">
                                NEUTRAL: {matchupSummary.neutral}
                             </span>
                          </div>
                       </div>
                    </div>

                    {/* Selector Tabs */}
                    <div className="flex flex-col gap-1.5">
                       <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider">INSPECT PERFORMANCE TARGET:</span>
                       <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
                          <button
                            onClick={() => setSelectedTrendPlayerId('TOTAL_LINEUP')}
                            className={`px-3 py-1 text-[8.5px] font-mono uppercase tracking-wider border rounded transition-all shrink-0 ${
                              selectedTrendPlayerId === 'TOTAL_LINEUP'
                                ? 'bg-purple-500/20 border-purple-500 text-purple-400 font-bold shadow-[0_0_8px_rgba(168,85,247,0.2)]'
                                : 'border-slate-800 text-slate-500 hover:border-slate-700 hover:text-white bg-slate-900/20'
                            }`}
                          >
                            🌐 FULL_SQUAD
                          </button>
                          {lineup.map(p => (
                            <button
                              key={p.id}
                              onClick={() => setSelectedTrendPlayerId(p.id)}
                              className={`px-3 py-1 text-[8.5px] font-mono uppercase tracking-wider border rounded transition-all shrink-0 ${
                                selectedTrendPlayerId === p.id
                                  ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 font-bold shadow-[0_0_8px_rgba(0,242,255,0.2)]'
                                  : 'border-slate-800 text-slate-500 hover:border-slate-700 hover:text-white bg-slate-900/20'
                              }`}
                            >
                              {p.position} // {p.name.split(' ').pop()} {p.matchupRating === 'FAVORABLE' ? '▲' : p.matchupRating === 'UNFAVORABLE' ? '▼' : '■'}
                            </button>
                          ))}
                       </div>
                    </div>

                    {/* Recharts Line Graph Container */}
                    <div className="flex-1 min-h-[220px] w-full bg-[#05070c]/60 border border-slate-800/60 p-4 rounded relative flex flex-col justify-between">
                       {lineup.length === 0 ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#010409]/90 z-10 p-6 text-center">
                             <span className="text-2xl mb-2 animate-bounce">📊</span>
                             <p className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 max-w-xs leading-relaxed">
                                DEPLOY ASSETS TO SQUAD TO SIMULATE PROJECTION CURVES
                             </p>
                          </div>
                       ) : null}

                       <div className="h-[210px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                             <LineChart data={trendData} margin={{ top: 10, right: 10, bottom: 5, left: -25 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#161b22" vertical={false} />
                                <XAxis dataKey="day" stroke="#485569" tick={{ fill: '#8b949e', fontSize: 9, fontFamily: 'JetBrains Mono' }} />
                                <YAxis stroke="#485569" tick={{ fill: '#8b949e', fontSize: 9, fontFamily: 'JetBrains Mono' }} />
                                <Tooltip 
                                   contentStyle={{ backgroundColor: '#0d1117', border: '1px solid #30363d', fontFamily: 'JetBrains Mono', fontSize: '9px', color: '#c9d1d9', borderRadius: '4px' }}
                                />
                                <Legend wrapperStyle={{ fontFamily: 'JetBrains Mono', fontSize: '8px', textTransform: 'uppercase', paddingTop: '10px' }} />
                                <Line 
                                   type="monotone" 
                                   dataKey="Points" 
                                   name={selectedTrendPlayerId === 'TOTAL_LINEUP' ? "SQUAD_PROJECTION" : "ASSET_PROJECTION"} 
                                   stroke="#00f2ff" 
                                   strokeWidth={2} 
                                   dot={{ fill: '#00f2ff', r: 3 }} 
                                   activeDot={{ r: 5 }} 
                                />
                                <Line 
                                   type="monotone" 
                                   dataKey="Average" 
                                   name="BASELINE_BUDGET" 
                                   stroke="#a855f7" 
                                   strokeWidth={1.5} 
                                   strokeDasharray="4 4" 
                                   dot={false} 
                                />
                             </LineChart>
                          </ResponsiveContainer>
                       </div>

                       <div className="border-t border-slate-800/60 pt-3 mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="p-2.5 bg-slate-900/60 border border-slate-800/80 rounded">
                             <span className="block text-[7px] font-black text-cyan-400 uppercase tracking-widest">TACTICAL_REPORT</span>
                             <span className="block text-[9px] font-mono text-slate-400 mt-1 leading-relaxed">
                                {selectedTrendPlayerId === 'TOTAL_LINEUP' ? (
                                   matchupSummary.favorable > matchupSummary.unfavorable 
                                      ? "Your lineup holds highly favorable matchup indices. This configuration optimizes point yield and projection probability."
                                      : "Warning: Matchup saturation indices indicate tough opponents. Evaluate alternatives using AI recommendation GM."
                                ) : (
                                   (() => {
                                      const p = MOCK_PLAYERS.find(pl => pl.id === selectedTrendPlayerId);
                                      if (p?.matchupRating === 'FAVORABLE') {
                                         return `Favorable matchup against ${p.matchupOpponent}. Expect high-volume performance with elevated floor value.`;
                                      } else if (p?.matchupRating === 'UNFAVORABLE') {
                                         return `Tough defensive match against ${p.matchupOpponent}. Matchup suggests potential variance risk.`;
                                      }
                                      return "Neutral matchups expected. Consistent performance with minimal volatility deviation.";
                                   })()
                                )}
                             </span>
                          </div>
                          <div className="p-2.5 bg-slate-900/60 border border-slate-800/80 rounded flex flex-col justify-center">
                             <div className="flex justify-between items-center text-[8.5px] font-mono">
                                <span className="text-slate-500">MAX_PROJECTED</span>
                                <span className="text-green-400 font-bold">
                                   {Math.max(...trendData.map(d => d.Points))} PTS
                                </span>
                             </div>
                             <div className="flex justify-between items-center text-[8.5px] font-mono mt-1.5">
                                <span className="text-slate-500">MIN_PROJECTED</span>
                                <span className="text-yellow-500 font-bold">
                                   {Math.min(...trendData.map(d => d.Points))} PTS
                                </span>
                             </div>
                          </div>
                       </div>
                    </div>
                 </div>
              ) : activeBoardView === 'DRAFT_BOARD' ? (
                 <div className="flex-1 overflow-y-auto custom-scroll pr-2">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                       <div className="bg-slate-900/60 border border-slate-800 rounded p-4 flex flex-col h-full">
                          <h3 className="text-[10px] font-black uppercase text-cyan-400 border-b border-slate-800 pb-2 mb-3">MY_TEAM</h3>
                          <div className="flex-1 space-y-1">
                             {lineup.length === 0 ? <p className="text-[9px] text-slate-500 font-mono">NO ASSETS DRAFTED</p> : lineup.map((p, i) => (
                                 <div key={i} className="flex justify-between items-center py-1">
                                    <span className="text-[9px] font-black text-white">{p.position} {p.name.split(' ').pop()}</span>
                                    <span className="text-[8px] font-mono text-cyan-500">${p.salary}</span>
                                 </div>
                             ))}
                          </div>
                       </div>
                       {MOCK_OPPONENTS.map((opp) => (
                           <div key={opp.id} className="bg-slate-900/60 border border-slate-800 rounded p-4 flex flex-col h-full">
                              <h3 className="text-[10px] font-black uppercase text-slate-400 border-b border-slate-800 pb-2 mb-3">{opp.id}</h3>
                              <div className="flex-1 space-y-1">
                                 {opp.players.length === 0 ? <p className="text-[9px] text-slate-500 font-mono">NO ASSETS DRAFTED</p> : opp.players.map((p, i) => (
                                     <div key={i} className="flex justify-between items-center py-1">
                                        <span className="text-[9px] font-black text-slate-300">{p.position} {p.name.split(' ').pop()}</span>
                                        <span className="text-[8px] font-mono text-slate-500">${p.salary}</span>
                                     </div>
                                 ))}
                              </div>
                           </div>
                       ))}
                    </div>
                 </div>
              ) : (
                 <>
                    {/* Filters & Search */}
                    <div className="flex flex-col xl:flex-row gap-4 mb-4 pb-4 border-b border-slate-800/60">
                      <div className="flex gap-2 overflow-x-auto no-scrollbar">
                        {['ALL', 'QB', 'RB', 'WR', 'TE'].map(pos => (
                           <button 
                             key={pos}
                             onClick={() => setPositionFilter(pos)}
                             className={`px-3 py-1 text-[9px] font-black uppercase tracking-wider border transition-all ${
                                positionFilter === pos 
                                  ? 'bg-cyan-500 text-black border-cyan-500 shadow-[0_0_10px_rgba(0,242,255,0.4)]' 
                                  : 'bg-slate-900/50 text-slate-500 border-slate-700 hover:text-cyan-400 hover:border-cyan-500/30'
                             }`}
                           >
                             {pos}
                           </button>
                        ))}
                      </div>
                      
                      <div className="flex flex-1 items-center gap-3">
                        <div className="flex-1 relative">
                          <input 
                            type="text" 
                            placeholder="SEARCH PLAYERS OR TEAMS..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-900/50 border border-slate-700 text-white text-[10px] font-mono p-2 pl-3 outline-none focus:border-cyan-500 transition-colors"
                          />
                        </div>
                        <select
                          value={byeWeekFilter}
                          onChange={(e) => setByeWeekFilter(e.target.value)}
                          className="bg-slate-900/50 border border-slate-700 text-slate-300 text-[9px] font-black uppercase p-2 outline-none focus:border-cyan-500"
                        >
                          <option value="ALL">ALL BYES</option>
                          {[5, 6, 7, 8, 9, 10, 11, 13, 14].map(w => (
                            <option key={w} value={w.toString()}>BYE {w}</option>
                          ))}
                        </select>
                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value)}
                          className="bg-slate-900/50 border border-slate-700 text-slate-300 text-[9px] font-black uppercase p-2 outline-none focus:border-cyan-500"
                        >
                          <option value="PROJ_POINTS_DESC">PROJ (DESC)</option>
                          <option value="PROJ_POINTS_ASC">PROJ (ASC)</option>
                          <option value="ADP_ASC">ADP (ASC)</option>
                          <option value="ADP_DESC">ADP (DESC)</option>
                          <option value="PRICE_DESC">PRICE (DESC)</option>
                          <option value="PRICE_ASC">PRICE (ASC)</option>
                        </select>
                      </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scroll pr-4">
                       <table className="w-full text-left">
                          <thead>
                             <tr className="mono text-[9px] text-slate-500 uppercase tracking-tighter border-b border-slate-800">
                                <th className="pb-4 pl-2">ASSET</th>
                                <th className="pb-4 text-center">ADP</th>
                                <th className="pb-4 text-center">FPPG</th>
                                <th className="pb-4 text-center">PROJ</th>
                                <th className="pb-4">SATURATION</th>
                                <th className="pb-4 text-right">PRICE</th>
                                <th className="pb-4 text-right">ACT</th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/40">
                             {visiblePlayers.map(player => (
                                <tr 
                                  key={player.id} 
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, player)}
                                  className="group hover:bg-cyan-500/5 transition-all cursor-move"
                                >
                                   <td className="py-4 pl-2">
                                      <div className="flex items-center gap-3">
                                         <div className="w-8 h-8 bg-slate-900 border border-slate-800 p-0.5 overflow-hidden rounded">
                                            <img src={player.imageUrl} className="w-full h-full object-cover grayscale group-hover:grayscale-0 opacity-50 group-hover:opacity-100 transition-all duration-500" />
                                         </div>
                                         <div>
                                            <p className="text-[10px] font-black text-white uppercase">{player.name}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                              <span className="mono text-[8px] text-slate-600">{player.team} // {player.position}</span>
                                              {player.matchupOpponent && (
                                                <span className={`text-[7px] font-mono px-1 py-0.5 font-bold uppercase tracking-wide border rounded shrink-0 ${
                                                  player.matchupRating === 'FAVORABLE' 
                                                    ? 'text-green-400 border-green-500/20 bg-green-500/10' 
                                                    : player.matchupRating === 'UNFAVORABLE' 
                                                    ? 'text-red-400 border-red-500/20 bg-red-500/10' 
                                                    : 'text-slate-400 border-slate-700 bg-slate-900'
                                                }`}>
                                                  vs {player.matchupOpponent} {player.matchupRating === 'FAVORABLE' ? '▲' : player.matchupRating === 'UNFAVORABLE' ? '▼' : '■'}
                                                </span>
                                              )}
                                            </div>
                                         </div>
                                      </div>
                                   </td>
                                   <td className="py-4 text-center">
                                      <span className="mono text-[10px] text-slate-300 font-bold">{player.adp || '--'}</span>
                                   </td>
                                   <td className="py-4 text-center">
                                      <span className="mono text-[10px] text-slate-400 font-bold">{player.lastScore}</span>
                                   </td>
                                   <td className="py-4 text-center">
                                      <span className="mono text-[10px] text-cyan-400 font-black">{player.projVal || '--'}</span>
                                   </td>
                                   <td className="py-4 pr-4">
                                      <div className="flex flex-col gap-1 w-full min-w-[100px]">
                                        <div className="flex justify-between items-center px-1">
                                          <span className={`text-[7px] font-black uppercase tracking-widest ${player.isChalk ? 'text-red-500' : player.isValue ? 'text-green-500' : 'text-slate-500'}`}>
                                             {player.isChalk ? 'CHALK' : player.isValue ? 'VALUE' : 'MID'}
                                          </span>
                                          <span className="mono text-[8px] font-bold text-slate-400">{player.ownership}%</span>
                                        </div>
                                        <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                                          <div 
                                            className={`h-full transition-all duration-1000 ${player.isChalk ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : player.isValue ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-cyan-500'}`} 
                                            style={{ width: `${player.ownership}%` }}
                                          ></div>
                                        </div>
                                      </div>
                                   </td>
                                   <td className="py-4 text-right">
                                      <div className="flex flex-col items-end">
                                        <span className={`font-mono text-[12px] font-black ${player.isChalk ? 'text-red-400' : 'text-cyan-400'}`}>
                                          ${player.ammSalary.toLocaleString()}
                                        </span>
                                      </div>
                                   </td>
                                   <td className="py-4 text-right">
                                      <div className="flex flex-col items-end gap-1">
                                        <button 
                                          onClick={() => fetchPlayerIntel(player)}
                                          disabled={isFetchingIntel}
                                          className="text-[8px] font-mono font-bold text-cyan-500 border border-cyan-500/30 px-2 py-0.5 hover:bg-cyan-500 hover:text-black uppercase tracking-widest transition-all"
                                        >
                                          INTEL
                                        </button>
                                        <button 
                                          onClick={() => handleDraft(player)}
                                          disabled={lineup.some(p => p.id === player.id)}
                                          className={`w-8 h-8 border transition-all flex items-center justify-center font-black ${
                                            lineup.some(p => p.id === player.id) 
                                              ? 'border-slate-800 text-slate-800 cursor-not-allowed' 
                                              : 'border-cyan-500 text-cyan-500 hover:bg-cyan-500 hover:text-black shadow-[0_0_10px_rgba(0,242,255,0.2)]'
                                          }`}
                                        >
                                           {lineup.some(p => p.id === player.id) ? '✓' : '+'}
                                        </button>
                                      </div>
                                   </td>
                                </tr>
                             ))}
                          </tbody>
                       </table>
                    </div>
                 </>
              )}
           </div>
        </div>

        {/* Right Column (Roster Builder) */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
           <div 
             className={`hologram-panel flex-1 p-6 flex flex-col transition-all outline-dashed outline-2 ${isDraggingOver ? 'bg-purple-500/20 border-purple-500 outline-purple-400 drop-shadow-[0_0_15px_rgba(168,85,247,0.4)]' : 'border-purple-500/30 bg-purple-500/5 outline-transparent'}`}
             onDragOver={handleDragOver}
             onDragEnter={handleDragEnter}
             onDragLeave={handleDragLeave}
             onDrop={handleDrop}
           >
              <h3 className="text-[11px] font-black uppercase text-purple-400 tracking-[0.2em] mb-6 border-b border-purple-500/20 pb-2">ROSTER_BUILDER // ACTIVE_SQUAD</h3>
              <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-3">
                 {lineup.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-10 pointer-events-none">
                       <span className="text-4xl mb-4">👾</span>
                       <p className="font-black text-xs uppercase tracking-widest text-center">Unit_Not_Deployed</p>
                    </div>
                 ) : (
                   lineup.map(p => {
                     const ammPrice = calculateAMMPrice(p.salary, p.ownership);
                     return (
                      <div key={p.id} className="p-3 bg-slate-900 border border-purple-500/20 flex items-center justify-between group hover:border-purple-500 transition-all">
                          <div className="flex items-center gap-3">
                            <span className="w-7 h-7 border border-purple-500/40 flex items-center justify-center text-[9px] font-mono text-purple-400 bg-purple-500/10 font-bold">{p.position}</span>
                            <div>
                                <p className="text-[10px] font-black text-white uppercase truncate">{p.name}</p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span className="mono text-[8px] text-purple-400 font-bold shrink-0">${ammPrice.toLocaleString()}</span>
                                  {p.matchupOpponent && (
                                    <span className={`text-[6.5px] font-mono px-1 font-bold uppercase shrink-0 ${
                                      p.matchupRating === 'FAVORABLE' 
                                        ? 'text-green-400' 
                                        : p.matchupRating === 'UNFAVORABLE' 
                                        ? 'text-red-400' 
                                        : 'text-slate-500'
                                    }`}>
                                      vs {p.matchupOpponent} {p.matchupRating === 'FAVORABLE' ? '▲' : p.matchupRating === 'UNFAVORABLE' ? '▼' : '■'}
                                    </span>
                                  )}
                                </div>
                            </div>
                          </div>
                          <button onClick={() => handleRemove(p.id)} className="text-slate-600 hover:text-white transition-colors p-1">✕</button>
                      </div>
                     );
                   })
                 )}
              </div>
              <div className="pt-6 border-t border-slate-800 mt-4 space-y-4">
                 
                 {/* Visual Salary Cap Progress Bar */}
                 <div className="flex flex-col gap-1 mb-2">
                   <div className="flex justify-between items-center px-1">
                     <span className="mono text-[8px] text-slate-500 uppercase tracking-widest">SALARY_CAP_USAGE</span>
                     <span className="mono text-[8px] font-bold text-slate-400">{((currentCost / budget) * 100).toFixed(1)}%</span>
                   </div>
                   <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                     <div 
                       className={`h-full transition-all duration-500 ${(currentCost / budget) > 0.9 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-purple-500'}`} 
                       style={{ width: `${Math.min((currentCost / budget) * 100, 100)}%` }}
                     ></div>
                   </div>
                 </div>

                 <div className="flex justify-between items-end">
                    <div>
                       <p className="mono text-[8px] text-slate-500 uppercase tracking-widest">CAPACITY</p>
                       <p className="text-xl font-black text-white">{lineup.length}/8</p>
                    </div>
                    <div className="text-right">
                       <p className="mono text-[8px] text-slate-500 uppercase tracking-widest">FUEL</p>
                       <p className={`text-xl font-black ${(budget - currentCost) < 5000 ? 'text-red-500' : 'text-[#00f2ff]'}`}>
                          ${(budget - currentCost).toLocaleString()}
                       </p>
                    </div>
                 </div>

                 {isAnalyzingRoster ? (
                    <div className="flex flex-col items-center justify-center p-4 border border-purple-500/20 bg-purple-500/5">
                       <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                       <p className="font-mono text-[8px] text-purple-400 uppercase tracking-widest">Running_Simulations...</p>
                    </div>
                 ) : rosterAnalysis ? (
                    <div className="flex flex-col gap-3 p-3 border border-purple-500/30 bg-purple-500/10">
                       <div className="flex justify-between items-center">
                          <span className="font-mono text-[9px] text-purple-400 uppercase tracking-widest">WIN_PROBABILITY</span>
                          <span className="text-sm font-black text-white">{rosterAnalysis.winProbability}%</span>
                       </div>
                       <div className="flex justify-between items-center border-b border-purple-500/20 pb-2">
                          <span className="font-mono text-[9px] text-slate-400 uppercase tracking-widest">Roster_Rating</span>
                          <span className="font-mono text-[10px] font-bold text-slate-300">{rosterAnalysis.rating}/100</span>
                       </div>
                       <p className="text-[9px] font-mono leading-relaxed text-slate-400">"{rosterAnalysis.summary}"</p>
                       <div className="grid grid-cols-2 gap-2 mt-1">
                          <div className="bg-slate-900 border border-slate-800 p-2">
                             <span className="block text-[7px] font-black text-green-500 uppercase tracking-widest mb-1">KEY_ASSET</span>
                             <span className="block text-[9px] text-slate-300 truncate">{rosterAnalysis.keyAsset}</span>
                          </div>
                          <div className="bg-slate-900 border border-slate-800 p-2">
                             <span className="block text-[7px] font-black text-red-500 uppercase tracking-widest mb-1">VULNERABILITY</span>
                             <span className="block text-[9px] text-slate-300 truncate">{rosterAnalysis.vulnerability}</span>
                          </div>
                       </div>
                    </div>
                 ) : null}

                 <div className="flex flex-col gap-2">
                   <button 
                    onClick={handleAnalyzeRoster}
                    disabled={lineup.length === 0 || isAnalyzingRoster}
                    className={`w-full py-3 text-[10px] font-black uppercase tracking-[0.3em] transition-all border ${
                      lineup.length > 0 && !isAnalyzingRoster
                        ? 'bg-transparent text-purple-400 border-purple-500/50 hover:bg-purple-500 hover:text-black' 
                        : 'bg-slate-900 text-slate-700 border-slate-800 opacity-50 cursor-not-allowed'
                    }`}
                   >
                    ANALYZE_SQUAD
                   </button>
                   <button 
                    disabled={lineup.length < 8}
                    className={`w-full py-4 text-[10px] font-black uppercase tracking-[0.4em] transition-all border-2 ${
                      lineup.length === 8 
                        ? 'bg-purple-600 text-white border-purple-400 shadow-[0_0_20px_rgba(191,0,255,0.4)]' 
                        : 'bg-slate-800 text-slate-600 border-slate-700 opacity-50 cursor-not-allowed'
                    }`}
                   >
                    LOCK_ROSTER
                   </button>
                   <button 
                    onClick={() => setShowSavedLineupsModal(true)}
                    className="w-full py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 border border-slate-700 bg-slate-900 hover:text-white hover:border-slate-500 transition-all"
                   >
                    CONFIGURATIONS
                   </button>
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* Saved Lineups Overlay */}
      {showSavedLineupsModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
           <div className="hologram-panel p-8 max-w-lg w-full border-purple-500/40 border-l-4 border-l-purple-500">
              <div className="flex justify-between items-center mb-6">
                 <div>
                   <h2 className="text-sm font-black uppercase text-purple-400 tracking-widest">SAVED_CONFIGURATIONS</h2>
                   <p className="text-[10px] font-mono text-slate-500 mt-1">Manage Squad Loadouts</p>
                 </div>
                 <button onClick={() => setShowSavedLineupsModal(false)} className="text-slate-500 hover:text-white">✕</button>
              </div>
              
              <div className="mb-8 p-4 bg-purple-500/10 border border-purple-500/30">
                 <h3 className="text-[10px] font-mono text-purple-400 uppercase tracking-widest mb-3">Save Current Lineup</h3>
                 <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="ENTER CONFIG NAME..." 
                      value={newLineupName}
                      onChange={(e) => setNewLineupName(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 text-white px-3 py-2 text-xs font-mono uppercase focus:outline-none focus:border-purple-500 focus:bg-purple-900/20 transition-all"
                    />
                    <button 
                      onClick={saveCurrentLineup}
                      disabled={!newLineupName.trim() || lineup.length === 0}
                      className="px-4 py-2 border text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-transparent text-purple-400 border-purple-500/50 hover:bg-purple-500 hover:text-black"
                    >
                      SAVE
                    </button>
                 </div>
              </div>

              <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scroll pr-2">
                 {savedLineups.length === 0 ? (
                    <p className="text-center text-[10px] font-mono text-slate-500 italic py-8 border border-dashed border-slate-800">NO_DATA_FOUND</p>
                 ) : (
                    savedLineups.map(saved => {
                      const cost = saved.players.reduce((acc, p) => acc + calculateAMMPrice(p.salary, p.ownership), 0);
                      return (
                        <div key={saved.id} className="p-4 bg-slate-900 border border-slate-800 flex items-center justify-between group hover:border-purple-500/50 transition-all">
                           <div>
                              <p className="text-xs font-black text-white uppercase tracking-wider">{saved.name}</p>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-[10px] font-mono text-slate-500">Units: {saved.players.length}/8</span>
                                <span className="text-[10px] font-mono text-purple-400">Cost: ${cost.toLocaleString()}</span>
                              </div>
                           </div>
                           <div className="flex items-center gap-2">
                              <button 
                                onClick={() => loadLineup(saved)}
                                className="px-3 py-1.5 border border-cyan-500/50 text-cyan-400 text-[9px] font-black uppercase tracking-wider hover:bg-cyan-500 hover:text-black transition-colors"
                              >
                                LOAD
                              </button>
                              <button 
                                onClick={() => deleteLineup(saved.id)}
                                className="px-3 py-1.5 border border-red-500/50 text-red-500 text-[9px] font-black uppercase tracking-wider hover:bg-red-500 hover:text-white transition-colors"
                              >
                                DEL
                              </button>
                           </div>
                        </div>
                      )
                    })
                 )}
              </div>
           </div>
        </div>
      )}

      {/* Player Intel Overlay */}
      {playerIntel && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
           <div className="hologram-panel p-8 max-w-lg w-full border-cyan-500/40 border-l-4 border-l-cyan-400">
              <div className="flex justify-between items-center mb-6">
                 <div>
                   <h2 className="text-sm font-black uppercase text-cyan-400 tracking-widest">ASSET_INTEL</h2>
                   <p className="text-[10px] font-mono text-slate-500">Subject: {playerIntel.player.name}</p>
                 </div>
                 <button onClick={() => setPlayerIntel(null)} className="text-slate-500 hover:text-white">✕</button>
              </div>
              <div className="p-4 bg-cyan-900/10 border border-cyan-500/20 text-xs text-slate-300 font-mono leading-relaxed">
                 {isFetchingIntel ? (
                   <span className="animate-pulse flex items-center gap-2"><div className="w-2 h-2 bg-cyan-500 rounded-full animate-ping"></div> Syncing search data...</span>
                 ) : (
                   <div dangerouslySetInnerHTML={{ __html: playerIntel.intel.replace(/\n/g, '<br/>') }} />
                 )}
              </div>
           </div>
        </div>
      )}

      {/* Strategy Overlay */}
      {showStrategyPicker && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
           <div className="hologram-panel p-8 max-w-md w-full border-cyan-500/40">
              <div className="flex justify-between items-center mb-6">
                 <h2 className="text-sm font-black uppercase text-cyan-400 tracking-widest">STRATEGY_OVERRIDE</h2>
                 <button onClick={() => setShowStrategyPicker(false)} className="text-slate-500 hover:text-white">✕</button>
              </div>
              <div className="grid grid-cols-1 gap-3">
                 {STRATEGIES.map(s => (
                    <button 
                      key={s.id}
                      onClick={() => {
                        setSelectedStrategy(s);
                        setAiRecommendation(null);
                        setShowStrategyPicker(false);
                      }}
                      className={`flex items-center gap-4 p-4 border text-left transition-all ${
                        selectedStrategy.id === s.id 
                          ? 'border-cyan-500 bg-cyan-500/10' 
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                       <span className="text-2xl">{s.icon}</span>
                       <div>
                          <p className="text-[11px] font-black text-white uppercase">{s.name}</p>
                          <p className="text-[9px] text-slate-500">{s.description}</p>
                       </div>
                    </button>
                 ))}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default DraftRoom;
