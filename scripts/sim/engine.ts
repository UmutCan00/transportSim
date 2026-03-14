import { createInitialGameState, generateId } from '../../src/core/GameState.ts';
import { simulationTick } from '../../src/core/GameLoop.ts';
import {
  IndustryType,
  TileType,
  BuildingType,
  VehicleState,
} from '../../src/core/types.ts';
import type { Airport, CargoType, GameState, Industry, Seaport, Station, Vec2, Vehicle } from '../../src/core/types.ts';
import { createAirport, createDepot, createSeaport, createStation, createTrainYard, autoLinkStation } from '../../src/core/Building.ts';
import { canPlaceFootprint, hasAdjacentWater } from '../../src/core/Placement.ts';
import { createCargoPLane, createCargoShip, createLocomotive, createPlane, createShip, createVehicle } from '../../src/core/Vehicle.ts';
import { createRoute } from '../../src/core/Route.ts';
import { canAfford, spend } from '../../src/core/Economy.ts';
import { getTile, setTile, isBuildable, isInBounds } from '../../src/core/World.ts';
import {
  unlockTech, getRoadCostMult, getTruckCostMult,
  isRailwayUnlocked, isAviationUnlocked, isMaritimeUnlocked,
  isAdvancedAviationUnlocked, isDeepSeaUnlocked,
} from '../../src/core/TechTree.ts';
import {
  AIRPORT_SMALL_COST, AIRPORT_LARGE_COST, CARGO_PLANE_COST, CARGO_SHIP_COST,
  DELIVERY_REWARDS, DEPOT_COST, LOCOMOTIVE_COST, PLANE_COST, RAIL_COST,
  ROAD_COST, SEAPORT_LARGE_COST, SEAPORT_SMALL_COST, SHIP_COST, STATION_COST,
  TRAIN_YARD_COST, TRUCK_COST,
} from '../../src/constants.ts';
import { Random, seedFromString } from '../../src/core/Random.ts';
import type {
  RouteRecord,
  SimMode,
  SimProfile,
  SimRunOptions,
  SimRunResult,
  Snapshot,
  SpendBreakdown,
  TechUnlockRecord,
} from './types.ts';

interface BFSNode { x: number; y: number; parent: BFSNode | null }

interface Chain {
  producer: Industry;
  consumer: Industry;
  cargoType: CargoType;
  rewardPerLoad: number;
  pickupStation: Station | null;
  dropoffStation: Station | null;
  routeId: number | null;
}

interface SimContext {
  rng: Random;
  verbose: boolean;
  routeRecords: RouteRecord[];
  techUnlocks: TechUnlockRecord[];
  spends: SpendBreakdown;
  snapshots: Snapshot[];
  depotPos: Vec2 | null;
  chains: Chain[];
  chainsDiscovered: boolean;
}

function createSpendBreakdown(): SpendBreakdown {
  return { roads: 0, stations: 0, depots: 0, vehicles: 0, tech: 0 };
}

function log(verbose: boolean, ...parts: unknown[]): void {
  if (verbose) console.log(...parts);
}

