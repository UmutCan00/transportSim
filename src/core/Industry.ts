import type { Industry, Vec2, CargoStock } from './types.ts';
import { IndustryType, CargoType } from './types.ts';
import {
  INDUSTRY_SIZE,
  COAL_MINE_PRODUCTION_INTERVAL, COAL_MINE_CAPACITY,
  POWER_PLANT_CAPACITY,
  FOREST_PRODUCTION_INTERVAL, FOREST_CAPACITY,
  SAWMILL_CAPACITY,
  FARM_PRODUCTION_INTERVAL, FARM_CAPACITY,
  BAKERY_CAPACITY,
  OIL_WELL_PRODUCTION_INTERVAL, OIL_WELL_CAPACITY,
  REFINERY_CAPACITY,
  STEEL_MILL_CAPACITY,
  FACTORY_CAPACITY,
  NEIGHBORHOOD_CAPACITY,
  IRON_MINE_PRODUCTION_INTERVAL, IRON_MINE_CAPACITY,
  SMELTER_CAPACITY,
  CHEM_PLANT_CAPACITY,
  MARKET_CAPACITY,
  CHEM_DIST_CAPACITY,
  CITY_UNLOCK_COST,
  PASSENGER_TERMINAL_CAPACITY,
  PASSENGER_PRODUCTION_INTERVAL,
} from '../constants.ts';

// ── Procedural industry names ────────────────────────────

const NAME_PREFIXES: Record<IndustryType, string[]> = {
  [IndustryType.CoalMine]:      ['Blackrock', 'Darkgate', 'Ashpit', 'Ironvein', 'Greystone'],
  [IndustryType.IronMine]:      ['Redhill', 'Ironpeak', 'Rustwood', 'Hammerfell', 'Steelgate'],
  [IndustryType.Forest]:        ['Pinewood', 'Oakridge', 'Fernvale', 'Timberfall', 'Willowmere'],
  [IndustryType.Farm]:          ['Sunrise', 'Meadowlark', 'Harvest', 'Greenfield', 'Cloverdale'],
  [IndustryType.OilWell]:       ['Blackwater', 'Slickrock', 'Crudestone', 'Oildale', 'Tarpit'],
  [IndustryType.PowerPlant]:    ['Thunder', 'Voltage', 'Sparks', 'Dynamo', 'Kilowatt'],
  [IndustryType.Sawmill]:       ['Timber', 'Sawdust', 'Hewn', 'Woodcraft', 'Plankmore'],
  [IndustryType.Bakery]:        ['Golden', 'Hearth', 'Wheatleaf', 'Crumble', 'Flourish'],
  [IndustryType.Refinery]:      ['Cleargas', 'Petrox', 'Distill', 'Fusible', 'Crakex'],
  [IndustryType.SteelMill]:     ['Ferrous', 'Ironworks', 'Metalux', 'Forgemaster', 'Blastcore'],
  [IndustryType.Smelter]:       ['Molten', 'Crucible', 'Foundry', 'Castfire', 'Burnside'],
  [IndustryType.ChemicalPlant]: ['Reagent', 'Synthex', 'Polarium', 'Mixlab', 'Chemcore'],
  [IndustryType.Factory]:       ['Mechanix', 'Fabricator', 'Widgetco', 'Autocraft', 'Produce'],
  [IndustryType.Neighborhood]:  ['Portville', 'Eastgate', 'Westshore', 'Northend', 'Midtown', 'Riverside', 'Hillside', 'Docklands'],
  [IndustryType.ChemDistributor]: ['Nexchem', 'Axiom', 'Solvent', 'Polycore', 'Tritane'],
  [IndustryType.Market]:           ['Grand', 'Tradewind', 'Commerce', 'Merchant', 'Bazaar'],
  [IndustryType.PassengerTerminal]: ['Central', 'Union', 'Gateway', 'Metro', 'Grand Central'],
};

