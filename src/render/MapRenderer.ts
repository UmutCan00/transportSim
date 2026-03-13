import type { TileMap } from '../core/types.ts';
import { TileType } from '../core/types.ts';
import type { Camera } from './Camera.ts';
import { TILE_SIZE, COLORS } from '../constants.ts';

export function drawMap(ctx: CanvasRenderingContext2D, map: TileMap, camera: Camera): void {
  const range = camera.getVisibleTileRange(map.width, map.height);

  for (let y = range.y0; y <= range.y1; y++) {
    for (let x = range.x0; x <= range.x1; x++) {
      const tile = map.tiles[y * map.width + x];
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;

      switch (tile) {
        case TileType.Water:
          ctx.fillStyle = ((x + y) & 1) ? COLORS.water : COLORS.waterDeep;
          break;
        case TileType.Sand:
          ctx.fillStyle = COLORS.sand;
          break;
        case TileType.Road:
          ctx.fillStyle = COLORS.road;
          break;
        case TileType.Mountain: {
          // Base rocky colour
          ctx.fillStyle = ((x + y) & 1) ? COLORS.mountain : COLORS.mountainDark;
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          // Snow cap on top quarter
          ctx.fillStyle = COLORS.mountainSnow;
          ctx.fillRect(px + TILE_SIZE * 0.2, py, TILE_SIZE * 0.6, TILE_SIZE * 0.35);
          // Grid
          ctx.strokeStyle = COLORS.grid;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
          continue;
        }
        case TileType.Rail: {
          // Pale ballast base
          ctx.fillStyle = COLORS.rail;
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          // Draw two rail lines
          ctx.strokeStyle = '#d0c8b8';
          ctx.lineWidth = 2;
          const margin = TILE_SIZE * 0.22;
          ctx.beginPath();
          ctx.moveTo(px + margin, py + 1);
          ctx.lineTo(px + margin, py + TILE_SIZE - 1);
          ctx.moveTo(px + TILE_SIZE - margin, py + 1);
          ctx.lineTo(px + TILE_SIZE - margin, py + TILE_SIZE - 1);
          ctx.stroke();
          // Cross-ties every half tile
          ctx.strokeStyle = COLORS.railTie;
          ctx.lineWidth = 3;
          for (let t = 0.2; t < 1; t += 0.4) {
            ctx.beginPath();
            ctx.moveTo(px + margin - 2, py + TILE_SIZE * t);
            ctx.lineTo(px + TILE_SIZE - margin + 2, py + TILE_SIZE * t);
            ctx.stroke();
          }
          ctx.strokeStyle = COLORS.grid;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
          continue;
        }
        default:
          ctx.fillStyle = ((x + y) & 1) ? COLORS.grass : COLORS.grassDark;
          break;
      }
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

      // Grid lines
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
    }
  }
}
