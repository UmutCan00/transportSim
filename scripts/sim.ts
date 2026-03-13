/**
 * Headless AI simulation runner.
 *
 * Usage:  npx tsx scripts/sim.ts [--seed N] [--ticks N] [--speed fast|balanced|slow]
 *
 * The AI bot automatically builds infrastructure and assigns routes, then runs
 * the simulation for the requested number of ticks while collecting metrics.
 * Output is a human-readable progression log + final balance report.
 *
 * This is the feedback loop: run it, read the numbers, tweak constants, repeat.
 */

import { createInitialGameState, generateId } from '../src/core/GameState.ts';
import { simulationTick } from '../src/core/GameLoop.ts';
import {
  IndustryType,
  TileType,
  BuildingType,
  VehicleState,
  TechId,
} from '../src/core/types.ts';
import type { GameState, Industry, Vec2, Station, Vehicle } from '../src/core/types.ts';
import { createStation, createDepot, autoLinkStation } from '../src/core/Building.ts';
import { createVehicle } from '../src/core/Vehicle.ts';
import { createRoute } from '../src/core/Route.ts';
import { canAfford, spend } from '../src/core/Economy.ts';
import { getTile, setTile, isBuildable, isInBounds } from '../src/core/World.ts';
import { unlockTech, getTruckCostMult, getRoadCostMult } from '../src/core/TechTree.ts';
import { ROAD_COST, STATION_COST, DEPOT_COST, TRUCK_COST, DELIVERY_REWARDS } from '../src/constants.ts';
import { CargoType } from '../src/core/types.ts';

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name: string, def: string): string {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1]! : def;
}
const SEED    = parseInt(getArg('--seed',  String(Math.floor(Math.random() * 999999))), 10);
const TICKS   = parseInt(getArg('--ticks', '3000'), 10);
const VERBOSE = args.includes('--verbose');

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(...parts: unknown[]): void {
  console.log(...parts);
}

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

// ── Pathfinding for road building (avoids water) ────────────────────────────

interface BFSNode { x: number; y: number; parent: BFSNode | null }

function findBuildPath(state: GameState, from: Vec2, to: Vec2): Vec2[] | null {
  if (from.x === to.x && from.y === to.y) return [{ ...from }];

  const { map } = state;
  const key = (x: number, y: number) => y * map.width + x;
  const visited = new Set<number>();
  const queue: BFSNode[] = [{ x: from.x, y: from.y, parent: null }];
  visited.add(key(from.x, from.y));

  const dirs = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

  while (queue.length) {
    const node = queue.shift()!;
    if (node.x === to.x && node.y === to.y) {
      const path: Vec2[] = [];
      let cur: BFSNode | null = node;
      while (cur) { path.push({ x: cur.x, y: cur.y }); cur = cur.parent; }
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
      if (tile === TileType.Water || tile === TileType.Mountain) continue; // cannot build over water/mountains
      visited.add(k);
      queue.push({ x: nx, y: ny, parent: node });
    }
  }
  return null;
}

/** Lay roads along a pre-computed path. Returns cost actually spent. */
function buildRoadsAlongPath(state: GameState, path: Vec2[]): number {
  let spent = 0;
  for (const p of path) {
    const tile = getTile(state.map, p.x, p.y);
    if (tile === TileType.Road) continue;
    if (!isBuildable(state.map, p.x, p.y)) continue;
    const cost = Math.floor(ROAD_COST * getRoadCostMult(state));
    if (!canAfford(state.economy, cost)) break;
    spend(state.economy, cost);
    setTile(state.map, p.x, p.y, TileType.Road);
    state.roadsBuilt++;
    spent += cost;
  }
  return spent;
}

/** Count road tiles that would need to be built (does not build). */
function roadCostEstimate(state: GameState, path: Vec2[]): number {
  if (path.length === 0) return Infinity;
  const costPerTile = Math.floor(ROAD_COST * getRoadCostMult(state));
  let cost = 0;
  for (const p of path) {
    if (getTile(state.map, p.x, p.y) !== TileType.Road) cost += costPerTile;
  }
  return cost;
}

// ── Industry helpers ─────────────────────────────────────────────────────────

function isOccupied(state: GameState, x: number, y: number): boolean {
  if (state.buildings.some((b) => b.position.x === x && b.position.y === y)) return true;
  if (state.industries.some((ind) =>
    x >= ind.position.x && x < ind.position.x + ind.size.x &&
    y >= ind.position.y && y < ind.position.y + ind.size.y,
  )) return true;
  return false;
}

