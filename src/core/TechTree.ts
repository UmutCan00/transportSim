import type { TechNode, GameState } from './types.ts';
import { TechId } from './types.ts';
import { canAfford, spend } from './Economy.ts';

export function createTechTree(): TechNode[] {
  return [
    // ── Tier 1 ─────────────────────────────────────────────
    {
      id: TechId.FasterTrucks,
      name: 'Faster Trucks',
      description: 'Upgrade engine tech. All trucks move +50% faster.',
      cost: 20_000,
      tier: 1,
      requires: [],
      unlocked: false,
      icon: '🚀',
    },
    {
      id: TechId.LargerStations,
      name: 'Larger Stations',
      description: 'Expand station platforms. Station cargo capacity ×2.',
      cost: 25_000,
      tier: 1,
      requires: [],
      unlocked: false,
      icon: '🏛️',
    },
    {
      id: TechId.CheaperRoads,
      name: 'Cheaper Roads',
      description: 'Better construction methods. Roads cost 50% less.',
      cost: 15_000,
      tier: 1,
      requires: [],
      unlocked: false,
      icon: '🛣️',
    },

    // ── Tier 2 ─────────────────────────────────────────────
    {
      id: TechId.DoubleCapacity,
      name: 'Double Capacity',
      description: 'Larger truck beds. Each truck carries ×2 cargo.',
      cost: 40_000,
      tier: 2,
      requires: [TechId.FasterTrucks],
      unlocked: false,
      icon: '📦',
    },
    {
      id: TechId.ExpressTrucks,
      name: 'Express Trucks',
      description: 'Supercharged fleet. Trucks move ×2.5 base speed.',
      cost: 50_000,
      tier: 2,
      requires: [TechId.FasterTrucks],
      unlocked: false,
      icon: '⚡',
    },
    {
      id: TechId.BulkTerminals,
      name: 'Bulk Terminals',
      description: 'Industrial-scale loading. Station capacity ×4 total.',
      cost: 45_000,
      tier: 2,
      requires: [TechId.LargerStations],
      unlocked: false,
      icon: '🏗️',
    },

    // ── Tier 3 ─────────────────────────────────────────────
    {
      id: TechId.AutoLoader,
      name: 'Auto-Loader',
      description: 'Automated cargo handling. Trucks load/unload instantly.',
      cost: 80_000,
      tier: 3,
      requires: [TechId.DoubleCapacity, TechId.BulkTerminals],
      unlocked: false,
      icon: '🤖',
    },
    {
      id: TechId.EfficientRoutes,
      name: 'Efficient Routes',
      description: 'AI route optimisation. +25% delivery income on all routes.',
      cost: 70_000,
      tier: 3,
      requires: [TechId.ExpressTrucks],
      unlocked: false,
      icon: '🗺️',
    },
    {
      id: TechId.MassTransit,
      name: 'Mass Transit',
      description: 'Fleet expansion protocols. New trucks cost 50% less.',
      cost: 60_000,
      tier: 3,
      requires: [TechId.ExpressTrucks, TechId.BulkTerminals],
      unlocked: false,
      icon: '🚌',
    },
    {
      id: TechId.Railway,
      name: 'Railway Engineering',
      description: 'Build rail tracks & buy Locomotives. 3× capacity, 2× speed vs trucks.',
      cost: 80_000,
      tier: 3,
      requires: [TechId.EfficientRoutes],
      unlocked: false,
      icon: '🚂',
    },
    {
      id: TechId.Bridging,
      name: 'Bridging',
      description: 'Build bridges over water tiles. Cost $1,800/tile. Opens water crossings.',
      cost: 30_000,
      tier: 2,
      requires: [TechId.CheaperRoads],
      unlocked: false,
      icon: '🌉',
    },
    {
      id: TechId.Tunneling,
      name: 'Tunneling',
      description: 'Drill tunnels through mountains. Cost $5,000/tile. Opens mountain routes.',
      cost: 65_000,
      tier: 3,
      requires: [TechId.Bridging],
      unlocked: false,
      icon: '⛏️',
    },
    {
      id: TechId.Aviation,
      name: 'Aviation',
      description: 'Unlock Airports & Planes. Planes fly direct between airports — no roads needed. Fast city-to-city cargo.',
      cost: 60_000,
      tier: 2,
      requires: [TechId.FasterTrucks],
      unlocked: false,
      icon: '✈️',
    },
    {
      id: TechId.Maritime,
      name: 'Maritime Shipping',
      description: 'Unlock Seaports & Ships. Ships carry 80 units and sail via water tiles — cheapest per-unit cost.',
      cost: 55_000,
      tier: 2,
      requires: [TechId.Bridging],
      unlocked: false,
      icon: '⛴️',
    },
  ];
}

