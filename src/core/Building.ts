import type { Station, Depot, Airport, Seaport, Vec2, Industry } from './types.ts';
import { BuildingType, DepotType, CargoType } from './types.ts';
import {
  STATION_CARGO_CAPACITY, STATION_LINK_RANGE,
  DEPOT_MAX_VEHICLES, TRAIN_YARD_MAX_VEHICLES,
  AIRPORT_SMALL_MAX_PLANES, AIRPORT_LARGE_MAX_PLANES,
  SEAPORT_SMALL_MAX_SHIPS, SEAPORT_LARGE_MAX_SHIPS,
} from '../constants.ts';

export function createStation(id: number, position: Vec2): Station {
  const laneCapacity = Math.floor(STATION_CARGO_CAPACITY / 2);
  return {
    id,
    type: BuildingType.Station,
    position,
    size: { x: 1, y: 1 },
    incomingCargo: { type: CargoType.Coal, amount: 0, capacity: laneCapacity },
    cargo: { type: CargoType.Coal, amount: 0, capacity: laneCapacity },
    linkedIndustryId: null,
  };
}

export function createDepot(id: number, position: Vec2): Depot {
  return {
    id,
    type: BuildingType.Depot,
    depotType: DepotType.Road,
    position,
    size: { x: 2, y: 1 },
    maxVehicles: DEPOT_MAX_VEHICLES,
  };
}

export function createTrainYard(id: number, position: Vec2): Depot {
  return {
    id,
    type: BuildingType.TrainYard,
    depotType: DepotType.Rail,
    position,
    size: { x: 2, y: 2 },
    maxVehicles: TRAIN_YARD_MAX_VEHICLES,
  };
}

export function createAirport(id: number, position: Vec2, tier: 'small' | 'large' = 'small'): Airport {
  const isLarge = tier === 'large';
  const totalCapacity = isLarge ? STATION_CARGO_CAPACITY * 3 : STATION_CARGO_CAPACITY;
  const laneCapacity = Math.floor(totalCapacity / 2);
  return {
    id,
    type: BuildingType.Airport,
    tier,
    position,
    size: isLarge ? { x: 3, y: 3 } : { x: 2, y: 2 },
    maxVehicles: isLarge ? AIRPORT_LARGE_MAX_PLANES : AIRPORT_SMALL_MAX_PLANES,
    incomingCargo: { type: CargoType.Goods, amount: 0, capacity: laneCapacity },
    cargo: { type: CargoType.Goods, amount: 0, capacity: laneCapacity },
    linkedIndustryId: null,
    name: `${tier === 'large' ? 'Int\'l ' : ''}Airport #${id}`,
  };
}

export function createSeaport(id: number, position: Vec2, tier: 'small' | 'large' = 'small'): Seaport {
  const isLarge = tier === 'large';
  const totalCapacity = isLarge ? STATION_CARGO_CAPACITY * 4 : STATION_CARGO_CAPACITY * 2;
  const laneCapacity = Math.floor(totalCapacity / 2);
  return {
    id,
    type: BuildingType.Seaport,
    tier,
    position,
    size: isLarge ? { x: 3, y: 3 } : { x: 2, y: 2 },
    maxVehicles: isLarge ? SEAPORT_LARGE_MAX_SHIPS : SEAPORT_SMALL_MAX_SHIPS,
    incomingCargo: { type: CargoType.Goods, amount: 0, capacity: laneCapacity },
    cargo: { type: CargoType.Goods, amount: 0, capacity: laneCapacity },
    linkedIndustryId: null,
    name: `${tier === 'large' ? 'Mega ' : ''}Seaport #${id}`,
  };
}

/**
 * Return the tile positions occupied by a building's footprint.
 */
export function getBuildingFootprint(b: { position: Vec2; size?: Vec2 }): Vec2[] {
  const size = b.size ?? { x: 1, y: 1 };
  const tiles: Vec2[] = [];
  for (let dy = 0; dy < size.y; dy++) {
    for (let dx = 0; dx < size.x; dx++) {
      tiles.push({ x: b.position.x + dx, y: b.position.y + dy });
    }
  }
  return tiles;
}

/**
 * True if the building footprint overlaps the given tile.
 */
export function buildingOccupiesTile(b: { position: Vec2; size?: Vec2 }, tx: number, ty: number): boolean {
  const size = b.size ?? { x: 1, y: 1 };
  return tx >= b.position.x && tx < b.position.x + size.x &&
         ty >= b.position.y && ty < b.position.y + size.y;
}

/**
 * Find the closest industry within STATION_LINK_RANGE and link it.
 */
export function autoLinkStation(
  station: { position: Vec2; linkedIndustryId: number | null },
  industries: Industry[],
  preferredId?: number,
): void {
  let bestDist = Infinity;
  let bestId: number | null = null;
  for (const ind of industries) {
    const cx = ind.position.x + ind.size.x / 2;
    const cy = ind.position.y + ind.size.y / 2;
    const dist = Math.abs(station.position.x - cx) + Math.abs(station.position.y - cy);
    if (dist > STATION_LINK_RANGE) continue;
    if (dist < bestDist || (dist === bestDist && ind.id === preferredId)) {
      bestDist = dist;
      bestId = ind.id;
    }
  }
  station.linkedIndustryId = bestId;
}

/**
 * True for any building that has cargo + linkedIndustryId (station-like).
 */
export function isTransitHub(b: { type: BuildingType }): b is Station | Airport | Seaport {
  return b.type === BuildingType.Station ||
         b.type === BuildingType.Airport ||
         b.type === BuildingType.Seaport;
}

/** True if the building is a depot (road or rail) */
export function isDepot(b: { type: BuildingType }): b is Depot {
  return b.type === BuildingType.Depot || b.type === BuildingType.TrainYard;
}

/** Count vehicles currently assigned to a depot tile position */
export function countDepotVehicles(
  _depotId: number,
  vehicles: import('./types.ts').Vehicle[],
): number {
  // Vehicles don't store depotId; we count all vehicles for now
  // In a full impl vehicle.depotId would be tracked; here we just track total
  return vehicles.filter(v => v.routeId === null && Math.round(v.position.x) === -1).length;
}
