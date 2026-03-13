import type { TileMap, Vec2 } from './types.ts';
import { TileType } from './types.ts';
import { MAP_WIDTH, MAP_HEIGHT } from '../constants.ts';

export function createTileMap(width = MAP_WIDTH, height = MAP_HEIGHT): TileMap {
  return {
    width,
    height,
    tiles: new Array(width * height).fill(TileType.Grass),
  };
}

export function tileIndex(map: TileMap, x: number, y: number): number {
  return y * map.width + x;
}

export function getTile(map: TileMap, x: number, y: number): TileType {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return TileType.Water;
  return map.tiles[tileIndex(map, x, y)];
}

export function setTile(map: TileMap, x: number, y: number, type: TileType): void {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
  map.tiles[tileIndex(map, x, y)] = type;
}

export function isInBounds(map: TileMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function isBuildable(map: TileMap, x: number, y: number): boolean {
  if (!isInBounds(map, x, y)) return false;
  const tile = getTile(map, x, y);
  // Mountain is never buildable; Rail can host stations and depots
  return tile === TileType.Grass || tile === TileType.Sand || tile === TileType.Rail;
}

export function isWalkable(map: TileMap, x: number, y: number): boolean {
  if (!isInBounds(map, x, y)) return false;
  const tile = getTile(map, x, y);
  return tile === TileType.Road || tile === TileType.Rail;
}

/** Get 4-directional neighbors within bounds */
export function getNeighbors(map: TileMap, pos: Vec2): Vec2[] {
  const dirs: Vec2[] = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ];
  const result: Vec2[] = [];
  for (const d of dirs) {
    const nx = pos.x + d.x;
    const ny = pos.y + d.y;
    if (isInBounds(map, nx, ny)) {
      result.push({ x: nx, y: ny });
    }
  }
  return result;
}