/**
 * Find the best tile adjacent to an industry (just outside its bounding box)
 * that is on land. Returns null if none found.
 */
function findStationTile(state: GameState, ind: Industry): Vec2 | null {
  const candidates: Vec2[] = [];
  const { x, y } = ind.position;
  const { x: w, y: h } = ind.size;
  // Edges: top, bottom, left, right
  for (let dx = -1; dx <= w; dx++) {
    candidates.push({ x: x + dx, y: y - 1 });
    candidates.push({ x: x + dx, y: y + h });
  }
  for (let dy = 0; dy < h; dy++) {
    candidates.push({ x: x - 1, y: y + dy });
    candidates.push({ x: x + w,  y: y + dy });
  }
  // Pick the first tile that is in-bounds, non-water, not occupied
  for (const c of candidates) {
    if (!isInBounds(state.map, c.x, c.y)) continue;
    const tile = getTile(state.map, c.x, c.y);
    if (tile === TileType.Water) continue;
    if (isOccupied(state, c.x, c.y)) continue;
    return c;
  }
  return null;
}

/** Place a station adjacent to an industry, spending money, auto-linking it. Returns the station or null on failure. */
function placeStation(state: GameState, ind: Industry): Station | null {
  if (!canAfford(state.economy, STATION_COST)) return null;
  const pos = findStationTile(state, ind);
  if (!pos) return null;
  spend(state.economy, STATION_COST);
  const id = generateId(state);
  const station = createStation(id, pos);
  autoLinkStation(station, state.industries, ind.id); // pass preferred id for tiebreak
  // Safety: ensure we always link to the intended industry even if another is equidistant
  if (station.linkedIndustryId !== ind.id) {
    station.linkedIndustryId = ind.id;
  }
  state.buildings.push(station);
  // Tile becomes road (covers adjacent station access)
  if (getTile(state.map, pos.x, pos.y) !== TileType.Road) {
    setTile(state.map, pos.x, pos.y, TileType.Road);
    state.roadsBuilt++;
  }
  return station;
}

/** Place a depot at a given tile, or near map centre if not specified. */
function placeDepotAt(state: GameState, pos: Vec2): boolean {
  if (!canAfford(state.economy, DEPOT_COST)) return false;
  if (isOccupied(state, pos.x, pos.y)) return false;
  const tile = getTile(state.map, pos.x, pos.y);
  if (tile === TileType.Water) return false;
  spend(state.economy, DEPOT_COST);
  const id = generateId(state);
  state.buildings.push(createDepot(id, pos));
  if (getTile(state.map, pos.x, pos.y) !== TileType.Road) {
    setTile(state.map, pos.x, pos.y, TileType.Road);
    state.roadsBuilt++;
  }
  return true;
}

/** Buy a truck at a depot and assign it to a route. Returns the vehicle or null. */
function buyTruck(state: GameState, startPos: Vec2, routeId: number): Vehicle | null {
  const cost = Math.floor(TRUCK_COST * getTruckCostMult(state));
  if (!canAfford(state.economy, cost)) return null;
  spend(state.economy, cost);
  const id = generateId(state);
  const v = createVehicle(id, startPos);
  v.routeId = routeId;
  v.state = VehicleState.Idle;
  state.vehicles.push(v);
  return v;
}

// ── Route tracking ───────────────────────────────────────────────────────────

interface RouteRecord {
  routeId:    number;
  pickupStation:  number; // station id
  dropoffStation: number;
  cargoType:  CargoType;
  label:      string;
  setupTick:  number;
  trucks:     number;
}

const routeRecords: RouteRecord[] = [];

// ── AI decision state ────────────────────────────────────────────────────────

let depotPos: Vec2 | null = null;

/**
 * Candidate supply-demand pair.
 * producer: industry that makes cargo, consumer: industry that eats cargo.
 */
interface Chain {
  producer: Industry;
  consumer: Industry;
  cargoType: CargoType;
  rewardPerLoad: number; // approximate $ per truckload
  pickupStation: Station | null;
  dropoffStation: Station | null;
  routeId: number | null;
}

const chains: Chain[] = [];
let chainsDiscovered = false;

