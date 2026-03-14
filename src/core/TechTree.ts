import type { TechNode, GameState } from './types.ts';
import { TechId } from './types.ts';
import { canAfford, spend } from './Economy.ts';

/*
  Tech tree layout — 40 items across 11 columns (0-10) and 5 rows (0-4)
  * = exclusive group

  Row 0: CheaperRoads(1)  FasterTrucks(4)  LargerStations(7)  FuelEfficiency(9)  ContainerSystem(10)
  Row 1: Bridging(0) HighwayNet(1)* BulkNetwork(2)* Railway(3) ExpressTrucks(4)* HeavyHaulers(5)* Aviation(6) BulkTerminals(7) MaintenanceDept(8) FreightInsurance(9)* DirectDelivery(10)*
  Row 2: Maritime(0) Tunneling(1)           FreightYard(3)* ExpressLine(4)*  DoubleCapacity(5)  AdvancedAviation(6) AutoLoader(7) NightFreight(8) ColdChain(9)* BulkDiscount(10)*
  Row 3: DeepSea(0)  Electrification(1)*  FossilSurge(2)*  MassTransit(3)  EfficientRoutes(4)  GreenRoutes(5)                                                PassengerPlus(8)* CargoNetwork(9)*
  Row 4: GlobalLogistics(0)                              MaglevRail(3)*  HyperCargo(4)*            HeavyLift(6)*  RapidCargo(7)*         SupplyChainAI(9)
*/

