import type { TileMap, Vec2, Industry, MapSize } from './types.ts';
import { TileType } from './types.ts';
import { Random } from './Random.ts';
import {
  createCoalMine, createPowerPlant,
  createForest, createSawmill,
  createFarm, createBakery,
  createOilWell, createRefinery,
  createSteelMill, createFactory,
  createNeighborhood,
  createIronMine, createSmelter, createChemicalPlant, createChemDistributor, createMarket, createLockedNeighborhood,
  createPassengerTerminal, createLockedPassengerTerminal,
} from './Industry.ts';
import {
  NOISE_SCALE, WATER_THRESHOLD, MOUNTAIN_THRESHOLD,
  MIN_INDUSTRY_DISTANCE, INDUSTRY_SIZE,
  NUM_CITIES, MAP_SIZES,
  NUM_LOCKED_CITIES,
  NEIGHBORHOODS_PER_CITY, CITY_CLUSTER_RADIUS, MIN_CITY_SPACING,
} from '../constants.ts';

// ── Value Noise ─────────────────────────────────────────

/** Generate a 2D value noise grid, returning values in [0,1] for each tile */
function generateNoiseMap(rng: Random, width: number, height: number, scale: number): Float32Array {
  // Create low-res random grid
  const gridW = Math.ceil(width / scale) + 2;
  const gridH = Math.ceil(height / scale) + 2;
  const grid = new Float32Array(gridW * gridH);
  for (let i = 0; i < grid.length; i++) {
    grid[i] = rng.next();
  }

  // Smooth interpolation function
  const smoothstep = (t: number) => t * t * (3 - 2 * t);

  const result = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = x / scale;
      const gy = y / scale;
      const ix = Math.floor(gx);
      const iy = Math.floor(gy);
      const fx = smoothstep(gx - ix);
      const fy = smoothstep(gy - iy);

      const v00 = grid[iy * gridW + ix];
      const v10 = grid[iy * gridW + ix + 1];
      const v01 = grid[(iy + 1) * gridW + ix];
      const v11 = grid[(iy + 1) * gridW + ix + 1];

      const top = v00 + (v10 - v00) * fx;
      const bot = v01 + (v11 - v01) * fx;
      result[y * width + x] = top + (bot - top) * fy;
    }
  }
  return result;
}

// ── Connectivity ────────────────────────────────────────

/**
 * BFS flood-fill from the map centre outward to find the largest connected
 * land mass.  Returns a Set of tile indices (y*width+x) on that component.
 * This is used so industry placement is restricted to one connected island,
 * guaranteeing that road paths can always be built between all industries.
 */
function buildMainLandSet(map: TileMap): Set<number> {
  const { width, height, tiles } = map;
  // Find the nearest non-water tile to the centre as the seed
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  let seedX = cx;
  let seedY = cy;
  outer:
  for (let r = 0; r <= Math.max(width, height); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (tiles[ny * width + nx] !== TileType.Water) {
          seedX = nx;
          seedY = ny;
          break outer;
        }
      }
    }
  }

  const visited = new Set<number>();
  const queue: number[] = [seedY * width + seedX];
  visited.add(seedY * width + seedX);
  const dirs = [-1, 1, -width, width]; // left, right, up, down
  while (queue.length > 0) {
    const idx = queue.shift()!;
    for (const d of dirs) {
      const ni = idx + d;
      if (ni < 0 || ni >= tiles.length) continue;
      if (visited.has(ni)) continue;
      // Mountains and water are both impassable for industry-placement connectivity
      if (tiles[ni] === TileType.Water || tiles[ni] === TileType.Mountain) continue;
      // Guard against wrapping at horizontal edges
      if (d === -1 && (idx % width) === 0) continue;
      if (d ===  1 && (idx % width) === width - 1) continue;
      visited.add(ni);
      queue.push(ni);
    }
  }
  return visited;
}

// ── Map Generation ──────────────────────────────────────