function discoverChains(state: GameState): void {
  if (chainsDiscovered) return;
  chainsDiscovered = true;

  // Collect every producer → consumer pair
  const allChains: Chain[] = [];
  for (const producer of state.industries) {
    if (producer.produces === null) continue;
    for (const consumer of state.industries) {
      if (consumer.consumes !== producer.produces) continue;
      if (consumer.id === producer.id) continue;
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

  // Build cascade-ordered priority list:
  //   Pass 1 — direct raw→final-consumer chains (income with no downstream needed)
  //   Pass 2 — raw→processor chains w/ cascaded downstream chains immediately after
  //   Pass 3 — anything remaining
  // This ensures the AI sets up complete paths and processors never back up.
  const added = new Set<Chain>();

  function addCascade(chain: Chain, depth = 0): void {
    if (added.has(chain) || depth > 5) return;
    added.add(chain);
    chains.push(chain);
    // Follow downstream: where chain.consumer becomes the next producer
    const downstreams = allChains
      .filter((c) => c.producer.id === chain.consumer.id && !added.has(c))
      .sort((a, b) => b.rewardPerLoad - a.rewardPerLoad);
    for (const ds of downstreams) addCascade(ds, depth + 1);
  }

  // Pass 1 – direct raw → final consumer
  allChains
    .filter((c) => c.producer.consumes === null && c.consumer.produces === null)
    .sort((a, b) => b.rewardPerLoad - a.rewardPerLoad)
    .forEach((c) => addCascade(c));

  // Pass 2 – raw → processor (cascade includes downstream goods chains)
  allChains
    .filter((c) => c.producer.consumes === null && !added.has(c))
    .sort((a, b) => b.rewardPerLoad - a.rewardPerLoad)
    .forEach((c) => addCascade(c));

  // Pass 3 – remaining (orphan proc→proc chains)
  allChains.filter((c) => !added.has(c)).forEach((c) => addCascade(c));

  log(`\n[AI] Supply path order (${chains.length} chains):`);
  for (const c of chains) {
    const src  = c.producer.consumes === null  ? '[raw] ' : '[proc]';
    const sink = c.consumer.produces  === null ? '→FINAL' : '→PROC ';
    log(`  ${src}${sink} ${industryLabel(c.producer.type).padEnd(12)} → ${industryLabel(c.consumer.type).padEnd(12)} [${c.cargoType}] ~${fmt(c.rewardPerLoad)}/load`);
  }
}

function industryLabel(type: IndustryType): string {
  const names: Record<IndustryType, string> = {
    [IndustryType.CoalMine]:       'CoalMine',
    [IndustryType.PowerPlant]:     'PowerPlant',
    [IndustryType.Forest]:         'Forest',
    [IndustryType.Sawmill]:        'Sawmill',
    [IndustryType.Farm]:           'Farm',
    [IndustryType.Bakery]:         'Bakery',
    [IndustryType.OilWell]:        'OilWell',
    [IndustryType.Refinery]:       'Refinery',
    [IndustryType.SteelMill]:      'SteelMill',
    [IndustryType.Factory]:        'Factory',
    [IndustryType.Neighborhood]:   'Neighborhood',
    [IndustryType.IronMine]:       'IronMine',
    [IndustryType.Smelter]:        'Smelter',
    [IndustryType.ChemicalPlant]:  'ChemPlant',
    [IndustryType.ChemDistributor]:'ChemDist',
    [IndustryType.Market]:         'Market',
  };
  return names[type] ?? type;
}

// ── Tech priority order ───────────────────────────────────────────────────────

const TECH_PRIORITY: TechId[] = [
  TechId.CheaperRoads,     // roads are the main early cost
  TechId.FasterTrucks,     // speeds up all routes
  TechId.LargerStations,   // removes station bottleneck
  TechId.DoubleCapacity,   // 2x earnings per trip
  TechId.ExpressTrucks,    // maximum speed
  TechId.BulkTerminals,    // 4x station cap
  TechId.EfficientRoutes,  // +25% income
  TechId.MassTransit,      // cheaper trucks for expansion
  TechId.AutoLoader,       // instant loading
];

function tryUnlockTech(state: GameState): void {
  for (const id of TECH_PRIORITY) {
    if (unlockTech(state, id)) {
      log(`  [TECH] Unlocked: ${id} at tick ${state.time.tick}`);
      return; // one per tick is fine
    }
  }
}

// ── Main AI decision function (called once per tick) ─────────────────────────

function aiTick(state: GameState): void {
  discoverChains(state);

  // Place depot once at the map's approximate centre on first land tile
  if (depotPos === null) {
    const cx = Math.floor(state.map.width / 2);
    const cy = Math.floor(state.map.height / 2);
    for (let r = 0; r < 10; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          const p = { x: cx + dx, y: cy + dy };
          if (placeDepotAt(state, p)) { depotPos = p; break; }
        }
        if (depotPos) break;
      }
      if (depotPos) break;
    }
    if (depotPos) log(`  [AI] Depot placed at (${depotPos.x},${depotPos.y}) — money: ${fmt(state.economy.money)}`);
  }

  // Try to unlock tech whenever we can afford it
  tryUnlockTech(state);

  // Attempt to set up the next unrouted chain
  const unrouted = chains.find((c) => c.routeId === null);
  if (unrouted && depotPos) {
    trySetupChain(state, unrouted);
  }

  // Buy more trucks for existing routes that are undersupplied.
  // Hold back if there are unrouted chains we still want to set up — save
  // that budget for route expansion rather than over-buying trucks prematurely.
  const hasUnroutedChains = chains.some((c) => c.routeId === null);
  for (const rec of routeRecords) {
    if (rec.trucks >= 3) continue; // cap at 3 per route to spread investment

    const truckCost = Math.floor(TRUCK_COST * getTruckCostMult(state));
    // Keep a larger reserve when we still have routes to set up
    const reserveNeeded = hasUnroutedChains ? 55_000 : 25_000;
    const spare = state.economy.money - reserveNeeded;
    if (spare < truckCost) continue;

    const pickupSt = state.buildings.find((b) => b.id === rec.pickupStation) as Station | undefined;
    if (!pickupSt) continue;

    const v = buyTruck(state, pickupSt.position, rec.routeId);
    if (v) {
      rec.trucks++;
      log(`  [AI] +Truck #${rec.trucks} on route "${rec.label}" — money: ${fmt(state.economy.money)}`);
    }
  }
}

