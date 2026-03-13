import type { UIState } from '../core/types.ts';
import { ToolType } from '../core/types.ts';
import type { Camera } from '../render/Camera.ts';

type ActionHandler = (tileX: number, tileY: number) => void;

/** Tools that support click-and-drag painting */
const DRAG_TOOLS = new Set<ToolType>([ToolType.BuildRoad, ToolType.Demolish]);

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
      if (e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey)) {
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
        this.onTileClick(tile.x, tile.y);

        // Start drag for drag-capable tools
        if (DRAG_TOOLS.has(this.uiState.activeTool)) {
          this.isDragging = true;
          this.lastDragTileX = tile.x;
          this.lastDragTileY = tile.y;
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
      this.isPanning = false;
      this.isDragging = false;
    });

    c.addEventListener('contextmenu', (e) => {
      e.preventDefault(); // suppress browser right-click menu; panning handled in mousedown/move
    });
  }
}
