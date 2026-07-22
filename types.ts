
export enum Position {
  QB = 'QB',
  RB = 'RB',
  WR = 'WR',
  TE = 'TE',
  FLEX = 'FLEX',
  DST = 'DST'
}

export type UITheme = 'pink' | 'blue' | 'green' | 'orange' | 'magenta' | 'lime';

export interface Strategy {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface Player {
  id: string;
  name: string;
  team: string;
  position: Position;
  salary: number;
  ownership: number;
  lastScore: number;
  imageUrl: string;
  isInjured: boolean;
  nftId?: string;
  projVal?: number;
  matchupRating?: 'FAVORABLE' | 'UNFAVORABLE' | 'NEUTRAL';
  matchupOpponent?: string;
  byeWeek?: number;
  adp?: number;
}

export interface LeagueDAO {
  id: string;
  name: string;
  treasury: number;
  members: number;
  maxMembers: number;
  rulesLocked: boolean;
  activeVotes: number;
  status: string;
  sport: 'NFL' | 'NBA' | 'MLB';
  entryFee: string;
  entryCurrency: string;
  prizePool: string;
}

export interface Contest {
  id: string;
  title: string;
  sport: 'NFL' | 'NBA' | 'MLB';
  entryFee: string;
  entryCurrency: string;
  prizePool: string;
  maxEntries: number;
  currentEntries: number;
  startTime: string;
  theme: UITheme;
}

export interface WalletState {
  address: string;
  balanceETH: number;
  balanceSOL: number;
  balanceDRAT: number;
}

export interface ScoreMetrics {
  totalSupply: number;
  totalBurned: number;
  lastBurnAmount: number;
  burnRate: number; // percentage of rake
}