export function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${Math.round(n).toLocaleString('en-US')}`;
  return `$${Math.round(n).toString()}`;
}

function snapshot(state: GameState): Snapshot {
  return {
    tick: state.time.tick,
    money: state.economy.money,
    totalEarned: state.economy.totalEarned,
    deliveries: state.economy.deliveriesCompleted,
    routes: state.routes.length,
    trucks: state.vehicles.length,
    techUnlocked: state.tech.filter((t) => t.unlocked).length,
    objectivesCompleted: state.objectives.filter((o) => o.completed).length,
  };
}

function findBuildPath(state: GameState, from: Vec2, to: Vec2): Vec2[] | null {
  if (from.x === to.x && from.y === to.y) return [{ ...from }];
  const { map } = state;
  const key = (x: number, y: number) => y * map.width + x;
  const visited = new Set<number>();
  const queue: BFSNode[] = [{ x: from.x, y: from.y, parent: null }];
  const dirs = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
  visited.add(key(from.x, from.y));

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node.x === to.x && node.y === to.y) {
      const path: Vec2[] = [];
      let cur: BFSNode | null = node;
      while (cur) {
        path.push({ x: cur.x, y: cur.y });
        cur = cur.parent;
      }
      path.reverse();
      return path;
    }
    for (const d of dirs) {
      const nx = node.x + d.x;
      const ny = node.y + d.y;
      if (!isInBounds(map, nx, ny)) continue;
      const k = key(nx, ny);
      if (visited.has(k)) continue;
      const tile = getTile(map, nx, ny);
      if (tile === TileType.Water || tile === TileType.Mountain) continue;
      visited.add(k);
      queue.push({ x: nx, y: ny, parent: node });
    }
  }
  return null;
}

function buildRoadsAlongPath(state: GameState, ctx: SimContext, path: Vec2[]): number {
  let spentTotal = 0;
  for (const p of path) {
    const tile = getTile(state.map, p.x, p.y);
    if (tile === TileType.Road) continue;
    if (!isBuildable(state.map, p.x, p.y)) continue;
    const cost = Math.floor(ROAD_COST * getRoadCostMult(state));
    if (!canAfford(state.economy, cost)) break;
    spend(state.economy, cost);
    ctx.spends.roads += cost;
    setTile(state.map, p.x, p.y, TileType.Road);
    state.roadsBuilt++;
    spentTotal += cost;
  }
  return spentTotal;
}

function roadCostEstimate(state: GameState, path: Vec2[]): number {
  if (path.length === 0) return Infinity;
  const costPerTile = Math.floor(ROAD_COST * getRoadCostMult(state));
  let total = 0;
  for (const p of path) {
    if (getTile(state.map, p.x, p.y) !== TileType.Road) total += costPerTile;
  }
  return total;
}

function buildRailAlongPath(state: GameState, ctx: SimContext, path: Vec2[]): number {
  let spentTotal = 0;
  for (const p of path) {
    const tile = getTile(state.map, p.x, p.y);
    if (tile === TileType.Rail) continue;
    if (tile === TileType.Water || tile === TileType.Mountain) continue;
    if (!canAfford(state.economy, RAIL_COST)) break;
    spend(state.economy, RAIL_COST);
    ctx.spends.roads += RAIL_COST;
    setTile(state.map, p.x, p.y, TileType.Rail);
    state.railsBuilt++;
    state.railTileCount = (state.railTileCount ?? 0) + 1;
    spentTotal += RAIL_COST;
  }
  return spentTotal;
}

function buildRoadConnection(state: GameState, ctx: SimContext, from: Vec2, to: Vec2): boolean {
  const path = findBuildPath(state, from, to);
  if (!path) return false;
  buildRoadsAlongPath(state, ctx, path);
  return true;
}

function buildRailConnection(state: GameState, ctx: SimContext, from: Vec2, to: Vec2): boolean {
  const path = findBuildPath(state, from, to);
  if (!path) return false;
  buildRailAlongPath(state, ctx, path);
  return true;
}

function isOccupied(state: GameState, x: number, y: number): boolean {
  if (state.buildings.some((b) => b.position.x === x && b.position.y === y)) return true;
  if (state.industries.some((ind) =>
    x >= ind.position.x && x < ind.position.x + ind.size.x &&
    y >= ind.position.y && y < ind.position.y + ind.size.y
  )) return true;
  return false;
}

function findStationTile(state: GameState, ind: Industry): Vec2 | null {
  const candidates: Vec2[] = [];
  const { x, y } = ind.position;
  const { x: w, y: h } = ind.size;
  for (let dx = -1; dx <= w; dx++) {
    candidates.push({ x: x + dx, y: y - 1 });
    candidates.push({ x: x + dx, y: y + h });
  }
  for (let dy = 0; dy < h; dy++) {
    candidates.push({ x: x - 1, y: y + dy });
    candidates.push({ x: x + w, y: y + dy });
  }
  for (const c of candidates) {
    if (!isInBounds(state.map, c.x, c.y)) continue;
    if (getTile(state.map, c.x, c.y) === TileType.Water) continue;
    if (isOccupied(state, c.x, c.y)) continue;
    return c;
  }
  return null;
}

function placeStation(state: GameState, ctx: SimContext, ind: Industry): Station | null {
  if (!canAfford(state.economy, STATION_COST)) return null;
  const pos = findStationTile(state, ind);
  if (!pos) return null;
  spend(state.economy, STATION_COST);
  ctx.spends.stations += STATION_COST;
  const station = createStation(generateId(state), pos);
  autoLinkStation(station, state.industries, ind.id);
  if (station.linkedIndustryId !== ind.id) station.linkedIndustryId = ind.id;
  state.buildings.push(station);
  if (getTile(state.map, pos.x, pos.y) !== TileType.Road) {
    setTile(state.map, pos.x, pos.y, TileType.Road);
    state.roadsBuilt++;
  }
  return station;
}

function placeDepotAt(state: GameState, ctx: SimContext, pos: Vec2): boolean {
  if (!canAfford(state.economy, DEPOT_COST)) return false;
  if (isOccupied(state, pos.x, pos.y)) return false;
  if (getTile(state.map, pos.x, pos.y) === TileType.Water) return false;
  spend(state.economy, DEPOT_COST);
  ctx.spends.depots += DEPOT_COST;
  state.buildings.push(createDepot(generateId(state), pos));
  if (getTile(state.map, pos.x, pos.y) !== TileType.Road) {
    setTile(state.map, pos.x, pos.y, TileType.Road);
    state.roadsBuilt++;
  }
  return true;
}

function findDepotTileNearIndustry(state: GameState, industry: Industry): Vec2 | null {
  return findFootprintNearIndustry(state, industry, 1, 1, (x, y) => getTile(state.map, x, y) !== TileType.Water);
}

function findFootprintNearIndustry(
  state: GameState,
  industry: Industry,
  w: number,
  h: number,
  accept: (x: number, y: number) => boolean,
): Vec2 | null {
  const centerX = industry.position.x + Math.floor(industry.size.x / 2);
  const centerY = industry.position.y + Math.floor(industry.size.y / 2);
  for (let radius = 2; radius <= 16; radius += 1) {
    for (let y = centerY - radius; y <= centerY + radius; y += 1) {
      for (let x = centerX - radius; x <= centerX + radius; x += 1) {
        if (!canPlaceFootprint(state, x, y, w, h)) continue;
        if (accept(x, y)) return { x, y };
      }
    }
  }
  return null;
}

function findFootprintNearPoint(
  state: GameState,
  center: Vec2,
  w: number,
  h: number,
  accept: (x: number, y: number) => boolean,
): Vec2 | null {
  for (let radius = 1; radius <= 18; radius += 1) {
    for (let y = center.y - radius; y <= center.y + radius; y += 1) {
      for (let x = center.x - radius; x <= center.x + radius; x += 1) {
        if (!canPlaceFootprint(state, x, y, w, h)) continue;
        if (accept(x, y)) return { x, y };
      }
    }
  }
  return null;
}

function placeTrainYardNear(state: GameState, ctx: SimContext, industry: Industry): Vec2 | null {
  if (!canAfford(state.economy, TRAIN_YARD_COST)) return null;
  const pos = findFootprintNearIndustry(state, industry, 2, 2, () => true);
  if (!pos) return null;
  spend(state.economy, TRAIN_YARD_COST);
  ctx.spends.depots += TRAIN_YARD_COST;
  state.buildings.push(createTrainYard(generateId(state), pos));
  for (let dy = 0; dy < 2; dy += 1) {
    for (let dx = 0; dx < 2; dx += 1) {
      if (getTile(state.map, pos.x + dx, pos.y + dy) !== TileType.Rail) {
        setTile(state.map, pos.x + dx, pos.y + dy, TileType.Rail);
        state.railsBuilt++;
        state.railTileCount = (state.railTileCount ?? 0) + 1;
      }
    }
  }
  return pos;
}

function findAirportForIndustry(state: GameState, industry: Industry): Airport | undefined {
  return state.buildings.find(
    (building) => building.type === BuildingType.Airport && (building as Airport).linkedIndustryId === industry.id,
  ) as Airport | undefined;
}

function placeAirportNear(state: GameState, ctx: SimContext, industry: Industry, tier: 'small' | 'large' = 'small'): Airport | null {
  const cost = tier === 'large' ? AIRPORT_LARGE_COST : AIRPORT_SMALL_COST;
  const [w, h] = tier === 'large' ? [3, 3] : [2, 2];
  if (!canAfford(state.economy, cost)) return null;
  const pos = findFootprintNearIndustry(state, industry, w, h, () => true);
  if (!pos) return null;
  spend(state.economy, cost);
  ctx.spends.depots += cost;
  const airport = createAirport(generateId(state), pos, tier);
  autoLinkStation(airport, state.industries, industry.id);
  airport.linkedIndustryId = industry.id;
  state.buildings.push(airport);
  return airport;
}

function findSeaportForIndustry(state: GameState, industry: Industry): Seaport | undefined {
  return state.buildings.find(
    (building) => building.type === BuildingType.Seaport && (building as Seaport).linkedIndustryId === industry.id,
  ) as Seaport | undefined;
}

function placeSeaportNear(state: GameState, ctx: SimContext, industry: Industry, tier: 'small' | 'large' = 'small'): Seaport | null {
  const cost = tier === 'large' ? SEAPORT_LARGE_COST : SEAPORT_SMALL_COST;
  const [w, h] = tier === 'large' ? [3, 3] : [2, 2];
  if (!canAfford(state.economy, cost)) return null;
  const pos = findFootprintNearIndustry(
    state,
    industry,
    w,
    h,
    (x, y) => hasAdjacentWater(state, x, y, w, h),
  );
  if (!pos) return null;
  spend(state.economy, cost);
  ctx.spends.depots += cost;
  const seaport = createSeaport(generateId(state), pos, tier);
  autoLinkStation(seaport, state.industries, industry.id);
  seaport.linkedIndustryId = industry.id;
  state.buildings.push(seaport);
  return seaport;
}

function buyTruck(state: GameState, ctx: SimContext, startPos: Vec2, routeId: number): Vehicle | null {
  const cost = Math.floor(TRUCK_COST * getTruckCostMult(state));
  if (!canAfford(state.economy, cost)) return null;
  spend(state.economy, cost);
  ctx.spends.vehicles += cost;
  const v = createVehicle(generateId(state), startPos);
  v.routeId = routeId;
  v.state = VehicleState.Idle;
  state.vehicles.push(v);
  return v;
}

function buyLocomotive(state: GameState, ctx: SimContext, startPos: Vec2, routeId: number): Vehicle | null {
  if (!canAfford(state.economy, LOCOMOTIVE_COST)) return null;
  spend(state.economy, LOCOMOTIVE_COST);
  ctx.spends.vehicles += LOCOMOTIVE_COST;
  const vehicle = createLocomotive(generateId(state), startPos);
  vehicle.routeId = routeId;
  vehicle.state = VehicleState.Idle;
  state.vehicles.push(vehicle);
  return vehicle;
}

function buyPlaneVehicle(state: GameState, ctx: SimContext, startPos: Vec2, routeId: number): Vehicle | null {
  const useCargoPlane = isAdvancedAviationUnlocked(state) && canAfford(state.economy, CARGO_PLANE_COST);
  const cost = useCargoPlane ? CARGO_PLANE_COST : PLANE_COST;
  if (!canAfford(state.economy, cost)) return null;
  spend(state.economy, cost);
  ctx.spends.vehicles += cost;
  const vehicle = useCargoPlane
    ? createCargoPLane(generateId(state), startPos)
    : createPlane(generateId(state), startPos);
  vehicle.routeId = routeId;
  vehicle.state = VehicleState.Idle;
  state.vehicles.push(vehicle);
  return vehicle;
}

function buyShipVehicle(state: GameState, ctx: SimContext, startPos: Vec2, routeId: number): Vehicle | null {
  const useCargoShip = isDeepSeaUnlocked(state) && canAfford(state.economy, CARGO_SHIP_COST);
  const cost = useCargoShip ? CARGO_SHIP_COST : SHIP_COST;
  if (!canAfford(state.economy, cost)) return null;
  spend(state.economy, cost);
  ctx.spends.vehicles += cost;
  const vehicle = useCargoShip
    ? createCargoShip(generateId(state), startPos)
    : createShip(generateId(state), startPos);
  vehicle.routeId = routeId;
  vehicle.state = VehicleState.Idle;
  state.vehicles.push(vehicle);
  return vehicle;
}

function industryLabel(type: IndustryType): string {
  const names: Record<IndustryType, string> = {
    [IndustryType.CoalMine]: 'CoalMine',
    [IndustryType.PowerPlant]: 'PowerPlant',
    [IndustryType.Forest]: 'Forest',
    [IndustryType.Sawmill]: 'Sawmill',
    [IndustryType.Farm]: 'Farm',
    [IndustryType.Bakery]: 'Bakery',
    [IndustryType.OilWell]: 'OilWell',
    [IndustryType.Refinery]: 'Refinery',
    [IndustryType.SteelMill]: 'SteelMill',
    [IndustryType.Factory]: 'Factory',
    [IndustryType.Neighborhood]: 'Neighborhood',
    [IndustryType.PassengerTerminal]: 'PassengerTerminal',
    [IndustryType.IronMine]: 'IronMine',
    [IndustryType.Smelter]: 'Smelter',
    [IndustryType.ChemicalPlant]: 'ChemPlant',
    [IndustryType.ChemDistributor]: 'ChemDist',
    [IndustryType.Market]: 'Market',
  };
  return names[type] ?? type;
}

function discoverChains(state: GameState, ctx: SimContext): void {
  if (ctx.chainsDiscovered) return;
  ctx.chainsDiscovered = true;
  const allChains: Chain[] = [];
  for (const producer of state.industries) {
    if (producer.produces === null) continue;
    if (producer.locked) continue;
    for (const consumer of state.industries) {
      if (consumer.id === producer.id) continue;
      if (consumer.locked) continue;
      if (consumer.consumes !== producer.produces) continue;
      allChains.push({
        producer,
        consumer,
        cargoType: producer.produces,
        rewardPerLoad: DELIVERY_REWARDS[producer.produces] ?? 200,
        pickupStation: null,
        dropoffStation: null,
        routeId: null,
      });
    }
  }

  const added = new Set<Chain>();
  const addCascade = (chain: Chain, depth = 0): void => {
    if (added.has(chain) || depth > 5) return;
    added.add(chain);
    ctx.chains.push(chain);
    const downstreams = allChains
      .filter((c) => c.producer.id === chain.consumer.id && !added.has(c))
      .sort((a, b) => b.rewardPerLoad - a.rewardPerLoad);
    for (const downstream of downstreams) addCascade(downstream, depth + 1);
  };

  allChains
    .filter((c) => c.producer.consumes === null && c.consumer.produces === null)
    .sort((a, b) => b.rewardPerLoad - a.rewardPerLoad)
    .forEach((c) => addCascade(c));

  allChains
    .filter((c) => c.producer.consumes === null && !added.has(c))
    .sort((a, b) => b.rewardPerLoad - a.rewardPerLoad)
    .forEach((c) => addCascade(c));

  allChains.filter((c) => !added.has(c)).forEach((c) => addCascade(c));
}

function routeLabel(chain: Chain): string {
  return `${industryLabel(chain.producer.type)}→${industryLabel(chain.consumer.type)}`;
}

function registerRouteRecord(
  state: GameState,
  ctx: SimContext,
  chain: Chain,
  routeId: number,
  mode: SimMode,
  pickupStation: number,
  dropoffStation: number,
  label: string,
): void {
  ctx.routeRecords.push({
    routeId,
    mode,
    pickupStation,
    dropoffStation,
    cargoType: chain.cargoType,
    label,
    setupTick: state.time.tick,
    trucks: 1,
  });
}

function chooseTransportMode(state: GameState, ctx: SimContext, profile: SimProfile, chain: Chain): SimMode {
  const fromPos = chain.pickupStation?.position ?? chain.producer.position;
  const toPos = chain.dropoffStation?.position ?? chain.consumer.position;
  const distance = Math.abs(fromPos.x - toPos.x) + Math.abs(fromPos.y - toPos.y);
  const roll = ctx.rng.next();

  if (isDeepSeaUnlocked(state) && distance >= profile.seaDistanceThreshold && roll < profile.seaAffinity) {
    return 'sea';
  }
  if (isAdvancedAviationUnlocked(state) && distance >= profile.airDistanceThreshold && roll < profile.airAffinity) {
    return 'air';
  }
  if (isRailwayUnlocked(state) && distance >= profile.railDistanceThreshold && roll < profile.railAffinity) {
    return 'rail';
  }
  if (isMaritimeUnlocked(state) && distance >= profile.seaDistanceThreshold + 10 && roll < profile.seaAffinity * 0.75) {
    return 'sea';
  }
  if (isAviationUnlocked(state) && distance >= profile.airDistanceThreshold + 12 && roll < profile.airAffinity * 0.75) {
    return 'air';
  }
  return 'road';
}

function countRoutesByMode(ctx: SimContext, mode: SimMode): number {
  return ctx.routeRecords.filter((route) => route.mode === mode).length;
}

function chainDistance(chain: Chain): number {
  return Math.abs(chain.producer.position.x - chain.consumer.position.x) +
    Math.abs(chain.producer.position.y - chain.consumer.position.y);
}

function trySetupModalExpansion(state: GameState, ctx: SimContext, profile: SimProfile): boolean {
  const hasModeRouteForChain = (chain: Chain, mode: SimMode): boolean => {
    const label = routeLabel(chain);
    return ctx.routeRecords.some((route) => route.mode === mode && route.label.includes(label));
  };

  const candidates = ctx.chains
    .sort((a, b) => chainDistance(b) - chainDistance(a));

  const tryMode = (mode: SimMode, threshold: number, limit: number): boolean => {
    if (countRoutesByMode(ctx, mode) >= limit) return false;
    const chain = candidates.find((candidate) =>
      chainDistance(candidate) >= threshold && !hasModeRouteForChain(candidate, mode),
    );
    if (!chain) return false;
    if (mode === 'rail') return trySetupRailChain(state, ctx, chain);
    if (mode === 'air') return trySetupAirChain(state, ctx, chain);
    return trySetupSeaChain(state, ctx, chain);
  };

  if (isRailwayUnlocked(state) && state.economy.money > profile.reserveForExpansion && tryMode('rail', profile.railDistanceThreshold, 2)) {
    return true;
  }
  if (isAviationUnlocked(state) && state.economy.money > profile.reserveForExpansion + AIRPORT_SMALL_COST * 2 && tryMode('air', profile.airDistanceThreshold, 2)) {
    return true;
  }
  if (isMaritimeUnlocked(state) && state.economy.money > profile.reserveForExpansion + SEAPORT_SMALL_COST * 2 && tryMode('sea', profile.seaDistanceThreshold, 2)) {
    return true;
  }
  return false;
}

function chooseWeightedChain(state: GameState, ctx: SimContext, profile: SimProfile): Chain | null {
  const hasInboundSupply = (industry: Industry): boolean => {
    if (industry.consumes === null) return true;
    return ctx.chains.some((candidate) => candidate.consumer.id === industry.id && typeof candidate.routeId === 'number' && candidate.routeId > 0);
  };

  const candidates = ctx.chains
    .filter((chain) => chain.routeId === null)
    .filter((chain) => hasInboundSupply(chain.producer))
    .map((chain) => {
      const fromPos = chain.pickupStation?.position ?? chain.producer.position;
      const toPos = chain.dropoffStation?.position ?? chain.consumer.position;
      const pathLength = Math.abs(fromPos.x - toPos.x) + Math.abs(fromPos.y - toPos.y);
      const depotDistance = ctx.depotPos
        ? Math.abs(ctx.depotPos.x - fromPos.x) + Math.abs(ctx.depotPos.y - fromPos.y)
        : 0;
      const roadTiles = pathLength + Math.floor(depotDistance * 0.7);
      const roadCost = roadTiles * Math.floor(ROAD_COST * getRoadCostMult(state));
      const producerBias = chain.producer.consumes === null ? 500 : 120;
      const consumerBias = chain.consumer.produces === null ? 260 : -80;
      const score =
        chain.rewardPerLoad * 7 +
        producerBias +
        consumerBias -
        roadCost * profile.roadCostWeight -
        Math.max(8, pathLength) * 14;
      return { chain, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, profile.candidatePool);

  if (candidates.length === 0) return null;
  const weights = candidates.map((item, idx) => Math.max(1, item.score - candidates[candidates.length - 1].score + (candidates.length - idx) * 50));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let pick = ctx.rng.float(0, totalWeight);
  for (let i = 0; i < candidates.length; i += 1) {
    pick -= weights[i]!;
    if (pick <= 0) return candidates[i]!.chain;
  }
  return candidates[0]!.chain;
}

function tryUnlockTech(state: GameState, ctx: SimContext, profile: SimProfile): void {
  if (ctx.rng.next() < profile.techDelayChance) return;
  for (const id of profile.techPriority) {
    const node = state.tech.find((tech) => tech.id === id);
    if (!node || node.unlocked) continue;
    if (state.economy.money - node.cost < profile.reserveBase) continue;
    if (unlockTech(state, id)) {
      ctx.spends.tech += node.cost;
      ctx.techUnlocks.push({ id, tick: state.time.tick, cost: node.cost });
      log(ctx.verbose, `  [TECH/${profile.id}] ${id} at tick ${state.time.tick}`);
      return;
    }
  }
}

function ensureChainStations(state: GameState, ctx: SimContext, chain: Chain): boolean {
  if (chain.pickupStation === null) {
    const existing = state.buildings.find(
      (b) => b.type === BuildingType.Station && (b as Station).linkedIndustryId === chain.producer.id,
    ) as Station | undefined;
    chain.pickupStation = existing ?? placeStation(state, ctx, chain.producer);
    if (chain.pickupStation === null) return false;
  }

  if (chain.dropoffStation === null) {
    const existing = state.buildings.find(
      (b) => b.type === BuildingType.Station && (b as Station).linkedIndustryId === chain.consumer.id,
    ) as Station | undefined;
    chain.dropoffStation = existing ?? placeStation(state, ctx, chain.consumer);
    if (chain.dropoffStation === null) return false;
  }
  return true;
}

function createSimpleRoute(state: GameState, fromId: number, toId: number): number {
  const routeId = generateId(state);
  state.routes.push(createRoute(routeId, [
    { stationId: fromId, action: 'load' },
    { stationId: toId, action: 'unload' },
  ]));
  return routeId;
}

function trySetupRoadChain(state: GameState, ctx: SimContext, chain: Chain): boolean {
  if (!ensureChainStations(state, ctx, chain)) return false;
  const pickupStation = chain.pickupStation;
  const dropoffStation = chain.dropoffStation;
  if (!pickupStation || !dropoffStation) return false;

  const from = pickupStation.position;
  const to = dropoffStation.position;
  const path = findBuildPath(state, from, to);
  if (!path) {
    chain.routeId = -1;
    return false;
  }

  const estimated = roadCostEstimate(state, path);
  if (!canAfford(state.economy, estimated + TRUCK_COST)) return false;
  buildRoadsAlongPath(state, ctx, path);

  if (ctx.depotPos) {
    const depotPath = findBuildPath(state, ctx.depotPos, from);
    if (depotPath) buildRoadsAlongPath(state, ctx, depotPath);
  }

  const routeId = createSimpleRoute(state, pickupStation.id, dropoffStation.id);
  chain.routeId = routeId;

  const vehicle = buyTruck(state, ctx, pickupStation.position, routeId);
  if (!vehicle) return false;

  const label = routeLabel(chain);
  registerRouteRecord(state, ctx, chain, routeId, 'road', pickupStation.id, dropoffStation.id, label);
  log(ctx.verbose, `  [ROAD/${state.time.tick}] ${label} with truck #${vehicle.id}`);
  return true;
}