/** True when all prerequisite techs are researched (ignores affordability). */
export function prereqsMet(state: GameState, techId: TechId): boolean {
  const node = state.tech.find((t) => t.id === techId);
  if (!node || node.unlocked) return false;
  return node.requires.every((req) => state.tech.find((t) => t.id === req)?.unlocked === true);
}

export function canUnlock(state: GameState, techId: TechId): boolean {
  const node = state.tech.find((t) => t.id === techId);
  if (!node || node.unlocked) return false;
  if (!canAfford(state.economy, node.cost)) return false;
  return prereqsMet(state, techId);
}

/** Convenience: is Railway tech researched? */
export function isRailwayUnlocked(state: GameState): boolean {
  return state.tech.find((t) => t.id === TechId.Railway)?.unlocked === true;
}

/** Convenience: is Bridging tech researched? */
export function isBridgingUnlocked(state: GameState): boolean {
  return state.tech.find((t) => t.id === TechId.Bridging)?.unlocked === true;
}

/** Convenience: is Tunneling tech researched? */
export function isTunnelingUnlocked(state: GameState): boolean {
  return state.tech.find((t) => t.id === TechId.Tunneling)?.unlocked === true;
}

/** Convenience: is Aviation tech researched? */
export function isAviationUnlocked(state: GameState): boolean {
  return state.tech.find((t) => t.id === TechId.Aviation)?.unlocked === true;
}

/** Convenience: is Maritime tech researched? */
export function isMaritimeUnlocked(state: GameState): boolean {
  return state.tech.find((t) => t.id === TechId.Maritime)?.unlocked === true;
}

export function unlockTech(state: GameState, techId: TechId): boolean {
  if (!canUnlock(state, techId)) return false;
  const node = state.tech.find((t) => t.id === techId)!;
  spend(state.economy, node.cost);
  node.unlocked = true;
  return true;
}

/** Derive current truck speed multiplier from unlocked techs */
export function getTruckSpeedMult(state: GameState): number {
  let mult = 1;
  if (isUnlocked(state, TechId.FasterTrucks)) mult *= 1.5;
  if (isUnlocked(state, TechId.ExpressTrucks)) mult *= (2.5 / 1.5); // stacks with FasterTrucks
  return mult;
}

export function getTruckCapacityMult(state: GameState): number {
  return isUnlocked(state, TechId.DoubleCapacity) ? 2 : 1;
}

export function getStationCapacityMult(state: GameState): number {
  if (isUnlocked(state, TechId.BulkTerminals)) return 4;
  if (isUnlocked(state, TechId.LargerStations)) return 2;
  return 1;
}

export function getRoadCostMult(state: GameState): number {
  return isUnlocked(state, TechId.CheaperRoads) ? 0.5 : 1;
}

export function getDeliveryRewardMult(state: GameState): number {
  return isUnlocked(state, TechId.EfficientRoutes) ? 1.25 : 1;
}

export function getTruckCostMult(state: GameState): number {
  return isUnlocked(state, TechId.MassTransit) ? 0.5 : 1;
}

export function isAutoLoaderActive(state: GameState): boolean {
  return isUnlocked(state, TechId.AutoLoader);
}

function isUnlocked(state: GameState, id: TechId): boolean {
  return state.tech.find((t) => t.id === id)?.unlocked === true;
}
