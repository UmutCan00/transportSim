import type { GameState, Vehicle, Station } from './types.ts';
import { VehicleState, VehicleType } from './types.ts';
import { findPath, findFlightPath, findWaterPath } from './Pathfinding.ts';
import { deliverCargoToIndustry, takeCargoFromIndustry } from './Industry.ts';
import { isTransitHub } from './Building.ts';
import { earn, recordTransaction } from './Economy.ts';
import { DELIVERY_REWARDS, TRUCK_CAPACITY, TRUCK_SPEED,
  LOCOMOTIVE_SPEED, LOCOMOTIVE_CAPACITY,
  PLANE_SPEED, PLANE_CAPACITY, SHIP_SPEED, SHIP_CAPACITY,
  STATION_CARGO_CAPACITY } from '../constants.ts';
import {
  getTruckSpeedMult,
  getTruckCapacityMult,
  getStationCapacityMult,
  getDeliveryRewardMult,
  getCargoDeliveryBonus,
  isAutoLoaderActive,
} from './TechTree.ts';

/**
 * One tick: pull cargo into station buffers, then advance all vehicle route states.
 * Must be called AFTER tickVehicleMovement so Moving→Idle transitions are already resolved.
 */
export function tickRoutes(state: GameState): void {
  tickStationSupply(state);
  for (const vehicle of state.vehicles) {
    advanceVehicleRoute(vehicle, state);
  }
}

/** Pull available cargo from each linked producer industry into station buffer */
function tickStationSupply(state: GameState): void {
  const capMult = getStationCapacityMult(state);
  for (const building of state.buildings) {
    if (!isTransitHub(building)) continue;
    const station = building as Station; // Airport/Seaport share the same shape
    if (station.linkedIndustryId === null) continue;
    const industry = state.industries.find((i) => i.id === station.linkedIndustryId);
    if (!industry || industry.produces === null) continue;
    // Keep cargo type in sync with what the industry actually outputs
    if (station.cargo.type !== industry.produces) {
      station.cargo.type = industry.produces;
      station.cargo.amount = 0;
    }
    station.cargo.capacity = STATION_CARGO_CAPACITY * capMult;
    const space = station.cargo.capacity - station.cargo.amount;
    if (space > 0 && industry.stock.amount > 0) {
      takeCargoFromIndustry(industry, station.cargo, space);
    }
  }
}

/**
 * Advance one vehicle's route state machine.
 * States: Idle → (pathfind) → Moving → (arrive) → Idle → (execute) → Loading/Unloading → Idle → …
 */
function advanceVehicleRoute(vehicle: Vehicle, state: GameState): void {
  if (vehicle.routeId === null) return;
  const route = state.routes.find((r) => r.id === vehicle.routeId);
  if (!route || route.orders.length < 2) return;

  // Loading/Unloading: spend one tick for manual labour, then return to Idle
  if (vehicle.state === VehicleState.Loading || vehicle.state === VehicleState.Unloading) {
    vehicle.state = VehicleState.Idle;
    return;
  }

  if (vehicle.state !== VehicleState.Idle) return;

  const orderIdx = vehicle.currentOrderIndex % route.orders.length;
  const order = route.orders[orderIdx];
  const targetBuilding = state.buildings.find((b) => b.id === order.stationId);
  if (!targetBuilding || !isTransitHub(targetBuilding)) return;
  const target = targetBuilding as Station; // Airports/Seaports share the same cargo shape

  // Already at the target station — execute the action
  if (vehicle.position.x === target.position.x && vehicle.position.y === target.position.y) {
    if (executeStationAction(vehicle, order.action, target, state)) {
      vehicle.currentOrderIndex = (vehicle.currentOrderIndex + 1) % route.orders.length;
    }
    // If action failed (e.g. station empty), stay idle and retry next tick
    return;
  }

  // Pathfind toward the station and start moving
  let path;
  if (vehicle.vehicleType === VehicleType.Plane) {
    path = findFlightPath(vehicle.position, target.position);
  } else if (vehicle.vehicleType === VehicleType.Ship) {
    path = findWaterPath(state.map, vehicle.position, target.position);
  } else {
    path = findPath(state.map, vehicle.position, target.position);
  }
  if (!path || path.length === 0) return; // not connected — wait

  vehicle.path = path;
  vehicle.pathIndex = 0;
  vehicle.moveProgress = 0;
  // Speed: trucks/locos scale with tech multiplier; planes/ships use fixed speed
  const baseSpeed = vehicle.vehicleType === VehicleType.Locomotive ? LOCOMOTIVE_SPEED
    : vehicle.vehicleType === VehicleType.Plane      ? PLANE_SPEED
    : vehicle.vehicleType === VehicleType.Ship       ? SHIP_SPEED
    : TRUCK_SPEED;
  const roadVehicle = vehicle.vehicleType === VehicleType.Truck || vehicle.vehicleType === VehicleType.Locomotive;
  vehicle.speed = baseSpeed * (roadVehicle ? getTruckSpeedMult(state) : 1);
  vehicle.state = VehicleState.Moving;
}