export function generateMap(
  seed: number,
  mapSize: MapSize = 'normal',
): { map: TileMap; industries: Industry[]; nextId: number } {
  const rng = new Random(seed);
  const { width, height } = MAP_SIZES[mapSize];

  // Layer multiple noise octaves for more organic shapes
  const noise1 = generateNoiseMap(rng, width, height, NOISE_SCALE);
  const noise2 = generateNoiseMap(rng, width, height, NOISE_SCALE * 2.5);
  const noise3 = generateNoiseMap(rng, width, height, NOISE_SCALE * 0.5);
  // Separate noise for mountain placement so peaks don't correlate with coasts
  const noiseMtn = generateNoiseMap(rng, width, height, 5);

  const tiles = new Array<TileType>(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      // Blend octaves: large shapes + medium detail + small detail
      const value = noise1[i] * 0.5 + noise2[i] * 0.3 + noise3[i] * 0.2;

      // Distance from edge — push edges toward water for island feel
      const edgeX = Math.min(x, width - 1 - x) / (width / 2);
      const edgeY = Math.min(y, height - 1 - y) / (height / 2);
      const edgeFade = Math.min(edgeX, edgeY);
      const edgeFactor = smoothEdge(edgeFade, 0.08, 0.25);

      const adjusted = value * edgeFactor;

      if (adjusted < WATER_THRESHOLD) {
        tiles[i] = TileType.Water;
      } else if (adjusted < WATER_THRESHOLD + 0.04) {
        tiles[i] = TileType.Sand;
      } else if (noiseMtn[i] > MOUNTAIN_THRESHOLD && edgeFactor > 0.4) {
        // Mountains only appear well inside the landmass (edgeFactor > 0.4)
        tiles[i] = TileType.Mountain;
      } else {
        tiles[i] = TileType.Grass;
      }
    }
  }

  const map: TileMap = { width, height, tiles };

  // Pre-compute which tiles belong to the main (largest) connected land mass.
  // All industries will be restricted to this component so road paths always exist.
  const mainLand = buildMainLandSet(map);

  // Place industries in geographic city clusters
  let nextId = 1;
  const industries: Industry[] = [];
  const placed: Vec2[] = [];

  // ── Pick city center positions, well spread across the map ────────────────
  const activeCenters = pickCityCenters(rng, map, mainLand, NUM_CITIES, MIN_CITY_SPACING);
  const lockedCount = NUM_LOCKED_CITIES;
  const lockedCenters = pickCityCenters(rng, map, mainLand, lockedCount, MIN_CITY_SPACING / 2, activeCenters);

  // ── Spawn one full industry cluster per active city ───────────────────────
  for (let cityId = 0; cityId < activeCenters.length; cityId++) {
    const center = activeCenters[cityId];
    const spawn = (factory: (id: number, p: Vec2) => Industry) => {
      const pos = findSpotNear(rng, map, placed, mainLand, center, CITY_CLUSTER_RADIUS, 400);
      if (pos) {
        const ind = factory(nextId++, pos);
        ind.cityId = cityId;
        industries.push(ind);
        placed.push(pos);
        stampIndustry(map, pos);
      }
    };

    // Raw producers
    spawn(createCoalMine);
    spawn(createForest);
    spawn(createFarm);
    spawn(createOilWell);
    spawn(createIronMine);
    // Processors
    spawn(createPowerPlant);
    spawn(createSawmill);
    spawn(createBakery);
    spawn(createRefinery);
    spawn(createSteelMill);
    spawn(createFactory);
    spawn(createSmelter);
    spawn(createChemicalPlant);
    spawn(createChemDistributor);
    spawn(createMarket);
    // Passenger terminal — one per active city for inter-city travel
    spawn(createPassengerTerminal);
    // Consumption buildings (neighborhoods)
    for (let n = 0; n < NEIGHBORHOODS_PER_CITY; n++) {
      spawn(createNeighborhood);
    }
  }

  // ── Spawn locked city clusters ────────────────────────────────────────────
  // City 0 (if exists): surrounded by a mountain ring on mainLand
  // City 1 (if exists): placed on a dedicated small island (water-surrounded)
  const mountainRingCityIdx = 0;
  const islandCityIdx = 1;

  for (let i = 0; i < lockedCenters.length; i++) {
    let center = lockedCenters[i];
    const lockedCityId = activeCenters.length + i;
    const unlockCost = i === 0 ? 120_000 : i === 1 ? 250_000 : 400_000;

    // ── Special city: mountain ring ──
    if (i === mountainRingCityIdx) {
      // Organic mountain valley: clear inner zone, noisy mountain ring around it
      carveNaturalMountainCity(map, center, noiseMtn, CITY_CLUSTER_RADIUS + 2, CITY_CLUSTER_RADIUS + 12);
    }

    // ── Special city: island ──
    if (i === islandCityIdx) {
      // Pick a water location well away from mainLand edge and create a full-size island
      const islandCenter = pickIslandCenter(rng, map, width, height);
      if (islandCenter) {
        // Island radius CITY_CLUSTER_RADIUS+8 gives 6-tile grass margin beyond industry zone
        carveIsland(map, islandCenter, CITY_CLUSTER_RADIUS + 8);
        center = islandCenter;
        lockedCenters[i] = islandCenter;
      }
    }

    // landSet: both special cities use null (industries placed within their carved terrain)
    const lockedLandSet: Set<number> | null =
      (i === islandCityIdx || i === mountainRingCityIdx) ? null : mainLand;

    // Helper: spawn one industry near this locked city center
    const spawn = (factory: (id: number, p: Vec2) => Industry) => {
      const pos = findSpotNear(rng, map, placed, lockedLandSet, center, CITY_CLUSTER_RADIUS, 500);
      if (pos) {
        const ind = factory(nextId++, pos);
        ind.cityId = lockedCityId;
        industries.push(ind);
        placed.push(pos);
        stampIndustry(map, pos);
      }
    };

    // Full city — same industry set as active cities
    // Raw producers
    spawn(createCoalMine);
    spawn(createForest);
    spawn(createFarm);
    spawn(createOilWell);
    spawn(createIronMine);
    // Processors
    spawn(createPowerPlant);
    spawn(createSawmill);
    spawn(createBakery);
    spawn(createRefinery);
    spawn(createSteelMill);
    spawn(createFactory);
    spawn(createSmelter);
    spawn(createChemicalPlant);
    spawn(createChemDistributor);
    spawn(createMarket);
    // Locked passenger terminal
    const ptPos = findSpotNear(rng, map, placed, lockedLandSet, center, CITY_CLUSTER_RADIUS, 500);
    if (ptPos) {
      const pt = createLockedPassengerTerminal(nextId++, ptPos, unlockCost);
      pt.cityId = lockedCityId;
      industries.push(pt);
      placed.push(ptPos);
      stampIndustry(map, ptPos);
    }
    // Locked neighborhoods
    for (let n = 0; n < NEIGHBORHOODS_PER_CITY; n++) {
      const pos = findSpotNear(rng, map, placed, lockedLandSet, center, CITY_CLUSTER_RADIUS, 500);
      if (pos) {
        const nb = createLockedNeighborhood(nextId++, pos, unlockCost);
        nb.cityId = lockedCityId;
        industries.push(nb);
        placed.push(pos);
        stampIndustry(map, pos);
      }
    }
  }

  return { map, industries, nextId };
}