const NAME_SUFFIXES: Record<IndustryType, string> = {
  [IndustryType.CoalMine]:      'Mine',
  [IndustryType.IronMine]:      'Mine',
  [IndustryType.Forest]:        'Forest',
  [IndustryType.Farm]:          'Farm',
  [IndustryType.OilWell]:       'Wells',
  [IndustryType.PowerPlant]:    'Station',
  [IndustryType.Sawmill]:       'Sawmill',
  [IndustryType.Bakery]:        'Bakery',
  [IndustryType.Refinery]:      'Refinery',
  [IndustryType.SteelMill]:     'Steel Mill',
  [IndustryType.Smelter]:       'Smelter',
  [IndustryType.ChemicalPlant]: 'Chem Plant',
  [IndustryType.Factory]:       'Factory',
  [IndustryType.Neighborhood]:  'District',
  [IndustryType.ChemDistributor]: 'Chem Dist',
  [IndustryType.Market]:           'Market',
  [IndustryType.PassengerTerminal]: 'Station',
};

export function generateIndustryName(type: IndustryType, id: number): string {
  const prefixes = NAME_PREFIXES[type] ?? ['Industry'];
  const suffix   = NAME_SUFFIXES[type] ?? '';
  const prefix   = prefixes[id % prefixes.length];
  return suffix ? `${prefix} ${suffix}` : prefix;
}

function makeIndustry(
  id: number,
  type: IndustryType,
  position: Vec2,
  produces: CargoType | null,
  consumes: CargoType | null,
  consumesSecondary: CargoType | null,
  stockType: CargoType,
  capacity: number,
  productionInterval: number,
): Industry {
  return {
    id, type,
    name: generateIndustryName(type, id),
    position,
    size: { x: INDUSTRY_SIZE, y: INDUSTRY_SIZE },
    produces, consumes, consumesSecondary,
    stock: { type: stockType, amount: 0, capacity },
    demandPerDelivery: 20,
    totalConsumed: 0,
    productionInterval,
    ticksSinceLastProduction: 0,
  };
}

// ── Producers (raw) ──────────────────────────────────────

export const createCoalMine    = (id: number, p: Vec2) =>
  makeIndustry(id, IndustryType.CoalMine,   p, CargoType.Coal,  null, null, CargoType.Coal,  COAL_MINE_CAPACITY,  COAL_MINE_PRODUCTION_INTERVAL);

export const createForest      = (id: number, p: Vec2) =>
  makeIndustry(id, IndustryType.Forest,     p, CargoType.Wood,  null, null, CargoType.Wood,  FOREST_CAPACITY,     FOREST_PRODUCTION_INTERVAL);

export const createFarm        = (id: number, p: Vec2) =>
  makeIndustry(id, IndustryType.Farm,       p, CargoType.Grain, null, null, CargoType.Grain, FARM_CAPACITY,       FARM_PRODUCTION_INTERVAL);

export const createOilWell     = (id: number, p: Vec2) =>
  makeIndustry(id, IndustryType.OilWell,    p, CargoType.Oil,   null, null, CargoType.Oil,   OIL_WELL_CAPACITY,   OIL_WELL_PRODUCTION_INTERVAL);

// ── Processors (consume → produce) ─────────────────────

export const createSawmill     = (id: number, p: Vec2) =>
  makeIndustry(id, IndustryType.Sawmill,    p, CargoType.Goods, CargoType.Wood,  null, CargoType.Goods, SAWMILL_CAPACITY,   0);

export const createBakery      = (id: number, p: Vec2) =>
  makeIndustry(id, IndustryType.Bakery,     p, CargoType.Food,  CargoType.Grain, null, CargoType.Food,  BAKERY_CAPACITY,    0);

export const createRefinery    = (id: number, p: Vec2) =>
  makeIndustry(id, IndustryType.Refinery,   p, CargoType.Goods, CargoType.Oil,   null, CargoType.Goods, REFINERY_CAPACITY,  0);

export const createSteelMill   = (id: number, p: Vec2) =>
  makeIndustry(id, IndustryType.SteelMill,  p, CargoType.Steel, CargoType.Coal,  null, CargoType.Steel, STEEL_MILL_CAPACITY,0);

