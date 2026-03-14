import type { GameState, UIState, Building, Industry, Vehicle, Objective, MapSize } from '../core/types.ts';
import { SimSpeed, ToolType, BuildingType, TileType, VehicleType, VehicleModel } from '../core/types.ts';
import { getTile } from '../core/World.ts';
import { industryLabel } from '../core/Industry.ts';
import {
  isExclusivelyBlocked, getTruckCostMult, isRailwayUnlocked,
  isBridgingUnlocked, isTunnelingUnlocked, isAviationUnlocked, isMaritimeUnlocked,
  isAdvancedAviationUnlocked, isDeepSeaUnlocked,
} from '../core/TechTree.ts';
import {
  TRUCK_COST, LOCOMOTIVE_COST, PLANE_COST, SHIP_COST, BUS_COST,
  CARGO_TRUCK_COST, HEAVY_HAULER_COST, EXPRESS_TRAIN_COST,
  CARGO_PLANE_COST, JUMBO_JET_COST, CARGO_SHIP_COST, SUPERTANKER_COST,
  MAINTENANCE_INTERVAL,
  ROAD_COST, RAIL_COST, BRIDGE_COST, TUNNEL_COST,
  STATION_COST, DEPOT_COST, TRAIN_YARD_COST,
  AIRPORT_SMALL_COST, SEAPORT_SMALL_COST,
  ROAD_MAINTENANCE_PER_TILE, RAIL_MAINTENANCE_PER_TILE,
  STATION_MAINTENANCE, DEPOT_MAINTENANCE, TRAIN_YARD_MAINTENANCE,
  AIRPORT_SMALL_MAINTENANCE, SEAPORT_SMALL_MAINTENANCE,
} from '../constants.ts';
import { createVehicle, createLocomotive, createPlane, createShip, createCargoTruck, createHeavyHauler, createExpressTrain, createCargoPLane, createJumboJet, createCargoShip, createSupertanker, createBus } from '../core/Vehicle.ts';
import { generateId } from '../core/GameState.ts';
import type { NewGameOptions } from '../core/GameState.ts';
import { canAfford, spend } from '../core/Economy.ts';
import { createRoute } from '../core/Route.ts';
import { saveToSlot, loadFromSlot, getSlotMeta, clearSlot } from '../core/Save.ts';
import type { SaveSlot } from '../core/Save.ts';
import { calcMaintenanceBill } from '../core/GameLoop.ts';
import type { Camera } from '../render/Camera.ts';

type ToolDef = {
  type: ToolType; label: string; icon: string; shortcut: string;
  requiresRailway?: true; requiresBridging?: true; requiresTunneling?: true;
  requiresAviation?: true; requiresMaritime?: true;
  requiresAdvAviation?: true; requiresDeepSea?: true;
};

const TOOLS: ToolDef[] = [
  { type: ToolType.Select,           label: 'Select',       icon: '🔍', shortcut: '1' },
  { type: ToolType.BuildRoad,        label: 'Road',         icon: '🛤️', shortcut: '2' },
  { type: ToolType.PlaceStation,     label: 'Station',      icon: '🏪', shortcut: '3' },
  { type: ToolType.PlaceDepot,       label: 'Truck Depot',  icon: '🏗️', shortcut: '4' },
  { type: ToolType.Demolish,         label: 'Demolish',     icon: '💥', shortcut: '5' },
  { type: ToolType.LayRail,          label: 'Rail',         icon: '🚂', shortcut: '6', requiresRailway: true },
  { type: ToolType.PlaceTrainYard,   label: 'Train Yard',   icon: '🏭', shortcut: '',  requiresRailway: true },
  { type: ToolType.BuildBridge,      label: 'Bridge',       icon: '🌉', shortcut: '7', requiresBridging: true },
  { type: ToolType.BuildTunnel,      label: 'Tunnel',       icon: '⛏️', shortcut: '8', requiresTunneling: true },
  { type: ToolType.PlaceAirport,     label: 'Airport S',    icon: '✈',  shortcut: '9', requiresAviation: true },
  { type: ToolType.PlaceAirportLarge,label: 'Airport L',    icon: '🛫', shortcut: '',  requiresAdvAviation: true },
  { type: ToolType.PlaceSeaport,     label: 'Seaport S',    icon: '⚓',  shortcut: '0', requiresMaritime: true },
  { type: ToolType.PlaceSeaportLarge,label: 'Seaport L',    icon: '🛳️', shortcut: '',  requiresDeepSea: true },
];

function fmtHudCost(cost: number): string {
  return cost >= 1000 ? `$${(cost / 1000).toFixed(cost >= 10_000 ? 0 : 1)}k` : `$${cost}`;
}

function getToolHudText(tool: ToolType, state: GameState): string {
  switch (tool) {
    case ToolType.Select:
      return 'Select: inspect buildings, industries, and vehicles to see links, cargo, and routes.';
    case ToolType.BuildRoad:
      return `${fmtHudCost(ROAD_COST)}/tile: Road links stations, depots, airports, and seaports for trucks and buses. Upkeep ${fmtHudCost(ROAD_MAINTENANCE_PER_TILE)}/cycle.`;
    case ToolType.PlaceStation:
      return `${fmtHudCost(STATION_COST)}: Station is the main land hub. It gathers nearby industry output and city demand, then hands cargo or passengers to trucks and trains. Upkeep ${fmtHudCost(STATION_MAINTENANCE)}/cycle.`;
    case ToolType.PlaceDepot:
      return `${fmtHudCost(DEPOT_COST)}: Truck depot buys cargo trucks and city buses for road routes, local pickup, and airport or seaport feeder lines. Upkeep ${fmtHudCost(DEPOT_MAINTENANCE)}/cycle.`;
    case ToolType.Demolish:
      return 'Demolish: remove roads, rails, and buildings for a partial refund.';
    case ToolType.LayRail:
      return `${fmtHudCost(RAIL_COST)}/tile: Rail creates fast long-distance corridors for freight trains and passenger trains. Upkeep ${fmtHudCost(RAIL_MAINTENANCE_PER_TILE)}/cycle.`;
    case ToolType.PlaceTrainYard:
      return `${fmtHudCost(TRAIN_YARD_COST)}: Train yard buys locomotives and express trains for heavy cargo or intercity passenger routes. Upkeep ${fmtHudCost(TRAIN_YARD_MAINTENANCE)}/cycle.`;
    case ToolType.BuildBridge:
      return `${fmtHudCost(BRIDGE_COST)}/tile: Bridge extends roads across water. Requires Bridging tech.`;
    case ToolType.BuildTunnel:
      return `${fmtHudCost(TUNNEL_COST)}/tile: Tunnel cuts roads through mountains so blocked valleys and ridges connect. Requires Tunneling tech.`;
    case ToolType.PlaceAirport:
      return `${fmtHudCost(AIRPORT_SMALL_COST)}: Small airport is an air transfer hub. Buses or trains bring passengers in, planes move them long distance, and nearby roads still matter for feeders. Upkeep ${fmtHudCost(AIRPORT_SMALL_MAINTENANCE)}/cycle.`;
    case ToolType.PlaceAirportLarge:
      return `Advanced Aviation: Large airport is a higher-capacity air hub with more storage and plane slots for busy long-range passenger and cargo routes.`;
    case ToolType.PlaceSeaport:
      return `${fmtHudCost(SEAPORT_SMALL_COST)}: Small seaport is a coastal transfer hub for ships, with bus or train feeders from the city. Must touch water. Upkeep ${fmtHudCost(SEAPORT_SMALL_MAINTENANCE)}/cycle.`;
    case ToolType.PlaceSeaportLarge:
      return `Deep Sea: Large seaport is a higher-capacity maritime hub with more ship slots and storage. Must touch water.`;
    default:
      return `Cash ${fmtHudCost(state.economy.money)}. T tech, O goals, M finance, ? help.`;
  }
}

function canVehicleUseHub(vehicleType: VehicleType, building: Building): boolean {
  if (vehicleType === VehicleType.Plane) return building.type === BuildingType.Airport;
  if (vehicleType === VehicleType.Ship) return building.type === BuildingType.Seaport;
  return building.type === BuildingType.Station ||
    building.type === BuildingType.Airport ||
    building.type === BuildingType.Seaport;
}

export class UIManager {
  private container: HTMLElement;
  private moneyEl!: HTMLElement;
  private tickEl!: HTMLElement;
  private speedEl!: HTMLElement;
  private seedEl!: HTMLElement;
  private toolInfoEl!: HTMLElement;
  private infoEl!: HTMLElement;
  private panelEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private hudTopEl!: HTMLElement;
  private hudSubbarEl!: HTMLElement;
  private toolbarEl!: HTMLElement;
  private toolButtons: Map<ToolType, HTMLElement> = new Map();
  private onSpeedChange: (speed: SimSpeed) => void;
  private onToolChange: ((tool: ToolType) => void) | null = null;
  private onNewGame: ((opts: NewGameOptions) => void) | null = null;
  private onUnlockTech: ((id: string) => void) | null = null;
  private onLoadSave: ((state: GameState) => void) | null = null;

  private _uiState: UIState | null = null;
  private _lastTechHash = '';
  private _lastRenderedPanel = 'none';
  private _panelDirty = false;
  private _lastInfoHash = '';
  private _appliedTheme = '';
  private _prevSpeed: SimSpeed = SimSpeed.Normal;
  private _currentSpeed: SimSpeed = SimSpeed.Normal;
  private _minimapCollapsed = false;
  private _minimapCanvas: HTMLCanvasElement | null = null;
  private _toolInfoExpanded = false;
  private _toolInfoInteractive = false;
  private _lastToolInfoText = '';

  // ── Theme definitions ──────────────────────────────────────────────
  private static readonly THEMES: Record<string, {
    bg: string; panel: string; panelBorder: string; text: string; textMuted: string;
    accent: string; accentBorder: string; positive: string; warning: string; danger: string;
    hudBg: string; btnBg: string; btnBorder: string; activeBg: string; activeBorder: string;
    cardBg: string; cardBorder: string; inputBg: string;
  }> = {
    dark: {
      bg: '#0a0a0a', panel: 'rgba(0,0,0,0.92)', panelBorder: '#30363d',
      text: '#c9d1d9', textMuted: '#6a737d',
      accent: '#4af', accentBorder: '#4488cc',
      positive: '#4f4', warning: '#fc0', danger: '#f66',
      hudBg: 'rgba(0,0,0,0.85)', btnBg: '#333', btnBorder: '#555',
      activeBg: '#0066cc', activeBorder: '#3399ff',
      cardBg: '#1a1a1a', cardBorder: '#333', inputBg: '#111',
    },
    classic: {
      bg: '#d4c9b0', panel: 'rgba(230,220,195,0.97)', panelBorder: '#8a6a40',
      text: '#2a1a0a', textMuted: '#7a5a38',
      accent: '#8b2000', accentBorder: '#c44020',
      positive: '#1a7a1a', warning: '#b06000', danger: '#a01010',
      hudBg: 'rgba(180,160,120,0.95)', btnBg: '#c8a870', btnBorder: '#8a6a40',
      activeBg: '#7a3010', activeBorder: '#c44020',
      cardBg: 'rgba(210,190,155,0.9)', cardBorder: '#8a6a40', inputBg: 'rgba(200,175,130,0.95)',
    },
    neon: {
      bg: '#050510', panel: 'rgba(5,5,25,0.97)', panelBorder: '#00ffff44',
      text: '#00ffff', textMuted: '#007799',
      accent: '#ff00ff', accentBorder: '#ff00ff88',
      positive: '#00ff88', warning: '#ffff00', danger: '#ff3355',
      hudBg: 'rgba(0,0,20,0.92)', btnBg: '#0a0a20', btnBorder: '#00ffff44',
      activeBg: '#200040', activeBorder: '#ff00ff',
      cardBg: '#080820', cardBorder: '#00ffff33', inputBg: '#050515',
    },
    anime: {
      bg: '#fff0f6', panel: 'rgba(255,232,244,0.98)', panelBorder: '#ffb0d0',
      text: '#4a0030', textMuted: '#884060',
      accent: '#cc2060', accentBorder: '#ff5080',
      positive: '#106030', warning: '#8a4000', danger: '#cc1040',
      hudBg: 'rgba(255,220,240,0.95)', btnBg: '#ffd0e8', btnBorder: '#ffb0d0',
      activeBg: '#cc2060', activeBorder: '#ff5080',
      cardBg: 'rgba(255,220,240,0.85)', cardBorder: '#ffb0d0', inputBg: 'rgba(255,235,248,0.95)',
    },
    retro: {
      bg: '#1a0f00', panel: 'rgba(30,15,0,0.97)', panelBorder: '#804000',
      text: '#ffcc66', textMuted: '#996600',
      accent: '#ff9900', accentBorder: '#ffcc00',
      positive: '#88cc00', warning: '#ff9900', danger: '#ff3300',
      hudBg: 'rgba(20,10,0,0.92)', btnBg: '#2d1a00', btnBorder: '#804000',
      activeBg: '#5a2800', activeBorder: '#ff9900',
      cardBg: '#1e1000', cardBorder: '#804000', inputBg: '#150c00',
    },
  };