// ── Helpers ─────────────────────────────────────────────

function smoothEdge(t: number, start: number, end: number): number {
  if (t <= start) return 0;
  if (t >= end) return 1;
  const s = (t - start) / (end - start);
  return s * s * (3 - 2 * s);
}

/** Find a valid 2×2 grass area for an industry, respecting min distance and main-land connectivity */
function findIndustrySpot(
  rng: Random,
  map: TileMap,
  existing: Vec2[],
  mainLand: Set<number>,
  maxAttempts: number,
): Vec2 | null {
  const margin = 3; // keep industries away from map edges
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const x = rng.int(margin, map.width - INDUSTRY_SIZE - margin);
    const y = rng.int(margin, map.height - INDUSTRY_SIZE - margin);

    // Check all tiles in the 2×2 area are grass AND on the main land mass
    let valid = true;
    for (let dy = 0; dy < INDUSTRY_SIZE && valid; dy++) {
      for (let dx = 0; dx < INDUSTRY_SIZE && valid; dx++) {
        const idx = (y + dy) * map.width + (x + dx);
        const t = map.tiles[idx];
        // Industries can only sit on Grass (not Sand, Mountain, or any built tile)
        if (t !== TileType.Grass) valid = false;
        if (!mainLand.has(idx)) valid = false;
      }
    }
    if (!valid) continue;

    // Check minimum distance from other industries
    const center = { x: x + INDUSTRY_SIZE / 2, y: y + INDUSTRY_SIZE / 2 };
    let tooClose = false;
    for (const other of existing) {
      const oc = { x: other.x + INDUSTRY_SIZE / 2, y: other.y + INDUSTRY_SIZE / 2 };
      const dist = Math.abs(center.x - oc.x) + Math.abs(center.y - oc.y);
      if (dist < MIN_INDUSTRY_DISTANCE) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    return { x, y };
  }
  return null;
}

