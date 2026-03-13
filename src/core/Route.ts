import type { Route, RouteOrder } from './types.ts';

export function createRoute(id: number, orders: RouteOrder[], name = ''): Route {
  return { id, name, orders };
}
