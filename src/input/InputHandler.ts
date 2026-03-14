import type { UIState, Vec2 } from '../core/types.ts';
import { ToolType } from '../core/types.ts';
import type { Camera } from '../render/Camera.ts';

type ActionHandler = (tileX: number, tileY: number) => void;

/** Axis-locked line — horizontal if |dx|>=|dy|, else vertical. */
export function axisLine(a: Vec2, b: Vec2): Vec2[] {
  const pts: Vec2[] = [];
  const adx = Math.abs(b.x - a.x), ady = Math.abs(b.y - a.y);
  if (adx >= ady) {
    // Horizontal segment along a.y
    const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
    for (let x = minX; x <= maxX; x++) pts.push({ x, y: a.y });
  } else {
    // Vertical segment along a.x
    const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
    for (let y = minY; y <= maxY; y++) pts.push({ x: a.x, y });
  }
  return pts;
}

/** Tools that support click-and-drag painting */
const DRAG_TOOLS = new Set<ToolType>([ToolType.Demolish]);
/** Tools that use line-draw (mousedown records start, mouseup places the line) */
const LINE_TOOLS = new Set<ToolType>([ToolType.BuildRoad, ToolType.LayRail]);
/** Pixels of mouse movement required before left-drag switches to pan */
const PAN_THRESHOLD = 6;

export class InputHandler {
  private canvas: HTMLCanvasElement;
  private camera: Camera;
  private uiState: UIState;
  private isPanning = false;
  private isDragging = false;
  private lastDragTileX = -1;
  private lastDragTileY = -1;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private onTileClick: ActionHandler = () => {};

  // Pending left-click (fired on mouseup if no drag threshold exceeded)
  private pendingClick: Vec2 | null = null;
  private pendingStartX = 0;
  private pendingStartY = 0;

  constructor(canvas: HTMLCanvasElement, camera: Camera, uiState: UIState) {
    this.canvas = canvas;
    this.camera = camera;
    this.uiState = uiState;
    this.bind();
  }

  setClickHandler(handler: ActionHandler): void {
    this.onTileClick = handler;
  }

  /** Call this whenever Game replaces its uiState object (new game / load save). */
  setUIState(uiState: UIState): void {
    this.uiState = uiState;
  }

  private bind(): void {
    const c = this.canvas;

    c.addEventListener('mousedown', (e) => {
      // Middle / right button — always pan immediately
      if (e.button === 1 || e.button === 2) {
        this.isPanning = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        e.preventDefault();
        return;
      }

      if (e.button === 0) {
        const rect = c.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const tile = this.camera.screenToTile(sx, sy);
        this.uiState.selectedTile = tile;

        if (LINE_TOOLS.has(this.uiState.activeTool)) {
          // Record start — placement happens on mouseup
          this.uiState.lineDragStart = { x: tile.x, y: tile.y };
        } else if (DRAG_TOOLS.has(this.uiState.activeTool)) {
          // Paint immediately and keep painting on drag
          this.onTileClick(tile.x, tile.y);
          this.isDragging = true;
          this.lastDragTileX = tile.x;
          this.lastDragTileY = tile.y;
        } else {
          // Defer click until mouseup — if mouse moves ≥ threshold first, pan instead
          this.pendingClick = tile;
          this.pendingStartX = e.clientX;
          this.pendingStartY = e.clientY;
          this.lastMouseX = e.clientX;
          this.lastMouseY = e.clientY;
        }
      }
    });

    c.addEventListener('mousemove', (e) => {
      const rect = c.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      this.uiState.hoveredTile = this.camera.screenToTile(sx, sy);

      if (this.isPanning) {
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        this.camera.pan(dx, dy);
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        return;
      }

      // Check if pending click has exceeded pan threshold → switch to pan
      if (this.pendingClick) {
        const ddx = e.clientX - this.pendingStartX;
        const ddy = e.clientY - this.pendingStartY;
        if (Math.sqrt(ddx * ddx + ddy * ddy) >= PAN_THRESHOLD) {
          this.pendingClick = null;
          this.isPanning = true;
          this.lastMouseX = e.clientX;
          this.lastMouseY = e.clientY;
        }
        return;
      }

      // Drag-paint
      if (this.isDragging && this.uiState.hoveredTile) {
        const tx = this.uiState.hoveredTile.x;
        const ty = this.uiState.hoveredTile.y;
        if (tx !== this.lastDragTileX || ty !== this.lastDragTileY) {
          this.onTileClick(tx, ty);
          this.lastDragTileX = tx;
          this.lastDragTileY = ty;
        }
      }
    });

    c.addEventListener('mouseup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        return;
      }
      // Finalise pending click (mouse didn't move enough to pan)
      if (this.pendingClick) {
        this.onTileClick(this.pendingClick.x, this.pendingClick.y);
        this.pendingClick = null;
      }
      // Finalise line drag — place all tiles along the axis-locked line
      if (this.uiState.lineDragStart && LINE_TOOLS.has(this.uiState.activeTool)) {
        const end = this.uiState.hoveredTile ?? this.uiState.lineDragStart;
        for (const pt of axisLine(this.uiState.lineDragStart, end)) {
          this.onTileClick(pt.x, pt.y);
        }
        this.uiState.lineDragStart = null;
      }
      this.isDragging = false;
    });

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? -1 : 1;
      this.camera.zoomBy(delta, sx, sy);
    }, { passive: false });

    c.addEventListener('mouseleave', () => {
      this.uiState.hoveredTile = null;
      this.uiState.lineDragStart = null;
      this.isPanning = false;
      this.isDragging = false;
      this.pendingClick = null;
    });

    c.addEventListener('contextmenu', (e) => {
      e.preventDefault(); // suppress browser right-click menu; panning handled in mousedown/move
    });
  }
}
