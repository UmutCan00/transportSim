import type { GameState, UIState, Building, Industry, Vehicle, Objective, MapSize } from '../core/types.ts';
import { SimSpeed, ToolType, BuildingType, TileType } from '../core/types.ts';
import { getTile } from '../core/World.ts';
import { industryLabel } from '../core/Industry.ts';
import { prereqsMet, getTruckCostMult, isRailwayUnlocked, isBridgingUnlocked, isTunnelingUnlocked, isAviationUnlocked, isMaritimeUnlocked } from '../core/TechTree.ts';
import { TRUCK_COST, LOCOMOTIVE_COST, PLANE_COST, SHIP_COST } from '../constants.ts';
import { createVehicle, createLocomotive, createPlane, createShip } from '../core/Vehicle.ts';
import { generateId } from '../core/GameState.ts';
import type { NewGameOptions } from '../core/GameState.ts';
import { canAfford, spend } from '../core/Economy.ts';
import { createRoute } from '../core/Route.ts';
import { saveToSlot, loadFromSlot, getSlotMeta, clearSlot } from '../core/Save.ts';
import type { SaveSlot } from '../core/Save.ts';

type ToolDef = { type: ToolType; label: string; icon: string; shortcut: string; requiresRailway?: true; requiresBridging?: true; requiresTunneling?: true; requiresAviation?: true; requiresMaritime?: true };

const TOOLS: ToolDef[] = [
  { type: ToolType.Select,       label: 'Select',   icon: '🔍', shortcut: '1' },
  { type: ToolType.BuildRoad,    label: 'Road',     icon: '🛤️', shortcut: '2' },
  { type: ToolType.PlaceStation, label: 'Station',  icon: '🏪', shortcut: '3' },
  { type: ToolType.PlaceDepot,   label: 'Depot',    icon: '🏗️', shortcut: '4' },
  { type: ToolType.Demolish,     label: 'Demolish', icon: '💥', shortcut: '5' },
  { type: ToolType.LayRail,      label: 'Rail',     icon: '🚂', shortcut: '6', requiresRailway: true },
  { type: ToolType.BuildBridge,  label: 'Bridge',   icon: '🌉', shortcut: '7', requiresBridging: true },
  { type: ToolType.BuildTunnel,  label: 'Tunnel',   icon: '⛏️', shortcut: '8', requiresTunneling: true },
  { type: ToolType.PlaceAirport, label: 'Airport',  icon: '✈', shortcut: '9', requiresAviation: true },
  { type: ToolType.PlaceSeaport, label: 'Seaport',  icon: '⚓', shortcut: '0', requiresMaritime: true },
];

export class UIManager {
  private container: HTMLElement;
  private moneyEl!: HTMLElement;
  private tickEl!: HTMLElement;
  private speedEl!: HTMLElement;
  private seedEl!: HTMLElement;
  private infoEl!: HTMLElement;
  private panelEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private toolButtons: Map<ToolType, HTMLElement> = new Map();
  private onSpeedChange: (speed: SimSpeed) => void;
  private onToolChange: ((tool: ToolType) => void) | null = null;
  private onNewGame: ((opts: NewGameOptions) => void) | null = null;
  private onUnlockTech: ((id: string) => void) | null = null;
  private onLoadSave: ((state: GameState) => void) | null = null;

  private _uiState: UIState | null = null;
  private _lastTechHash = '';
  private _lastRailwayState = false;
  private _lastBridgingState = false;
  private _lastTunnelingState = false;
  private _lastAviationState = false;
  private _lastMaritimeState = false;
  private _lastRenderedPanel = 'none';
  private _panelDirty = false;
  private _lastInfoHash = '';

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
        display:flex;justify-content:space-between;align-items:center;
        padding:6px 12px;background:rgba(0,0,0,0.85);
        color:#fff;font-family:monospace;font-size:13px;
        pointer-events:auto;user-select:none;z-index:20;
      ">
        <div style="display:flex;align-items:center;gap:14px;">
          <span id="hud-money" style="color:#4f4;font-weight:bold;">$0</span>
          <span id="hud-earned" style="color:#aaa;font-size:11px;">earned: $0</span>
          <span id="hud-deliveries" style="color:#8cf;font-size:11px;">📦 0</span>
          <span id="hud-tick" style="color:#aaa;">Tick: 0</span>
          <span id="hud-seed" style="color:#555;">Seed: 0</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <button id="btn-pause">⏸</button>
          <button id="btn-normal">1×</button>
          <button id="btn-fast">2×</button>
          <span id="hud-speed" style="margin-left:6px;width:44px;">▶ 1×</span>
          <button id="btn-obj"    style="margin-left:8px;">🎯 Goals</button>
          <button id="btn-tech"   style="margin-left:4px;">🔬 Tech</button>
          <button id="btn-save"   style="margin-left:4px;">💾 Save</button>
          <button id="btn-help"   style="margin-left:4px;">? Help</button>
          <button id="btn-newmap" style="margin-left:12px;">🗺️ New Game</button>
        </div>
      </div>

