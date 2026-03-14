import type { DevLogCategory, GameState, UIState } from './core/types.ts';
import { SimSpeed, ToolType } from './core/types.ts';
import { createInitialGameState } from './core/GameState.ts';
import type { NewGameOptions } from './core/GameState.ts';
import { simulationTick, getTickDuration } from './core/GameLoop.ts';
import { Renderer } from './render/Renderer.ts';
import { Camera } from './render/Camera.ts';
import { InputHandler } from './input/InputHandler.ts';
import { createUIState } from './input/Tools.ts';
import { executeToolAction } from './input/ToolActions.ts';
import { UIManager } from './ui/UIManager.ts';
import { unlockTech } from './core/TechTree.ts';
import { TechId } from './core/types.ts';
import { TILE_SIZE } from './constants.ts';
import { migrateLegacySave } from './core/Save.ts';

const CAMERA_KEY_PAN_SPEED = TILE_SIZE * 12;

export class Game {
  state: GameState;
  uiState: UIState;
  camera: Camera;
  renderer: Renderer;
  inputHandler: InputHandler;
  uiManager: UIManager;

  private canvas: HTMLCanvasElement;
  private lastTime = 0;
  private accumulator = 0;
  private pressedKeys = new Set<string>();
  private devMode = false;

  constructor(canvas: HTMLCanvasElement, uiContainer: HTMLElement, devMode = false, preloadedState?: GameState) {
    this.canvas = canvas;
    this.devMode = devMode;
    migrateLegacySave();
    this.state = preloadedState ?? createInitialGameState({ devMode });
    this.uiState = createUIState();

    this.camera = new Camera(canvas.width, canvas.height, 0, 0);
    // Center camera on first active city instead of raw map centre
    this.centerOnFirstCity();

    this.renderer = new Renderer(canvas);

    this.inputHandler = new InputHandler(canvas, this.camera, this.uiState);
    this.inputHandler.setClickHandler((tx, ty) => {
      executeToolAction(this.state, this.uiState, tx, ty);
    });

    this.uiManager = new UIManager(uiContainer, (speed: SimSpeed) => {
      this.state.time.speed = speed;
    }, devMode);

    this.uiManager.setToolChangeHandler((tool: ToolType) => {
      this.uiState.activeTool = tool;
    });

    this.uiManager.setNewGameHandler((opts: NewGameOptions) => {
      this.state = createInitialGameState({ ...opts, devMode });
      this.accumulator = 0;
      const devConfig = this.uiState.devTools.config;
      this.uiState = createUIState();
      this.uiState.devTools.config = devConfig;
      this.inputHandler.setUIState(this.uiState);
      this.centerOnFirstCity();
      this.addDevLog('system', `Started new ${opts.mapSize ?? 'normal'} game on seed ${this.state.seed}`);
    });

    this.uiManager.setLoadSaveHandler((loaded: GameState) => {
      this.state = loaded;
      this.accumulator = 0;
      const devConfig = this.uiState.devTools.config;
      this.uiState = createUIState();
      this.uiState.devTools.config = devConfig;
      this.inputHandler.setUIState(this.uiState);
      this.centerOnFirstCity();
      this.addDevLog('system', `Loaded save for seed ${loaded.seed}`);
    });

    this.uiManager.setUnlockTechHandler((id: string) => {
      const success = unlockTech(this.state, id as TechId);
      if (success) {
        const node = this.state.tech.find((t) => t.id === id);
        if (node) {
          this.addToast(`🔬 Unlocked: ${node.name}`);
          this.addDevLog('tech', `Unlocked ${node.name}`);
        }
      }
    });

    this.uiManager.setDevCommandHandler((command) => {
      switch (command) {
        case 'step_1':
          this.runSimSteps(1);
          break;
        case 'step_10':
          this.runSimSteps(10);
          break;
        case 'toggle_pause':
          this.state.time.speed = this.state.time.speed === SimSpeed.Paused ? SimSpeed.Normal : SimSpeed.Paused;
          this.addDevLog('system', `Simulation ${this.state.time.speed === SimSpeed.Paused ? 'paused' : 'resumed'}`);
          break;
        case 'clear_logs':
          this.uiState.devTools.logs = [];
          break;
        case 'grant_cash':
          this.state.economy.money += 50_000;
          this.addDevLog('economy', 'Granted $50,000 test cash');
          break;
        case 'unlock_all':
          for (const tech of this.state.tech) tech.unlocked = true;
          this.addDevLog('tech', 'Unlocked all technologies for testing');
          break;
      }
    });

    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
    if (devMode) this.addDevLog('system', `Dev mode active on seed ${this.state.seed}`);
  }

