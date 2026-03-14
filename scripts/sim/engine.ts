import { createInitialGameState, generateId } from '../../src/core/GameState.ts';
import { simulationTick } from '../../src/core/GameLoop.ts';
import {
  IndustryType,
  TileType,
  BuildingType,
  VehicleState,
} from '../../src/core/types.ts';
import type { CargoType, GameState, Industry, Station, Vec2, Vehicle } from '../../src/core/types.ts';
import { createStation, createDepot, autoLinkStation } from '../../src/core/Building.ts';
import { createVehicle } from '../../src/core/Vehicle.ts';
import { createRoute } from '../../src/core/Route.ts';
import { canAfford, spend } from '../../src/core/Economy.ts';
import { getTile, setTile, isBuildable, isInBounds } from '../../src/core/World.ts';
import { unlockTech, getRoadCostMult, getTruckCostMult } from '../../src/core/TechTree.ts';
import { DELIVERY_REWARDS, DEPOT_COST, ROAD_COST, STATION_COST, TRUCK_COST } from '../../src/constants.ts';
import { Random, seedFromString } from '../../src/core/Random.ts';
import type {
  RouteRecord,
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
  return `$${Math.round(n).toLocaleString()}`;
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

function trySetupChain(state: GameState, ctx: SimContext, chain: Chain): void {
  if (chain.pickupStation === null) {
    const existing = state.buildings.find(
      (b) => b.type === BuildingType.Station && (b as Station).linkedIndustryId === chain.producer.id,
    ) as Station | undefined;
    chain.pickupStation = existing ?? placeStation(state, ctx, chain.producer);
    if (chain.pickupStation === null) return;
  }

  if (chain.dropoffStation === null) {
    const existing = state.buildings.find(
      (b) => b.type === BuildingType.Station && (b as Station).linkedIndustryId === chain.consumer.id,
    ) as Station | undefined;
    chain.dropoffStation = existing ?? placeStation(state, ctx, chain.consumer);
    if (chain.dropoffStation === null) return;
  }

  const from = chain.pickupStation.position;
  const to = chain.dropoffStation.position;
  const path = findBuildPath(state, from, to);
  if (!path) {
    chain.routeId = -1;
    return;
  }

  const estimated = roadCostEstimate(state, path);
  if (!canAfford(state.economy, estimated + TRUCK_COST)) return;
  buildRoadsAlongPath(state, ctx, path);

  if (ctx.depotPos) {
    const depotPath = findBuildPath(state, ctx.depotPos, from);
    if (depotPath) buildRoadsAlongPath(state, ctx, depotPath);
  }

  const routeId = generateId(state);
  state.routes.push(createRoute(routeId, [
    { stationId: chain.pickupStation.id, action: 'load' },
    { stationId: chain.dropoffStation.id, action: 'unload' },
  ]));
  chain.routeId = routeId;

  const vehicle = buyTruck(state, ctx, chain.pickupStation.position, routeId);
  if (!vehicle) return;

  const label = `${industryLabel(chain.producer.type)}→${industryLabel(chain.consumer.type)}`;
  ctx.routeRecords.push({
    routeId,
    pickupStation: chain.pickupStation.id,
    dropoffStation: chain.dropoffStation.id,
    cargoType: chain.cargoType,
    label,
    setupTick: state.time.tick,
    trucks: 1,
  });
  log(ctx.verbose, `  [ROUTE/${state.time.tick}] ${label} with truck #${vehicle.id}`);
}

function aiTick(state: GameState, ctx: SimContext, profile: SimProfile): void {
  discoverChains(state, ctx);

  if (ctx.depotPos === null) {
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
  if (hasIncomeRoute || state.economy.money > profile.reserveForExpansion + 20_000) {
    tryUnlockTech(state, ctx, profile);
  }

  const chain = chooseWeightedChain(state, ctx, profile);
  if (chain && ctx.depotPos) trySetupChain(state, ctx, chain);

  const hasUnroutedChains = ctx.chains.some((c) => c.routeId === null);
  for (const rec of ctx.routeRecords) {
    if (rec.trucks >= profile.routeTruckCap) continue;
    const reserve = hasUnroutedChains ? profile.reserveForExpansion : profile.reserveBase;
    const truckCost = Math.floor(TRUCK_COST * getTruckCostMult(state));
    if (state.economy.money - reserve < truckCost) continue;
    if (ctx.rng.next() < 0.35) continue;
    const pickupStation = state.buildings.find((b) => b.id === rec.pickupStation) as Station | undefined;
    if (!pickupStation) continue;
    const vehicle = buyTruck(state, ctx, pickupStation.position, rec.routeId);
    if (!vehicle) continue;
    rec.trucks += 1;
    log(ctx.verbose, `  [FLEET/${state.time.tick}] +truck ${rec.trucks} on ${rec.label}`);
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
  const { profile, seed, ticks, verbose = false } = options;
  const state = createInitialGameState({ seed });
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
