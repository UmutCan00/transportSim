import type { Objective, GameState } from './types.ts';
import { CargoType } from './types.ts';

export function createObjectives(): Objective[] {
  return [
    {
      id: 'first_delivery',
      title: 'First Delivery',
      description: 'Complete your first cargo delivery.',
      reward: 5_000,
      completed: false,
      type: 'deliver_cargo',
      target: 1,
    },
    {
      id: 'road_builder',
      title: 'Road Builder',
      description: 'Build 50 road tiles.',
      reward: 8_000,
      completed: false,
      type: 'build_roads',
      target: 50,
    },
    {
      id: 'coal_hauler',
      title: 'Coal Hauler',
      description: 'Deliver 100 units of coal.',
      reward: 20_000,
      completed: false,
      type: 'deliver_cargo',
      target: 100,
      cargo: CargoType.Coal,
    },
    {
      id: 'small_fleet',
      title: 'Small Fleet',
      description: 'Buy 3 trucks.',
      reward: 15_000,
      completed: false,
      type: 'buy_vehicles',
      target: 3,
    },
    {
      id: 'tech_pioneer',
      title: 'Tech Pioneer',
      description: 'Unlock your first technology.',
      reward: 10_000,
      completed: false,
      type: 'unlock_tech',
      target: 1,
    },
    {
      id: 'diversify',
      title: 'Diversify',
      description: 'Deliver 3 different cargo types.',
      reward: 30_000,
      completed: false,
      type: 'deliver_cargo',
      target: 3,
    },
    {
      id: 'hundred_k',
      title: 'Hundred-K Club',
      description: 'Earn $100,000 in total revenue.',
      reward: 25_000,
      completed: false,
      type: 'earn_money',
      target: 100_000,
    },
    {
      id: 'wood_runner',
      title: 'Wood Runner',
      description: 'Deliver 80 units of wood.',
      reward: 18_000,
      completed: false,
      type: 'deliver_cargo',
      target: 80,
      cargo: CargoType.Wood,
    },
    {
      id: 'big_fleet',
      title: 'Logistics Empire',
      description: 'Build a fleet of 8 trucks.',
      reward: 50_000,
      completed: false,
      type: 'buy_vehicles',
      target: 8,
    },
    {
      id: 'half_million',
      title: 'Half-Million',
      description: 'Earn $500,000 in total revenue.',
      reward: 100_000,
      completed: false,
      type: 'earn_money',
      target: 500_000,
    },
    {
      id: 'steel_tycoon',
      title: 'Steel Tycoon',
      description: 'Deliver 200 units of steel.',
      reward: 75_000,
      completed: false,
      type: 'deliver_cargo',
      target: 200,
      cargo: CargoType.Steel,
    },
    {
      id: 'millionaire',
      title: 'Millionaire',
      description: 'Earn $1,000,000 in total revenue.',
      reward: 200_000,
      completed: false,
      type: 'earn_money',
      target: 1_000_000,
    },
    {
      id: 'rail_pioneer',
      title: 'Rail Pioneer',
      description: 'Lay 20 railway track tiles. (Requires Railway tech)',
      reward: 40_000,
      completed: false,
      type: 'lay_rail',
      target: 20,
    },
    {
      id: 'grand_fleet',
      title: 'Grand Fleet',
      description: 'Own 10 vehicles (trucks + locomotives).',
      reward: 80_000,
      completed: false,
      type: 'buy_vehicles',
      target: 10,
    },
    {
      id: 'transport_empire',
      title: 'Transport Empire',
      description: 'Earn $2,000,000 in total revenue.',
      reward: 500_000,
      completed: false,
      type: 'earn_money',
      target: 2_000_000,
    },
    {
      id: 'tech_mastery',
      title: 'Tech Mastery',
      description: 'Unlock 6 different technologies.',
      reward: 60_000,
      completed: false,
      type: 'unlock_tech',
      target: 6,
    },
    {
      id: 'iron_hauler',
      title: 'Iron Hauler',
      description: 'Deliver 100 units of iron ore.',
      reward: 30_000,
      completed: false,
      type: 'deliver_cargo',
      target: 100,
      cargo: CargoType.Iron,
    },
    {
      id: 'food_chain',
      title: 'Food Chain',
      description: 'Deliver 80 units of food.',
      reward: 25_000,
      completed: false,
      type: 'deliver_cargo',
      target: 80,
      cargo: CargoType.Food,
    },
    {
      id: 'chemical_baron',
      title: 'Chemical Baron',
      description: 'Deliver 60 units of chemicals.',
      reward: 40_000,
      completed: false,
      type: 'deliver_cargo',
      target: 60,
      cargo: CargoType.Chemicals,
    },
    {
      id: 'full_tech',
      title: 'Full Tech',
      description: 'Unlock all 12 technologies.',
      reward: 150_000,
      completed: false,
      type: 'unlock_tech',
      target: 12,
    },
    {
      id: 'tycoon',
      title: 'Tycoon',
      description: 'Earn $5,000,000 in total revenue.',
      reward: 1_000_000,
      completed: false,
      type: 'earn_money',
      target: 5_000_000,
    },
  ];
}

/**
 * Check all objectives against current state. Returns array of newly completed objective ids.
 */
export function tickObjectives(state: GameState): string[] {
  const completed: string[] = [];
  for (const obj of state.objectives) {
    if (obj.completed) continue;
    if (checkObjective(obj, state)) {
      obj.completed = true;
      state.economy.money += obj.reward;
      state.economy.totalEarned += obj.reward;
      completed.push(obj.id);
    }
  }
  return completed;
}

function checkObjective(obj: Objective, state: GameState): boolean {
  switch (obj.type) {
    case 'deliver_cargo': {
      if (obj.cargo) {
        return (state.economy.cargoDelivered[obj.cargo] ?? 0) >= obj.target;
      }
      // "diversify" = number of different cargo types with at least 1 delivery
      const uniqueCargo = Object.values(state.economy.cargoDelivered).filter((v) => (v ?? 0) > 0).length;
      return uniqueCargo >= obj.target;
    }
    case 'earn_money':
      return state.economy.totalEarned >= obj.target;
    case 'build_roads':
      return state.roadsBuilt >= obj.target;
    case 'lay_rail':
      return state.railsBuilt >= obj.target;
    case 'buy_vehicles':
      return state.vehicles.length >= obj.target;
    case 'unlock_tech':
      return state.tech.filter((t) => t.unlocked).length >= obj.target;
  }
}
