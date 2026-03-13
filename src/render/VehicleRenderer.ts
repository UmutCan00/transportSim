import type { Vehicle } from '../core/types.ts';
import { VehicleType } from '../core/types.ts';
import { getVehicleRenderPosition } from '../core/Vehicle.ts';
import { TILE_SIZE, COLORS } from '../constants.ts';

// Cargo type → color for the fill indicator
const CARGO_COLOR: Record<string, string> = {
  coal:      '#4a4a4a',
  wood:      '#8B5E3C',
  grain:     '#d4b83a',
  steel:     '#8888cc',
  oil:       '#2a2a2a',
  goods:     '#cc8844',
  iron:      '#8B3a1a',
  chemicals: '#44cc88',
  food:      '#e8a742',
};

export function drawVehicles(ctx: CanvasRenderingContext2D, vehicles: Vehicle[]): void {
  for (const v of vehicles) {
    const pos = getVehicleRenderPosition(v);
    const px = pos.x * TILE_SIZE + TILE_SIZE / 2;
    const py = pos.y * TILE_SIZE + TILE_SIZE / 2;
    const isLoco  = v.vehicleType === VehicleType.Locomotive;
    const isPlane = v.vehicleType === VehicleType.Plane;
    const isShip  = v.vehicleType === VehicleType.Ship;

    if (isLoco) {
      // Locomotive: blue rounded rectangle (wider, shorter)
      const w = TILE_SIZE * 0.72;
      const h = TILE_SIZE * 0.42;
      ctx.fillStyle = '#2255aa';
      ctx.beginPath();
      const r = 3;
      ctx.roundRect(px - w / 2, py - h / 2, w, h, r);
      ctx.fill();
      ctx.strokeStyle = '#88aaff';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Cab on front quarter
      ctx.fillStyle = '#3a6acc';
      ctx.fillRect(px + w / 2 - w * 0.22, py - h / 2, w * 0.22, h);
    } else if (isPlane) {
      // Plane: white/silver diamond rotated 45°
      const s = TILE_SIZE * 0.38;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ddeeff';
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.strokeStyle = '#88ccff';
      ctx.lineWidth = 1;
      ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    } else if (isShip) {
      // Ship: teal rounded rectangle (slightly wider)
      const w = TILE_SIZE * 0.62;
      const h = TILE_SIZE * 0.38;
      ctx.fillStyle = v.cargoAmount > 0 ? '#0aaa88' : '#066655';
      ctx.beginPath();
      ctx.roundRect(px - w / 2, py - h / 2, w, h, 4);
      ctx.fill();
      ctx.strokeStyle = '#00ddcc';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      // Truck: orange/yellow square
      const size = TILE_SIZE * 0.46;
      ctx.fillStyle = v.cargoAmount > 0 ? '#e8b020' : COLORS.truck;
      ctx.fillRect(px - size / 2, py - size / 2, size, size);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(px - size / 2, py - size / 2, size, size);
    }

    // Cargo fill bar (bottom of vehicle)
    if (v.cargoCapacity > 0) {
      const barW = TILE_SIZE * (isLoco ? 0.68 : isShip ? 0.58 : 0.42);
      const fillW = Math.floor((v.cargoAmount / v.cargoCapacity) * barW);
      const barX = px - barW / 2;
      const barY = py + (isLoco ? TILE_SIZE * 0.24 : isShip ? TILE_SIZE * 0.22 : TILE_SIZE * 0.26);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(barX, barY, barW, 3);
      if (fillW > 0) {
        ctx.fillStyle = v.cargo ? (CARGO_COLOR[v.cargo] ?? '#8cf') : '#4cf';
        ctx.fillRect(barX, barY, fillW, 3);
      }
    }

    // Vehicle ID label
    const icon = isLoco ? '🚂' : isPlane ? '✈' : isShip ? '⛵' : '';
    ctx.font = `bold ${isLoco ? 8 : 7}px monospace`;
    ctx.fillStyle = isPlane ? '#224' : '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${icon}${v.id}`, px, py);
  }

  ctx.textBaseline = 'alphabetic';
}
