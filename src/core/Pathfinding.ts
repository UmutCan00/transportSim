import type { Vec2, TileMap } from './types.ts';
import { TileType } from './types.ts';
import { getNeighbors } from './World.ts';

interface PathNode {
  pos: Vec2;
  g: number;
  f: number;
  parent: PathNode | null;
}

function heuristic(a: Vec2, b: Vec2): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function posKey(pos: Vec2): number {
  return pos.y * 10000 + pos.x;
}

/**
 * A* pathfinding on the tile grid.
 * Only Road tiles (and the start/end tiles themselves) are considered walkable.
 * Returns ordered tile positions from `from` to `to`, or null if unreachable.
 */
export function findPath(
  map: TileMap,
  from: Vec2,
  to: Vec2,
  allowedTiles?: Set<number>,
): Vec2[] | null {
  if (from.x === to.x && from.y === to.y) return [{ ...from }];

  const isAllowed = (x: number, y: number): boolean => {
    if (allowedTiles) return allowedTiles.has(posKey({ x, y }));
    if (x === from.x && y === from.y) return true;
    if (x === to.x && y === to.y) return true;
    const idx = y * map.width + x;
    // Both Road and Rail are traversable — trucks and locomotives share the network
    return map.tiles[idx] === TileType.Road || map.tiles[idx] === TileType.Rail;
  };

  const startNode: PathNode = { pos: from, g: 0, f: heuristic(from, to), parent: null };

  // Simple binary heap (open set)
  const open: PathNode[] = [startNode];
  const closed = new Set<number>();
  const gScores = new Map<number, number>();
  gScores.set(posKey(from), 0);

  while (open.length > 0) {
    // Find node with lowest f
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const current = open[bestIdx];
    open[bestIdx] = open[open.length - 1];
    open.pop();

    const key = posKey(current.pos);
    if (closed.has(key)) continue;
    closed.add(key);

    // Found goal
    if (current.pos.x === to.x && current.pos.y === to.y) {
      const path: Vec2[] = [];
      let node: PathNode | null = current;
      while (node) {
        path.push({ ...node.pos });
        node = node.parent;
      }
      path.reverse();
      return path;
    }

    for (const neighbor of getNeighbors(map, current.pos)) {
      const nKey = posKey(neighbor);
      if (closed.has(nKey)) continue;
      if (!isAllowed(neighbor.x, neighbor.y)) continue;

      const tentativeG = current.g + 1;
      const prevG = gScores.get(nKey);
      if (prevG !== undefined && tentativeG >= prevG) continue;

      gScores.set(nKey, tentativeG);
      const node: PathNode = {
        pos: neighbor,
        g: tentativeG,
        f: tentativeG + heuristic(neighbor, to),
        parent: current,
      };
      open.push(node);
    }
  }

  return null; // No path found
}

/**
 * Bresenham straight-line path for planes.
 * Ignores all tile types — planes fly over everything.
 */
export function findFlightPath(from: Vec2, to: Vec2): Vec2[] {
  const path: Vec2[] = [];
  let x0 = from.x, y0 = from.y;
  const x1 = to.x, y1 = to.y;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    path.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx)  { err += dx; y0 += sy; }
  }
  return path;
}

/**
 * BFS pathfinding for ships on water tiles.
 * Start and end positions are allowed even if they’re on land (coast tiles).
 * All intermediate tiles must be Water.
 */
export function findWaterPath(map: TileMap, from: Vec2, to: Vec2): Vec2[] | null {
  if (from.x === to.x && from.y === to.y) return [{ ...from }];

  interface BNode { x: number; y: number; parent: BNode | null; }
  const key = (x: number, y: number) => y * map.width + x;
  const visited = new Set<number>();
  visited.add(key(from.x, from.y));
  const queue: BNode[] = [{ x: from.x, y: from.y, parent: null }];
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.x === to.x && cur.y === to.y) {
      const path: Vec2[] = [];
      let n: BNode | null = cur;
      while (n) { path.push({ x: n.x, y: n.y }); n = n.parent; }
      path.reverse();
      return path;
    }
    for (const [ddx, ddy] of dirs) {
      const nx = cur.x + ddx, ny = cur.y + ddy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      const k = key(nx, ny);
      if (visited.has(k)) continue;
      const tile = map.tiles[ny * map.width + nx];
      // Allow water tiles and the destination (coast seaport tile)
      if (tile !== TileType.Water && !(nx === to.x && ny === to.y)) continue;
      visited.add(k);
      queue.push({ x: nx, y: ny, parent: cur });
    }
  }
  return null;
}
