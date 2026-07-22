
import { Position, Player, LeagueDAO, Contest, Strategy, ScoreMetrics } from './types';

export const MOCK_PLAYERS: Player[] = [
  { id: '1', name: 'Patrick Mahomes', team: 'KC', position: Position.QB, salary: 9500, ownership: 32, lastScore: 24.5, projVal: 28.2, imageUrl: 'https://picsum.photos/200/200?random=1', isInjured: false, nftId: 'RB-001', matchupRating: 'FAVORABLE', matchupOpponent: 'LV', byeWeek: 10, adp: 15.2 },
  { id: '2', name: 'Christian McCaffrey', team: 'SF', position: Position.RB, salary: 10200, ownership: 75, lastScore: 31.2, projVal: 34.5, imageUrl: 'https://picsum.photos/200/200?random=2', isInjured: false, nftId: 'RB-002', matchupRating: 'FAVORABLE', matchupOpponent: 'ARI', byeWeek: 9, adp: 1.1 },
  { id: '3', name: 'Justin Jefferson', team: 'MIN', position: Position.WR, salary: 8800, ownership: 55, lastScore: 19.8, projVal: 22.1, imageUrl: 'https://picsum.photos/200/200?random=3', isInjured: false, nftId: 'RB-003', matchupRating: 'NEUTRAL', matchupOpponent: 'GB', byeWeek: 13, adp: 2.5 },
  { id: '4', name: 'Travis Kelce', team: 'KC', position: Position.TE, salary: 7600, ownership: 22, lastScore: 15.4, projVal: 18.0, imageUrl: 'https://picsum.photos/200/200?random=4', isInjured: false, nftId: 'RB-004', matchupRating: 'UNFAVORABLE', matchupOpponent: 'NE', byeWeek: 10, adp: 12.8 },
  { id: '5', name: 'Derrick Henry', team: 'BAL', position: Position.RB, salary: 8200, ownership: 15, lastScore: 22.1, projVal: 20.5, imageUrl: 'https://picsum.photos/200/200?random=5', isInjured: false, nftId: 'RB-005', matchupRating: 'FAVORABLE', matchupOpponent: 'IND', byeWeek: 13, adp: 22.4 },
  { id: '6', name: 'Tyreek Hill', team: 'MIA', position: Position.WR, salary: 9400, ownership: 40, lastScore: 27.2, projVal: 29.8, imageUrl: 'https://picsum.photos/200/200?random=7', isInjured: false, nftId: 'RB-007', matchupRating: 'UNFAVORABLE', matchupOpponent: 'NYJ', byeWeek: 10, adp: 4.2 },
  { id: '7', name: 'Josh Allen', team: 'BUF', position: Position.QB, salary: 9200, ownership: 35, lastScore: 26.5, projVal: 30.1, imageUrl: 'https://picsum.photos/200/200?random=8', isInjured: false, nftId: 'RB-008', matchupRating: 'NEUTRAL', matchupOpponent: 'MIA', byeWeek: 13, adp: 18.9 },
  { id: '8', name: 'Saquon Barkley', team: 'PHI', position: Position.RB, salary: 8900, ownership: 20, lastScore: 21.0, projVal: 23.5, imageUrl: 'https://picsum.photos/200/200?random=9', isInjured: false, nftId: 'RB-009', matchupRating: 'UNFAVORABLE', matchupOpponent: 'DAL', byeWeek: 10, adp: 16.5 },
];

export const STRATEGIES: Strategy[] = [
  { id: 'zero-rb', name: 'Zero RB', description: 'Ignore RBs early, stack elite WRs/TE.', icon: '🚫' },
  { id: 'robust-rb', name: 'Robust RB', description: 'Anchor your team with 2-3 top RBs early.', icon: '🐂' },
  { id: 'hero-rb', name: 'Hero RB', description: 'Take one elite RB, then hammer other positions.', icon: '🦸' },
  { id: 'stack-attack', name: 'Stack Attack', description: 'Pair QBs with their primary receivers.', icon: '🥞' },
  { id: 'balanced', name: 'Algorithm Balanced', description: 'Standard optimal allocation for cash games.', icon: '⚖️' },
];

export const MOCK_LEAGUES: LeagueDAO[] = [
  { id: 'L1', name: 'GRIDIRON GLORY', sport: 'NFL', entryFee: '0.25', entryCurrency: 'ETH', prizePool: '3.5 ETH', status: 'WEEKLY GRIND', treasury: 125000, members: 12, maxMembers: 12, rulesLocked: true, activeVotes: 1 },
  { id: 'L2', name: 'NEURAL DYNASTY', sport: 'NBA', entryFee: '1.5', entryCurrency: 'SOL', prizePool: '150 SOL', status: 'SEASON DYNASTY', treasury: 450000, members: 10, maxMembers: 10, rulesLocked: false, activeVotes: 3 },
  { id: 'L3', name: 'OMEGA SQUAD PUBLIC', sport: 'NFL', entryFee: '0.1', entryCurrency: 'ETH', prizePool: '1.2 ETH', status: 'PUBLIC OPEN', treasury: 0, members: 5, maxMembers: 12, rulesLocked: false, activeVotes: 0 },
];

export const MOCK_CONTESTS: Contest[] = [
  { id: 'C1', title: 'Daily Blitz', sport: 'NFL', entryFee: '0.1', entryCurrency: 'ETH', prizePool: '5 ETH', maxEntries: 100, currentEntries: 42, startTime: '1 HR', theme: 'pink' },
  { id: 'C2', title: 'Slam Dunk', sport: 'NBA', entryFee: '0.5', entryCurrency: 'SOL', prizePool: '25 SOL', maxEntries: 50, currentEntries: 48, startTime: 'LIVE', theme: 'blue' },
];

export const MOCK_SCORE_METRICS: ScoreMetrics = {
  totalSupply: 100000000,
  totalBurned: 12450890,
  lastBurnAmount: 4520,
  burnRate: 15, // 15% of rake goes to burn
};

export const MOCK_MARKET_DATA = {
  risers: [
    { ticker: 'P.MAHOMES', price: '$9,500', change: '+5.2%', trend: 'up' },
    { ticker: 'C.MCCAFFREY', price: '$10,200', change: '+8.1%', trend: 'up' },
    { ticker: 'J.ALLEN', price: '$9,200', change: '+12.4%', trend: 'up' },
    { ticker: 'SOL', price: '$245.2', change: '+4.5%', trend: 'up' },
    { ticker: '$SCORE', price: '$0.42', change: '+2.1%', trend: 'up' },
  ],
  losers: [
    { ticker: 'D.HENRY', price: '$8,200', change: '-4.2%', trend: 'down' },
    { ticker: 'T.KELCE', price: '$7,600', change: '-6.5%', trend: 'down' },
    { ticker: 'ETH', price: '$3,850', change: '-2.1%', trend: 'down' },
    { ticker: 'DRAT', price: '$0.12', change: '-15.4%', trend: 'down' },
  ],
  history: [
    { type: 'WIN', asset: 'ETH', amount: '2.2', date: '2025-04-01', id: 'tx_01' },
    { type: 'BURN', asset: '$SCORE', amount: '4520', date: '2025-04-02', id: 'tx_burn_01' },
    { type: 'ENTRY', asset: 'SOL', amount: '0.5', date: '2025-04-02', id: 'tx_02' },
  ]
};