      <div id="toolbar" style="
        position:absolute;top:44px;left:0;
        display:flex;flex-direction:column;gap:2px;padding:6px;
        background:rgba(0,0,0,0.85);border-radius:0 6px 6px 0;
        pointer-events:auto;user-select:none;z-index:20;
      "></div>

      <div id="side-panel" style="
        position:absolute;top:44px;right:0;
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
    `;

    this.moneyEl = document.getElementById('hud-money')!;
    this.tickEl  = document.getElementById('hud-tick')!;
    this.speedEl = document.getElementById('hud-speed')!;
    this.seedEl  = document.getElementById('hud-seed')!;
    this.infoEl  = document.getElementById('hud-info')!;
    this.panelEl = document.getElementById('side-panel')!;
    this.toastEl = document.getElementById('toast-container')!;

    document.getElementById('btn-pause')!.addEventListener('click',  () => this.onSpeedChange(SimSpeed.Paused));
    document.getElementById('btn-normal')!.addEventListener('click', () => this.onSpeedChange(SimSpeed.Normal));
    document.getElementById('btn-fast')!.addEventListener('click',   () => this.onSpeedChange(SimSpeed.Fast));
    document.getElementById('btn-newmap')!.addEventListener('click', () => this.togglePanel('newgame'));
    document.getElementById('btn-tech')!.addEventListener('click',   () => this.togglePanel('tech'));
    document.getElementById('btn-obj')!.addEventListener('click',    () => this.togglePanel('objectives'));
    document.getElementById('btn-save')!.addEventListener('click',   () => this.togglePanel('save'));
    document.getElementById('btn-help')!.addEventListener('click',   () => this.togglePanel('help'));

    const toolbar = document.getElementById('toolbar')!;
    for (const tool of TOOLS) {
      const btn = document.createElement('button');
      btn.style.cssText = `
        display:flex;align-items:center;gap:6px;
        padding:6px 10px;width:130px;
        font-family:monospace;font-size:12px;
        border:1px solid #555;background:#333;color:#fff;
        cursor:pointer;border-radius:3px;text-align:left;
      `;
      btn.innerHTML = `<span>${tool.icon}</span><span>${tool.label}</span><span style="color:#666;margin-left:auto;">${tool.shortcut}</span>`;
      btn.addEventListener('click', () => this.onToolChange?.(tool.type));
      toolbar.appendChild(btn);
      this.toolButtons.set(tool.type, btn);
    }
    // LayRail, BuildBridge, BuildTunnel, Airport, Seaport hidden until their tech is unlocked
    const railBtnInit = this.toolButtons.get(ToolType.LayRail);
    if (railBtnInit) railBtnInit.style.display = 'none';
    const bridgeBtnInit = this.toolButtons.get(ToolType.BuildBridge);
    if (bridgeBtnInit) bridgeBtnInit.style.display = 'none';
    const tunnelBtnInit = this.toolButtons.get(ToolType.BuildTunnel);
    if (tunnelBtnInit) tunnelBtnInit.style.display = 'none';
    const airportBtnInit = this.toolButtons.get(ToolType.PlaceAirport);
    if (airportBtnInit) airportBtnInit.style.display = 'none';
    const seaportBtnInit = this.toolButtons.get(ToolType.PlaceSeaport);
    if (seaportBtnInit) seaportBtnInit.style.display = 'none';

    const legend = document.createElement('div');
    legend.style.cssText = 'padding:6px 4px;color:#555;font-family:monospace;font-size:10px;line-height:1.7;border-top:1px solid #333;margin-top:4px;';
    legend.innerHTML = `
      <span style="color:#777;">Costs</span><br>
      Road $250 · Rail $600<br>Bridge $1.8k · Tunnel $5k<br>Station $5k · Depot $10k<br>Truck $15k · Loco $50k<br>Airport $75k · Seaport $50k<br>Plane $40k · Ship $30k<br>
      <span style="color:#555;margin-top:4px;display:block;">T=Tech O=Goals<br>S=Save ?=Help N=New<br>RClick=Pan Scroll=Zoom</span>
    `;
    toolbar.appendChild(legend);
  }

  private togglePanel(which: 'tech' | 'objectives' | 'newgame' | 'help' | 'save'): void {
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
      if (e.key === ' ')                   { e.preventDefault(); this.onSpeedChange(SimSpeed.Paused); }
      if (e.key === 't' || e.key === 'T')  this.togglePanel('tech');
      if (e.key === 'o' || e.key === 'O')  this.togglePanel('objectives');
      if (e.key === 's' || e.key === 'S')  this.togglePanel('save');
      if (e.key === '?')                   this.togglePanel('help');
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

  update(state: GameState, uiState: UIState): void {
    this._uiState = uiState;

    this.moneyEl.textContent = `$${state.economy.money.toLocaleString()}`;
    const earnedEl = document.getElementById('hud-earned');
    if (earnedEl) earnedEl.textContent = `earned: $${state.economy.totalEarned.toLocaleString()}`;
    const delivEl = document.getElementById('hud-deliveries');
    if (delivEl) delivEl.textContent = `📦 ${state.economy.deliveriesCompleted}`;
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

    // Show/hide Railway tool button when tech is unlocked
    const railwayNow = isRailwayUnlocked(state);
    if (railwayNow !== this._lastRailwayState) {
      this._lastRailwayState = railwayNow;
      const railBtn = this.toolButtons.get(ToolType.LayRail);
      if (railBtn) railBtn.style.display = railwayNow ? 'flex' : 'none';
    }
    const bridgingNow = isBridgingUnlocked(state);
    if (bridgingNow !== this._lastBridgingState) {
      this._lastBridgingState = bridgingNow;
      const bridgeBtn = this.toolButtons.get(ToolType.BuildBridge);
      if (bridgeBtn) bridgeBtn.style.display = bridgingNow ? 'flex' : 'none';
    }
    const tunnelingNow = isTunnelingUnlocked(state);
    if (tunnelingNow !== this._lastTunnelingState) {
      this._lastTunnelingState = tunnelingNow;
      const tunnelBtn = this.toolButtons.get(ToolType.BuildTunnel);
      if (tunnelBtn) tunnelBtn.style.display = tunnelingNow ? 'flex' : 'none';
    }
    const aviationNow = isAviationUnlocked(state);
    if (aviationNow !== this._lastAviationState) {
      this._lastAviationState = aviationNow;
      const airportBtn = this.toolButtons.get(ToolType.PlaceAirport);
      if (airportBtn) airportBtn.style.display = aviationNow ? 'flex' : 'none';
    }
    const maritimeNow = isMaritimeUnlocked(state);
    if (maritimeNow !== this._lastMaritimeState) {
      this._lastMaritimeState = maritimeNow;
      const seaportBtn = this.toolButtons.get(ToolType.PlaceSeaport);
      if (seaportBtn) seaportBtn.style.display = maritimeNow ? 'flex' : 'none';
    }

    for (const [type, btn] of this.toolButtons) {
      btn.style.background  = type === uiState.activeTool ? '#0066cc' : '#333';
      btn.style.borderColor = type === uiState.activeTool ? '#3399ff' : '#555';
    }

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
    }

    this.updateInfoPanel(state, uiState);
    this.updateToasts(uiState);
  }

  private renderTechPanel(state: GameState): void {
    // Only re-render when tech count or money meaningfully changes — prevents
    // the panel innerHTML from being replaced mid-click, which would eat the event.
    const hash = `${state.tech.filter((t) => t.unlocked).length}:${state.economy.money}`;
    if (hash === this._lastTechHash) return;
    this._lastTechHash = hash;

    const tiers: (1 | 2 | 3)[] = [1, 2, 3];
    let html = `<div style="color:#fff;font-size:14px;margin-bottom:4px;">🔬 Research Tree</div>`;
    html += `<div style="color:#666;font-size:11px;margin-bottom:10px;">T or click ✕ to close &nbsp;<button id="btn-close-panel" style="float:right;background:none;border:none;color:#888;cursor:pointer;font-size:14px;">✕</button></div>`;

    for (const tier of tiers) {
      html += `<div style="color:#fc0;margin:8px 0 4px;font-size:11px;">── Tier ${tier} ──────────────────</div>`;
      for (const tech of state.tech.filter((t) => t.tier === tier)) {
        const hasPrereqs = prereqsMet(state, tech.id);
        const unlockable = hasPrereqs && canAfford(state.economy, tech.cost);
        const bg     = tech.unlocked ? '#1a4a1a' : unlockable ? '#1a2a4a' : hasPrereqs ? '#2a1a00' : '#1e1e1e';
        const border = tech.unlocked ? '#4f4'    : unlockable ? '#48f'    : hasPrereqs ? '#a60'    : '#333';
        const prereqList = tech.requires.map((r) => {
          const found = state.tech.find((t) => t.id === r);
          return found
            ? (found.unlocked ? `<span style="color:#4f4">${found.name}</span>` : `<span style="color:#f84">${found.name}</span>`)
            : r;
        }).join(', ');

        let btnHtml: string;
        if (tech.unlocked) {
          btnHtml = `<span style="color:#4f4;font-size:11px;">✓ Unlocked</span>`;
        } else if (unlockable) {
          btnHtml = `<button data-tech="${tech.id}" style="
            padding:3px 8px;font-size:11px;font-family:monospace;
            background:#003388;color:#8cf;border:1px solid #48f;
            cursor:pointer;border-radius:3px;white-space:nowrap;
          ">Unlock \$${(tech.cost/1000).toFixed(0)}k</button>`;
        } else if (hasPrereqs) {
          const need = tech.cost - state.economy.money;
          btnHtml = `<span style="color:#a80;font-size:11px;white-space:nowrap;">💸 Need \$${(need/1000).toFixed(0)}k more</span>`;
        } else {
          btnHtml = `<span style="color:#555;font-size:11px;">🔒 Locked</span>`;
        }

        html += `
          <div style="margin:4px 0;padding:8px;border-radius:4px;background:${bg};border:1px solid ${border};">
            <div style="display:flex;align-items:center;">
              <span style="font-size:18px;margin-right:6px;">${tech.icon}</span>
              <span style="color:#fff;font-weight:bold;flex:1;">${tech.name}</span>
              ${btnHtml}
            </div>
            <div style="color:#aaa;font-size:11px;margin-top:4px;">${tech.description}</div>
            ${tech.requires.length > 0 ? `<div style="color:#666;font-size:10px;margin-top:3px;">Req: ${prereqList}</div>` : ''}
          </div>`;
      }
    }
    this.panelEl.innerHTML = html;

    document.getElementById('btn-close-panel')?.addEventListener('click', () => {
      if (this._uiState) this._uiState.activePanel = 'none';
      this.panelEl.style.display = 'none';
    });
    this.panelEl.querySelectorAll('button[data-tech]').forEach((btn) => {
      btn.addEventListener('click', () => this.onUnlockTech?.((btn as HTMLElement).dataset['tech']!));
    });
  }

  private renderObjectivesPanel(state: GameState): void {
    let html = `<div style="color:#fff;font-size:14px;margin-bottom:4px;">🎯 Objectives</div>`;
    html += `<div style="color:#666;font-size:11px;margin-bottom:8px;">O or click ✕ to close &nbsp;<button id="btn-close-panel" style="float:right;background:none;border:none;color:#888;cursor:pointer;font-size:14px;">✕</button></div>`;

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
          <div style="color:#888;font-size:11px;margin:2px 0;">${obj.description}</div>
          <div style="background:#2a2a2a;border-radius:2px;height:5px;margin-top:4px;">
            <div style="background:${done ? '#3a3' : '#36a'};width:${pct}%;height:100%;border-radius:2px;"></div>
          </div>
          <div style="color:#666;font-size:10px;margin-top:2px;">${done ? 'Complete' : `${Math.floor(progress)} / ${obj.target}`}</div>
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
      (b) => b.id === uiState.selectedEntityId && b.type === BuildingType.Depot
    );
    if (!depot) return;

    const truckCost = Math.floor(TRUCK_COST * getTruckCostMult(state));
    const locoCost  = Math.floor(LOCOMOTIVE_COST * getTruckCostMult(state));
    const canBuyTruck = canAfford(state.economy, truckCost);
    const canBuyLoco  = isRailwayUnlocked(state) && canAfford(state.economy, locoCost);
    const canBuyPlane = isAviationUnlocked(state) && canAfford(state.economy, PLANE_COST);
    const canBuyShip  = isMaritimeUnlocked(state) && canAfford(state.economy, SHIP_COST);
    // Show ALL vehicles — once assigned a route, vehicles travel away from the depot tile
    const allVehicles = state.vehicles;
    // Transit hubs: stations, airports, seaports
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

    let html = `
      <div style="color:#fff;font-size:14px;margin-bottom:4px;">🏗️ Depot #${depot.id}</div>
      <div style="color:#666;font-size:11px;margin-bottom:8px;">
        Pos: (${depot.position.x}, ${depot.position.y}) &nbsp;
        <button id="btn-close-panel" style="float:right;background:none;border:none;color:#888;cursor:pointer;font-size:14px;">✕</button>
      </div>
      <button id="btn-buy-truck" style="
        width:100%;padding:8px;font-family:monospace;font-size:12px;
        cursor:${canBuyTruck ? 'pointer' : 'not-allowed'};
        background:${canBuyTruck ? '#003300' : '#1a1a1a'};
        color:${canBuyTruck ? '#4f4' : '#555'};
        border:1px solid ${canBuyTruck ? '#3a3' : '#333'};border-radius:4px;margin-bottom:6px;
      ">🚛 Buy Truck — $${truckCost.toLocaleString()}${!canBuyTruck ? ' (need more funds)' : ''}</button>`;
    if (isRailwayUnlocked(state)) {
      html += `
      <button id="btn-buy-loco" style="
        width:100%;padding:8px;font-family:monospace;font-size:12px;
        cursor:${canBuyLoco ? 'pointer' : 'not-allowed'};
        background:${canBuyLoco ? '#001a33' : '#1a1a1a'};
        color:${canBuyLoco ? '#6af' : '#555'};
        border:1px solid ${canBuyLoco ? '#36a' : '#333'};border-radius:4px;margin-bottom:10px;
      ">🚂 Buy Locomotive — $${locoCost.toLocaleString()}${!canBuyLoco ? ' (need more funds)' : ''}</button>`;
    }
    if (isAviationUnlocked(state)) {
      html += `
      <button id="btn-buy-plane" style="
        width:100%;padding:8px;font-family:monospace;font-size:12px;
        cursor:${canBuyPlane ? 'pointer' : 'not-allowed'};
        background:${canBuyPlane ? '#001a3a' : '#1a1a1a'};
        color:${canBuyPlane ? '#8cf' : '#555'};
        border:1px solid ${canBuyPlane ? '#3af' : '#333'};border-radius:4px;margin-bottom:6px;
      ">✈ Buy Plane — $${PLANE_COST.toLocaleString()} · Cap:30 · Direct flight${!canBuyPlane ? ' (need more funds)' : ''}</button>`;
    }
    if (isMaritimeUnlocked(state)) {
      html += `
      <button id="btn-buy-ship" style="
        width:100%;padding:8px;font-family:monospace;font-size:12px;
        cursor:${canBuyShip ? 'pointer' : 'not-allowed'};
        background:${canBuyShip ? '#001a1a' : '#1a1a1a'};
        color:${canBuyShip ? '#4de' : '#555'};
        border:1px solid ${canBuyShip ? '#0ae' : '#333'};border-radius:4px;margin-bottom:10px;
      ">⛵ Buy Ship — $${SHIP_COST.toLocaleString()} · Cap:80 · Water routes${!canBuyShip ? ' (need more funds)' : ''}</button>`;
    }

    if (allVehicles.length > 0) {
      html += `<div style="color:#fc0;margin-bottom:6px;font-size:11px;">Your fleet (${allVehicles.length} vehicle${allVehicles.length !== 1 ? 's' : ''}):</div>`;
      for (const v of allVehicles) {
        const currentRoute = v.routeId != null
          ? state.routes.find((r) => r.id === v.routeId)
          : null;
        const hubOpts = hubs.map(hubOption).join('');
        const vIcon = v.vehicleType === 'locomotive' ? '🚂' : v.vehicleType === 'plane' ? '✈' : v.vehicleType === 'ship' ? '⛵' : '🚛';
        const vLabel = v.vehicleType === 'locomotive' ? 'Locomotive' : v.vehicleType === 'plane' ? 'Plane' : v.vehicleType === 'ship' ? 'Ship' : 'Truck';
        const routeName = currentRoute?.name ? ` "${currentRoute.name}"` : '';
        html += `
          <div style="margin:4px 0;padding:6px;background:#1a1a2e;border:1px solid #3a3a5a;border-radius:3px;">
            <div style="color:#fd0;font-weight:bold;">${vIcon} ${vLabel} #${v.id}
              <span style="color:#888;font-weight:normal;font-size:11px;"> — ${v.state}</span>
            </div>
            <div style="color:#aaa;font-size:11px;">Cargo: ${v.cargoAmount}/${v.cargoCapacity} ${v.cargo ?? '(empty)'}</div>
            ${currentRoute
              ? `<div style="color:#4f4;font-size:11px;margin-top:2px;">✓ Route${routeName} (${currentRoute.orders.length} stops)</div>`
              : ''
            }
            ${hubs.length >= 2
              ? `<div style="margin-top:6px;font-size:11px;">
                  <div style="color:#888;margin-bottom:2px;">${currentRoute ? 'Reassign route:' : 'Assign route:'}</div>
                  <input id="rname-${v.id}" placeholder="Route name (optional)" style="font-size:11px;background:#222;color:#ccc;border:1px solid #444;padding:2px 4px;width:100%;margin-bottom:4px;box-sizing:border-box;" value="${currentRoute?.name ?? ''}"><br>
                  <div style="color:#6af;font-size:10px;margin-bottom:2px;">📥 Pick up from:</div>
                  <select id="sel-from-${v.id}" style="font-size:11px;background:#222;color:#ccc;border:1px solid #444;padding:2px;width:100%;margin-bottom:3px;">${hubOpts}</select>
                  <div style="color:#f96;font-size:10px;margin-bottom:2px;">📤 Deliver to:</div>
                  <select id="sel-to-${v.id}"   style="font-size:11px;background:#222;color:#ccc;border:1px solid #444;padding:2px;width:100%;margin-bottom:4px;">${hubOpts}</select>
                  <button data-assign="${v.id}" style="
                    width:100%;padding:4px;font-size:11px;font-family:monospace;
                    cursor:pointer;background:#002244;color:#8cf;
                    border:1px solid #36a;border-radius:3px;
                  ">▶ Assign Route</button>
                </div>`
              : `<div style="color:#666;font-size:11px;margin-top:4px;">⚠ Place 2+ stations first to create routes</div>`
            }
          </div>`;
      }
    } else {
      html += `<div style="color:#555;font-size:11px;">No trucks yet — buy one above to get started.</div>`;
    }

    this.panelEl.innerHTML = html;
    this.panelEl.style.display = 'block';

    document.getElementById('btn-close-panel')?.addEventListener('click', () => {
      if (uiState) uiState.activePanel = 'none';
      this._lastInfoHash = ''; // allow info panel to show Manage Depot again
      this.panelEl.style.display = 'none';
    });
    document.getElementById('btn-buy-truck')?.addEventListener('click', () => {
      if (!canAfford(state.economy, truckCost)) return;
      spend(state.economy, truckCost);
      const id = generateId(state);
      state.vehicles.push(createVehicle(id, { x: depot.position.x, y: depot.position.y }));
      this.renderDepotPanel(state, uiState);
    });
    document.getElementById('btn-buy-loco')?.addEventListener('click', () => {
      if (!canAfford(state.economy, locoCost)) return;
      spend(state.economy, locoCost);
      const id = generateId(state);
      state.vehicles.push(createLocomotive(id, { x: depot.position.x, y: depot.position.y }));
      this.renderDepotPanel(state, uiState);
    });
    document.getElementById('btn-buy-plane')?.addEventListener('click', () => {
      if (!canAfford(state.economy, PLANE_COST)) return;
      spend(state.economy, PLANE_COST);
      const id = generateId(state);
      state.vehicles.push(createPlane(id, { x: depot.position.x, y: depot.position.y }));
      this.renderDepotPanel(state, uiState);
    });
    document.getElementById('btn-buy-ship')?.addEventListener('click', () => {
      if (!canAfford(state.economy, SHIP_COST)) return;
      spend(state.economy, SHIP_COST);
      const id = generateId(state);
      state.vehicles.push(createShip(id, { x: depot.position.x, y: depot.position.y }));
      this.renderDepotPanel(state, uiState);
    });
    this.panelEl.querySelectorAll('button[data-assign]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const vid = Number((btn as HTMLElement).dataset['assign']);
        const fromEl  = document.getElementById(`sel-from-${vid}`) as HTMLSelectElement | null;
        const toEl    = document.getElementById(`sel-to-${vid}`)   as HTMLSelectElement | null;
        const nameEl  = document.getElementById(`rname-${vid}`)    as HTMLInputElement  | null;
        if (!fromEl || !toEl) return;
        const fromId = Number(fromEl.value);
        const toId   = Number(toEl.value);
        if (fromId === toId) { alert('Pick-up and delivery stops must be different!'); return; }
        const vehicle = state.vehicles.find((v) => v.id === vid);
        if (!vehicle) return;
        const routeName = nameEl?.value.trim() ?? '';
        const routeId = generateId(state);
        const route = createRoute(routeId, [
          { stationId: fromId, action: 'load' },
          { stationId: toId,   action: 'unload' },
        ], routeName);
        state.routes.push(route);
        vehicle.routeId = routeId;
        vehicle.currentOrderIndex = 0;
        btn.textContent = '✓ Assigned!';
        (btn as HTMLElement).style.background = '#003300';
        (btn as HTMLElement).style.color = '#4f4';
      });
    });
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
        html += `<div style="color:#666;font-size:11px;">Total consumed: ${industry.totalConsumed}</div>`;
      }
    }

    if (building) {
      if (building.type === BuildingType.Station) {
        const linked = building.linkedIndustryId != null
          ? state.industries.find((i) => i.id === building.linkedIndustryId)
          : null;
        html += `<div style="color:#69f;margin-top:4px;font-weight:bold;">🏪 Station #${building.id}</div>`;
        html += `<div>Cargo: ${building.cargo.amount}/${building.cargo.capacity} (${building.cargo.type})</div>`;
        html += `<div style="color:#888;">Linked: ${linked ? `${industryLabel(linked.type)} — ${linked.name}` : 'none'}</div>`;
      } else if (building.type === BuildingType.Airport) {
        const linked = (building as { linkedIndustryId: number | null }).linkedIndustryId != null
          ? state.industries.find((i) => i.id === (building as { linkedIndustryId: number | null }).linkedIndustryId)
          : null;
        html += `<div style="color:#6af;margin-top:4px;font-weight:bold;">✈ Airport #${building.id}</div>`;
        html += `<div>Cargo: ${(building as { cargo: { amount: number; capacity: number; type: string } }).cargo.amount}/${(building as { cargo: { amount: number; capacity: number; type: string } }).cargo.capacity}</div>`;
        html += `<div style="color:#888;">Linked: ${linked ? `${industryLabel(linked.type)} — ${linked.name}` : 'none'}</div>`;
        html += `<div style="color:#7ae;font-size:11px;">✈ Planes fly directly — no roads needed</div>`;
      } else if (building.type === BuildingType.Seaport) {
        const linked = (building as { linkedIndustryId: number | null }).linkedIndustryId != null
          ? state.industries.find((i) => i.id === (building as { linkedIndustryId: number | null }).linkedIndustryId)
          : null;
        html += `<div style="color:#4de;margin-top:4px;font-weight:bold;">⚓ Seaport #${building.id}</div>`;
        html += `<div>Cargo: ${(building as { cargo: { amount: number; capacity: number; type: string } }).cargo.amount}/${(building as { cargo: { amount: number; capacity: number; type: string } }).cargo.capacity}</div>`;
        html += `<div style="color:#888;">Linked: ${linked ? `${industryLabel(linked.type)} — ${linked.name}` : 'none'}</div>`;
        html += `<div style="color:#4de;font-size:11px;">⛵ Ships carry 80 units via water tiles</div>`;
      } else {
        html += `<div style="color:#da3;margin-top:4px;font-weight:bold;">🏗️ Depot #${building.id}</div>`;
        const here = state.vehicles.filter(
          (v) => Math.floor(v.position.x) === building.position.x && Math.floor(v.position.y) === building.position.y
        ).length;
        html += `<div style="color:#aaa;font-size:11px;">Vehicles parked: ${here}</div>`;
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
      const vIcon  = isLoco ? '🚂' : isPlane ? '✈' : isShip ? '⛵' : '🚛';
      const vLabel = isLoco ? 'Loco' : isPlane ? 'Plane' : isShip ? 'Ship' : 'Truck';
      html += `<div style="color:#fd0;margin-top:4px;">${vIcon} ${vLabel} #${v.id}</div>`;
      html += `<div style="color:#aaa;">State: ${v.state}</div>`;
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
        html += `<div style="color:#666;font-size:10px;">No route assigned</div>`;
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
      ind.locked = false;
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
      small:  '64×64 · $150k start',
      normal: '96×96 · $200k start',
      large:  '128×128 · $280k start',
      huge:   '160×160 · $380k start',
    };
    this.panelEl.innerHTML = `
      <div style="color:#fff;font-size:15px;font-weight:bold;margin-bottom:10px;">🗺️ New Game</div>
      <label style="color:#aaa;font-size:11px;">Seed (leave blank for random)</label><br>
      <input id="ng-seed" type="number" placeholder="random" style="
        width:100%;padding:5px;margin:4px 0 10px 0;box-sizing:border-box;
        font-family:monospace;font-size:12px;background:#1a1a1a;color:#fff;
        border:1px solid #555;border-radius:3px;
      "><br>
      <label style="color:#aaa;font-size:11px;">Map Size</label>
      <div id="ng-sizes" style="display:flex;flex-direction:column;gap:4px;margin:6px 0 12px 0;">
        ${(['small','normal','large','huge'] as MapSize[]).map((sz) => `
          <button data-size="${sz}" style="
            padding:6px 8px;font-family:monospace;font-size:11px;text-align:left;
            border-radius:3px;cursor:pointer;border:1px solid #555;
            background:${sz === 'normal' ? '#003366' : '#1a1a1a'};
            color:${sz === 'normal' ? '#8cf' : '#aaa'};
          ">${sz.charAt(0).toUpperCase()+sz.slice(1)} — ${sizeInfo[sz]}</button>
        `).join('')}
      </div>
      <button id="ng-start" style="
        width:100%;padding:10px;font-family:monospace;font-size:13px;font-weight:bold;
        cursor:pointer;background:#003300;color:#4f4;border:1px solid #3a3;border-radius:4px;margin-bottom:6px;
      ">▶ Start New Game</button>
      <button id="ng-cancel" style="
        width:100%;padding:6px;font-family:monospace;font-size:11px;
        cursor:pointer;background:#1a1a1a;color:#777;border:1px solid #333;border-radius:4px;
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
        ? `Seed ${meta.seed} · ${(meta.mapSize ?? 'normal')} · $${meta.money.toLocaleString()} · tick ${meta.tick}<br><span style="color:#555;font-size:10px;">${new Date(meta.savedAt).toLocaleString()}</span>`
        : `<span style="color:#555;">Empty slot</span>`;
      return `
        <div style="padding:8px;background:#1a1a1a;border:1px solid #333;border-radius:4px;margin-bottom:6px;">
          <div style="color:#fc0;font-size:12px;margin-bottom:4px;">Slot ${slot + 1}</div>
          <div style="color:#aaa;font-size:11px;line-height:1.5;">${info}</div>
          <div style="display:flex;gap:4px;margin-top:6px;">
            <button data-save="${slot}" style="flex:1;padding:4px;font-size:11px;font-family:monospace;cursor:pointer;background:#003300;color:#4f4;border:1px solid #3a3;border-radius:3px;">💾 Save</button>
            ${meta ? `<button data-load="${slot}" style="flex:1;padding:4px;font-size:11px;font-family:monospace;cursor:pointer;background:#002244;color:#8cf;border:1px solid #36a;border-radius:3px;">📂 Load</button>` : ''}
            ${meta ? `<button data-del="${slot}"  style="flex:1;padding:4px;font-size:11px;font-family:monospace;cursor:pointer;background:#220000;color:#f66;border:1px solid #633;border-radius:3px;">🗑 Del</button>` : ''}
          </div>
        </div>`;
    }).join('');

    this.panelEl.innerHTML = `
      <div style="color:#fff;font-size:15px;font-weight:bold;margin-bottom:10px;">💾 Save / Load</div>
      ${slotHtml}
      <button id="save-close" style="width:100%;padding:5px;font-size:11px;font-family:monospace;cursor:pointer;background:#1a1a1a;color:#777;border:1px solid #333;border-radius:3px;">Close</button>
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

  // ─── Help / Tutorial panel ─────────────────────────────────────────────────
  private renderHelpPanel(): void {
    this.panelEl.innerHTML = `
      <div style="color:#fff;font-size:15px;font-weight:bold;margin-bottom:8px;">❓ How to Play</div>
      <div style="color:#ccc;font-size:11px;line-height:1.75;">

        <b style="color:#fc0;">🛤️ 1. Build Roads</b><br>
        Select the Road tool (key 2) and drag-draw roads across the map. Roads cost $250 per tile.
        Roads must connect your stations.<br><br>

        <b style="color:#fc0;">🏪 2. Place Stations</b><br>
        Place stations (key 3) next to industries. Stations auto-link to the nearest industry within 3 tiles and store its cargo.<br><br>

        <b style="color:#fc0;">🏗️ 3. Build a Depot</b><br>
        Place a depot (key 4) somewhere on a road. Depots let you buy and manage vehicles.<br><br>

        <b style="color:#fc0;">🚛 4. Buy a Truck</b><br>
        Click a depot or use the "Manage Depot" button. Buy a Truck ($15k), then assign a route — pick a pickup station and a delivery station. The truck will run the route automatically.<br><br>

        <b style="color:#fc0;">💰 5. Earn Money &amp; Research</b><br>
        Each delivery earns cash. Open the Tech panel (T) to unlock upgrades: faster trucks, larger stations, rail, and more.<br><br>

        <b style="color:#fc0;">🚂 6. Build Rail (Advanced)</b><br>
        Unlock the <em>Railway</em> tech (Tier 3) to lay rail tiles (key 6, $600/tile) and buy powerful Locomotives ($50k, 60 capacity). Rail lets you build fast cross-map routes.<br><br>

        <b style="color:#aaa;">⌨️ Shortcuts</b><br>
        1–6 = tools &nbsp;|&nbsp; T = tech &nbsp;|&nbsp; O = goals<br>
        S = save &nbsp;|&nbsp; N = new game &nbsp;|&nbsp; ? = this panel<br>
        Space = pause &nbsp;|&nbsp; Esc = close panel<br>
        Shift+drag = pan &nbsp;|&nbsp; Scroll = zoom
      </div>
      <button id="help-close" style="width:100%;margin-top:10px;padding:5px;font-size:11px;font-family:monospace;cursor:pointer;background:#1a1a1a;color:#777;border:1px solid #333;border-radius:3px;">Close</button>
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
