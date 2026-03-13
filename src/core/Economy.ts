import type { Economy } from './types.ts';
import { STARTING_MONEY } from '../constants.ts';

export function createEconomy(): Economy {
  return { money: STARTING_MONEY, totalEarned: 0, deliveriesCompleted: 0, cargoDelivered: {} };
}

export function canAfford(economy: Economy, cost: number): boolean {
  return economy.money >= cost;
}

export function spend(economy: Economy, amount: number): boolean {
  if (economy.money < amount) return false;
  economy.money -= amount;
  return true;
}

export function earn(economy: Economy, amount: number): void {
  economy.money += amount;
  economy.totalEarned += amount;
}
