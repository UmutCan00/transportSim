import type { GameState, Vehicle, Station } from './types.ts';
import { BuildingType, VehicleState, VehicleType, CargoType } from './types.ts';
import { findPath, findFlightPath, findWaterPath } from './Pathfinding.ts';
import { deliverCargoToIndustry, takeCargoFromIndustry } from './Industry.ts';
import { isTransitHub } from './Building.ts';
import { earn, recordTransaction } from './Economy.ts';
import { canVehicleCarryCargo, getVehicleBaseCapacity, getVehicleBaseSpeed } from './Vehicle.ts';
import { DELIVERY_REWARDS,
  STATION_CARGO_CAPACITY } from '../constants.ts';
import {
  getTruckSpeedMult,
  getTruckCapacityMult,
  getLocomotiveSpeedMult,
  getLocomotiveCapacityMult,
  getPlaneSpeedMult,
  getPlaneCapacityMult,
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
  tickStationDemand(state);
  tickHubTransfer(state);
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
    const laneCapacity = Math.floor((STATION_CARGO_CAPACITY * capMult) / 2);
    station.cargo.capacity = Math.max(station.cargo.capacity, laneCapacity);
    station.incomingCargo.capacity = Math.max(station.incomingCargo.capacity, laneCapacity);
    if (station.linkedIndustryId === null) continue;
    const industry = state.industries.find((i) => i.id === station.linkedIndustryId);
    if (!industry || industry.produces === null) continue;
    if (station.cargo.amount > 0 && station.cargo.type !== industry.produces) continue;
    station.cargo.type = industry.produces;
    const space = station.cargo.capacity - station.cargo.amount;
    if (space > 0 && industry.stock.amount > 0) {
      takeCargoFromIndustry(industry, station.cargo, space);
    }
  }
}

/** Push buffered cargo from a transit hub into its linked consumer industry. */
function tickStationDemand(state: GameState): void {
  for (const building of state.buildings) {
    if (!isTransitHub(building)) continue;
    if (building.type !== BuildingType.Station) continue;
    const station = building as Station;
    if (station.linkedIndustryId === null || station.incomingCargo.amount <= 0) continue;
    const industry = state.industries.find((i) => i.id === station.linkedIndustryId);
    if (!industry || industry.consumes !== station.incomingCargo.type || industry.locked) continue;
    const moved = deliverCargoToIndustry(industry, station.incomingCargo.amount);
    if (moved <= 0) continue;
    station.incomingCargo.amount -= moved;
    if (station.incomingCargo.amount <= 0) {
      station.incomingCargo.amount = 0;
    }
    awardDelivery(state, station.incomingCargo.type, moved);
  }
}

function tickHubTransfer(state: GameState): void {
  for (const building of state.buildings) {
    if (!isTransitHub(building)) continue;
    const station = building as Station;
    if (station.incomingCargo.amount <= 0) continue;

    const linkedIndustry = station.linkedIndustryId != null
      ? state.industries.find((i) => i.id === station.linkedIndustryId)
      : null;
    const consumedLocally = linkedIndustry &&
      !linkedIndustry.locked &&
      linkedIndustry.consumes === station.incomingCargo.type &&
      building.type === BuildingType.Station;
    if (consumedLocally) continue;

    if (station.cargo.amount > 0 && station.cargo.type !== station.incomingCargo.type) continue;
    const moved = Math.min(station.incomingCargo.amount, station.cargo.capacity - station.cargo.amount);
    if (moved <= 0) continue;
    station.cargo.type = station.incomingCargo.type;
    station.cargo.amount += moved;
    station.incomingCargo.amount -= moved;
    if (station.incomingCargo.amount <= 0) station.incomingCargo.amount = 0;
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
  if (vehicle.vehicleType === VehicleType.Plane && targetBuilding.type !== BuildingType.Airport) return;
  if (vehicle.vehicleType === VehicleType.Ship && targetBuilding.type !== BuildingType.Seaport) return;
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
  // Speed scales by vehicle class so late-game tech branches actually matter in play.
  const baseSpeed = getVehicleBaseSpeed(vehicle.model);
  const speedMult = vehicle.vehicleType === VehicleType.Locomotive ? getLocomotiveSpeedMult(state)
    : vehicle.vehicleType === VehicleType.Plane ? getPlaneSpeedMult(state)
    : vehicle.vehicleType === VehicleType.Truck ? getTruckSpeedMult(state)
    : 1;
  vehicle.speed = baseSpeed * speedMult;
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
    if (!canVehicleCarryCargo(vehicle, station.cargo.type)) return false;
    // Capacity differs by vehicle type
    const baseCapacity = getVehicleBaseCapacity(vehicle.model);
    const capacityMult = vehicle.vehicleType === VehicleType.Locomotive ? getLocomotiveCapacityMult(state)
      : vehicle.vehicleType === VehicleType.Plane ? getPlaneCapacityMult(state)
      : vehicle.vehicleType === VehicleType.Truck ? getTruckCapacityMult(state)
      : 1;
    const vehicleCapacity = Math.floor(baseCapacity * capacityMult);
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
  if (!canVehicleCarryCargo(vehicle, cargoType)) return false;
  if (station.incomingCargo.amount > 0 && station.incomingCargo.type !== cargoType) return false;
  const space = station.incomingCargo.capacity - station.incomingCargo.amount;
  if (space <= 0) return false;
  const moved = Math.min(space, vehicle.cargoAmount);
  if (moved <= 0) return false;
  station.incomingCargo.type = cargoType;
  station.incomingCargo.amount += moved;
  vehicle.cargoAmount -= moved;
  if (vehicle.cargoAmount <= 0) {
    vehicle.cargoAmount = 0;
    vehicle.cargo = null;
  }

  if (!autoLoader) vehicle.state = VehicleState.Unloading;
  return true;
}

function awardDelivery(state: GameState, cargoType: CargoType, amount: number): void {
  const baseReward = DELIVERY_REWARDS[cargoType] ?? 200;
  const reward = Math.floor(baseReward * (amount / 20) * getDeliveryRewardMult(state) * getCargoDeliveryBonus(state, cargoType));
  if (reward <= 0) return;
  earn(state.economy, reward);
  recordTransaction(state.economy, state.time.tick, reward, `📦 ${cargoType} × ${amount}`);
  state.economy.deliveriesCompleted++;
  state.economy.cargoDelivered[cargoType] = (state.economy.cargoDelivered[cargoType] ?? 0) + amount;
}
