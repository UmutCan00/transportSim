import type { GameState } from './types.ts';
import { TileType, ToolType } from './types.ts';
import { buildingOccupiesTile } from './Building.ts';
import { getTile, isBuildable, isInBounds } from './World.ts';

export function isOccupiedByBuilding(state: GameState, tx: number, ty: number): boolean {
  return state.buildings.some((b) => buildingOccupiesTile(b, tx, ty));
}

export function isOccupiedByIndustry(state: GameState, tx: number, ty: number): boolean {
  return state.industries.some((ind) =>
    tx >= ind.position.x && tx < ind.position.x + ind.size.x &&
    ty >= ind.position.y && ty < ind.position.y + ind.size.y
  );
}

export function canPlaceFootprint(
  state: GameState, tx: number, ty: number, w: number, h: number,
): boolean {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const x = tx + dx;
      const y = ty + dy;
      if (!isInBounds(state.map, x, y)) return false;
      if (!isBuildable(state.map, x, y) && getTile(state.map, x, y) !== TileType.Road) return false;
      if (isOccupiedByBuilding(state, x, y)) return false;
      if (isOccupiedByIndustry(state, x, y)) return false;
    }
  }
  return true;
}

export function hasAdjacentWater(
  state: GameState, tx: number, ty: number, w: number, h: number,
): boolean {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const nx = tx + dx;
      const ny = ty + dy;
      const neighbors = [
        { x: nx - 1, y: ny },
        { x: nx + 1, y: ny },
        { x: nx, y: ny - 1 },
        { x: nx, y: ny + 1 },
      ];
      if (neighbors.some(({ x, y }) => isInBounds(state.map, x, y) && getTile(state.map, x, y) === TileType.Water)) {
        return true;
      }
    }
  }
  return false;
}

export function canPlaceToolAt(
  state: GameState,
  tool: ToolType,
  tx: number,
  ty: number,
): boolean {
  switch (tool) {
    case ToolType.BuildRoad: {
      if (!isInBounds(state.map, tx, ty)) return false;
      if (!isBuildable(state.map, tx, ty)) return false;
      if (getTile(state.map, tx, ty) === TileType.Rail) return false;
      if (isOccupiedByBuilding(state, tx, ty)) return false;
      if (isOccupiedByIndustry(state, tx, ty)) return false;
      return true;
    }
    case ToolType.PlaceStation:
      return canPlaceFootprint(state, tx, ty, 1, 1);
    case ToolType.PlaceDepot:
      return canPlaceFootprint(state, tx, ty, 2, 1);
    case ToolType.PlaceTrainYard:
      return canPlaceFootprint(state, tx, ty, 2, 2);
    case ToolType.PlaceAirport:
      return canPlaceFootprint(state, tx, ty, 2, 2);
    case ToolType.PlaceAirportLarge:
      return canPlaceFootprint(state, tx, ty, 3, 3);
    case ToolType.PlaceSeaport:
      return canPlaceFootprint(state, tx, ty, 2, 2) && hasAdjacentWater(state, tx, ty, 2, 2);
    case ToolType.PlaceSeaportLarge:
      return canPlaceFootprint(state, tx, ty, 3, 3) && hasAdjacentWater(state, tx, ty, 3, 3);
    case ToolType.BuildBridge:
      return getTile(state.map, tx, ty) === TileType.Water;
    case ToolType.BuildTunnel:
      return getTile(state.map, tx, ty) === TileType.Mountain;
    default:
      return false;
  }
}