/** Mark industry tiles so roads/other buildings won't overlap */
function stampIndustry(map: TileMap, pos: Vec2): void {
  // We don't change tile type — industries sit on grass.
  // The occupancy check is done via the industry list.
  // But we leave surrounding tiles as-is for natural look.
  // This function exists as a hook for future terrain modification.
  void map;
  void pos;
}

/**
 * Find a valid 2×2 grass spot within `radius` tiles of `center`.
 * Falls back to the global findIndustrySpot if no nearby spot is found.
 * Pass `null` for `landSet` to skip the land-connectivity check (e.g. island cities).
 */
function findSpotNear(
  rng: Random,
  map: TileMap,
  existing: Vec2[],
  landSet: Set<number> | null,
  center: Vec2,
  radius: number,
  maxAttempts: number,
): Vec2 | null {
  const margin = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const angle = rng.next() * Math.PI * 2;
    const dist  = rng.next() * radius;
    const x = Math.round(center.x + Math.cos(angle) * dist);
    const y = Math.round(center.y + Math.sin(angle) * dist);

    if (x < margin || y < margin || x + INDUSTRY_SIZE > map.width - margin || y + INDUSTRY_SIZE > map.height - margin) continue;

    let valid = true;
    for (let dy = 0; dy < INDUSTRY_SIZE && valid; dy++) {
      for (let dx = 0; dx < INDUSTRY_SIZE && valid; dx++) {
        const idx = (y + dy) * map.width + (x + dx);
        if (map.tiles[idx] !== TileType.Grass) valid = false;
        if (landSet !== null && !landSet.has(idx)) valid = false;
      }
    }
    if (!valid) continue;

    const c2 = { x: x + INDUSTRY_SIZE / 2, y: y + INDUSTRY_SIZE / 2 };
    let tooClose = false;
    for (const other of existing) {
      const oc = { x: other.x + INDUSTRY_SIZE / 2, y: other.y + INDUSTRY_SIZE / 2 };
      if (Math.abs(c2.x - oc.x) + Math.abs(c2.y - oc.y) < MIN_INDUSTRY_DISTANCE) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    return { x, y };
  }
  // Fallback: search anywhere on the map (only when using mainLand)
  if (landSet !== null) return findIndustrySpot(rng, map, existing, landSet, 400);
  return null;
}

/**
 * Pick `count` city center positions on land, spaced at least `minSpacing` tiles apart.
 * Optionally pass `existing` centers to avoid (e.g. locked cities near active cities).
 */
