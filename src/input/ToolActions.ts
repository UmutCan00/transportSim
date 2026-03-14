import type { GameState, UIState } from '../core/types.ts';
import { ToolType, TileType, BuildingType } from '../core/types.ts';
import { getTile, setTile, isBuildable, isInBounds } from '../core/World.ts';
import {
  createStation, createDepot, createAirport, createSeaport,
  createTrainYard, autoLinkStation, buildingOccupiesTile,
} from '../core/Building.ts';
import { canAfford, spend } from '../core/Economy.ts';
import { generateId } from '../core/GameState.ts';
import {
  getRoadCostMult, isRailwayUnlocked, isBridgingUnlocked, isTunnelingUnlocked,
  isAviationUnlocked, isMaritimeUnlocked, isAdvancedAviationUnlocked, isDeepSeaUnlocked,
} from '../core/TechTree.ts';
import {
  ROAD_COST, STATION_COST, DEPOT_COST, TRAIN_YARD_COST, DEMOLISH_REFUND_RATIO,
  RAIL_COST, BRIDGE_COST, TUNNEL_COST,
  AIRPORT_SMALL_COST, AIRPORT_LARGE_COST, SEAPORT_SMALL_COST, SEAPORT_LARGE_COST,
} from '../constants.ts';

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
      return handlePlaceDepot(state, uiState, tx, ty);
    case ToolType.PlaceTrainYard:
      return handlePlaceTrainYard(state, uiState, tx, ty);
    case ToolType.Demolish:
      return handleDemolish(state, tx, ty);
    case ToolType.LayRail:
      return handleLayRail(state, tx, ty);
    case ToolType.BuildBridge:
      return handleBuildBridge(state, tx, ty);
    case ToolType.BuildTunnel:
      return handleBuildTunnel(state, tx, ty);
    case ToolType.PlaceAirport:
      return handlePlaceAirport(state, uiState, tx, ty, 'small');
    case ToolType.PlaceAirportLarge:
      return handlePlaceAirport(state, uiState, tx, ty, 'large');
    case ToolType.PlaceSeaport:
      return handlePlaceSeaport(state, uiState, tx, ty, 'small');
    case ToolType.PlaceSeaportLarge:
      return handlePlaceSeaport(state, uiState, tx, ty, 'large');
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
  const building = state.buildings.find((b) => buildingOccupiesTile(b, tx, ty));
  if (building) {
    uiState.selectedEntityId = building.id;
    uiState.selectedEntityType = 'building';
    if (building.type === BuildingType.Depot || building.type === BuildingType.TrainYard ||
        building.type === BuildingType.Airport || building.type === BuildingType.Seaport) {
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
  if (getTile(state.map, tx, ty) === TileType.Rail) return false;
  if (isOccupiedByBuilding(state, tx, ty)) return false;
  if (isOccupiedByIndustry(state, tx, ty)) return false;
  const cost = Math.floor(ROAD_COST * getRoadCostMult(state));
  if (!canAfford(state.economy, cost)) return false;

  spend(state.economy, cost);
  setTile(state.map, tx, ty, TileType.Road);
  state.roadsBuilt++;
  state.roadTileCount = (state.roadTileCount ?? 0) + 1;
  return true;
}

function handlePlaceStation(state: GameState, tx: number, ty: number): boolean {
  if (!canPlaceFootprint(state, tx, ty, 1, 1)) return false;
  if (!canAfford(state.economy, STATION_COST)) return false;

  spend(state.economy, STATION_COST);
  const id = generateId(state);
  const station = createStation(id, { x: tx, y: ty });
  autoLinkStation(station, state.industries);
  state.buildings.push(station);
  const tile = getTile(state.map, tx, ty);
  if (tile !== TileType.Road && tile !== TileType.Rail) {
    setTile(state.map, tx, ty, TileType.Road);
    state.roadsBuilt++;
    state.roadTileCount = (state.roadTileCount ?? 0) + 1;
  }
  return true;
}

function handlePlaceDepot(state: GameState, uiState: UIState, tx: number, ty: number): boolean {
  // Depot is 2×1 tiles
  if (!canPlaceFootprint(state, tx, ty, 2, 1)) return false;
  if (!canAfford(state.economy, DEPOT_COST)) return false;

  spend(state.economy, DEPOT_COST);
  const id = generateId(state);
  const depot = createDepot(id, { x: tx, y: ty });
  state.buildings.push(depot);
  // Ensure both footprint tiles are roads
  for (let dx = 0; dx < 2; dx++) {
    const ftx = tx + dx;
    const tile = getTile(state.map, ftx, ty);
    if (tile !== TileType.Road && tile !== TileType.Rail) {
      setTile(state.map, ftx, ty, TileType.Road);
      state.roadsBuilt++;
      state.roadTileCount = (state.roadTileCount ?? 0) + 1;
    }
  }
  uiState.selectedEntityId = id;
  uiState.selectedEntityType = 'building';
  uiState.activePanel = 'depot';
  return true;
}

function handlePlaceTrainYard(state: GameState, uiState: UIState, tx: number, ty: number): boolean {
  if (!isRailwayUnlocked(state)) return false;
  if (!canPlaceFootprint(state, tx, ty, 2, 2)) return false;
  if (!canAfford(state.economy, TRAIN_YARD_COST)) return false;

  spend(state.economy, TRAIN_YARD_COST);
  const id = generateId(state);
  const yard = createTrainYard(id, { x: tx, y: ty });
  state.buildings.push(yard);
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const tile = getTile(state.map, tx + dx, ty + dy);
      if (tile !== TileType.Rail) {
        setTile(state.map, tx + dx, ty + dy, TileType.Rail);
        state.railsBuilt++;
        state.railTileCount = (state.railTileCount ?? 0) + 1;
      }
    }
  }
  uiState.selectedEntityId = id;
  uiState.selectedEntityType = 'building';
  uiState.activePanel = 'depot';
  return true;
}

