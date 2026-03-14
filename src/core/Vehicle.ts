import type { Vehicle, Vec2 } from './types.ts';
import { VehicleState, VehicleType, VehicleModel, CargoType } from './types.ts';
import {
  TRUCK_SPEED, TRUCK_CAPACITY,
  CARGO_TRUCK_SPEED, CARGO_TRUCK_CAPACITY,
  HEAVY_HAULER_SPEED, HEAVY_HAULER_CAPACITY,
  BUS_SPEED, BUS_CAPACITY,
  LOCOMOTIVE_SPEED, LOCOMOTIVE_CAPACITY,
  EXPRESS_TRAIN_SPEED, EXPRESS_TRAIN_CAPACITY,
  PLANE_SPEED, PLANE_CAPACITY,
  CARGO_PLANE_SPEED, CARGO_PLANE_CAPACITY,
  JUMBO_SPEED, JUMBO_CAPACITY,
  SHIP_SPEED, SHIP_CAPACITY,
  CARGO_SHIP_SPEED, CARGO_SHIP_CAPACITY,
  SUPERTANKER_SPEED, SUPERTANKER_CAPACITY,
} from '../constants.ts';

function makeVehicle(id: number, position: Vec2, vehicleType: VehicleType, model: VehicleModel, speed: number, capacity: number): Vehicle {
  return {
    id,
    vehicleType,
    model,
    position: { ...position },
    path: [],
    pathIndex: 0,
    moveProgress: 0,
    speed,
    cargoCapacity: capacity,
    cargo: null,
    cargoAmount: 0,
    routeId: null,
    currentOrderIndex: 0,
    state: VehicleState.Idle,
  };
}

// ── Trucks ────────────────────────────────────────────────
export function createVehicle(id: number, position: Vec2): Vehicle {
  return makeVehicle(id, position, VehicleType.Truck, VehicleModel.BasicTruck, TRUCK_SPEED, TRUCK_CAPACITY);
}
export function createCargoTruck(id: number, position: Vec2): Vehicle {
  return makeVehicle(id, position, VehicleType.Truck, VehicleModel.CargoTruck, CARGO_TRUCK_SPEED, CARGO_TRUCK_CAPACITY);
}
export function createHeavyHauler(id: number, position: Vec2): Vehicle {
  return makeVehicle(id, position, VehicleType.Truck, VehicleModel.HeavyHauler, HEAVY_HAULER_SPEED, HEAVY_HAULER_CAPACITY);
}
export function createBus(id: number, position: Vec2): Vehicle {
  return makeVehicle(id, position, VehicleType.Truck, VehicleModel.Bus, BUS_SPEED, BUS_CAPACITY);
}

// ── Locomotives ───────────────────────────────────────────
export function createLocomotive(id: number, position: Vec2): Vehicle {
  return makeVehicle(id, position, VehicleType.Locomotive, VehicleModel.FreightTrain, LOCOMOTIVE_SPEED, LOCOMOTIVE_CAPACITY);
}
export function createExpressTrain(id: number, position: Vec2): Vehicle {
  return makeVehicle(id, position, VehicleType.Locomotive, VehicleModel.ExpressTrain, EXPRESS_TRAIN_SPEED, EXPRESS_TRAIN_CAPACITY);
}

// ── Planes ────────────────────────────────────────────────
export function createPlane(id: number, position: Vec2): Vehicle {
  return makeVehicle(id, position, VehicleType.Plane, VehicleModel.LightAircraft, PLANE_SPEED, PLANE_CAPACITY);
}
export function createCargoPLane(id: number, position: Vec2): Vehicle {
  return makeVehicle(id, position, VehicleType.Plane, VehicleModel.CargoPlane, CARGO_PLANE_SPEED, CARGO_PLANE_CAPACITY);
}
export function createJumboJet(id: number, position: Vec2): Vehicle {
  return makeVehicle(id, position, VehicleType.Plane, VehicleModel.JumboJet, JUMBO_SPEED, JUMBO_CAPACITY);
}

// ── Ships ─────────────────────────────────────────────────
export function createShip(id: number, position: Vec2): Vehicle {
  return makeVehicle(id, position, VehicleType.Ship, VehicleModel.RiverBarge, SHIP_SPEED, SHIP_CAPACITY);
}
export function createCargoShip(id: number, position: Vec2): Vehicle {
  return makeVehicle(id, position, VehicleType.Ship, VehicleModel.CargoShip, CARGO_SHIP_SPEED, CARGO_SHIP_CAPACITY);
}
export function createSupertanker(id: number, position: Vec2): Vehicle {
  return makeVehicle(id, position, VehicleType.Ship, VehicleModel.Supertanker, SUPERTANKER_SPEED, SUPERTANKER_CAPACITY);
}

/** Advance vehicle movement along its path by one tick */
export function tickVehicleMovement(vehicle: Vehicle): void {
  if (vehicle.state !== VehicleState.Moving) return;
  if (vehicle.path.length === 0 || vehicle.pathIndex >= vehicle.path.length - 1) {
    vehicle.state = VehicleState.Idle;
    return;
  }

  vehicle.moveProgress += vehicle.speed;

  while (vehicle.moveProgress >= 1 && vehicle.pathIndex < vehicle.path.length - 1) {
    vehicle.moveProgress -= 1;
    vehicle.pathIndex++;
    const target = vehicle.path[vehicle.pathIndex];
    vehicle.position = { x: target.x, y: target.y };
  }

  // Arrived at destination
  if (vehicle.pathIndex >= vehicle.path.length - 1) {
    vehicle.moveProgress = 0;
    vehicle.state = VehicleState.Idle;
  }
}

/** Get the interpolated position for smooth rendering */
export function getVehicleRenderPosition(vehicle: Vehicle): Vec2 {
  if (vehicle.state !== VehicleState.Moving || vehicle.pathIndex >= vehicle.path.length - 1) {
    return vehicle.position;
  }
  const current = vehicle.path[vehicle.pathIndex];
  const next = vehicle.path[vehicle.pathIndex + 1];
  const t = vehicle.moveProgress;
  return {
    x: current.x + (next.x - current.x) * t,
    y: current.y + (next.y - current.y) * t,
  };
}

export function canVehicleCarryCargo(vehicle: Vehicle, cargoType: CargoType): boolean {
  if (vehicle.model === VehicleModel.Bus) return cargoType === CargoType.Passengers;
  if (cargoType === CargoType.Passengers) {
    return vehicle.vehicleType === VehicleType.Locomotive ||
      vehicle.vehicleType === VehicleType.Plane ||
      vehicle.vehicleType === VehicleType.Ship;
  }
  return true;
}