export const createFactory     = (id: number, p: Vec2) =>
  makeIndustry(id, IndustryType.Factory,    p, CargoType.Goods, CargoType.Steel, null, CargoType.Goods, FACTORY_CAPACITY,   0);

// ── Final consumers ─────────────────────────────────────

export const createPowerPlant  = (id: number, p: Vec2) =>
  makeIndustry(id, IndustryType.PowerPlant, p, null, CargoType.Coal,  null, CargoType.Coal,  POWER_PLANT_CAPACITY,0);

export const createNeighborhood = (id: number, p: Vec2) =>
  makeIndustry(id, IndustryType.Neighborhood, p, null, CargoType.Goods, null, CargoType.Goods, NEIGHBORHOOD_CAPACITY, 0);

/** Creates a neighborhood that starts locked — player pays unlockCost to activate it */
export function createLockedNeighborhood(id: number, p: Vec2, unlockCost = CITY_UNLOCK_COST): Industry {
  const nb = makeIndustry(id, IndustryType.Neighborhood, p, null, CargoType.Goods, null, CargoType.Goods, NEIGHBORHOOD_CAPACITY, 0);
  nb.locked = true;
  nb.unlockCost = unlockCost;
  return nb;
}

export const createMarket      = (id: number, p: Vec2) =>
  makeIndustry(id, IndustryType.Market,     p, null, CargoType.Food,  null, CargoType.Food,  MARKET_CAPACITY,     0);

/** City passenger terminal: generates passengers and accepts them from other cities */
export const createPassengerTerminal = (id: number, p: Vec2): Industry =>
  makeIndustry(id, IndustryType.PassengerTerminal, p, CargoType.Passengers, CargoType.Passengers, null,
    CargoType.Passengers, PASSENGER_TERMINAL_CAPACITY, PASSENGER_PRODUCTION_INTERVAL);

/** Creates a locked passenger terminal */
export function createLockedPassengerTerminal(id: number, p: Vec2, unlockCost = CITY_UNLOCK_COST): Industry {
  const t = createPassengerTerminal(id, p);
  t.locked = true;
  t.unlockCost = unlockCost;
  return t;
}

// ── New industry chains ──────────────────────────────────
// Chain: Iron Mine → Smelter → (Steel goes to Factory)  — alternative steel source
// Chain: Oil Well → Chemical Plant → (Chemicals consumed at high reward separately)

export const createIronMine    = (id: number, p: Vec2) =>
  makeIndustry(id, IndustryType.IronMine,      p, CargoType.Iron,      null,              null, CargoType.Iron,      IRON_MINE_CAPACITY,  IRON_MINE_PRODUCTION_INTERVAL);

export const createSmelter     = (id: number, p: Vec2) =>
  makeIndustry(id, IndustryType.Smelter,       p, CargoType.Steel,     CargoType.Iron,    null, CargoType.Steel,     SMELTER_CAPACITY,    0);

export const createChemicalPlant = (id: number, p: Vec2) =>
  makeIndustry(id, IndustryType.ChemicalPlant, p, CargoType.Chemicals, CargoType.Oil,     null, CargoType.Chemicals, CHEM_PLANT_CAPACITY, 0);

export const createChemDistributor = (id: number, p: Vec2) =>
  makeIndustry(id, IndustryType.ChemDistributor, p, null, CargoType.Chemicals, null, CargoType.Chemicals, CHEM_DIST_CAPACITY, 0);

// ── Simulation ──────────────────────────────────────────

