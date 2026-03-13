import type { Building, Industry } from '../core/types.ts';
import { BuildingType, IndustryType } from '../core/types.ts';
import { TILE_SIZE, COLORS } from '../constants.ts';

const INDUSTRY_COLOR: Record<IndustryType, string> = {
  [IndustryType.CoalMine]:      COLORS.coalMine,
  [IndustryType.PowerPlant]:    COLORS.powerPlant,
  [IndustryType.Forest]:        COLORS.forest,
  [IndustryType.Sawmill]:       COLORS.sawmill,
  [IndustryType.Farm]:          COLORS.farm,
  [IndustryType.Bakery]:        COLORS.bakery,
  [IndustryType.OilWell]:       COLORS.oilWell,
  [IndustryType.Refinery]:      COLORS.refinery,
  [IndustryType.SteelMill]:     COLORS.steelMill,
  [IndustryType.Factory]:       COLORS.factory,
  [IndustryType.Neighborhood]:    COLORS.neighborhood,
  [IndustryType.IronMine]:      COLORS.ironMine,
  [IndustryType.Smelter]:       COLORS.smelter,
  [IndustryType.ChemicalPlant]:   COLORS.chemPlant,
  [IndustryType.ChemDistributor]: COLORS.chemDist,
  [IndustryType.Market]:          COLORS.market,
};

const INDUSTRY_ICON: Record<IndustryType, string> = {
  [IndustryType.CoalMine]:      '⛏',
  [IndustryType.PowerPlant]:    '⚡',
  [IndustryType.Forest]:        '🌲',
  [IndustryType.Sawmill]:       '🪚',
  [IndustryType.Farm]:          '🌾',
  [IndustryType.Bakery]:        '🍞',
  [IndustryType.OilWell]:       '🛢',
  [IndustryType.Refinery]:      '⚗',
  [IndustryType.SteelMill]:     '🏭',
  [IndustryType.Factory]:       '🔧',
  [IndustryType.Neighborhood]:    '🏘',
  [IndustryType.IronMine]:      '🪨',
  [IndustryType.Smelter]:       '🔥',
  [IndustryType.ChemicalPlant]:   '🧪',
  [IndustryType.ChemDistributor]: '🧬',
  [IndustryType.Market]:          '🛒',
};

export function drawIndustries(ctx: CanvasRenderingContext2D, industries: Industry[]): void {
  for (const ind of industries) {
    const px = ind.position.x * TILE_SIZE;
    const py = ind.position.y * TILE_SIZE;
    const w  = ind.size.x * TILE_SIZE;
    const h  = ind.size.y * TILE_SIZE;

    // Body
    ctx.fillStyle = INDUSTRY_COLOR[ind.type] ?? '#888';
    ctx.fillRect(px, py, w, h);

    // Locked city overlay
    if (ind.locked) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(px, py, w, h);
    }

    // Border
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px, py, w, h);

    // Stock bar at bottom
    if (ind.stock.capacity > 0) {
      const barH = 3;
      const barW = Math.floor((ind.stock.amount / ind.stock.capacity) * (w - 2));
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(px + 1, py + h - barH - 1, w - 2, barH);
      ctx.fillStyle = ind.produces ? '#4f4' : '#f96';
      ctx.fillRect(px + 1, py + h - barH - 1, barW, barH);
    }

    // Icon
    ctx.font = `${Math.floor(TILE_SIZE * 0.6)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const icon = ind.locked ? '🔒' : (INDUSTRY_ICON[ind.type] ?? '?');
    ctx.fillText(icon, px + w / 2, py + h / 2 - 2);

    // Industry name label below the block
    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textBaseline = 'top';
    ctx.fillText(ind.name, px + w / 2, py + h + 2);

    ctx.textBaseline = 'alphabetic';
  }
}

export function drawBuildings(ctx: CanvasRenderingContext2D, buildings: Building[]): void {
  for (const b of buildings) {
    const px = b.position.x * TILE_SIZE;
    const py = b.position.y * TILE_SIZE;

    if (b.type === BuildingType.Station) {
      ctx.fillStyle = COLORS.station;
      ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);

      // Cargo bar
      if (b.cargo.capacity > 0) {
        const bw = Math.floor((b.cargo.amount / b.cargo.capacity) * (TILE_SIZE - 8));
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(px + 4, py + TILE_SIZE - 7, TILE_SIZE - 8, 3);
        ctx.fillStyle = '#4cf';
        ctx.fillRect(px + 4, py + TILE_SIZE - 7, bw, 3);
      }

      ctx.font = '10px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🏪', px + TILE_SIZE / 2, py + TILE_SIZE / 2 - 2);
      ctx.textBaseline = 'alphabetic';
    } else if (b.type === BuildingType.Airport) {
      // Airport: large indigo rectangle (2× visual footprint)
      ctx.fillStyle = COLORS.airport;
      ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      ctx.strokeStyle = 'rgba(100,160,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      ctx.font = '11px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✈', px + TILE_SIZE / 2, py + TILE_SIZE / 2 - 1);
      ctx.textBaseline = 'alphabetic';
    } else if (b.type === BuildingType.Seaport) {
      // Seaport: teal rectangle with anchor
      ctx.fillStyle = COLORS.seaport;
      ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      ctx.strokeStyle = 'rgba(0,200,200,0.8)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      ctx.font = '11px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚓', px + TILE_SIZE / 2, py + TILE_SIZE / 2 - 1);
      ctx.textBaseline = 'alphabetic';
    } else {
      ctx.fillStyle = COLORS.depot;
      ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      ctx.font = '10px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🏗', px + TILE_SIZE / 2, py + TILE_SIZE / 2 - 2);
      ctx.textBaseline = 'alphabetic';
    }
  }
}