function trySetupChain(state: GameState, chain: Chain): void {
  // Step 1: find or create pickup station (next to producer)
  if (chain.pickupStation === null) {
    // Check if a station already exists that is linked to this producer
    const existing = state.buildings.find(
      (b) => b.type === BuildingType.Station && (b as Station).linkedIndustryId === chain.producer.id,
    ) as Station | undefined;
    if (existing) {
      chain.pickupStation = existing;
    } else {
      const st = placeStation(state, chain.producer);
      if (!st) return; // can't afford yet
      chain.pickupStation = st;
      log(`  [AI] Placed pickup station #${st.id} → linked to ${industryLabel(chain.producer.type)}`);
    }
  }

  // Step 2: find or create dropoff station (next to consumer)
  if (chain.dropoffStation === null) {
    const existing = state.buildings.find(
      (b) => b.type === BuildingType.Station && (b as Station).linkedIndustryId === chain.consumer.id,
    ) as Station | undefined;
    if (existing) {
      chain.dropoffStation = existing;
    } else {
      const st = placeStation(state, chain.consumer);
      if (!st) return;
      chain.dropoffStation = st;
      log(`  [AI] Placed dropoff station #${st.id} → linked to ${industryLabel(chain.consumer.type)}`);
    }
  }

  // Step 3: build roads between pickup → dropoff (via depot if possible)
  const from = chain.pickupStation.position;
  const to   = chain.dropoffStation.position;
  const path = findBuildPath(state, from, to);
  if (!path) {
    log(`  [AI] No land path between ${industryLabel(chain.producer.type)} → ${industryLabel(chain.consumer.type)} — skipping`);
    chain.routeId = -1; // mark as unreachable
    return;
  }
  const estimated = roadCostEstimate(state, path);
  if (!canAfford(state.economy, estimated + TRUCK_COST)) return; // wait for more money

  buildRoadsAlongPath(state, path);

  // Also connect depot to pickup station (so trucks can reach the network)
  if (depotPos) {
    const depotPath = findBuildPath(state, depotPos, from);
    if (depotPath) buildRoadsAlongPath(state, depotPath);
  }

  // Step 4: create route
  const routeId = generateId(state);
  const route = createRoute(routeId, [
    { stationId: chain.pickupStation.id,  action: 'load'   },
    { stationId: chain.dropoffStation.id, action: 'unload' },
  ]);
  state.routes.push(route);
  chain.routeId = routeId;

  // Step 5: buy first truck
  const truckCost = Math.floor(TRUCK_COST * getTruckCostMult(state));
  if (!canAfford(state.economy, truckCost)) return;
  const v = buyTruck(state, chain.pickupStation.position, routeId);
  if (!v) return;

  const label = `${industryLabel(chain.producer.type)}→${industryLabel(chain.consumer.type)}`;
  routeRecords.push({
    routeId,
    pickupStation:  chain.pickupStation.id,
    dropoffStation: chain.dropoffStation.id,
    cargoType:  chain.cargoType,
    label,
    setupTick:  state.time.tick,
    trucks:     1,
  });

  log(`  [AI] Route "${label}" created (route #${routeId}, truck #${v.id}) — money: ${fmt(state.economy.money)}`);
}

