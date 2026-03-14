import type { Vec2, GameState, UIState } from '../core/types.ts';
import { ToolType, TileType } from '../core/types.ts';
import { TILE_SIZE, COLORS, STATION_LINK_RANGE } from '../constants.ts';
import { getTile } from '../core/World.ts';
import { canPlaceToolAt } from '../core/Placement.ts';
import { getVehicleRenderPosition } from '../core/Vehicle.ts';
import { axisLine } from '../input/InputHandler.ts';

/** Footprint sizes (w, h) for multi-tile buildings */
const TOOL_FOOTPRINT: Partial<Record<ToolType, [number, number]>> = {
  [ToolType.PlaceDepot]:         [2, 1],
  [ToolType.PlaceTrainYard]:     [2, 2],
  [ToolType.PlaceAirport]:       [2, 2],
  [ToolType.PlaceAirportLarge]:  [3, 3],
  [ToolType.PlaceSeaport]:       [2, 2],
  [ToolType.PlaceSeaportLarge]:  [3, 3],
};

export function drawHover(ctx: CanvasRenderingContext2D, state: GameState, uiState: UIState): void {
  const tile = uiState.hoveredTile;
  if (!tile) return;

  const tool = uiState.activeTool;
  let color: string = COLORS.hover;

  const [fw, fh] = TOOL_FOOTPRINT[tool] ?? [1, 1];

  if (tool === ToolType.BuildRoad || tool === ToolType.PlaceStation || tool === ToolType.PlaceDepot ||
      tool === ToolType.PlaceTrainYard || tool === ToolType.PlaceAirport ||
      tool === ToolType.PlaceAirportLarge || tool === ToolType.PlaceSeaport ||
      tool === ToolType.PlaceSeaportLarge) {
    const canBuild = canPlaceToolAt(state, tool, tile.x, tile.y);
    color = canBuild ? 'rgba(0, 255, 0, 0.25)' : 'rgba(255, 0, 0, 0.25)';
  } else if (tool === ToolType.BuildBridge) {
    const tileType = getTile(state.map, tile.x, tile.y);
    color = tileType === TileType.Water ? 'rgba(0, 180, 255, 0.35)' : 'rgba(255, 0, 0, 0.25)';
  } else if (tool === ToolType.BuildTunnel) {
    const tileType = getTile(state.map, tile.x, tile.y);
    color = tileType === TileType.Mountain ? 'rgba(255, 200, 50, 0.35)' : 'rgba(255, 0, 0, 0.25)';
  } else if (tool === ToolType.Demolish) {
    const tileType = getTile(state.map, tile.x, tile.y);
    const hasBuilding = state.buildings.some((b) => b.position.x === tile.x && b.position.y === tile.y);
    const canDemolish = tileType === TileType.Road || hasBuilding;
    color = canDemolish ? 'rgba(255, 100, 0, 0.3)' : COLORS.hover;
  }

  ctx.fillStyle = color;
  ctx.fillRect(tile.x * TILE_SIZE, tile.y * TILE_SIZE, fw * TILE_SIZE, fh * TILE_SIZE);

  // Line-drag preview (BuildRoad / LayRail) — axis-locked, no diagonals
  if ((tool === ToolType.BuildRoad || tool === ToolType.LayRail) && uiState.lineDragStart) {
    const line = axisLine(uiState.lineDragStart, tile);
    ctx.fillStyle = 'rgba(100, 230, 100, 0.38)';
    for (const t of line) {
      ctx.fillRect(t.x * TILE_SIZE, t.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
    // Mark start tile distinctly
    ctx.fillStyle = 'rgba(60, 200, 60, 0.55)';
    ctx.fillRect(uiState.lineDragStart.x * TILE_SIZE, uiState.lineDragStart.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }
}

export function drawSelection(ctx: CanvasRenderingContext2D, tile: Vec2 | null): void {
  if (!tile) return;
  ctx.strokeStyle = COLORS.selection;
  ctx.lineWidth = 2;
  ctx.strokeRect(
    tile.x * TILE_SIZE + 1,
    tile.y * TILE_SIZE + 1,
    TILE_SIZE - 2,
    TILE_SIZE - 2,
  );
}

/** Draw dashed link-range box when hovering PlaceStation or PlaceDepot,
 *  and show the building footprint for all multi-tile buildings. */
export function drawPlacementPreview(ctx: CanvasRenderingContext2D, uiState: UIState): void {
  const tile = uiState.hoveredTile;
  if (!tile) return;
  const tool = uiState.activeTool;

  // Link-range overlay for station/depot
  if (tool === ToolType.PlaceStation || tool === ToolType.PlaceDepot) {
    const r = STATION_LINK_RANGE;
    const px = (tile.x - r) * TILE_SIZE;
    const py = (tile.y - r) * TILE_SIZE;
    const size = (r * 2 + 1) * TILE_SIZE;

    ctx.save();
    ctx.strokeStyle = 'rgba(80, 200, 255, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(px, py, size, size);
    ctx.fillStyle = 'rgba(80, 200, 255, 0.05)';
    ctx.fillRect(px, py, size, size);
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Footprint outline for all building tools (including multi-tile)
  const [fw, fh] = TOOL_FOOTPRINT[tool] ?? [0, 0];
  if (fw > 1 || fh > 1) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 220, 80, 0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(tile.x * TILE_SIZE, tile.y * TILE_SIZE, fw * TILE_SIZE, fh * TILE_SIZE);
    ctx.setLineDash([]);
    ctx.restore();
  }
}

/** Draw vehicle route overlays — all assigned vehicles get a route overlay.
 *  Selected vehicle: bright yellow thick line. Others: dim thin lines. */
export function drawRouteOverlay(ctx: CanvasRenderingContext2D, state: GameState, uiState: UIState): void {
  const selectedVehicleId = uiState.selectedEntityType === 'vehicle' ? uiState.selectedEntityId : null;

  // Draw non-selected vehicle routes first (dim)
  for (const vehicle of state.vehicles) {
    if (!vehicle.routeId) continue;
    if (vehicle.id === selectedVehicleId) continue;  // drawn last
    const route = state.routes.find((r) => r.id === vehicle.routeId);
    if (!route || route.orders.length < 2) continue;
    _drawRouteLoop(ctx, state, route.orders, 'rgba(255, 210, 50, 0.35)', 1, [6, 5]);
  }

  // Draw selected vehicle's route (bright)
  if (selectedVehicleId !== null) {
    const vehicle = state.vehicles.find((v) => v.id === selectedVehicleId);
    if (vehicle?.routeId) {
      const route = state.routes.find((r) => r.id === vehicle.routeId);
      if (route && route.orders.length >= 2) {
        _drawRouteLoop(ctx, state, route.orders, 'rgba(255, 220, 50, 0.9)', 2.5, [8, 5]);
      }
    }

    // Draw current movement path (cyan dashes) for selected vehicle only
    if (vehicle && vehicle.path.length > vehicle.pathIndex) {
      const vp = getVehicleRenderPosition(vehicle);
      ctx.save();
      ctx.strokeStyle = 'rgba(80, 200, 255, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(vp.x * TILE_SIZE + TILE_SIZE / 2, vp.y * TILE_SIZE + TILE_SIZE / 2);
      for (let i = vehicle.pathIndex; i < vehicle.path.length; i++) {
        const p = vehicle.path[i];
        ctx.lineTo(p.x * TILE_SIZE + TILE_SIZE / 2, p.y * TILE_SIZE + TILE_SIZE / 2);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
}

function _drawRouteLoop(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  orders: GameState['routes'][number]['orders'],
  strokeColor: string,
  lineWidth: number,
  dash: number[],
): void {
  const entries: { pos: Vec2; action: 'load' | 'unload' }[] = [];
  for (const order of orders) {
    const bld = state.buildings.find((b) => b.id === order.stationId);
    if (bld) entries.push({ pos: bld.position, action: order.action });
  }
  if (entries.length < 2) return;

  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.beginPath();
  const first = entries[0].pos;
  ctx.moveTo(first.x * TILE_SIZE + TILE_SIZE / 2, first.y * TILE_SIZE + TILE_SIZE / 2);
  for (let i = 1; i < entries.length; i++) {
    const p = entries[i].pos;
    ctx.lineTo(p.x * TILE_SIZE + TILE_SIZE / 2, p.y * TILE_SIZE + TILE_SIZE / 2);
  }
  ctx.lineTo(first.x * TILE_SIZE + TILE_SIZE / 2, first.y * TILE_SIZE + TILE_SIZE / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Station markers with load/unload symbol
  entries.forEach(({ pos, action }) => {
    const cx = pos.x * TILE_SIZE + TILE_SIZE / 2;
    const cy = pos.y * TILE_SIZE + TILE_SIZE / 2;
    ctx.fillStyle = action === 'load' ? '#88ff88' : '#ff9944';
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = '9px monospace';
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(action === 'load' ? '↑' : '↓', cx, cy);
  });
  ctx.restore();
}