function trySetupRailChain(state: GameState, ctx: SimContext, chain: Chain): boolean {
  if (!isRailwayUnlocked(state)) return false;
  if (!ensureChainStations(state, ctx, chain)) return false;
  const yardCandidate = findFootprintNearIndustry(state, chain.producer, 2, 2, () => true);
  if (!yardCandidate) return false;
  const approachPath = findBuildPath(state, yardCandidate, chain.pickupStation!.position);
  const trunkPath = findBuildPath(state, chain.pickupStation!.position, chain.dropoffStation!.position);
  if (!approachPath || !trunkPath) return false;
  const estimatedCost = TRAIN_YARD_COST + LOCOMOTIVE_COST + approachPath.length * RAIL_COST + trunkPath.length * RAIL_COST;
  if (state.economy.money < estimatedCost) return false;
  const yardPos = placeTrainYardNear(state, ctx, chain.producer);
  if (!yardPos) return false;
  if (!buildRailConnection(state, ctx, yardPos, chain.pickupStation!.position)) return false;
  if (!buildRailConnection(state, ctx, chain.pickupStation!.position, chain.dropoffStation!.position)) return false;

  const routeId = createSimpleRoute(state, chain.pickupStation!.id, chain.dropoffStation!.id);
  chain.routeId = routeId;
  const vehicle = buyLocomotive(state, ctx, yardPos, routeId);
  if (!vehicle) return false;
  const label = `Rail ${routeLabel(chain)}`;
  registerRouteRecord(state, ctx, chain, routeId, 'rail', chain.pickupStation!.id, chain.dropoffStation!.id, label);
  log(ctx.verbose, `  [RAIL/${state.time.tick}] ${label} with loco #${vehicle.id}`);
  return true;
}