function handleDemolish(state: GameState, tx: number, ty: number): boolean {
  if (!isInBounds(state.map, tx, ty)) return false;

  const bIdx = state.buildings.findIndex((b) => buildingOccupiesTile(b, tx, ty));
  if (bIdx !== -1) {
    const b = state.buildings[bIdx];
    const costMap: Partial<Record<string, number>> = {
      [BuildingType.Station]:  STATION_COST,
      [BuildingType.Depot]:    DEPOT_COST,
      [BuildingType.TrainYard]: TRAIN_YARD_COST,
      [BuildingType.Airport]:  AIRPORT_SMALL_COST,
      [BuildingType.Seaport]:  SEAPORT_SMALL_COST,
    };
    const baseCost = costMap[b.type as string] ?? STATION_COST;
    const refund = Math.floor(baseCost * DEMOLISH_REFUND_RATIO);
    state.economy.money += refund;
    state.buildings.splice(bIdx, 1);
    return true;
  }

  const tile = getTile(state.map, tx, ty);
  if (tile === TileType.Road) {
    state.economy.money += Math.floor(ROAD_COST * DEMOLISH_REFUND_RATIO);
    setTile(state.map, tx, ty, TileType.Grass);
    state.roadTileCount = Math.max(0, (state.roadTileCount ?? 0) - 1);
    return true;
  }
  if (tile === TileType.Rail) {
    state.economy.money += Math.floor(RAIL_COST * DEMOLISH_REFUND_RATIO);
    setTile(state.map, tx, ty, TileType.Grass);
    state.railTileCount = Math.max(0, (state.railTileCount ?? 0) - 1);
    return true;
  }

  return false;
}

function isOccupiedByBuilding(state: GameState, tx: number, ty: number): boolean {
  return state.buildings.some((b) => buildingOccupiesTile(b, tx, ty));
}

function isOccupiedByIndustry(state: GameState, tx: number, ty: number): boolean {
  return state.industries.some((ind) =>
    tx >= ind.position.x && tx < ind.position.x + ind.size.x &&
    ty >= ind.position.y && ty < ind.position.y + ind.size.y
  );
}

/** Check that all tiles in a w×h footprint rooted at (tx,ty) are free to build on. */
function canPlaceFootprint(
  state: GameState, tx: number, ty: number, w: number, h: number
): boolean {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const x = tx + dx, y = ty + dy;
      if (!isInBounds(state.map, x, y)) return false;
      const tile = getTile(state.map, x, y);
      if (tile === TileType.Water || tile === TileType.Mountain) return false;
      if (isOccupiedByBuilding(state, x, y)) return false;
      if (isOccupiedByIndustry(state, x, y)) return false;
    }
  }
  return true;
}

