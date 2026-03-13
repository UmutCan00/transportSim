import type { GameState, UIState } from '../core/types.ts';
import type { Camera } from './Camera.ts';
import { drawMap } from './MapRenderer.ts';
import { drawIndustries, drawBuildings } from './BuildingRenderer.ts';
import { drawVehicles } from './VehicleRenderer.ts';
import { drawHover, drawSelection, drawPlacementPreview, drawRouteOverlay } from './OverlayRenderer.ts';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2d context');
    this.ctx = ctx;
  }

  draw(state: GameState, uiState: UIState, camera: Camera): void {
    const ctx = this.ctx;

    // Reset transform and clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply camera
    camera.applyTransform(ctx);

    // Draw layers in order
    drawMap(ctx, state.map, camera);
    drawIndustries(ctx, state.industries);
    drawBuildings(ctx, state.buildings);
    drawVehicles(ctx, state.vehicles);

    // Overlays (drawn on top of everything)
    drawRouteOverlay(ctx, state, uiState);
    drawPlacementPreview(ctx, uiState);
    drawHover(ctx, state, uiState);
    drawSelection(ctx, uiState.selectedTile);
  }
}