function trySetupAirChain(state: GameState, ctx: SimContext, chain: Chain): boolean {
  if (!isAviationUnlocked(state)) return false;
  if (!ensureChainStations(state, ctx, chain)) return false;
  const tier = isAdvancedAviationUnlocked(state) ? 'large' : 'small';
  const airportCost = tier === 'large' ? AIRPORT_LARGE_COST : AIRPORT_SMALL_COST;
  const [w, h] = tier === 'large' ? [3, 3] : [2, 2];
  const originCandidate = findAirportForIndustry(state, chain.producer)?.position ??
    findFootprintNearPoint(state, chain.pickupStation!.position, w, h, () => true) ??
    findFootprintNearIndustry(state, chain.producer, w, h, () => true);
  const destCandidate = findAirportForIndustry(state, chain.consumer)?.position ??
    findFootprintNearPoint(state, chain.dropoffStation!.position, w, h, () => true) ??
    findFootprintNearIndustry(state, chain.consumer, w, h, () => true);
  if (!originCandidate || !destCandidate) return false;
  const firstLeg = findBuildPath(state, chain.pickupStation!.position, originCandidate);
  const lastLeg = findBuildPath(state, destCandidate, chain.dropoffStation!.position);
  const depotLeg = ctx.depotPos ? findBuildPath(state, ctx.depotPos, chain.pickupStation!.position) : null;
  if (!firstLeg || !lastLeg || !depotLeg) return false;
  const planeCost = isAdvancedAviationUnlocked(state) ? CARGO_PLANE_COST : PLANE_COST;
  const estimatedCost =
    (findAirportForIndustry(state, chain.producer) ? 0 : airportCost) +
    (findAirportForIndustry(state, chain.consumer) ? 0 : airportCost) +
    roadCostEstimate(state, depotLeg) +
    roadCostEstimate(state, firstLeg) +
    roadCostEstimate(state, lastLeg) +
    planeCost +
    Math.floor(TRUCK_COST * getTruckCostMult(state)) * 2;
  if (state.economy.money < estimatedCost) return false;
  const originAirport = findAirportForIndustry(state, chain.producer) ?? placeAirportNear(state, ctx, chain.producer, tier);
  const destAirport = findAirportForIndustry(state, chain.consumer) ?? placeAirportNear(state, ctx, chain.consumer, tier);
  if (!originAirport || !destAirport) return false;
  if (!buildRoadConnection(state, ctx, chain.pickupStation!.position, originAirport.position)) return false;
  if (!ctx.depotPos || !buildRoadConnection(state, ctx, ctx.depotPos, chain.pickupStation!.position)) return false;
  if (!buildRoadConnection(state, ctx, destAirport.position, chain.dropoffStation!.position)) return false;

  const feederOutRoute = createSimpleRoute(state, chain.pickupStation!.id, originAirport.id);
  const feederOutVehicle = buyTruck(state, ctx, chain.pickupStation!.position, feederOutRoute);
  if (!feederOutVehicle) return false;
  registerRouteRecord(state, ctx, chain, feederOutRoute, 'road', chain.pickupStation!.id, originAirport.id, `Feeder ${routeLabel(chain)} → airport`);

  const trunkRoute = createSimpleRoute(state, originAirport.id, destAirport.id);
  const plane = buyPlaneVehicle(state, ctx, originAirport.position, trunkRoute);
  if (!plane) return false;
  registerRouteRecord(state, ctx, chain, trunkRoute, 'air', originAirport.id, destAirport.id, `Air ${routeLabel(chain)}`);

  const feederInRoute = createSimpleRoute(state, destAirport.id, chain.dropoffStation!.id);
  const feederInVehicle = buyTruck(state, ctx, destAirport.position, feederInRoute);
  if (!feederInVehicle) return false;
  registerRouteRecord(state, ctx, chain, feederInRoute, 'road', destAirport.id, chain.dropoffStation!.id, `Airport feeder ${routeLabel(chain)}`);

  chain.routeId = trunkRoute;
  log(ctx.verbose, `  [AIR/${state.time.tick}] Air ${routeLabel(chain)} with plane #${plane.id}`);
  return true;
}

