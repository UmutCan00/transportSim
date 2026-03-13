import type { Vec2 } from '../core/types.ts';
import { TILE_SIZE, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from '../constants.ts';

export class Camera {
  /** World position of camera center (in pixels) */
  x: number;
  y: number;
  zoom = 1;

  private canvasWidth: number;
  private canvasHeight: number;

  constructor(canvasWidth: number, canvasHeight: number, centerX: number, centerY: number) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.x = centerX;
    this.y = centerY;
  }

  resize(canvasWidth: number, canvasHeight: number): void {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
  }

  /** Pan by screen-space delta */
  pan(dx: number, dy: number): void {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  zoomBy(delta: number, screenX: number, screenY: number): void {
    const worldBefore = this.screenToWorld(screenX, screenY);
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom + delta * ZOOM_STEP));
    const worldAfter = this.screenToWorld(screenX, screenY);
    this.x += worldBefore.x - worldAfter.x;
    this.y += worldBefore.y - worldAfter.y;
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    return {
      x: (sx - this.canvasWidth / 2) / this.zoom + this.x,
      y: (sy - this.canvasHeight / 2) / this.zoom + this.y,
    };
  }

  worldToScreen(wx: number, wy: number): Vec2 {
    return {
      x: (wx - this.x) * this.zoom + this.canvasWidth / 2,
      y: (wy - this.y) * this.zoom + this.canvasHeight / 2,
    };
  }

  screenToTile(sx: number, sy: number): Vec2 {
    const world = this.screenToWorld(sx, sy);
    return {
      x: Math.floor(world.x / TILE_SIZE),
      y: Math.floor(world.y / TILE_SIZE),
    };
  }

  /** Apply camera transform to canvas context */
  applyTransform(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(
      this.zoom, 0, 0, this.zoom,
      this.canvasWidth / 2 - this.x * this.zoom,
      this.canvasHeight / 2 - this.y * this.zoom,
    );
  }

  /** Get the range of tiles visible on screen */
  getVisibleTileRange(mapWidth: number, mapHeight: number): { x0: number; y0: number; x1: number; y1: number } {
    const topLeft = this.screenToTile(0, 0);
    const bottomRight = this.screenToTile(this.canvasWidth, this.canvasHeight);
    return {
      x0: Math.max(0, topLeft.x - 1),
      y0: Math.max(0, topLeft.y - 1),
      x1: Math.min(mapWidth - 1, bottomRight.x + 1),
      y1: Math.min(mapHeight - 1, bottomRight.y + 1),
    };
  }
}