export function createTechTree(): TechNode[] {
  return [
    // ── Row 0: Roots ────────────────────────────────────
    {
      id: TechId.CheaperRoads,
      name: 'Road Construction',
      description: 'Better construction methods. Roads cost 40% less to build.',
      cost: 15_000,
      tier: 1,
      requires: [],
      unlocked: false,
      icon: '🛣️',
      treeRow: 0,
      treeCol: 1,
    },
    {
      id: TechId.FasterTrucks,
      name: 'Truck Engineering',
      description: 'Upgraded drivetrains. All basic trucks move +50% faster.',
      cost: 20_000,
      tier: 1,
      requires: [],
      unlocked: false,
      icon: '🚀',
      treeRow: 0,
      treeCol: 4,
    },
    {
      id: TechId.LargerStations,
      name: 'Station Expansion',
      description: 'Larger platforms & warehouses. Station cargo capacity ×2.',
      cost: 25_000, tier: 1, requires: [], unlocked: false, icon: '🏛️',
      treeRow: 0, treeCol: 7,
    },
    {
      id: TechId.FuelEfficiency,
      name: 'Fuel Efficiency',
      description: 'Optimized engines & logistics. Vehicle purchase costs −20%.',
      cost: 18_000, tier: 1, requires: [], unlocked: false, icon: '⛽',
      treeRow: 0, treeCol: 9,
    },
    {
      id: TechId.ContainerSystem,
      name: 'Container System',
      description: 'Standardized ISO containers. Station capacity ×1.2 bonus (stacks).',
      cost: 22_000, tier: 1, requires: [], unlocked: false, icon: '📫',
      treeRow: 0, treeCol: 10,
    },

    // ── Row 1 ────────────────────────────────────────────
    {
      id: TechId.Bridging,
      name: 'Bridging',
      description: 'Build bridges over water tiles. Cost $1,800/tile.',
      cost: 30_000, tier: 2, requires: [TechId.CheaperRoads], unlocked: false, icon: '🌉',
      treeRow: 1, treeCol: 0,
    },
    {
      id: TechId.HighwayNet,
      name: 'Highway Network',
      description: '⚡ FAST ROADS: Trucks gain +30% speed on road tiles.\nMutually exclusive with Bulk Network.',
      cost: 40_000, tier: 2, requires: [TechId.CheaperRoads], unlocked: false, icon: '🏎️',
      exclusiveGroup: 'road_branch', treeRow: 1, treeCol: 1,
    },
    {
      id: TechId.BulkNetwork,
      name: 'Bulk Network',
      description: '📦 BULK ROADS: Station capacity +50%. Roads 60% cheaper.\nMutually exclusive with Highway Network.',
      cost: 38_000, tier: 2, requires: [TechId.CheaperRoads], unlocked: false, icon: '🏗️',
      exclusiveGroup: 'road_branch', treeRow: 1, treeCol: 2,
    },
    {
      id: TechId.Railway,
      name: 'Railway Engineering',
      description: 'Build rail tracks & buy Freight Trains. 3× capacity, 2× speed vs trucks.',
      cost: 80_000, tier: 2, requires: [TechId.CheaperRoads, TechId.FasterTrucks], unlocked: false, icon: '🚂',
      treeRow: 1, treeCol: 3,
    },
    {
      id: TechId.ExpressTrucks,
      name: 'Express Fleet',
      description: '⚡ SPEED: Supercharged trucks. All trucks ×2 speed.\nMutually exclusive with Heavy Haulers.',
      cost: 50_000, tier: 2, requires: [TechId.FasterTrucks], unlocked: false, icon: '⚡',
      exclusiveGroup: 'truck_branch', treeRow: 1, treeCol: 4,
    },
    {
      id: TechId.HeavyHaulers,
      name: 'Heavy Haulers',
      description: '📦 CAPACITY: Reinforced truck beds. Trucks carry ×2.5 cargo, −20% speed.\nMutually exclusive with Express Fleet.',
      cost: 48_000, tier: 2, requires: [TechId.FasterTrucks], unlocked: false, icon: '🚛',
      exclusiveGroup: 'truck_branch', treeRow: 1, treeCol: 5,
    },
    {
      id: TechId.Aviation,
      name: 'Aviation',
      description: 'Unlock Airports & Planes. Planes fly direct between airports — no roads needed.',
      cost: 60_000, tier: 2, requires: [TechId.FasterTrucks], unlocked: false, icon: '✈️',
      treeRow: 1, treeCol: 6,
    },
    {
      id: TechId.BulkTerminals,
      name: 'Bulk Terminals',
      description: 'Industrial-scale loading infrastructure. Station capacity ×4 total.',
      cost: 45_000, tier: 2, requires: [TechId.LargerStations], unlocked: false, icon: '🏗️',
      treeRow: 1, treeCol: 7,
    },
    {
      id: TechId.MaintenanceDept,
      name: 'Maintenance Dept.',
      description: 'In-house crews for routine checks. Periodic maintenance costs −50%.',
      cost: 35_000, tier: 2, requires: [TechId.LargerStations], unlocked: false, icon: '🔧',
      treeRow: 1, treeCol: 8,
    },
    {
      id: TechId.FreightInsurance,
      name: 'Freight Insurance',
      description: '💰 REVENUE: Insured deliveries earn +15% more.\nMutually exclusive with Direct Delivery.',
      cost: 42_000, tier: 2, requires: [TechId.FuelEfficiency], unlocked: false, icon: '📋',
      exclusiveGroup: 'finance_branch', treeRow: 1, treeCol: 9,
    },
    {
      id: TechId.DirectDelivery,
      name: 'Direct Delivery',
      description: '⚡ CONTRACTS: Priority routing. Delivery reward +20%, truck speed −5%.\nMutually exclusive with Freight Insurance.',
      cost: 44_000, tier: 2, requires: [TechId.FuelEfficiency], unlocked: false, icon: '🎯',
      exclusiveGroup: 'finance_branch', treeRow: 1, treeCol: 10,
    },

    // ── Row 2 ────────────────────────────────────────────
    {
      id: TechId.Maritime,
      name: 'Maritime Shipping',
      description: 'Unlock Seaports & Ships. Ships carry 80+ units via water tiles.',
      cost: 55_000, tier: 2, requires: [TechId.Bridging], unlocked: false, icon: '⛴️',
      treeRow: 2, treeCol: 0,
    },
    {
      id: TechId.Tunneling,
      name: 'Tunneling',
      description: 'Drill tunnels through mountains. Cost $5,000/tile.',
      cost: 65_000, tier: 3, requires: [TechId.Bridging], unlocked: false, icon: '⛏️',
      treeRow: 2, treeCol: 1,
    },
    {
      id: TechId.FreightYard,
      name: 'Freight Yard',
      description: '📦 RAIL CAPACITY: Freight trains carry 2× cargo.\nMutually exclusive with Express Line.',
      cost: 70_000, tier: 3, requires: [TechId.Railway], unlocked: false, icon: '🏭',
      exclusiveGroup: 'rail_branch', treeRow: 2, treeCol: 3,
    },
    {
      id: TechId.ExpressLine,
      name: 'Express Line',
      description: '⚡ RAIL SPEED: Express trains move 80% faster.\nMutually exclusive with Freight Yard.',
      cost: 75_000, tier: 3, requires: [TechId.Railway], unlocked: false, icon: '🚄',
      exclusiveGroup: 'rail_branch', treeRow: 2, treeCol: 4,
    },
    {
      id: TechId.DoubleCapacity,
      name: 'Double Capacity',
      description: 'Advanced vehicle loading tech. Trucks carry ×2 cargo.',
      cost: 60_000, tier: 3, requires: [TechId.ExpressTrucks], unlocked: false, icon: '📦',
      treeRow: 2, treeCol: 5,
    },
    {
      id: TechId.AdvancedAviation,
      name: 'Advanced Aviation',
      description: 'Unlocks Cargo Planes and Jumbo Jets at airports.',
      cost: 90_000, tier: 3, requires: [TechId.Aviation], unlocked: false, icon: '🛫',
      treeRow: 2, treeCol: 6,
    },
    {
      id: TechId.AutoLoader,
      name: 'Auto-Loader',
      description: 'Automated cargo handling. All vehicles load/unload instantly.',
      cost: 80_000, tier: 3, requires: [TechId.DoubleCapacity, TechId.BulkTerminals], unlocked: false, icon: '🤖',
      treeRow: 2, treeCol: 7,
    },
    {
      id: TechId.NightFreight,
      name: 'Night Freight',
      description: 'Round-the-clock operations. Delivery income +10%, maintenance −20%.',
      cost: 55_000, tier: 3, requires: [TechId.MaintenanceDept], unlocked: false, icon: '🌙',
      treeRow: 2, treeCol: 8,
    },
    {
      id: TechId.ColdChain,
      name: 'Cold Chain',
      description: '❄️ FOOD BONUS: Refrigerated transport. Food & Grain deliveries earn +50%.\nMutually exclusive with Bulk Discount.',
      cost: 68_000, tier: 3, requires: [TechId.FreightInsurance], unlocked: false, icon: '❄️',
      exclusiveGroup: 'cargo_focus', treeRow: 2, treeCol: 9,
    },
    {
      id: TechId.BulkDiscount,
      name: 'Bulk Discount',
      description: '⛏️ BULK BONUS: Volume contracts. Coal, Steel & Oil deliveries earn +30%.\nMutually exclusive with Cold Chain.',
      cost: 65_000, tier: 3, requires: [TechId.DirectDelivery], unlocked: false, icon: '⚙️',
      exclusiveGroup: 'cargo_focus', treeRow: 2, treeCol: 10,
    },

    // ── Row 3 ────────────────────────────────────────────
    {
      id: TechId.DeepSea,
      name: 'Deep Sea Shipping',
      description: 'Unlocks Cargo Ships and Supertankers at seaports.',
      cost: 95_000, tier: 3, requires: [TechId.Maritime], unlocked: false, icon: '🛳️',
      treeRow: 3, treeCol: 0,
    },
    {
      id: TechId.Electrification,
      name: 'Electrification',
      description: '⚡ POWER: Electric vehicles. Truck speed +20%, maintenance −20%.\nMutually exclusive with Fossil Surge.',
      cost: 85_000, tier: 3, requires: [TechId.Tunneling], unlocked: false, icon: '🔋',
      exclusiveGroup: 'power_branch', treeRow: 3, treeCol: 1,
    },
    {
      id: TechId.FossilSurge,
      name: 'Fossil Surge',
      description: '🔥 POWER: Turbocharged diesels. Truck speed +35%, capacity +15%.\nMutually exclusive with Electrification.',
      cost: 80_000, tier: 3, requires: [TechId.Tunneling], unlocked: false, icon: '🛢️',
      exclusiveGroup: 'power_branch', treeRow: 3, treeCol: 2,
    },
    {
      id: TechId.MassTransit,
      name: 'Mass Transit',
      description: 'Fleet expansion protocols. New vehicles cost 50% less.',
      cost: 60_000, tier: 3, requires: [TechId.Railway], unlocked: false, icon: '🚌',
      treeRow: 3, treeCol: 3,
    },
    {
      id: TechId.EfficientRoutes,
      name: 'Efficient Routes',
      description: 'AI route optimisation. +25% delivery income on all deliveries.',
      cost: 70_000, tier: 3, requires: [TechId.ExpressTrucks], unlocked: false, icon: '🗺️',
      treeRow: 3, treeCol: 4,
    },
    {
      id: TechId.GreenRoutes,
      name: 'Green Routes',
      description: 'Eco-certified supply chains attract premium contracts. +10% all delivery income.',
      cost: 75_000, tier: 3, requires: [TechId.EfficientRoutes], unlocked: false, icon: '🌿',
      treeRow: 3, treeCol: 5,
    },
    {
      id: TechId.PassengerPlus,
      name: 'Passenger Plus',
      description: '🚉 PAX BONUS: Premium passenger services. Passenger deliveries earn +50%.\nMutually exclusive with Cargo Network.',
      cost: 90_000, tier: 3, requires: [TechId.AdvancedAviation, TechId.NightFreight], unlocked: false, icon: '🎫',
      exclusiveGroup: 'pax_branch', treeRow: 3, treeCol: 8,
    },
    {
      id: TechId.CargoNetwork,
      name: 'Cargo Network',
      description: '📦 CARGO BONUS: Optimized freight. All non-passenger cargo earns +20%.\nMutually exclusive with Passenger Plus.',
      cost: 88_000, tier: 3, requires: [TechId.DeepSea, TechId.BulkDiscount], unlocked: false, icon: '📊',
      exclusiveGroup: 'pax_branch', treeRow: 3, treeCol: 9,
    },

    // ── Row 4: Endgame ────────────────────────────────────
    {
      id: TechId.GlobalLogistics,
      name: 'Global Logistics',
      description: 'International trade agreements. All delivery income +25%.',
      cost: 150_000, tier: 3, requires: [TechId.DeepSea], unlocked: false, icon: '🌍',
      treeRow: 4, treeCol: 0,
    },
    {
      id: TechId.MaglevRail,
      name: 'Maglev Rail',
      description: '⚡ ENDGAME: Magnetic levitation trains. Locomotive speed ×2.5.\nMutually exclusive with Hyper Cargo.',
      cost: 200_000, tier: 3, requires: [TechId.ExpressLine], unlocked: false, icon: '🚅',
      exclusiveGroup: 'endgame_rail', treeRow: 4, treeCol: 3,
    },
    {
      id: TechId.HyperCargo,
      name: 'Hyper Cargo',
      description: '📦 ENDGAME: Mega-freight trains. Locomotive capacity ×3.\nMutually exclusive with Maglev Rail.',
      cost: 180_000, tier: 3, requires: [TechId.FreightYard], unlocked: false, icon: '🚃',
      exclusiveGroup: 'endgame_rail', treeRow: 4, treeCol: 4,
    },
    {
      id: TechId.HeavyLift,
      name: 'Heavy Lift',
      description: '✈ ENDGAME: Supertransport aircraft. Plane capacity ×2.\nMutually exclusive with Rapid Cargo.',
      cost: 160_000, tier: 3, requires: [TechId.AdvancedAviation], unlocked: false, icon: '🛩️',
      exclusiveGroup: 'aviation_end', treeRow: 4, treeCol: 6,
    },
    {
      id: TechId.RapidCargo,
      name: 'Rapid Cargo',
      description: '⚡ ENDGAME: Hypersonic freight planes. Plane speed ×1.8.\nMutually exclusive with Heavy Lift.',
      cost: 155_000, tier: 3, requires: [TechId.AdvancedAviation], unlocked: false, icon: '🛸',
      exclusiveGroup: 'aviation_end', treeRow: 4, treeCol: 7,
    },
    {
      id: TechId.SupplyChainAI,
      name: 'Supply Chain AI',
      description: 'Neural-network route optimizer. All delivery income +20%.',
      cost: 170_000, tier: 3, requires: [TechId.AutoLoader, TechId.NightFreight], unlocked: false, icon: '🧠',
      treeRow: 4, treeCol: 9,
    },
  ];
}

