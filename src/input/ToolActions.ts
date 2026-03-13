import type { GameState, UIState } from '../core/types.ts';
import { ToolType, TileType, BuildingType } from '../core/types.ts';
import { getTile, setTile, isBuildable, isInBounds } from '../core/World.ts';
import { createStation, createDepot, createAirport, createSeaport, autoLinkStation } from '../core/Building.ts';
import { canAfford, spend } from '../core/Economy.ts';
import { generateId } from '../core/GameState.ts';
import { getRoadCostMult, isRailwayUnlocked, isBridgingUnlocked, isTunnelingUnlocked, isAviationUnlocked, isMaritimeUnlocked } from '../core/TechTree.ts';
import { ROAD_COST, STATION_COST, DEPOT_COST, DEMOLISH_REFUND_RATIO, RAIL_COST, BRIDGE_COST, TUNNEL_COST, AIRPORT_COST, SEAPORT_COST } from '../constants.ts';

/** Execute the active tool's action at a tile. Returns true if action was performed. */
export function executeToolAction(
  state: GameState,
  uiState: UIState,
  tx: number,
  ty: number,
): boolean {
  switch (uiState.activeTool) {
    case ToolType.Select:
      return handleSelect(state, uiState, tx, ty);
    case ToolType.BuildRoad:
      return handleBuildRoad(state, tx, ty);
    case ToolType.PlaceStation:
      return handlePlaceStation(state, tx, ty);
    case ToolType.PlaceDepot:
      return handlePlaceDepot(state, tx, ty);
    case ToolType.Demolish:
      return handleDemolish(state, tx, ty);
    case ToolType.LayRail:
      return handleLayRail(state, tx, ty);
    case ToolType.BuildBridge:
      return handleBuildBridge(state, tx, ty);
    case ToolType.BuildTunnel:
      return handleBuildTunnel(state, tx, ty);
    case ToolType.PlaceAirport:
      return handlePlaceAirport(state, tx, ty);
    case ToolType.PlaceSeaport:
      return handlePlaceSeaport(state, tx, ty);
  }
}

function handleSelect(state: GameState, uiState: UIState, tx: number, ty: number): boolean {
  const industry = state.industries.find((ind) =>
    tx >= ind.position.x && tx < ind.position.x + ind.size.x &&
    ty >= ind.position.y && ty < ind.position.y + ind.size.y
  );
  if (industry) {
    uiState.selectedEntityId = industry.id;
    uiState.selectedEntityType = 'industry';
    if (uiState.activePanel === 'depot') uiState.activePanel = 'none';
    return true;
  }
  const building = state.buildings.find((b) => b.position.x === tx && b.position.y === ty);
  if (building) {
    uiState.selectedEntityId = building.id;
    uiState.selectedEntityType = 'building';
    // Clicking a depot directly opens the depot management panel
    if (building.type === BuildingType.Depot) {
      uiState.activePanel = 'depot';
    } else if (uiState.activePanel === 'depot') {
      uiState.activePanel = 'none';
    }
    return true;
  }
  const vehicle = state.vehicles.find((v) =>
    Math.floor(v.position.x) === tx && Math.floor(v.position.y) === ty
  );
  if (vehicle) {
    uiState.selectedEntityId = vehicle.id;
    uiState.selectedEntityType = 'vehicle';
    if (uiState.activePanel === 'depot') uiState.activePanel = 'none';
    return true;
  }
  uiState.selectedEntityId = null;
  uiState.selectedEntityType = null;
  if (uiState.activePanel === 'depot') uiState.activePanel = 'none';
  return false;
}