  private _preSpeedBeforePause: SimSpeed | null = null;

  private handleResize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.camera.resize(this.canvas.width, this.canvas.height);
  }

  start(): void {
    this.lastTime = performance.now();

    // Space bar toggles pause
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !(e.target as HTMLElement)?.matches?.('input,textarea,button')) {
        e.preventDefault();
        if (this.state.time.speed === SimSpeed.Paused) {
          this.state.time.speed = this._preSpeedBeforePause ?? SimSpeed.Normal;
          this._preSpeedBeforePause = null;
        } else {
          this._preSpeedBeforePause = this.state.time.speed;
          this.state.time.speed = SimSpeed.Paused;
        }
      }
      // Home key recenters camera on first active city
      if (e.code === 'Home' && !(e.target as HTMLElement)?.matches?.('input,textarea,button')) {
        e.preventDefault();
        this.centerOnFirstCity();
      }
      if (!(e.target as HTMLElement)?.matches?.('input,textarea,button')) {
        if (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD') {
          e.preventDefault();
          this.pressedKeys.add(e.code);
        }
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD') {
        this.pressedKeys.delete(e.code);
      }
    });

    requestAnimationFrame((t) => this.frame(t));
  }

  private frame(now: number): void {
    // Always schedule next frame first — a crash below must not freeze the loop
    requestAnimationFrame((t) => this.frame(t));

    try {
      const dt = now - this.lastTime;
      this.lastTime = now;
      this.updateKeyboardCamera(dt);

      // Fixed-timestep simulation
      const tickDuration = getTickDuration(this.state.time.speed);
      if (tickDuration > 0) {
        this.accumulator += dt;
        if (this.accumulator > tickDuration * 5) {
          this.accumulator = tickDuration * 5;
        }
        while (this.accumulator >= tickDuration) {
          this.runSimulationStep();
          this.accumulator -= tickDuration;
        }
      }

      // Tick down toasts
      this.uiState.toasts = this.uiState.toasts
        .map((t) => ({ ...t, ttl: t.ttl - (now - this.lastTime || 16) }))
        .filter((t) => t.ttl > 0);

      // Render
      this.renderer.draw(this.state, this.uiState, this.camera);
      this.uiManager.update(this.state, this.uiState, this.camera);
    } catch (err) {
      console.error('[Game] frame error:', err);
    }
  }

  private addToast(msg: string): void {
    const id = Date.now() + Math.random();
    this.uiState.toasts.push({ id, msg, ttl: 4000 });
    // Keep max 4 toasts
    if (this.uiState.toasts.length > 4) this.uiState.toasts.shift();
  }

  private runSimSteps(count: number): void {
    for (let i = 0; i < count; i += 1) this.runSimulationStep();
  }

  private runSimulationStep(): void {
    const tickBefore = this.state.time.tick;
    const moneyBefore = this.state.economy.money;
    const deliveriesBefore = this.state.economy.deliveriesCompleted;
    const completed = simulationTick(this.state);

    for (const id of completed) {
      if (id.startsWith('__maintenance:')) {
        const bill = parseInt(id.slice(14), 10);
        this.addToast(`🔧 Maintenance: -$${bill.toLocaleString()}`);
        this.addDevLog('economy', `Maintenance paid -$${bill.toLocaleString()}`, tickBefore);
        continue;
      }
      const obj = this.state.objectives.find((o) => o.id === id);
      if (obj) {
        this.addToast(`🎯 Objective completed: ${obj.title} (+$${obj.reward.toLocaleString()})`);
        this.addDevLog('objective', `Completed "${obj.title}" (+$${obj.reward.toLocaleString()})`, tickBefore);
      }
    }

    this.captureDevTickLogs(tickBefore, moneyBefore, deliveriesBefore);
  }

  private captureDevTickLogs(tick: number, moneyBefore: number, deliveriesBefore: number): void {
    if (!this.devMode) return;
    const config = this.uiState.devTools.config;
    if (config.captureTicks) {
      this.addDevLog(
        'tick',
        `Tick ${tick} | $${this.state.economy.money.toLocaleString()} | deliveries ${this.state.economy.deliveriesCompleted} | routes ${this.state.routes.length} | vehicles ${this.state.vehicles.length}`,
        tick,
      );
    }
    if (config.captureEconomy) {
      const tickTxns = this.state.economy.transactions.filter((txn) => txn.tick === tick);
      for (const txn of tickTxns) {
        this.addDevLog('economy', `${txn.label}: ${txn.delta >= 0 ? '+' : ''}$${txn.delta.toLocaleString()}`, tick);
      }
      if (tickTxns.length === 0 && this.state.economy.money !== moneyBefore) {
        const delta = this.state.economy.money - moneyBefore;
        this.addDevLog('economy', `Cash changed ${delta >= 0 ? '+' : ''}$${delta.toLocaleString()}`, tick);
      }
    }
    if (config.captureObjectives && this.state.economy.deliveriesCompleted !== deliveriesBefore) {
      this.addDevLog('objective', `Deliveries advanced to ${this.state.economy.deliveriesCompleted}`, tick);
    }
    if (config.captureVehicles && tick % Math.max(1, config.vehicleInterval) === 0) {
      for (const vehicle of this.state.vehicles) {
        this.addDevLog(
          'vehicle',
          `Vehicle #${vehicle.id} ${vehicle.model} ${vehicle.state} cargo:${vehicle.cargo ?? 'none'}(${vehicle.cargoAmount}) route:${vehicle.routeId ?? 'none'}`,
          tick,
        );
      }
    }
  }

  private addDevLog(category: DevLogCategory, message: string, tick = this.state.time.tick): void {
    if (!this.devMode) return;
    const logs = this.uiState.devTools.logs;
    logs.push({ id: Date.now() + Math.random(), tick, category, message });
    const maxEntries = Math.max(100, this.uiState.devTools.config.maxEntries);
    while (logs.length > maxEntries) logs.shift();
  }

  private updateKeyboardCamera(dt: number): void {
    if (this.pressedKeys.size === 0) return;
    const move = (CAMERA_KEY_PAN_SPEED * dt) / 1000;
    if (this.pressedKeys.has('KeyW')) this.camera.pan(0, move);
    if (this.pressedKeys.has('KeyS')) this.camera.pan(0, -move);
    if (this.pressedKeys.has('KeyA')) this.camera.pan(move, 0);
    if (this.pressedKeys.has('KeyD')) this.camera.pan(-move, 0);
  }

  /** Center camera on the first active city (cityId 0). Falls back to map center. */
  private centerOnFirstCity(): void {
    const city0 = this.state.industries.filter((i) => i.cityId === 0);
    if (city0.length > 0) {
      let sx = 0, sy = 0;
      for (const ind of city0) { sx += ind.position.x; sy += ind.position.y; }
      this.camera.x = (sx / city0.length + 1) * TILE_SIZE;
      this.camera.y = (sy / city0.length + 1) * TILE_SIZE;
    } else {
      this.camera.x = (this.state.map.width  * TILE_SIZE) / 2;
      this.camera.y = (this.state.map.height * TILE_SIZE) / 2;
    }
    this.camera.zoom = 1.5;
  }
}
