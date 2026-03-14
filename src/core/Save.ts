import type { GameState, MapSize } from './types.ts';
import { generateIndustryName } from './Industry.ts';

export type SaveSlot = 0 | 1 | 2;

export interface SaveMeta {
  slot: SaveSlot;
  seed: number;
  mapSize: MapSize;
  tick: number;
  money: number;
  earned: number;
  savedAt: number;   // Date.now()
}

const SLOT_KEY = (slot: SaveSlot) => `transportsim_slot_${slot}`;
const META_KEY = (slot: SaveSlot) => `transportsim_slot_${slot}_meta`;

export function saveToSlot(state: GameState, slot: SaveSlot): void {
  const meta: SaveMeta = {
    slot,
    seed: state.seed,
    mapSize: state.mapSize,
    tick: state.time.tick,
    money: state.economy.money,
    earned: state.economy.totalEarned,
    savedAt: Date.now(),
  };
  localStorage.setItem(META_KEY(slot), JSON.stringify(meta));
  localStorage.setItem(SLOT_KEY(slot), JSON.stringify(state));
}

export function loadFromSlot(slot: SaveSlot): GameState | null {
  const json = localStorage.getItem(SLOT_KEY(slot));
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as GameState;
    if (!parsed.map || !parsed.economy || !Array.isArray(parsed.industries)) return null;
    // Migrate saves that predate new fields
    if (parsed.mapSize === undefined) parsed.mapSize = 'normal';
    if (parsed.railsBuilt === undefined) parsed.railsBuilt = 0;
    // Migrate vehicles missing vehicleType
    for (const v of parsed.vehicles) {
      if ((v as { vehicleType?: string }).vehicleType === undefined) {
        (v as { vehicleType: string }).vehicleType = 'truck';
      }
    }
    // Migrate industries missing name (added in later version)
    for (const ind of parsed.industries) {
      if (!(ind as { name?: string }).name) {
        (ind as { name: string }).name = generateIndustryName(ind.type, ind.id);
      }
    }
    // Migrate routes missing name
    for (const route of parsed.routes) {
      if (!(route as { name?: string }).name) {
        (route as { name: string }).name = '';
      }
    }
    // Migrate missing devMode field
    if ((parsed as { devMode?: boolean }).devMode === undefined) {
      (parsed as { devMode: boolean }).devMode = false;
    }
    // Migrate missing difficulty/theme fields
    if ((parsed as { difficulty?: string }).difficulty === undefined) {
      (parsed as { difficulty: string }).difficulty = 'normal';
    }
    if ((parsed as { theme?: string }).theme === undefined) {
      (parsed as { theme: string }).theme = 'dark';
    }
    // Migrate missing tile counts (recalculate from map data)
    if ((parsed as { roadTileCount?: number }).roadTileCount === undefined) {
      let roads = 0, rails = 0;
      // TileType.Road=1, TileType.Rail=5
      for (const t of parsed.map.tiles) {
        if (t === 1) roads++;
        else if (t === 5) rails++;
      }
      (parsed as { roadTileCount: number }).roadTileCount = roads;
      (parsed as { railTileCount: number }).railTileCount = rails;
    }
    // Migrate missing economy maintenance fields
    if ((parsed.economy as { totalMaintenancePaid?: number }).totalMaintenancePaid === undefined) {
      (parsed.economy as { totalMaintenancePaid: number }).totalMaintenancePaid = 0;
      (parsed.economy as { lastMaintenanceBill: number }).lastMaintenanceBill = 0;
    }
    // Migrate missing transaction history
    if (!Array.isArray((parsed.economy as { transactions?: unknown }).transactions)) {
      (parsed.economy as { transactions: unknown[] }).transactions = [];
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getSlotMeta(slot: SaveSlot): SaveMeta | null {
  const json = localStorage.getItem(META_KEY(slot));
  if (!json) return null;
  try { return JSON.parse(json) as SaveMeta; } catch { return null; }
}

export function clearSlot(slot: SaveSlot): void {
  localStorage.removeItem(SLOT_KEY(slot));
  localStorage.removeItem(META_KEY(slot));
}

/** Legacy single-slot migration: copy old save to slot 0 if present */
export function migrateLegacySave(): void {
  const legacy = localStorage.getItem('transportsim_save');
  if (!legacy) return;
  if (localStorage.getItem(SLOT_KEY(0))) return; // slot 0 already has data
  localStorage.setItem(SLOT_KEY(0), legacy);
  // Remove so we don't migrate again
  localStorage.removeItem('transportsim_save');
}

export function exportToFile(state: GameState): void {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transportsim-seed${state.seed}-tick${state.time.tick}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
