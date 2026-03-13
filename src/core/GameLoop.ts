import type { GameState } from './types.ts';
import { SimSpeed } from './types.ts';
import { TICK_DURATION_NORMAL, TICK_DURATION_FAST, TICK_DURATION_DEVMODE } from '../constants.ts';
import { tickIndustries } from './Industry.ts';
import { tickVehicleMovement } from './Vehicle.ts';
import { tickObjectives } from './Objectives.ts';
import { tickRoutes } from './RouteExecution.ts';

export function getTickDuration(speed: SimSpeed): number {
  switch (speed) {
    case SimSpeed.Paused: return 0;
    case SimSpeed.Normal: return TICK_DURATION_NORMAL;
    case SimSpeed.Fast:   return TICK_DURATION_FAST;
    case SimSpeed.Dev:    return TICK_DURATION_DEVMODE;
  }
}

/** Run one simulation tick — advances the world by one discrete step */
export function simulationTick(state: GameState): string[] {
  tickIndustries(state.industries, state.time.tick);

  // Move vehicles first, then execute route logic on the updated positions
  for (const vehicle of state.vehicles) {
    tickVehicleMovement(vehicle);
  }
  tickRoutes(state);

  // Check objectives every 5 ticks to reduce overhead
  let newlyCompleted: string[] = [];
  if (state.time.tick % 5 === 0) {
    newlyCompleted = tickObjectives(state);
  }

  state.time.tick++;
  return newlyCompleted;
}
