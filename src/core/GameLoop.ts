import type { GameState } from './types.ts';
import { SimSpeed, BuildingType, VehicleModel } from './types.ts';
import { TICK_DURATION_NORMAL, TICK_DURATION_FAST, TICK_DURATION_DEVMODE, MAINTENANCE_INTERVAL,
  ROAD_MAINTENANCE_PER_TILE, RAIL_MAINTENANCE_PER_TILE,
  TRUCK_MAINTENANCE, CARGO_TRUCK_MAINTENANCE_MULT, HEAVY_HAULER_MAINTENANCE_MULT,
  LOCO_MAINTENANCE, EXPRESS_TRAIN_MAINTENANCE_MULT,
  PLANE_MAINTENANCE, CARGO_PLANE_MAINTENANCE_MULT, JUMBO_JET_MAINTENANCE_MULT,
  SHIP_MAINTENANCE, CARGO_SHIP_MAINTENANCE_MULT, SUPERTANKER_MAINTENANCE_MULT,
  STATION_MAINTENANCE, DEPOT_MAINTENANCE, TRAIN_YARD_MAINTENANCE,
  AIRPORT_SMALL_MAINTENANCE, AIRPORT_LARGE_MAINTENANCE,
  SEAPORT_SMALL_MAINTENANCE, SEAPORT_LARGE_MAINTENANCE,
  DIFFICULTY_MAINTENANCE_MULT,
} from '../constants.ts';
import { tickIndustries } from './Industry.ts';
import { tickVehicleMovement } from './Vehicle.ts';
import { tickObjectives } from './Objectives.ts';
import { tickRoutes } from './RouteExecution.ts';
import { recordTransaction } from './Economy.ts';
import { getMaintenanceMult } from './TechTree.ts';

export function getTickDuration(speed: SimSpeed): number {
  switch (speed) {
    case SimSpeed.Paused: return 0;
    case SimSpeed.Normal: return TICK_DURATION_NORMAL;
    case SimSpeed.Fast:   return TICK_DURATION_FAST;
    case SimSpeed.Dev:    return TICK_DURATION_DEVMODE;
  }
}

/** Calculate the total maintenance bill for the current state */
export function calcMaintenanceBill(state: GameState): number {
  const mult = DIFFICULTY_MAINTENANCE_MULT[state.difficulty] ?? 1.0;
  let cost = 0;

  // Infrastructure: use cached tile counts (updated by ToolActions on build/demolish)
  cost += (state.roadTileCount ?? 0) * ROAD_MAINTENANCE_PER_TILE;
  cost += (state.railTileCount ?? 0) * RAIL_MAINTENANCE_PER_TILE;

  // Buildings
  for (const b of state.buildings) {
    switch (b.type) {
      case BuildingType.Station:   cost += STATION_MAINTENANCE; break;
      case BuildingType.Depot:     cost += DEPOT_MAINTENANCE; break;
      case BuildingType.TrainYard: cost += TRAIN_YARD_MAINTENANCE; break;
      case BuildingType.Airport: {
        const a = b as { tier: 'small' | 'large' };
        cost += a.tier === 'large' ? AIRPORT_LARGE_MAINTENANCE : AIRPORT_SMALL_MAINTENANCE;
        break;
      }
      case BuildingType.Seaport: {
        const s = b as { tier: 'small' | 'large' };
        cost += s.tier === 'large' ? SEAPORT_LARGE_MAINTENANCE : SEAPORT_SMALL_MAINTENANCE;
        break;
      }
    }
  }

  // Vehicles
  for (const v of state.vehicles) {
    switch (v.model) {
      case VehicleModel.BasicTruck:   cost += TRUCK_MAINTENANCE; break;
      case VehicleModel.CargoTruck:   cost += Math.round(TRUCK_MAINTENANCE * CARGO_TRUCK_MAINTENANCE_MULT); break;
      case VehicleModel.HeavyHauler:  cost += Math.round(TRUCK_MAINTENANCE * HEAVY_HAULER_MAINTENANCE_MULT); break;
      case VehicleModel.FreightTrain: cost += LOCO_MAINTENANCE; break;
      case VehicleModel.ExpressTrain: cost += Math.round(LOCO_MAINTENANCE * EXPRESS_TRAIN_MAINTENANCE_MULT); break;
      case VehicleModel.LightAircraft:cost += PLANE_MAINTENANCE; break;
      case VehicleModel.CargoPlane:   cost += Math.round(PLANE_MAINTENANCE * CARGO_PLANE_MAINTENANCE_MULT); break;
      case VehicleModel.JumboJet:     cost += Math.round(PLANE_MAINTENANCE * JUMBO_JET_MAINTENANCE_MULT); break;
      case VehicleModel.RiverBarge:   cost += SHIP_MAINTENANCE; break;
      case VehicleModel.CargoShip:    cost += Math.round(SHIP_MAINTENANCE * CARGO_SHIP_MAINTENANCE_MULT); break;
      case VehicleModel.Supertanker:  cost += Math.round(SHIP_MAINTENANCE * SUPERTANKER_MAINTENANCE_MULT); break;
    }
  }

  return Math.round(cost * mult);
}

/** Run one simulation tick — advances the world by one discrete step */
export function simulationTick(state: GameState): string[] {
  tickIndustries(state.industries, state.time.tick);

  // Move vehicles first, then execute route logic on the updated positions
  for (const vehicle of state.vehicles) {
    tickVehicleMovement(vehicle);
  }
  tickRoutes(state);

  let newlyCompleted: string[] = [];

  // Maintenance billing every MAINTENANCE_INTERVAL ticks
  if (state.time.tick > 0 && state.time.tick % MAINTENANCE_INTERVAL === 0) {
    const bill = Math.round(calcMaintenanceBill(state) * getMaintenanceMult(state));
    if (bill > 0) {
      state.economy.money = Math.max(0, state.economy.money - bill);
      state.economy.totalMaintenancePaid += bill;
      state.economy.lastMaintenanceBill = bill;
      recordTransaction(state.economy, state.time.tick, -bill, '🔧 Maintenance');
      newlyCompleted.push(`__maintenance:${bill}`);
    }
  }

  // Check objectives every 5 ticks to reduce overhead
  if (state.time.tick % 5 === 0) {
    newlyCompleted = [...newlyCompleted, ...tickObjectives(state)];
  }

  state.time.tick++;
  return newlyCompleted;
}