/** True when all prerequisite techs are researched (ignores affordability). */
export function prereqsMet(state: GameState, techId: TechId): boolean {
  const node = state.tech.find((t) => t.id === techId);
  if (!node || node.unlocked) return false;
  return node.requires.every((req) => state.tech.find((t) => t.id === req)?.unlocked === true);
}

/** True if another tech in the same exclusive group is already unlocked */
export function isExclusivelyBlocked(state: GameState, techId: TechId): boolean {
  const node = state.tech.find((t) => t.id === techId);
  if (!node?.exclusiveGroup) return false;
  return state.tech.some(
    (t) => t.exclusiveGroup === node.exclusiveGroup && t.id !== techId && t.unlocked,
  );
}

export function canUnlock(state: GameState, techId: TechId): boolean {
  const node = state.tech.find((t) => t.id === techId);
  if (!node || node.unlocked) return false;
  if (!canAfford(state.economy, node.cost)) return false;
  if (isExclusivelyBlocked(state, techId)) return false;
  return prereqsMet(state, techId);
}

export function isRailwayUnlocked(state: GameState): boolean {
  return isUnlocked(state, TechId.Railway);
}
export function isBridgingUnlocked(state: GameState): boolean {
  return isUnlocked(state, TechId.Bridging);
}
export function isTunnelingUnlocked(state: GameState): boolean {
  return isUnlocked(state, TechId.Tunneling);
}
export function isAviationUnlocked(state: GameState): boolean {
  return isUnlocked(state, TechId.Aviation);
}
export function isMaritimeUnlocked(state: GameState): boolean {
  return isUnlocked(state, TechId.Maritime);
}
export function isAdvancedAviationUnlocked(state: GameState): boolean {
  return isUnlocked(state, TechId.AdvancedAviation);
}
export function isDeepSeaUnlocked(state: GameState): boolean {
  return isUnlocked(state, TechId.DeepSea);
}