function handleBuildRoad(state: GameState, tx: number, ty: number): boolean {
  if (!isInBounds(state.map, tx, ty)) return false;
  if (!isBuildable(state.map, tx, ty)) return false;
  if (getTile(state.map, tx, ty) === TileType.Rail) return false; // can't overwrite rail with road
  if (isOccupiedByBuilding(state, tx, ty)) return false;
  if (isOccupiedByIndustry(state, tx, ty)) return false;
  const cost = Math.floor(ROAD_COST * getRoadCostMult(state));
  if (!canAfford(state.economy, cost)) return false;

  spend(state.economy, cost);
  setTile(state.map, tx, ty, TileType.Road);
  state.roadsBuilt++;
  return true;
}

function handlePlaceStation(state: GameState, tx: number, ty: number): boolean {
  if (!isInBounds(state.map, tx, ty)) return false;
  const tile = getTile(state.map, tx, ty);
  if (tile === TileType.Water || tile === TileType.Mountain) return false;
  if (isOccupiedByBuilding(state, tx, ty)) return false;
  if (isOccupiedByIndustry(state, tx, ty)) return false;
  if (!canAfford(state.economy, STATION_COST)) return false;

  spend(state.economy, STATION_COST);
  const id = generateId(state);
  const station = createStation(id, { x: tx, y: ty });
  autoLinkStation(station, state.industries);
  state.buildings.push(station);
  if (tile !== TileType.Road && tile !== TileType.Rail) {
    setTile(state.map, tx, ty, TileType.Road);
    state.roadsBuilt++;
  }
  return true;
}

function handlePlaceDepot(state: GameState, tx: number, ty: number): boolean {
  if (!isInBounds(state.map, tx, ty)) return false;
  const tile = getTile(state.map, tx, ty);
  if (tile === TileType.Water || tile === TileType.Mountain) return false;
  if (isOccupiedByBuilding(state, tx, ty)) return false;
  if (isOccupiedByIndustry(state, tx, ty)) return false;
  if (!canAfford(state.economy, DEPOT_COST)) return false;

  spend(state.economy, DEPOT_COST);
  const id = generateId(state);
  const depot = createDepot(id, { x: tx, y: ty });
  state.buildings.push(depot);
  if (tile !== TileType.Road && tile !== TileType.Rail) {
    setTile(state.map, tx, ty, TileType.Road);
    state.roadsBuilt++;
  }
  return true;
}

function handleDemolish(state: GameState, tx: number, ty: number): boolean {
  if (!isInBounds(state.map, tx, ty)) return false;

  const bIdx = state.buildings.findIndex((b) => b.position.x === tx && b.position.y === ty);
  if (bIdx !== -1) {
    const b = state.buildings[bIdx];
    const costMap: Partial<Record<BuildingType, number>> = {
      [BuildingType.Station]: STATION_COST,
      [BuildingType.Depot]: DEPOT_COST,
      [BuildingType.Airport]: AIRPORT_COST,
      [BuildingType.Seaport]: SEAPORT_COST,
    };
    const refund = (costMap[b.type] ?? STATION_COST) * DEMOLISH_REFUND_RATIO;
    state.economy.money += refund;
    state.buildings.splice(bIdx, 1);
    return true;
  }

  const tile = getTile(state.map, tx, ty);
  if (tile === TileType.Road) {
    const refund = ROAD_COST * DEMOLISH_REFUND_RATIO;
    state.economy.money += refund;
    setTile(state.map, tx, ty, TileType.Grass);
    return true;
  }
  if (tile === TileType.Rail) {
    const refund = RAIL_COST * DEMOLISH_REFUND_RATIO;
    state.economy.money += refund;
    setTile(state.map, tx, ty, TileType.Grass);
    return true;
  }

  return false;
}

function isOccupiedByBuilding(state: GameState, tx: number, ty: number): boolean {
  return state.buildings.some((b) => b.position.x === tx && b.position.y === ty);
}

function isOccupiedByIndustry(state: GameState, tx: number, ty: number): boolean {
  return state.industries.some((ind) =>
    tx >= ind.position.x && tx < ind.position.x + ind.size.x &&
    ty >= ind.position.y && ty < ind.position.y + ind.size.y
  );
}