/** Run one production tick for all industries */
export function tickIndustries(industries: Industry[], tick: number): void {
  for (const ind of industries) {
    // Raw producers: generate stock on interval
    if (ind.produces !== null && ind.consumes === null) {
      ind.ticksSinceLastProduction++;
      if (ind.ticksSinceLastProduction >= ind.productionInterval) {
        ind.ticksSinceLastProduction = 0;
        ind.stock.amount = Math.min(ind.stock.amount + 10, ind.stock.capacity);
      }
    }
    // Final consumers (PowerPlant, City, Market): drain stock each tick to simulate ongoing demand.
    // This prevents them from filling up and blocking deliveries.
    if (ind.produces === null && ind.consumes !== null && ind.stock.amount > 0) {
      if (ind.locked) continue; // locked cities don't consume — player must unlock first
      // Drain 1 unit every 4 ticks — slow enough to not waste all deliveries,
      // fast enough to keep demand alive for sustained delivery income.
      if (tick % 4 === 0) {
        ind.stock.amount = Math.max(0, ind.stock.amount - 1);
      }
    }
    // Processors (Sawmill, Refinery, etc.): their output stock is normally cleared by
    // a downstream pickup truck. Without one, a slow drain simulates unsold overflow
    // so the player's raw-material income doesn't completely die. Setting up a downstream
    // route is far more efficient and is strongly encouraged.
    if (ind.produces !== null && ind.consumes !== null && ind.stock.amount > 0) {
      if (tick % 20 === 0) {
        ind.stock.amount = Math.max(0, ind.stock.amount - 1);
      }
    }
    // Processors: conversion happens on delivery via deliverCargoToIndustry.
  }
}

/** Transfer cargo from industry stock to a cargo stock (station pickup) */
export function takeCargoFromIndustry(industry: Industry, target: CargoStock, maxAmount: number): number {
  if (industry.produces === null) return 0;
  const available = industry.stock.amount;
  const space = target.capacity - target.amount;
  const transfer = Math.min(available, space, maxAmount);
  if (transfer <= 0) return 0;
  industry.stock.amount -= transfer;
  target.amount += transfer;
  return transfer;
}

/** Deliver cargo to a consuming industry. Returns units accepted. */
export function deliverCargoToIndustry(industry: Industry, amount: number): number {
  if (industry.consumes === null) return 0;
  const space = industry.stock.capacity - industry.stock.amount;
  const transfer = Math.min(amount, space);
  if (transfer <= 0) return 0;
  industry.stock.amount += transfer;
  industry.totalConsumed += transfer;

  // Processor: convert input → output stock immediately
  if (industry.produces !== null) {
    const produced = Math.floor(transfer * 0.8); // 80% conversion efficiency
    industry.stock.amount = Math.max(0, industry.stock.amount - transfer);
    // Reuse stock for output (same stock object, type changes conceptually; we track by industry.produces)
    // For simplicity, processors store their OUTPUT in stock (not input)
    industry.stock.type = industry.produces;
    industry.stock.amount = Math.min(industry.stock.amount + produced, industry.stock.capacity);
  }
  return transfer;
}

/** Human-readable label for an industry type */
export function industryLabel(type: IndustryType): string {
  return {
    [IndustryType.CoalMine]:      '⛏️ Coal Mine',
    [IndustryType.PowerPlant]:    '⚡ Power Plant',
    [IndustryType.Forest]:        '🌲 Forest',
    [IndustryType.Sawmill]:       '🪚 Sawmill',
    [IndustryType.Farm]:          '🌾 Farm',
    [IndustryType.Bakery]:        '🍞 Bakery',
    [IndustryType.OilWell]:       '🛢️ Oil Well',
    [IndustryType.Refinery]:      '⚗️ Refinery',
    [IndustryType.SteelMill]:     '🏭 Steel Mill',
    [IndustryType.Factory]:       '🔧 Factory',
    [IndustryType.Neighborhood]:  '🏘️ Neighborhood',
    [IndustryType.IronMine]:      '⛏️ Iron Mine',
    [IndustryType.Smelter]:       '🔥 Smelter',
    [IndustryType.ChemicalPlant]: '🧪 Chem Plant',
    [IndustryType.ChemDistributor]: '🧬 Chem Distributor',
    [IndustryType.Market]:           '🛒 Market',
    [IndustryType.PassengerTerminal]: '🚉 Passenger Terminal',
  }[type] ?? type;
}