export function unlockTech(state: GameState, techId: TechId): boolean {
  if (!canUnlock(state, techId)) return false;
  const node = state.tech.find((t) => t.id === techId)!;
  spend(state.economy, node.cost);
  node.unlocked = true;
  return true;
}

export function getTruckSpeedMult(state: GameState): number {
  let mult = 1;
  if (isUnlocked(state, TechId.FasterTrucks))     mult *= 1.5;
  if (isUnlocked(state, TechId.ExpressTrucks))    mult *= (2.0 / 1.5);
  if (isUnlocked(state, TechId.HighwayNet))       mult *= 1.3;
  if (isUnlocked(state, TechId.HeavyHaulers))     mult *= 0.80;  // penalty
  if (isUnlocked(state, TechId.Electrification))  mult *= 1.20;
  if (isUnlocked(state, TechId.FossilSurge))      mult *= 1.35;
  if (isUnlocked(state, TechId.DirectDelivery))   mult *= 0.95;  // penalty
  return mult;
}

export function getTruckCapacityMult(state: GameState): number {
  let mult = 1;
  if (isUnlocked(state, TechId.DoubleCapacity)) mult *= 2;
  if (isUnlocked(state, TechId.HeavyHaulers))   mult *= 2.5;
  if (isUnlocked(state, TechId.FossilSurge))    mult *= 1.15;
  return mult;
}

