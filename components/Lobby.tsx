
import React, { useState } from 'react';
import { MOCK_LEAGUES } from '../constants';

const Lobby: React.FC<{ setActiveTab: (t: string) => void }> = ({ setActiveTab }) => {
  const [mode, setMode] = useState<'daily' | 'weekly' | 'season'>('daily');
  const [mintingLeagueId, setMintingLeagueId] = useState<string | null>(null);
  const [mintStep, setMintStep] = useState<number>(0);

  const handleMintPass = (leagueId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMintingLeagueId(leagueId);
    setMintStep(1);

    // Simulate blockchain transaction states
    setTimeout(() => setMintStep(2), 1000); // 1s: Generaten NFT Metadata
    setTimeout(() => setMintStep(3), 2500); // 2.5s: Oracle Validation
    setTimeout(() => {
      setMintStep(4); // Success
      setTimeout(() => {
         setMintingLeagueId(null);
         setMintStep(0);
         setActiveTab('war-room');
      }, 1000);
    }, 4000); // 4s: Complete
  };

  return (
    <div className="flex flex-col gap-8 h-full animate-in slide-in-from-bottom duration-700">
      
      {/* Mode Selector Tabs */}
      <div className="flex gap-4 p-1 bg-slate-900/80 border border-slate-800 rounded-lg">
        {[
          { id: 'daily', label: 'DAILY BLITZ', theme: 'cyan' },
          { id: 'weekly', label: 'WEEKLY GRIND', theme: 'pink' },
          { id: 'season', label: 'SEASON DYNASTY', theme: 'orange' }
        ].map(m => (
          <button 
            key={m.id}
            onClick={() => setMode(m.id as any)}
            className={`flex-1 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all rounded-md ${
              mode === m.id 
                ? `bg-slate-800 text-white shadow-inner border border-slate-700` 
                : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll pr-4 space-y-6">
        <div className="flex justify-between items-center mb-2">
           <h2 className="text-xl font-black text-white uppercase tracking-[0.2em]">DRAFT_ROOMS</h2>
           <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Active_Sessions: 12</span>
        </div>

        {MOCK_LEAGUES.map(league => {
          const isFull = league.members >= league.maxMembers;
          const isMinting = mintingLeagueId === league.id;

          return (
          <div 
            key={league.id}
            className={`group relative overflow-hidden bg-slate-900/40 border ${isMinting ? 'border-[#39ff14] shadow-[0_0_20px_rgba(57,255,20,0.1)]' : 'border-slate-800 hover:border-cyan-500/50'} p-8 flex flex-col md:flex-row items-center gap-10 transition-all cursor-pointer`}
            onClick={() => !isMinting && isFull && setActiveTab('war-room')}
          >
            {/* Glossy card overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>
            
            <div className={`w-24 h-24 bg-slate-900 border-2 ${isMinting ? 'border-[#39ff14] animate-pulse' : 'border-slate-800'} rounded-full flex items-center justify-center text-5xl shadow-xl transition-transform${!isMinting ? ' group-hover:scale-110' : ''}`}>
               {league.sport === 'NFL' ? '🏈' : '🏀'}
            </div>

            <div className="flex-1 text-center md:text-left">
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-1">{league.name}</h3>
              <div className="flex gap-6 justify-center md:justify-start">
                <span className="text-[11px] text-cyan-400 font-bold uppercase tracking-[0.2em]">{league.status}</span>
                <span className="font-mono text-[11px] text-slate-500 tracking-widest uppercase">NODE_POOL: {league.members}/{league.maxMembers}</span>
              </div>
              <div className="grid grid-cols-3 gap-8 mt-6 max-w-sm font-mono text-[10px] text-slate-400 uppercase tracking-widest">
                <div>
                  <p className="text-slate-600 mb-0.5">ENTRY</p>
                  <p className="text-white font-bold">{league.entryFee} {league.entryCurrency}</p>
                </div>
                <div>
                  <p className="text-slate-600 mb-0.5">PRIZE</p>
                  <p className="text-green-400 font-bold">{league.prizePool}</p>
                </div>
                <div>
                  <p className="text-slate-600 mb-0.5">VOTES</p>
                  <p className="text-orange-500 font-bold">{league.activeVotes} ACTIVE</p>
                </div>
              </div>
            </div>

            {isMinting ? (
              <div className="flex flex-col items-end gap-2 w-48">
                <span className={`text-[10px] font-mono font-bold tracking-widest uppercase ${mintStep === 4 ? 'text-[#39ff14]' : 'text-slate-300'}`}>
                  {mintStep === 1 && '1/3 GEN_METADATA...'}
                  {mintStep === 2 && '2/3 AWAIT_ORACLE...'}
                  {mintStep === 3 && '3/3 SIGNING_TX...'}
                  {mintStep === 4 && 'TX SUCCESS!'}
                </span>
                <div className="w-full h-1 bg-slate-800 overflow-hidden">
                  <div className="h-full bg-[#39ff14] transition-all duration-500 ease-out" style={{ width: `${(mintStep / 3) * 100}%` }}></div>
                </div>
              </div>
            ) : isFull ? (
               <button className="bg-[#00f2ff] px-10 py-4 text-[12px] font-black uppercase tracking-[0.3em] text-black hover:bg-white transition-all">
                 MANAGE_TEAM
               </button>
            ) : (
               <button 
                  onClick={(e) => handleMintPass(league.id, e)}
                  className="bg-transparent border border-[#39ff14]/50 px-8 py-4 text-[12px] font-black uppercase tracking-[0.2em] text-[#39ff14] hover:bg-[#39ff14] hover:text-black transition-all flex items-center gap-2"
               >
                 <span className="text-[14px]">❖</span> MINT_PASS
               </button>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
};

export default Lobby;