function handleLayRail(state: GameState, tx: number, ty: number): boolean {
  if (!isRailwayUnlocked(state)) return false;
  if (!isInBounds(state.map, tx, ty)) return false;
  const tile = getTile(state.map, tx, ty);
  // Can lay rail on Grass, Sand, or existing Road (upgrades it)
  if (tile === TileType.Water || tile === TileType.Mountain || tile === TileType.Rail) return false;
  if (isOccupiedByBuilding(state, tx, ty)) return false;
  if (isOccupiedByIndustry(state, tx, ty)) return false;
  if (!canAfford(state.economy, RAIL_COST)) return false;

  spend(state.economy, RAIL_COST);
  setTile(state.map, tx, ty, TileType.Rail);
  state.railsBuilt++;
  return true;
}

function handleBuildBridge(state: GameState, tx: number, ty: number): boolean {
  if (!isBridgingUnlocked(state)) return false;
  if (!isInBounds(state.map, tx, ty)) return false;
  if (getTile(state.map, tx, ty) !== TileType.Water) return false; // bridges cross water
  if (!canAfford(state.economy, BRIDGE_COST)) return false;
  spend(state.economy, BRIDGE_COST);
  setTile(state.map, tx, ty, TileType.Road);
  state.roadsBuilt++;
  return true;
}

function handleBuildTunnel(state: GameState, tx: number, ty: number): boolean {
  if (!isTunnelingUnlocked(state)) return false;
  if (!isInBounds(state.map, tx, ty)) return false;
  if (getTile(state.map, tx, ty) !== TileType.Mountain) return false; // tunnels cut through mountains
  if (!canAfford(state.economy, TUNNEL_COST)) return false;
  spend(state.economy, TUNNEL_COST);
  setTile(state.map, tx, ty, TileType.Road);
  state.roadsBuilt++;
  return true;
}

function handlePlaceAirport(state: GameState, tx: number, ty: number): boolean {
  if (!isAviationUnlocked(state)) return false;
  if (!isInBounds(state.map, tx, ty)) return false;
  const tile = getTile(state.map, tx, ty);
  if (tile === TileType.Water || tile === TileType.Mountain) return false;
  if (isOccupiedByBuilding(state, tx, ty)) return false;
  if (isOccupiedByIndustry(state, tx, ty)) return false;
  if (!canAfford(state.economy, AIRPORT_COST)) return false;

  spend(state.economy, AIRPORT_COST);
  const id = generateId(state);
  const airport = createAirport(id, { x: tx, y: ty });
  autoLinkStation(airport, state.industries);
  state.buildings.push(airport);
  return true;
}

function handlePlaceSeaport(state: GameState, tx: number, ty: number): boolean {
  if (!isMaritimeUnlocked(state)) return false;
  if (!isInBounds(state.map, tx, ty)) return false;
  const tile = getTile(state.map, tx, ty);
  if (tile === TileType.Water || tile === TileType.Mountain) return false;
  if (isOccupiedByBuilding(state, tx, ty)) return false;
  if (isOccupiedByIndustry(state, tx, ty)) return false;
  // Require adjacent water tile so seaport is on coast
  const adjacent = [
    { x: tx - 1, y: ty }, { x: tx + 1, y: ty },
    { x: tx, y: ty - 1 }, { x: tx, y: ty + 1 },
  ];
  const hasCoast = adjacent.some(
    ({ x, y }) => isInBounds(state.map, x, y) && getTile(state.map, x, y) === TileType.Water
  );
  if (!hasCoast) return false;
  if (!canAfford(state.economy, SEAPORT_COST)) return false;

  spend(state.economy, SEAPORT_COST);
  const id = generateId(state);
  const seaport = createSeaport(id, { x: tx, y: ty });
  autoLinkStation(seaport, state.industries);
  state.buildings.push(seaport);
  return true;
}
