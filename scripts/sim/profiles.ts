import { TechId } from '../../src/core/types.ts';
import type { SimProfile } from './types.ts';

const BALANCED_PRIORITY: TechId[] = [
  TechId.CheaperRoads,
  TechId.FasterTrucks,
  TechId.LargerStations,
  TechId.DoubleCapacity,
  TechId.ExpressTrucks,
  TechId.BulkTerminals,
  TechId.EfficientRoutes,
  TechId.MassTransit,
  TechId.AutoLoader,
  TechId.NightFreight,
];

const FRUGAL_PRIORITY: TechId[] = [
  TechId.CheaperRoads,
  TechId.FuelEfficiency,
  TechId.LargerStations,
  TechId.MaintenanceDept,
  TechId.BulkNetwork,
  TechId.DirectDelivery,
  TechId.BulkTerminals,
  TechId.NightFreight,
  TechId.BulkDiscount,
  TechId.SupplyChainAI,
];

const AGGRESSIVE_PRIORITY: TechId[] = [
  TechId.FasterTrucks,
  TechId.CheaperRoads,
  TechId.ExpressTrucks,
  TechId.DoubleCapacity,
  TechId.EfficientRoutes,
  TechId.MassTransit,
  TechId.GreenRoutes,
  TechId.AutoLoader,
  TechId.FossilSurge,
  TechId.SupplyChainAI,
];

export const SIM_PROFILES: SimProfile[] = [
  {
    id: 'balanced',
    name: 'Balanced Dispatcher',
    description: 'Builds steadily, keeps some cash in reserve, and prefers reliable truck upgrades.',
    techPriority: BALANCED_PRIORITY,
    thinkInterval: 10,
    routeTruckCap: 3,
    reserveBase: 25_000,
    reserveForExpansion: 55_000,
    hesitationChance: 0.08,
    techDelayChance: 0.18,
    candidatePool: 3,
    roadCostWeight: 0.85,
  },
  {
    id: 'frugal',
    name: 'Frugal Planner',
    description: 'Buys cheaper infrastructure first and delays extra trucks until routes pay for themselves.',
    techPriority: FRUGAL_PRIORITY,
    thinkInterval: 12,
    routeTruckCap: 2,
    reserveBase: 40_000,
    reserveForExpansion: 70_000,
    hesitationChance: 0.14,
    techDelayChance: 0.28,
    candidatePool: 2,
    roadCostWeight: 1.15,
  },
  {
    id: 'aggressive',
    name: 'Aggressive Operator',
    description: 'Expands fast, pushes truck counts harder, and accepts tighter cash buffers.',
    techPriority: AGGRESSIVE_PRIORITY,
    thinkInterval: 8,
    routeTruckCap: 4,
    reserveBase: 12_000,
    reserveForExpansion: 35_000,
    hesitationChance: 0.04,
    techDelayChance: 0.08,
    candidatePool: 4,
    roadCostWeight: 0.65,
  },
];

export function getProfiles(filter?: string): SimProfile[] {
  if (!filter || filter === 'all') return SIM_PROFILES;
  return SIM_PROFILES.filter((profile) => profile.id === filter);
}