function handleLayRail(state: GameState, tx: number, ty: number): boolean {
  if (!isRailwayUnlocked(state)) return false;
  if (!isInBounds(state.map, tx, ty)) return false;
  const tile = getTile(state.map, tx, ty);
  if (tile === TileType.Water || tile === TileType.Mountain || tile === TileType.Rail) return false;
  if (isOccupiedByBuilding(state, tx, ty)) return false;
  if (isOccupiedByIndustry(state, tx, ty)) return false;
  if (!canAfford(state.economy, RAIL_COST)) return false;

  spend(state.economy, RAIL_COST);
  setTile(state.map, tx, ty, TileType.Rail);
  state.railsBuilt++;
  state.railTileCount = (state.railTileCount ?? 0) + 1;
  return true;
}

function handleBuildBridge(state: GameState, tx: number, ty: number): boolean {
  if (!isBridgingUnlocked(state)) return false;
  if (!isInBounds(state.map, tx, ty)) return false;
  if (getTile(state.map, tx, ty) !== TileType.Water) return false;
  if (!canAfford(state.economy, BRIDGE_COST)) return false;
  spend(state.economy, BRIDGE_COST);
  setTile(state.map, tx, ty, TileType.Road);
  state.roadsBuilt++;
  state.roadTileCount = (state.roadTileCount ?? 0) + 1;
  return true;
}

function handleBuildTunnel(state: GameState, tx: number, ty: number): boolean {
  if (!isTunnelingUnlocked(state)) return false;
  if (!isInBounds(state.map, tx, ty)) return false;
  if (getTile(state.map, tx, ty) !== TileType.Mountain) return false;
  if (!canAfford(state.economy, TUNNEL_COST)) return false;
  spend(state.economy, TUNNEL_COST);
  setTile(state.map, tx, ty, TileType.Road);
  state.roadsBuilt++;
  state.roadTileCount = (state.roadTileCount ?? 0) + 1;
  return true;
}

function handlePlaceAirport(
  state: GameState, uiState: UIState, tx: number, ty: number, tier: 'small' | 'large'
): boolean {
  if (!isAviationUnlocked(state)) return false;
  if (tier === 'large' && !isAdvancedAviationUnlocked(state)) return false;
  const [w, h] = tier === 'large' ? [3, 3] : [2, 2];
  const cost = tier === 'large' ? AIRPORT_LARGE_COST : AIRPORT_SMALL_COST;
  if (!canPlaceFootprint(state, tx, ty, w, h)) return false;
  if (!canAfford(state.economy, cost)) return false;

  spend(state.economy, cost);
  const id = generateId(state);
  const airport = createAirport(id, { x: tx, y: ty }, tier);
  autoLinkStation(airport, state.industries);
  state.buildings.push(airport);
  uiState.selectedEntityId = id;
  uiState.selectedEntityType = 'building';
  uiState.activePanel = 'depot';
  return true;
}

function handlePlaceSeaport(
  state: GameState, uiState: UIState, tx: number, ty: number, tier: 'small' | 'large'
): boolean {
  if (!isMaritimeUnlocked(state)) return false;
  if (tier === 'large' && !isDeepSeaUnlocked(state)) return false;
  const [w, h] = tier === 'large' ? [3, 3] : [2, 2];
  const cost = tier === 'large' ? SEAPORT_LARGE_COST : SEAPORT_SMALL_COST;
  if (!canPlaceFootprint(state, tx, ty, w, h)) return false;
  // At least one adjacent tile must be water
  const hasCoast = ((): boolean => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const nx = tx + dx, ny = ty + dy;
        const neighbors = [
          { x: nx - 1, y: ny }, { x: nx + 1, y: ny },
          { x: nx, y: ny - 1 }, { x: nx, y: ny + 1 },
        ];
        if (neighbors.some(
          ({ x, y }) => isInBounds(state.map, x, y) && getTile(state.map, x, y) === TileType.Water
        )) return true;
      }
    }
    return false;
  })();
  if (!hasCoast) return false;
  if (!canAfford(state.economy, cost)) return false;

  spend(state.economy, cost);
  const id = generateId(state);
  const seaport = createSeaport(id, { x: tx, y: ty }, tier);
  autoLinkStation(seaport, state.industries);
  state.buildings.push(seaport);
  uiState.selectedEntityId = id;
  uiState.selectedEntityType = 'building';
  uiState.activePanel = 'depot';
  return true;
}