function trySetupSeaChain(state: GameState, ctx: SimContext, chain: Chain): boolean {
  if (!isMaritimeUnlocked(state)) return false;
  if (!ensureChainStations(state, ctx, chain)) return false;
  const tier = isDeepSeaUnlocked(state) ? 'large' : 'small';
  const portCost = tier === 'large' ? SEAPORT_LARGE_COST : SEAPORT_SMALL_COST;
  const [w, h] = tier === 'large' ? [3, 3] : [2, 2];
  const originCandidate = findSeaportForIndustry(state, chain.producer)?.position ??
    findFootprintNearPoint(state, chain.pickupStation!.position, w, h, (x, y) => hasAdjacentWater(state, x, y, w, h)) ??
    findFootprintNearIndustry(state, chain.producer, w, h, (x, y) => hasAdjacentWater(state, x, y, w, h));
  const destCandidate = findSeaportForIndustry(state, chain.consumer)?.position ??
    findFootprintNearPoint(state, chain.dropoffStation!.position, w, h, (x, y) => hasAdjacentWater(state, x, y, w, h)) ??
    findFootprintNearIndustry(state, chain.consumer, w, h, (x, y) => hasAdjacentWater(state, x, y, w, h));
  if (!originCandidate || !destCandidate) return false;
  const firstLeg = findBuildPath(state, chain.pickupStation!.position, originCandidate);
  const lastLeg = findBuildPath(state, destCandidate, chain.dropoffStation!.position);
  const depotLeg = ctx.depotPos ? findBuildPath(state, ctx.depotPos, chain.pickupStation!.position) : null;
  if (!firstLeg || !lastLeg || !depotLeg) return false;
  const shipCost = isDeepSeaUnlocked(state) ? CARGO_SHIP_COST : SHIP_COST;
  const estimatedCost =
    (findSeaportForIndustry(state, chain.producer) ? 0 : portCost) +
    (findSeaportForIndustry(state, chain.consumer) ? 0 : portCost) +
    roadCostEstimate(state, depotLeg) +
    roadCostEstimate(state, firstLeg) +
    roadCostEstimate(state, lastLeg) +
    shipCost +
    Math.floor(TRUCK_COST * getTruckCostMult(state)) * 2;
  if (state.economy.money < estimatedCost) return false;
  const originPort = findSeaportForIndustry(state, chain.producer) ?? placeSeaportNear(state, ctx, chain.producer, tier);
  const destPort = findSeaportForIndustry(state, chain.consumer) ?? placeSeaportNear(state, ctx, chain.consumer, tier);
  if (!originPort || !destPort) return false;
  if (!buildRoadConnection(state, ctx, chain.pickupStation!.position, originPort.position)) return false;
  if (!ctx.depotPos || !buildRoadConnection(state, ctx, ctx.depotPos, chain.pickupStation!.position)) return false;
  if (!buildRoadConnection(state, ctx, destPort.position, chain.dropoffStation!.position)) return false;

  const feederOutRoute = createSimpleRoute(state, chain.pickupStation!.id, originPort.id);
  const feederOutVehicle = buyTruck(state, ctx, chain.pickupStation!.position, feederOutRoute);
  if (!feederOutVehicle) return false;
  registerRouteRecord(state, ctx, chain, feederOutRoute, 'road', chain.pickupStation!.id, originPort.id, `Feeder ${routeLabel(chain)} → port`);

  const trunkRoute = createSimpleRoute(state, originPort.id, destPort.id);
  const ship = buyShipVehicle(state, ctx, originPort.position, trunkRoute);
  if (!ship) return false;
  registerRouteRecord(state, ctx, chain, trunkRoute, 'sea', originPort.id, destPort.id, `Sea ${routeLabel(chain)}`);

  const feederInRoute = createSimpleRoute(state, destPort.id, chain.dropoffStation!.id);
  const feederInVehicle = buyTruck(state, ctx, destPort.position, feederInRoute);
  if (!feederInVehicle) return false;
  registerRouteRecord(state, ctx, chain, feederInRoute, 'road', destPort.id, chain.dropoffStation!.id, `Port feeder ${routeLabel(chain)}`);

  chain.routeId = trunkRoute;
  log(ctx.verbose, `  [SEA/${state.time.tick}] Sea ${routeLabel(chain)} with ship #${ship.id}`);
  return true;
}

