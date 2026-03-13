import type { Vehicle, Vec2 } from './types.ts';
import { VehicleState, VehicleType } from './types.ts';
import { TRUCK_SPEED, TRUCK_CAPACITY, LOCOMOTIVE_SPEED, LOCOMOTIVE_CAPACITY,
  PLANE_SPEED, PLANE_CAPACITY, SHIP_SPEED, SHIP_CAPACITY } from '../constants.ts';

export function createVehicle(id: number, position: Vec2): Vehicle {
  return {
    id,
    vehicleType: VehicleType.Truck,
    position: { ...position },
    path: [],
    pathIndex: 0,
    moveProgress: 0,
    speed: TRUCK_SPEED,
    cargoCapacity: TRUCK_CAPACITY,
    cargo: null,
    cargoAmount: 0,
    routeId: null,
    currentOrderIndex: 0,
    state: VehicleState.Idle,
  };
}

export function createLocomotive(id: number, position: Vec2): Vehicle {
  return {
    id,
    vehicleType: VehicleType.Locomotive,
    position: { ...position },
    path: [],
    pathIndex: 0,
    moveProgress: 0,
    speed: LOCOMOTIVE_SPEED,
    cargoCapacity: LOCOMOTIVE_CAPACITY,
    cargo: null,
    cargoAmount: 0,
    routeId: null,
    currentOrderIndex: 0,
    state: VehicleState.Idle,
  };
}

export function createPlane(id: number, position: Vec2): Vehicle {
  return {
    id,
    vehicleType: VehicleType.Plane,
    position: { ...position },
    path: [],
    pathIndex: 0,
    moveProgress: 0,
    speed: PLANE_SPEED,
    cargoCapacity: PLANE_CAPACITY,
    cargo: null,
    cargoAmount: 0,
    routeId: null,
    currentOrderIndex: 0,
    state: VehicleState.Idle,
  };
}

export function createShip(id: number, position: Vec2): Vehicle {
  return {
    id,
    vehicleType: VehicleType.Ship,
    position: { ...position },
    path: [],
    pathIndex: 0,
    moveProgress: 0,
    speed: SHIP_SPEED,
    cargoCapacity: SHIP_CAPACITY,
    cargo: null,
    cargoAmount: 0,
    routeId: null,
    currentOrderIndex: 0,
    state: VehicleState.Idle,
  };
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