  /** Inject/update a <style> tag with CSS variables derived from the current theme */
  applyTheme(theme: string): void {
    if (theme === this._appliedTheme) return;
    this._appliedTheme = theme;
    const t = UIManager.THEMES[theme] ?? UIManager.THEMES['dark'];
    let styleEl = document.getElementById('game-theme-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'game-theme-style';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      :root {
        --ui-bg: ${t.bg};
        --ui-panel: ${t.panel};
        --ui-panel-border: ${t.panelBorder};
        --ui-text: ${t.text};
        --ui-text-muted: ${t.textMuted};
        --ui-accent: ${t.accent};
        --ui-accent-border: ${t.accentBorder};
        --ui-positive: ${t.positive};
        --ui-warning: ${t.warning};
        --ui-danger: ${t.danger};
        --ui-hud-bg: ${t.hudBg};
        --ui-btn-bg: ${t.btnBg};
        --ui-btn-border: ${t.btnBorder};
        --ui-active-bg: ${t.activeBg};
        --ui-active-border: ${t.activeBorder};
        --ui-card-bg: ${t.cardBg};
        --ui-card-border: ${t.cardBorder};
        --ui-input-bg: ${t.inputBg};
      }
      #hud-top { background: var(--ui-hud-bg) !important; color: var(--ui-text) !important; }
      #hud-top button { background: var(--ui-btn-bg) !important; border-color: var(--ui-btn-border) !important; color: var(--ui-text) !important; }
      #hud-top button:hover { filter: brightness(1.3); }
      #hud-money { color: var(--ui-positive) !important; cursor: pointer; }
      #hud-money:hover { text-decoration: underline; }
      #hud-earned { color: var(--ui-text-muted) !important; }
      #hud-deliveries { color: var(--ui-accent) !important; }
      #hud-tick { color: var(--ui-text-muted) !important; }
      #hud-seed { color: var(--ui-text-muted) !important; }
      #hud-speed { color: var(--ui-text) !important; }
      #hud-maintenance { color: var(--ui-danger) !important; }
      #toolbar { background: var(--ui-hud-bg) !important; }
      #toolbar button { background: var(--ui-btn-bg) !important; border-color: var(--ui-btn-border) !important; color: var(--ui-text) !important; }
      #toolbar button.active-tool { background: var(--ui-active-bg) !important; border-color: var(--ui-active-border) !important; }
      #side-panel { background: var(--ui-panel) !important; color: var(--ui-text) !important; border-left: 1px solid var(--ui-panel-border) !important; }
      #hud-info { background: var(--ui-panel) !important; color: var(--ui-text) !important; border: 1px solid var(--ui-panel-border) !important; }
      #side-panel input, #side-panel select { background: var(--ui-input-bg) !important; color: var(--ui-text) !important; border-color: var(--ui-btn-border) !important; }
      #side-panel .pc { background: var(--ui-card-bg) !important; border-color: var(--ui-card-border) !important; color: var(--ui-text) !important; }
      #side-panel .pc span, #side-panel .pc div { color: var(--ui-text) !important; }
    `;
  }


  constructor(container: HTMLElement, onSpeedChange: (speed: SimSpeed) => void) {
    this.container = container;
    this.onSpeedChange = onSpeedChange;
    this.buildDOM();
    this.bindKeyboard();
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <div id="hud-top" style="
        position:absolute;top:0;left:0;right:0;
        display:flex;justify-content:space-between;align-items:center;gap:12px;
        padding:6px 12px;background:rgba(0,0,0,0.85);
        color:#fff;font-family:monospace;font-size:13px;
        pointer-events:auto;user-select:none;z-index:20;
      ">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;min-width:0;">
          <span id="hud-money" style="color:#4f4;font-weight:bold;">$0</span>
          <span id="hud-earned" style="color:var(--ui-text-muted,#aaa);font-size:11px;">earned: $0</span>
          <span id="hud-deliveries" style="color:#8cf;font-size:11px;">📦 0</span>
          <span id="hud-maintenance" style="color:#f66;font-size:11px;" title="Next maintenance bill">🔧 $0/cycle</span>
          <span id="hud-tick" style="color:var(--ui-text-muted,#aaa);">Tick: 0</span>
          <span id="hud-seed" style="color:#555;">Seed: 0</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:nowrap;justify-content:flex-end;flex-shrink:0;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,0.03);">
          <button id="btn-pause">⏸</button>
          <button id="btn-normal">1×</button>
          <button id="btn-fast">2×</button>
          <button id="btn-dev">20×</button>
          <span id="hud-speed" style="margin-left:8px;min-width:78px;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,0.05);text-align:center;white-space:nowrap;">▶ 1×</span>
          <button id="btn-obj"    style="margin-left:8px;">🎯 Goals</button>
          <button id="btn-tech"   style="margin-left:4px;">🔬 Tech</button>
          <button id="btn-save"   style="margin-left:4px;">💾 Save</button>
          <button id="btn-help"   style="margin-left:4px;">? Help</button>
          <button id="btn-newmap" style="margin-left:12px;">🗺️ New Game</button>
        </div>
      </div>

      <div id="hud-subbar" style="
        position:absolute;top:44px;left:0;right:0;
        padding:4px 12px;background:rgba(6,10,18,0.92);
        border-top:1px solid rgba(255,255,255,0.05);
        border-bottom:1px solid rgba(255,255,255,0.05);
        pointer-events:auto;user-select:none;z-index:19;
        box-sizing:border-box;
      ">
        <div id="hud-toolinfo" style="
          color:var(--ui-text-muted,#9ab);font-size:11px;
          padding:3px 10px;border:1px solid var(--ui-btn-border,#333);
          border-radius:10px;background:rgba(255,255,255,0.04);
          display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;
          overflow:hidden;line-height:1.25em;max-width:560px;height:24px;
          cursor:pointer;box-sizing:border-box;
        ">Tool info</div>
      </div>

      <div id="toolbar" style="
        position:absolute;top:76px;left:0;
        display:flex;flex-direction:column;gap:2px;padding:6px;
        background:rgba(0,0,0,0.85);border-radius:0 6px 6px 0;
        pointer-events:auto;user-select:none;z-index:20;
      "></div>

      <div id="side-panel" style="
        position:absolute;top:76px;right:0;
        width:290px;max-height:calc(100vh - 100px);overflow-y:auto;
        padding:10px;background:rgba(0,0,0,0.92);
        color:#ccc;font-family:monospace;font-size:12px;
        border-radius:6px 0 0 6px;
        pointer-events:auto;user-select:none;z-index:20;display:none;
      "></div>

      <div id="hud-info" style="
        position:absolute;bottom:8px;right:8px;
        min-width:210px;max-width:290px;padding:8px 12px;
        background:rgba(0,0,0,0.9);color:#ccc;
        font-family:monospace;font-size:12px;border-radius:6px;
        pointer-events:auto;user-select:none;z-index:20;display:none;
      "></div>

      <div id="toast-container" style="
        position:absolute;bottom:60px;left:50%;transform:translateX(-50%);
        display:flex;flex-direction:column;align-items:center;gap:4px;
        pointer-events:none;z-index:30;
      "></div>

      <div id="minimap-hud" style="
        position:absolute;bottom:8px;left:8px;
        pointer-events:auto;user-select:none;z-index:20;
        font-family:monospace;
      ">
        <div id="minimap-header" style="
          background:rgba(0,0,0,0.88);color:#aaa;font-size:10px;
          padding:2px 8px;display:flex;align-items:center;justify-content:space-between;
          border:1px solid #444;border-bottom:none;border-radius:4px 4px 0 0;cursor:pointer;
          gap:12px;
        ">
          <span>🗺 Map</span>
          <span id="minimap-toggle-icon">▼</span>
        </div>
        <div id="minimap-body">
          <canvas id="minimap-canvas" width="160" height="120" style="
            display:block;border:1px solid #444;border-radius:0 0 4px 4px;
          "></canvas>
        </div>
      </div>
    `;

    this.moneyEl = document.getElementById('hud-money')!;
    this.hudTopEl = document.getElementById('hud-top')!;
    this.hudSubbarEl = document.getElementById('hud-subbar')!;
    this.tickEl  = document.getElementById('hud-tick')!;
    this.speedEl = document.getElementById('hud-speed')!;
    this.seedEl  = document.getElementById('hud-seed')!;
    this.toolInfoEl = document.getElementById('hud-toolinfo')!;
    this.infoEl  = document.getElementById('hud-info')!;
    this.panelEl = document.getElementById('side-panel')!;
    this.toastEl = document.getElementById('toast-container')!;
    this.toolbarEl = document.getElementById('toolbar')!;
    this._minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement | null;

    document.getElementById('minimap-header')!.addEventListener('click', () => {
      this._minimapCollapsed = !this._minimapCollapsed;
      const body = document.getElementById('minimap-body')!;
      body.style.display = this._minimapCollapsed ? 'none' : 'block';
      const icon = document.getElementById('minimap-toggle-icon')!;
      icon.textContent = this._minimapCollapsed ? '▶' : '▼';
    });

    document.getElementById('btn-pause')!.addEventListener('click',  () => this.onSpeedChange(SimSpeed.Paused));
    document.getElementById('btn-normal')!.addEventListener('click', () => this.onSpeedChange(SimSpeed.Normal));
    document.getElementById('btn-fast')!.addEventListener('click',   () => this.onSpeedChange(SimSpeed.Fast));
    document.getElementById('btn-dev')!.addEventListener('click',    () => this.onSpeedChange(SimSpeed.Dev));
    document.getElementById('btn-newmap')!.addEventListener('click', () => this.togglePanel('newgame'));
    document.getElementById('btn-tech')!.addEventListener('click',   () => this.togglePanel('tech'));
    document.getElementById('btn-obj')!.addEventListener('click',    () => this.togglePanel('objectives'));
    document.getElementById('btn-save')!.addEventListener('click',   () => this.togglePanel('save'));
    document.getElementById('btn-help')!.addEventListener('click',   () => this.togglePanel('help'));
    // Clicking the money counter opens the finance panel
    document.getElementById('hud-money')!.addEventListener('click', () => this.togglePanel('money'));
    this.toolInfoEl.addEventListener('click', () => {
      if (!this._toolInfoInteractive) return;
      this._toolInfoExpanded = !this._toolInfoExpanded;
      this.applyToolInfoLayout();
      this.updateToolInfoInteractivity();
      this.syncHudLayout();
    });

    const toolbar = this.toolbarEl;
    for (const tool of TOOLS) {
      const btn = document.createElement('button');
      btn.style.cssText = `
        display:flex;align-items:center;gap:6px;
        padding:6px 10px;width:130px;
        font-family:monospace;font-size:12px;
        border:1px solid #555;background:#333;color:#fff;
        cursor:pointer;border-radius:3px;text-align:left;
      `;
      btn.innerHTML = `<span>${tool.icon}</span><span>${tool.label}</span><span style="color:var(--ui-text-muted,#666);margin-left:auto;">${tool.shortcut}</span>`;
      btn.addEventListener('click', () => this.onToolChange?.(tool.type));
      toolbar.appendChild(btn);
      this.toolButtons.set(tool.type, btn);
    }
    // Hide tech-locked tools initially
    const techLockedTools: ToolType[] = [
      ToolType.LayRail, ToolType.PlaceTrainYard, ToolType.BuildBridge, ToolType.BuildTunnel,
      ToolType.PlaceAirport, ToolType.PlaceAirportLarge, ToolType.PlaceSeaport, ToolType.PlaceSeaportLarge,
    ];
    for (const t of techLockedTools) {
      const btn = this.toolButtons.get(t);
      if (btn) btn.style.display = 'none';
    }

    this.syncHudLayout();
  }