// ── Stats snapshot ────────────────────────────────────────────────────────────

interface Snapshot {
  tick: number;
  money: number;
  totalEarned: number;
  deliveries: number;
  routes: number;
  trucks: number;
  techUnlocked: number;
  objectivesCompleted: number;
}

const snapshots: Snapshot[] = [];
let exactFirstDeliveryTick = -1;
let exactFirstObjTick = -1;

function snapshot(state: GameState): Snapshot {
  return {
    tick:                 state.time.tick,
    money:                state.economy.money,
    totalEarned:          state.economy.totalEarned,
    deliveries:           state.economy.deliveriesCompleted,
    routes:               state.routes.length,
    trucks:               state.vehicles.length,
    techUnlocked:         state.tech.filter((t) => t.unlocked).length,
    objectivesCompleted:  state.objectives.filter((o) => o.completed).length,
  };
}

// ── Run ───────────────────────────────────────────────────────────────────────

log('═'.repeat(72));
log(`TransportSim — Headless AI Simulation`);
log(`  Seed: ${SEED}   Ticks: ${TICKS}   (5 ticks/sec → ${(TICKS/5).toFixed(0)}s sim-time)`);
log('═'.repeat(72));

const state = createInitialGameState({ seed: SEED });

// Snapshot intervals: every 10% of ticks
const SNAP_INTERVAL = Math.max(50, Math.floor(TICKS / 20));

// AI phase timing (advance routes every tick, but think / invest every 10 ticks)
const AI_THINK_INTERVAL = 10;

let prevDeliveries = 0;
let prevEarned = 0;

for (let t = 0; t < TICKS; t++) {
  // AI decision phase (every 10 ticks to avoid thrashing)
  if (t % AI_THINK_INTERVAL === 0) {
    aiTick(state);
  }

  // Sim tick
  const completed = simulationTick(state);
  for (const id of completed) {
    const obj = state.objectives.find((o) => o.id === id);
    if (obj) log(`  [OBJ] "${obj.title}" completed at tick ${state.time.tick} (+${fmt(obj.reward)})`);
  }

  // Track exact first delivery / objective
  if (exactFirstDeliveryTick === -1 && state.economy.deliveriesCompleted > 0) {
    exactFirstDeliveryTick = state.time.tick;
  }
  if (exactFirstObjTick === -1 && state.objectives.some((o) => o.completed)) {
    exactFirstObjTick = state.time.tick;
  }

  // Verbose: dump truck states every 50 ticks to trace delivery flow
  if (VERBOSE && t % 50 === 0 && state.vehicles.length > 0) {
    for (const v of state.vehicles) {
      const r = state.routes.find((r) => r.id === v.routeId);
      const orderStr = r ? `order ${v.currentOrderIndex % r.orders.length}/${r.orders.length}` : 'no route';
      log(`  [V${v.id}] state=${v.state} cargo=${v.cargo ?? 'none'}(${v.cargoAmount}) ${orderStr} pos=(${Math.floor(v.position.x)},${Math.floor(v.position.y)})`);
    }
  }

  // Periodic snapshot + report
  if (t % SNAP_INTERVAL === 0 || t === TICKS - 1) {
    const snap = snapshot(state);
    snapshots.push(snap);
    const deltaTicks  = SNAP_INTERVAL;
    const deltaEarned = snap.totalEarned - prevEarned;
    const deltaDeliv  = snap.deliveries  - prevDeliveries;
    const earnRate    = deltaTicks > 0 ? (deltaEarned / deltaTicks * 5) : 0; // $ per real-sec
    log(
      `Tick ${String(snap.tick).padStart(5)}  money:${fmt(snap.money).padStart(10)}` +
      `  earned:${fmt(snap.totalEarned).padStart(10)}` +
      `  deliveries:${String(snap.deliveries).padStart(5)}` +
      `  trucks:${snap.trucks}  routes:${snap.routes}` +
      `  tech:${snap.techUnlocked}  obj:${snap.objectivesCompleted}` +
      `  [+${fmt(deltaEarned)}/interval, ${fmt(earnRate)}/s]`,
    );
    prevDeliveries = snap.deliveries;
    prevEarned     = snap.totalEarned;
  }
}