function executeStationAction(
  vehicle: Vehicle,
  action: 'load' | 'unload',
  station: Station,
  state: GameState,
): boolean {
  const autoLoader = isAutoLoaderActive(state);

  if (action === 'load') {
    if (station.cargo.amount <= 0) return false; // Wait for cargo to accumulate
    // Capacity differs by vehicle type
    const baseCapacity = vehicle.vehicleType === VehicleType.Locomotive ? LOCOMOTIVE_CAPACITY
      : vehicle.vehicleType === VehicleType.Plane ? PLANE_CAPACITY
      : vehicle.vehicleType === VehicleType.Ship  ? SHIP_CAPACITY
      : TRUCK_CAPACITY;
    const roadVehicle = vehicle.vehicleType === VehicleType.Truck || vehicle.vehicleType === VehicleType.Locomotive;
    const vehicleCapacity = Math.floor(baseCapacity * (roadVehicle ? getTruckCapacityMult(state) : 1));
    const space = vehicleCapacity - vehicle.cargoAmount;
    if (space <= 0) return false;
    const take = Math.min(station.cargo.amount, space);
    station.cargo.amount -= take;
    vehicle.cargo = station.cargo.type;
    vehicle.cargoAmount += take;
    if (!autoLoader) vehicle.state = VehicleState.Loading;
    return true;
  }

  // action === 'unload'
  if (vehicle.cargoAmount <= 0) {
    vehicle.cargo = null;
    return true; // Nothing to drop off → advance order so route doesn't stall
  }

  const cargoType = vehicle.cargo!;
  const amount = vehicle.cargoAmount;
  vehicle.cargoAmount = 0;
  vehicle.cargo = null;

  let actualDelivered = 0;
  if (station.linkedIndustryId !== null) {
    const industry = state.industries.find((i) => i.id === station.linkedIndustryId);
    if (industry !== undefined && industry.consumes === cargoType && !industry.locked) {
      actualDelivered = deliverCargoToIndustry(industry, amount);
    }
    // If industry doesn't consume this type, or is locked, cargo is lost
  }
  // If no linked industry, cargo is lost too

  if (actualDelivered > 0) {
    const baseReward = DELIVERY_REWARDS[cargoType] ?? 200;
    const reward = Math.floor(baseReward * (actualDelivered / 20) * getDeliveryRewardMult(state) * getCargoDeliveryBonus(state, cargoType));
    earn(state.economy, reward);
    recordTransaction(state.economy, state.time.tick, reward, `📦 ${cargoType} × ${actualDelivered}`);
    state.economy.deliveriesCompleted++;
    state.economy.cargoDelivered[cargoType] =
      (state.economy.cargoDelivered[cargoType] ?? 0) + actualDelivered;
  }

  if (!autoLoader) vehicle.state = VehicleState.Unloading;
  return true;
}