  private togglePanel(which: 'tech' | 'objectives' | 'newgame' | 'help' | 'save' | 'money'): void {
    if (!this._uiState) return;
    if (this._uiState.activePanel === which) {
      this._uiState.activePanel = 'none';
      this.panelEl.style.display = 'none';
      this._lastTechHash = '';
      this._lastInfoHash = ''; // let info panel rebuild after a panel closes
    } else {
      this._uiState.activePanel = which;
      this.panelEl.style.display = 'block';
    }
  }

  private bindKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const tool = TOOLS.find((t) => t.shortcut === e.key);
      if (tool) { this.onToolChange?.(tool.type); return; }
      if (e.key === ' ') {
        e.preventDefault();
        if (this._currentSpeed === SimSpeed.Paused) {
          this.onSpeedChange(this._prevSpeed || SimSpeed.Normal);
        } else {
          this._prevSpeed = this._currentSpeed;
          this.onSpeedChange(SimSpeed.Paused);
        }
      }
      if (e.key === 't' || e.key === 'T')  this.togglePanel('tech');
      if (e.key === 'o' || e.key === 'O')  this.togglePanel('objectives');
      if (e.key === '?')                   this.togglePanel('help');
      if (e.key === 'm' || e.key === 'M')  this.togglePanel('money');
      if (e.key === 'n' || e.key === 'N')  this.togglePanel('newgame');
      if (e.key === 'Escape') {
        if (this._uiState) this._uiState.activePanel = 'none';
        this.panelEl.style.display = 'none';
      }
    });
  }

  setToolChangeHandler(h: (t: ToolType) => void):          void { this.onToolChange  = h; }
  setNewGameHandler(h: (opts: NewGameOptions) => void):     void { this.onNewGame     = h; }
  setUnlockTechHandler(h: (id: string) => void):            void { this.onUnlockTech  = h; }
  setLoadSaveHandler(h: (state: GameState) => void):        void { this.onLoadSave    = h; }
  /** @deprecated kept for back-compat; prefer setNewGameHandler */
  setNewMapHandler(h: (seed?: number) => void): void { this.onNewGame = (opts) => h(opts.seed); }

  update(state: GameState, uiState: UIState, camera?: Camera): void {
    this._uiState = uiState;

    // Apply theme whenever it changes
    this.applyTheme(state.theme ?? 'dark');

    // Track current simulation speed for space-bar toggle
    this._currentSpeed = state.time.speed;

    this.moneyEl.textContent = `$${state.economy.money.toLocaleString()}`;
    const earnedEl = document.getElementById('hud-earned');
    if (earnedEl) earnedEl.textContent = `earned: $${state.economy.totalEarned.toLocaleString()}`;
    const delivEl = document.getElementById('hud-deliveries');
    if (delivEl) delivEl.textContent = `📦 ${state.economy.deliveriesCompleted}`;
    const maintEl = document.getElementById('hud-maintenance');
    if (maintEl) {
      const nextBill = calcMaintenanceBill(state);
      const ticksLeft = MAINTENANCE_INTERVAL - (state.time.tick % MAINTENANCE_INTERVAL);
      maintEl.textContent = `🔧 $${nextBill.toLocaleString()}/cycle`;
      maintEl.title = `Maintenance bill every ${MAINTENANCE_INTERVAL} ticks · next in ${ticksLeft} ticks · last paid: $${(state.economy.lastMaintenanceBill ?? 0).toLocaleString()}`;
    }
    this.tickEl.textContent = `Tick: ${state.time.tick}`;
    this.seedEl.textContent = `Seed: ${state.seed}`;

    const speedLabels: Record<number, string> = { [SimSpeed.Paused]: '⏸', [SimSpeed.Normal]: '▶ 1×', [SimSpeed.Fast]: '▶▶ 2×', [SimSpeed.Dev]: '▶▶▶ 20×' };
    this.speedEl.textContent = speedLabels[state.time.speed] ?? '?';

    // Dev mode badge
    let devBadge = document.getElementById('hud-dev-badge');
    if (state.devMode && !devBadge) {
      devBadge = document.createElement('span');
      devBadge.id = 'hud-dev-badge';
      devBadge.textContent = '🛠 DEV MODE';
      devBadge.style.cssText = 'color:#f44;font-weight:bold;font-size:11px;margin-left:10px;padding:2px 6px;border:1px solid #f44;border-radius:3px;';
      this.speedEl.parentElement?.appendChild(devBadge);
    }

    // Show/hide tool buttons based on tech unlocks
    const toolTechMap: Array<[ToolType, boolean]> = [
      [ToolType.LayRail,           isRailwayUnlocked(state)],
      [ToolType.PlaceTrainYard,    isRailwayUnlocked(state)],
      [ToolType.BuildBridge,       isBridgingUnlocked(state)],
      [ToolType.BuildTunnel,       isTunnelingUnlocked(state)],
      [ToolType.PlaceAirport,      isAviationUnlocked(state)],
      [ToolType.PlaceAirportLarge, isAdvancedAviationUnlocked(state)],
      [ToolType.PlaceSeaport,      isMaritimeUnlocked(state)],
      [ToolType.PlaceSeaportLarge, isDeepSeaUnlocked(state)],
    ];
    for (const [tool, unlocked] of toolTechMap) {
      const btn = this.toolButtons.get(tool);
      if (btn) btn.style.display = unlocked ? 'flex' : 'none';
    }

    for (const [type, btn] of this.toolButtons) {
      const isActive = type === uiState.activeTool;
      btn.style.background  = isActive ? 'var(--ui-active-bg, #0066cc)' : 'var(--ui-btn-bg, #333)';
      btn.style.borderColor = isActive ? 'var(--ui-active-border, #3399ff)' : 'var(--ui-btn-border, #555)';
      btn.style.color = 'var(--ui-text, #fff)';
    }
    const toolInfoText = getToolHudText(uiState.activeTool, state);
    if (toolInfoText !== this._lastToolInfoText) {
      this._toolInfoExpanded = false;
      this._lastToolInfoText = toolInfoText;
    }
    this.toolInfoEl.textContent = toolInfoText;
    this.applyToolInfoLayout();
    this.updateToolInfoInteractivity();
    this.syncHudLayout();

    const completedCount = state.objectives.filter((o) => o.completed).length;
    const objBtn = document.getElementById('btn-obj');
    if (objBtn) objBtn.textContent = `🎯 Goals (${completedCount}/${state.objectives.length})`;
    const techUnlocked = state.tech.filter((t) => t.unlocked).length;
    const techBtn = document.getElementById('btn-tech');
    if (techBtn) techBtn.textContent = `🔬 Tech (${techUnlocked}/${state.tech.length})`;

    const panelChanged = uiState.activePanel !== this._lastRenderedPanel;
    if (panelChanged) {
      this._lastRenderedPanel = uiState.activePanel;
      this._panelDirty = true;
      this._lastTechHash = ''; // allow tech panel to re-render on next open
    }

    if (uiState.activePanel === 'tech') {
      this.renderTechPanel(state); // has its own hash guard
    } else if (uiState.activePanel === 'objectives') {
      if (this._panelDirty) { this.renderObjectivesPanel(state); this._panelDirty = false; }
    } else if (uiState.activePanel === 'depot') {
      if (this._panelDirty) { this.renderDepotPanel(state, uiState); this._panelDirty = false; }
    } else if (uiState.activePanel === 'newgame') {
      if (this._panelDirty) { this.renderNewGamePanel(uiState); this._panelDirty = false; }
    } else if (uiState.activePanel === 'save') {
      if (this._panelDirty) { this.renderSavePanel(state); this._panelDirty = false; }
    } else if (uiState.activePanel === 'help') {
      if (this._panelDirty) { this.renderHelpPanel(); this._panelDirty = false; }
    } else if (uiState.activePanel === 'money') {
      this.renderMoneyPanel(state); // live-updates each frame
    }

    this.updateInfoPanel(state, uiState);
    this.updateToasts(uiState);
    this.updateMinimap(state, camera);
  }

  private syncHudLayout(): void {
    if (!this.hudTopEl || !this.hudSubbarEl || !this.toolbarEl || !this.panelEl) return;
    const subbarTop = this.hudTopEl.offsetHeight;
    this.hudSubbarEl.style.top = `${subbarTop}px`;
    const top = this.hudTopEl.offsetHeight + this.hudSubbarEl.offsetHeight + 8;
    this.toolbarEl.style.top = `${top}px`;
    this.panelEl.style.top = `${top}px`;
    this.panelEl.style.maxHeight = `calc(100vh - ${top + 56}px)`;
  }

  private applyToolInfoLayout(): void {
    if (!this.toolInfoEl) return;
    if (this._toolInfoExpanded) {
      this.toolInfoEl.style.display = '-webkit-box';
      this.toolInfoEl.style.overflow = 'hidden';
      this.toolInfoEl.style.maxWidth = '560px';
      this.toolInfoEl.style.height = '42px';
      this.toolInfoEl.style.lineHeight = '1.25em';
      this.toolInfoEl.style.borderRadius = '12px';
      this.toolInfoEl.style.setProperty('-webkit-line-clamp', '2');
      this.toolInfoEl.style.setProperty('-webkit-box-orient', 'vertical');
    } else {
      this.toolInfoEl.style.display = '-webkit-box';
      this.toolInfoEl.style.overflow = 'hidden';
      this.toolInfoEl.style.maxWidth = '560px';
      this.toolInfoEl.style.height = '24px';
      this.toolInfoEl.style.lineHeight = '1.25em';
      this.toolInfoEl.style.borderRadius = '999px';
      this.toolInfoEl.style.setProperty('-webkit-line-clamp', '1');
      this.toolInfoEl.style.setProperty('-webkit-box-orient', 'vertical');
    }
  }

  private updateToolInfoInteractivity(): void {
    if (!this.toolInfoEl) return;
    const wasExpanded = this._toolInfoExpanded;
    if (wasExpanded) {
      this._toolInfoExpanded = false;
      this.applyToolInfoLayout();
    }
    const collapsesText = this.toolInfoEl.scrollHeight > this.toolInfoEl.clientHeight + 1 ||
      this.toolInfoEl.scrollWidth > this.toolInfoEl.clientWidth + 1;
    if (wasExpanded) {
      this._toolInfoExpanded = true;
      this.applyToolInfoLayout();
    }
    this._toolInfoInteractive = collapsesText;
    this.toolInfoEl.style.cursor = collapsesText ? 'pointer' : 'default';
    this.toolInfoEl.title = collapsesText
      ? (this._toolInfoExpanded ? 'Click to collapse tool help' : 'Click to expand tool help')
      : '';
  }

  private renderTechPanel(state: GameState): void {
    // Only re-render when tech count or money meaningfully changes
    const hash = `${state.tech.filter((t) => t.unlocked).length}:${Math.floor(state.economy.money / 1000)}`;
    if (hash === this._lastTechHash) return;
    this._lastTechHash = hash;

    const techById = new Map(state.tech.map((t) => [t.id, t]));
    const exclusivesFor = (group?: string): string[] => {
      if (!group) return [];
      return state.tech.filter((t) => t.exclusiveGroup === group).map((t) => t.name);
    };

    // Roomier spacing keeps connector lines visible and prevents text collisions.
    const CELL_W = 220;
    const ROW_GAP = 30;
    const CARD_WIDTH = CELL_W - 16;
    const CONTENT_WIDTH = CARD_WIDTH - 20;
    const rowLabels = ['Foundations', 'Expansion', 'Specialization', 'Strategy', 'Endgame'];
    const estimateWrappedLines = (text: string, charsPerLine: number): number => {
      if (!text) return 1;
      return text
        .split('\n')
        .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
    };
    const estimateCardHeight = (tech: typeof state.tech[number], prereqText: string, exclusiveText: string): number => {
      const titleLines = Math.max(1, Math.ceil(tech.name.length / 20));
      const descriptionLines = Math.max(2, Math.min(6, estimateWrappedLines(tech.description, 34)));
      const prereqLines = Math.max(1, Math.min(3, Math.ceil(prereqText.length / 32)));
      const exclusiveLines = exclusiveText ? Math.max(1, Math.min(2, Math.ceil(exclusiveText.length / 30))) : 0;
      return 92 + titleLines * 14 + descriptionLines * 14 + prereqLines * 12 + exclusiveLines * 12;
    };
    const maxCol = Math.max(...state.tech.map((t) => t.treeCol ?? 0));
    const maxRow = Math.max(...state.tech.map((t) => t.treeRow ?? 0));
    const gridW = (maxCol + 1) * CELL_W;
    const rowHeights = Array.from({ length: maxRow + 1 }, () => 140);
    const rowTops = Array.from({ length: maxRow + 1 }, () => 0);
    const cardLayouts = new Map<string, { left: number; top: number; height: number }>();
    const precomputedText = new Map<string, { prereqText: string; exclusiveText: string }>();

    for (const tech of state.tech) {
      const prereqNodes = tech.requires.map((r) => techById.get(r)).filter((t): t is NonNullable<typeof t> => !!t);
      const exclusiveNames = exclusivesFor(tech.exclusiveGroup).filter((name) => name !== tech.name);
      const prereqText = prereqNodes.length === 0
        ? 'Prereqs: none'
        : `Prereqs: ${prereqNodes.map((t) => t.unlocked ? `✓ ${t.name}` : t.name).join(', ')}`;
      const exclusiveText = exclusiveNames.length === 0 ? '' : `✕ Exclusive with: ${exclusiveNames.join(', ')}`;
      precomputedText.set(tech.id, { prereqText, exclusiveText });
      const estimatedHeight = estimateCardHeight(tech, prereqText, exclusiveText);
      const row = tech.treeRow ?? 0;
      rowHeights[row] = Math.max(rowHeights[row], estimatedHeight + 20);
    }

    let runningTop = 0;
    for (let row = 0; row <= maxRow; row += 1) {
      rowTops[row] = runningTop;
      runningTop += rowHeights[row] + ROW_GAP;
    }
    const gridH = runningTop - ROW_GAP;

    const rowBands = rowLabels.slice(0, maxRow + 1).map((label, idx) => `
      <div style="
        position:absolute;left:0;top:${rowTops[idx]}px;width:${gridW}px;height:${rowHeights[idx]}px;
        border-bottom:1px solid rgba(255,255,255,0.05);
        background:${idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.01)'};
        pointer-events:none;
      ">
        <div style="
          position:absolute;left:10px;top:8px;
          color:rgba(255,255,255,0.22);font-size:10px;font-weight:bold;letter-spacing:0.08em;
          text-transform:uppercase;
        ">${label}</div>
      </div>
    `).join('');

    let nodeHtml = '';
    for (const tech of state.tech) {
      const col = tech.treeCol ?? 0, row = tech.treeRow ?? 0;
      const left = col * CELL_W + 4, top = rowTops[row] + 24;
      const excl = !!tech.exclusiveGroup;
      const blocked = isExclusivelyBlocked(state, tech.id);
      const prereqNodes = tech.requires.map((r) => techById.get(r)).filter((t): t is NonNullable<typeof t> => !!t);
      const prereqs = prereqNodes.every((t) => t.unlocked);
      const affordable = canAfford(state.economy, tech.cost);
      const exclusiveNames = exclusivesFor(tech.exclusiveGroup).filter((name) => name !== tech.name);
      const textBlock = precomputedText.get(tech.id)!;
      const cardHeight = estimateCardHeight(tech, textBlock.prereqText, textBlock.exclusiveText);
      cardLayouts.set(tech.id, { left, top, height: cardHeight });

      let bg = '#1e1e1e', border = '#444', textColor = '#888';
      if (tech.unlocked) { bg = '#1a3d1a'; border = '#3f3'; textColor = '#cfc'; }
      else if (blocked) { bg = '#2a1010'; border = '#733'; textColor = '#966'; }
      else if (prereqs && affordable) { bg = '#1a2a4a'; border = '#48f'; textColor = '#adf'; }
      else if (prereqs) { bg = '#2a2010'; border = '#a63'; textColor = '#ca8'; }

      const statusHtml = tech.unlocked
        ? `<span style="color:#4f4;font-size:10px;font-weight:bold;">✓ Researched</span>`
        : blocked
        ? `<span style="color:#f77;font-size:10px;font-weight:bold;">✕ Locked by exclusive choice</span>`
        : (prereqs && affordable)
        ? `<button data-tech="${tech.id}" style="
            padding:2px 6px;font-size:10px;font-family:monospace;
            background:#003080;color:#8cf;border:1px solid #48f;
            cursor:pointer;border-radius:2px;white-space:nowrap;
          ">Unlock $${(tech.cost/1000).toFixed(0)}k</button>`
        : prereqs
        ? `<span style="color:#f3c36d;font-size:10px;">Need $${tech.cost.toLocaleString()}</span>`
        : `<span style="color:#777;font-size:10px;">🔒 Waiting on prereqs</span>`;

      const prereqHtml = prereqNodes.length === 0
        ? `<span style="color:#5a6;font-size:9px;display:block;line-height:1.35;">Prereqs: none</span>`
        : `<span style="color:#889;font-size:9px;display:block;line-height:1.35;white-space:normal;overflow-wrap:anywhere;">${textBlock.prereqText}</span>`;
      const exclusiveHtml = exclusiveNames.length === 0
        ? ''
        : `<div style="color:#f88;font-size:9px;margin-top:3px;line-height:1.35;white-space:normal;overflow-wrap:anywhere;">${textBlock.exclusiveText}</div>`;

      nodeHtml += `
        <div style="
          position:absolute;left:${left}px;top:${top}px;
          width:${CARD_WIDTH}px;min-height:${cardHeight}px;padding:10px 10px 8px;
          background:${bg};border:1px solid ${border};border-radius:4px;
          font-family:monospace;font-size:11px;color:${textColor};
          ${excl ? 'border-style:dashed;' : ''}
          box-sizing:border-box;display:flex;flex-direction:column;gap:6px;
          box-shadow:inset 0 1px 0 rgba(255,255,255,0.03);
        ">
          <div style="display:flex;align-items:flex-start;gap:6px;min-height:18px;">
            <span style="font-size:14px;margin-right:4px;">${tech.icon}</span>
            <span style="font-weight:bold;flex:1;line-height:1.2;">${tech.name}</span>
            ${excl ? `<span title="Exclusive branch" style="font-size:10px;color:#f88;font-weight:bold;">✕</span>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:9px;color:var(--ui-text-muted,#9aa);">
            <span style="padding:1px 6px;border-radius:999px;background:rgba(255,255,255,0.06);">Tier ${tech.tier}</span>
            <span style="padding:1px 6px;border-radius:999px;background:rgba(255,255,255,0.06);">$${tech.cost.toLocaleString()}</span>
          </div>
          <div style="
            font-size:9px;color:var(--ui-text-muted,#888);line-height:1.38;
            max-width:${CONTENT_WIDTH}px;white-space:normal;overflow-wrap:anywhere;
          ">${tech.description.replaceAll('\n', '<br>')}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;min-height:20px;">
            ${statusHtml}
          </div>
          <div style="margin-top:auto;padding-top:4px;border-top:1px solid rgba(255,255,255,0.06);">
            ${prereqHtml}
            ${exclusiveHtml}
          </div>
        </div>`;
    }

    // Draw SVG connector lines between parent → child
    let svgLines = `<svg style="position:absolute;top:0;left:0;width:${gridW}px;height:${gridH}px;pointer-events:none;" xmlns="http://www.w3.org/2000/svg">`;
    for (const tech of state.tech) {
      for (const reqId of tech.requires) {
        const parent = state.tech.find((t) => t.id === reqId);
        if (!parent) continue;
        const parentLayout = cardLayouts.get(parent.id);
        const childLayout = cardLayouts.get(tech.id);
        if (!parentLayout || !childLayout) continue;
        const px = parentLayout.left + CARD_WIDTH / 2;
        const py = parentLayout.top + parentLayout.height;
        const cx = childLayout.left + CARD_WIDTH / 2;
        const cy = childLayout.top;
        const color = parent.unlocked && tech.unlocked ? '#3f3' : parent.unlocked ? '#48f' : '#444';
        const midY = py + Math.max(18, (cy - py) * 0.45);
        svgLines += `<path d="M ${px} ${py} C ${px} ${midY}, ${cx} ${midY}, ${cx} ${cy}" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-dasharray="${tech.exclusiveGroup ? '5 4' : 'none'}" opacity="0.9"/>`;
        svgLines += `<circle cx="${cx}" cy="${cy}" r="2.5" fill="${color}" opacity="0.9"/>`;
      }
    }
    svgLines += `</svg>`;

    const scrollWidth = Math.min(gridW + 16, 1080);
    this.panelEl.style.width = `${scrollWidth}px`;
    this.panelEl.style.maxWidth = 'calc(100vw - 48px)';

    this.panelEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;">
        <span style="color:#fff;font-size:14px;">🔬 Research Tree</span>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:10px;color:var(--ui-text-muted,#666);">
          <span style="border:1px solid #3f3;padding:1px 4px;border-radius:2px;">■ Researched</span>
          <span style="border:1px dashed #f88;padding:1px 4px;border-radius:2px;">✕ Exclusive</span>
          <span style="border:1px solid #733;padding:1px 4px;border-radius:2px;">⛔ Blocked</span>
          <button id="btn-close-panel" style="background:none;border:none;color:var(--ui-text-muted,#888);cursor:pointer;font-size:14px;">✕</button>
        </div>
      </div>
      <div style="color:var(--ui-text-muted,#888);font-size:10px;margin-bottom:8px;line-height:1.45;">
        Curved links show prerequisite flow. Cards keep the same research rules as before, but the layout is spaced out so names, descriptions, and branch conflicts stay readable.
      </div>
      <div style="overflow-x:auto;overflow-y:auto;max-height:calc(100vh - 150px);padding:2px 2px 8px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;background:rgba(255,255,255,0.02);">
        <div style="position:relative;width:${gridW}px;height:${gridH}px;padding:0 0 4px 0;">
          ${rowBands}
          ${svgLines}
          ${nodeHtml}
        </div>
      </div>`;

    document.getElementById('btn-close-panel')?.addEventListener('click', () => {
      if (this._uiState) this._uiState.activePanel = 'none';
      this.panelEl.style.display = 'none';
      this.panelEl.style.width = '290px';
    });
    this.panelEl.querySelectorAll('button[data-tech]').forEach((btn) => {
      btn.addEventListener('click', () => this.onUnlockTech?.((btn as HTMLElement).dataset['tech']!));
    });
  }

  private renderObjectivesPanel(state: GameState): void {
    this.panelEl.style.width = '290px';
    let html = `<div style="color:#fff;font-size:14px;margin-bottom:4px;">🎯 Objectives</div>`;
    html += `<div style="color:var(--ui-text-muted,#666);font-size:11px;margin-bottom:8px;">O or click ✕ to close &nbsp;<button id="btn-close-panel" style="float:right;background:none;border:none;color:var(--ui-text-muted,#888);cursor:pointer;font-size:14px;">✕</button></div>`;

    for (const obj of state.objectives) {
      const done = obj.completed;
      const progress = getObjectiveProgress(obj, state);
      const pct = Math.min(100, Math.floor((progress / obj.target) * 100));
      html += `
        <div style="
          margin:4px 0;padding:8px;border-radius:4px;
          background:${done ? '#142a14' : '#1c1c1c'};
          border:1px solid ${done ? '#4a4' : '#333'};
        ">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="color:#fff;font-weight:bold;">${done ? '✅' : '○'} ${obj.title}</span>
            <span style="color:#fc0;font-size:11px;white-space:nowrap;">+$${(obj.reward/1000).toFixed(0)}k</span>
          </div>
          <div style="color:var(--ui-text-muted,#888);font-size:11px;margin:2px 0;">${obj.description}</div>
          <div style="background:#2a2a2a;border-radius:2px;height:5px;margin-top:4px;">
            <div style="background:${done ? '#3a3' : '#36a'};width:${pct}%;height:100%;border-radius:2px;"></div>
          </div>
          <div style="color:var(--ui-text-muted,#666);font-size:10px;margin-top:2px;">${done ? 'Complete' : `${Math.floor(progress)} / ${obj.target}`}</div>
        </div>`;
    }
    this.panelEl.innerHTML = html;

    document.getElementById('btn-close-panel')?.addEventListener('click', () => {
      if (this._uiState) this._uiState.activePanel = 'none';
      this.panelEl.style.display = 'none';
    });
  }

  private renderDepotPanel(state: GameState, uiState: UIState): void {
    if (!uiState.selectedEntityId) return;
    const depot = state.buildings.find(
      (b) => b.id === uiState.selectedEntityId &&
        (b.type === BuildingType.Depot || b.type === BuildingType.TrainYard ||
         b.type === BuildingType.Airport || b.type === BuildingType.Seaport)
    );
    if (!depot) return;
    this.panelEl.style.width = '290px';

    const isTrainYard = depot.type === BuildingType.TrainYard;
    const isAirport   = depot.type === BuildingType.Airport;
    const isSeaport   = depot.type === BuildingType.Seaport;
    const d = depot as import('../core/types.ts').Depot;
    const maxV = d.maxVehicles ?? 8;
    const depotVehicles = state.vehicles.filter((v) => {
      // vehicles "belong" to a depot if they have no route yet
      // In a fuller implementation we'd track depotId; here count all unassigned
      return !v.routeId;
    }).length;

    const costMult = getTruckCostMult(state);
    const truckCost = Math.floor(TRUCK_COST * costMult);
    const cargoTruckCost = Math.floor(CARGO_TRUCK_COST * costMult);
    const heavyHaulerCost = Math.floor(HEAVY_HAULER_COST * costMult);
    const busCost = Math.floor(BUS_COST * costMult);
    const locoCost = Math.floor(LOCOMOTIVE_COST * costMult);
    const exprTrainCost = Math.floor(EXPRESS_TRAIN_COST * costMult);

    const titleIcon = isTrainYard ? '🏭' : isAirport ? '✈' : isSeaport ? '⚓' : '🏗️';
    const titleLabel = isTrainYard ? 'Train Yard' : isAirport ? 'Airport' : isSeaport ? 'Seaport' : 'Truck Depot';

    let html = `
      <div style="color:#fff;font-size:14px;margin-bottom:4px;">${titleIcon} ${titleLabel} #${depot.id}</div>
      <div style="color:var(--ui-text-muted,#666);font-size:11px;margin-bottom:6px;">
        Pos: (${depot.position.x},${depot.position.y}) &nbsp;
        Slots: <span style="color:${depotVehicles < maxV ? '#4f4' : '#f44'}">${depotVehicles}/${maxV}</span>
        <button id="btn-close-panel" style="float:right;background:none;border:none;color:var(--ui-text-muted,#888);cursor:pointer;font-size:14px;">✕</button>
      </div>`;

    if (!isTrainYard && !isAirport && !isSeaport) {
      // Road depot — trucks
      const rows: Array<{ id: string; icon: string; label: string; cost: number; cap: number; speed: string; factory: string; note?: string }> = [
        { id: 'basic',  icon: '🚚', label: 'Basic Truck',  cost: truckCost,       cap: 20, speed: '●●○○', factory: 'basic' },
        { id: 'cargo',  icon: '🚛', label: 'Cargo Truck',  cost: cargoTruckCost,  cap: 35, speed: '●●○○', factory: 'cargo' },
        { id: 'heavy',  icon: '🚜', label: 'Heavy Hauler', cost: heavyHaulerCost, cap: 55, speed: '●○○○', factory: 'heavy' },
        { id: 'bus',    icon: '🚌', label: 'City Bus',     cost: busCost,         cap: 28, speed: '●●●○', factory: 'bus', note: 'Passengers only' },
      ];
      html += `<div style="color:var(--ui-text-muted,#aaa);font-size:11px;margin-bottom:4px;">Buy Road Vehicles:</div>`;
      for (const r of rows) {
        const ok = canAfford(state.economy, r.cost);
        html += `<button data-buy="${r.factory}" style="
          width:100%;padding:6px 8px;margin-bottom:4px;
          font-family:monospace;font-size:11px;display:flex;align-items:center;gap:6px;
          cursor:${ok ? 'pointer' : 'not-allowed'};
          background:${ok ? '#002200' : '#1a1a1a'};
          color:${ok ? '#4f4' : '#555'};
          border:1px solid ${ok ? '#3a3' : '#333'};border-radius:3px;
        ">
          <span>${r.icon}</span>
          <span style="flex:1;text-align:left;">${r.label}</span>
          <span style="color:var(--ui-text-muted,#888);font-size:10px;">📦${r.cap}</span>
          <span style="color:var(--ui-text-muted,#888);font-size:10px;">${r.speed}</span>
          <span style="color:var(--ui-text-muted,#777);font-size:10px;">${r.note ?? ''}</span>
          <span style="color:#fc0;white-space:nowrap;">$${r.cost.toLocaleString()}</span>
        </button>`;
      }
    } else if (isTrainYard) {
      // Train Yard — locomotives
      const railRows: Array<{ id: string; icon: string; label: string; cost: number; cap: number; speed: string; unlocked: boolean }> = [
        { id: 'freight', icon: '🚂', label: 'Freight Train', cost: locoCost,      cap: 60, speed: '●●●○', unlocked: true },
        { id: 'express', icon: '🚄', label: 'Express Train',  cost: exprTrainCost, cap: 40, speed: '●●●●', unlocked: true },
      ];
      html += `<div style="color:var(--ui-text-muted,#aaa);font-size:11px;margin-bottom:4px;">Buy Locomotives:</div>`;
      for (const r of railRows) {
        const ok = r.unlocked && canAfford(state.economy, r.cost);
        html += `<button data-buy="${r.id}" style="
          width:100%;padding:6px 8px;margin-bottom:4px;
          font-family:monospace;font-size:11px;display:flex;align-items:center;gap:6px;
          cursor:${ok ? 'pointer' : 'not-allowed'};
          background:${ok ? '#001a33' : '#1a1a1a'};
          color:${ok ? '#6af' : '#555'};
          border:1px solid ${ok ? '#36a' : '#333'};border-radius:3px;
        ">
          <span>${r.icon}</span>
          <span style="flex:1;text-align:left;">${r.label}</span>
          <span style="color:var(--ui-text-muted,#888);font-size:10px;">📦${r.cap}</span>
          <span style="color:var(--ui-text-muted,#888);font-size:10px;">${r.speed}</span>
          <span style="color:#fc0;white-space:nowrap;">$${r.cost.toLocaleString()}</span>
        </button>`;
      }
    } else if (isAirport) {
      // Airport — planes
      const planeRows: Array<{ id: string; icon: string; label: string; cost: number; cap: number; speed: string }> = [
        { id: 'light',   icon: '✈',  label: 'Light Aircraft', cost: PLANE_COST,       cap: 30, speed: '●●●●' },
        { id: 'cargopl', icon: '🛩', label: 'Cargo Plane',    cost: CARGO_PLANE_COST,  cap: 60, speed: '●●●○' },
        { id: 'jumbo',   icon: '🛫', label: 'Jumbo Jet',      cost: JUMBO_JET_COST,    cap: 100, speed: '●●○○' },
      ];
      html += `<div style="color:var(--ui-text-muted,#aaa);font-size:11px;margin-bottom:4px;">Buy Aircraft:</div>`;
      for (const r of planeRows) {
        const ok = canAfford(state.economy, r.cost);
        html += `<button data-buy="${r.id}" style="
          width:100%;padding:6px 8px;margin-bottom:4px;
          font-family:monospace;font-size:11px;display:flex;align-items:center;gap:6px;
          cursor:${ok ? 'pointer' : 'not-allowed'};
          background:${ok ? '#001a33' : '#1a1a1a'};
          color:${ok ? '#8cf' : '#555'};
          border:1px solid ${ok ? '#36a' : '#333'};border-radius:3px;
        ">
          <span>${r.icon}</span>
          <span style="flex:1;text-align:left;">${r.label}</span>
          <span style="color:var(--ui-text-muted,#888);font-size:10px;">📦${r.cap}</span>
          <span style="color:var(--ui-text-muted,#888);font-size:10px;">${r.speed}</span>
          <span style="color:#fc0;white-space:nowrap;">$${r.cost.toLocaleString()}</span>
        </button>`;
      }
    } else if (isSeaport) {
      // Seaport — ships
      const shipRows: Array<{ id: string; icon: string; label: string; cost: number; cap: number; speed: string }> = [
        { id: 'barge',     icon: '⛵', label: 'River Barge',  cost: SHIP_COST,         cap: 40, speed: '●●○○' },
        { id: 'cargoship', icon: '🚢', label: 'Cargo Ship',   cost: CARGO_SHIP_COST,   cap: 80, speed: '●●○○' },
        { id: 'tanker',    icon: '🛳️', label: 'Supertanker',  cost: SUPERTANKER_COST,  cap: 150, speed: '●○○○' },
      ];
      html += `<div style="color:var(--ui-text-muted,#aaa);font-size:11px;margin-bottom:4px;">Buy Ships:</div>`;
      for (const r of shipRows) {
        const ok = canAfford(state.economy, r.cost);
        html += `<button data-buy="${r.id}" style="
          width:100%;padding:6px 8px;margin-bottom:4px;
          font-family:monospace;font-size:11px;display:flex;align-items:center;gap:6px;
          cursor:${ok ? 'pointer' : 'not-allowed'};
          background:${ok ? '#001a2a' : '#1a1a1a'};
          color:${ok ? '#4dd' : '#555'};
          border:1px solid ${ok ? '#2aa' : '#333'};border-radius:3px;
        ">
          <span>${r.icon}</span>
          <span style="flex:1;text-align:left;">${r.label}</span>
          <span style="color:var(--ui-text-muted,#888);font-size:10px;">📦${r.cap}</span>
          <span style="color:var(--ui-text-muted,#888);font-size:10px;">${r.speed}</span>
          <span style="color:#fc0;white-space:nowrap;">$${r.cost.toLocaleString()}</span>
        </button>`;
      }
    }

    // Transit hubs section
    const hubs = state.buildings.filter(
      (b) => b.type === BuildingType.Station || b.type === BuildingType.Airport || b.type === BuildingType.Seaport
    );

    // Hub option with full meaningful label
    const hubOption = (b: Building): string => {
      if (b.type !== BuildingType.Station && b.type !== BuildingType.Airport && b.type !== BuildingType.Seaport) return '';
      const typeIcon = b.type === BuildingType.Airport ? '✈' : b.type === BuildingType.Seaport ? '⚓' : '🏪';
      const hasLink = (b as { linkedIndustryId: number | null }).linkedIndustryId != null;
      const linked = hasLink
        ? state.industries.find((i) => i.id === (b as { linkedIndustryId: number | null }).linkedIndustryId)
        : null;
      const label = linked
        ? `${typeIcon} ${linked.name} [${industryLabel(linked.type)}]`
        : `${typeIcon} ${(b as { name?: string }).name ?? `Hub #${b.id}`}`;
      return `<option value="${b.id}">${label} (${b.position.x},${b.position.y})</option>`;
    };

    // Vehicle fleet listing
    const allVehicles = state.vehicles;
    if (allVehicles.length > 0) {
      html += `<div style="color:#fc0;margin:8px 0 4px;font-size:11px;">Fleet (${allVehicles.length} vehicle${allVehicles.length !== 1 ? 's' : ''}):</div>`;
      for (const v of allVehicles) {
        const currentRoute = v.routeId != null ? state.routes.find((r) => r.id === v.routeId) : null;
        const compatibleHubs = hubs.filter((hub) => canVehicleUseHub(v.vehicleType, hub));
        const hubOpts = compatibleHubs.map(hubOption).join('');
        const vIcon = v.model === VehicleModel.Bus ? '🚌' : v.vehicleType === 'locomotive' ? '🚂' : v.vehicleType === 'plane' ? '✈' : v.vehicleType === 'ship' ? '⛵' : '🚛';
        const routeName = currentRoute?.name ? ` "${currentRoute.name}"` : '';
        const routeHint = v.model === VehicleModel.Bus
          ? 'Buses carry passengers only and are ideal for city-to-hub feeder routes.'
          : v.vehicleType === 'plane'
          ? 'Planes can only travel airport to airport.'
          : v.vehicleType === 'ship'
            ? 'Ships can only travel seaport to seaport.'
            : 'Road and rail vehicles can serve stations, airports, and seaports if connected.';
        html += `
          <div style="margin:4px 0;padding:6px;background:var(--ui-card-bg,#1a1a2e);border:1px solid var(--ui-card-border,#3a3a5a);border-radius:3px;">
            <div style="color:#fd0;font-weight:bold;">${vIcon} #${v.id} <span style="color:var(--ui-text-muted,#888);font-weight:normal;font-size:10px;">${v.state}</span></div>
            <div style="color:var(--ui-text-muted,#aaa);font-size:10px;">Cap: ${v.cargoAmount}/${v.cargoCapacity}</div>
            <div style="color:var(--ui-text-muted,#777);font-size:10px;">${routeHint}</div>
            ${currentRoute ? `<div style="color:#4f4;font-size:10px;">✓ Route${routeName}</div>` : ''}
            ${compatibleHubs.length >= 2 ? `
              <div style="margin-top:4px;font-size:10px;">
                <input id="rname-${v.id}" placeholder="Route name" style="font-size:10px;background:var(--ui-input-bg,#222);color:var(--ui-text,#ccc);border:1px solid var(--ui-card-border,#444);padding:2px 4px;width:100%;margin-bottom:3px;box-sizing:border-box;" value="${currentRoute?.name ?? ''}">
                <select id="sel-from-${v.id}" style="font-size:10px;background:var(--ui-input-bg,#222);color:var(--ui-text,#ccc);border:1px solid var(--ui-card-border,#444);padding:2px;width:100%;margin-bottom:2px;">${hubOpts}</select>
                <select id="sel-to-${v.id}"   style="font-size:10px;background:var(--ui-input-bg,#222);color:var(--ui-text,#ccc);border:1px solid var(--ui-card-border,#444);padding:2px;width:100%;margin-bottom:3px;">${hubOpts}</select>
                <button data-assign="${v.id}" style="width:100%;padding:3px;font-size:10px;font-family:monospace;cursor:pointer;background:#002244;color:#8cf;border:1px solid #36a;border-radius:2px;">▶ Assign Route</button>
              </div>` : `<div style="color:#555;font-size:10px;margin-top:3px;">⚠ Build 2 compatible hubs first</div>`}
          </div>`;
      }
    } else {
      html += `<div style="color:#555;font-size:11px;margin-top:6px;">No vehicles yet — buy one above.</div>`;
    }

    this.panelEl.innerHTML = html;
    this.panelEl.style.display = 'block';

    document.getElementById('btn-close-panel')?.addEventListener('click', () => {
      if (uiState) uiState.activePanel = 'none';
      this._lastInfoHash = '';
      this.panelEl.style.display = 'none';
    });

    // data-buy handler — maps factory name → creation function
    this.panelEl.querySelectorAll('button[data-buy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const factory = (btn as HTMLElement).dataset['buy'] ?? 'basic';
        const factoryMap: Record<string, (id: number, pos: import('../core/types.ts').Vec2) => import('../core/types.ts').Vehicle> = {
          basic:   (id, p) => createVehicle(id, p),
          cargo:   (id, p) => createCargoTruck(id, p),
          heavy:   (id, p) => createHeavyHauler(id, p),
          bus:     (id, p) => createBus(id, p),
          freight: (id, p) => createLocomotive(id, p),
          express: (id, p) => createExpressTrain(id, p),
          light:   (id, p) => createPlane(id, p),
          cargopl: (id, p) => createCargoPLane(id, p),
          jumbo:   (id, p) => createJumboJet(id, p),
          barge:   (id, p) => createShip(id, p),
          cargoship:(id, p) => createCargoShip(id, p),
          tanker:  (id, p) => createSupertanker(id, p),
        };
        const costMap: Record<string, number> = {
          basic: truckCost, cargo: cargoTruckCost, heavy: heavyHaulerCost, bus: busCost,
          freight: locoCost, express: exprTrainCost,
          light: PLANE_COST, cargopl: CARGO_PLANE_COST, jumbo: JUMBO_JET_COST,
          barge: SHIP_COST, cargoship: CARGO_SHIP_COST, tanker: SUPERTANKER_COST,
        };
        const cost = costMap[factory] ?? truckCost;
        if (!canAfford(state.economy, cost)) return;
        spend(state.economy, cost);
        const id = generateId(state);
        const fn = factoryMap[factory];
        if (fn) state.vehicles.push(fn(id, { x: depot.position.x, y: depot.position.y }));
        this._panelDirty = true;
        this.renderDepotPanel(state, uiState);
      });
    });

    this.panelEl.querySelectorAll('button[data-assign]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const vid = Number((btn as HTMLElement).dataset['assign']);
        const fromEl = document.getElementById(`sel-from-${vid}`) as HTMLSelectElement | null;
        const toEl   = document.getElementById(`sel-to-${vid}`)   as HTMLSelectElement | null;
        const nameEl = document.getElementById(`rname-${vid}`)    as HTMLInputElement  | null;
        if (!fromEl || !toEl) return;
        const fromId = Number(fromEl.value), toId = Number(toEl.value);
        if (fromId === toId) { alert('Pick-up and delivery stops must be different!'); return; }
        const vehicle = state.vehicles.find((v) => v.id === vid);
        if (!vehicle) return;
        const fromHub = state.buildings.find((b) => b.id === fromId);
        const toHub = state.buildings.find((b) => b.id === toId);
        if (!fromHub || !toHub || !canVehicleUseHub(vehicle.vehicleType, fromHub) || !canVehicleUseHub(vehicle.vehicleType, toHub)) {
          alert('That vehicle cannot use one of the selected hubs.');
          return;
        }
        const routeId = generateId(state);
        const route = createRoute(routeId, [
          { stationId: fromId, action: 'load' },
          { stationId: toId,   action: 'unload' },
        ], nameEl?.value.trim() ?? '');
        state.routes.push(route);
        vehicle.routeId = routeId;
        vehicle.currentOrderIndex = 0;
        (btn as HTMLElement).textContent = '✓ Assigned!';
        (btn as HTMLElement).style.background = '#003300';
        (btn as HTMLElement).style.color = '#4f4';
      });
    });
  }

  private updateMinimap(state: GameState, camera: Camera | undefined): void {
    if (this._minimapCollapsed || !this._minimapCanvas) return;
    const canvas = this._minimapCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height, tiles } = state.map;
    const cw = canvas.width, ch = canvas.height;

    // Build ImageData for fast per-pixel rendering
    const imgData = ctx.createImageData(cw, ch);
    const data = imgData.data;

    // Tile type → [r, g, b]
    const tileRgb: Record<number, [number, number, number]> = {
      [TileType.Grass]:    [90, 143, 60],
      [TileType.Water]:    [43, 108, 163],
      [TileType.Sand]:     [194, 178, 128],
      [TileType.Mountain]: [122, 106, 88],
      [TileType.Road]:     [150, 150, 150],
      [TileType.Rail]:     [180, 160, 140],
    };

    for (let py = 0; py < ch; py++) {
      for (let px = 0; px < cw; px++) {
        const tx = Math.floor(px * width / cw);
        const ty = Math.floor(py * height / ch);
        const tile = (tx < width && ty < height) ? tiles[ty * width + tx] : TileType.Grass;
        const [r, g, b] = tileRgb[tile] ?? [60, 60, 60];
        const i = (py * cw + px) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Draw building dots
    const bColors: Partial<Record<BuildingType, string>> = {
      [BuildingType.Station]:  '#4169E1',
      [BuildingType.Depot]:    '#DAA520',
      [BuildingType.TrainYard]:'#cc8800',
      [BuildingType.Airport]:  '#88aaff',
      [BuildingType.Seaport]:  '#00cccc',
    };
    const sx = cw / width, sy = ch / height;
    for (const b of state.buildings) {
      const col = bColors[b.type as BuildingType];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(
        Math.round(b.position.x * sx), Math.round(b.position.y * sy),
        Math.max(2, Math.round(sx * 2)), Math.max(2, Math.round(sy * 2)),
      );
    }

    // Draw viewport rectangle
    if (camera) {
      const vr = camera.getVisibleTileRange(width, height);
      ctx.strokeStyle = 'rgba(255, 240, 80, 0.95)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        vr.x0 * sx, vr.y0 * sy,
        (vr.x1 - vr.x0) * sx, (vr.y1 - vr.y0) * sy,
      );
    }
  }

  private updateInfoPanel(state: GameState, uiState: UIState): void {
    if (!this.infoEl) return;

    if (uiState.activePanel === 'depot') {
      this.infoEl.style.display = 'none';
      this._lastInfoHash = '';
      return;
    }

    const tile = uiState.selectedTile;
    if (!tile) {
      this.infoEl.style.display = 'none';
      this._lastInfoHash = '';
      return;
    }

    // Only rebuild the info panel when something relevant changed
    const building = state.buildings.find((b: Building) =>
      b.position.x === tile.x && b.position.y === tile.y
    );
    const infoHash = `${tile.x}:${tile.y}:${building?.id ?? ''}:${state.economy.money}:${state.vehicles.length}:${state.routes.length}`;
    if (infoHash === this._lastInfoHash) return;
    this._lastInfoHash = infoHash;

    this.infoEl.style.display = 'block';

    const tileType = getTile(state.map, tile.x, tile.y);
    const tileNames: Record<number, string> = {
      [TileType.Grass]: 'Grass', [TileType.Road]: 'Road',
      [TileType.Water]: 'Water', [TileType.Sand]: 'Sand',
      [TileType.Mountain]: '⛰ Mountain', [TileType.Rail]: '🚂 Rail',
    };
    let html = `<div style="color:#fff;margin-bottom:4px;">📍 (${tile.x}, ${tile.y}) — ${tileNames[tileType] ?? '?'}</div>`;

    const industry = state.industries.find((ind: Industry) =>
      tile.x >= ind.position.x && tile.x < ind.position.x + ind.size.x &&
      tile.y >= ind.position.y && tile.y < ind.position.y + ind.size.y
    );
    if (industry) {
      html += `<div style="color:#fc0;margin-top:4px;font-weight:bold;">${industryLabel(industry.type)}</div>`;
      html += `<div style="color:#ff9;font-size:11px;margin-bottom:2px;">${industry.name}</div>`;
      if (industry.locked) {
        html += `<div style="color:#f66;font-size:11px;margin-top:2px;">🔒 LOCKED — Unlock for $${(industry.unlockCost ?? 0).toLocaleString()}</div>`;
        html += `<button id="btn-unlock-city" data-ind="${industry.id}" style="
          margin-top:4px;width:100%;padding:5px;font-family:monospace;font-size:11px;
          cursor:pointer;background:#220000;color:#f88;border:1px solid #633;border-radius:3px;
        ">🔓 Unlock City — $${(industry.unlockCost ?? 0).toLocaleString()}</button>`;
      } else {
        html += `<div>Stock: ${industry.stock.amount}/${industry.stock.capacity}</div>`;
        if (industry.produces) html += `<div style="color:#6ef;">↑ Produces: <b>${industry.produces}</b></div>`;
        if (industry.consumes) html += `<div style="color:#f96;">↓ Needs: <b>${industry.consumes}</b></div>`;
        html += `<div style="color:var(--ui-text-muted,#666);font-size:11px;">Total consumed: ${industry.totalConsumed}</div>`;
      }
    }

    if (building) {
      if (building.type === BuildingType.Station) {
        const linked = building.linkedIndustryId != null
          ? state.industries.find((i) => i.id === building.linkedIndustryId)
          : null;
        html += `<div style="color:#69f;margin-top:4px;font-weight:bold;">🏪 Station #${building.id}</div>`;
        html += `<div>Cargo: ${building.cargo.amount}/${building.cargo.capacity} (${building.cargo.type})</div>`;
        html += `<div style="color:var(--ui-text-muted,#888);">Linked: ${linked ? `${industryLabel(linked.type)} — ${linked.name}` : 'none'}</div>`;
      } else if (building.type === BuildingType.Airport) {
        const linked = (building as { linkedIndustryId: number | null }).linkedIndustryId != null
          ? state.industries.find((i) => i.id === (building as { linkedIndustryId: number | null }).linkedIndustryId)
          : null;
        html += `<div style="color:#6af;margin-top:4px;font-weight:bold;">✈ Airport #${building.id}</div>`;
        html += `<div>Cargo: ${(building as { cargo: { amount: number; capacity: number; type: string } }).cargo.amount}/${(building as { cargo: { amount: number; capacity: number; type: string } }).cargo.capacity}</div>`;
        html += `<div style="color:var(--ui-text-muted,#888);">Linked: ${linked ? `${industryLabel(linked.type)} — ${linked.name}` : 'none'}</div>`;
        html += `<div style="color:#7ae;font-size:11px;">✈ Planes use airports only. Buses/trains can feed passengers or cargo into airport storage.</div>`;
      } else if (building.type === BuildingType.Seaport) {
        const linked = (building as { linkedIndustryId: number | null }).linkedIndustryId != null
          ? state.industries.find((i) => i.id === (building as { linkedIndustryId: number | null }).linkedIndustryId)
          : null;
        html += `<div style="color:#4de;margin-top:4px;font-weight:bold;">⚓ Seaport #${building.id}</div>`;
        html += `<div>Cargo: ${(building as { cargo: { amount: number; capacity: number; type: string } }).cargo.amount}/${(building as { cargo: { amount: number; capacity: number; type: string } }).cargo.capacity}</div>`;
        html += `<div style="color:var(--ui-text-muted,#888);">Linked: ${linked ? `${industryLabel(linked.type)} — ${linked.name}` : 'none'}</div>`;
        html += `<div style="color:#4de;font-size:11px;">⛵ Ships use seaports only. Buses/trains can feed seaport storage from the city.</div>`;
      } else {
        html += `<div style="color:#da3;margin-top:4px;font-weight:bold;">🏗️ Depot #${building.id}</div>`;
        const here = state.vehicles.filter(
          (v) => Math.floor(v.position.x) === building.position.x && Math.floor(v.position.y) === building.position.y
        ).length;
        html += `<div style="color:var(--ui-text-muted,#aaa);font-size:11px;">Vehicles parked: ${here}</div>`;
        html += `<button id="btn-open-depot" style="
          margin-top:6px;width:100%;padding:5px;font-family:monospace;font-size:11px;
          cursor:pointer;background:#002244;color:#8cf;border:1px solid #36a;border-radius:3px;
        ">🛠 Manage Depot</button>`;
      }
    }

    const vehicles = state.vehicles.filter((v: Vehicle) =>
      Math.floor(v.position.x) === tile.x && Math.floor(v.position.y) === tile.y
    );
    for (const v of vehicles) {
      const isLoco  = v.vehicleType === 'locomotive';
      const isPlane = v.vehicleType === 'plane';
      const isShip  = v.vehicleType === 'ship';
      const isBus   = v.model === VehicleModel.Bus;
      const vIcon  = isBus ? '🚌' : isLoco ? '🚂' : isPlane ? '✈' : isShip ? '⛵' : '🚛';
      const vLabel = isBus ? 'Bus' : isLoco ? 'Loco' : isPlane ? 'Plane' : isShip ? 'Ship' : 'Truck';
      html += `<div style="color:#fd0;margin-top:4px;">${vIcon} ${vLabel} #${v.id}</div>`;
      html += `<div style="color:var(--ui-text-muted,#aaa);">State: ${v.state}</div>`;
      html += `<div>Cargo: ${v.cargoAmount}/${v.cargoCapacity} ${v.cargo ?? ''}</div>`;
      // Show assigned route with name
      if (v.routeId !== null) {
        const route = state.routes.find((r) => r.id === v.routeId);
        if (route) {
          const stops = route.orders.map((o) => {
            const bld = state.buildings.find((b) => b.id === o.stationId);
            if (!bld) return '?';
            const ind = (bld as { linkedIndustryId?: number | null }).linkedIndustryId != null
              ? state.industries.find((i) => i.id === (bld as { linkedIndustryId: number | null }).linkedIndustryId)
              : null;
            return ind ? ind.name : `Hub#${o.stationId}`;
          });
          const nameTag = route.name ? ` "${route.name}"` : '';
          html += `<div style="color:#8cf;font-size:10px;margin-top:2px;">Route${nameTag}: ${stops.join(' → ')}</div>`;
        }
      } else {
        html += `<div style="color:var(--ui-text-muted,#666);font-size:10px;">No route assigned</div>`;
      }
    }

    this.infoEl.innerHTML = html;

    document.getElementById('btn-open-depot')?.addEventListener('click', () => {
      if (building) {
        uiState.selectedEntityId = building.id;
        uiState.selectedEntityType = 'building';
        uiState.activePanel = 'depot';
        this._lastRenderedPanel = 'depot'; // prevent update() from double-rendering
        this._panelDirty = false;
        this.panelEl.style.display = 'block';
        this.renderDepotPanel(state, uiState);
      }
    });

    document.getElementById('btn-unlock-city')?.addEventListener('click', () => {
      const btn  = document.getElementById('btn-unlock-city') as HTMLButtonElement | null;
      const indId = Number(btn?.dataset['ind']);
      const ind   = state.industries.find((i) => i.id === indId);
      if (!ind || !ind.locked) return;
      const cost = ind.unlockCost ?? 0;
      if (!canAfford(state.economy, cost)) { alert(`Need $${cost.toLocaleString()} to unlock this city!`); return; }
      spend(state.economy, cost);
      // Unlock every industry that belongs to the same city
      const cityId = ind.cityId;
      for (const i of state.industries) {
        if (i.cityId === cityId) i.locked = false;
      }
      this._lastInfoHash = ''; // force panel refresh
    });
  }

  private updateToasts(uiState: UIState): void {
    if (!this.toastEl) return;
    this.toastEl.innerHTML = uiState.toasts.map((t) => `
      <div style="
        padding:8px 16px;background:rgba(0,0,0,0.92);color:#fff;
        font-family:monospace;font-size:13px;
        border:1px solid #4a4;border-radius:4px;white-space:nowrap;
        opacity:${Math.min(1, t.ttl / 600).toFixed(2)};
      ">${t.msg}</div>
    `).join('');
  }

  // ─── New Game panel ────────────────────────────────────────────────────────
  private renderNewGamePanel(uiState: UIState): void {
    const sizeInfo: Record<MapSize, string> = {
      small:  '128×128 · $220k start',
      normal: '200×200 · $380k start',
      large:  '280×280 · $550k start',
      huge:   '360×360 · $800k start',
    };
    this.panelEl.innerHTML = `
      <div style="color:var(--ui-text,#fff);font-size:15px;font-weight:bold;margin-bottom:10px;">🗺️ New Game</div>
      <label style="color:var(--ui-text-muted,#aaa);font-size:11px;">Seed (leave blank for random)</label><br>
      <input id="ng-seed" type="number" placeholder="random" style="
        width:100%;padding:5px;margin:4px 0 10px 0;box-sizing:border-box;
        font-family:monospace;font-size:12px;
        background:var(--ui-btn-bg,#1a1a1a);color:var(--ui-text,#fff);
        border:1px solid var(--ui-btn-border,#555);border-radius:3px;
      "><br>
      <label style="color:var(--ui-text-muted,#aaa);font-size:11px;">Map Size</label>
      <div id="ng-sizes" style="display:flex;flex-direction:column;gap:4px;margin:6px 0 12px 0;">
        ${(['small','normal','large','huge'] as MapSize[]).map((sz) => `
          <button data-size="${sz}" style="
            padding:6px 8px;font-family:monospace;font-size:11px;text-align:left;
            border-radius:3px;cursor:pointer;
            border:1px solid var(--ui-btn-border,#555);
            background:${sz === 'normal' ? 'var(--ui-active-bg,#003366)' : 'var(--ui-btn-bg,#1a1a1a)'};
            color:${sz === 'normal' ? 'var(--ui-accent,#8cf)' : 'var(--ui-text-muted,#aaa)'};
          ">${sz.charAt(0).toUpperCase()+sz.slice(1)} — ${sizeInfo[sz]}</button>
        `).join('')}
      </div>
      <button id="ng-start" style="
        width:100%;padding:10px;font-family:monospace;font-size:13px;font-weight:bold;
        cursor:pointer;
        background:var(--ui-btn-bg,#003300);color:var(--ui-positive,#4f4);
        border:1px solid var(--ui-positive,#3a3);border-radius:4px;margin-bottom:6px;
      ">▶ Start New Game</button>
      <button id="ng-cancel" style="
        width:100%;padding:6px;font-family:monospace;font-size:11px;
        cursor:pointer;
        background:var(--ui-btn-bg,#1a1a1a);color:var(--ui-text-muted,#777);
        border:1px solid var(--ui-btn-border,#333);border-radius:4px;
      ">Cancel</button>
    `;
    this.panelEl.style.display = 'block';

    let selectedSize: MapSize = 'normal';
    const sizeButtons = this.panelEl.querySelectorAll<HTMLButtonElement>('#ng-sizes button');
    const setSize = (sz: MapSize) => {
      selectedSize = sz;
      sizeButtons.forEach((b) => {
        const active = b.dataset['size'] === sz;
        b.style.background = active ? '#003366' : '#1a1a1a';
        b.style.color       = active ? '#8cf'    : '#aaa';
        b.style.borderColor = active ? '#36a'    : '#555';
      });
    };
    sizeButtons.forEach((b) => b.addEventListener('click', () => setSize(b.dataset['size'] as MapSize)));

    document.getElementById('ng-start')?.addEventListener('click', () => {
      const seedInput = (document.getElementById('ng-seed') as HTMLInputElement).value.trim();
      const seed = seedInput ? (parseInt(seedInput, 10) || undefined) : undefined;
      uiState.activePanel = 'none';
      this.panelEl.style.display = 'none';
      this.onNewGame?.({ seed, mapSize: selectedSize });
    });
    document.getElementById('ng-cancel')?.addEventListener('click', () => {
      uiState.activePanel = 'none';
      this.panelEl.style.display = 'none';
    });
  }

  // ─── Save/Load panel ───────────────────────────────────────────────────────
  private renderSavePanel(state: GameState): void {
    const slotHtml = ([0, 1, 2] as SaveSlot[]).map((slot) => {
      const meta = getSlotMeta(slot);
      const info = meta
        ? `Seed ${meta.seed} · ${(meta.mapSize ?? 'normal')} · $${meta.money.toLocaleString()} · tick ${meta.tick}<br><span style="color:var(--ui-text-muted,#555);font-size:10px;">${new Date(meta.savedAt).toLocaleString()}</span>`
        : `<span style="color:var(--ui-text-muted,#555);">Empty slot</span>`;
      return `
        <div style="padding:8px;background:var(--ui-card-bg,#1a1a1a);border:1px solid var(--ui-card-border,#333);border-radius:4px;margin-bottom:6px;">
          <div style="color:#fc0;font-size:12px;margin-bottom:4px;">Slot ${slot + 1}</div>
          <div style="color:var(--ui-text-muted,#aaa);font-size:11px;line-height:1.5;">${info}</div>
          <div style="display:flex;gap:4px;margin-top:6px;">
            <button data-save="${slot}" style="flex:1;padding:4px;font-size:11px;font-family:monospace;cursor:pointer;background:#003300;color:#4f4;border:1px solid #3a3;border-radius:3px;">💾 Save</button>
            ${meta ? `<button data-load="${slot}" style="flex:1;padding:4px;font-size:11px;font-family:monospace;cursor:pointer;background:#002244;color:#8cf;border:1px solid #36a;border-radius:3px;">📂 Load</button>` : ''}
            ${meta ? `<button data-del="${slot}"  style="flex:1;padding:4px;font-size:11px;font-family:monospace;cursor:pointer;background:#220000;color:#f66;border:1px solid #633;border-radius:3px;">🗑 Del</button>` : ''}
          </div>
        </div>`;
    }).join('');

    this.panelEl.innerHTML = `
      <div style="color:var(--ui-text,#fff);font-size:15px;font-weight:bold;margin-bottom:10px;">💾 Save / Load</div>
      ${slotHtml}
      <button id="save-close" style="width:100%;padding:5px;font-size:11px;font-family:monospace;cursor:pointer;background:var(--ui-card-bg,#1a1a1a);color:var(--ui-text-muted,#777);border:1px solid var(--ui-card-border,#333);border-radius:3px;">Close</button>
    `;
    this.panelEl.style.display = 'block';

    this.panelEl.querySelectorAll('button[data-save]').forEach((b) => {
      (b as HTMLElement).addEventListener('click', () => {
        const slot = Number((b as HTMLElement).dataset['save']) as SaveSlot;
        saveToSlot(state, slot);
        const uiState = this._uiState;
        if (uiState) this.renderSavePanel(state); // re-render to show updated meta
        (b as HTMLElement).textContent = '✓ Saved!';
      });
    });
    this.panelEl.querySelectorAll('button[data-load]').forEach((b) => {
      (b as HTMLElement).addEventListener('click', () => {
        const slot = Number((b as HTMLElement).dataset['load']) as SaveSlot;
        const loaded = loadFromSlot(slot);
        if (!loaded) { alert('Save slot is empty or corrupted.'); return; }
        this.onLoadSave?.(loaded);
        if (this._uiState) {
          this._uiState.activePanel = 'none';
          this.panelEl.style.display = 'none';
        }
      });
    });
    this.panelEl.querySelectorAll('button[data-del]').forEach((b) => {
      (b as HTMLElement).addEventListener('click', () => {
        const slot = Number((b as HTMLElement).dataset['del']) as SaveSlot;
        if (confirm(`Delete save slot ${slot + 1}?`)) {
          clearSlot(slot);
          this.renderSavePanel(state);
        }
      });
    });
    document.getElementById('save-close')?.addEventListener('click', () => {
      if (this._uiState) {
        this._uiState.activePanel = 'none';
        this.panelEl.style.display = 'none';
      }
    });
  }

  // ─── Money / Finance panel ────────────────────────────────────────────────
  private _lastMoneyHash = '';

  private renderMoneyPanel(state: GameState): void {
    const txns = state.economy.transactions;
    const tick = state.time.tick;
    // Refresh every 10 ticks so rates stay live without thrashing
    const hash = `${state.economy.money}:${txns.length}:${txns[txns.length - 1]?.tick ?? 0}:${Math.floor(tick / 10)}`;
    if (hash === this._lastMoneyHash) return;
    this._lastMoneyHash = hash;

    this.panelEl.style.width  = '310px';
    this.panelEl.style.display = 'block';

    const totalIncome  = txns.filter(t => t.delta > 0).reduce((s, t) => s + t.delta, 0);
    const totalExpense = txns.filter(t => t.delta < 0).reduce((s, t) => s + t.delta, 0);
    const net = totalIncome + totalExpense;

    // Net / 100 ticks — sum of transactions in the last 100-tick window
    const w100  = txns.filter(t => t.tick >= tick - 100);
    const w1000 = txns.filter(t => t.tick >= tick - 1000);
    const net100  = w100.reduce((s, t) => s + t.delta, 0);
    const net1000 = w1000.reduce((s, t) => s + t.delta, 0);
    const net100Color  = net100  >= 0 ? 'var(--ui-positive,#4f4)' : 'var(--ui-danger,#f66)';
    const net1000Color = net1000 >= 0 ? 'var(--ui-positive,#4f4)' : 'var(--ui-danger,#f66)';
    const fmt100  = `${net100  >= 0 ? '+' : ''}$${net100.toLocaleString()}`;
    const fmt1000 = `${net1000 >= 0 ? '+' : ''}$${net1000.toLocaleString()}`;

    const rows = [...txns].reverse().map(tx => {
      const isIncome = tx.delta > 0;
      const color = isIncome ? 'var(--ui-positive,#4f4)' : 'var(--ui-danger,#f66)';
      const sign  = isIncome ? '+' : '';
      return `<tr>
        <td style="color:var(--ui-text-muted,#666);padding:2px 6px 2px 0;font-size:10px;">T${tx.tick}</td>
        <td style="color:var(--ui-text,#ccc);padding:2px 4px;font-size:11px;">${tx.label}</td>
        <td style="color:${color};text-align:right;padding:2px 0;font-size:11px;white-space:nowrap;">${sign}$${Math.abs(tx.delta).toLocaleString()}</td>
      </tr>`;
    }).join('');

    const noRows = `<tr><td colspan="3" style="color:var(--ui-text-muted,#555);padding:10px;text-align:center;">No transactions yet</td></tr>`;

    this.panelEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="color:var(--ui-text,#fff);font-size:14px;font-weight:bold;">💰 Finance</span>
        <button id="btn-close-panel" style="background:none;border:none;color:var(--ui-text-muted,#888);cursor:pointer;font-size:14px;">✕</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px;font-family:monospace;font-size:12px;">
        <div style="flex:1;background:var(--ui-card-bg,#1a1a1a);border:1px solid var(--ui-card-border,#333);border-radius:4px;padding:6px;text-align:center;">
          <div style="color:var(--ui-text-muted,#666);font-size:10px;">Balance</div>
          <div style="color:var(--ui-positive,#4f4);font-weight:bold;">$${state.economy.money.toLocaleString()}</div>
        </div>
        <div style="flex:1;background:var(--ui-card-bg,#1a1a1a);border:1px solid var(--ui-card-border,#333);border-radius:4px;padding:6px;text-align:center;">
          <div style="color:var(--ui-text-muted,#666);font-size:10px;">All earned</div>
          <div style="color:var(--ui-positive,#4f4);">$${state.economy.totalEarned.toLocaleString()}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px;font-family:monospace;font-size:11px;">
        <div style="flex:1;background:var(--ui-card-bg,#1a1a1a);border:1px solid var(--ui-card-border,#333);border-radius:3px;padding:5px;text-align:center;">
          <div style="color:var(--ui-text-muted,#666);font-size:10px;">Recent income</div>
          <div style="color:var(--ui-positive,#4f4);">+$${totalIncome.toLocaleString()}</div>
        </div>
        <div style="flex:1;background:var(--ui-card-bg,#1a1a1a);border:1px solid var(--ui-card-border,#333);border-radius:3px;padding:5px;text-align:center;">
          <div style="color:var(--ui-text-muted,#666);font-size:10px;">Recent expense</div>
          <div style="color:var(--ui-danger,#f66);">-$${Math.abs(totalExpense).toLocaleString()}</div>
        </div>
        <div style="flex:1;background:var(--ui-card-bg,#1a1a1a);border:1px solid var(--ui-card-border,#333);border-radius:3px;padding:5px;text-align:center;">
          <div style="color:var(--ui-text-muted,#666);font-size:10px;">Net</div>
          <div style="color:${net >= 0 ? 'var(--ui-positive,#4f4)' : 'var(--ui-danger,#f66)'};">${net >= 0 ? '+' : ''}$${net.toLocaleString()}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:6px;font-family:monospace;font-size:11px;">
        <div style="flex:1;background:var(--ui-card-bg,#1a1a1a);border:1px solid var(--ui-card-border,#333);border-radius:3px;padding:5px;text-align:center;">
          <div style="color:var(--ui-text-muted,#666);font-size:9px;">Net / 100 ticks</div>
          <div style="color:${net100Color};font-weight:bold;">${fmt100}</div>
        </div>
        <div style="flex:1;background:var(--ui-card-bg,#1a1a1a);border:1px solid var(--ui-card-border,#333);border-radius:3px;padding:5px;text-align:center;">
          <div style="color:var(--ui-text-muted,#666);font-size:9px;">Net / 1000 ticks${tick < 1000 ? ' <span title="Less than 1000 ticks of data" style=\\"color:#a83;\\">~</span>' : ''}</div>
          <div style="color:${net1000Color};font-weight:bold;">${fmt1000}</div>
        </div>
      </div>
      <div style="color:var(--ui-text-muted,#777);font-size:10px;margin:6px 0 4px;">Last ${txns.length} transactions (newest first):</div>
      <div style="overflow-y:auto;max-height:260px;">
        <table style="width:100%;border-collapse:collapse;font-family:monospace;">${rows || noRows}</table>
      </div>
    `;

    document.getElementById('btn-close-panel')?.addEventListener('click', () => {
      if (this._uiState) this._uiState.activePanel = 'none';
      this.panelEl.style.display = 'none';
      this._lastMoneyHash = '';
    });
  }

  // ─── Help / Tutorial panel ─────────────────────────────────────────────────
  private renderHelpPanel(): void {
    this.panelEl.innerHTML = `
      <div style="color:var(--ui-text,#fff);font-size:15px;font-weight:bold;margin-bottom:8px;">❓ How to Play</div>
      <div style="color:var(--ui-text,#ccc);font-size:11px;line-height:1.75;">
        <b style="color:var(--ui-warning,#fc0);">Start Here</b><br>
        Build roads, place stations beside producers and consumers, add a depot, buy a vehicle, then assign a load stop and an unload stop. Stations, airports, and seaports all auto-link to the nearest industry within 3 tiles, so placement matters.<br><br>

        <b style="color:var(--ui-warning,#fc0);">Infrastructure</b><br>
        🛤️ <b>Road</b>: cheap land connection for trucks. Drag to paint lines quickly.<br>
        🏪 <b>Station</b>: universal cargo hub. It stores output from its linked industry and hands it to vehicles.<br>
        🏗️ <b>Truck Depot</b>: buys road vehicles, including buses. Put it on or near your road grid.<br>
        🚂 <b>Rail</b>: unlocked later. Expensive to build and maintain, but strong for long distance routes.<br>
        🏭 <b>Train Yard</b>: buys locomotives and express trains. Place it on rail.<br>
        🌉 <b>Bridge</b>: turns a water tile into road once Bridging is unlocked.<br>
        ⛏️ <b>Tunnel</b>: turns a mountain tile into road once Tunneling is unlocked.<br>
        ✈ <b>Airport</b>: air hub for planes only. Airports do <b>not</b> need roads for planes to travel between them. They keep a local cargo/passenger buffer, so buses and trains can drop people or goods there for onward flights.<br>
        ⚓ <b>Seaport</b>: water hub for ships only. A seaport must touch water when placed. It also has a local buffer, so buses and trains can drop passengers or freight there for ships.<br><br>

        <b style="color:var(--ui-warning,#fc0);">Vehicles</b><br>
        🚚 <b>Basic Truck</b>: balanced early-game hauler for short chains.<br>
        🚛 <b>Cargo Truck</b>: more capacity, same general role, better once routes are profitable.<br>
        🚜 <b>Heavy Hauler</b>: slow but useful for dense industrial chains.<br>
        🚌 <b>City Bus</b>: passengers only. Use it to move people from passenger terminals to airports, seaports, or rail hubs.<br>
        🚂 <b>Freight Train</b>: high-capacity long-range mover once you can afford the rail network.<br>
        🚄 <b>Express Train</b>: faster rail option with lower capacity.<br>
        ✈ <b>Light Aircraft</b>, 🛩 <b>Cargo Plane</b>, 🛫 <b>Jumbo Jet</b>: airport-to-airport only. No road required between airports. They load from airport storage and unload into another airport's storage.<br>
        ⛵ <b>River Barge</b>, 🚢 <b>Cargo Ship</b>, 🛳️ <b>Supertanker</b>: seaport-to-seaport only. They need continuous water between ports and also use seaport storage.<br>
        Human passengers can only travel by <b>bus, train, ship, or plane</b>. Trucks cannot carry passengers.<br><br>

        <b style="color:var(--ui-warning,#fc0);">Terrain And Cities</b><br>
        Some locked cities sit behind rough terrain. Mountain cities are wrapped in irregular ridges, so tunnels, rail, or longer road detours matter. Island cities are fully surrounded by water, so they naturally push you toward ships, airports, or expensive bridge chains.<br><br>

        <b style="color:var(--ui-warning,#fc0);">Economy</b><br>
        Every <b>${MAINTENANCE_INTERVAL} ticks</b>, you pay upkeep for roads, rail, buildings, and vehicles. The 🔧 HUD value shows the next bill. Expand in stages so maintenance never outruns your delivery income.<br><br>

        <b style="color:var(--ui-warning,#fc0);">Controls</b><br>
        1-0 select main tools, T tech, O goals, M finance, N new game, ? help, Space pause, Esc close panel, Save via button, Shift+drag or right-drag pan, Scroll zoom.
      </div>
      <button id="help-close" style="width:100%;margin-top:10px;padding:5px;font-size:11px;font-family:monospace;cursor:pointer;background:var(--ui-btn-bg,#1a1a1a);color:var(--ui-text-muted,#777);border:1px solid var(--ui-btn-border,#333);border-radius:3px;">Close</button>
    `;
    this.panelEl.style.display = 'block';
    document.getElementById('help-close')?.addEventListener('click', () => {
      if (this._uiState) {
        this._uiState.activePanel = 'none';
        this.panelEl.style.display = 'none';
      }
    });
  }
}

function getObjectiveProgress(obj: Objective, state: GameState): number {
  switch (obj.type) {
    case 'deliver_cargo':
      if (obj.cargo) return state.economy.cargoDelivered[obj.cargo] ?? 0;
      return Object.values(state.economy.cargoDelivered).filter((v) => (v ?? 0) > 0).length;
    case 'earn_money':   return state.economy.totalEarned;
    case 'build_roads':  return state.roadsBuilt;
    case 'buy_vehicles': return state.vehicles.length;
    case 'unlock_tech':  return state.tech.filter((t) => t.unlocked).length;
    case 'lay_rail':     return state.railsBuilt;
  }
}

// ─── New panel render methods ────────────────────────────────────────────────