export function getStationCapacityMult(state: GameState): number {
  let mult = 1;
  if (isUnlocked(state, TechId.LargerStations))  mult = Math.max(mult, 2);
  if (isUnlocked(state, TechId.BulkNetwork))     mult = Math.max(mult, mult * 1.5);
  if (isUnlocked(state, TechId.BulkTerminals))   mult = Math.max(mult, 4);
  if (isUnlocked(state, TechId.ContainerSystem)) mult *= 1.2;
  if (isUnlocked(state, TechId.AutoLoader))      mult = Math.max(mult, 6);
  return mult;
}

export function getRoadCostMult(state: GameState): number {
  if (isUnlocked(state, TechId.BulkNetwork))  return 0.40;
  if (isUnlocked(state, TechId.CheaperRoads)) return 0.60;
  return 1;
}

export function getDeliveryRewardMult(state: GameState): number {
  let mult = 1;
  if (isUnlocked(state, TechId.EfficientRoutes))   mult *= 1.25;
  if (isUnlocked(state, TechId.GreenRoutes))       mult *= 1.10;
  if (isUnlocked(state, TechId.FreightInsurance))  mult *= 1.15;
  if (isUnlocked(state, TechId.DirectDelivery))    mult *= 1.20;
  if (isUnlocked(state, TechId.NightFreight))      mult *= 1.10;
  if (isUnlocked(state, TechId.GlobalLogistics))   mult *= 1.25;
  if (isUnlocked(state, TechId.SupplyChainAI))     mult *= 1.20;
  return mult;
}