// ── Final report ──────────────────────────────────────────────────────────────

log('\n' + '═'.repeat(72));
log('FINAL REPORT');
log('═'.repeat(72));

const s = state.economy;
const simDuration = TICKS / 5; // seconds of sim time
log(`  Money:         ${fmt(s.money)}`);
log(`  Total earned:  ${fmt(s.totalEarned)}`);
log(`  Deliveries:    ${s.deliveriesCompleted}`);
log(`  Avg $/delivery:${s.deliveriesCompleted ? fmt(s.totalEarned / s.deliveriesCompleted) : 'n/a'}`);
log(`  Avg $/sec:     ${fmt(s.totalEarned / simDuration)}`);
log(`  Routes active: ${state.routes.length}`);
log(`  Trucks active: ${state.vehicles.length}`);
log(`  Roads built:   ${state.roadsBuilt}`);
log(`  Tech unlocked: ${state.tech.filter((t) => t.unlocked).length} / ${state.tech.length}`);
log(`  Objectives:    ${state.objectives.filter((o) => o.completed).length} / ${state.objectives.length}`);

log('\nCargo delivered:');
for (const [cargo, amount] of Object.entries(s.cargoDelivered)) {
  const reward = DELIVERY_REWARDS[cargo] ?? 200;
  log(`  ${cargo.padEnd(8)} ${String(amount ?? 0).padStart(6)} units  value: ${fmt((amount ?? 0) / 20 * reward)}`);
}

log('\nObjectives:');
for (const obj of state.objectives) {
  log(`  ${obj.completed ? '✓' : '○'} ${obj.title}`);
}

log('\nTech tree:');
for (const tech of state.tech) {
  log(`  ${tech.unlocked ? '✓' : '○'} ${tech.name}`);
}

log('\nRoute details:');
for (const rec of routeRecords) {
  const activeTrucks = state.vehicles.filter((v) => v.routeId === rec.routeId).length;
  log(`  Route "${rec.label}" — started tick ${rec.setupTick}, ${activeTrucks} trucks`);
}

log('\n' + '─'.repeat(72));
log('BALANCE ANALYSIS');
log('─'.repeat(72));

const first = snapshots[0];
const last  = snapshots[snapshots.length - 1];
if (first && last) {
  // Ramp-up time: first tick where deliveries > 0
  let firstDeliveryTick = -1;
  for (const snap of snapshots) {
    if (snap.deliveries > 0) { firstDeliveryTick = snap.tick; break; }
  }

  // First objective tick
  let firstObjTick = -1;
  for (const snap of snapshots) {
    if (snap.objectivesCompleted > 0) { firstObjTick = snap.tick; break; }
  }

  // Income curve ($/tick)
  const incomePerTick = last.totalEarned / Math.max(last.tick, 1);

  log(`  First delivery at tick: ${exactFirstDeliveryTick === -1 ? 'NEVER' : exactFirstDeliveryTick}`);
  log(`  First objective at tick: ${exactFirstObjTick === -1 ? 'NEVER' : exactFirstObjTick}`);
  log(`  Net income per tick: ${fmt(incomePerTick)} (${fmt(incomePerTick * 5 * 60)}/real-min)`);
  log(`  Money delta: ${fmt(last.money - first.money)} over ${last.tick} ticks`);

  const verdict =
    exactFirstDeliveryTick === -1              ? '⚠ NO DELIVERIES — broken simulation or no valid routes' :
    exactFirstDeliveryTick > 500              ? '⚠ TOO SLOW — first delivery takes too long (target < 200 ticks)' :
    incomePerTick < 5                         ? '⚠ TOO EASY TO STALL — very low income; raise rewards or production rates' :
    last.objectivesCompleted < 3             ? '⚠ OBJECTIVES TOO HARD — less than 3 completed in simulation window' :
    last.objectivesCompleted === state.objectives.length && last.tick < TICKS * 0.5
      ? '⚠ TOO EASY — all objectives done in first half; add harder late-game goals' :
    /* else */                                  '✓ BALANCE LOOKS REASONABLE';

  log(`\n  Verdict: ${verdict}`);
}

log('═'.repeat(72));
