import React, { useState } from 'react';

const Architecture: React.FC = () => {
  const [activeModule, setActiveModule] = useState('dao');

  const modules = [
    { id: 'dao', label: 'League DAO', code: `// Module 1: The League DAO Smart Contract (Solana/Anchor)
use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod cryptosphere_league {
    use super::*;

    pub fn initialize_league(ctx: Context<InitializeLeague>, custom_scoring: ScoringConfig, roster_setup: RosterSettings) -> Result<()> {
        let league = &mut ctx.accounts.league;
        league.commissioner = *ctx.accounts.commissioner.key;
        league.treasury_vault = *ctx.accounts.treasury_vault.key;
        league.config = custom_scoring;
        league.roster_settings = roster_setup;
        Ok(())
    }

    pub fn initiate_vote(ctx: Context<ManageVote>, new_config: ScoringConfig) -> Result<()> {
        // Time-Locked Governance
        // Once season begins, variables lock on-chain.
        // Requires unanimous cryptographic vote to override.
        Ok(())
    }

    pub fn execute_vote(ctx: Context<ManageVote>) -> Result<()> {
        // Enforce >66% cryptographic signatures
        Ok(())
    }

    pub fn blind_bid(ctx: Context<WaiverWire>, hashed_bid: [u8; 32]) -> Result<()> {
        // Commit-reveal scheme for free agent acquisition
        // Prevents blockchain front-running on FAAB bids.
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeLeague<'info> {
    #[account(init, payer = commissioner, space = 8 + 32 + 32 + 64)]
    pub league: Account<'info, League>,
    #[account(mut)]
    pub commissioner: Signer<'info>,
    /// CHECK: PDA for treasury
    pub treasury_vault: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct League {
    pub commissioner: Pubkey,
    pub treasury_vault: Pubkey,
    pub config: ScoringConfig,
    pub roster_settings: RosterSettings,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ScoringConfig {
    pub passing_td_points: u8,
    pub rushing_td_points: u8,
    pub ppr: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct RosterSettings {
    pub qb_slots: u8,
    pub rb_slots: u8,
    pub wr_slots: u8,
    pub flex_slots: u8,
}` },
    { id: 'dfs', label: 'Mercenary DFS', code: `// Module 2: The Mercenary DFS Engine

#[program]
pub mod cryptosphere_dfs {
    use super::*;

    /// Calculate dynamic salary using an AMM bonding curve
    pub fn calculate_salary(base_price: u64, total_pool_ownership: u64)-> u64 {
        // AMM Model vs. Opaque Pricing Committee
        // As player demand rises, cost increases quadratically.
        // Rewards contrarian forecasting in real-time.
        let multiplier = (total_pool_ownership ^ 2) / 1000; 
        base_price + multiplier
    }

    /// Enter 150 lineups in one TX using batch compression
    pub fn mass_multi_entry(ctx: Context<MME>, compressed_lineups: Vec<[u16; 9]>) -> Result<()> {
        // DraftKings MME style efficiency.
        // Serialized to minimize Solana network load.
        let player = &mut ctx.accounts.player_profile;
        for lineup in compressed_lineups.iter() {
           // Verify salary cap constraints
           // Register lineup
        }
        Ok(())
    }

    /// The "Mercenary" Lending Pool Logic
    pub fn stake_dynasty_nft(ctx: Context<LendingPool>, player_nft_id: Pubkey) -> Result<()> {
        // Allows Season-Long managers to rent their NFTs to DFS players
        // during bye weeks, splitting the yield.
        Ok(())
    }
}` },
    { id: 'oracle', label: 'Oracle Integration', code: `// Module 3: Chainlink Functions Consumer (Oracle)
// JavaScript module for fetching SportsDataIO API stats

const playerStatsRequest = Functions.makeHttpRequest({
  url: "https://api.sportsdata.io/v3/nfl/stats/json/PlayerGameStatsByWeek/2026REG/1",
  headers: {
    "Ocp-Apim-Subscription-Key": secrets.sportsDataApiKey
  }
});

const [playerStatsResponse] = await Promise.all([playerStatsRequest]);

if (playerStatsResponse.error) {
  throw Error("Failed to fetch player stats");
}

const stats = playerStatsResponse.data;
// Hash and encrypt results, push to Solana program

return Functions.encodeUint256(Math.round(stats[0].FantasyPoints * 100));

// Rust Side: Stat correction window up to Thursday
pub fn correct_stats(ctx: Context<UpdateStats>, new_stats: u64) -> Result<()> {
    require!(Clock::get()?.unix_timestamp < THURSDAY_TIMESTAMP, ErrorCode::CorrectionWindowClosed);
    // Overwrite previous data before finalize_week
    Ok(())
}` },
    { id: 'geo', label: 'Geo-Compliance', code: `// Module 5: Geo-Compliance (React Native + Witness Chain)
import { useEffect, useState } from 'react';
import Geolocation from '@react-native-community/geolocation';

const RESTRICTED_STATES = ['WA', 'NV']; // GeoComply Standards

export const useGeoLocation = () => {
  const [allowed, setAllowed] = useState<boolean>(false);

  useEffect(() => {
    Geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        // Verify via external compliance API
        verifyLocation(latitude, longitude).then(isAllowed => {
           setAllowed(isAllowed);
        });
      },
      (error) => console.log(error),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 }
    );
  }, []);

  return allowed;
};

// Smart Contract Hook for Proof of Location
// Enforces Witness Chain verification before accepting wager` },
    { id: 'indexer', label: 'Backend Indexer', code: `// Module 6: Backend Indexer (Node.js)
// Listens to on-chain program events and syncs SQL logic for high-speed frontend retrieval.

import { Connection, PublicKey } from '@solana/web3.js';
import { Pool } from 'pg';

const connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const PROGRAM_ID = new PublicKey('Fg6...');

connection.onLogs(PROGRAM_ID, async (logs, ctx) => {
    // Detect LineupSubmitted events from on-chain logs
    if (logs.logs.some(l => l.includes('Instruction: MassMultiEntry'))) {
        const sig = logs.signature;
        const tx = await connection.getTransaction(sig);
        
        // Deserialize and insert into high-availability SQL cache
        await db.query(\`
            INSERT INTO lineups (tx_hash, user_wallet, players, block_time)
            VALUES ($1, $2, $3, $4)
        \`, [sig, tx.meta.userWallet, tx.meta.players, ctx.slot]);

        console.log(\`Indexed MME TX \${sig} successfully.\`);
    }
});` }
  ];

  return (
    <div className="grid grid-cols-12 gap-6 h-full animate-in fade-in duration-1000 pb-10">
      <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
        <h2 className="text-xl font-black uppercase text-pink-500 tracking-[0.3em] mb-4 border-b border-pink-500/20 pb-4">ARCHITECTURE_NODES</h2>
        
        <div className="flex flex-col gap-2 relative z-10">
          {modules.map(mod => (
            <button 
              key={mod.id}
              onClick={() => setActiveModule(mod.id)}
              className={`text-left p-4 border transition-all ${activeModule === mod.id ? 'border-pink-500 bg-pink-500/10 text-white shadow-[0_0_15px_rgba(255,0,255,0.2)]' : 'border-slate-800 text-slate-500 hover:border-pink-500/50'}`}
            >
              <div className="flex justify-between items-center">
                 <span className="font-mono text-[11px] uppercase tracking-widest">{mod.label}</span>
                 {activeModule === mod.id && <span className="text-pink-500 animate-pulse text-xs">●</span>}
              </div>
            </button>
          ))}
        </div>
        
        <div className="mt-6 p-6 bg-slate-900/50 border border-slate-800 relative group overflow-hidden">
           <div className="absolute top-0 right-0 w-16 h-16 bg-pink-500/10 rounded-bl-full translate-x-8 -translate-y-8 group-hover:bg-pink-500/20 transition-all"></div>
           <h3 className="text-[10px] text-[#00f2ff] font-black tracking-widest mb-4 uppercase flex items-center gap-2">
             <span className="text-[#00f2ff]">▍</span>
             Design Rationale (Why Solana?)
           </h3>
           <p className="text-[11px] text-slate-400 font-mono tracking-wide leading-relaxed space-y-3">
             <span className="block border-l-2 border-slate-700 pl-3"><strong>Speed & Cheap Fees:</strong> Replaces Ethereum to fulfill the 'high-frequency requirement'. Mass Multi-Entry (MME) demands &lt;1s latency.</span>
             <span className="block border-l-2 border-slate-700 pl-3"><strong>Trustless Escrow:</strong> Commissioner fraud is mathematically eliminated via DAO multisigs and Oracle-triggered automated logic.</span>
             <span className="block border-l-2 border-[#00f2ff] pl-3 text-slate-300"><strong>AMM Pricing:</strong> Resolves DraftKings' opaque pricing algorithms with transparent bonding curves responding directly to supply/demand.</span>
             <span className="block border-l-2 border-slate-700 pl-3"><strong>Coinbase Standard UX:</strong> Eliminates Web3 friction via backend indexers and account abstraction for retail users.</span>
           </p>
        </div>
      </div>

      <div className="col-span-12 lg:col-span-8 h-full flex flex-col pl-4">
        <div className="hologram-panel p-6 border-pink-500/30 flex-1 overflow-hidden flex flex-col bg-slate-950/80 relative shadow-[0_0_50px_rgba(255,0,255,0.05)]">
          <div className="corner-tr border-pink-400"></div>
          <div className="flex justify-between items-center mb-6 border-b border-pink-500/20 pb-4">
             <h3 className="text-sm text-pink-400 font-bold uppercase tracking-[0.3em]">CODE_VIEWER // {activeModule}</h3>
             <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
                <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_#00ff00]"></span>
                RUST_ENV_ACTIVE
             </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scroll bg-[#050510] border border-slate-800 p-6 rounded-sm">
            <pre className="text-[12px] font-mono leading-loose text-[#e6edf3] whitespace-pre-wrap">
              <code className="text-emerald-400">
                {modules.find(m => m.id === activeModule)?.code}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Architecture;