function trySetupChain(state: GameState, ctx: SimContext, profile: SimProfile, chain: Chain): void {
  const mode = chooseTransportMode(state, ctx, profile, chain);
  const ok = mode === 'sea' ? trySetupSeaChain(state, ctx, chain)
    : mode === 'air' ? trySetupAirChain(state, ctx, chain)
    : mode === 'rail' ? trySetupRailChain(state, ctx, chain)
    : trySetupRoadChain(state, ctx, chain);

  if (!ok && mode !== 'road') {
    trySetupRoadChain(state, ctx, chain);
  }
}

function aiTick(state: GameState, ctx: SimContext, profile: SimProfile): void {
  discoverChains(state, ctx);

  if (ctx.depotPos === null) {
    const initialChain = chooseWeightedChain(state, ctx, profile) ?? ctx.chains[0] ?? null;
    const preferredPos = initialChain ? findDepotTileNearIndustry(state, initialChain.producer) : null;
    if (preferredPos && placeDepotAt(state, ctx, preferredPos)) {
      ctx.depotPos = preferredPos;
    }
    const cx = Math.floor(state.map.width / 2);
    const cy = Math.floor(state.map.height / 2);
    for (let r = 0; r < 10 && ctx.depotPos === null; r += 1) {
      for (let dx = -r; dx <= r && ctx.depotPos === null; dx += 1) {
        for (let dy = -r; dy <= r; dy += 1) {
          const pos = { x: cx + dx, y: cy + dy };
          if (placeDepotAt(state, ctx, pos)) {
            ctx.depotPos = pos;
            break;
          }
        }
      }
    }
  }

  if (ctx.rng.next() < profile.hesitationChance) return;
  const hasIncomeRoute = state.routes.length > 0 || state.economy.deliveriesCompleted > 0;
  const stableEconomy = state.economy.deliveriesCompleted >= 18 ||
    state.economy.totalEarned >= profile.reserveForExpansion * 1.35 ||
    state.routes.length >= 3;
  const matureEconomy = state.economy.deliveriesCompleted >= 90 ||
    state.economy.totalEarned >= profile.reserveForExpansion * 2.5;
  if (stableEconomy && (hasIncomeRoute || state.economy.money > profile.reserveForExpansion + 20_000)) {
    tryUnlockTech(state, ctx, profile);
  }

  if (matureEconomy && trySetupModalExpansion(state, ctx, profile)) {
    return;
  }

  const chain = chooseWeightedChain(state, ctx, profile);
  if (chain && ctx.depotPos) trySetupChain(state, ctx, profile, chain);

  const hasUnroutedChains = ctx.chains.some((c) => c.routeId === null);
  for (const rec of ctx.routeRecords) {
    const cap = rec.mode === 'road' ? profile.routeTruckCap : profile.modalRouteCap;
    if (rec.trucks >= cap) continue;
    const reserve = hasUnroutedChains ? profile.reserveForExpansion : profile.reserveBase;
    if (ctx.rng.next() < 0.35) continue;
    const pickupBuilding = state.buildings.find((b) => b.id === rec.pickupStation);
    if (!pickupBuilding) continue;
    const cost = rec.mode === 'rail' ? LOCOMOTIVE_COST
      : rec.mode === 'air' ? (isAdvancedAviationUnlocked(state) ? CARGO_PLANE_COST : PLANE_COST)
      : rec.mode === 'sea' ? (isDeepSeaUnlocked(state) ? CARGO_SHIP_COST : SHIP_COST)
      : Math.floor(TRUCK_COST * getTruckCostMult(state));
    if (state.economy.money - reserve < cost) continue;
    const vehicle = rec.mode === 'rail' ? buyLocomotive(state, ctx, pickupBuilding.position, rec.routeId)
      : rec.mode === 'air' ? buyPlaneVehicle(state, ctx, pickupBuilding.position, rec.routeId)
      : rec.mode === 'sea' ? buyShipVehicle(state, ctx, pickupBuilding.position, rec.routeId)
      : buyTruck(state, ctx, pickupBuilding.position, rec.routeId);
    if (!vehicle) continue;
    rec.trucks += 1;
    log(ctx.verbose, `  [FLEET/${state.time.tick}] +${rec.mode} unit ${rec.trucks} on ${rec.label}`);
  }
}

