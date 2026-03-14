import type { GameState, MapSize, Difficulty, Theme } from './types.ts';
import { SimSpeed } from './types.ts';
import { createEconomy } from './Economy.ts';
import { generateMap } from './MapGen.ts';
import { randomSeed } from './Random.ts';
import { createTechTree } from './TechTree.ts';
import { createObjectives } from './Objectives.ts';
import { MAP_SIZES, DEV_START_MONEY, DIFFICULTY_START_MONEY_MULT } from '../constants.ts';

export interface NewGameOptions {
  seed?: number;
  mapSize?: MapSize;
  devMode?: boolean;
  difficulty?: Difficulty;
  theme?: Theme;
}

export function createInitialGameState(opts?: NewGameOptions): GameState {
  const actualSeed = opts?.seed ?? randomSeed();
  const mapSize: MapSize = opts?.mapSize ?? 'normal';
  const devMode = opts?.devMode ?? false;
  const difficulty: Difficulty = opts?.difficulty ?? 'normal';
  const theme: Theme = opts?.theme ?? 'dark';
  const { startMoney } = MAP_SIZES[mapSize];
  const adjustedMoney = devMode
    ? DEV_START_MONEY
    : Math.round(startMoney * DIFFICULTY_START_MONEY_MULT[difficulty]);
  const { map, industries, nextId } = generateMap(actualSeed, mapSize);
  const economy = createEconomy();
  economy.money = adjustedMoney;

  const techTree = createTechTree();
  // Dev mode: pre-unlock all techs for instant testing
  if (devMode) {
    for (const tech of techTree) tech.unlocked = true;
  }

  return {
    seed: actualSeed,
    mapSize,
    map,
    industries,
    buildings: [],
    vehicles: [],
    routes: [],
    economy,
    time: { tick: 0, speed: devMode ? SimSpeed.Dev : SimSpeed.Normal },
    nextId,
    tech: techTree,
    objectives: createObjectives(),
    roadsBuilt: 0,
    railsBuilt: 0,
    roadTileCount: 0,
    railTileCount: 0,
    devMode,
    difficulty,
    theme,
  };
}

export function generateId(state: GameState): number {
  return state.nextId++;
}