export function getTruckCostMult(state: GameState): number {
  let mult = isUnlocked(state, TechId.MassTransit) ? 0.5 : 1;
  if (isUnlocked(state, TechId.FuelEfficiency)) mult *= 0.80;
  return mult;
}

export function isAutoLoaderActive(state: GameState): boolean {
  return isUnlocked(state, TechId.AutoLoader);
}

export function getLocomotiveSpeedMult(state: GameState): number {
  if (isUnlocked(state, TechId.MaglevRail))   return 2.5;
  if (isUnlocked(state, TechId.ExpressLine))  return 1.8;
  if (isUnlocked(state, TechId.Electrification)) return 1.15;
  return 1;
}

export function getLocomotiveCapacityMult(state: GameState): number {
  if (isUnlocked(state, TechId.HyperCargo))  return 3;
  if (isUnlocked(state, TechId.FreightYard)) return 2;
  return 1;
}

export function getMaintenanceMult(state: GameState): number {
  let mult = 1;
  if (isUnlocked(state, TechId.MaintenanceDept))  mult *= 0.5;
  if (isUnlocked(state, TechId.Electrification))  mult *= 0.8;
  if (isUnlocked(state, TechId.NightFreight))     mult *= 0.8;
  return mult;
}

export function getCargoDeliveryBonus(state: GameState, cargoType: string): number {
  if (isUnlocked(state, TechId.ColdChain) &&
      (cargoType === 'food' || cargoType === 'grain')) return 1.5;
  if (isUnlocked(state, TechId.BulkDiscount) &&
      (cargoType === 'coal' || cargoType === 'steel' || cargoType === 'oil')) return 1.3;
  if (isUnlocked(state, TechId.PassengerPlus) && cargoType === 'passengers') return 1.5;
  if (isUnlocked(state, TechId.CargoNetwork)  && cargoType !== 'passengers') return 1.2;
  return 1;
}

export function getPlaneCapacityMult(state: GameState): number {
  return isUnlocked(state, TechId.HeavyLift) ? 2.0 : 1;
}

export function getPlaneSpeedMult(state: GameState): number {
  return isUnlocked(state, TechId.RapidCargo) ? 1.8 : 1;
}

function isUnlocked(state: GameState, id: TechId): boolean {
  return state.tech.find((t) => t.id === id)?.unlocked === true;
}