function pickCityCenters(
  rng: Random,
  map: TileMap,
  mainLand: Set<number>,
  count: number,
  minSpacing: number,
  existing: Vec2[] = [],
): Vec2[] {
  const centers: Vec2[] = [];
  const margin = Math.floor(CITY_CLUSTER_RADIUS * 1.2);
  const allUsed = [...existing];
  const maxAttempts = 2000;

  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = rng.int(margin, map.width  - margin);
      const y = rng.int(margin, map.height - margin);
      const idx = y * map.width + x;
      if (!mainLand.has(idx)) continue;

      let ok = true;
      for (const c of allUsed) {
        const dx = x - c.x;
        const dy = y - c.y;
        if (Math.sqrt(dx * dx + dy * dy) < minSpacing) { ok = false; break; }
      }
      if (!ok) continue;

      const center = { x, y };
      centers.push(center);
      allUsed.push(center);
      break;
    }
  }
  return centers;
}

/**
 * Carve a natural-looking mountain city: a clear grass valley at `center`
 * with an organic mountain landscape around it, driven by `noiseMtn` so
 * peaks are irregular and varied — not a perfect ring.
 */
function carveNaturalMountainCity(
  map: TileMap, center: Vec2, noiseMtn: Float32Array,
  innerRadius: number, denseRadius: number,
): void {
  const { width, height, tiles } = map;
  const sampleRadius = denseRadius + 8; // wider fade zone

  for (let dy = -sampleRadius; dy <= sampleRadius; dy++) {
    for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
      const x = center.x + dx;
      const y = center.y + dy;
      if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
      const idx = y * width + x;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= innerRadius) {
        // City valley — clear to grass
        if (tiles[idx] === TileType.Mountain || tiles[idx] === TileType.Water) {
          tiles[idx] = TileType.Grass;
        }
      } else if (dist <= denseRadius) {
        // Transition zone: blend distance factor with noise for organic edge
        const t = (dist - innerRadius) / (denseRadius - innerRadius); // 0→1
        const n = noiseMtn[idx]; // 0→1
        // High t (far from city) or high noise → mountain; otherwise grass
        if (t * 0.55 + n * 0.65 > 0.65) {
          tiles[idx] = TileType.Mountain;
        } else if (tiles[idx] === TileType.Water) {
          tiles[idx] = TileType.Grass;
        }
      } else if (dist <= sampleRadius) {
        // Outer fringe: add extra mountains where noise is already high
        if (noiseMtn[idx] > 0.60) {
          tiles[idx] = TileType.Mountain;
        }
      }
    }
  }
}

/**
 * Find a deep-water location and carve a small oval grass island there.
 * Returns the island center or null if no suitable location found.
 */
function pickIslandCenter(rng: Random, map: TileMap, width: number, height: number): Vec2 | null {
  // Need enough margin to fit the full island (radius CITY_CLUSTER_RADIUS+8 = 28)
  const islandRadius = CITY_CLUSTER_RADIUS + 8;
  const margin = islandRadius + 4;
  for (let attempt = 0; attempt < 600; attempt++) {
    const x = rng.int(margin, width - margin);
    const y = rng.int(margin, height - margin);
    // Must be water
    if (map.tiles[y * width + x] !== TileType.Water) continue;
    // Check that a large surrounding zone is mostly water
    let waterCount = 0;
    const checkR = islandRadius + 4;
    for (let dy = -checkR; dy <= checkR; dy++) {
      for (let dx = -checkR; dx <= checkR; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (map.tiles[ny * width + nx] === TileType.Water) waterCount++;
      }
    }
    const totalArea = (2 * checkR + 1) * (2 * checkR + 1);
    if (waterCount < totalArea * 0.65) continue;
    return { x, y };
  }
  return null;
}

/** Carve an oval island of grass tiles centred at `center` with given `radius`. */
function carveIsland(map: TileMap, center: Vec2, radius: number): void {
  const { width, height, tiles } = map;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = center.x + dx;
      const y = center.y + dy;
      if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        if (dist <= radius - 2) {
          tiles[y * width + x] = TileType.Grass;
        } else {
          tiles[y * width + x] = TileType.Sand; // beach fringe
        }
      }
    }
  }
}
