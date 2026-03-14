import type { Difficulty, GameState, MapSize, Theme } from '../../src/core/types.ts';
import type { TechId } from '../../src/core/types.ts';

export interface SimProfile {
  id: string;
  name: string;
  description: string;
  techPriority: TechId[];
  thinkInterval: number;
  routeTruckCap: number;
  reserveBase: number;
  reserveForExpansion: number;
  hesitationChance: number;
  techDelayChance: number;
  candidatePool: number;
  roadCostWeight: number;
  railAffinity: number;
  airAffinity: number;
  seaAffinity: number;
  railDistanceThreshold: number;
  airDistanceThreshold: number;
  seaDistanceThreshold: number;
  modalRouteCap: number;
}

export type SimMode = 'road' | 'rail' | 'air' | 'sea';

export interface SimRunOptions {
  seed: number;
  ticks: number;
  verbose?: boolean;
  profile: SimProfile;
  mapSize?: MapSize;
  difficulty?: Difficulty;
  theme?: Theme;
}

export interface SpendBreakdown {
  roads: number;
  stations: number;
  depots: number;
  vehicles: number;
  tech: number;
}

export interface RouteRecord {
  routeId: number;
  mode: SimMode;
  pickupStation: number;
  dropoffStation: number;
  cargoType: string;
  label: string;
  setupTick: number;
  trucks: number;
}

export interface TechUnlockRecord {
  id: TechId;
  tick: number;
  cost: number;
}

export interface Snapshot {
  tick: number;
  money: number;
  totalEarned: number;
  deliveries: number;
  routes: number;
  trucks: number;
  techUnlocked: number;
  objectivesCompleted: number;
}

export interface SimRunResult {
  profile: SimProfile;
  seed: number;
  ticks: number;
  state: GameState;
  snapshots: Snapshot[];
  routeRecords: RouteRecord[];
  techUnlocks: TechUnlockRecord[];
  spends: SpendBreakdown;
  firstDeliveryTick: number;
  firstObjectiveTick: number;
  score: number;
  verdict: string;
}
