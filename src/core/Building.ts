import type { Station, Depot, Airport, Seaport, Vec2, Industry } from './types.ts';
import { BuildingType, CargoType } from './types.ts';
import { STATION_CARGO_CAPACITY, STATION_LINK_RANGE } from '../constants.ts';

export function createStation(id: number, position: Vec2): Station {
  return {
    id,
    type: BuildingType.Station,
    position,
    cargo: { type: CargoType.Coal, amount: 0, capacity: STATION_CARGO_CAPACITY },
    linkedIndustryId: null,
  };
}

export function createDepot(id: number, position: Vec2): Depot {
  return {
    id,
    type: BuildingType.Depot,
    position,
  };
}

export function createAirport(id: number, position: Vec2): Airport {
  return {
    id,
    type: BuildingType.Airport,
    position,
    cargo: { type: CargoType.Goods, amount: 0, capacity: STATION_CARGO_CAPACITY },
    linkedIndustryId: null,
    name: `Airport #${id}`,
  };
}

export function createSeaport(id: number, position: Vec2): Seaport {
  return {
    id,
    type: BuildingType.Seaport,
    position,
    cargo: { type: CargoType.Goods, amount: 0, capacity: STATION_CARGO_CAPACITY * 2 },
    linkedIndustryId: null,
    name: `Seaport #${id}`,
  };
}

/**
 * Find the closest industry within STATION_LINK_RANGE and link it.
 * If preferredId is given and that industry is within range and ties
 * for closest, it wins the tiebreak.
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
    // Strictly closer always wins; ties go to the preferred industry if set
    if (dist < bestDist || (dist === bestDist && ind.id === preferredId)) {
      bestDist = dist;
      bestId = ind.id;
    }
  }
  station.linkedIndustryId = bestId;
}

/**
 * True for any building that has cargo + linkedIndustryId (station-like).
 * Includes Station, Airport, and Seaport.
 */
export function isTransitHub(b: { type: BuildingType }): b is Station | Airport | Seaport {
  return b.type === BuildingType.Station ||
         b.type === BuildingType.Airport ||
         b.type === BuildingType.Seaport;
}

export function isStation(building: { type: string }): building is Station {
  return building.type === BuildingType.Station;
}

export function isDepot(building: { type: string }): building is Depot {
  return building.type === BuildingType.Depot;
}