function computeScore(result: Omit<SimRunResult, 'score' | 'verdict'>): { score: number; verdict: string } {
  const final = result.snapshots[result.snapshots.length - 1];
  const firstDeliveryBonus = result.firstDeliveryTick === -1 ? -200 : Math.max(0, 260 - result.firstDeliveryTick) * 5;
  const objectiveCount = final?.objectivesCompleted ?? 0;
  const techCount = final?.techUnlocked ?? 0;
  const deliveries = final?.deliveries ?? 0;
  const money = final?.money ?? 0;
  const spendPenalty = result.spends.tech > result.state.economy.totalEarned * 0.45 ? 180 : 0;
  const score = Math.round(
    money / 400 +
    deliveries * 12 +
    objectiveCount * 140 +
    techCount * 18 +
    firstDeliveryBonus -
    spendPenalty,
  );

  const verdict =
    result.firstDeliveryTick === -1 ? 'broken-no-deliveries' :
    result.firstDeliveryTick > 500 ? 'slow-ramp' :
    deliveries < 120 ? 'low-throughput' :
    objectiveCount < 3 ? 'weak-objectives' :
    score >= 1700 ? 'strong' :
    score >= 1100 ? 'stable' :
    'fragile';

  return { score, verdict };
}

export function runSimulation(options: SimRunOptions): SimRunResult {
  const { profile, seed, ticks, verbose = false, mapSize, difficulty, theme } = options;
  const state = createInitialGameState({ seed, mapSize, difficulty, theme });
  const ctx: SimContext = {
    rng: new Random(seed ^ seedFromString(profile.id)),
    verbose,
    routeRecords: [],
    techUnlocks: [],
    spends: createSpendBreakdown(),
    snapshots: [],
    depotPos: null,
    chains: [],
    chainsDiscovered: false,
  };

  const snapshotInterval = Math.max(50, Math.floor(ticks / 20));
  let firstDeliveryTick = -1;
  let firstObjectiveTick = -1;

  for (let t = 0; t < ticks; t += 1) {
    if (t % profile.thinkInterval === 0) aiTick(state, ctx, profile);

    const completed = simulationTick(state);
    if (verbose) {
      for (const id of completed) {
        const objective = state.objectives.find((obj) => obj.id === id);
        if (objective) console.log(`  [OBJ] ${objective.title} at tick ${state.time.tick}`);
      }
    }

    if (firstDeliveryTick === -1 && state.economy.deliveriesCompleted > 0) firstDeliveryTick = state.time.tick;
    if (firstObjectiveTick === -1 && state.objectives.some((obj) => obj.completed)) firstObjectiveTick = state.time.tick;

    if (t % snapshotInterval === 0 || t === ticks - 1) {
      ctx.snapshots.push(snapshot(state));
    }
  }

  const partial: Omit<SimRunResult, 'score' | 'verdict'> = {
    profile,
    seed,
    ticks,
    state,
    snapshots: ctx.snapshots,
    routeRecords: ctx.routeRecords,
    techUnlocks: ctx.techUnlocks,
    spends: ctx.spends,
    firstDeliveryTick,
    firstObjectiveTick,
  };
  const { score, verdict } = computeScore(partial);
  return { ...partial, score, verdict };
}
